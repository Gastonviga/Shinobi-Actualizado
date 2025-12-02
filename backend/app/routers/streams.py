"""
TitanNVR - Streams Router
Proxy endpoints for video streaming
"""
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import RedirectResponse, JSONResponse

from app.config import get_settings
from app.services.stream_manager import stream_manager

settings = get_settings()
router = APIRouter(prefix="/streams", tags=["Streams"])


@router.get("/{camera_name}/mse")
async def get_mse_stream(camera_name: str, quality: str = "sub"):
    """
    Get MSE stream URL for a camera.
    
    Args:
        camera_name: The camera name (will be normalized)
        quality: 'main' for high quality, 'sub' for low quality (default: sub)
    
    Returns:
        Redirect to Go2RTC MSE stream or JSON with URL
    """
    if quality not in ("main", "sub"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quality must be 'main' or 'sub'"
        )
    
    urls = stream_manager.get_stream_urls(camera_name)
    mse_url = urls[quality]["mse"]
    
    # Return the URL info (frontend will use this to connect)
    return {
        "camera_name": camera_name,
        "quality": quality,
        "mse_url": mse_url,
        "stream_id": f"{stream_manager._normalize_name(camera_name)}_{quality}"
    }


@router.get("/{camera_name}/webrtc")
async def get_webrtc_stream(camera_name: str, quality: str = "sub"):
    """
    Get WebRTC stream URL for a camera.
    
    Args:
        camera_name: The camera name
        quality: 'main' for high quality, 'sub' for low quality (default: sub)
    """
    if quality not in ("main", "sub"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quality must be 'main' or 'sub'"
        )
    
    urls = stream_manager.get_stream_urls(camera_name)
    
    return {
        "camera_name": camera_name,
        "quality": quality,
        "webrtc_url": urls[quality]["webrtc"],
        "stream_id": f"{stream_manager._normalize_name(camera_name)}_{quality}"
    }


@router.get("/{camera_name}/snapshot")
async def get_snapshot_url(camera_name: str, quality: str = "sub"):
    """
    Get MJPEG snapshot URL for a camera.
    
    Args:
        camera_name: The camera name
        quality: 'main' for high quality, 'sub' for low quality (default: sub)
    """
    if quality not in ("main", "sub"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quality must be 'main' or 'sub'"
        )
    
    urls = stream_manager.get_stream_urls(camera_name)
    
    return {
        "camera_name": camera_name,
        "quality": quality,
        "snapshot_url": urls[quality]["mjpeg"],
        "stream_id": f"{stream_manager._normalize_name(camera_name)}_{quality}"
    }


@router.get("/")
async def list_go2rtc_streams():
    """
    List all streams currently registered in Go2RTC.
    """
    result = await stream_manager.get_all_streams()
    return result


@router.get("/{camera_name}/all")
async def get_all_stream_urls(camera_name: str):
    """
    Get all streaming URLs for a camera (all qualities and formats).
    """
    return {
        "camera_name": camera_name,
        "normalized_name": stream_manager._normalize_name(camera_name),
        "go2rtc_url": settings.go2rtc_url,
        "streams": stream_manager.get_stream_urls(camera_name)
    }
