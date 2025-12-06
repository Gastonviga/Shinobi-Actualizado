"""
TitanNVR - System Health Monitor
Real-time system statistics for maintenance dashboard
"""
import os
import time
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import psutil
import logging

from app.services.auth import get_current_user_required, require_admin
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/system", tags=["system"])

# Track service start time
SERVICE_START_TIME = time.time()


# ============================================================
# Schemas
# ============================================================

class CPUStats(BaseModel):
    """CPU statistics."""
    percent_total: float
    percent_per_core: List[float]
    core_count: int
    frequency_mhz: Optional[float] = None


class MemoryStats(BaseModel):
    """Memory/RAM statistics."""
    total_gb: float
    used_gb: float
    free_gb: float
    percent_used: float


class DiskStats(BaseModel):
    """Disk storage statistics."""
    path: str
    total_gb: float
    used_gb: float
    free_gb: float
    percent_used: float
    is_critical: bool  # True if < 10% free


class NetworkStats(BaseModel):
    """Network I/O statistics."""
    bytes_sent: int
    bytes_recv: int
    bytes_sent_gb: float
    bytes_recv_gb: float


class UptimeStats(BaseModel):
    """Service uptime statistics."""
    seconds: int
    formatted: str  # e.g., "2d 5h 30m"
    started_at: str


class SystemHealth(BaseModel):
    """Complete system health report."""
    timestamp: str
    cpu: CPUStats
    memory: MemoryStats
    disk: DiskStats
    network: NetworkStats
    uptime: UptimeStats
    overall_status: str  # "healthy", "warning", "critical"
    alerts: List[str]


class DockerContainerStats(BaseModel):
    """Docker container status."""
    name: str
    status: str
    health: Optional[str] = None


class ServicesStatus(BaseModel):
    """Status of all TitanNVR services."""
    backend: str
    go2rtc: str
    frigate: str
    mqtt: str
    containers: List[DockerContainerStats]


# ============================================================
# Helper Functions
# ============================================================

def bytes_to_gb(bytes_val: int) -> float:
    """Convert bytes to gigabytes."""
    return round(bytes_val / (1024 ** 3), 2)


def format_uptime(seconds: int) -> str:
    """Format uptime seconds to human-readable string."""
    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    minutes = (seconds % 3600) // 60
    
    parts = []
    if days > 0:
        parts.append(f"{days}d")
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0 or not parts:
        parts.append(f"{minutes}m")
    
    return " ".join(parts)


def get_storage_path() -> str:
    """Get the storage path for disk monitoring."""
    # Check if running in Docker
    if os.path.exists("/storage"):
        return "/storage"
    # Fallback to current directory
    return os.getcwd()


# ============================================================
# Endpoints
# ============================================================

@router.get("/stats", response_model=SystemHealth)
async def get_system_stats(
    current_user: User = Depends(get_current_user_required)
):
    """
    Get comprehensive system health statistics.
    
    Returns CPU, RAM, Disk, Network, and Uptime information.
    Includes alerts for critical conditions.
    """
    alerts = []
    overall_status = "healthy"
    
    # CPU Stats
    cpu_percent = psutil.cpu_percent(interval=0.5)
    cpu_per_core = psutil.cpu_percent(interval=0.1, percpu=True)
    cpu_freq = psutil.cpu_freq()
    
    cpu_stats = CPUStats(
        percent_total=cpu_percent,
        percent_per_core=cpu_per_core,
        core_count=psutil.cpu_count(),
        frequency_mhz=cpu_freq.current if cpu_freq else None
    )
    
    if cpu_percent > 90:
        alerts.append("CPU usage is critically high (>90%)")
        overall_status = "critical"
    elif cpu_percent > 75:
        alerts.append("CPU usage is elevated (>75%)")
        if overall_status == "healthy":
            overall_status = "warning"
    
    # Memory Stats
    mem = psutil.virtual_memory()
    memory_stats = MemoryStats(
        total_gb=bytes_to_gb(mem.total),
        used_gb=bytes_to_gb(mem.used),
        free_gb=bytes_to_gb(mem.available),
        percent_used=mem.percent
    )
    
    if mem.percent > 90:
        alerts.append("Memory usage is critically high (>90%)")
        overall_status = "critical"
    elif mem.percent > 80:
        alerts.append("Memory usage is elevated (>80%)")
        if overall_status == "healthy":
            overall_status = "warning"
    
    # Disk Stats
    storage_path = get_storage_path()
    try:
        disk = psutil.disk_usage(storage_path)
        free_percent = 100 - disk.percent
        is_critical = free_percent < 10
        
        disk_stats = DiskStats(
            path=storage_path,
            total_gb=bytes_to_gb(disk.total),
            used_gb=bytes_to_gb(disk.used),
            free_gb=bytes_to_gb(disk.free),
            percent_used=disk.percent,
            is_critical=is_critical
        )
        
        if is_critical:
            alerts.append(f"CRITICAL: Disk space low! Only {free_percent:.1f}% free on {storage_path}")
            overall_status = "critical"
        elif free_percent < 20:
            alerts.append(f"Disk space running low ({free_percent:.1f}% free)")
            if overall_status == "healthy":
                overall_status = "warning"
    except Exception as e:
        logger.error(f"Error getting disk stats: {e}")
        disk_stats = DiskStats(
            path=storage_path,
            total_gb=0,
            used_gb=0,
            free_gb=0,
            percent_used=0,
            is_critical=False
        )
    
    # Network Stats
    net = psutil.net_io_counters()
    network_stats = NetworkStats(
        bytes_sent=net.bytes_sent,
        bytes_recv=net.bytes_recv,
        bytes_sent_gb=bytes_to_gb(net.bytes_sent),
        bytes_recv_gb=bytes_to_gb(net.bytes_recv)
    )
    
    # Uptime Stats
    uptime_seconds = int(time.time() - SERVICE_START_TIME)
    started_at = datetime.fromtimestamp(SERVICE_START_TIME)
    
    uptime_stats = UptimeStats(
        seconds=uptime_seconds,
        formatted=format_uptime(uptime_seconds),
        started_at=started_at.isoformat()
    )
    
    return SystemHealth(
        timestamp=datetime.now().isoformat(),
        cpu=cpu_stats,
        memory=memory_stats,
        disk=disk_stats,
        network=network_stats,
        uptime=uptime_stats,
        overall_status=overall_status,
        alerts=alerts
    )


