"""
TitanNVR - Incident/Evidence Export Router
Legal-grade evidence packaging with chain of custody
"""
import os
import json
import hashlib
import shutil
import zipfile
import tempfile
from datetime import datetime
from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import logging
import aiofiles
import aiofiles.os

from app.database import get_db
from app.models.user import User
from app.models.event import Event
from app.models.audit import AuditAction
from app.routers.audit import log_action
from app.services.auth import get_current_user_required, require_operator_or_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/export", tags=["evidence-export"])

# Storage for generated exports
EXPORTS_DIR = Path("/storage/exports") if os.path.exists("/storage") else Path("./storage/exports")
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================
# Schemas
# ============================================================

class ExportRequest(BaseModel):
    """Request to export evidence package."""
    event_ids: List[str]
    case_name: str
    case_number: Optional[str] = None
    operator_notes: Optional[str] = None
    include_snapshots: bool = True
    include_clips: bool = True
    password_protect: bool = False


class FileManifestEntry(BaseModel):
    """Single file in the evidence manifest."""
    filename: str
    original_path: str
    file_type: str  # "clip", "snapshot", "report"
    size_bytes: int
    sha256_hash: str
    event_id: Optional[str] = None


class ExportManifest(BaseModel):
    """Complete export manifest for chain of custody."""
    export_id: str
    case_name: str
    case_number: Optional[str]
    created_at: str
    created_by: str
    created_by_role: str
    operator_notes: Optional[str]
    event_count: int
    file_count: int
    total_size_bytes: int
    files: List[FileManifestEntry]
    integrity_hash: str  # SHA-256 of all file hashes combined


class ExportResponse(BaseModel):
    """Response after creating export."""
    export_id: str
    case_name: str
    download_url: str
    file_count: int
    total_size_mb: float
    created_at: str
    expires_at: str  # Exports expire after 24 hours


class ExportListItem(BaseModel):
    """Item in the exports list."""
    export_id: str
    case_name: str
    case_number: Optional[str]
    created_at: str
    created_by: str
    file_count: int
    size_mb: float
    download_url: str


# ============================================================
# Helper Functions
# ============================================================

def calculate_sha256(file_path: str) -> str:
    """Calculate SHA-256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def generate_export_id() -> str:
    """Generate unique export ID."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    random_suffix = hashlib.md5(str(datetime.now().timestamp()).encode()).hexdigest()[:6]
    return f"EXP_{timestamp}_{random_suffix}"


async def get_frigate_media_path(event_id: str, media_type: str) -> Optional[str]:
    """
    Get the path to Frigate media files.
    
    Args:
        event_id: Frigate event ID
        media_type: "clip" or "snapshot"
    
    Returns:
        Path to the media file if it exists
    """
    # Frigate stores media in /media/frigate/clips and /media/frigate/snapshots
    frigate_base = Path("/media/frigate") if os.path.exists("/media/frigate") else Path("./media/frigate")
    
    if media_type == "clip":
        # Clips are stored as {camera}-{event_id}.mp4
        clips_dir = frigate_base / "clips"
        if clips_dir.exists():
            for clip_file in clips_dir.glob(f"*{event_id}*.mp4"):
                return str(clip_file)
    elif media_type == "snapshot":
        # Snapshots are stored as {camera}-{event_id}.jpg
        snapshots_dir = frigate_base / "clips"  # Frigate stores snapshots in clips folder too
        if snapshots_dir.exists():
            for snap_file in snapshots_dir.glob(f"*{event_id}*.jpg"):
                return str(snap_file)
    
    return None


async def cleanup_old_exports():
    """Remove exports older than 24 hours."""
    try:
        now = datetime.now()
        for export_file in EXPORTS_DIR.glob("*.zip"):
            file_time = datetime.fromtimestamp(export_file.stat().st_mtime)
            if (now - file_time).total_seconds() > 86400:  # 24 hours
                export_file.unlink()
                logger.info(f"Cleaned up old export: {export_file.name}")
    except Exception as e:
        logger.error(f"Error cleaning up exports: {e}")


# ============================================================
# Endpoints
# ============================================================

