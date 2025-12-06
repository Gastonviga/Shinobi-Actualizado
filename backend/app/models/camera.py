"""
TitanNVR - Camera Model
Enterprise v2.0 with advanced recording configuration
"""
import enum
from sqlalchemy import String, Boolean, DateTime, Integer, Enum, Text, Float, ForeignKey, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON  # Compatible with PostgreSQL and SQLite
from datetime import datetime, time
from typing import Optional, List, TYPE_CHECKING

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class RecordingMode(str, enum.Enum):
    """Recording mode options for space optimization."""
    CONTINUOUS = "continuous"  # 24/7 recording, maximum storage usage
    MOTION = "motion"          # Record only when motion detected
    EVENTS = "events"          # Record only on AI detection (person, car, etc.)
    NONE = "none"              # No recording (schedule only)


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
    
    # Map positioning (Enterprise E-Maps feature)
    map_id: Mapped[Optional[int]] = mapped_column(
        Integer, 
        ForeignKey("maps.id", ondelete="SET NULL"), 
        nullable=True
    )
    map_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # X position as percentage (0-100)
    map_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Y position as percentage (0-100)
    
    # PTZ capability flag
    features_ptz: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    
    # Relationship to schedules
    schedules: Mapped[List["CameraSchedule"]] = relationship(
        "CameraSchedule",
        back_populates="camera",
        cascade="all, delete-orphan"
    )
    
    # Users who have access to this camera (inverse of User.allowed_cameras)
    allowed_users: Mapped[List["User"]] = relationship(
        "User",
        secondary="user_cameras",
        back_populates="allowed_cameras"
    )
    
    def __repr__(self) -> str:
        return f"<Camera(id={self.id}, name='{self.name}', mode={self.recording_mode})>"


class CameraSchedule(Base):
    """
    Camera recording schedule.
    
    Defines time-based recording modes for each camera.
    Example: Monday-Friday 08:00-18:00 = Continuous, rest = Motion
    """
    __tablename__ = "camera_schedules"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    camera_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("cameras.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Day of week: 0=Monday, 1=Tuesday, ..., 6=Sunday
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Time range
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    
    # Recording mode for this time slot
    mode: Mapped[RecordingMode] = mapped_column(
        Enum(RecordingMode),
        default=RecordingMode.MOTION,
        nullable=False
    )
    
    # Relationship back to camera
    camera: Mapped["Camera"] = relationship("Camera", back_populates="schedules")
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    
    def __repr__(self) -> str:
        return f"<CameraSchedule(camera_id={self.camera_id}, day={self.day_of_week}, {self.start_time}-{self.end_time}, mode={self.mode})>"