@router.get("/services")
async def get_services_status(
    current_user: User = Depends(require_admin)
):
    """
    Get status of TitanNVR services (admin only).
    
    Checks connectivity to Go2RTC, Frigate, and MQTT.
    """
    import httpx
    
    services = {
        "backend": "online",
        "go2rtc": "unknown",
        "frigate": "unknown",
        "mqtt": "unknown"
    }
    
    containers = []
    
    # Check Go2RTC
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get("http://go2rtc:1984/api")
            services["go2rtc"] = "online" if response.status_code == 200 else "error"
    except Exception:
        services["go2rtc"] = "offline"
    
    # Check Frigate
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get("http://frigate:5000/api/version")
            services["frigate"] = "online" if response.status_code == 200 else "error"
    except Exception:
        services["frigate"] = "offline"
    
    # Check MQTT (basic TCP check)
    try:
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        result = sock.connect_ex(('mqtt', 1883))
        services["mqtt"] = "online" if result == 0 else "offline"
        sock.close()
    except Exception:
        services["mqtt"] = "offline"
    
    # Container status is now inferred from service checks above
    # Docker socket is no longer mounted for security reasons
    containers = [
        DockerContainerStats(name="titan-backend", status="running", health="healthy"),
        DockerContainerStats(name="titan-go2rtc", status="running" if services["go2rtc"] == "online" else "unknown"),
        DockerContainerStats(name="titan-frigate", status="running" if services["frigate"] == "online" else "unknown"),
        DockerContainerStats(name="titan-mqtt", status="running" if services["mqtt"] == "online" else "unknown"),
    ]
    
    return ServicesStatus(
        backend=services["backend"],
        go2rtc=services["go2rtc"],
        frigate=services["frigate"],
        mqtt=services["mqtt"],
        containers=containers
    )


@router.get("/storage/retention")
async def get_storage_retention_info(
    current_user: User = Depends(require_admin)
):
    """
    Get storage retention information for recordings.
    
    Shows how long recordings can be kept based on current disk usage.
    """
    storage_path = get_storage_path()
    
    try:
        disk = psutil.disk_usage(storage_path)
        
        # Estimate daily storage usage (rough calculation)
        # Assuming average of 1GB per camera per day for continuous recording
        estimated_daily_usage_gb = 5  # Conservative estimate
        
        free_gb = bytes_to_gb(disk.free)
        days_remaining = int(free_gb / estimated_daily_usage_gb) if estimated_daily_usage_gb > 0 else 0
        
        return {
            "storage_path": storage_path,
            "total_gb": bytes_to_gb(disk.total),
            "used_gb": bytes_to_gb(disk.used),
            "free_gb": free_gb,
            "percent_used": disk.percent,
            "estimated_daily_usage_gb": estimated_daily_usage_gb,
            "estimated_days_remaining": days_remaining,
            "recommendation": "Consider enabling retention policies" if days_remaining < 7 else "Storage healthy"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting storage info: {str(e)}")
