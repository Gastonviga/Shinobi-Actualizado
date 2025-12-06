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

# Storage paths - detect if running in Docker or locally
import os

def get_storage_base() -> Path:
    """Get the base storage path based on environment."""
    # Check if running in Docker (path /app exists)
    if Path("/app/storage").exists():
        return Path("/app/storage")
    
    # Running locally - use project root /storage folder
    # Path: backend/app/routers/settings.py -> go up 4 levels to project root
    project_root = Path(__file__).parent.parent.parent.parent
    local_storage = project_root / "storage"
    local_storage.mkdir(parents=True, exist_ok=True)
    return local_storage

STORAGE_BASE = get_storage_base()
BRANDING_DIR = STORAGE_BASE / "branding"
LOGO_PATH = BRANDING_DIR / "logo.png"
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2MB

# Log the resolved path for debugging
logger.info(f"Storage base path: {STORAGE_BASE}")
logger.info(f"Logo path: {LOGO_PATH}")


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
    provider: str = "custom"  # "gmail" | "custom"
    host: str = ""
    port: int = 587
    username: str = ""
    password: str = ""
    from_email: str = ""
    use_tls: bool = True


class SmtpTestRequest(BaseModel):
    """Request for testing SMTP with optional live config."""
    provider: str = "gmail"  # "gmail" | "custom"
    email: str
    password: str
    # Only for custom provider
    host: str = ""
    port: int = 587
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
    logger.info(f"Saving logo to: {LOGO_PATH}")
    
    # Save file
    with open(LOGO_PATH, "wb") as f:
        f.write(contents)
    
    logger.info(f"Logo saved successfully. File exists: {LOGO_PATH.exists()}, Size: {LOGO_PATH.stat().st_size if LOGO_PATH.exists() else 0} bytes")
    
    # Update setting in DB (create if doesn't exist)
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "logo_url")
    )
    setting = result.scalar_one_or_none()
    
    if setting:
        setting.value = "/api/settings/logo"
    else:
        # Create the setting if it doesn't exist
        setting = SystemSettings(
            key="logo_url",
            value="/api/settings/logo",
            description="Custom logo URL"
        )
        db.add(setting)
    
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
    config: SmtpTestRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Test SMTP configuration by sending a real test email.
    
    Supports Gmail preset - if provider="gmail", automatically uses:
    - host: smtp.gmail.com
    - port: 587
    - use_tls: True
    
    Returns detailed error messages for troubleshooting.
    """
    import aiosmtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from datetime import datetime
    
    # Apply Gmail preset if needed
    if config.provider == "gmail":
        host = "smtp.gmail.com"
        port = 587
        use_tls = True
    else:
        host = config.host
        port = config.port
        use_tls = config.use_tls
    
    # Validate
    if not config.email:
        raise HTTPException(status_code=400, detail="Email es requerido")
    if not config.password:
        raise HTTPException(status_code=400, detail="Contraseña es requerida")
    if config.provider != "gmail" and not host:
        raise HTTPException(status_code=400, detail="Host SMTP es requerido para proveedor personalizado")
    
    # Build test email
    recipient = config.email  # Send to the configured email
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "✅ TitanNVR - Prueba de Conexión Exitosa"
    msg["From"] = config.email
    msg["To"] = recipient
    
    body_html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #10b981; margin: 0 0 20px;">✅ Conexión SMTP Exitosa</h2>
            <p>Tu configuración de notificaciones de TitanNVR está funcionando correctamente.</p>
            <table style="width: 100%; margin-top: 20px; font-size: 14px;">
                <tr>
                    <td style="padding: 8px 0; color: #666;">Servidor:</td>
                    <td style="padding: 8px 0; font-weight: bold;">{host}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #666;">Puerto:</td>
                    <td style="padding: 8px 0; font-weight: bold;">{port}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #666;">Fecha:</td>
                    <td style="padding: 8px 0; font-weight: bold;">{timestamp}</td>
                </tr>
            </table>
            <p style="margin-top: 20px; color: #888; font-size: 12px;">
                Ahora recibirás alertas de detección de movimiento y eventos.
            </p>
        </div>
    </body>
    </html>
    """
    
    msg.attach(MIMEText(body_html, "html"))
    
    try:
        await aiosmtplib.send(
            msg,
            hostname=host,
            port=port,
            username=config.email,
            password=config.password,
            start_tls=use_tls,
            timeout=15
        )
        
        logger.info(f"SMTP test successful for {config.email}")
        return {
            "success": True,
            "message": f"Email de prueba enviado a {recipient}",
            "details": f"Servidor: {host}:{port}"
        }
        
    except aiosmtplib.SMTPAuthenticationError as e:
        logger.warning(f"SMTP auth failed for {config.email}: {e}")
        error_msg = "Autenticación fallida. "
        if config.provider == "gmail":
            error_msg += "Verifica que estés usando una 'Contraseña de Aplicación' de Gmail, no tu contraseña normal."
        else:
            error_msg += "Usuario o contraseña incorrectos."
        raise HTTPException(status_code=401, detail=error_msg)
        
    except aiosmtplib.SMTPConnectError as e:
        logger.warning(f"SMTP connect failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"No se pudo conectar a {host}:{port}. Verifica el servidor y puerto."
        )
        
    except aiosmtplib.SMTPException as e:
        logger.error(f"SMTP error: {e}")
        raise HTTPException(status_code=500, detail=f"Error SMTP: {str(e)}")
        
    except Exception as e:
        logger.error(f"Unexpected SMTP error: {e}")
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")


@router.post("/smtp/save")
async def save_smtp_config(
    config: SmtpTestRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Save SMTP configuration after successful test.
    
    Applies Gmail preset automatically if provider="gmail".
    """
    # Apply Gmail preset
    if config.provider == "gmail":
        host = "smtp.gmail.com"
        port = 587
        use_tls = True
    else:
        host = config.host
        port = config.port
        use_tls = config.use_tls
    
    smtp_config = {
        "enabled": True,
        "provider": config.provider,
        "host": host,
        "port": port,
        "username": config.email,
        "password": config.password,
        "from_email": config.email,
        "use_tls": use_tls
    }
    
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "smtp_config")
    )
    setting = result.scalar_one_or_none()
    
    if setting:
        setting.value_json = smtp_config
    else:
        setting = SystemSettings(
            key="smtp_config",
            value_json=smtp_config,
            description="SMTP configuration for email notifications"
        )
        db.add(setting)
    
    await db.commit()
    
    logger.info(f"SMTP configuration saved by {admin.username}")
    
    return {
        "success": True,
        "message": "Configuración de notificaciones guardada"
    }


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
