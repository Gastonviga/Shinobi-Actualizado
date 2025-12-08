"""
TitanNVR - Authentication Router
Enterprise JWT authentication endpoints with audit logging
"""
from datetime import timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
import logging

from app.database import get_db
from app.models.user import User, UserRole, user_cameras
from app.models.camera import Camera
from app.models.audit import AuditAction
from app.routers.audit import log_action
from app.services.auth import (
    AuthService,
    get_current_user_required,
    require_admin,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["authentication"])


# ============================================================
# Schemas
# ============================================================

class UserResponse(BaseModel):
    """User response without sensitive data."""
    id: int
    username: str
    email: Optional[str]
    role: str
    is_active: bool
    receive_email_alerts: bool
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class UserCreate(BaseModel):
    """Schema for creating new users."""
    username: str
    password: str
    email: Optional[EmailStr] = None
    role: UserRole = UserRole.VIEWER


class UserUpdate(BaseModel):
    """Schema for updating users."""
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    receive_email_alerts: Optional[bool] = None
    password: Optional[str] = None  # For admin password reset


class PasswordChange(BaseModel):
    """Schema for changing password."""
    current_password: str
    new_password: str


# ============================================================
# Authentication Endpoints
# ============================================================

@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticate user and return JWT token.
    
    Use form data with 'username' and 'password' fields.
    """
    user = await AuthService.authenticate_user(
        db, form_data.username, form_data.password
    )
    
    if not user:
        # Log failed login attempt
        await log_action(
            db=db,
            user=None,
            action=AuditAction.LOGIN_FAILED,
            details=f"Failed login attempt for username: {form_data.username}",
            request=request
        )
        await db.commit()
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Log successful login
    await log_action(
        db=db,
        user=user,
        action=AuditAction.LOGIN,
        details=f"User '{user.username}' logged in successfully",
        request=request
    )
    
    access_token = AuthService.create_access_token(
        data={"sub": str(user.id), "role": user.role.value}
    )
    
    return Token(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role.value,
            is_active=user.is_active,
            receive_email_alerts=user.receive_email_alerts
        )
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user_required)
):
    """Get current authenticated user information."""
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        role=current_user.role.value,
        is_active=current_user.is_active,
        receive_email_alerts=current_user.receive_email_alerts
    )


@router.post("/logout")
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """
    Logout endpoint - logs the logout action for audit purposes.
    
    Note: JWT tokens are stateless, so the actual token invalidation
    should be handled client-side by removing the token from storage.
    This endpoint just records the logout event for compliance/auditing.
    """
    # Log the logout action
    await log_action(
        db=db,
        user=current_user,
        action=AuditAction.LOGOUT,
        details=f"User '{current_user.username}' logged out",
        request=request
    )
    await db.commit()
    
    logger.info(f"User '{current_user.username}' logged out")
    
    return {"message": "Logged out successfully"}


@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """Change current user's password."""
    if not AuthService.verify_password(
        password_data.current_password, 
        current_user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    current_user.hashed_password = AuthService.get_password_hash(
        password_data.new_password
    )
    await db.commit()
    
    return {"message": "Password changed successfully"}


# ============================================================
# User Management (Admin only)
# ============================================================

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """List all users (admin only)."""
    result = await db.execute(select(User).order_by(User.username))
    users = result.scalars().all()
    
    return [
        UserResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            role=u.role.value,
            is_active=u.is_active,
            receive_email_alerts=u.receive_email_alerts
        ) for u in users
    ]


