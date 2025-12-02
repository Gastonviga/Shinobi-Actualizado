"""
TitanNVR - API Routers
"""
from app.routers.cameras import router as cameras_router
from app.routers.health import router as health_router
from app.routers.streams import router as streams_router

__all__ = ["cameras_router", "health_router", "streams_router"]
