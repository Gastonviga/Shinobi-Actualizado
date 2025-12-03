"""
TitanNVR - Events Router
Enterprise v2.0 - AI detection events with email notifications and DB persistence
"""
from fastapi import APIRouter, Request, BackgroundTasks, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging

from app.database import get_db
from app.models.event import Event
from app.schemas.event import (
    EventResponse,
    EventTimelineItem,
    EventTimeline,
    EventStats
)
from app.services.notification import send_detection_notification
from app.services.auth import get_current_user_required
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])

# Label to color mapping for timeline visualization
LABEL_COLORS = {
    "person": "#3B82F6",    # Blue
    "car": "#10B981",       # Green
    "dog": "#F59E0B",       # Amber
    "cat": "#8B5CF6",       # Purple
    "motorcycle": "#EF4444", # Red
    "bicycle": "#06B6D4",   # Cyan
    "truck": "#84CC16",     # Lime
    "motion": "#22C55E",    # Green for generic motion
    "default": "#6B7280"    # Gray
}

def get_label_color(label: str) -> str:
    """Get color for a detection label."""
    return LABEL_COLORS.get(label.lower(), LABEL_COLORS["default"])


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
async def receive_frigate_event(
    request: Request, 
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Receive webhook events from Frigate NVR.
    
    Enterprise v2.0: Sends email notifications for confirmed detections.
    
    Frigate sends events when objects are detected:
    - type: "new" - New object detected
    - type: "update" - Object tracking updated  
    - type: "end" - Object left the scene (triggers notification)
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
            
            # Send email notification for confirmed detections (on event end)
            # Only notify for high-confidence detections (>70%)
            if top_score >= 0.7 and label in ["person", "car", "dog", "cat"]:
                background_tasks.add_task(
                    send_detection_notification,
                    db,
                    camera,
                    label,
                    top_score,
                    datetime.utcnow()
                )
                logger.info(f"📧 Email notification queued for {label} on {camera}")
        
        # Store event in memory (for quick access)
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
        
        # Persist to database for timeline and evidence
        start_timestamp = after.get("start_time", 0)
        end_timestamp = after.get("end_time")
        
        # Convert Unix timestamps to datetime
        start_dt = datetime.fromtimestamp(start_timestamp) if start_timestamp else datetime.utcnow()
        end_dt = datetime.fromtimestamp(end_timestamp) if end_timestamp else None
        
        # Check if event already exists (for updates)
        existing = await db.execute(
            select(Event).where(Event.id == event_id)
        )
        db_event = existing.scalar_one_or_none()
        
        if db_event:
            # Update existing event
            db_event.end_time = end_dt
            db_event.score = top_score
            db_event.has_clip = after.get("has_clip", False)
            db_event.has_snapshot = after.get("has_snapshot", False)
            db_event.zones = ",".join(zones) if zones else None
        else:
            # Create new event
            db_event = Event(
                id=event_id,
                camera=camera,
                label=label,
                score=top_score,
                start_time=start_dt,
                end_time=end_dt,
                has_clip=after.get("has_clip", False),
                has_snapshot=after.get("has_snapshot", False),
                zones=",".join(zones) if zones else None
            )
            db.add(db_event)
        
        await db.commit()
        
        return {
            "status": "received",
            "event_id": event_id,
            "type": event_type,
            "camera": camera,
            "label": label,
            "persisted": True
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


# ============================================================
# Timeline Endpoint for NVR-Style Playback
# ============================================================

@router.get("/timeline", response_model=EventTimeline)
async def get_event_timeline(
    camera_name: str = Query(..., description="Camera name to get timeline for"),
    start: Optional[datetime] = Query(None, description="Start of time range (default: 24h ago)"),
    end: Optional[datetime] = Query(None, description="End of time range (default: now)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Get events for timeline visualization.
    
    Returns a lightweight list of events for painting the timeline bar
    in the NVR-style video player. Events are colored based on their label.
    
    Default time range is the last 24 hours.
    """
    # Default to last 24 hours
    if not end:
        end = datetime.utcnow()
    if not start:
        start = end - timedelta(hours=24)
    
    # Query events in range
    result = await db.execute(
        select(Event).where(
            and_(
                Event.camera == camera_name,
                Event.start_time >= start,
                Event.start_time <= end
            )
        ).order_by(Event.start_time.asc())
    )
    events = result.scalars().all()
    
    # Convert to timeline items
    timeline_items = []
    for event in events:
        start_ts = int(event.start_time.timestamp())
        end_ts = int(event.end_time.timestamp()) if event.end_time else None
        
        timeline_items.append(EventTimelineItem(
            id=event.id,
            start_time=event.start_time,
            end_time=event.end_time,
            label=event.label,
            score=event.score,
            has_clip=event.has_clip,
            start_timestamp=start_ts,
            end_timestamp=end_ts,
            color=get_label_color(event.label)
        ))
    
    return EventTimeline(
        camera=camera_name,
        start=start,
        end=end,
        events=timeline_items,
        total_count=len(timeline_items)
    )


@router.get("/db", response_model=List[EventResponse])
async def list_persisted_events(
    camera: Optional[str] = None,
    label: Optional[str] = None,
    min_score: Optional[float] = Query(None, ge=0.0, le=1.0),
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    has_clip: Optional[bool] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    List events from database with filtering.
    
    Use this for evidence management, exporting, and compliance.
    """
    query = select(Event)
    filters = []
    
    if camera:
        filters.append(Event.camera == camera)
    if label:
        filters.append(Event.label == label)
    if min_score is not None:
        filters.append(Event.score >= min_score)
    if start_time:
        filters.append(Event.start_time >= start_time)
    if end_time:
        filters.append(Event.start_time <= end_time)
    if has_clip is not None:
        filters.append(Event.has_clip == has_clip)
    
    if filters:
        query = query.where(and_(*filters))
    
    query = query.order_by(Event.start_time.desc()).offset(offset).limit(limit)
    
    result = await db.execute(query)
    events = result.scalars().all()
    
    return [
        EventResponse(
            id=e.id,
            camera=e.camera,
            label=e.label,
            score=e.score,
            start_time=e.start_time,
            end_time=e.end_time,
            has_clip=e.has_clip,
            has_snapshot=e.has_snapshot,
            zones=e.zones,
            thumbnail_path=e.thumbnail_path,
            created_at=e.created_at,
            duration_seconds=e.duration_seconds
        )
        for e in events
    ]


@router.get("/db/stats", response_model=EventStats)
async def get_db_event_stats(
    camera: Optional[str] = None,
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Get statistics for persisted events.
    
    Useful for compliance dashboards and analytics.
    """
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(days=days)
    
    base_filter = Event.start_time >= start_time
    if camera:
        base_filter = and_(base_filter, Event.camera == camera)
    
    # Total count
    total_result = await db.execute(
        select(func.count(Event.id)).where(base_filter)
    )
    total_events = total_result.scalar() or 0
    
    # By label breakdown
    labels_result = await db.execute(
        select(Event.label, func.count(Event.id)).where(base_filter).group_by(Event.label)
    )
    events_by_label = {row[0]: row[1] for row in labels_result.all()}
    
    return EventStats(
        camera=camera or "all",
        total_events=total_events,
        events_by_label=events_by_label,
        period_start=start_time,
        period_end=end_time
    )


@router.get("/db/{event_id}", response_model=EventResponse)
async def get_event_detail(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Get detailed information about a specific event."""
    result = await db.execute(
        select(Event).where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    
    if not event:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id} not found"
        )
    
    return EventResponse(
        id=event.id,
        camera=event.camera,
        label=event.label,
        score=event.score,
        start_time=event.start_time,
        end_time=event.end_time,
        has_clip=event.has_clip,
        has_snapshot=event.has_snapshot,
        zones=event.zones,
        thumbnail_path=event.thumbnail_path,
        created_at=event.created_at,
        duration_seconds=event.duration_seconds
    )
