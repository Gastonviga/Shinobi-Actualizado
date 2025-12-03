"""
TitanNVR - Map Model
Enterprise v2.0 - Interactive floor plans for camera positioning
"""
from sqlalchemy import String, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional

from app.database import Base


class Map(Base):
    """
    Map model for storing floor plans/site maps.
    
    Cameras can be positioned on maps using X,Y coordinates (percentages).
    """
    __tablename__ = "maps"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Image path (stored in storage/maps/)
    image_path: Mapped[str] = mapped_column(String(500), nullable=False)
    
    # Optional description
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Timestamps
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
        return f"<Map(id={self.id}, name='{self.name}')>"
