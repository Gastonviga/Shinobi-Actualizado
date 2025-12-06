"""
TitanNVR - Configuration Generator Service
Enterprise v2.0 - Dynamic Frigate configuration with intelligent recording modes
"""
import yaml
import httpx
import logging
import os
from typing import List, Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Configuration paths
FRIGATE_CONFIG_PATH = os.getenv("FRIGATE_CONFIG_PATH", "/config/frigate.yml")
FRIGATE_API_URL = os.getenv("FRIGATE_URL", "http://frigate:5000")
GO2RTC_RTSP_URL = "rtsp://go2rtc:8554"

# Recording mode mapping to Frigate retain mode
RECORDING_MODE_MAP = {
    "continuous": "all",           # Record 24/7, maximum storage usage
    "motion": "motion",            # Record only when motion detected
    "events": "active_objects"     # Record only on AI detection (max space saving)
}


class FrigateConfigGenerator:
    """
    Generates Frigate NVR configuration dynamically.
    
    This allows cameras to be added/removed via the API
    without manually editing configuration files.
    """
    
    def __init__(self, config_path: str = None):
        self.config_path = Path(config_path or FRIGATE_CONFIG_PATH)
        self.frigate_url = FRIGATE_API_URL
        
    def _get_base_config(self) -> Dict[str, Any]:
        """
        Get base Frigate configuration.
        Compatible with Frigate 0.14+
        """
        return {
            # Frigate version for config compatibility
            "version": "0.14",
            
            "mqtt": {
                "enabled": True,
                "host": "mqtt",
                "port": 1883,
                "topic_prefix": "frigate",
                "client_id": "frigate"
            },
            "detectors": {
                "cpu1": {
                    "type": "cpu",
                    "num_threads": 2
                }
            },
            "database": {
                "path": "/media/frigate/frigate.db"
            },
            "model": {
                "width": 320,
                "height": 320
            },
            # Global record settings (can be overridden per camera)
            "record": {
                "enabled": True,
                "retain": {
                    "days": 7,
                    "mode": "motion"
                },
                "alerts": {
                    "retain": {
                        "days": 14
                    }
                },
                "detections": {
                    "retain": {
                        "days": 14
                    }
                }
            },
            "snapshots": {
                "enabled": True,
                "timestamp": True,
                "bounding_box": True,
                "retain": {
                    "default": 14
                }
            },
            # Global detection settings
            "detect": {
                "enabled": True
            },
            "objects": {
                "track": ["person", "car", "dog", "cat"],
                "filters": {
                    "person": {
                        "min_score": 0.5,
                        "threshold": 0.7
                    }
                }
            },
            "go2rtc": {
                "streams": {}
            },
            "ui": {
                "timezone": "America/Argentina/Buenos_Aires"
            },
            "logger": {
                "default": "info",
                "logs": {
                    "frigate.event": "debug"
                }
            }
        }
    
    def _normalize_name(self, name: str) -> str:
        """Normalize camera name for Frigate (no spaces, lowercase)"""
        return name.lower().replace(" ", "_").replace("-", "_")
    
    def _generate_camera_config(
        self, 
        name: str,
        retention_days: int = 7,
        recording_mode: str = "motion",
        event_retention_days: int = 14,
        detect_width: int = 1280,
        detect_height: int = 720,
        detect_fps: int = 5,
        objects: List[str] = None,
        zones_config: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Generate camera configuration for Frigate.
        
        Enterprise v2.0 Features:
        - Dynamic retention days from database
        - Intelligent recording modes (continuous/motion/events)
        - Zone configuration support
        
        Recording Modes:
        - continuous: 24/7 recording (mode: all) - Maximum storage
        - motion: Motion-triggered recording - Balanced
        - events: AI detection only (mode: active_objects) - Minimum storage
        """
        normalized_name = self._normalize_name(name)
        
        # Map recording mode to Frigate retain mode
        frigate_retain_mode = RECORDING_MODE_MAP.get(recording_mode, "motion")
        
        logger.info(
            f"Camera {name}: retention={retention_days}d, "
            f"mode={recording_mode}→{frigate_retain_mode}, "
            f"event_retention={event_retention_days}d"
        )
        
        config = {
            "enabled": True,
            "ffmpeg": {
                "inputs": [
                    {
                        # Use sub stream for detection (lower CPU usage)
                        "path": f"{GO2RTC_RTSP_URL}/{normalized_name}_sub",
                        "roles": ["detect"]
                    },
                    {
                        # Use main stream for recording (full quality)
                        "path": f"{GO2RTC_RTSP_URL}/{normalized_name}_main",
                        "roles": ["record"]
                    }
                ]
            },
            "detect": {
                "enabled": True,
                "width": detect_width,
                "height": detect_height,
                "fps": detect_fps
            },
            # Frigate 0.14+ record structure
            "record": {
                "enabled": True,
                "retain": {
                    "days": retention_days,
                    "mode": frigate_retain_mode
                },
                "alerts": {
                    "retain": {
                        "days": event_retention_days
                    }
                },
                "detections": {
                    "retain": {
                        "days": event_retention_days
                    }
                }
            },
            "snapshots": {
                "enabled": True,
                "retain": {
                    "default": event_retention_days
                }
            },
            "objects": {
                "track": objects or ["person"]
            }
        }
        
        # Add zones if configured
        if zones_config:
            config["zones"] = zones_config
        
        return config
    
    def generate_config(self, cameras: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Generate complete Frigate configuration.
        
        Enterprise v2.0: Uses per-camera settings from database:
        - retention_days: Days to keep recordings
        - recording_mode: continuous | motion | events
        - event_retention_days: Days to keep event clips
        - zones_config: Detection zones
        
        Args:
            cameras: List of camera dictionaries from database
            
        Returns:
            Complete Frigate configuration dictionary
        """
        config = self._get_base_config()
        config["cameras"] = {}
        
        # Add Go2RTC streams for live view
        go2rtc_streams = {}
        
        for camera in cameras:
            if not camera.get("is_active", True):
                continue
                
            name = camera.get("name", "")
            if not name:
                continue
            
            normalized_name = self._normalize_name(name)
            
            # Get recording mode value (handle enum or string)
            recording_mode = camera.get("recording_mode", "motion")
            if hasattr(recording_mode, 'value'):
                recording_mode = recording_mode.value
            
            # Add camera to Frigate config with enterprise settings
            config["cameras"][normalized_name] = self._generate_camera_config(
                name=name,
                retention_days=camera.get("retention_days", 7),
                recording_mode=recording_mode,
                event_retention_days=camera.get("event_retention_days", 14),
                detect_width=camera.get("detect_width", 1280),
                detect_height=camera.get("detect_height", 720),
                detect_fps=camera.get("detect_fps", 5),
                objects=camera.get("objects", ["person"]),
                zones_config=camera.get("zones_config")
            )
            
            # Add to Go2RTC streams for WebRTC playback
            go2rtc_streams[f"{normalized_name}_sub"] = f"{GO2RTC_RTSP_URL}/{normalized_name}_sub"
            go2rtc_streams[f"{normalized_name}_main"] = f"{GO2RTC_RTSP_URL}/{normalized_name}_main"
        
        config["go2rtc"]["streams"] = go2rtc_streams
        
        return config
    
    def write_config(self, config: Dict[str, Any]) -> bool:
        """
        Write configuration to file.
        
        Args:
            config: Configuration dictionary
            
        Returns:
            True if successful
        """
        try:
            # Ensure directory exists
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write YAML with nice formatting
            yaml_content = yaml.dump(
                config, 
                default_flow_style=False,
                allow_unicode=True,
                sort_keys=False
            )
            
            # Add header comment
            header = "# TitanNVR - Frigate Configuration\n"
            header += "# Auto-generated - DO NOT EDIT MANUALLY\n"
            header += "# Changes will be overwritten when cameras are modified\n\n"
            
            self.config_path.write_text(header + yaml_content)
            logger.info(f"Frigate config written to {self.config_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to write Frigate config: {e}")
            return False
    
    async def restart_frigate(self) -> Dict[str, Any]:
        """
        Restart Frigate to apply configuration changes.
        
        Returns:
            Status dictionary
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(f"{self.frigate_url}/api/restart")
                
                if response.status_code == 200:
                    logger.info("Frigate restart initiated")
                    return {"status": "ok", "message": "Frigate restart initiated"}
                else:
                    logger.warning(f"Frigate restart returned {response.status_code}")
                    return {
                        "status": "warning",
                        "message": f"Restart returned status {response.status_code}"
                    }
                    
        except httpx.ConnectError:
            logger.warning("Frigate not available (may not be running yet)")
            return {"status": "unavailable", "message": "Frigate not running"}
        except Exception as e:
            logger.error(f"Failed to restart Frigate: {e}")
            return {"status": "error", "message": str(e)}
    
    async def sync_cameras(self, cameras: List[Dict[str, Any]], restart: bool = True) -> Dict[str, Any]:
        """
        Sync all cameras to Frigate configuration.
        
        Args:
            cameras: List of camera dictionaries
            restart: Whether to restart Frigate after sync
            
        Returns:
            Status dictionary
        """
        # Generate config
        config = self.generate_config(cameras)
        camera_count = len(config.get("cameras", {}))
        
        # Write to file
        if not self.write_config(config):
            return {
                "status": "error",
                "message": "Failed to write configuration"
            }
        
        result = {
            "status": "ok",
            "cameras_configured": camera_count,
            "config_path": str(self.config_path)
        }
        
        # Restart Frigate if requested
        if restart:
            restart_result = await self.restart_frigate()
            result["restart"] = restart_result
        
        return result


# Singleton instance
frigate_config = FrigateConfigGenerator()


async def sync_frigate_config(cameras: List[Dict[str, Any]], restart: bool = True) -> Dict[str, Any]:
    """
    Convenience function to sync Frigate configuration.
    
    Call this when cameras are created, updated, or deleted.
    """
    return await frigate_config.sync_cameras(cameras, restart)
