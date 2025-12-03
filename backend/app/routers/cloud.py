"""
TitanNVR - Cloud Storage Router
Google Drive integration via Rclone with OAuth wizard
"""
import logging
import subprocess
import json
import os
import tempfile
from typing import Optional
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.settings import SystemSettings
from app.models.user import User
from app.services.auth import get_current_user_required, require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cloud", tags=["cloud"])

# Rclone config path
RCLONE_CONFIG_DIR = Path("/app/storage/rclone")
RCLONE_CONFIG_PATH = RCLONE_CONFIG_DIR / "rclone.conf"

# OAuth credentials storage path
OAUTH_CREDS_PATH = RCLONE_CONFIG_DIR / "oauth_creds.json"

def get_oauth_credentials() -> dict | None:
    """Get stored OAuth credentials."""
    if OAUTH_CREDS_PATH.exists():
        try:
            return json.loads(OAUTH_CREDS_PATH.read_text())
        except:
            pass
    return None

def save_oauth_credentials(client_id: str, client_secret: str):
    """Save OAuth credentials."""
    ensure_rclone_config_dir()
    OAUTH_CREDS_PATH.write_text(json.dumps({
        "client_id": client_id,
        "client_secret": client_secret
    }))

def delete_oauth_credentials():
    """Delete stored OAuth credentials and rclone config."""
    if OAUTH_CREDS_PATH.exists():
        OAUTH_CREDS_PATH.unlink()
    if RCLONE_CONFIG_PATH.exists():
        RCLONE_CONFIG_PATH.unlink()


# ============================================================
# Schemas
# ============================================================

class DriveStatus(BaseModel):
    """Google Drive connection status."""
    connected: bool
    email: Optional[str] = None
    remote_name: str = "drive"
    folder: str = "TitanNVR_Backups"
    oauth_configured: bool = False


class DriveAuthRequest(BaseModel):
    """Request to start OAuth flow."""
    client_id: Optional[str] = None
    client_secret: Optional[str] = None


class OAuthCredentialsRequest(BaseModel):
    """Request to save OAuth credentials."""
    client_id: str
    client_secret: str


class OAuthCredentialsStatus(BaseModel):
    """OAuth credentials status."""
    configured: bool
    client_id_preview: Optional[str] = None


class DriveAuthResponse(BaseModel):
    """Response with Google OAuth URL."""
    auth_url: str
    instructions: str


class DriveVerifyRequest(BaseModel):
    """Request to verify OAuth code."""
    code: str


class DriveTestUploadResponse(BaseModel):
    """Response from test upload."""
    success: bool
    message: str
    filename: Optional[str] = None


class DriveDisconnectResponse(BaseModel):
    """Response from disconnect."""
    success: bool
    message: str


# ============================================================
# Helper Functions
# ============================================================

