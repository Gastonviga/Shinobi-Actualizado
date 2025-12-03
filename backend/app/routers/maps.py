"""
TitanNVR - Maps Router
Enterprise v2.0 - Interactive E-Maps for camera positioning
"""
import os
import uuid
import logging
import aiofiles
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import datetime, timedelta

from app.database import get_db
from app.models.map import Map
from app.models.camera import Camera
from app.schemas.map import (
    MapCreate, 
    MapUpdate, 
    MapResponse, 
    MapWithCameras, 
    MapCameraInfo
)
from app.schemas.camera import CameraPositionUpdate, CameraResponse
from app.config import get_settings
from app.services.auth import get_current_user_required, require_admin, require_operator_or_admin
from app.models.user import User

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/maps", tags=["maps"])

# Alert threshold - cameras with events in last N seconds show alert
ALERT_THRESHOLD_SECONDS = 30

# Storage path for map images
MAPS_STORAGE_PATH = os.path.join(settings.storage_path, "maps")
os.makedirs(MAPS_STORAGE_PATH, exist_ok=True)

# Allowed image extensions
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def get_image_url(image_path: str) -> str:
    """Convert storage path to accessible URL."""
    return f"/api/maps/images/{os.path.basename(image_path)}"


@router.get("/", response_model=List[MapResponse])
async def list_maps(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """List all maps."""
    result = await db.execute(select(Map).order_by(Map.name))
    maps = result.scalars().all()
    
    # Add image_url to each map
    response = []
    for m in maps:
        map_dict = {
            "id": m.id,
            "name": m.name,
            "description": m.description,
            "image_path": m.image_path,
            "image_url": get_image_url(m.image_path),
            "created_at": m.created_at,
            "updated_at": m.updated_at
        }
        response.append(MapResponse(**map_dict))
    
    return response


@router.get("/{map_id}", response_model=MapWithCameras)
async def get_map(
    map_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Get a map with its positioned cameras."""
    result = await db.execute(select(Map).where(Map.id == map_id))
    map_obj = result.scalar_one_or_none()
    
    if not map_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Map with id {map_id} not found"
        )
    
    # Get cameras positioned on this map
    cameras_result = await db.execute(
        select(Camera).where(
            Camera.map_id == map_id,
            Camera.map_x.isnot(None),
            Camera.map_y.isnot(None)
        )
    )
    cameras = cameras_result.scalars().all()
    
    # Import recent_events here to check for active alerts
    from app.routers.events import recent_events
    
    # Check which cameras have recent alerts (within threshold)
    now = datetime.utcnow()
    alert_threshold = now - timedelta(seconds=ALERT_THRESHOLD_SECONDS)
    
    # Build set of cameras with recent alerts
    cameras_with_alerts = set()
    for event in recent_events:
        try:
            event_time = datetime.fromisoformat(event.get("timestamp", "").replace("Z", ""))
            if event_time >= alert_threshold:
                cameras_with_alerts.add(event.get("camera", "").lower())
        except (ValueError, AttributeError):
            continue
    
    cameras_info = [
        MapCameraInfo(
            id=c.id,
            name=c.name,
            map_x=c.map_x,
            map_y=c.map_y,
            is_recording=c.is_recording,
            is_active=c.is_active,
            features_ptz=c.features_ptz,
            has_alert=c.name.lower().replace(" ", "_") in cameras_with_alerts or c.name.lower() in cameras_with_alerts
        )
        for c in cameras
    ]
    
    return MapWithCameras(
        id=map_obj.id,
        name=map_obj.name,
        description=map_obj.description,
        image_path=map_obj.image_path,
        image_url=get_image_url(map_obj.image_path),
        created_at=map_obj.created_at,
        updated_at=map_obj.updated_at,
        cameras=cameras_info
    )


@router.post("/", response_model=MapResponse, status_code=status.HTTP_201_CREATED)
async def create_map(
    name: str = Form(...),
    description: str = Form(None),
    image: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Create a new map by uploading a floor plan image.
    
    - **name**: Map name (e.g., "Planta Baja", "Estacionamiento")
    - **description**: Optional description
    - **image**: Floor plan image (JPG, PNG, WebP, SVG)
    """
    # Validate file extension
    file_ext = os.path.splitext(image.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Validate file size
    content = await image.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    # Generate unique filename
    unique_id = uuid.uuid4().hex[:8]
    safe_name = "".join(c if c.isalnum() else "_" for c in name.lower())
    filename = f"{safe_name}_{unique_id}{file_ext}"
    file_path = os.path.join(MAPS_STORAGE_PATH, filename)
    
    # Save file
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)
    
    logger.info(f"Map image saved: {file_path}")
    
    # Create database record
    map_obj = Map(
        name=name,
        description=description,
        image_path=file_path
    )
    db.add(map_obj)
    await db.flush()
    await db.refresh(map_obj)
    
    return MapResponse(
        id=map_obj.id,
        name=map_obj.name,
        description=map_obj.description,
        image_path=map_obj.image_path,
        image_url=get_image_url(map_obj.image_path),
        created_at=map_obj.created_at,
        updated_at=map_obj.updated_at
    )


@router.patch("/{map_id}", response_model=MapResponse)
async def update_map(
    map_id: int,
    data: MapUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Update map metadata (name, description)."""
    result = await db.execute(select(Map).where(Map.id == map_id))
    map_obj = result.scalar_one_or_none()
    
    if not map_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Map with id {map_id} not found"
        )
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(map_obj, field, value)
    
    await db.flush()
    await db.refresh(map_obj)
    
    return MapResponse(
        id=map_obj.id,
        name=map_obj.name,
        description=map_obj.description,
        image_path=map_obj.image_path,
        image_url=get_image_url(map_obj.image_path),
        created_at=map_obj.created_at,
        updated_at=map_obj.updated_at
    )


@router.delete("/{map_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_map(
    map_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Delete a map and its image file."""
    result = await db.execute(select(Map).where(Map.id == map_id))
    map_obj = result.scalar_one_or_none()
    
    if not map_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Map with id {map_id} not found"
        )
    
    # Remove cameras from this map
    cameras_result = await db.execute(
        select(Camera).where(Camera.map_id == map_id)
    )
    cameras = cameras_result.scalars().all()
    for camera in cameras:
        camera.map_id = None
        camera.map_x = None
        camera.map_y = None
    
    # Delete image file
    if os.path.exists(map_obj.image_path):
        os.remove(map_obj.image_path)
        logger.info(f"Deleted map image: {map_obj.image_path}")
    
    # Delete database record
    await db.delete(map_obj)


@router.get("/images/{filename}")
async def get_map_image(filename: str):
    """Serve map image files."""
    file_path = os.path.join(MAPS_STORAGE_PATH, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    return FileResponse(file_path)


# ============================================================
# Camera Position Endpoints
# ============================================================

@router.patch("/cameras/{camera_id}/position", response_model=CameraResponse)
async def update_camera_position(
    camera_id: int,
    position: CameraPositionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin)
):
    """
    Update camera position on a map.
    
    - **map_id**: ID of the map to position the camera on
    - **map_x**: X position as percentage (0-100)
    - **map_y**: Y position as percentage (0-100)
    """
    # Verify camera exists
    camera_result = await db.execute(
        select(Camera).where(Camera.id == camera_id)
    )
    camera = camera_result.scalar_one_or_none()
    
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera with id {camera_id} not found"
        )
    
    # Verify map exists
    map_result = await db.execute(
        select(Map).where(Map.id == position.map_id)
    )
    map_obj = map_result.scalar_one_or_none()
    
    if not map_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Map with id {position.map_id} not found"
        )
    
    # Update camera position
    camera.map_id = position.map_id
    camera.map_x = position.map_x
    camera.map_y = position.map_y
    
    await db.flush()
    await db.refresh(camera)
    
    logger.info(f"Camera '{camera.name}' positioned on map '{map_obj.name}' at ({position.map_x}, {position.map_y})")
    
    return camera


