"""
TitanNVR - Events Router
Handles AI detection events from Frigate
"""
from fastapi import APIRouter, Request, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])


# ============================================================
# Pydantic Models for Frigate Events
# ============================================================

class FrigateEventData(BaseModel):
    """Frigate event data structure"""
    id: str
    camera: str
    frame_time: float
    snapshot_time: Optional[float] = None
    label: str
    sub_label: Optional[str] = None
    top_score: float
    false_positive: Optional[bool] = None
    start_time: float
    end_time: Optional[float] = None
    score: float
    box: List[float]  # [y_min, x_min, y_max, x_max]
    area: int
    ratio: float
    region: List[int]
    stationary: Optional[bool] = None
    motionless_count: Optional[int] = None
    position_changes: Optional[int] = None
    current_zones: List[str] = []
    entered_zones: List[str] = []
    has_clip: bool = False
    has_snapshot: bool = False
    
    class Config:
        extra = "allow"  # Allow additional fields


class FrigateWebhook(BaseModel):
    """Frigate webhook payload"""
    type: str  # "new", "update", "end"
    before: Optional[FrigateEventData] = None
    after: FrigateEventData
    
    class Config:
        extra = "allow"


# ============================================================
# Event Storage (In-memory for now, will be DB later)
# ============================================================

# Simple in-memory event storage (last 100 events)
recent_events: List[Dict[str, Any]] = []
MAX_EVENTS = 100


def store_event(event: Dict[str, Any]):
    """Store event in memory (FIFO)"""
    recent_events.insert(0, event)
    if len(recent_events) > MAX_EVENTS:
        recent_events.pop()


# ============================================================
# Endpoints
# ============================================================

@router.post("/frigate")
async def receive_frigate_event(request: Request, background_tasks: BackgroundTasks):
    """
    Receive webhook events from Frigate NVR.
    
    Frigate sends events when objects are detected:
    - type: "new" - New object detected
    - type: "update" - Object tracking updated  
    - type: "end" - Object left the scene
    """
    try:
        payload = await request.json()
        
        event_type = payload.get("type", "unknown")
        after = payload.get("after", {})
        
        camera = after.get("camera", "unknown")
        label = after.get("label", "unknown")
        score = after.get("score", 0)
        top_score = after.get("top_score", score)
        zones = after.get("current_zones", [])
        event_id = after.get("id", "unknown")
        
        # Log the detection
        if event_type == "new":
            logger.warning(
                f"⚠️ ALERTA: {label.upper()} detectado en cámara '{camera}' "
                f"con confianza {top_score:.1%}"
            )
        elif event_type == "end":
            start_time = after.get("start_time", 0)
            end_time = after.get("end_time", 0)
            duration = end_time - start_time if end_time else 0
            logger.info(
                f"✓ Evento finalizado: {label} en '{camera}' - "
                f"duración: {duration:.1f}s"
            )
        
        # Store event
        event_record = {
            "id": event_id,
            "type": event_type,
            "camera": camera,
            "label": label,
            "score": top_score,
            "zones": zones,
            "timestamp": datetime.utcnow().isoformat(),
            "has_snapshot": after.get("has_snapshot", False),
            "has_clip": after.get("has_clip", False),
        }
        store_event(event_record)
        
        # TODO: Add background task for notifications (email, push, etc.)
        # background_tasks.add_task(send_notification, event_record)
        
        return {
            "status": "received",
            "event_id": event_id,
            "type": event_type,
            "camera": camera,
            "label": label
        }
        
    except Exception as e:
        logger.error(f"Error processing Frigate event: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/")
async def list_recent_events(
    camera: Optional[str] = None,
    label: Optional[str] = None,
    limit: int = 50
):
    """
    Get recent detection events.
    
    Args:
        camera: Filter by camera name
        label: Filter by object label (person, car, etc.)
        limit: Maximum number of events to return
    """
    events = recent_events
    
    if camera:
        events = [e for e in events if e.get("camera") == camera]
    
    if label:
        events = [e for e in events if e.get("label") == label]
    
    return {
        "events": events[:limit],
        "total": len(events),
        "filtered": camera is not None or label is not None
    }


@router.get("/stats")
async def get_event_stats():
    """Get detection statistics"""
    if not recent_events:
        return {
            "total_events": 0,
            "by_camera": {},
            "by_label": {}
        }
    
    # Count by camera
    by_camera: Dict[str, int] = {}
    by_label: Dict[str, int] = {}
    
    for event in recent_events:
        camera = event.get("camera", "unknown")
        label = event.get("label", "unknown")
        
        by_camera[camera] = by_camera.get(camera, 0) + 1
        by_label[label] = by_label.get(label, 0) + 1
    
    return {
        "total_events": len(recent_events),
        "by_camera": by_camera,
        "by_label": by_label,
        "last_event": recent_events[0] if recent_events else None
    }


@router.delete("/")
async def clear_events():
    """Clear all stored events (admin only)"""
    global recent_events
    count = len(recent_events)
    recent_events = []
    return {"status": "cleared", "deleted": count}