def ensure_rclone_config_dir():
    """Ensure rclone config directory exists."""
    RCLONE_CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def run_rclone(args: list, timeout: int = 30) -> tuple[int, str, str]:
    """
    Run rclone command and return (returncode, stdout, stderr).
    """
    cmd = ["rclone"] + args + ["--config", str(RCLONE_CONFIG_PATH)]
    logger.info(f"Running: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Command timed out"
    except Exception as e:
        return -1, "", str(e)


def is_drive_configured() -> bool:
    """Check if Google Drive remote is configured in rclone."""
    if not RCLONE_CONFIG_PATH.exists():
        return False
    
    code, stdout, _ = run_rclone(["listremotes"])
    return code == 0 and "drive:" in stdout


def get_drive_config() -> Optional[dict]:
    """Get Drive configuration from rclone config file."""
    if not RCLONE_CONFIG_PATH.exists():
        return None
    
    try:
        content = RCLONE_CONFIG_PATH.read_text()
        if "[drive]" not in content:
            return None
        
        config = {}
        in_drive_section = False
        
        for line in content.split("\n"):
            line = line.strip()
            if line == "[drive]":
                in_drive_section = True
                continue
            elif line.startswith("[") and in_drive_section:
                break
            elif in_drive_section and "=" in line:
                key, value = line.split("=", 1)
                config[key.strip()] = value.strip()
        
        return config if config else None
    except Exception as e:
        logger.error(f"Error reading rclone config: {e}")
        return None


# ============================================================
# Endpoints
# ============================================================

@router.get("/drive/status", response_model=DriveStatus)
async def get_drive_status(
    admin: User = Depends(require_admin)
):
    """
    Get Google Drive connection status.
    
    Returns whether Drive is connected and configuration details.
    """
    ensure_rclone_config_dir()
    
    connected = is_drive_configured()
    email = None
    oauth_creds = get_oauth_credentials()
    
    if connected:
        # Try to get user email from about info
        code, stdout, _ = run_rclone(["about", "drive:", "--json"], timeout=10)
        if code == 0:
            try:
                about = json.loads(stdout)
                email = about.get("user", {}).get("emailAddress")
            except:
                pass
    
    return DriveStatus(
        connected=connected,
        email=email,
        remote_name="drive",
        folder="TitanNVR_Backups",
        oauth_configured=oauth_creds is not None
    )


@router.get("/drive/oauth-status", response_model=OAuthCredentialsStatus)
async def get_oauth_status(
    admin: User = Depends(require_admin)
):
    """
    Get OAuth credentials status.
    """
    creds = get_oauth_credentials()
    if creds:
        # Show partial client_id for verification
        client_id = creds.get("client_id", "")
        preview = client_id[:20] + "..." if len(client_id) > 20 else client_id
        return OAuthCredentialsStatus(configured=True, client_id_preview=preview)
    return OAuthCredentialsStatus(configured=False)


@router.post("/drive/oauth-credentials")
async def save_oauth_credentials_endpoint(
    request: OAuthCredentialsRequest,
    admin: User = Depends(require_admin)
):
    """
    Save OAuth credentials for Google Drive.
    
    Users must create their own OAuth credentials in Google Cloud Console:
    1. Go to https://console.cloud.google.com/apis/credentials
    2. Create OAuth 2.0 Client ID (Desktop app)
    3. Copy Client ID and Client Secret here
    """
    if not request.client_id or not request.client_secret:
        raise HTTPException(status_code=400, detail="Client ID y Secret son requeridos")
    
    if not request.client_id.endswith(".apps.googleusercontent.com"):
        raise HTTPException(
            status_code=400, 
            detail="Client ID inválido. Debe terminar en .apps.googleusercontent.com"
        )
    
    save_oauth_credentials(request.client_id, request.client_secret)
    logger.info(f"OAuth credentials saved by {admin.username}")
    
    return {"success": True, "message": "Credenciales OAuth guardadas"}


@router.delete("/drive/oauth-credentials")
async def delete_oauth_credentials_endpoint(
    admin: User = Depends(require_admin)
):
    """
    Delete stored OAuth credentials to allow reconfiguration.
    """
    delete_oauth_credentials()
    logger.info(f"OAuth credentials deleted by {admin.username}")
    
    return {"success": True, "message": "Credenciales eliminadas"}


@router.post("/drive/auth", response_model=DriveAuthResponse)
async def start_drive_auth(
    admin: User = Depends(require_admin)
):
    """
    Start Google Drive OAuth flow.
    
    Returns the authorization URL for the user to visit and authorize.
    The user will receive a code to paste back.
    Requires OAuth credentials to be configured first.
    """
    ensure_rclone_config_dir()
    
    # Get stored OAuth credentials
    oauth_creds = get_oauth_credentials()
    if not oauth_creds:
        raise HTTPException(
            status_code=400,
            detail="Primero configura las credenciales OAuth de Google"
        )
    
    client_id = oauth_creds["client_id"]
    
    # Generate OAuth URL - use localhost redirect for desktop app flow
    redirect_uri = "http://localhost:8000/api/cloud/drive/callback"
    auth_url = (
        f"https://accounts.google.com/o/oauth2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=https://www.googleapis.com/auth/drive"
        f"&access_type=offline"
        f"&prompt=consent"
    )
    
    return DriveAuthResponse(
        auth_url=auth_url,
        instructions=(
            "1. Haz clic en 'Autorizar con Google'\n"
            "2. Inicia sesión con tu cuenta de Google\n"
            "3. Permite el acceso a Google Drive\n"
            "4. El código aparecerá automáticamente"
        )
    )


@router.get("/drive/callback", response_class=HTMLResponse)
async def drive_oauth_callback(
    code: str = Query(None),
    error: str = Query(None)
):
    """
    OAuth callback endpoint - receives code from Google and shows it to user.
    """
    if error:
        return HTMLResponse(f"""
        <!DOCTYPE html>
        <html>
        <head><title>Error de Autorización</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">❌ Error de Autorización</h1>
            <p>{error}</p>
            <p>Cierra esta ventana y vuelve a intentar.</p>
        </body>
        </html>
        """)
    
    if not code:
        return HTMLResponse("""
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">❌ No se recibió código</h1>
            <p>Cierra esta ventana y vuelve a intentar.</p>
        </body>
        </html>
        """)
    
    return HTMLResponse(f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Autorización Exitosa - TitanNVR</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                   text-align: center; padding: 50px; background: #18181b; color: #fafafa; }}
            .code {{ background: #27272a; padding: 15px 25px; border-radius: 8px; 
                    font-family: monospace; font-size: 14px; margin: 20px auto;
                    max-width: 500px; word-break: break-all; border: 1px solid #3f3f46; }}
            .success {{ color: #22c55e; }}
            button {{ background: #3b82f6; color: white; border: none; padding: 12px 24px;
                     border-radius: 6px; cursor: pointer; font-size: 16px; margin-top: 15px; }}
            button:hover {{ background: #2563eb; }}
            .copied {{ color: #22c55e; margin-top: 10px; }}
        </style>
    </head>
    <body>
        <h1 class="success">✅ Autorización Exitosa</h1>
        <p>Copia este código y pégalo en TitanNVR:</p>
        <div class="code" id="code">{code}</div>
        <button onclick="copyCode()">📋 Copiar Código</button>
        <p id="copied" class="copied" style="display: none;">¡Código copiado! Puedes cerrar esta ventana.</p>
        <script>
            function copyCode() {{
                navigator.clipboard.writeText('{code}');
                document.getElementById('copied').style.display = 'block';
            }}
        </script>
    </body>
    </html>
    """)


@router.post("/drive/verify")
async def verify_drive_auth(
    request: DriveVerifyRequest,
    admin: User = Depends(require_admin)
):
    """
    Verify OAuth code and configure rclone remote.
    
    Takes the authorization code from Google and creates the rclone config.
    """
    ensure_rclone_config_dir()
    
    if not request.code or len(request.code) < 10:
        raise HTTPException(
            status_code=400, 
            detail="Código de autorización inválido"
        )
    
    # Get stored OAuth credentials
    oauth_creds = get_oauth_credentials()
    if not oauth_creds:
        raise HTTPException(
            status_code=400,
            detail="Credenciales OAuth no configuradas"
        )
    
    client_id = oauth_creds["client_id"]
    client_secret = oauth_creds["client_secret"]
    
    # Exchange code for token
    try:
        import httpx
        
        # Exchange authorization code for tokens
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": request.code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": "http://localhost:8000/api/cloud/drive/callback",
                    "grant_type": "authorization_code"
                },
                timeout=30
            )
        
        if token_response.status_code != 200:
            error_data = token_response.json()
            error_msg = error_data.get("error_description", "Error de autenticación")
            logger.warning(f"Token exchange failed: {error_data}")
            raise HTTPException(status_code=400, detail=error_msg)
        
        token_data = token_response.json()
        
        # Create rclone config with token
        token_json = json.dumps({
            "access_token": token_data["access_token"],
            "token_type": "Bearer",
            "refresh_token": token_data.get("refresh_token", ""),
            "expiry": datetime.utcnow().isoformat() + "Z"
        })
        
        config_content = f"""[drive]
type = drive
client_id = {client_id}
client_secret = {client_secret}
scope = drive
token = {token_json}
team_drive = 
"""
        
        RCLONE_CONFIG_PATH.write_text(config_content)
        logger.info(f"Rclone config created at {RCLONE_CONFIG_PATH}")
        
        # Verify connection works (first connection may take longer)
        code, stdout, stderr = run_rclone(["lsd", "drive:"], timeout=60)
        
        if code != 0:
            logger.warning(f"Drive verification failed: {stderr}")
            RCLONE_CONFIG_PATH.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=f"Conexión fallida: {stderr}. Intenta autorizar nuevamente."
            )
        
        # Create backup folder
        run_rclone(["mkdir", "drive:TitanNVR_Backups"], timeout=30)
        
        logger.info(f"Google Drive connected successfully by {admin.username}")
        
        return {
            "success": True,
            "message": "Google Drive conectado exitosamente"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Drive auth error: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.post("/drive/test-upload", response_model=DriveTestUploadResponse)
async def test_drive_upload(
    admin: User = Depends(require_admin)
):
    """
    Test Google Drive connection by uploading a test file.
    
    Creates a small test file and uploads it to the TitanNVR_Backups folder.
    This verifies that read/write access is working.
    """
    if not is_drive_configured():
        raise HTTPException(
            status_code=400,
            detail="Google Drive no está configurado"
        )
    
    # Create test file
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"test_titan_{timestamp}.txt"
    
    test_content = f"""TitanNVR - Test de Conexión a Google Drive
============================================

Este archivo fue creado para verificar la conexión.
Fecha: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
Usuario: {admin.username}

Si puedes ver este archivo en tu Google Drive,
la configuración de nube está funcionando correctamente.

Puedes eliminar este archivo de forma segura.
"""
    
    # Create temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(test_content)
        temp_path = f.name
    
    try:
        # Upload to Drive
        remote_path = f"drive:TitanNVR_Backups/{filename}"
        
        code, stdout, stderr = run_rclone(
            ["copy", temp_path, "drive:TitanNVR_Backups/"],
            timeout=60
        )
        
        if code != 0:
            logger.warning(f"Test upload failed: {stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"Error al subir archivo: {stderr}"
            )
        
        # Verify file exists (optional - don't fail if verification times out)
        code, stdout, stderr = run_rclone(
            ["ls", remote_path],
            timeout=30
        )
        
        verified = code == 0
        
        logger.info(f"Test file uploaded: {filename} (verified: {verified})")
        
        return DriveTestUploadResponse(
            success=True,
            message=f"Archivo '{filename}' subido correctamente a TitanNVR_Backups/" + 
                   (" ✓ Verificado" if verified else " (verificación tardó demasiado, pero el archivo debería estar)"),
            filename=filename
        )
        
    finally:
        # Clean up temp file
        try:
            os.unlink(temp_path)
        except:
            pass


@router.post("/drive/disconnect", response_model=DriveDisconnectResponse)
async def disconnect_drive(
    admin: User = Depends(require_admin)
):
    """
    Disconnect Google Drive by removing rclone configuration.
    """
    try:
        if RCLONE_CONFIG_PATH.exists():
            # Read current config and remove only [drive] section
            content = RCLONE_CONFIG_PATH.read_text()
            
            # Simple removal - if only drive is configured, delete file
            if content.strip().startswith("[drive]"):
                RCLONE_CONFIG_PATH.unlink()
            else:
                # Keep other remotes, remove drive section
                lines = content.split("\n")
                new_lines = []
                in_drive_section = False
                
                for line in lines:
                    if line.strip() == "[drive]":
                        in_drive_section = True
                        continue
                    elif line.strip().startswith("[") and in_drive_section:
                        in_drive_section = False
                    
                    if not in_drive_section:
                        new_lines.append(line)
                
                RCLONE_CONFIG_PATH.write_text("\n".join(new_lines))
        
        logger.info(f"Google Drive disconnected by {admin.username}")
        
        return DriveDisconnectResponse(
            success=True,
            message="Google Drive desvinculado exitosamente"
        )
        
    except Exception as e:
        logger.error(f"Error disconnecting Drive: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/drive/config")
async def get_drive_config_endpoint(
    admin: User = Depends(require_admin)
):
    """
    Get current Drive configuration (for debugging).
    Does not expose sensitive tokens.
    """
    config = get_drive_config()
    
    if not config:
        return {"configured": False}
    
    # Sanitize - don't expose tokens
    return {
        "configured": True,
        "type": config.get("type", "drive"),
        "scope": config.get("scope", "drive"),
        "has_token": "token" in config
    }
