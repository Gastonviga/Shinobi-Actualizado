"""
TitanNVR - Backup & Restore System
Export and import system configuration for disaster recovery
"""
import json
import logging
from datetime import datetime
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
import io

from app.database import get_db
from app.models.camera import Camera, CameraSchedule
from app.models.user import User
from app.models.settings import SystemSettings
from app.models.map import Map
from app.services.auth import require_admin
from app.services.stream_manager import stream_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/system/backup", tags=["backup"])

BACKUP_VERSION = "2.5"


# ============================================================
# Schemas
# ============================================================

class BackupMetadata(BaseModel):
    """Backup file metadata."""
    version: str
    timestamp: str
    cameras_count: int
    users_count: int
    settings_count: int
    maps_count: int


class ImportOptions(BaseModel):
    """Options for importing backup."""
    mode: Literal["merge", "replace"] = "merge"
    skip_admin: bool = True  # Don't overwrite current admin user


class ImportResult(BaseModel):
    """Result of import operation."""
    success: bool
    message: str
    cameras_imported: int = 0
    users_imported: int = 0
    settings_imported: int = 0
    maps_imported: int = 0
    errors: list[str] = []


# ============================================================
# Helper Functions
# ============================================================

def serialize_camera(camera: Camera) -> dict:
    """Serialize camera to dict for export."""
    return {
        "id": camera.id,
        "name": camera.name,
        "main_stream_url": camera.main_stream_url,
        "sub_stream_url": camera.sub_stream_url,
        "is_recording": camera.is_recording,
        "is_active": camera.is_active,
        "location": camera.location,
        "group": camera.group,
        "retention_days": camera.retention_days,
        "recording_mode": camera.recording_mode.value if camera.recording_mode else "motion",
        "event_retention_days": camera.event_retention_days,
        "zones_config": camera.zones_config,
        "features_ptz": camera.features_ptz,
        "map_id": camera.map_id,
        "map_x": camera.map_x,
        "map_y": camera.map_y,
    }


def serialize_user(user: User) -> dict:
    """Serialize user to dict for export (excludes password hash for security)."""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, 'value') else user.role,
        "is_active": user.is_active,
        "receive_email_alerts": user.receive_email_alerts,
        # Note: password hash is NOT exported for security
    }


def serialize_setting(setting: SystemSettings) -> dict:
    """Serialize system setting to dict for export."""
    return {
        "id": setting.id,
        "key": setting.key,
        "value": setting.value,
        "value_json": setting.value_json,
        "description": setting.description,
    }


def serialize_map(map_obj: Map) -> dict:
    """Serialize map to dict for export."""
    return {
        "id": map_obj.id,
        "name": map_obj.name,
        "image_path": map_obj.image_path,
        "description": map_obj.description,
    }


# ============================================================
# Export Endpoint
# ============================================================

