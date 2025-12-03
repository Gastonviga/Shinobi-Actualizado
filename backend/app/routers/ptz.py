"""
TitanNVR - PTZ Router
Enterprise v2.0 - Pan-Tilt-Zoom control via Frigate/ONVIF
"""
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.camera import Camera
from app.schemas.map import PTZCommand, PTZPreset, PTZResponse
from app.services.auth import get_current_user_required, require_operator_or_admin
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cameras", tags=["ptz"])

# Frigate API URL
FRIGATE_URL = "http://frigate:5000"

# PTZ action mapping to Frigate commands
PTZ_ACTIONS = {
    "move_up": {"action": "move", "payload": "UP"},
    "move_down": {"action": "move", "payload": "DOWN"},
    "move_left": {"action": "move", "payload": "LEFT"},
    "move_right": {"action": "move", "payload": "RIGHT"},
    "zoom_in": {"action": "zoom", "payload": "IN"},
    "zoom_out": {"action": "zoom", "payload": "OUT"},
    "stop": {"action": "stop", "payload": None},
}


def normalize_camera_name(name: str) -> str:
    """Normalize camera name to match Frigate format."""
    return name.lower().replace(" ", "_").replace("-", "_")


async def send_ptz_command(camera_name: str, action: str, speed: float = 0.5) -> dict:
    """
    Send PTZ command to Frigate.
    
    Frigate PTZ API:
    POST /api/{camera_name}/ptz/{action}
    
    Actions: move, zoom, stop
    Move payloads: UP, DOWN, LEFT, RIGHT
    Zoom payloads: IN, OUT
    """
    normalized_name = normalize_camera_name(camera_name)
    
    if action not in PTZ_ACTIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid PTZ action. Valid actions: {', '.join(PTZ_ACTIONS.keys())}"
        )
    
    ptz_config = PTZ_ACTIONS[action]
    frigate_action = ptz_config["action"]
    payload = ptz_config["payload"]
    
    # Build Frigate PTZ URL
    url = f"{FRIGATE_URL}/api/{normalized_name}/ptz/{frigate_action}"
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if payload:
                # Frigate expects the direction/zoom as query param or in body
                response = await client.post(
                    url,
                    params={"direction": payload, "speed": speed}
                )
            else:
                response = await client.post(url)
            
            if response.status_code == 200:
                logger.info(f"PTZ command sent: {camera_name} -> {action}")
                return {"success": True, "message": f"PTZ {action} executed"}
            elif response.status_code == 404:
                # Try alternative Frigate PTZ endpoint format
                alt_url = f"{FRIGATE_URL}/api/{normalized_name}/ptz"
                alt_response = await client.post(
                    alt_url,
                    json={"command": frigate_action, "direction": payload, "speed": speed}
                )
                if alt_response.status_code == 200:
                    return {"success": True, "message": f"PTZ {action} executed"}
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Camera '{camera_name}' not found in Frigate or PTZ not configured"
                )
            else:
                logger.error(f"Frigate PTZ error: {response.status_code} - {response.text}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Frigate PTZ error: {response.text}"
                )
                
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Frigate PTZ request timed out"
        )
    except httpx.RequestError as e:
        logger.error(f"Frigate connection error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cannot connect to Frigate service"
        )


@router.post("/{camera_id}/ptz", response_model=PTZResponse)
async def control_ptz(
    camera_id: int,
    command: PTZCommand,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin)
):
    """
    Send PTZ control command to a camera.
    
    Actions:
    - **move_up**: Pan camera up
    - **move_down**: Pan camera down
    - **move_left**: Pan camera left
    - **move_right**: Pan camera right
    - **zoom_in**: Zoom in
    - **zoom_out**: Zoom out
    - **stop**: Stop current movement
    
    Speed: 0.0-1.0 (default 0.5)
    """
    # Verify camera exists and has PTZ capability
    result = await db.execute(
        select(Camera).where(Camera.id == camera_id)
    )
    camera = result.scalar_one_or_none()
    
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera with id {camera_id} not found"
        )
    
    if not camera.features_ptz:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Camera '{camera.name}' does not have PTZ capability"
        )
    
    # Send PTZ command to Frigate
    result = await send_ptz_command(camera.name, command.action, command.speed)
    
    return PTZResponse(
        success=result["success"],
        message=result["message"],
        camera_name=camera.name
    )


@router.post("/{camera_id}/ptz/preset/{preset_id}", response_model=PTZResponse)
async def goto_ptz_preset(
    camera_id: int,
    preset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin)
):
    """
    Move camera to a saved PTZ preset position.
    
    Preset ID: 1-255 (depends on camera configuration)
    """
    # Verify camera exists and has PTZ capability
    result = await db.execute(
        select(Camera).where(Camera.id == camera_id)
    )
    camera = result.scalar_one_or_none()
    
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera with id {camera_id} not found"
        )
    
    if not camera.features_ptz:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Camera '{camera.name}' does not have PTZ capability"
        )
    
    normalized_name = normalize_camera_name(camera.name)
    url = f"{FRIGATE_URL}/api/{normalized_name}/ptz/preset"
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, params={"preset": preset_id})
            
            if response.status_code == 200:
                logger.info(f"PTZ preset {preset_id} activated for {camera.name}")
                return PTZResponse(
                    success=True,
                    message=f"Moved to preset {preset_id}",
                    camera_name=camera.name
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Frigate preset error: {response.text}"
                )
                
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Frigate PTZ request timed out"
        )
    except httpx.RequestError as e:
        logger.error(f"Frigate connection error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cannot connect to Frigate service"
        )


@router.get("/{camera_id}/ptz/status")
async def get_ptz_status(
    camera_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Check if camera has PTZ capability and return status."""
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
        "ptz_enabled": camera.features_ptz,
        "available_actions": list(PTZ_ACTIONS.keys()) if camera.features_ptz else []
    }