@router.delete("/cameras/{camera_id}/position", status_code=status.HTTP_204_NO_CONTENT)
async def remove_camera_from_map(
    camera_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin)
):
    """Remove a camera from any map (clear position)."""
    result = await db.execute(
        select(Camera).where(Camera.id == camera_id)
    )
    camera = result.scalar_one_or_none()
    
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera with id {camera_id} not found"
        )
    
    camera.map_id = None
    camera.map_x = None
    camera.map_y = None
    
    logger.info(f"Camera '{camera.name}' removed from map")


@router.get("/cameras/unpositioned", response_model=List[CameraResponse])
async def get_unpositioned_cameras(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Get all cameras that are not positioned on any map."""
    result = await db.execute(
        select(Camera).where(
            (Camera.map_id.is_(None)) | 
            (Camera.map_x.is_(None)) | 
            (Camera.map_y.is_(None))
        ).order_by(Camera.name)
    )
    cameras = result.scalars().all()
    return cameras


@router.get("/{map_id}/alerts")
async def get_map_camera_alerts(
    map_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Get lightweight alert status for cameras on a map.
    
    Designed for frequent polling (every 5 seconds) to update
    camera alert indicators in real-time.
    
    Returns a dict mapping camera_id -> has_alert status.
    """
    # Get cameras positioned on this map
    cameras_result = await db.execute(
        select(Camera).where(
            Camera.map_id == map_id,
            Camera.map_x.isnot(None),
            Camera.map_y.isnot(None)
        )
    )
    cameras = cameras_result.scalars().all()
    
    if not cameras:
        return {"alerts": {}, "timestamp": datetime.utcnow().isoformat()}
    
    # Import recent_events to check for active alerts
    from app.routers.events import recent_events
    
    # Check which cameras have recent alerts (within threshold)
    now = datetime.utcnow()
    alert_threshold = now - timedelta(seconds=ALERT_THRESHOLD_SECONDS)
    
    # Build dict of camera alerts with event info
    alerts = {}
    for camera in cameras:
        camera_name_normalized = camera.name.lower().replace(" ", "_")
        has_alert = False
        alert_label = None
        alert_score = None
        
        for event in recent_events:
            try:
                event_time = datetime.fromisoformat(event.get("timestamp", "").replace("Z", ""))
                event_camera = event.get("camera", "").lower()
                
                if event_time >= alert_threshold and (
                    event_camera == camera_name_normalized or 
                    event_camera == camera.name.lower()
                ):
                    has_alert = True
                    alert_label = event.get("label", "motion")
                    alert_score = event.get("score", 0)
                    break
            except (ValueError, AttributeError):
                continue
        
        alerts[camera.id] = {
            "has_alert": has_alert,
            "label": alert_label,
            "score": alert_score
        }
    
    return {
        "alerts": alerts,
        "timestamp": datetime.utcnow().isoformat()
    }
