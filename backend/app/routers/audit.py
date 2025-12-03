"""
TitanNVR - Audit Log Router
Enterprise v2.0 - Compliance and Activity Tracking API
"""
import logging
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.audit import AuditLog, AuditAction
from app.models.user import User
from app.schemas.audit import (
    AuditLogResponse,
    AuditLogList,
    AuditLogFilter,
    AuditStats
)
from app.services.auth import require_admin, get_current_user_required

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audit", tags=["audit"])


# ============================================================
# Utility Function: log_action
# ============================================================

async def log_action(
    db: AsyncSession,
    user: Optional[User],
    action: str,
    details: str,
    request: Optional[Request] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None
) -> AuditLog:
    """
    Log an audit action to the database.
    
    Call this from any router when a significant action occurs:
    - User authentication (login, logout, failed attempts)
    - Resource creation/modification/deletion
    - Configuration changes
    - Export operations
    
    Args:
        db: Database session
        user: User performing the action (None for system actions)
        action: Action type from AuditAction constants
        details: Human-readable description of what happened
        request: FastAPI Request object to extract IP and user agent
        resource_type: Type of affected resource (camera, user, etc.)
        resource_id: ID of the affected resource
    
    Returns:
        Created AuditLog entry
    
    Example:
        await log_action(
            db=db,
            user=current_user,
            action=AuditAction.CAMERA_DELETE,
            details=f"Deleted camera '{camera.name}' (ID: {camera.id})",
            request=request,
            resource_type="camera",
            resource_id=str(camera.id)
        )
    """
    # Extract request info
    ip_address = None
    user_agent = None
    
    if request:
        # Get client IP (handle proxies)
        ip_address = request.client.host if request.client else None
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            ip_address = forwarded_for.split(",")[0].strip()
        
        user_agent = request.headers.get("User-Agent", "")[:500]  # Truncate if too long
    
    # Create audit log entry
    audit_entry = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else "SYSTEM",
        action=action,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent,
        resource_type=resource_type,
        resource_id=resource_id
    )
    
    db.add(audit_entry)
    await db.flush()  # Get the ID without committing
    
    logger.info(f"[AUDIT] {audit_entry.username}: {action} - {details}")
    
    return audit_entry


# ============================================================
# API Endpoints
# ============================================================

@router.get("/", response_model=AuditLogList)
async def list_audit_logs(
    username: Optional[str] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    List audit logs with filtering and pagination.
    
    Admin only endpoint for compliance review and security auditing.
    """
    # Build query with filters
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))
    
    filters = []
    
    if username:
        filters.append(AuditLog.username.ilike(f"%{username}%"))
    
    if action:
        filters.append(AuditLog.action == action)
    
    if resource_type:
        filters.append(AuditLog.resource_type == resource_type)
    
    if start_time:
        filters.append(AuditLog.timestamp >= start_time)
    
    if end_time:
        filters.append(AuditLog.timestamp <= end_time)
    
    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))
    
    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Apply ordering and pagination
    query = query.order_by(AuditLog.timestamp.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    total_pages = (total + page_size - 1) // page_size
    
    return AuditLogList(
        items=[AuditLogResponse.model_validate(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/stats", response_model=AuditStats)
async def get_audit_stats(
    days: int = 7,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Get audit statistics for the specified period.
    
    Useful for compliance dashboards and security overview.
    """
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(days=days)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Total logs in period
    total_result = await db.execute(
        select(func.count(AuditLog.id)).where(
            AuditLog.timestamp >= start_time
        )
    )
    total_logs = total_result.scalar()
    
    # Logs today
    today_result = await db.execute(
        select(func.count(AuditLog.id)).where(
            AuditLog.timestamp >= today_start
        )
    )
    logs_today = today_result.scalar()
    
    # Unique users
    users_result = await db.execute(
        select(func.count(func.distinct(AuditLog.username))).where(
            AuditLog.timestamp >= start_time
        )
    )
    unique_users = users_result.scalar()
    
    # Actions breakdown
    actions_result = await db.execute(
        select(AuditLog.action, func.count(AuditLog.id)).where(
            AuditLog.timestamp >= start_time
        ).group_by(AuditLog.action)
    )
    actions_breakdown = {row[0]: row[1] for row in actions_result.all()}
    
    return AuditStats(
        total_logs=total_logs or 0,
        logs_today=logs_today or 0,
        unique_users=unique_users or 0,
        actions_breakdown=actions_breakdown,
        period_start=start_time,
        period_end=end_time
    )


@router.get("/actions")
async def list_action_types(
    current_user: User = Depends(require_admin)
):
    """
    List all available audit action types.
    
    Useful for building filter dropdowns in the UI.
    """
    return {
        "actions": [
            {"code": AuditAction.LOGIN, "label": "User Login", "category": "auth"},
            {"code": AuditAction.LOGOUT, "label": "User Logout", "category": "auth"},
            {"code": AuditAction.LOGIN_FAILED, "label": "Failed Login", "category": "auth"},
            {"code": AuditAction.CAMERA_CREATE, "label": "Camera Created", "category": "cameras"},
            {"code": AuditAction.CAMERA_UPDATE, "label": "Camera Updated", "category": "cameras"},
            {"code": AuditAction.CAMERA_DELETE, "label": "Camera Deleted", "category": "cameras"},
            {"code": AuditAction.RECORDING_DELETE, "label": "Recording Deleted", "category": "recordings"},
            {"code": AuditAction.RECORDING_EXPORT, "label": "Recording Exported", "category": "recordings"},
            {"code": AuditAction.USER_CREATE, "label": "User Created", "category": "users"},
            {"code": AuditAction.USER_UPDATE, "label": "User Updated", "category": "users"},
            {"code": AuditAction.USER_DELETE, "label": "User Deleted", "category": "users"},
            {"code": AuditAction.SETTINGS_UPDATE, "label": "Settings Changed", "category": "system"},
            {"code": AuditAction.MAP_CREATE, "label": "Map Created", "category": "maps"},
            {"code": AuditAction.MAP_UPDATE, "label": "Map Updated", "category": "maps"},
            {"code": AuditAction.MAP_DELETE, "label": "Map Deleted", "category": "maps"},
            {"code": AuditAction.PTZ_CONTROL, "label": "PTZ Control", "category": "ptz"},
            {"code": AuditAction.EVENT_ACKNOWLEDGE, "label": "Event Acknowledged", "category": "events"},
            {"code": AuditAction.EVENT_EXPORT, "label": "Event Exported", "category": "events"},
        ]
    }


@router.get("/{log_id}", response_model=AuditLogResponse)
async def get_audit_log(
    log_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get a specific audit log entry."""
    result = await db.execute(
        select(AuditLog).where(AuditLog.id == log_id)
    )
    log = result.scalar_one_or_none()
    
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit log with id {log_id} not found"
        )
    
    return AuditLogResponse.model_validate(log)
