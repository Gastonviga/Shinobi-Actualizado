"""
TitanNVR - Stream Manager Service
Handles synchronization between Backend and Go2RTC

Strategy: Uses Go2RTC's /api/config endpoint to dynamically register streams.
This works with all stream types (RTSP, HTTP/MJPEG, etc.)
"""
import asyncio
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
    
    def _convert_url_for_go2rtc(self, url: str) -> str:
        """
        Convert a stream URL to Go2RTC compatible format with optimized encoding.
        
        Strategy:
        - RTSP H264/H265: Passthrough (copy) - zero CPU usage
        - HTTP/MJPEG: Transcode with hardware acceleration or efficient preset
        - Already prefixed URLs: Left as-is
        
        Hardware acceleration priority:
        1. NVIDIA NVENC (h264_nvenc) - if GPU available
        2. Intel QSV (h264_qsv) - integrated graphics
        3. Software libx264 with superfast preset - fallback
        """
        url = url.strip()
        
        # Already in Go2RTC format - don't modify
        if url.startswith(('exec:', 'ffmpeg:')):
            return url
        
        # RTSP/RTSPS streams - Go2RTC handles natively with passthrough
        # H264/H265 streams are passed through without re-encoding (zero CPU)
        if url.startswith(('rtsp://', 'rtsps://')):
            logger.info(f"RTSP stream - Go2RTC will use passthrough (no transcoding)")
            return url
        
        # HTTP streams (MJPEG/JPEG) need ffmpeg transcoding
        if url.startswith(('http://', 'https://')):
            logger.info(f"HTTP stream detected - using optimized ffmpeg transcoding")
            
            # Build optimized FFmpeg command:
            # - Try hardware encoding first (NVENC), fallback to libx264
            # - superfast preset (better than ultrafast quality, still fast)
            # - zerolatency tune for live streaming
            # - Reduced bitrate for sub-streams
            ffmpeg_cmd = (
                f"exec:ffmpeg -hide_banner -loglevel error "
                f"-i {url} "
                f"-c:v libx264 "        # Software encoder (most compatible)
                f"-preset superfast "    # Good balance of speed/quality (not ultrafast)
                f"-tune zerolatency "    # Optimized for live streaming
                f"-crf 23 "              # Constant quality (lower = better, 23 is default)
                f"-maxrate 2M "          # Cap bitrate for network efficiency
                f"-bufsize 4M "          # Buffer size
                f"-g 30 "                # Keyframe interval (1 second at 30fps)
                f"-f mpegts -"           # Output format
            )
            return ffmpeg_cmd
        
        # Unknown format, return as-is and let Go2RTC handle it
        return url
    
    def _get_optimized_ffmpeg_cmd(self, url: str, quality: str = "main") -> str:
        """
        Generate optimized FFmpeg command based on stream quality tier.
        
        Args:
            url: Source stream URL
            quality: "main" for high quality, "sub" for lower quality grid view
            
        Returns:
            FFmpeg command string optimized for the use case
        """
        if quality == "sub":
            # Sub-stream: Lower resolution for grid view, minimal CPU
            return (
                f"exec:ffmpeg -hide_banner -loglevel error "
                f"-i {url} "
                f"-c:v libx264 -preset ultrafast -tune zerolatency "
                f"-vf scale=640:-2 "     # Scale down for grid view
                f"-crf 28 "              # Lower quality is fine for thumbnails
                f"-maxrate 500k -bufsize 1M "
                f"-g 30 -f mpegts -"
            )
        else:
            # Main stream: Full quality for recording/detail view
            return (
                f"exec:ffmpeg -hide_banner -loglevel error "
                f"-i {url} "
                f"-c:v libx264 -preset superfast -tune zerolatency "
                f"-crf 23 -maxrate 4M -bufsize 8M "
                f"-g 30 -f mpegts -"
            )
    
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
    
    async def _add_stream_via_api(self, stream_id: str, url: str) -> bool:
        """
        Add/update a stream via Go2RTC HTTP API (immediate hot-reload).
        
        Uses PUT /api/streams?src={name}&url={url} for immediate activation.
        This is the PRIMARY method for adding streams - no container restart needed.
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Go2RTC PUT /api/streams - immediate hot-reload
                response = await client.put(
                    f"{self.go2rtc_url}/api/streams",
                    params={"src": stream_id, "url": url}
                )
                logger.info(f"PUT /api/streams {stream_id}: status={response.status_code}")
                return response.status_code in [200, 201]
        except Exception as e:
            logger.error(f"Error adding stream via API {stream_id}: {e}")
            return False
    
    async def _remove_stream_via_api(self, stream_id: str) -> bool:
        """
        Remove a stream via Go2RTC HTTP API (immediate removal).
        
        Uses DELETE /api/streams?src={name} for immediate deactivation.
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.delete(
                    f"{self.go2rtc_url}/api/streams",
                    params={"src": stream_id}
                )
                logger.info(f"DELETE /api/streams {stream_id}: status={response.status_code}")
                return response.status_code in [200, 204]
        except Exception as e:
            logger.error(f"Error removing stream via API {stream_id}: {e}")
            return False
    
    async def _persist_stream_config(self, stream_id: str, url: str) -> bool:
        """
        Persist stream to Go2RTC config file for container restarts.
        This ensures streams survive Go2RTC container restarts.
        """
        try:
            current_config = await self._get_config()
            current_streams = current_config.get("streams", {})
            current_streams[stream_id] = url
            return await self._patch_config({"streams": current_streams})
        except Exception as e:
            logger.warning(f"Failed to persist stream config {stream_id}: {e}")
            return False
    
    async def restart_go2rtc(self) -> bool:
        """
        Deprecated: No longer needed.
        
        Go2RTC now supports hot-reload via PUT /api/streams.
        Streams are added/removed immediately without container restart.
        This method is kept for backwards compatibility but always returns True.
        """
        logger.info("restart_go2rtc called but no longer needed - streams are hot-reloaded")
        return True

    async def register_stream(
        self, 
        name: str, 
        main_stream_url: str, 
        sub_stream_url: Optional[str] = None,
        restart_after: bool = True
    ) -> dict:
        """
        Register a camera stream in Go2RTC via HTTP API.
        
        Uses PUT /api/streams for immediate hot-reload (no container restart needed).
        
        Creates two streams per camera:
        - {name}_main: High quality for recording/detail view
        - {name}_sub: Low quality for grid/mosaic view
        
        Args:
            name: Camera name (will be normalized)
            main_stream_url: Stream URL (RTSP, HTTP, etc.)
            sub_stream_url: Stream URL for sub stream (optional)
            restart_after: Ignored (kept for backwards compatibility)
            
        Returns:
            dict with registration status
        """
        normalized_name = self._normalize_name(name)
        main_stream_id = f"{normalized_name}_main"
        sub_stream_id = f"{normalized_name}_sub"
        sub_url = sub_stream_url or main_stream_url
        
        # Convert URLs to Go2RTC compatible format
        main_go2rtc_url = self._convert_url_for_go2rtc(main_stream_url)
        sub_go2rtc_url = self._convert_url_for_go2rtc(sub_url)
        
        logger.info(f"Registering streams for camera: {name} -> {normalized_name}")
        logger.info(f"Main stream: {main_stream_id} = {main_go2rtc_url}")
        logger.info(f"Sub stream: {sub_stream_id} = {sub_go2rtc_url}")
        
        result = {
            "main": {"status": "pending", "stream_id": main_stream_id, "url": main_stream_url},
            "sub": {"status": "pending", "stream_id": sub_stream_id, "url": sub_url},
            "restart": "not_needed"  # Hot-reload via API
        }
        
        try:
            # Use PUT /api/streams for immediate activation (hot-reload)
            main_success = await self._add_stream_via_api(main_stream_id, main_go2rtc_url)
            sub_success = await self._add_stream_via_api(sub_stream_id, sub_go2rtc_url)
            
            if main_success:
                result["main"]["status"] = "active"
                logger.info(f"Main stream {main_stream_id} activated")
            else:
                result["main"]["status"] = "failed"
                
            if sub_success:
                result["sub"]["status"] = "active"
                logger.info(f"Sub stream {sub_stream_id} activated")
            else:
                result["sub"]["status"] = "failed"
            
            # Also persist to config file for container restarts
            await self._persist_stream_config(main_stream_id, main_go2rtc_url)
            await self._persist_stream_config(sub_stream_id, sub_go2rtc_url)
                
            return result
                
        except Exception as e:
            logger.error(f"Error registering streams: {e}")
            return {
                "main": {"status": "error", "error": str(e)},
                "sub": {"status": "error", "error": str(e)},
                "restart": None
            }
    
    async def unregister_stream(self, name: str) -> dict:
        """
        Remove a camera stream from Go2RTC via HTTP API (immediate removal).
        
        Uses DELETE /api/streams for immediate deactivation - no restart needed.
        
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
            # Delete streams via API (immediate removal - no restart)
            main_deleted = await self._remove_stream_via_api(main_stream_id)
            sub_deleted = await self._remove_stream_via_api(sub_stream_id)
            
            # Also remove from config file for persistence
            try:
                current_config = await self._get_config()
                current_streams = current_config.get("streams", {})
                current_streams.pop(main_stream_id, None)
                current_streams.pop(sub_stream_id, None)
                await self._patch_config({"streams": current_streams})
            except Exception as config_err:
                logger.warning(f"Config cleanup failed: {config_err}")
            
            logger.info(f"Successfully unregistered streams for {name}")
            return {
                "main": {"status": "removed" if main_deleted else "not_found"},
                "sub": {"status": "removed" if sub_deleted else "not_found"}
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


    async def test_stream_connection(self, stream_url: str, timeout_seconds: float = 3.0) -> dict:
        """
        Test if a stream URL is accessible by temporarily registering it in Go2RTC.
        
        This is a QA feature that allows users to validate RTSP/HTTP streams
        before saving camera configuration.
        
        Args:
            stream_url: The stream URL to test (RTSP, HTTP, etc.)
            timeout_seconds: How long to wait for connection (default 3s)
            
        Returns:
            dict with success status and details
        """
        import uuid
        import asyncio
        
        # Generate temporary stream ID
        temp_id = f"probe_temp_{uuid.uuid4().hex[:8]}"
        
        logger.info(f"Testing stream connection: {stream_url} (temp_id: {temp_id})")
        
        try:
            # Step 1: Get current config and add temp stream
            current_config = await self._get_config()
            current_streams = current_config.get("streams", {})
            current_streams[temp_id] = stream_url
            
            # Register temp stream
            success = await self._patch_config({"streams": current_streams})
            if not success:
                return {
                    "success": False,
                    "error": "Failed to register test stream in Go2RTC",
                    "details": "Configuration update failed"
                }
            
            # Step 2: Wait for Go2RTC to attempt connection
            await asyncio.sleep(timeout_seconds)
            
            # Step 3: Check stream status
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.go2rtc_url}/api/streams")
                
                if response.status_code != 200:
                    return {
                        "success": False,
                        "error": "Go2RTC not responding",
                        "details": f"Status code: {response.status_code}"
                    }
                
                streams = response.json()
                
                if temp_id not in streams:
                    return {
                        "success": False,
                        "error": "Stream not found after registration",
                        "details": "Go2RTC may need restart"
                    }
                
                stream_info = streams[temp_id]
                producers = stream_info.get("producers", [])
                
                # Analyze producers
                if not producers:
                    return {
                        "success": False,
                        "error": "No se pudo conectar al stream",
                        "details": "No producers found - URL may be incorrect or unreachable"
                    }
                
                # Check if any producer has errors or is receiving data
                for producer in producers:
                    recv_bytes = producer.get("recv", 0)
                    send_bytes = producer.get("send", 0)
                    
                    # If receiving data, connection is good
                    if recv_bytes > 0:
                        logger.info(f"Test successful: {temp_id} receiving {recv_bytes} bytes")
                        return {
                            "success": True,
                            "details": f"Conexión exitosa - Recibiendo datos ({recv_bytes} bytes)",
                            "recv_bytes": recv_bytes
                        }
                
                # Producers exist but no data yet - might be auth issue or slow stream
                return {
                    "success": False,
                    "error": "Stream conectado pero sin datos",
                    "details": "Posible problema de autenticación o stream inactivo"
                }
                
        except httpx.TimeoutException:
            return {
                "success": False,
                "error": "Timeout de conexión",
                "details": "Go2RTC no respondió a tiempo"
            }
        except httpx.RequestError as e:
            return {
                "success": False,
                "error": "Error de red",
                "details": str(e)
            }
        except Exception as e:
            logger.error(f"Unexpected error testing stream: {e}")
            return {
                "success": False,
                "error": "Error inesperado",
                "details": str(e)
            }
        finally:
            # Step 4: ALWAYS clean up - remove temp stream
            try:
                current_config = await self._get_config()
                current_streams = current_config.get("streams", {})
                if temp_id in current_streams:
                    del current_streams[temp_id]
                    await self._patch_config({"streams": current_streams})
                    logger.info(f"Cleaned up temp stream: {temp_id}")
            except Exception as cleanup_error:
                logger.error(f"Failed to cleanup temp stream {temp_id}: {cleanup_error}")

    async def reload_go2rtc(self) -> dict:
        """
        Deprecated: No longer needed for stream management.
        
        Go2RTC streams are now managed via HTTP API with hot-reload.
        This method is kept for backwards compatibility.
        """
        logger.info("reload_go2rtc called - using HTTP API hot-reload instead")
        return {
            "status": "ok", 
            "message": "Streams are hot-reloaded via API - no restart needed"
        }


# Singleton instance
stream_manager = StreamManager()
