"""
TitanNVR - Application Configuration
"""
import os
import sys
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


def get_absolute_storage_path() -> str:
    """
    Get the absolute storage path based on environment.
    - Docker: /app/storage (mounted volume)
    - Local Windows/Mac: TitanNVR/storage
    """
    # Check if running in Docker (Linux + /app/storage exists)
    docker_path = Path("/app/storage")
    if sys.platform.startswith('linux') and docker_path.exists():
        return "/app/storage"
    
    # Local development - use project root storage
    # Go from config.py -> app/ -> backend/ -> TitanNVR/
    project_root = Path(__file__).parent.parent.parent
    storage_path = project_root / "storage"
    storage_path.mkdir(parents=True, exist_ok=True)
    return str(storage_path)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application
    app_name: str = "TitanNVR"
    debug: bool = True
    
    # Database
    # SQLite for development, PostgreSQL for production
    database_url: str = "sqlite+aiosqlite:///./storage/titannvr.db"
    
    # Go2RTC Configuration
    go2rtc_url: str = "http://go2rtc:1984"
    go2rtc_container: str = "titan-go2rtc"  # Docker container name for restart
    
    # Storage
    storage_path: str = "./storage"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
