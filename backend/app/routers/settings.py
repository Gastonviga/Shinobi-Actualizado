"""
TitanNVR - Settings Router
Enterprise system configuration and branding
"""
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from pathlib import Path
import logging
import shutil

from app.database import get_db
from app.models.settings import SystemSettings, DEFAULT_SETTINGS
from app.models.user import User
from app.services.auth import get_current_user_required, require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["settings"])

# Storage paths
BRANDING_DIR = Path("/app/storage/branding")
LOGO_PATH = BRANDING_DIR / "logo.png"
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2MB


# ============================================================
# Schemas
# ============================================================

class SettingResponse(BaseModel):
    """Single setting response."""
    key: str
    value: Optional[str]
    value_json: Optional[Dict[str, Any]]
    description: Optional[str]


class SettingUpdate(BaseModel):
    """Update a setting."""
    value: Optional[str] = None
    value_json: Optional[Dict[str, Any]] = None


class PublicSettings(BaseModel):
    """Public settings for frontend (no auth required)."""
    system_title: str
    theme_color: str
    logo_url: Optional[str]
    company_name: str


class SmtpConfig(BaseModel):
    """SMTP configuration for email notifications."""
    enabled: bool = False
    host: str = ""
    port: int = 587
    username: str = ""
    password: str = ""
    from_email: str = ""
    use_tls: bool = True


# ============================================================
# Public Endpoints (No Auth Required)
# ============================================================

@router.get("/public", response_model=PublicSettings)
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """
    Get public settings for frontend branding.
    
    No authentication required - used for login page and initial load.
    """
    settings = {}
    
    result = await db.execute(
        select(SystemSettings).where(
            SystemSettings.key.in_([
                "system_title", "theme_color", "logo_url", "company_name"
            ])
        )
    )
    
    for setting in result.scalars().all():
        settings[setting.key] = setting.value
    
    return PublicSettings(
        system_title=settings.get("system_title", "TitanNVR Enterprise"),
        theme_color=settings.get("theme_color", "#3B82F6"),
        logo_url="/api/settings/logo" if LOGO_PATH.exists() else None,
        company_name=settings.get("company_name", "Your Company")
    )


@router.get("/logo")
async def get_logo():
    """
    Get the custom logo image.
    Returns 404 if no custom logo is uploaded.
    """
    if not LOGO_PATH.exists():
        raise HTTPException(status_code=404, detail="No custom logo uploaded")
    
    return FileResponse(
        LOGO_PATH,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"}
    )


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload a custom logo image (admin only).
    
    - Accepts PNG/JPG up to 2MB
    - Saves to /app/storage/branding/logo.png
    """
    # Validate content type
    if file.content_type not in ["image/png", "image/jpeg", "image/jpg"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only PNG and JPG are allowed."
        )
    
    # Read and validate size
    contents = await file.read()
    if len(contents) > MAX_LOGO_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_LOGO_SIZE // (1024*1024)}MB."
        )
    
    # Create directory if not exists
    BRANDING_DIR.mkdir(parents=True, exist_ok=True)
    
    # Save file
    with open(LOGO_PATH, "wb") as f:
        f.write(contents)
    
    # Update setting in DB
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "logo_url")
    )
    setting = result.scalar_one_or_none()
    
    if setting:
        setting.value = "/api/settings/logo"
        await db.commit()
    
    logger.info(f"Logo uploaded by {admin.username}")
    
    return {"status": "ok", "message": "Logo uploaded successfully", "url": "/api/settings/logo"}


@router.delete("/logo")
async def delete_logo(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Delete the custom logo (admin only)."""
    if LOGO_PATH.exists():
        LOGO_PATH.unlink()
    
    # Clear setting in DB
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "logo_url")
    )
    setting = result.scalar_one_or_none()
    
    if setting:
        setting.value = None
        await db.commit()
    
    logger.info(f"Logo deleted by {admin.username}")
    
    return {"status": "ok", "message": "Logo deleted successfully"}


# ============================================================
# Admin Endpoints
# ============================================================

@router.get("/", response_model=List[SettingResponse])
async def list_settings(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """List all system settings (admin only)."""
    result = await db.execute(select(SystemSettings).order_by(SystemSettings.key))
    settings = result.scalars().all()
    
    return [
        SettingResponse(
            key=s.key,
            value=s.value,
            value_json=s.value_json,
            description=s.description
        ) for s in settings
    ]


@router.get("/{key}", response_model=SettingResponse)
async def get_setting(
    key: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific setting by key (admin only)."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    return SettingResponse(
        key=setting.key,
        value=setting.value,
        value_json=setting.value_json,
        description=setting.description
    )


@router.put("/{key}", response_model=SettingResponse)
async def update_setting(
    key: str,
    data: SettingUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update a system setting (admin only)."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    if data.value is not None:
        setting.value = data.value
    if data.value_json is not None:
        setting.value_json = data.value_json
    
    await db.commit()
    await db.refresh(setting)
    
    logger.info(f"Setting '{key}' updated by {admin.username}")
    
    return SettingResponse(
        key=setting.key,
        value=setting.value,
        value_json=setting.value_json,
        description=setting.description
    )


@router.put("/smtp/config", response_model=SettingResponse)
async def update_smtp_config(
    config: SmtpConfig,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update SMTP configuration (admin only)."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "smtp_config")
    )
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(status_code=404, detail="SMTP config not found")
    
    setting.value_json = config.dict()
    await db.commit()
    await db.refresh(setting)
    
    logger.info(f"SMTP configuration updated by {admin.username}")
    
    return SettingResponse(
        key=setting.key,
        value=setting.value,
        value_json=setting.value_json,
        description=setting.description
    )


@router.post("/smtp/test")
async def test_smtp(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Test SMTP configuration by sending a test email."""
    from app.services.notification import notification_service
    
    # Load config
    await notification_service.load_config(db)
    
    if not notification_service._initialized:
        raise HTTPException(
            status_code=400,
            detail="SMTP not configured or not enabled"
        )
    
    # Send test email
    success = await notification_service.send_email(
        to_emails=[admin.email] if admin.email else [],
        subject="TitanNVR - Test Email",
        body_html="""
        <html>
        <body>
            <h2>✅ TitanNVR Email Test</h2>
            <p>If you received this email, your SMTP configuration is working correctly.</p>
        </body>
        </html>
        """
    )
    
    if success:
        return {"status": "ok", "message": "Test email sent successfully"}
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to send test email. Check SMTP configuration."
        )


# ============================================================
# Initialize Default Settings
# ============================================================

async def init_default_settings(db: AsyncSession) -> None:
    """Initialize default settings if they don't exist."""
    for default in DEFAULT_SETTINGS:
        result = await db.execute(
            select(SystemSettings).where(SystemSettings.key == default["key"])
        )
        existing = result.scalar_one_or_none()
        
        if not existing:
            setting = SystemSettings(
                key=default["key"],
                value=default.get("value"),
                value_json=default.get("value_json"),
                description=default.get("description")
            )
            db.add(setting)
            logger.info(f"Created default setting: {default['key']}")
    
    await db.commit()
