"""
TitanNVR - User Model
Enterprise authentication and role-based access control with granular camera permissions
"""
import enum
from datetime import datetime
from typing import List, TYPE_CHECKING
from sqlalchemy import Column, Integer, String, DateTime, Enum, Boolean, Table, ForeignKey
from sqlalchemy.orm import relationship, Mapped
from app.database import Base

if TYPE_CHECKING:
    from app.models.camera import Camera


class UserRole(str, enum.Enum):
    """User role enumeration for RBAC."""
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"


# Association table for user-camera permissions (many-to-many)
user_cameras = Table(
    "user_cameras",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("camera_id", Integer, ForeignKey("cameras.id", ondelete="CASCADE"), primary_key=True)
)


class User(Base):
    """
    User model for authentication and authorization.
    
    Roles:
    - admin: Full system access, can manage users, cameras, and settings
    - operator: Can view assigned cameras, manage recordings, acknowledge events
    - viewer: Read-only access to assigned cameras
    
    Camera Permissions:
    - Admins see ALL cameras automatically
    - Operators/Viewers only see cameras in their `allowed_cameras` list
    - Empty `allowed_cameras` means NO access for non-admins
    """
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.VIEWER, nullable=False)
    
    # Account status
    is_active = Column(Boolean, default=True)
    
    # Notification preferences
    receive_email_alerts = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    
    # Camera permissions (many-to-many relationship)
    # For non-admin users, this defines which cameras they can access
    allowed_cameras: Mapped[List["Camera"]] = relationship(
        "Camera",
        secondary=user_cameras,
        lazy="selectin",
        back_populates="allowed_users"
    )
    
    def __repr__(self):
        return f"<User(username='{self.username}', role='{self.role}')>"
    
    def can_access_camera(self, camera_id: int) -> bool:
        """Check if user can access a specific camera."""
        if self.role == UserRole.ADMIN:
            return True
        return any(c.id == camera_id for c in self.allowed_cameras)
