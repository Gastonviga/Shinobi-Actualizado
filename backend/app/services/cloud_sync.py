"""
TitanNVR - Cloud Sync Service
Syncs recordings to cloud storage using Rclone
"""
import asyncio
import httpx
import logging
import os
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Rclone configuration
RCLONE_URL = os.getenv("RCLONE_URL", "http://backup_service:5572")
RCLONE_REMOTE = os.getenv("RCLONE_REMOTE", "drive")  # Remote name configured in rclone
RCLONE_DEST_PATH = os.getenv("RCLONE_DEST_PATH", "TitanNVR")  # Destination folder in cloud
LOCAL_RECORDINGS_PATH = "/data/frigate"  # Path inside rclone container


class CloudSyncService:
    """
    Manages cloud backup of recordings using Rclone.
    
    Rclone API Reference:
    - POST /sync/sync - Sync source to destination
    - POST /sync/copy - Copy files (don't delete destination extras)
    - GET /core/stats - Get transfer statistics
    """
    
    def __init__(self, rclone_url: str = None):
        self.rclone_url = rclone_url or RCLONE_URL
        self.timeout = 300.0  # 5 minutes for large syncs
        self.is_syncing = False
        self.last_sync: Optional[datetime] = None
        self.last_sync_result: Optional[Dict[str, Any]] = None
    
    async def check_connection(self) -> bool:
        """Check if Rclone service is available."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.rclone_url}/rc/noop",
                    json={}
                )
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Rclone connection check failed: {e}")
            return False
    
    async def get_remotes(self) -> Dict[str, Any]:
        """List configured remotes in Rclone."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.rclone_url}/config/listremotes",
                    json={}
                )
                if response.status_code == 200:
                    return {"status": "ok", "remotes": response.json().get("remotes", [])}
                return {"status": "error", "message": f"Status {response.status_code}"}
        except Exception as e:
            logger.error(f"Failed to list remotes: {e}")
            return {"status": "error", "message": str(e)}
    
    async def sync_recordings(
        self,
        source_path: str = None,
        dest_remote: str = None,
        dest_path: str = None
    ) -> Dict[str, Any]:
        """
        Sync recordings to cloud storage.
        
        Args:
            source_path: Local path to sync (default: frigate recordings)
            dest_remote: Rclone remote name (default: drive)
            dest_path: Destination path in remote (default: TitanNVR)
            
        Returns:
            Sync result dictionary
        """
        if self.is_syncing:
            return {
                "status": "busy",
                "message": "Sync already in progress"
            }
        
        self.is_syncing = True
        source = source_path or LOCAL_RECORDINGS_PATH
        remote = dest_remote or RCLONE_REMOTE
        dest = dest_path or RCLONE_DEST_PATH
        
        logger.info(f"Starting cloud sync: {source} -> {remote}:{dest}")
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Use copy instead of sync to avoid deleting cloud files
                response = await client.post(
                    f"{self.rclone_url}/sync/copy",
                    json={
                        "srcFs": source,
                        "dstFs": f"{remote}:{dest}",
                        "_async": True  # Run async for large transfers
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    job_id = result.get("jobid")
                    
                    self.last_sync = datetime.utcnow()
                    self.last_sync_result = {
                        "status": "started",
                        "job_id": job_id,
                        "source": source,
                        "destination": f"{remote}:{dest}",
                        "started_at": self.last_sync.isoformat()
                    }
                    
                    logger.info(f"Cloud sync started, job_id: {job_id}")
                    return self.last_sync_result
                else:
                    error_msg = response.text
                    logger.error(f"Sync failed: {error_msg}")
                    return {
                        "status": "error",
                        "message": error_msg
                    }
                    
        except httpx.ConnectError:
            logger.warning("Rclone service not available")
            return {
                "status": "unavailable",
                "message": "Rclone service not running"
            }
        except Exception as e:
            logger.error(f"Sync error: {e}")
            return {
                "status": "error",
                "message": str(e)
            }
        finally:
            self.is_syncing = False
    
    async def get_sync_status(self) -> Dict[str, Any]:
        """Get current sync status and statistics."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.rclone_url}/core/stats",
                    json={}
                )
                
                if response.status_code == 200:
                    stats = response.json()
                    return {
                        "status": "ok",
                        "is_syncing": self.is_syncing,
                        "last_sync": self.last_sync.isoformat() if self.last_sync else None,
                        "last_result": self.last_sync_result,
                        "current_stats": {
                            "bytes": stats.get("bytes", 0),
                            "speed": stats.get("speed", 0),
                            "transfers": stats.get("transfers", 0),
                            "errors": stats.get("errors", 0)
                        }
                    }
                return {"status": "error", "message": f"Status {response.status_code}"}
                
        except Exception as e:
            return {
                "status": "error",
                "is_syncing": self.is_syncing,
                "last_sync": self.last_sync.isoformat() if self.last_sync else None,
                "message": str(e)
            }
    
    async def list_cloud_files(
        self,
        remote: str = None,
        path: str = None
    ) -> Dict[str, Any]:
        """List files in cloud storage."""
        remote = remote or RCLONE_REMOTE
        path = path or RCLONE_DEST_PATH
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.rclone_url}/operations/list",
                    json={
                        "fs": f"{remote}:{path}",
                        "remote": ""
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return {
                        "status": "ok",
                        "path": f"{remote}:{path}",
                        "files": result.get("list", [])
                    }
                return {"status": "error", "message": response.text}
                
        except Exception as e:
            return {"status": "error", "message": str(e)}


# Singleton instance
cloud_sync = CloudSyncService()


# Background task for periodic sync
async def periodic_cloud_sync(interval_hours: int = 1):
    """
    Background task that syncs recordings to cloud periodically.
    
    Args:
        interval_hours: Hours between sync attempts (default: 1)
    """
    interval_seconds = interval_hours * 3600
    
    logger.info(f"Starting periodic cloud sync (every {interval_hours}h)")
    
    while True:
        try:
            # Wait before first sync (let system stabilize)
            await asyncio.sleep(interval_seconds)
            
            # Check if rclone is configured
            remotes = await cloud_sync.get_remotes()
            if remotes.get("status") != "ok" or not remotes.get("remotes"):
                logger.info("No cloud remotes configured, skipping sync")
                continue
            
            # Perform sync
            result = await cloud_sync.sync_recordings()
            logger.info(f"Periodic sync result: {result.get('status')}")
            
        except asyncio.CancelledError:
            logger.info("Periodic sync task cancelled")
            break
        except Exception as e:
            logger.error(f"Periodic sync error: {e}")
