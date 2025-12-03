"""
TitanNVR - Cameras Router
Enterprise v2.0 with advanced recording configuration
"""
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session_maker
from app.models.camera import Camera, RecordingMode
from app.schemas.camera import (
    CameraCreate, CameraUpdate, CameraResponse, RECORDING_MODES_INFO,
    CameraBulkCreate, CameraBulkResponse, CameraBulkDelete, CameraBulkDeleteResponse
)
from app.services.stream_manager import stream_manager
from app.services.config_generator import sync_frigate_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cameras", tags=["Cameras"])


# ============================================================
# Background Task: Sync Frigate Config
# ============================================================

async def sync_all_to_frigate():
    """Background task to sync all cameras to Frigate config with enterprise settings"""
    try:
        async with async_session_maker() as session:
            result = await session.execute(select(Camera))
            cameras = result.scalars().all()
            
            # Convert to dicts for config generator including enterprise settings
            camera_dicts = [
                {
                    "name": c.name,
                    "is_active": c.is_active,
                    "main_stream_url": c.main_stream_url,
                    "sub_stream_url": c.sub_stream_url,
                    # Enterprise settings
                    "retention_days": c.retention_days,
                    "recording_mode": c.recording_mode,
                    "event_retention_days": c.event_retention_days,
                    "zones_config": c.zones_config,
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


@router.get("/recording-modes/info")
async def get_recording_modes_info():
    """
    Get information about available recording modes.
    
    Useful for frontend to display descriptions and storage impact.
    """
    return {
        "modes": [mode.dict() for mode in RECORDING_MODES_INFO],
        "default": "motion"
    }


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


@router.post("/bulk", response_model=CameraBulkResponse)
async def create_cameras_bulk(
    bulk_data: CameraBulkCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Bulk create multiple cameras in a single transaction.
    
    - Validates for duplicate names
    - Registers all streams in Go2RTC
    - Syncs Frigate config once at the end
    """
    created_cameras = []
    errors = []
    
    # Get existing camera names for duplicate check
    result = await db.execute(select(Camera.name))
    existing_names = {row[0].lower() for row in result.fetchall()}
    
    # Process each camera
    for i, camera_data in enumerate(bulk_data.cameras):
        # Check for duplicates
        if camera_data.name.lower() in existing_names:
            errors.append(f"Camera '{camera_data.name}' already exists")
            continue
        
        # Check for duplicates within the batch
        if camera_data.name.lower() in {c.name.lower() for c in created_cameras}:
            errors.append(f"Duplicate name in batch: '{camera_data.name}'")
            continue
        
        try:
            camera = Camera(**camera_data.model_dump())
            db.add(camera)
            await db.flush()
            await db.refresh(camera)
            created_cameras.append(camera)
            existing_names.add(camera_data.name.lower())
        except Exception as e:
            errors.append(f"Failed to create '{camera_data.name}': {str(e)}")
    
    # Commit all changes
    await db.commit()
    
    # Register all streams in Go2RTC (don't restart after each one)
    for camera in created_cameras:
        try:
            await stream_manager.register_stream(
                name=camera.name,
                main_stream_url=camera.main_stream_url,
                sub_stream_url=camera.sub_stream_url,
                restart_after=False  # Don't restart for each camera
            )
        except Exception as e:
            logger.error(f"Failed to register '{camera.name}' in Go2RTC: {e}")
    
    # Restart Go2RTC once at the end if any cameras were created
    if created_cameras:
        await stream_manager.restart_go2rtc()
    
    # Sync Frigate config once at the end
    if created_cameras:
        background_tasks.add_task(sync_all_to_frigate)
    
    logger.info(f"Bulk import: {len(created_cameras)} created, {len(errors)} failed")
    
    return CameraBulkResponse(
        created=len(created_cameras),
        failed=len(errors),
        errors=errors,
        cameras=created_cameras
    )


@router.get("/groups/list")
async def get_camera_groups(db: AsyncSession = Depends(get_db)):
    """
    Get list of unique camera groups.
    """
    result = await db.execute(
        select(Camera.group).where(Camera.group.isnot(None)).distinct()
    )
    groups = [row[0] for row in result.fetchall() if row[0]]
    return {"groups": sorted(groups)}


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


@router.post("/bulk-delete", response_model=CameraBulkDeleteResponse)
async def bulk_delete_cameras(
    request: CameraBulkDelete,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete multiple cameras in a single operation.
    
    Removes cameras from database, unregisters streams from Go2RTC,
    and regenerates Frigate config once at the end.
    """
    deleted = 0
    failed = 0
    errors = []
    
    for camera_id in request.camera_ids:
        try:
            # Get camera
            result = await db.execute(
                select(Camera).where(Camera.id == camera_id)
            )
            camera = result.scalar_one_or_none()
            
            if not camera:
                failed += 1
                errors.append(f"Camera ID {camera_id} not found")
                continue
            
            camera_name = camera.name
            
            # Delete from database
            await db.delete(camera)
            
            # Remove from Go2RTC
            try:
                await stream_manager.unregister_stream(camera_name)
                logger.info(f"Bulk delete: removed '{camera_name}' from Go2RTC")
            except Exception as e:
                logger.error(f"Bulk delete: failed to remove '{camera_name}' from Go2RTC: {e}")
            
            deleted += 1
            logger.info(f"Bulk delete: camera '{camera_name}' (ID: {camera_id}) deleted")
            
        except Exception as e:
            failed += 1
            errors.append(f"Error deleting camera {camera_id}: {str(e)}")
            logger.error(f"Bulk delete error for camera {camera_id}: {e}")
    
    # Commit all deletions
    await db.commit()
    
    # Sync Frigate config ONCE at the end (not per camera)
    if deleted > 0:
        background_tasks.add_task(sync_all_to_frigate)
    
    logger.info(f"Bulk delete completed: {deleted} deleted, {failed} failed")
    return CameraBulkDeleteResponse(deleted=deleted, failed=failed, errors=errors)


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


# ============================================================
# Stream Connection Test (QA Feature)
# ============================================================

from pydantic import BaseModel

class StreamTestRequest(BaseModel):
    """Request body for stream connection test"""
    stream_url: str

class StreamTestResponse(BaseModel):
    """Response for stream connection test"""
    success: bool
    details: str | None = None
    error: str | None = None


@router.post("/test", response_model=StreamTestResponse)
async def test_camera_connection(request: StreamTestRequest):
    """
    Test if a stream URL is accessible before saving a camera.
    
    This QA endpoint temporarily registers the stream in Go2RTC,
    waits for connection, checks if data is being received,
    and then cleans up the temporary stream.
    
    **Use cases:**
    - Validate RTSP URLs before creating cameras
    - Check if credentials are correct
    - Verify network connectivity to camera
    
    **Request Body:**
    ```json
    {
        "stream_url": "rtsp://user:pass@192.168.1.100:554/stream1"
    }
    ```
    
    **Response:**
    - Success: `{"success": true, "details": "Conexión exitosa - Recibiendo datos"}`
    - Failure: `{"success": false, "error": "No se pudo conectar", "details": "..."}`
    
    **Note:** This endpoint may take 3-5 seconds to respond while testing connection.
    """
    logger.info(f"Testing stream connection: {request.stream_url[:50]}...")
    
    # Validate URL format
    if not request.stream_url:
        return StreamTestResponse(
            success=False,
            error="URL vacía",
            details="Debe proporcionar una URL de stream"
        )
    
    # Basic URL validation
    valid_schemes = ['rtsp://', 'rtsps://', 'http://', 'https://']
    if not any(request.stream_url.lower().startswith(scheme) for scheme in valid_schemes):
        return StreamTestResponse(
            success=False,
            error="Protocolo no soportado",
            details=f"Use: {', '.join(valid_schemes)}"
        )
    
    # Test the stream
    result = await stream_manager.test_stream_connection(request.stream_url)
    
    return StreamTestResponse(
        success=result.get("success", False),
        details=result.get("details"),
        error=result.get("error")
    )
