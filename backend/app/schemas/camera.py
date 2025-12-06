"""
TitanNVR - Camera Pydantic Schemas
Enterprise v2.0 with recording configuration
"""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from datetime import datetime, time
from typing import Optional, Dict, Any, List
from enum import Enum


class RecordingModeEnum(str, Enum):
    """Recording mode options."""
    CONTINUOUS = "continuous"
    MOTION = "motion"
    EVENTS = "events"
    NONE = "none"


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


# ============================================================
# Camera Schedule Schemas
# ============================================================

class ScheduleSlot(BaseModel):
    """A single schedule slot for a camera."""
    day_of_week: int = Field(..., ge=0, le=6, description="0=Monday, 6=Sunday")
    start_time: str = Field(..., description="Start time in HH:MM format")
    end_time: str = Field(..., description="End time in HH:MM format")
    mode: RecordingModeEnum = Field(..., description="Recording mode for this slot")
    
    @field_validator('start_time', 'end_time')
    @classmethod
    def validate_time_format(cls, v: str) -> str:
        """Validate time is in HH:MM format."""
        try:
            time.fromisoformat(v)
        except ValueError:
            raise ValueError(f"Invalid time format: {v}. Use HH:MM format.")
        return v


class CameraScheduleCreate(BaseModel):
    """Schema for creating/updating camera schedules (bulk replace)."""
    schedules: List[ScheduleSlot] = Field(default_factory=list, description="List of schedule slots")


class CameraScheduleResponse(BaseModel):
    """Response for a single schedule entry."""
    id: int
    camera_id: int
    day_of_week: int
    start_time: str
    end_time: str
    mode: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
    
    @field_validator('start_time', 'end_time', mode='before')
    @classmethod
    def time_to_string(cls, v):
        """Convert time object to string."""
        if isinstance(v, time):
            return v.strftime("%H:%M")
        return v


class CameraSchedulesResponse(BaseModel):
    """Response for camera schedules list."""
    camera_id: int
    camera_name: str
    schedules: List[CameraScheduleResponse] = []
    has_schedule: bool = False
