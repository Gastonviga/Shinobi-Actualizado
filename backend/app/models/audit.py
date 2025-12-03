"""
TitanNVR - Audit Log Model
Enterprise v2.0 - Compliance and Activity Tracking
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class AuditAction:
    """Standard audit action types for consistency."""
    # Authentication
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    LOGIN_FAILED = "LOGIN_FAILED"
    
    # Camera Management
    CAMERA_CREATE = "CAMERA_CREATE"
    CAMERA_UPDATE = "CAMERA_UPDATE"
    CAMERA_DELETE = "CAMERA_DELETE"
    
    # Recording Management
    RECORDING_DELETE = "RECORDING_DELETE"
    RECORDING_EXPORT = "RECORDING_EXPORT"
    
    # User Management
    USER_CREATE = "USER_CREATE"
    USER_UPDATE = "USER_UPDATE"
    USER_DELETE = "USER_DELETE"
    
    # System Settings
    SETTINGS_UPDATE = "SETTINGS_UPDATE"
    
    # Maps
    MAP_CREATE = "MAP_CREATE"
    MAP_UPDATE = "MAP_UPDATE"
    MAP_DELETE = "MAP_DELETE"
    
    # Events
    EVENT_ACKNOWLEDGE = "EVENT_ACKNOWLEDGE"
    EVENT_EXPORT = "EVENT_EXPORT"
    
    # PTZ Control
    PTZ_CONTROL = "PTZ_CONTROL"


class AuditLog(Base):
    """
    Audit log model for compliance and activity tracking.
    
    Records all significant user actions in the system for:
    - Security auditing
    - Compliance reporting (SOC2, ISO 27001, etc.)
    - Troubleshooting and forensics
    - User activity monitoring
    
    Attributes:
        id: Auto-increment primary key
        user_id: Foreign key to users table (nullable for system actions)
        username: Username at time of action (denormalized for historical accuracy)
        action: Action type (from AuditAction constants)
        details: JSON or text description of what was done
        ip_address: Client IP address
        user_agent: Browser/client user agent string
        resource_type: Type of resource affected (camera, user, recording, etc.)
        resource_id: ID of the affected resource
        timestamp: When the action occurred
    """
    __tablename__ = "audit_logs"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # User who performed the action
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, 
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    username: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    
    # Action details
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Request context
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)  # IPv6 max length
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Affected resource (for filtering/searching)
    resource_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    resource_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # Timestamp
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True
    )
    
    # Composite indexes for common queries
    __table_args__ = (
        Index('ix_audit_user_timestamp', 'user_id', 'timestamp'),
        Index('ix_audit_action_timestamp', 'action', 'timestamp'),
    )
    
    def __repr__(self) -> str:
        return f"<AuditLog(id={self.id}, user={self.username}, action={self.action})>"
