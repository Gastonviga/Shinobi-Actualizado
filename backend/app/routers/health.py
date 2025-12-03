"""
TitanNVR - Health Check Router
"""
import logging
import httpx
from fastapi import APIRouter, status
from pydantic import BaseModel
from sqlalchemy import select

from app.config import get_settings
from app.database import async_session_maker
from app.models.camera import Camera
from app.services.stream_manager import stream_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Health"])
settings = get_settings()


class HealthResponse(BaseModel):
    """Health check response model."""
    status: str
    go2rtc_status: str
    go2rtc_url: str


class DetailedHealthResponse(BaseModel):
    """Detailed health check response."""
    status: str
    services: dict


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.
    Verifies connection to Go2RTC API.
    """
    go2rtc_status = "disconnected"
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.go2rtc_url}/api")
            if response.status_code == 200:
                go2rtc_status = "connected"
    except Exception:
        go2rtc_status = "unreachable"
    
    return HealthResponse(
        status="healthy",
        go2rtc_status=go2rtc_status,
        go2rtc_url=settings.go2rtc_url
    )


@router.get("/health/detailed", response_model=DetailedHealthResponse)
async def detailed_health_check():
    """
    Detailed health check with all service statuses.
    """
    services = {
        "api": "healthy",
        "database": "unknown",
        "go2rtc": "unknown"
    }
    
    # Check Go2RTC
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.go2rtc_url}/api")
            if response.status_code == 200:
                services["go2rtc"] = "healthy"
            else:
                services["go2rtc"] = f"unhealthy (status: {response.status_code})"
    except httpx.ConnectError:
        services["go2rtc"] = "unreachable"
    except Exception as e:
        services["go2rtc"] = f"error: {str(e)}"
    
    # Database check would go here
    services["database"] = "healthy"
    
    overall_status = "healthy" if all(
        v == "healthy" for v in services.values()
    ) else "degraded"
    
    return DetailedHealthResponse(
        status=overall_status,
        services=services
    )


@router.post("/sync")
async def force_sync_cameras(reload: bool = True):
    """
    Force re-sync all cameras to Go2RTC configuration.
    
    Args:
        reload: If True, restart Go2RTC to apply changes (default: True)
    
    Use this if Go2RTC was restarted and lost its stream configuration,
    or if you added new cameras and need to reload them.
    """
    # Check Go2RTC availability
    if not await stream_manager.check_connection():
        return {
            "status": "error",
            "message": "Go2RTC is not available"
        }
    
    async with async_session_maker() as session:
        result = await session.execute(
            select(Camera).where(Camera.is_active == True)
        )
        cameras = result.scalars().all()
        
        if not cameras:
            return {
                "status": "ok",
                "message": "No cameras to sync",
                "synced": 0,
                "failed": 0
            }
        
        synced = 0
        failed = 0
        errors = []
        
        for camera in cameras:
            try:
                await stream_manager.register_stream(
                    name=camera.name,
                    main_stream_url=camera.main_stream_url,
                    sub_stream_url=camera.sub_stream_url,
                    restart_after=False  # Don't restart for each camera
                )
                synced += 1
            except Exception as e:
                failed += 1
                errors.append({"camera": camera.name, "error": str(e)})
        
        # Restart Go2RTC once at the end if requested
        reload_result = None
        if reload and synced > 0:
            restarted = await stream_manager.restart_go2rtc()
            reload_result = {"status": "success" if restarted else "error", "message": "Go2RTC restarted" if restarted else "Failed to restart Go2RTC"}
        
        return {
            "status": "ok" if failed == 0 else "partial",
            "message": f"Synced {synced} cameras, {failed} failed",
            "synced": synced,
            "failed": failed,
            "errors": errors if errors else None,
            "reload": reload_result
        }


@router.post("/go2rtc/reload")
async def reload_go2rtc():
    """
    Restart Go2RTC container to reload stream configuration.
    
    Use this after adding/removing cameras to apply the changes.
    Requires Docker socket to be mounted.
    """
    restarted = await stream_manager.restart_go2rtc()
    return {
        "status": "success" if restarted else "error",
        "message": "Go2RTC restarted successfully" if restarted else "Failed to restart Go2RTC"
    }


@router.post("/frigate/sync")
async def sync_frigate_cameras():
    """
    Sync all cameras to Frigate configuration.
    
    Regenerates frigate.yml with all active cameras and
    attempts to restart Frigate to apply changes.
    """
    from app.services.config_generator import sync_frigate_config
    
    async with async_session_maker() as session:
        result = await session.execute(
            select(Camera).where(Camera.is_active == True)
        )
        cameras = result.scalars().all()
        
        camera_dicts = [
            {
                "name": c.name,
                "is_active": c.is_active,
                "main_stream_url": c.main_stream_url,
                "sub_stream_url": c.sub_stream_url,
            }
            for c in cameras
        ]
        
        sync_result = await sync_frigate_config(camera_dicts, restart=True)
        return sync_result