@router.post("/create", response_model=ExportResponse)
async def create_evidence_export(
    request: ExportRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_operator_or_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Create an evidence export package with chain of custody.
    
    This endpoint:
    1. Gathers all requested event media (clips/snapshots)
    2. Calculates SHA-256 hashes for each file
    3. Generates a manifest with complete chain of custody info
    4. Packages everything into a ZIP file
    5. Records the export in the audit log
    """
    if not request.event_ids:
        raise HTTPException(status_code=400, detail="No events specified for export")
    
    export_id = generate_export_id()
    temp_dir = tempfile.mkdtemp(prefix=f"titan_export_{export_id}_")
    
    try:
        files_manifest: List[FileManifestEntry] = []
        total_size = 0
        events_included = []
        
        # Process each event
        for event_id in request.event_ids:
            # Get event from database if exists
            result = await db.execute(
                select(Event).where(Event.frigate_event_id == event_id)
            )
            event = result.scalar_one_or_none()
            
            event_info = {
                "id": event_id,
                "camera": event.camera if event else "unknown",
                "label": event.label if event else "unknown",
                "start_time": event.start_time.isoformat() if event else None,
                "score": event.score if event else None
            }
            events_included.append(event_info)
            
            # Copy clip if requested
            if request.include_clips:
                clip_path = await get_frigate_media_path(event_id, "clip")
                if clip_path and os.path.exists(clip_path):
                    dest_filename = f"clip_{event_id}.mp4"
                    dest_path = os.path.join(temp_dir, dest_filename)
                    shutil.copy2(clip_path, dest_path)
                    
                    file_size = os.path.getsize(dest_path)
                    total_size += file_size
                    
                    files_manifest.append(FileManifestEntry(
                        filename=dest_filename,
                        original_path=clip_path,
                        file_type="clip",
                        size_bytes=file_size,
                        sha256_hash=calculate_sha256(dest_path),
                        event_id=event_id
                    ))
            
            # Copy snapshot if requested
            if request.include_snapshots:
                snap_path = await get_frigate_media_path(event_id, "snapshot")
                if snap_path and os.path.exists(snap_path):
                    dest_filename = f"snapshot_{event_id}.jpg"
                    dest_path = os.path.join(temp_dir, dest_filename)
                    shutil.copy2(snap_path, dest_path)
                    
                    file_size = os.path.getsize(dest_path)
                    total_size += file_size
                    
                    files_manifest.append(FileManifestEntry(
                        filename=dest_filename,
                        original_path=snap_path,
                        file_type="snapshot",
                        size_bytes=file_size,
                        sha256_hash=calculate_sha256(dest_path),
                        event_id=event_id
                    ))
        
        # Calculate integrity hash (hash of all file hashes)
        all_hashes = "".join([f.sha256_hash for f in files_manifest])
        integrity_hash = hashlib.sha256(all_hashes.encode()).hexdigest()
        
        # Create manifest
        now = datetime.now()
        manifest = ExportManifest(
            export_id=export_id,
            case_name=request.case_name,
            case_number=request.case_number,
            created_at=now.isoformat(),
            created_by=current_user.username,
            created_by_role=current_user.role.value,
            operator_notes=request.operator_notes,
            event_count=len(request.event_ids),
            file_count=len(files_manifest),
            total_size_bytes=total_size,
            files=files_manifest,
            integrity_hash=integrity_hash
        )
        
        # Write manifest JSON
        manifest_path = os.path.join(temp_dir, "manifest.json")
        manifest_dict = manifest.model_dump()
        manifest_dict["events"] = events_included
        
        async with aiofiles.open(manifest_path, 'w') as f:
            await f.write(json.dumps(manifest_dict, indent=2, default=str))
        
        manifest_size = os.path.getsize(manifest_path)
        total_size += manifest_size
        
        files_manifest.append(FileManifestEntry(
            filename="manifest.json",
            original_path=manifest_path,
            file_type="report",
            size_bytes=manifest_size,
            sha256_hash=calculate_sha256(manifest_path),
            event_id=None
        ))
        
        # Create README with chain of custody info
        readme_content = f"""
================================================================================
                    TITAN NVR - EVIDENCE EXPORT PACKAGE
================================================================================

Export ID:      {export_id}
Case Name:      {request.case_name}
Case Number:    {request.case_number or 'N/A'}
Created:        {now.strftime('%Y-%m-%d %H:%M:%S')}
Created By:     {current_user.username} ({current_user.role.value})

--------------------------------------------------------------------------------
                         CHAIN OF CUSTODY INFORMATION
--------------------------------------------------------------------------------

This evidence package was created using TitanNVR Enterprise.
All files have been hashed using SHA-256 for integrity verification.

Total Events:   {len(request.event_ids)}
Total Files:    {len(files_manifest)}
Integrity Hash: {integrity_hash}

To verify file integrity:
1. Calculate the SHA-256 hash of each file
2. Compare with the hashes in manifest.json
3. Concatenate all hashes and calculate SHA-256 to verify integrity_hash

--------------------------------------------------------------------------------
                              OPERATOR NOTES
--------------------------------------------------------------------------------

{request.operator_notes or 'No notes provided.'}

--------------------------------------------------------------------------------
                              FILE LISTING
--------------------------------------------------------------------------------

"""
        for f in files_manifest:
            readme_content += f"\n{f.filename}\n  SHA-256: {f.sha256_hash}\n  Size: {f.size_bytes} bytes\n"
        
        readme_content += """
================================================================================
                    THIS IS AN OFFICIAL EVIDENCE PACKAGE
                     Handle according to legal procedures
================================================================================
"""
        
        readme_path = os.path.join(temp_dir, "README.txt")
        async with aiofiles.open(readme_path, 'w') as f:
            await f.write(readme_content)
        
        # Create ZIP file
        zip_filename = f"{export_id}.zip"
        zip_path = EXPORTS_DIR / zip_filename
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, temp_dir)
                    zipf.write(file_path, arcname)
        
        zip_size = os.path.getsize(zip_path)
        
        # Log to audit
        await log_action(
            db=db,
            user=current_user,
            action=AuditAction.EVIDENCE_EXPORT,
            details=f"Exported evidence package '{request.case_name}' with {len(request.event_ids)} events ({len(files_manifest)} files, {zip_size / 1024 / 1024:.2f} MB)",
            resource_type="export",
            resource_id=export_id
        )
        await db.commit()
        
        # Schedule cleanup
        background_tasks.add_task(cleanup_old_exports)
        
        # Calculate expiry (24 hours from now)
        expires_at = datetime.now().replace(hour=23, minute=59, second=59)
        if expires_at < now:
            expires_at = expires_at.replace(day=expires_at.day + 1)
        
        return ExportResponse(
            export_id=export_id,
            case_name=request.case_name,
            download_url=f"/api/export/download/{export_id}",
            file_count=len(files_manifest),
            total_size_mb=round(zip_size / 1024 / 1024, 2),
            created_at=now.isoformat(),
            expires_at=expires_at.isoformat()
        )
        
    except Exception as e:
        logger.error(f"Error creating export: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create export: {str(e)}")
    
    finally:
        # Cleanup temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.get("/download/{export_id}")
async def download_export(
    export_id: str,
    current_user: User = Depends(require_operator_or_admin)
):
    """Download an evidence export package."""
    zip_path = EXPORTS_DIR / f"{export_id}.zip"
    
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Export not found or has expired")
    
    return FileResponse(
        path=str(zip_path),
        filename=f"{export_id}.zip",
        media_type="application/zip"
    )


@router.get("/list", response_model=List[ExportListItem])
async def list_exports(
    current_user: User = Depends(require_operator_or_admin)
):
    """List all available evidence exports."""
    exports = []
    
    for zip_file in EXPORTS_DIR.glob("*.zip"):
        try:
            stat = zip_file.stat()
            export_id = zip_file.stem
            
            # Try to read manifest from zip
            case_name = export_id
            case_number = None
            created_by = "unknown"
            file_count = 0
            
            try:
                with zipfile.ZipFile(zip_file, 'r') as zf:
                    if 'manifest.json' in zf.namelist():
                        with zf.open('manifest.json') as mf:
                            manifest = json.loads(mf.read().decode('utf-8'))
                            case_name = manifest.get('case_name', export_id)
                            case_number = manifest.get('case_number')
                            created_by = manifest.get('created_by', 'unknown')
                            file_count = manifest.get('file_count', 0)
            except Exception:
                pass
            
            exports.append(ExportListItem(
                export_id=export_id,
                case_name=case_name,
                case_number=case_number,
                created_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                created_by=created_by,
                file_count=file_count,
                size_mb=round(stat.st_size / 1024 / 1024, 2),
                download_url=f"/api/export/download/{export_id}"
            ))
        except Exception as e:
            logger.error(f"Error reading export {zip_file}: {e}")
    
    # Sort by creation time, newest first
    exports.sort(key=lambda x: x.created_at, reverse=True)
    
    return exports


@router.delete("/{export_id}")
async def delete_export(
    export_id: str,
    current_user: User = Depends(require_operator_or_admin),
    db: AsyncSession = Depends(get_db)
):
    """Delete an evidence export package."""
    zip_path = EXPORTS_DIR / f"{export_id}.zip"
    
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Export not found")
    
    zip_path.unlink()
    
    # Log deletion
    await log_action(
        db=db,
        user=current_user,
        action=AuditAction.EVIDENCE_DELETE,
        details=f"Deleted evidence export package: {export_id}",
        resource_type="export",
        resource_id=export_id
    )
    await db.commit()
    
    return {"message": f"Export {export_id} deleted"}
