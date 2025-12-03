"""
TitanNVR - Application Configuration
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


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
