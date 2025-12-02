"""
TitanNVR - Camera Model
Enterprise v2.0 with advanced recording configuration
"""
import enum
from sqlalchemy import String, Boolean, DateTime, Integer, Enum, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.sqlite import JSON
from datetime import datetime
from typing import Optional

from app.database import Base


class RecordingMode(str, enum.Enum):
    """Recording mode options for space optimization."""
    CONTINUOUS = "continuous"  # 24/7 recording, maximum storage usage
    MOTION = "motion"          # Record only when motion detected
    EVENTS = "events"          # Record only on AI detection (person, car, etc.)


class Camera(Base):
    """
    Camera model for storing IP camera configurations.
    
    Enterprise v2.0 Attributes:
        id: Unique identifier
        name: Human-readable camera name
        main_stream_url: High quality RTSP URL for recording and detailed view
        sub_stream_url: Low quality RTSP URL for grid/mosaic view (low bandwidth)
        is_recording: Whether the camera is currently recording
        is_active: Whether the camera is enabled
        location: Physical location description
        
        # Enterprise Recording Settings
        retention_days: Days to keep recordings (default 7)
        recording_mode: continuous | motion | events
        zones_config: JSON config for detection zones
        
        created_at: Timestamp when camera was added
        updated_at: Timestamp when camera was last modified
    """
    __tablename__ = "cameras"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # CRITICAL: Separate stream URLs for different use cases
    main_stream_url: Mapped[str] = mapped_column(String(500), nullable=False)
    sub_stream_url: Mapped[str] = mapped_column(String(500), nullable=True)
    
    is_recording: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    location: Mapped[str] = mapped_column(String(255), nullable=True)
    
    # Group for organizing cameras (e.g., "Planta Baja", "Exterior")
    group: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # Enterprise Recording Configuration
    retention_days: Mapped[int] = mapped_column(Integer, default=7, nullable=False)
    recording_mode: Mapped[RecordingMode] = mapped_column(
        Enum(RecordingMode), 
        default=RecordingMode.MOTION, 
        nullable=False
    )
    
    # Detection zones configuration (for future use)
    # Format: [{"name": "entrance", "coordinates": [[x,y], ...], "objects": ["person"]}]
    zones_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    
    # Event retention (separate from continuous recordings)
    event_retention_days: Mapped[int] = mapped_column(Integer, default=14, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    
    def __repr__(self) -> str:
        return f"<Camera(id={self.id}, name='{self.name}', mode={self.recording_mode})>"
