"""
TitanNVR - Recordings Router
Handles recording files and cloud backup operations
"""
import os
from pathlib import Path
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from fastapi.responses import FileResponse
import logging

from app.services.cloud_sync import cloud_sync

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/recordings", tags=["recordings"])

# Frigate stores recordings in /media/frigate/recordings
# This is mounted as /app/storage/frigate in our backend
RECORDINGS_BASE_PATH = Path("/app/storage/frigate/recordings")
CLIPS_BASE_PATH = Path("/app/storage/frigate/clips")


# ============================================================
# Recording File Models
# ============================================================

def get_file_info(file_path: Path, base_path: Path) -> dict:
    """Get file information dictionary."""
    stat = file_path.stat()
    return {
        "name": file_path.name,
        "path": str(file_path.relative_to(base_path)),
        "size": stat.st_size,
        "size_mb": round(stat.st_size / (1024 * 1024), 2),
        "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),
        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


# ============================================================
# Recording Endpoints
# ============================================================

@router.get("/")
async def list_recordings(
    camera: Optional[str] = None,
    date: Optional[str] = None,
    limit: int = Query(default=100, le=500)
):
    """
    List available recording files.
    
    Args:
        camera: Filter by camera name
        date: Filter by date (YYYY-MM-DD)
        limit: Maximum number of files to return
        
    Returns:
        List of recording files with metadata
    """
    recordings = []
    
    if not RECORDINGS_BASE_PATH.exists():
        return {
            "recordings": [],
            "total": 0,
            "message": "Recordings directory not found. Frigate may not have recorded anything yet."
        }
    
    try:
        # Frigate organizes recordings as: /recordings/{camera}/{YYYY-MM}/{DD}/{HH}/{file}.mp4
        for camera_dir in RECORDINGS_BASE_PATH.iterdir():
            if not camera_dir.is_dir():
                continue
            
            # Filter by camera if specified
            if camera and camera.lower() not in camera_dir.name.lower():
                continue
            
            # Walk through date/time structure
            for file_path in camera_dir.rglob("*.mp4"):
                # Filter by date if specified
                if date:
                    try:
                        # Extract date from path structure
                        parts = file_path.relative_to(camera_dir).parts
                        if len(parts) >= 2:
                            file_date = f"{parts[0]}-{parts[1]}"  # YYYY-MM-DD
                            if date not in file_date:
                                continue
                    except Exception:
                        pass
                
                recordings.append({
                    "camera": camera_dir.name,
                    **get_file_info(file_path, RECORDINGS_BASE_PATH)
                })
                
                if len(recordings) >= limit:
                    break
            
            if len(recordings) >= limit:
                break
        
        # Sort by modified date (newest first)
        recordings.sort(key=lambda x: x["modified"], reverse=True)
        
        return {
            "recordings": recordings[:limit],
            "total": len(recordings),
            "path": str(RECORDINGS_BASE_PATH)
        }
        
    except Exception as e:
        logger.error(f"Error listing recordings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/clips")
async def list_clips(
    camera: Optional[str] = None,
    limit: int = Query(default=50, le=200)
):
    """
    List event clips (shorter clips triggered by detection events).
    """
    clips = []
    
    if not CLIPS_BASE_PATH.exists():
        return {
            "clips": [],
            "total": 0,
            "message": "Clips directory not found"
        }
    
    try:
        for file_path in CLIPS_BASE_PATH.rglob("*.mp4"):
            if camera and camera.lower() not in str(file_path).lower():
                continue
            
            clips.append(get_file_info(file_path, CLIPS_BASE_PATH))
            
            if len(clips) >= limit:
                break
        
        clips.sort(key=lambda x: x["modified"], reverse=True)
        
        return {
            "clips": clips[:limit],
            "total": len(clips)
        }
        
    except Exception as e:
        logger.error(f"Error listing clips: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/play/{file_path:path}")
async def play_recording(file_path: str):
    """
    Stream a recording file for playback.
    
    Args:
        file_path: Relative path to the recording file
        
    Returns:
        Video file stream with headers optimized for browser playback
    """
    # Try recordings directory first
    full_path = RECORDINGS_BASE_PATH / file_path
    
    if not full_path.exists():
        # Try clips directory
        full_path = CLIPS_BASE_PATH / file_path
    
    if not full_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Recording not found: {file_path}"
        )
    
    # Security check - ensure path is within allowed directories
    try:
        full_path.resolve().relative_to(RECORDINGS_BASE_PATH.resolve())
    except ValueError:
        try:
            full_path.resolve().relative_to(CLIPS_BASE_PATH.resolve())
        except ValueError:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )
    
    # Return with headers optimized for in-browser playback
    return FileResponse(
        path=full_path,
        media_type="video/mp4",
        headers={
            "Content-Disposition": f"inline; filename=\"{full_path.name}\"",
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        }
    )


