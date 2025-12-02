"""
TitanNVR - Camera Pydantic Schemas
"""
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class CameraBase(BaseModel):
    """Base schema for Camera."""
    name: str
    main_stream_url: str
    sub_stream_url: Optional[str] = None
    location: Optional[str] = None


class CameraCreate(CameraBase):
    """Schema for creating a new camera."""
    pass


class CameraUpdate(BaseModel):
    """Schema for updating a camera."""
    name: Optional[str] = None
    main_stream_url: Optional[str] = None
    sub_stream_url: Optional[str] = None
    is_recording: Optional[bool] = None
    is_active: Optional[bool] = None
    location: Optional[str] = None


class CameraResponse(CameraBase):
    """Schema for camera response."""
    id: int
    is_recording: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
