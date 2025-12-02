"""
TitanNVR - System Settings Model
Key-value store for system configuration and branding
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.dialects.sqlite import JSON
from app.database import Base


class SystemSettings(Base):
    """
    Key-value store for system-wide settings.
    
    Common keys:
    - system_title: Display name (e.g., "TitanNVR Enterprise")
    - theme_color: Primary color hex (e.g., "#3B82F6")
    - logo_url: URL or path to custom logo
    - smtp_config: JSON with email server configuration
    - company_name: Customer company name
    - timezone: System timezone
    """
    __tablename__ = "system_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    value_json = Column(JSON, nullable=True)  # For complex values like SMTP config
    description = Column(String(255), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<SystemSettings(key='{self.key}')>"


# Default settings to be created on first run
DEFAULT_SETTINGS = [
    {
        "key": "system_title",
        "value": "TitanNVR Enterprise",
        "description": "System display name shown in header and browser tab"
    },
    {
        "key": "theme_color",
        "value": "#3B82F6",
        "description": "Primary theme color (hex)"
    },
    {
        "key": "logo_url",
        "value": None,
        "description": "URL or path to custom logo image"
    },
    {
        "key": "company_name",
        "value": "Your Company",
        "description": "Company name for branding"
    },
    {
        "key": "smtp_config",
        "value_json": {
            "enabled": False,
            "host": "",
            "port": 587,
            "username": "",
            "password": "",
            "from_email": "",
            "use_tls": True
        },
        "description": "SMTP server configuration for email notifications"
    },
    {
        "key": "timezone",
        "value": "America/Argentina/Buenos_Aires",
        "description": "System timezone"
    },
    {
        "key": "retention_default_days",
        "value": "7",
        "description": "Default recording retention in days"
    }
]