@router.get("/export")
async def export_backup(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Export complete system configuration as JSON file.
    
    Includes: Cameras, Users (without passwords), Settings, Maps.
    Returns downloadable JSON file.
    """
    logger.info(f"📦 Backup export initiated by user: {current_user.username}")
    
    try:
        # Fetch all data
        cameras_result = await db.execute(select(Camera))
        cameras = cameras_result.scalars().all()
        
        users_result = await db.execute(select(User))
        users = users_result.scalars().all()
        
        settings_result = await db.execute(select(SystemSettings))
        settings = settings_result.scalars().all()
        
        maps_result = await db.execute(select(Map))
        maps = maps_result.scalars().all()
        
        # Build backup structure
        backup_data = {
            "version": BACKUP_VERSION,
            "timestamp": datetime.now().isoformat(),
            "exported_by": current_user.username,
            "cameras": [serialize_camera(c) for c in cameras],
            "users": [serialize_user(u) for u in users],
            "settings": [serialize_setting(s) for s in settings],
            "maps": [serialize_map(m) for m in maps],
        }
        
        # Create filename with date
        date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"backup_titannvr_{date_str}.json"
        
        # Convert to JSON string
        json_content = json.dumps(backup_data, indent=2, ensure_ascii=False)
        
        logger.info(f"✅ Backup created: {len(cameras)} cameras, {len(users)} users, {len(settings)} settings, {len(maps)} maps")
        
        # Return as downloadable file
        return StreamingResponse(
            io.BytesIO(json_content.encode('utf-8')),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except Exception as e:
        logger.error(f"❌ Backup export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating backup: {str(e)}")


# ============================================================
# Import Endpoint
# ============================================================

@router.post("/import", response_model=ImportResult)
async def import_backup(
    file: UploadFile = File(...),
    mode: Literal["merge", "replace"] = Query("merge", description="Import mode: merge or replace"),
    skip_admin: bool = Query(True, description="Skip importing admin user"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Import system configuration from JSON backup file.
    
    Modes:
    - merge: Update existing records, create new ones
    - replace: Delete all existing data and restore from backup (DANGEROUS!)
    
    Note: User passwords are NOT imported - users will need to reset passwords.
    """
    logger.info(f"📥 Backup import initiated by user: {current_user.username} (mode: {mode})")
    
    errors: list[str] = []
    cameras_imported = 0
    users_imported = 0
    settings_imported = 0
    maps_imported = 0
    
    try:
        # Read and parse file
        content = await file.read()
        try:
            backup_data = json.loads(content.decode('utf-8'))
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON file")
        
        # Validate structure
        if "version" not in backup_data:
            raise HTTPException(status_code=400, detail="Invalid backup file: missing version")
        
        if "cameras" not in backup_data:
            raise HTTPException(status_code=400, detail="Invalid backup file: missing cameras data")
        
        logger.info(f"📄 Backup version: {backup_data.get('version')}, timestamp: {backup_data.get('timestamp')}")
        
        # REPLACE MODE: Clear existing data first
        if mode == "replace":
            logger.warning("⚠️ REPLACE MODE: Clearing existing data...")
            
            # Delete in correct order (foreign key dependencies)
            await db.execute(delete(CameraSchedule))
            await db.execute(delete(Camera))
            await db.execute(delete(Map))
            await db.execute(delete(SystemSettings))
            # Don't delete current admin user
            if not skip_admin:
                await db.execute(delete(User).where(User.id != current_user.id))
            
            await db.commit()
            logger.info("✓ Existing data cleared")
        
        # Import Maps first (cameras may reference them)
        for map_data in backup_data.get("maps", []):
            try:
                if mode == "merge":
                    # Check if exists by name
                    existing = await db.execute(
                        select(Map).where(Map.name == map_data["name"])
                    )
                    existing_map = existing.scalar_one_or_none()
                    
                    if existing_map:
                        # Update existing
                        existing_map.image_path = map_data.get("image_path", "")
                        existing_map.description = map_data.get("description")
                    else:
                        # Create new (without ID to let DB assign)
                        new_map = Map(
                            name=map_data["name"],
                            image_path=map_data.get("image_path", ""),
                            description=map_data.get("description")
                        )
                        db.add(new_map)
                else:
                    # Replace mode: create all
                    new_map = Map(
                        name=map_data["name"],
                        image_path=map_data.get("image_path", ""),
                        description=map_data.get("description")
                    )
                    db.add(new_map)
                
                maps_imported += 1
            except Exception as e:
                errors.append(f"Map '{map_data.get('name', 'unknown')}': {str(e)}")
        
        await db.commit()
        
        # Import Settings
        for setting_data in backup_data.get("settings", []):
            try:
                if mode == "merge":
                    existing = await db.execute(
                        select(SystemSettings).where(SystemSettings.key == setting_data["key"])
                    )
                    existing_setting = existing.scalar_one_or_none()
                    
                    if existing_setting:
                        existing_setting.value = setting_data.get("value")
                        existing_setting.value_json = setting_data.get("value_json")
                        existing_setting.description = setting_data.get("description")
                    else:
                        new_setting = SystemSettings(
                            key=setting_data["key"],
                            value=setting_data.get("value"),
                            value_json=setting_data.get("value_json"),
                            description=setting_data.get("description")
                        )
                        db.add(new_setting)
                else:
                    new_setting = SystemSettings(
                        key=setting_data["key"],
                        value=setting_data.get("value"),
                        value_json=setting_data.get("value_json"),
                        description=setting_data.get("description")
                    )
                    db.add(new_setting)
                
                settings_imported += 1
            except Exception as e:
                errors.append(f"Setting '{setting_data.get('key', 'unknown')}': {str(e)}")
        
        await db.commit()
        
        # Import Users (without passwords)
        for user_data in backup_data.get("users", []):
            try:
                # Skip admin user if requested
                if skip_admin and user_data.get("username") == "admin":
                    continue
                
                # Skip current user
                if user_data.get("username") == current_user.username:
                    continue
                
                if mode == "merge":
                    existing = await db.execute(
                        select(User).where(User.username == user_data["username"])
                    )
                    existing_user = existing.scalar_one_or_none()
                    
                    if existing_user:
                        existing_user.email = user_data.get("email")
                        existing_user.role = user_data.get("role", "viewer")
                        existing_user.is_active = user_data.get("is_active", True)
                        existing_user.receive_email_alerts = user_data.get("receive_email_alerts", True)
                    else:
                        # Create user without password (will need reset)
                        from passlib.context import CryptContext
                        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
                        
                        new_user = User(
                            username=user_data["username"],
                            email=user_data.get("email"),
                            hashed_password=pwd_context.hash("changeme123"),  # Temporary password
                            role=user_data.get("role", "viewer"),
                            is_active=user_data.get("is_active", True),
                            receive_email_alerts=user_data.get("receive_email_alerts", True)
                        )
                        db.add(new_user)
                        errors.append(f"User '{user_data['username']}' created with temporary password 'changeme123'")
                else:
                    from passlib.context import CryptContext
                    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
                    
                    new_user = User(
                        username=user_data["username"],
                        email=user_data.get("email"),
                        hashed_password=pwd_context.hash("changeme123"),
                        role=user_data.get("role", "viewer"),
                        is_active=user_data.get("is_active", True),
                        receive_email_alerts=user_data.get("receive_email_alerts", True)
                    )
                    db.add(new_user)
                    errors.append(f"User '{user_data['username']}' created with temporary password 'changeme123'")
                
                users_imported += 1
            except Exception as e:
                errors.append(f"User '{user_data.get('username', 'unknown')}': {str(e)}")
        
        await db.commit()
        
        # Import Cameras
        from app.models.camera import RecordingMode
        
        for camera_data in backup_data.get("cameras", []):
            try:
                # Parse recording mode
                recording_mode_str = camera_data.get("recording_mode", "motion")
                try:
                    recording_mode = RecordingMode(recording_mode_str)
                except ValueError:
                    recording_mode = RecordingMode.MOTION
                
                if mode == "merge":
                    existing = await db.execute(
                        select(Camera).where(Camera.name == camera_data["name"])
                    )
                    existing_camera = existing.scalar_one_or_none()
                    
                    if existing_camera:
                        existing_camera.main_stream_url = camera_data["main_stream_url"]
                        existing_camera.sub_stream_url = camera_data.get("sub_stream_url")
                        existing_camera.is_active = camera_data.get("is_active", True)
                        existing_camera.location = camera_data.get("location")
                        existing_camera.group = camera_data.get("group")
                        existing_camera.retention_days = camera_data.get("retention_days", 7)
                        existing_camera.recording_mode = recording_mode
                        existing_camera.event_retention_days = camera_data.get("event_retention_days", 14)
                        existing_camera.zones_config = camera_data.get("zones_config")
                        existing_camera.features_ptz = camera_data.get("features_ptz", False)
                    else:
                        new_camera = Camera(
                            name=camera_data["name"],
                            main_stream_url=camera_data["main_stream_url"],
                            sub_stream_url=camera_data.get("sub_stream_url"),
                            is_active=camera_data.get("is_active", True),
                            is_recording=False,
                            location=camera_data.get("location"),
                            group=camera_data.get("group"),
                            retention_days=camera_data.get("retention_days", 7),
                            recording_mode=recording_mode,
                            event_retention_days=camera_data.get("event_retention_days", 14),
                            zones_config=camera_data.get("zones_config"),
                            features_ptz=camera_data.get("features_ptz", False)
                        )
                        db.add(new_camera)
                else:
                    new_camera = Camera(
                        name=camera_data["name"],
                        main_stream_url=camera_data["main_stream_url"],
                        sub_stream_url=camera_data.get("sub_stream_url"),
                        is_active=camera_data.get("is_active", True),
                        is_recording=False,
                        location=camera_data.get("location"),
                        group=camera_data.get("group"),
                        retention_days=camera_data.get("retention_days", 7),
                        recording_mode=recording_mode,
                        event_retention_days=camera_data.get("event_retention_days", 14),
                        zones_config=camera_data.get("zones_config"),
                        features_ptz=camera_data.get("features_ptz", False)
                    )
                    db.add(new_camera)
                
                cameras_imported += 1
            except Exception as e:
                errors.append(f"Camera '{camera_data.get('name', 'unknown')}': {str(e)}")
        
        await db.commit()
        
        # Sync cameras to Go2RTC
        logger.info("🔄 Syncing imported cameras to Go2RTC...")
        cameras_result = await db.execute(select(Camera).where(Camera.is_active == True))
        cameras = cameras_result.scalars().all()
        
        for camera in cameras:
            try:
                await stream_manager.register_stream(
                    name=camera.name,
                    main_stream_url=camera.main_stream_url,
                    sub_stream_url=camera.sub_stream_url
                )
            except Exception as e:
                errors.append(f"Go2RTC sync for '{camera.name}': {str(e)}")
        
        logger.info(f"✅ Import complete: {cameras_imported} cameras, {users_imported} users, {settings_imported} settings, {maps_imported} maps")
        
        return ImportResult(
            success=True,
            message=f"Backup imported successfully ({mode} mode)",
            cameras_imported=cameras_imported,
            users_imported=users_imported,
            settings_imported=settings_imported,
            maps_imported=maps_imported,
            errors=errors
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Backup import failed: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error importing backup: {str(e)}")


@router.get("/info", response_model=BackupMetadata)
async def get_backup_info(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Get information about what would be exported in a backup.
    """
    cameras_result = await db.execute(select(Camera))
    cameras_count = len(cameras_result.scalars().all())
    
    users_result = await db.execute(select(User))
    users_count = len(users_result.scalars().all())
    
    settings_result = await db.execute(select(SystemSettings))
    settings_count = len(settings_result.scalars().all())
    
    maps_result = await db.execute(select(Map))
    maps_count = len(maps_result.scalars().all())
    
    return BackupMetadata(
        version=BACKUP_VERSION,
        timestamp=datetime.now().isoformat(),
        cameras_count=cameras_count,
        users_count=users_count,
        settings_count=settings_count,
        maps_count=maps_count
    )
