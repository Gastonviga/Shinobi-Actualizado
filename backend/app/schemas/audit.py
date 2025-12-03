"""
TitanNVR - Audit Log Pydantic Schemas
Enterprise v2.0 - Compliance API Schemas
"""
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional, List


class AuditLogBase(BaseModel):
    """Base schema for AuditLog."""
    action: str
    details: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None


class AuditLogCreate(AuditLogBase):
    """Schema for creating an audit log entry."""
    user_id: Optional[int] = None
    username: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class AuditLogResponse(AuditLogBase):
    """Schema for audit log response."""
    id: int
    user_id: Optional[int] = None
    username: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime
    
    model_config = ConfigDict(from_attributes=True)


class AuditLogList(BaseModel):
    """Paginated list of audit logs."""
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class AuditLogFilter(BaseModel):
    """Filter parameters for audit logs query."""
    username: Optional[str] = None
    action: Optional[str] = None
    resource_type: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)


class AuditStats(BaseModel):
    """Audit statistics summary."""
    total_logs: int
    logs_today: int
    unique_users: int
    actions_breakdown: dict  # {"LOGIN": 50, "CAMERA_DELETE": 2, ...}
    period_start: datetime
    period_end: datetime
