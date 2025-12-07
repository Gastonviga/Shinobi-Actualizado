import { useRef, useState, useEffect, useCallback } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  Volume2,
  VolumeX,
  Maximize2,
  RefreshCw,
  Clock,
  Camera
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type SearchResultItem } from '@/lib/api'

interface SyncPlayerProps {
  events: SearchResultItem[]
  onRemoveEvent?: (eventId: string) => void
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function formatEventTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  })
}

// Grid layout based on number of videos
function getGridClass(count: number): string {
  if (count === 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-2'
  return 'grid-cols-2' // 3 or 4 videos
}

export function SyncPlayer({ events, onRemoveEvent }: SyncPlayerProps) {
  // Video refs
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [progress, setProgress] = useState(0)
  const [maxDuration, setMaxDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoDurations, setVideoDurations] = useState<number[]>([])
  const [loadedVideos, setLoadedVideos] = useState<Set<number>>(new Set())

  // Initialize video refs array
  useEffect(() => {
    videoRefs.current = videoRefs.current.slice(0, events.length)
  }, [events.length])

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback((index: number) => {
    const video = videoRefs.current[index]
    if (!video) return

    setVideoDurations(prev => {
      const newDurations = [...prev]
      newDurations[index] = video.duration
      return newDurations
    })

    setLoadedVideos(prev => new Set(prev).add(index))
  }, [])

  // Update max duration when all videos are loaded
  useEffect(() => {
    if (loadedVideos.size === events.length && videoDurations.length > 0) {
      const max = Math.max(...videoDurations.filter(d => !isNaN(d) && isFinite(d)))
      setMaxDuration(max > 0 ? max : 0)
    }
  }, [loadedVideos, videoDurations, events.length])

  // Handle time update from any video
  const handleTimeUpdate = useCallback(() => {
    // Use first video as reference for current time display
    const video = videoRefs.current[0]
    if (video && maxDuration > 0) {
      setCurrentTime(video.currentTime)
      setProgress((video.currentTime / maxDuration) * 100)
    }
  }, [maxDuration])

  // Play/Pause all videos
  const togglePlayPause = useCallback(() => {
    const newPlaying = !isPlaying
    setIsPlaying(newPlaying)

    videoRefs.current.forEach((video, index) => {
      if (!video) return
      const duration = videoDurations[index] || 0
      
      if (newPlaying) {
        // Only play if video hasn't ended
        if (video.currentTime < duration) {
          video.play().catch(console.error)
        }
      } else {
        video.pause()
      }
    })
  }, [isPlaying, videoDurations])

  // Seek all videos to a specific percentage
  const seekToPercent = useCallback((percent: number) => {
    setProgress(percent)
    const targetTime = (percent / 100) * maxDuration

    videoRefs.current.forEach((video, index) => {
      if (!video) return
      const duration = videoDurations[index] || 0
      
      // Calculate proportional time for this video
      const videoTargetTime = Math.min(targetTime, duration)
      video.currentTime = videoTargetTime
    })

    setCurrentTime(targetTime)
  }, [maxDuration, videoDurations])

  // Sync all videos to start (T=0)
  const syncToStart = useCallback(() => {
    setIsPlaying(false)
    setProgress(0)
    setCurrentTime(0)

    videoRefs.current.forEach(video => {
      if (video) {
        video.pause()
        video.currentTime = 0
      }
    })
  }, [])

  // Toggle mute
  const toggleMute = useCallback(() => {
    const newMuted = !isMuted
    setIsMuted(newMuted)

    videoRefs.current.forEach(video => {
      if (video) {
        video.muted = newMuted
      }
    })
  }, [isMuted])

  // Handle slider change
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    seekToPercent(value)
  }

  // Handle video ended
  const handleVideoEnded = useCallback((index: number) => {
    // Check if all videos have ended
    const allEnded = videoRefs.current.every((video, i) => {
      if (!video) return true
      const duration = videoDurations[i] || 0
      return video.currentTime >= duration - 0.1
    })

    if (allEnded) {
      setIsPlaying(false)
    }
  }, [videoDurations])

  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-card rounded-lg border border-border">
        <div className="text-center">
          <Camera className="w-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            Sala de Reproducción
          </h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Selecciona hasta 4 eventos de la lista izquierda para reproducirlos de forma sincronizada.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-card rounded-lg border border-border overflow-hidden">
      {/* Video Grid */}
      <div className={`flex-1 grid ${getGridClass(events.length)} gap-1 p-1 bg-black`}>
        {events.map((event, index) => (
          <div 
            key={event.id} 
            className="relative bg-zinc-900 rounded overflow-hidden"
          >
            {/* Video Element */}
            {event.clip_url ? (
              <video
                ref={el => videoRefs.current[index] = el}
                src={event.clip_url}
                className="w-full h-full object-contain bg-black"
                muted={isMuted}
                playsInline
                onLoadedMetadata={() => handleLoadedMetadata(index)}
                onTimeUpdate={index === 0 ? handleTimeUpdate : undefined}
                onEnded={() => handleVideoEnded(index)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-black">
                <span className="text-muted-foreground text-sm">Sin video</span>
              </div>
            )}

            {/* Overlay Info */}
            <div className="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/70 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-white/80" />
                  <span className="text-xs font-medium text-white/90 truncate max-w-[120px]">
                    {event.camera}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-white/60" />
                  <span className="text-[10px] text-white/70">
                    {formatEventTime(event.start_time)}
                  </span>
                </div>
              </div>
            </div>

            {/* Label Badge */}
            <div 
              className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold text-white"
              style={{ backgroundColor: event.color }}
            >
              {event.label} {Math.round(event.score * 100)}%
            </div>

            {/* Remove Button */}
            {onRemoveEvent && (
              <button
                onClick={() => onRemoveEvent(event.id)}
                className="absolute bottom-2 right-2 p-1 rounded bg-black/50 text-white/70 hover:text-white hover:bg-red-500/80 transition-colors"
                title="Quitar de la reproducción"
              >
                <span className="text-xs">✕</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Master Controls */}
      <div className="p-3 bg-card border-t border-border space-y-3">
        {/* Progress Bar */}
        <div className="space-y-1">
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={progress}
            onChange={handleSliderChange}
            className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progress}%, #3f3f46 ${progress}%, #3f3f46 100%)`
            }}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(maxDuration)}</span>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <Button
              variant="ghost"
              size="sm"
              onClick={togglePlayPause}
              className="h-10 w-10 p-0 bg-blue-600 hover:bg-blue-700 rounded-full"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-white" fill="white" />
              ) : (
                <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
              )}
            </Button>

            {/* Sync to Start */}
            <Button
              variant="ghost"
              size="sm"
              onClick={syncToStart}
              className="text-muted-foreground hover:text-foreground"
              title="Sincronizar al inicio"
            >
              <SkipBack className="w-4 h-4" />
            </Button>

            {/* Restart */}
            <Button
              variant="ghost"
              size="sm"
              onClick={syncToStart}
              className="text-muted-foreground hover:text-foreground"
              title="Reiniciar todos"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            {/* Video Count */}
            <span className="text-xs text-muted-foreground">
              {events.length} video{events.length !== 1 ? 's' : ''}
            </span>

            {/* Mute Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              className="text-muted-foreground hover:text-foreground"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
