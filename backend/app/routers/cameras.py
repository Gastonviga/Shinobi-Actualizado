"""
TitanNVR - Cameras Router
"""
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session_maker
from app.models.camera import Camera
from app.schemas.camera import CameraCreate, CameraUpdate, CameraResponse
from app.services.stream_manager import stream_manager
from app.services.config_generator import sync_frigate_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cameras", tags=["Cameras"])


# ============================================================
# Background Task: Sync Frigate Config
# ============================================================

async def sync_all_to_frigate():
    """Background task to sync all cameras to Frigate config"""
    try:
        async with async_session_maker() as session:
            result = await session.execute(select(Camera))
            cameras = result.scalars().all()
            
            # Convert to dicts for config generator
            camera_dicts = [
                {
                    "name": c.name,
                    "is_active": c.is_active,
                    "main_stream_url": c.main_stream_url,
                    "sub_stream_url": c.sub_stream_url,
                }
                for c in cameras
            ]
            
            result = await sync_frigate_config(camera_dicts, restart=True)
            logger.info(f"Frigate config synced: {result}")
    except Exception as e:
        logger.error(f"Failed to sync Frigate config: {e}")


@router.get("/", response_model=List[CameraResponse])
async def get_cameras(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Get all cameras."""
    result = await db.execute(
        select(Camera).offset(skip).limit(limit)
    )
    cameras = result.scalars().all()
    return cameras


@router.get("/{camera_id}", response_model=CameraResponse)
async def get_camera(camera_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific camera by ID."""
    result = await db.execute(
        select(Camera).where(Camera.id == camera_id)
    )
    camera = result.scalar_one_or_none()
    
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera with id {camera_id} not found"
        )
    return camera


@router.post("/", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
async def create_camera(
    camera_data: CameraCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new camera.
    
    1. Saves camera data to database
    2. Registers streams in Go2RTC for immediate availability
    3. Syncs Frigate configuration in background
    """
    # Save to database
    camera = Camera(**camera_data.model_dump())
    db.add(camera)
    await db.flush()
    await db.refresh(camera)
    
    # Sync with Go2RTC
    try:
        result = await stream_manager.register_stream(
            name=camera.name,
            main_stream_url=camera.main_stream_url,
            sub_stream_url=camera.sub_stream_url
        )
        logger.info(f"Camera '{camera.name}' registered in Go2RTC: {result}")
    except Exception as e:
        # Log error but don't fail the request - camera is saved
        logger.error(f"Failed to register camera '{camera.name}' in Go2RTC: {e}")
    
    # Sync Frigate config in background
    background_tasks.add_task(sync_all_to_frigate)
    
    return camera


@router.patch("/{camera_id}", response_model=CameraResponse)
async def update_camera(
    camera_id: int,
    camera_data: CameraUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Update a camera.
    
    Re-syncs with Go2RTC if stream URLs or name change.
    """
    result = await db.execute(
        select(Camera).where(Camera.id == camera_id)
    )
    camera = result.scalar_one_or_none()
    
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera with id {camera_id} not found"
        )
    
    # Check if we need to re-sync with Go2RTC
    update_data = camera_data.model_dump(exclude_unset=True)
    needs_resync = any(
        field in update_data 
        for field in ['name', 'main_stream_url', 'sub_stream_url']
    )
    old_name = camera.name
    
    # Apply updates
    for field, value in update_data.items():
        setattr(camera, field, value)
    
    await db.flush()
    await db.refresh(camera)
    
    # Re-sync with Go2RTC if needed
    if needs_resync:
        try:
            # Remove old streams if name changed
            if 'name' in update_data and old_name != camera.name:
                await stream_manager.unregister_stream(old_name)
            
            # Register with new config
            result = await stream_manager.register_stream(
                name=camera.name,
                main_stream_url=camera.main_stream_url,
                sub_stream_url=camera.sub_stream_url
            )
            logger.info(f"Camera '{camera.name}' re-synced in Go2RTC: {result}")
        except Exception as e:
            logger.error(f"Failed to re-sync camera '{camera.name}' in Go2RTC: {e}")
    
    return camera


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_camera(
    camera_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a camera.
    
    Also removes streams from Go2RTC and updates Frigate config.
    """
    result = await db.execute(
        select(Camera).where(Camera.id == camera_id)
    )
    camera = result.scalar_one_or_none()
    
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera with id {camera_id} not found"
        )
    
    camera_name = camera.name
    
    # Delete from database
    await db.delete(camera)
    
    # Remove from Go2RTC
    try:
        result = await stream_manager.unregister_stream(camera_name)
        logger.info(f"Camera '{camera_name}' removed from Go2RTC: {result}")
    except Exception as e:
        logger.error(f"Failed to remove camera '{camera_name}' from Go2RTC: {e}")
    
    # Sync Frigate config in background
    background_tasks.add_task(sync_all_to_frigate)
    
    return None


# ============================================================
# Stream URL Endpoints
# ============================================================

@router.get("/{camera_id}/streams")
async def get_camera_streams(camera_id: int, db: AsyncSession = Depends(get_db)):
    """
    Get streaming URLs for a camera.
    
    Returns URLs for WebRTC, MSE, HLS and MJPEG streams.
    """
    result = await db.execute(
        select(Camera).where(Camera.id == camera_id)
    )
    camera = result.scalar_one_or_none()
    
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera with id {camera_id} not found"
        )
    
    return {
        "camera_id": camera.id,
        "camera_name": camera.name,
        "streams": stream_manager.get_stream_urls(camera.name)
    }


@router.get("/{camera_id}/status")
async def get_camera_status(camera_id: int, db: AsyncSession = Depends(get_db)):
    """
    Check the real-time connection status of a camera.
    
    Returns:
        - online: Stream is accessible
        - offline: Stream is not responding
        - unknown: Could not determine status
    """
    result = await db.execute(
        select(Camera).where(Camera.id == camera_id)
    )
    camera = result.scalar_one_or_none()
    
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera with id {camera_id} not found"
        )
    
    # Check stream status via Go2RTC
    status_result = await stream_manager.check_stream_status(camera.name)
    
    return {
        "camera_id": camera.id,
        "camera_name": camera.name,
        "connection_status": status_result["status"],
        "is_active": camera.is_active,
        "details": status_result.get("details")
    }


@router.get("/status/all")
async def get_all_cameras_status(db: AsyncSession = Depends(get_db)):
    """
    Check the real-time connection status of all cameras.
    
    Useful for dashboard to show live connection states.
    """
    result = await db.execute(select(Camera))
    cameras = result.scalars().all()
    
    statuses = []
    for camera in cameras:
        status_result = await stream_manager.check_stream_status(camera.name)
        statuses.append({
            "camera_id": camera.id,
            "camera_name": camera.name,
            "connection_status": status_result["status"],
            "is_active": camera.is_active
        })
    
    return {"cameras": statuses}
