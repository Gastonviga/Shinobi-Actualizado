"""
TitanNVR - Map Pydantic Schemas
Enterprise v2.0 - Interactive E-Maps
"""
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional, List


class MapBase(BaseModel):
    """Base schema for Map."""
    name: str = Field(..., min_length=1, max_length=255, description="Map name")
    description: Optional[str] = Field(default=None, description="Optional description")


class MapCreate(MapBase):
    """Schema for creating a new map (image uploaded separately)."""
    pass


class MapUpdate(BaseModel):
    """Schema for updating a map."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None


class MapResponse(MapBase):
    """Schema for map response."""
    id: int
    image_path: str
    image_url: str  # Computed URL for frontend access
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class MapCameraInfo(BaseModel):
    """Camera info for map display."""
    id: int
    name: str
    map_x: float
    map_y: float
    is_recording: bool
    is_active: bool
    features_ptz: bool
    has_alert: bool = False  # For future alert integration
    
    model_config = ConfigDict(from_attributes=True)


class MapWithCameras(MapResponse):
    """Map response with positioned cameras."""
    cameras: List[MapCameraInfo] = []


# PTZ Schemas
class PTZCommand(BaseModel):
    """Schema for PTZ control command."""
    action: str = Field(
        ..., 
        description="PTZ action: move_up, move_down, move_left, move_right, zoom_in, zoom_out, stop"
    )
    speed: Optional[float] = Field(
        default=0.5, 
        ge=0.0, 
        le=1.0, 
        description="Movement speed (0.0-1.0)"
    )


class PTZPreset(BaseModel):
    """Schema for PTZ preset."""
    preset_id: int = Field(..., ge=1, le=255, description="Preset number (1-255)")


class PTZResponse(BaseModel):
    """Response for PTZ operations."""
    success: bool
    message: str
    camera_name: str
