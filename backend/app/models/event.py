"""
TitanNVR - Event Model
Enterprise v2.0 - Frigate Events Persistence for Evidence Management
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Float, Boolean, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Event(Base):
    """
    Event model for storing Frigate detection events.
    
    Persists events that would otherwise only live in Frigate's RAM,
    enabling timeline visualization, evidence export, and compliance reporting.
    
    Attributes:
        id: Frigate event ID (unique string from Frigate)
        camera: Camera name that detected the event
        label: Detection label (person, car, dog, etc.)
        score: Detection confidence score (0.0-1.0)
        start_time: Event start timestamp
        end_time: Event end timestamp (nullable for ongoing events)
        has_clip: Whether a video clip is available
        has_snapshot: Whether a snapshot image is available
        thumbnail_path: Path to cached thumbnail (optional)
        zones: Comma-separated list of triggered zones
        created_at: When this record was created in our DB
    """
    __tablename__ = "events"
    
    # Frigate event ID as primary key (string UUID from Frigate)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    
    # Camera identification
    camera: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    
    # Detection details
    label: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Time range
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Media availability
    has_clip: Mapped[bool] = mapped_column(Boolean, default=False)
    has_snapshot: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Optional metadata
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    zones: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # Comma-separated
    
    # Record metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    
    # Composite indexes for common queries
    __table_args__ = (
        Index('ix_events_camera_start', 'camera', 'start_time'),
        Index('ix_events_label_start', 'label', 'start_time'),
    )
    
    def __repr__(self) -> str:
        return f"<Event(id={self.id}, camera={self.camera}, label={self.label}, score={self.score:.2f})>"
    
    @property
    def duration_seconds(self) -> Optional[float]:
        """Calculate event duration in seconds."""
        if self.end_time and self.start_time:
            return (self.end_time - self.start_time).total_seconds()
        return None
    
    @property
    def is_ongoing(self) -> bool:
        """Check if event is still ongoing (no end_time)."""
        return self.end_time is None