@router.post("/users", response_model=UserResponse)
async def create_user(
    request: Request,
    user_data: UserCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create a new user (admin only)."""
    # Check if username exists
    result = await db.execute(
        select(User).where(User.username == user_data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    user = await AuthService.create_user(
        db,
        username=user_data.username,
        password=user_data.password,
        email=user_data.email,
        role=user_data.role
    )
    
    # Log user creation
    await log_action(
        db=db,
        user=admin,
        action=AuditAction.USER_CREATE,
        details=f"Created user '{user.username}' with role '{user.role.value}'",
        request=request,
        resource_type="user",
        resource_id=str(user.id)
    )
    
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role.value,
        is_active=user.is_active,
        receive_email_alerts=user.receive_email_alerts
    )


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    request: Request,
    user_id: int,
    user_data: UserUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update a user (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    changes = []
    
    if user_data.email is not None:
        user.email = user_data.email
        changes.append("email")
    if user_data.role is not None:
        user.role = user_data.role
        changes.append(f"role={user_data.role.value}")
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
        changes.append(f"active={user_data.is_active}")
    if user_data.receive_email_alerts is not None:
        user.receive_email_alerts = user_data.receive_email_alerts
        changes.append("email_alerts")
    
    # Handle password reset by admin
    password_reset = False
    if user_data.password is not None and user_data.password.strip():
        user.hashed_password = AuthService.get_password_hash(user_data.password)
        password_reset = True
        changes.append("password_reset")
    
    await db.commit()
    await db.refresh(user)
    
    # Log the update action
    details = f"Updated user '{user.username}'"
    if changes:
        details += f": {', '.join(changes)}"
    if password_reset:
        details = f"Password reset for user '{user.username}'"
        if len(changes) > 1:
            details += f" + other changes: {', '.join(c for c in changes if c != 'password_reset')}"
    
    await log_action(
        db=db,
        user=admin,
        action=AuditAction.USER_UPDATE,
        details=details,
        request=request,
        resource_type="user",
        resource_id=str(user.id)
    )
    
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role.value,
        is_active=user.is_active,
        receive_email_alerts=user.receive_email_alerts
    )


@router.delete("/users/{user_id}")
async def delete_user(
    request: Request,
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Delete a user (admin only)."""
    if admin.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    username = user.username  # Save before deletion
    
    await db.delete(user)
    
    # Log user deletion
    await log_action(
        db=db,
        user=admin,
        action=AuditAction.USER_DELETE,
        details=f"Deleted user '{username}'",
        request=request,
        resource_type="user",
        resource_id=str(user_id)
    )
    
    await db.commit()
    
    return {"message": f"User {username} deleted"}


# ============================================================
# User Camera Permissions (Admin only)
# ============================================================

class UserPermissionsUpdate(BaseModel):
    """Schema for updating user camera permissions."""
    camera_ids: List[int]


class UserPermissionsResponse(BaseModel):
    """Response with user's camera permissions."""
    user_id: int
    username: str
    role: str
    camera_ids: List[int]
    camera_names: List[str]


@router.get("/users/{user_id}/permissions", response_model=UserPermissionsResponse)
async def get_user_permissions(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get camera permissions for a user (admin only).
    
    Returns list of camera IDs the user can access.
    Note: Admins have implicit access to all cameras.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # For admins, return all cameras
    if user.role == UserRole.ADMIN:
        cameras_result = await db.execute(select(Camera))
        all_cameras = cameras_result.scalars().all()
        return UserPermissionsResponse(
            user_id=user.id,
            username=user.username,
            role=user.role.value,
            camera_ids=[c.id for c in all_cameras],
            camera_names=[c.name for c in all_cameras]
        )
    
    return UserPermissionsResponse(
        user_id=user.id,
        username=user.username,
        role=user.role.value,
        camera_ids=[c.id for c in user.allowed_cameras],
        camera_names=[c.name for c in user.allowed_cameras]
    )


@router.put("/users/{user_id}/permissions", response_model=UserPermissionsResponse)
async def update_user_permissions(
    request: Request,
    user_id: int,
    permissions: UserPermissionsUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Update camera permissions for a user (admin only).
    
    Replaces all current permissions with the new list.
    Pass empty list to revoke all access.
    
    Note: Cannot modify permissions for admin users (they have full access).
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Cannot modify admin permissions
    if user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify permissions for admin users - they have full access"
        )
    
    # Validate camera IDs exist
    if permissions.camera_ids:
        cameras_result = await db.execute(
            select(Camera).where(Camera.id.in_(permissions.camera_ids))
        )
        valid_cameras = cameras_result.scalars().all()
        valid_ids = {c.id for c in valid_cameras}
        
        invalid_ids = set(permissions.camera_ids) - valid_ids
        if invalid_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid camera IDs: {list(invalid_ids)}"
            )
    else:
        valid_cameras = []
    
    # Clear existing permissions
    user.allowed_cameras.clear()
    
    # Add new permissions
    for camera in valid_cameras:
        user.allowed_cameras.append(camera)
    
    await db.commit()
    await db.refresh(user)
    
    # Log the permission change
    camera_names = [c.name for c in valid_cameras]
    await log_action(
        db=db,
        user=admin,
        action=AuditAction.USER_UPDATE,
        details=f"Updated camera permissions for user '{user.username}': {len(valid_cameras)} cameras ({', '.join(camera_names[:5])}{'...' if len(camera_names) > 5 else ''})",
        request=request,
        resource_type="user",
        resource_id=str(user.id)
    )
    
    logger.info(f"Permissions updated for user '{user.username}': {len(valid_cameras)} cameras")
    
    return UserPermissionsResponse(
        user_id=user.id,
        username=user.username,
        role=user.role.value,
        camera_ids=[c.id for c in user.allowed_cameras],
        camera_names=[c.name for c in user.allowed_cameras]
    )
