"""
TitanNVR - Camera Pydantic Schemas
Enterprise v2.0 with recording configuration
"""
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum


class RecordingModeEnum(str, Enum):
    """Recording mode options."""
    CONTINUOUS = "continuous"
    MOTION = "motion"
    EVENTS = "events"


class CameraBase(BaseModel):
    """Base schema for Camera."""
    name: str
    main_stream_url: str
    sub_stream_url: Optional[str] = None
    location: Optional[str] = None
    group: Optional[str] = Field(default=None, max_length=100, description="Camera group (e.g., 'Planta Baja')")


class CameraCreate(CameraBase):
    """Schema for creating a new camera."""
    # Enterprise recording settings
    retention_days: int = Field(default=7, ge=1, le=365, description="Days to keep recordings")
    recording_mode: RecordingModeEnum = Field(
        default=RecordingModeEnum.MOTION,
        description="Recording mode: continuous (24/7), motion (movement), events (AI only)"
    )
    event_retention_days: int = Field(default=14, ge=1, le=365, description="Days to keep event clips")
    zones_config: Optional[Dict[str, Any]] = None
    # PTZ capability
    features_ptz: bool = Field(default=False, description="Camera has PTZ capability")


class CameraUpdate(BaseModel):
    """Schema for updating a camera."""
    name: Optional[str] = None
    main_stream_url: Optional[str] = None
    sub_stream_url: Optional[str] = None
    is_recording: Optional[bool] = None
    is_active: Optional[bool] = None
    location: Optional[str] = None
    group: Optional[str] = None
    # Enterprise recording settings
    retention_days: Optional[int] = Field(default=None, ge=1, le=365)
    recording_mode: Optional[RecordingModeEnum] = None
    event_retention_days: Optional[int] = Field(default=None, ge=1, le=365)
    zones_config: Optional[Dict[str, Any]] = None
    # PTZ capability
    features_ptz: Optional[bool] = None
    # Map positioning
    map_id: Optional[int] = None
    map_x: Optional[float] = Field(default=None, ge=0, le=100, description="X position as percentage")
    map_y: Optional[float] = Field(default=None, ge=0, le=100, description="Y position as percentage")


class CameraResponse(CameraBase):
    """Schema for camera response."""
    id: int
    is_recording: bool
    is_active: bool
    group: Optional[str] = None
    # Enterprise recording settings
    retention_days: int
    recording_mode: str
    event_retention_days: int
    zones_config: Optional[Dict[str, Any]] = None
    # PTZ capability
    features_ptz: bool = False
    # Map positioning
    map_id: Optional[int] = None
    map_x: Optional[float] = None
    map_y: Optional[float] = None
    # Timestamps
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class CameraPositionUpdate(BaseModel):
    """Schema for updating camera position on map."""
    map_id: int = Field(..., description="Map ID where camera is positioned")
    map_x: float = Field(..., ge=0, le=100, description="X position as percentage (0-100)")
    map_y: float = Field(..., ge=0, le=100, description="Y position as percentage (0-100)")


class CameraBulkCreate(BaseModel):
    """Schema for bulk camera creation."""
    cameras: List[CameraCreate] = Field(..., min_length=1, max_length=100)


class CameraBulkResponse(BaseModel):
    """Response for bulk camera creation."""
    created: int
    failed: int
    errors: List[str] = []
    cameras: List[CameraResponse] = []


class CameraBulkDelete(BaseModel):
    """Schema for bulk camera deletion."""
    camera_ids: List[int] = Field(..., min_length=1, max_length=100)


class CameraBulkDeleteResponse(BaseModel):
    """Response for bulk camera deletion."""
    deleted: int
    failed: int
    errors: List[str] = []


class RecordingModeInfo(BaseModel):
    """Information about recording modes for frontend display."""
    mode: str
    name: str
    description: str
    storage_impact: str


RECORDING_MODES_INFO: List[RecordingModeInfo] = [
    RecordingModeInfo(
        mode="continuous",
        name="Continuo 24/7",
        description="Graba todo el tiempo. Máximo uso de almacenamiento.",
        storage_impact="~10-15 GB/día por cámara (1080p)"
    ),
    RecordingModeInfo(
        mode="motion",
        name="Solo Movimiento",
        description="Graba cuando detecta movimiento. Balance entre cobertura y espacio.",
        storage_impact="~2-5 GB/día por cámara"
    ),
    RecordingModeInfo(
        mode="events",
        name="Solo Eventos IA",
        description="Graba solo cuando detecta personas/vehículos. Máximo ahorro de espacio.",
        storage_impact="~0.5-2 GB/día por cámara"
    )
]
