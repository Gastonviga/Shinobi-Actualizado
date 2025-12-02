"""
TitanNVR - Notification Service
Enterprise email notifications for detection events
"""
import logging
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from typing import Optional, List, Dict, Any
from datetime import datetime
import aiosmtplib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User, UserRole
from app.models.settings import SystemSettings

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Service for sending email notifications.
    
    Sends alerts to admin users when:
    - Person/vehicle detected
    - Camera goes offline
    - Storage running low
    """
    
    def __init__(self):
        self.smtp_config: Optional[Dict] = None
        self._initialized = False
    
    async def load_config(self, db: AsyncSession) -> bool:
        """Load SMTP configuration from database."""
        try:
            result = await db.execute(
                select(SystemSettings).where(SystemSettings.key == "smtp_config")
            )
            setting = result.scalar_one_or_none()
            
            if setting and setting.value_json:
                self.smtp_config = setting.value_json
                self._initialized = self.smtp_config.get("enabled", False)
                logger.info(f"SMTP config loaded, enabled: {self._initialized}")
                return self._initialized
            
            logger.warning("SMTP configuration not found in database")
            return False
            
        except Exception as e:
            logger.error(f"Failed to load SMTP config: {e}")
            return False
    
    async def get_admin_emails(self, db: AsyncSession) -> List[str]:
        """Get email addresses of all admin users with alerts enabled."""
        result = await db.execute(
            select(User).where(
                User.role == UserRole.ADMIN,
                User.is_active == True,
                User.receive_email_alerts == True,
                User.email.isnot(None)
            )
        )
        users = result.scalars().all()
        return [u.email for u in users if u.email]
    
    async def send_email(
        self,
        to_emails: List[str],
        subject: str,
        body_html: str,
        body_text: Optional[str] = None,
        image_data: Optional[bytes] = None,
        image_name: str = "snapshot.jpg"
    ) -> bool:
        """
        Send email notification.
        
        Args:
            to_emails: List of recipient emails
            subject: Email subject
            body_html: HTML body content
            body_text: Plain text body (optional)
            image_data: Snapshot image bytes (optional)
            image_name: Name for attached image
            
        Returns:
            True if email sent successfully
        """
        if not self._initialized or not self.smtp_config:
            logger.warning("SMTP not configured, skipping email")
            return False
        
        if not to_emails:
            logger.warning("No recipients specified, skipping email")
            return False
        
        try:
            config = self.smtp_config
            
            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = config.get("from_email", "noreply@titannvr.local")
            msg["To"] = ", ".join(to_emails)
            
            # Add text and HTML parts
            if body_text:
                msg.attach(MIMEText(body_text, "plain"))
            msg.attach(MIMEText(body_html, "html"))
            
            # Add image attachment if provided
            if image_data:
                image = MIMEImage(image_data)
                image.add_header("Content-Disposition", "attachment", filename=image_name)
                image.add_header("Content-ID", "<snapshot>")
                msg.attach(image)
            
            # Send email
            use_tls = config.get("use_tls", True)
            
            await aiosmtplib.send(
                msg,
                hostname=config.get("host", ""),
                port=config.get("port", 587),
                username=config.get("username", ""),
                password=config.get("password", ""),
                start_tls=use_tls
            )
            
            logger.info(f"Email sent successfully to {len(to_emails)} recipients")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False
    
    async def send_detection_alert(
        self,
        db: AsyncSession,
        camera_name: str,
        object_type: str,
        confidence: float,
        timestamp: datetime,
        snapshot_url: Optional[str] = None,
        snapshot_data: Optional[bytes] = None
    ) -> bool:
        """
        Send detection alert email to admins.
        
        Args:
            db: Database session
            camera_name: Name of the camera
            object_type: Type of object detected (person, car, etc.)
            confidence: Detection confidence (0-1)
            timestamp: Time of detection
            snapshot_url: URL to snapshot image
            snapshot_data: Snapshot image bytes
        """
        # Load config if not initialized
        if not self._initialized:
            await self.load_config(db)
        
        if not self._initialized:
            return False
        
        # Get admin emails
        admin_emails = await self.get_admin_emails(db)
        if not admin_emails:
            logger.warning("No admin emails configured for alerts")
            return False
        
        # Format timestamp
        time_str = timestamp.strftime("%Y-%m-%d %H:%M:%S")
        confidence_pct = int(confidence * 100)
        
        # Build subject
        subject = f"🚨 TitanNVR Alert: {object_type.title()} detected on {camera_name}"
        
        # Build HTML body
        body_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; }}
                .alert-box {{ background: #fee2e2; border: 1px solid #ef4444; 
                             border-radius: 8px; padding: 20px; margin: 20px 0; }}
                .info-table {{ width: 100%; border-collapse: collapse; }}
                .info-table td {{ padding: 8px; border-bottom: 1px solid #ddd; }}
                .label {{ font-weight: bold; color: #666; width: 150px; }}
                .value {{ color: #333; }}
                .footer {{ color: #888; font-size: 12px; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <h2>🚨 Detection Alert</h2>
            
            <div class="alert-box">
                <strong>{object_type.title()}</strong> detected with 
                <strong>{confidence_pct}%</strong> confidence
            </div>
            
            <table class="info-table">
                <tr>
                    <td class="label">Camera:</td>
                    <td class="value">{camera_name}</td>
                </tr>
                <tr>
                    <td class="label">Object Type:</td>
                    <td class="value">{object_type.title()}</td>
                </tr>
                <tr>
                    <td class="label">Confidence:</td>
                    <td class="value">{confidence_pct}%</td>
                </tr>
                <tr>
                    <td class="label">Time:</td>
                    <td class="value">{time_str}</td>
                </tr>
            </table>
            
            {"<p><img src='cid:snapshot' style='max-width:640px;'/></p>" if snapshot_data else ""}
            
            <p class="footer">
                This is an automated alert from TitanNVR Enterprise.<br>
                To manage alerts, login to your TitanNVR dashboard.
            </p>
        </body>
        </html>
        """
        
        # Plain text version
        body_text = f"""
TitanNVR Detection Alert

{object_type.title()} detected on {camera_name}

Camera: {camera_name}
Object: {object_type}
Confidence: {confidence_pct}%
Time: {time_str}

This is an automated alert from TitanNVR Enterprise.
        """
        
        return await self.send_email(
            to_emails=admin_emails,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
            image_data=snapshot_data
        )
    
    async def send_camera_offline_alert(
        self,
        db: AsyncSession,
        camera_name: str,
        last_seen: datetime
    ) -> bool:
        """Send alert when camera goes offline."""
        if not self._initialized:
            await self.load_config(db)
        
        if not self._initialized:
            return False
        
        admin_emails = await self.get_admin_emails(db)
        if not admin_emails:
            return False
        
        time_str = last_seen.strftime("%Y-%m-%d %H:%M:%S")
        
        subject = f"⚠️ TitanNVR: Camera {camera_name} is OFFLINE"
        
        body_html = f"""
        <html>
        <body>
            <h2>⚠️ Camera Offline Alert</h2>
            <p>Camera <strong>{camera_name}</strong> is not responding.</p>
            <p>Last seen: {time_str}</p>
            <p>Please check the camera connection and network.</p>
        </body>
        </html>
        """
        
        return await self.send_email(
            to_emails=admin_emails,
            subject=subject,
            body_html=body_html
        )


# Singleton instance
notification_service = NotificationService()


async def send_detection_notification(
    db: AsyncSession,
    camera_name: str,
    object_type: str,
    confidence: float,
    timestamp: datetime = None,
    snapshot_data: bytes = None
) -> bool:
    """
    Convenience function to send detection notification.
    
    Call this from event handlers when a detection is confirmed.
    """
    if timestamp is None:
        timestamp = datetime.utcnow()
    
    return await notification_service.send_detection_alert(
        db=db,
        camera_name=camera_name,
        object_type=object_type,
        confidence=confidence,
        timestamp=timestamp,
        snapshot_data=snapshot_data
    )
