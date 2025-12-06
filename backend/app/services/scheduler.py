"""
TitanNVR - Recording Scheduler Service
Applies time-based recording modes to cameras.
"""
import asyncio
import logging
from datetime import datetime, time
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import async_session_maker
from app.models.camera import Camera, CameraSchedule, RecordingMode

logger = logging.getLogger(__name__)


class SchedulerService:
    """
    Service that periodically checks and applies camera schedules.
    
    Runs every minute to verify if any camera's recording mode
    needs to change based on the current time and day.
    """
    
    def __init__(self):
        self._running = False
        self._sync_callback = None
    
    def set_sync_callback(self, callback):
        """Set the callback to sync cameras to Frigate."""
        self._sync_callback = callback
    
    async def check_and_apply_schedules(self) -> int:
        """
        Check all cameras with schedules and apply the correct recording mode.
        
        Returns the number of cameras that were updated.
        """
        now = datetime.now()
        current_day = now.weekday()  # 0=Monday, 6=Sunday
        current_time = now.time()
        
        updated_count = 0
        cameras_to_sync = []
        
        try:
            async with async_session_maker() as session:
                # Get all active cameras with their schedules
                result = await session.execute(
                    select(Camera)
                    .where(Camera.is_active == True)
                    .options(selectinload(Camera.schedules))
                )
                cameras = result.scalars().all()
                
                for camera in cameras:
                    if not camera.schedules:
                        continue
                    
                    # Find applicable schedule for current time
                    applicable_mode = self._find_applicable_mode(
                        camera.schedules, 
                        current_day, 
                        current_time
                    )
                    
                    if applicable_mode is None:
                        # No schedule applies right now, keep current mode
                        continue
                    
                    # Check if mode needs to change
                    if camera.recording_mode != applicable_mode:
                        old_mode = camera.recording_mode
                        camera.recording_mode = applicable_mode
                        updated_count += 1
                        cameras_to_sync.append(camera.name)
                        
                        logger.info(
                            f"📅 Schedule: Camera '{camera.name}' mode changed: "
                            f"{old_mode.value} → {applicable_mode.value}"
                        )
                
                # Commit all changes
                if updated_count > 0:
                    await session.commit()
                    logger.info(f"📅 Scheduler: Updated {updated_count} camera(s)")
                    
        except Exception as e:
            logger.error(f"Scheduler error: {e}")
            return 0
        
        # Trigger Frigate sync if any cameras were updated
        if updated_count > 0 and self._sync_callback:
            try:
                await self._sync_callback()
                logger.info(f"📅 Scheduler: Frigate config synced for {cameras_to_sync}")
            except Exception as e:
                logger.error(f"Scheduler: Failed to sync Frigate: {e}")
        
        return updated_count
    
    def _find_applicable_mode(
        self, 
        schedules: list, 
        current_day: int, 
        current_time: time
    ) -> Optional[RecordingMode]:
        """
        Find the recording mode that applies at the current time.
        
        Searches through all schedule slots for the camera and returns
        the mode if the current time falls within a slot's range.
        """
        for schedule in schedules:
            if schedule.day_of_week != current_day:
                continue
            
            # Check if current time is within this schedule slot
            start = schedule.start_time
            end = schedule.end_time
            
            # Handle same-day schedules (start < end)
            if start <= end:
                if start <= current_time <= end:
                    return schedule.mode
            else:
                # Handle overnight schedules (end < start, e.g., 22:00-06:00)
                # This slot spans midnight, check if we're after start OR before end
                if current_time >= start or current_time <= end:
                    return schedule.mode
        
        return None
    
    async def run(self, interval_seconds: int = 60):
        """
        Run the scheduler loop.
        
        Args:
            interval_seconds: How often to check schedules (default: 60 seconds)
        """
        self._running = True
        logger.info(f"📅 Scheduler started (checking every {interval_seconds}s)")
        
        while self._running:
            try:
                await self.check_and_apply_schedules()
            except Exception as e:
                logger.error(f"Scheduler loop error: {e}")
            
            await asyncio.sleep(interval_seconds)
    
    def stop(self):
        """Stop the scheduler loop."""
        self._running = False
        logger.info("📅 Scheduler stopped")


# Global scheduler instance
scheduler_service = SchedulerService()


async def run_scheduler(interval_seconds: int = 60):
    """
    Convenience function to run the scheduler.
    Called from main.py as a background task.
    """
    await scheduler_service.run(interval_seconds)


async def periodic_schedule_check(interval_seconds: int = 60):
    """
    Alternative periodic scheduler that integrates with existing patterns.
    Runs indefinitely, checking schedules at the specified interval.
    """
    from app.routers.cameras import sync_all_to_frigate
    
    scheduler_service.set_sync_callback(sync_all_to_frigate)
    
    logger.info(f"📅 Recording Scheduler started (interval: {interval_seconds}s)")
    
    while True:
        try:
            await scheduler_service.check_and_apply_schedules()
        except Exception as e:
            logger.error(f"Periodic schedule check error: {e}")
        
        await asyncio.sleep(interval_seconds)
