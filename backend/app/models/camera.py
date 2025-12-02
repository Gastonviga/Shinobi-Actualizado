"""
TitanNVR - Camera Model
"""
from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.database import Base


class Camera(Base):
    """
    Camera model for storing IP camera configurations.
    
    Attributes:
        id: Unique identifier
        name: Human-readable camera name
        main_stream_url: High quality RTSP URL for recording and detailed view
        sub_stream_url: Low quality RTSP URL for grid/mosaic view (low bandwidth)
        is_recording: Whether the camera is currently recording
        is_active: Whether the camera is enabled
        location: Physical location description
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
        return f"<Camera(id={self.id}, name='{self.name}', recording={self.is_recording})>"
