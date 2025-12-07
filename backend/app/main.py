"""
TitanNVR - Main Application Entry Point
Enterprise v2.0 with Authentication, Notifications, and Advanced Configuration
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import get_settings
from app.database import init_db, async_session_maker
from app.models.camera import Camera
from app.models.map import Map
from app.models.event import Event
from app.models.audit import AuditLog
from app.routers import cameras_router, health_router, streams_router, maps_router, ptz_router
from app.routers.events import router as events_router
from app.routers.recordings import router as recordings_router
from app.routers.auth import router as auth_router
from app.routers.settings import router as settings_router, init_default_settings
from app.routers.audit import router as audit_router
from app.routers.system import router as system_router
from app.routers.incidents import router as incidents_router
from app.routers.cloud import router as cloud_router
from app.routers.backup import router as backup_router
from app.services.stream_manager import stream_manager
from app.services.cloud_sync import periodic_cloud_sync
from app.services.scheduler import periodic_schedule_check
from app.services.auth import create_default_admin

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

settings = get_settings()


async def sync_cameras_to_go2rtc():
    """
    Sync all cameras from database to Go2RTC.
    
    This runs on startup to ensure Go2RTC has all camera streams
    registered (in case Go2RTC container restarted and lost config).
    """
    logger.info("🔄 Syncing cameras to Go2RTC...")
    
    # Check if Go2RTC is available
    if not await stream_manager.check_connection():
        logger.warning("⚠️ Go2RTC is not available, skipping sync")
        return
    
    async with async_session_maker() as session:
        result = await session.execute(select(Camera).where(Camera.is_active == True))
        cameras = result.scalars().all()
        
        if not cameras:
            logger.info("📷 No cameras to sync")
            return
        
        synced = 0
        failed = 0
        
        for camera in cameras:
            try:
                await stream_manager.register_stream(
                    name=camera.name,
                    main_stream_url=camera.main_stream_url,
                    sub_stream_url=camera.sub_stream_url
                )
                synced += 1
                logger.debug(f"  ✓ Synced: {camera.name}")
            except Exception as e:
                failed += 1
                logger.error(f"  ✗ Failed to sync {camera.name}: {e}")
        
        logger.info(f"✅ Sync complete: {synced} synced, {failed} failed")


async def sync_cameras_to_frigate():
    """
    Sync all cameras from database to Frigate.
    
    This runs on startup to ensure Frigate has all camera streams
    configured (in case Frigate container restarted and lost config).
    """
    from app.services.config_generator import sync_frigate_config
    
    logger.info("🔄 Syncing cameras to Frigate...")
    
    async with async_session_maker() as session:
        result = await session.execute(select(Camera).where(Camera.is_active == True))
        cameras = result.scalars().all()
        
        if not cameras:
            logger.info("📷 No cameras to sync to Frigate")
            return
        
        camera_dicts = [
            {
                "name": c.name,
                "is_active": c.is_active,
                "main_stream_url": c.main_stream_url,
                "sub_stream_url": c.sub_stream_url,
                "retention_days": c.retention_days,
                "recording_mode": c.recording_mode,
                "event_retention_days": c.event_retention_days,
                "zones_config": c.zones_config,
            }
            for c in cameras
        ]
        
        try:
            result = await sync_frigate_config(camera_dicts, restart=True)
            logger.info(f"✅ Frigate sync complete: {result.get('cameras_configured', 0)} cameras configured")
        except Exception as e:
            logger.warning(f"⚠️ Frigate sync failed (may not be running): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler - Enterprise v2.0."""
    # Startup
    logger.info(f"🚀 Starting {settings.app_name} Enterprise v2.0...")
    
    # Initialize database
    await init_db()
    logger.info("✅ Database initialized")
    
    # Initialize default admin user and settings
    async with async_session_maker() as session:
        await create_default_admin(session)
        await init_default_settings(session)
        logger.info("✅ Default admin and settings initialized")
    
    # Sync cameras to Go2RTC
    await sync_cameras_to_go2rtc()
    
    # Sync cameras to Frigate (ensures detection is configured)
    await sync_cameras_to_frigate()
    
    # Start background task for cloud sync (every 1 hour)
    cloud_sync_task = asyncio.create_task(periodic_cloud_sync(interval_hours=1))
    logger.info("☁️ Cloud sync task started")
    
    # Start background task for recording scheduler (every 1 minute)
    scheduler_task = asyncio.create_task(periodic_schedule_check(interval_seconds=60))
    logger.info("📅 Recording scheduler task started")
    
    yield
    
    # Shutdown
    cloud_sync_task.cancel()
    scheduler_task.cancel()
    logger.info(f"👋 Shutting down {settings.app_name}...")


app = FastAPI(
    title=settings.app_name,
    description="Sistema de videovigilancia empresarial para gestionar cámaras IP",
    version="0.1.0",
    lifespan=lifespan
)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(cameras_router, prefix="/api")
app.include_router(streams_router, prefix="/api")
app.include_router(events_router, prefix="/api")
app.include_router(recordings_router, prefix="/api")
app.include_router(maps_router, prefix="/api")
app.include_router(ptz_router, prefix="/api")
app.include_router(audit_router, prefix="/api")
app.include_router(system_router, prefix="/api")
app.include_router(incidents_router, prefix="/api")
app.include_router(cloud_router, prefix="/api")
app.include_router(backup_router, prefix="/api")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.app_name,
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/api/health"
    }
