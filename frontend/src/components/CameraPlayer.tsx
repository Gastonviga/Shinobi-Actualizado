import { useState, useEffect, useRef } from 'react'
import { VideoOff, Volume2, VolumeX, Maximize2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GO2RTC_URL } from '@/lib/api'

interface CameraPlayerProps {
  cameraName: string
  quality?: 'main' | 'sub'
  className?: string
  showControls?: boolean
  onFullscreen?: () => void
}

// Normalize camera name to match backend format
const normalizeName = (name: string): string => {
  return name.toLowerCase().replace(/ /g, '_').replace(/-/g, '_')
}

/**
 * CameraPlayer - Multi-protocol video player for Go2RTC streams
 * 
 * Tries multiple methods in order:
 * 1. MSE/MP4 stream (low latency, best quality)
 * 2. MJPEG fallback (higher compatibility)
 */
export function CameraPlayer({
  cameraName,
  quality = 'sub',
  className,
  showControls = true,
  onFullscreen,
}: CameraPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [useMjpeg, setUseMjpeg] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [mjpegKey, setMjpegKey] = useState(0) // Key to force MJPEG img reconnection

  // Build stream ID
  const streamId = `${normalizeName(cameraName)}_${quality}`
  
  // Stream URLs
  const mp4Url = `${GO2RTC_URL}/api/stream.mp4?src=${streamId}`
  const mjpegUrl = `${GO2RTC_URL}/api/stream.mjpeg?src=${streamId}`
  const posterUrl = `${GO2RTC_URL}/api/frame.jpeg?src=${streamId}`

  // Log URLs for debugging
  useEffect(() => {
    console.log(`[CameraPlayer] Camera: ${cameraName}, Stream ID: ${streamId}`)
    console.log(`[CameraPlayer] MP4 URL: ${mp4Url}`)
    console.log(`[CameraPlayer] MJPEG URL: ${mjpegUrl}`)
  }, [cameraName, streamId, mp4Url, mjpegUrl])

  const handleLoadStart = () => {
    setIsLoading(true)
    setHasError(false)
  }

  const handleCanPlay = () => {
    setIsLoading(false)
    setHasError(false)
    console.log(`[CameraPlayer] Stream playing: ${streamId}`)
  }

  const handleError = () => {
    console.error(`[CameraPlayer] Stream error: ${streamId}, useMjpeg: ${useMjpeg}`)
    
    // Try MJPEG fallback if MP4 fails
    if (!useMjpeg) {
      console.log(`[CameraPlayer] Falling back to MJPEG`)
      setUseMjpeg(true)
      setIsLoading(true)
    } else {
      // MJPEG also failed - increment key to force img reconnection
      // This forces browser to create new connection instead of using cached broken state
      setMjpegKey(prev => prev + 1)
      console.log(`[CameraPlayer] MJPEG error, forcing reconnect with new key`)
      
      // After 3 MJPEG retries, show error
      if (mjpegKey >= 2) {
        setIsLoading(false)
        setHasError(true)
      } else {
        // Give it a moment before retry
        setTimeout(() => {
          setIsLoading(true)
        }, 1000)
      }
    }
  }

  const handleRetry = () => {
    setRetryCount(prev => prev + 1)
    setUseMjpeg(false)
    setMjpegKey(0) // Reset MJPEG retry counter
    setHasError(false)
    setIsLoading(true)
  }

  // Reset when camera or quality changes
  useEffect(() => {
    setIsLoading(true)
    setHasError(false)
    setUseMjpeg(false)
    
    if (videoRef.current) {
      videoRef.current.load()
    }
  }, [cameraName, quality, retryCount])

  // Update muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted
    }
  }, [isMuted])

  return (
    <div className={cn("relative bg-black rounded-lg overflow-hidden", className)}>
      {/* Loading Overlay */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-white/70">Conectando...</span>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="flex flex-col items-center gap-3 text-white/70">
            <VideoOff className="w-12 h-12" />
            <span className="text-sm">Sin señal de video</span>
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Video/Image Player - switches between MP4 and MJPEG */}
      {useMjpeg ? (
        // MJPEG fallback - use img tag for motion jpeg
        // Key prop forces browser to create new connection on error
        <img
          key={`mjpeg-${streamId}-${mjpegKey}`}
          src={`${mjpegUrl}&_t=${mjpegKey}`}
          alt={`Stream: ${cameraName}`}
          className="w-full h-full object-cover"
          onLoad={handleCanPlay}
          onError={handleError}
          style={{ minHeight: '180px' }}
        />
      ) : (
        // Primary: MP4/MSE stream
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          muted={isMuted}
          playsInline
          poster={posterUrl}
          onLoadStart={handleLoadStart}
          onCanPlay={handleCanPlay}
          onError={handleError}
          style={{ minHeight: '180px' }}
        >
          <source src={mp4Url} type="video/mp4" />
        </video>
      )}

      {/* Controls Overlay */}
      {showControls && !hasError && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 hover:opacity-100 transition-opacity">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-1 rounded hover:bg-white/20 transition-colors"
                title={isMuted ? "Activar audio" : "Silenciar"}
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-white" />
                ) : (
                  <Volume2 className="w-4 h-4 text-white" />
                )}
              </button>
            </div>
            {onFullscreen && (
              <button
                onClick={onFullscreen}
                className="p-1 rounded hover:bg-white/20 transition-colors"
                title="Pantalla completa"
              >
                <Maximize2 className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quality Badge */}
      <div className="absolute top-2 left-2">
        <span className={cn(
          "px-2 py-0.5 text-xs font-semibold rounded",
          quality === 'main' 
            ? "bg-blue-500 text-white" 
            : "bg-gray-500 text-white"
        )}>
          {quality === 'main' ? 'HD' : 'SD'}
        </span>
      </div>

      {/* Live Indicator */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-medium text-white">LIVE</span>
      </div>
    </div>
  )
}