@router.delete("/{file_path:path}")
async def delete_recording(file_path: str):
    """
    Delete a recording file from disk.
    
    Args:
        file_path: Relative path to the recording file
        
    Returns:
        Success message or error
    """
    # Try recordings directory
    full_path = RECORDINGS_BASE_PATH / file_path
    
    if not full_path.exists():
        # Try clips directory
        full_path = CLIPS_BASE_PATH / file_path
    
    if not full_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Recording not found: {file_path}"
        )
    
    # Security check - ensure path is within allowed directories
    try:
        full_path.resolve().relative_to(RECORDINGS_BASE_PATH.resolve())
    except ValueError:
        try:
            full_path.resolve().relative_to(CLIPS_BASE_PATH.resolve())
        except ValueError:
            raise HTTPException(
                status_code=403,
                detail="Access denied - path outside allowed directories"
            )
    
    try:
        full_path.unlink()
        logger.info(f"Deleted recording: {file_path}")
        return {"status": "ok", "message": f"Recording deleted: {file_path}"}
    except Exception as e:
        logger.error(f"Failed to delete recording {file_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class BulkDeleteRequest(BaseModel):
    files: List[str]


class BulkDeleteResponse(BaseModel):
    deleted: int
    errors: int
    details: List[str] = []


@router.post("/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_recordings(request: BulkDeleteRequest):
    """
    Delete multiple recording files in a single operation.
    
    Args:
        request: BulkDeleteRequest with list of file paths
        
    Returns:
        Summary with deleted count and errors
    """
    deleted = 0
    errors = 0
    details = []
    
    for file_path in request.files:
        # Try recordings directory first
        full_path = RECORDINGS_BASE_PATH / file_path
        
        if not full_path.exists():
            # Try clips directory
            full_path = CLIPS_BASE_PATH / file_path
        
        if not full_path.exists():
            errors += 1
            details.append(f"Not found: {file_path}")
            continue
        
        # Security check - ensure path is within allowed directories
        is_valid = False
        try:
            full_path.resolve().relative_to(RECORDINGS_BASE_PATH.resolve())
            is_valid = True
        except ValueError:
            try:
                full_path.resolve().relative_to(CLIPS_BASE_PATH.resolve())
                is_valid = True
            except ValueError:
                pass
        
        if not is_valid:
            errors += 1
            details.append(f"Access denied: {file_path}")
            continue
        
        try:
            full_path.unlink()
            deleted += 1
            logger.info(f"Bulk delete: removed {file_path}")
        except Exception as e:
            errors += 1
            details.append(f"Error deleting {file_path}: {str(e)}")
            logger.error(f"Bulk delete error for {file_path}: {e}")
    
    logger.info(f"Bulk delete completed: {deleted} deleted, {errors} errors")
    return BulkDeleteResponse(deleted=deleted, errors=errors, details=details)


@router.get("/stats")
async def get_recording_stats():
    """Get recording storage statistics."""
    stats = {
        "recordings": {"count": 0, "size_mb": 0},
        "clips": {"count": 0, "size_mb": 0},
        "total_size_mb": 0,
        "total_size_gb": 0
    }
    
    try:
        # Count recordings
        if RECORDINGS_BASE_PATH.exists():
            for file_path in RECORDINGS_BASE_PATH.rglob("*.mp4"):
                stats["recordings"]["count"] += 1
                stats["recordings"]["size_mb"] += file_path.stat().st_size / (1024 * 1024)
        
        # Count clips
        if CLIPS_BASE_PATH.exists():
            for file_path in CLIPS_BASE_PATH.rglob("*.mp4"):
                stats["clips"]["count"] += 1
                stats["clips"]["size_mb"] += file_path.stat().st_size / (1024 * 1024)
        
        # Round values
        stats["recordings"]["size_mb"] = round(stats["recordings"]["size_mb"], 2)
        stats["clips"]["size_mb"] = round(stats["clips"]["size_mb"], 2)
        stats["total_size_mb"] = round(
            stats["recordings"]["size_mb"] + stats["clips"]["size_mb"], 2
        )
        stats["total_size_gb"] = round(stats["total_size_mb"] / 1024, 2)
        
        return stats
        
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Cloud Backup Endpoints
# ============================================================

@router.get("/backup/status")
async def get_backup_status():
    """Get cloud backup status and configuration."""
    connection = await cloud_sync.check_connection()
    remotes = await cloud_sync.get_remotes() if connection else {"status": "unavailable"}
    sync_status = await cloud_sync.get_sync_status()
    
    return {
        "service_available": connection,
        "remotes": remotes,
        "sync_status": sync_status
    }


@router.post("/backup/sync")
async def trigger_backup():
    """
    Manually trigger cloud backup.
    
    Syncs recordings to configured cloud storage (Google Drive).
    """
    # Check if service is available
    if not await cloud_sync.check_connection():
        raise HTTPException(
            status_code=503,
            detail="Backup service not available. Is the backup_service container running?"
        )
    
    # Check if remotes are configured
    remotes = await cloud_sync.get_remotes()
    if remotes.get("status") != "ok" or not remotes.get("remotes"):
        raise HTTPException(
            status_code=400,
            detail="No cloud storage configured. Visit http://localhost:5572 to configure Rclone."
        )
    
    # Trigger sync
    result = await cloud_sync.sync_recordings()
    
    if result.get("status") == "busy":
        raise HTTPException(status_code=409, detail="Sync already in progress")
    
    return result


@router.get("/backup/files")
async def list_cloud_files():
    """List files in cloud storage."""
    if not await cloud_sync.check_connection():
        raise HTTPException(status_code=503, detail="Backup service not available")
    
    return await cloud_sync.list_cloud_files()
