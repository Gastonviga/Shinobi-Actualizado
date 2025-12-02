"""
TitanNVR - Stream Manager Service
Handles synchronization between Backend and Go2RTC

Strategy: Uses Go2RTC's /api/config endpoint to dynamically register streams.
This works with all stream types (RTSP, HTTP/MJPEG, etc.)
"""
import httpx
import logging
import yaml
from typing import Optional, Dict, Any
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class StreamManager:
    """
    Manages stream registration and synchronization with Go2RTC.
    
    Go2RTC API Reference:
    - GET /api/config - Get current YAML configuration
    - PATCH /api/config - Update YAML configuration (streams section)
    - GET /api/streams - List all active streams
    
    Note: After PATCH, Go2RTC updates the config file but doesn't reload
    streams automatically. Streams become active after Go2RTC restart.
    """
    
    def __init__(self, go2rtc_url: str = None):
        self.go2rtc_url = go2rtc_url or settings.go2rtc_url
        self.timeout = 10.0
    
    def _normalize_name(self, name: str) -> str:
        """
        Normalize camera name for Go2RTC stream ID.
        Removes spaces and special characters.
        """
        return name.lower().replace(" ", "_").replace("-", "_")
    
    async def _get_config(self) -> Dict[str, Any]:
        """Get current Go2RTC configuration as dict."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.go2rtc_url}/api/config")
            if response.status_code == 200:
                return yaml.safe_load(response.text)
            return {}
    
    async def _patch_config(self, config_update: Dict[str, Any]) -> bool:
        """
        Patch Go2RTC configuration.
        Only updates the 'streams' section to avoid overwriting other settings.
        """
        yaml_content = yaml.dump(config_update, default_flow_style=False)
        logger.info(f"Patching Go2RTC config with:\n{yaml_content}")
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.patch(
                f"{self.go2rtc_url}/api/config",
                content=yaml_content,
                headers={"Content-Type": "text/yaml"}
            )
            logger.info(f"PATCH response: {response.status_code}")
            return response.status_code == 200
    
    async def register_stream(
        self, 
        name: str, 
        main_stream_url: str, 
        sub_stream_url: Optional[str] = None
    ) -> dict:
        """
        Register a camera stream in Go2RTC via config update.
        
        Creates two streams per camera:
        - {name}_main: High quality for recording/detail view
        - {name}_sub: Low quality for grid/mosaic view
        
        Args:
            name: Camera name (will be normalized)
            main_stream_url: Stream URL (RTSP, HTTP, etc.)
            sub_stream_url: Stream URL for sub stream (optional)
            
        Returns:
            dict with registration status
        """
        normalized_name = self._normalize_name(name)
        main_stream_id = f"{normalized_name}_main"
        sub_stream_id = f"{normalized_name}_sub"
        sub_url = sub_stream_url or main_stream_url
        
        logger.info(f"Registering streams for camera: {name} -> {normalized_name}")
        logger.info(f"Main stream: {main_stream_id} = {main_stream_url}")
        logger.info(f"Sub stream: {sub_stream_id} = {sub_url}")
        
        try:
            # Get current config
            current_config = await self._get_config()
            current_streams = current_config.get("streams", {})
            
            # Add new streams
            current_streams[main_stream_id] = main_stream_url
            current_streams[sub_stream_id] = sub_url
            
            # Patch config with updated streams
            success = await self._patch_config({"streams": current_streams})
            
            if success:
                logger.info(f"Successfully registered streams for {name}")
                return {
                    "main": {
                        "status": "registered",
                        "stream_id": main_stream_id,
                        "url": main_stream_url
                    },
                    "sub": {
                        "status": "registered", 
                        "stream_id": sub_stream_id,
                        "url": sub_url
                    },
                    "note": "Streams added to config. Active after Go2RTC reload."
                }
            else:
                logger.error(f"Failed to patch config for {name}")
                return {
                    "main": {"status": "failed", "stream_id": main_stream_id},
                    "sub": {"status": "failed", "stream_id": sub_stream_id}
                }
                
        except Exception as e:
            logger.error(f"Error registering streams: {e}")
            return {
                "main": {"status": "error", "error": str(e)},
                "sub": {"status": "error", "error": str(e)}
            }
    
    async def unregister_stream(self, name: str) -> dict:
        """
        Remove a camera stream from Go2RTC config.
        
        Args:
            name: Camera name
            
        Returns:
            dict with unregistration status
        """
        normalized_name = self._normalize_name(name)
        main_stream_id = f"{normalized_name}_main"
        sub_stream_id = f"{normalized_name}_sub"
        
        logger.info(f"Unregistering streams for camera: {name}")
        
        try:
            # Get current config
            current_config = await self._get_config()
            current_streams = current_config.get("streams", {})
            
            # Remove streams
            removed_main = current_streams.pop(main_stream_id, None) is not None
            removed_sub = current_streams.pop(sub_stream_id, None) is not None
            
            # Patch config with updated streams
            success = await self._patch_config({"streams": current_streams})
            
            if success:
                logger.info(f"Successfully unregistered streams for {name}")
                return {
                    "main": {"status": "removed" if removed_main else "not_found"},
                    "sub": {"status": "removed" if removed_sub else "not_found"},
                    "note": "Streams removed from config. Takes effect after Go2RTC reload."
                }
            else:
                return {
                    "main": {"status": "error"},
                    "sub": {"status": "error"}
                }
                
        except Exception as e:
            logger.error(f"Error unregistering streams: {e}")
            return {
                "main": {"status": "error", "error": str(e)},
                "sub": {"status": "error", "error": str(e)}
            }
    
    async def get_all_streams(self) -> dict:
        """
        Get all streams currently registered in Go2RTC.
        
        Returns:
            dict with all streams or error
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.get(f"{self.go2rtc_url}/api/streams")
                if response.status_code == 200:
                    return {"status": "ok", "streams": response.json()}
                return {"status": "error", "status_code": response.status_code}
            except httpx.RequestError as e:
                return {"status": "error", "error": str(e)}
    
    async def check_connection(self) -> bool:
        """
        Check if Go2RTC is reachable.
        
        Returns:
            True if connected, False otherwise
        """
        async with httpx.AsyncClient(timeout=5.0) as client:
            try:
                response = await client.get(f"{self.go2rtc_url}/api")
                return response.status_code == 200
            except httpx.RequestError:
                return False
    
    async def check_stream_status(self, name: str) -> dict:
        """
        Check if a camera stream is actually online/producing frames.
        
        Uses Go2RTC API to check if the stream has active producers.
        
        Args:
            name: Camera name
            
        Returns:
            dict with status: "online", "offline", or "unknown"
        """
        normalized_name = self._normalize_name(name)
        stream_id = f"{normalized_name}_sub"  # Check sub stream (used for display)
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.go2rtc_url}/api/streams")
                
                if response.status_code != 200:
                    return {"status": "unknown", "details": "Go2RTC not responding"}
                
                streams = response.json()
                
                if stream_id not in streams:
                    return {"status": "offline", "details": "Stream not registered"}
                
                stream_info = streams[stream_id]
                producers = stream_info.get("producers", [])
                
                # Check if any producer is active
                if not producers:
                    return {"status": "offline", "details": "No producers"}
                
                # Check producer status - if it has recv bytes, it's receiving data
                for producer in producers:
                    recv = producer.get("recv", 0)
                    if recv > 0:
                        return {"status": "online", "details": f"Receiving data: {recv} bytes"}
                
                # Producers exist but no data yet - might be connecting
                return {"status": "connecting", "details": "Waiting for data"}
                
        except httpx.RequestError as e:
            logger.error(f"Error checking stream status: {e}")
            return {"status": "unknown", "details": str(e)}
    
    def get_stream_urls(self, name: str) -> dict:
        """
        Get the streaming URLs for a camera.
        
        Args:
            name: Camera name
            
        Returns:
            dict with WebRTC, MSE, and HLS URLs for main and sub streams
        """
        normalized_name = self._normalize_name(name)
        base_url = self.go2rtc_url
        
        return {
            "main": {
                "webrtc": f"{base_url}/api/webrtc?src={normalized_name}_main",
                "mse": f"{base_url}/api/stream.mp4?src={normalized_name}_main",
                "hls": f"{base_url}/api/stream.m3u8?src={normalized_name}_main",
                "mjpeg": f"{base_url}/api/frame.jpeg?src={normalized_name}_main",
            },
            "sub": {
                "webrtc": f"{base_url}/api/webrtc?src={normalized_name}_sub",
                "mse": f"{base_url}/api/stream.mp4?src={normalized_name}_sub",
                "hls": f"{base_url}/api/stream.m3u8?src={normalized_name}_sub",
                "mjpeg": f"{base_url}/api/frame.jpeg?src={normalized_name}_sub",
            }
        }


    async def reload_go2rtc(self) -> dict:
        """
        Restart Go2RTC container to reload configuration.
        
        Requires Docker socket to be mounted.
        """
        import os
        container_name = os.getenv("GO2RTC_CONTAINER", "titan-go2rtc")
        
        logger.info(f"Attempting to restart Go2RTC container: {container_name}")
        
        try:
            import docker
            client = docker.from_env()
            container = client.containers.get(container_name)
            container.restart(timeout=10)
            logger.info(f"Go2RTC container restarted successfully")
            return {"status": "ok", "message": f"Container {container_name} restarted"}
        except ImportError:
            logger.warning("Docker SDK not installed")
            return {"status": "error", "message": "Docker SDK not available"}
        except Exception as e:
            logger.error(f"Failed to restart Go2RTC: {e}")
            return {"status": "error", "message": str(e)}


# Singleton instance
stream_manager = StreamManager()
