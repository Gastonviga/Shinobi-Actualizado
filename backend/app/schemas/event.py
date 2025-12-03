"""
TitanNVR - Event Pydantic Schemas
Enterprise v2.0 - Events API Schemas
"""
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional, List


class EventBase(BaseModel):
    """Base schema for Event."""
    camera: str
    label: str
    score: float = Field(..., ge=0.0, le=1.0)
    start_time: datetime
    end_time: Optional[datetime] = None
    has_clip: bool = False
    has_snapshot: bool = False
    zones: Optional[str] = None


class EventCreate(EventBase):
    """Schema for creating an event from Frigate webhook."""
    id: str  # Frigate event ID


class EventResponse(EventBase):
    """Schema for event response."""
    id: str
    thumbnail_path: Optional[str] = None
    created_at: datetime
    duration_seconds: Optional[float] = None
    
    model_config = ConfigDict(from_attributes=True)


class EventTimelineItem(BaseModel):
    """Lightweight event item for timeline visualization."""
    id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    label: str
    score: float
    has_clip: bool
    
    # Computed for frontend rendering
    start_timestamp: int  # Unix timestamp for easy JS handling
    end_timestamp: Optional[int] = None
    color: str  # Suggested color based on label
    
    model_config = ConfigDict(from_attributes=True)


class EventTimeline(BaseModel):
    """Response for timeline endpoint."""
    camera: str
    start: datetime
    end: datetime
    events: List[EventTimelineItem]
    total_count: int


class EventStats(BaseModel):
    """Statistics about events for a camera."""
    camera: str
    total_events: int
    events_by_label: dict  # {"person": 45, "car": 12, ...}
    period_start: datetime
    period_end: datetime


class EventFilter(BaseModel):
    """Filter parameters for events query."""
    camera: Optional[str] = None
    label: Optional[str] = None
    min_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    has_clip: Optional[bool] = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)
