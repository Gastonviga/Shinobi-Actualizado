/**
 * KioskRotator - Automatic camera group rotation for Video Wall
 * 
 * Features:
 * - Auto-rotates through camera groups
 * - Adaptive grid layout
 * - Smooth fade transitions
 * - Progress bar indicator
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Wifi, WifiOff, Loader2, Circle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CameraPlayer } from '@/components/CameraPlayer'
import { 
  getCameras, 
  getCameraGroups,
  getAllCamerasStatus,
  type Camera,
  type CameraStatus
} from '@/lib/api'

interface KioskRotatorProps {
  intervalSeconds: number
  isPaused: boolean
  onPageChange?: (current: number, total: number, groupName: string) => void
  manualPageIndex?: number | null
}

interface CameraGroup {
  name: string
  cameras: Camera[]
}

/**
 * KioskCameraCard - Read-only camera card for kiosk mode
 * No edit/delete buttons, optimized for monitoring
 */
function KioskCameraCard({ 
  camera, 
  connectionStatus 
}: { 
  camera: Camera
  connectionStatus?: CameraStatus
}) {
  const isOnline = connectionStatus?.connection_status === 'online'
  const isConnecting = connectionStatus?.connection_status === 'connecting'
  
  return (
    <div className="relative aspect-video bg-zinc-900 rounded-lg overflow-hidden">
      {/* Video Player - SD Quality for grid performance */}
      <CameraPlayer
        cameraName={camera.name}
        quality="sub"
        className="w-full h-full object-cover"
        showControls={false}
      />

      {/* Status Indicator - Top Left */}
      <div className="absolute top-2 left-2">
        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium backdrop-blur-sm",
          isOnline ? "bg-emerald-500/20 text-emerald-400" :
          isConnecting ? "bg-yellow-500/20 text-yellow-400" :
          "bg-red-500/20 text-red-400"
        )}>
          {isConnecting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : isOnline ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
          <span>{isOnline ? 'LIVE' : isConnecting ? 'CONNECTING' : 'OFFLINE'}</span>
        </div>
      </div>

      {/* Bottom Info Bar */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-8 pb-2 px-3">
        <div className="flex items-end justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-white truncate">
              {camera.name}
            </h3>
            {camera.location && (
              <p className="text-[10px] text-zinc-400 truncate">
                {camera.location}
              </p>
            )}
          </div>

          {/* Recording Badge */}
          {camera.is_recording && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/90 ml-2">
              <Circle className="w-1.5 h-1.5 fill-white text-white animate-pulse" />
              <span className="text-[9px] font-bold text-white tracking-wider">REC</span>
            </div>
          )}
        </div>
      </div>

      {/* Offline Overlay */}
      {connectionStatus?.connection_status === 'offline' && (
        <div className="absolute inset-0 bg-zinc-900/80 flex items-center justify-center">
          <div className="text-center">
            <WifiOff className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">Sin conexión</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function KioskRotator({ 
  intervalSeconds, 
  isPaused, 
  onPageChange,
  manualPageIndex 
}: KioskRotatorProps) {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [cameraStatuses, setCameraStatuses] = useState<Record<number, CameraStatus>>({})
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Build playlist of camera groups
  const playlist: CameraGroup[] = useMemo(() => {
    const result: CameraGroup[] = []
    
    // Group cameras by their group property
    const groupedCameras: Record<string, Camera[]> = {}
    const ungroupedCameras: Camera[] = []
    
    cameras.forEach(camera => {
      if (camera.group) {
        if (!groupedCameras[camera.group]) {
          groupedCameras[camera.group] = []
        }
        groupedCameras[camera.group].push(camera)
      } else {
        ungroupedCameras.push(camera)
      }
    })
    
    // Add grouped cameras (sorted by group name)
    groups.forEach(groupName => {
      if (groupedCameras[groupName]?.length > 0) {
        result.push({
          name: groupName,
          cameras: groupedCameras[groupName]
        })
      }
    })
    
    // Add ungrouped cameras as "Sin Grupo"
    if (ungroupedCameras.length > 0) {
      result.push({
        name: 'Sin Grupo',
        cameras: ungroupedCameras
      })
    }
    
    // If no groups, show all cameras as one page
    if (result.length === 0 && cameras.length > 0) {
      result.push({
        name: 'Todas las cámaras',
        cameras: cameras
      })
    }
    
    return result
  }, [cameras, groups])

  // Load cameras and groups
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const [camerasData, groupsData] = await Promise.all([
        getCameras(),
        getCameraGroups()
      ])
      setCameras(camerasData)
      setGroups(groupsData.groups)
      setError(null)
    } catch (err) {
      console.error('Failed to load cameras:', err)
      setError('Error al cargar cámaras')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load camera statuses
  const loadStatuses = useCallback(async () => {
    try {
      const data = await getAllCamerasStatus()
      const statusMap: Record<number, CameraStatus> = {}
      data.cameras.forEach(cam => {
        statusMap[cam.camera_id] = cam
      })
      setCameraStatuses(statusMap)
    } catch (err) {
      console.error('Failed to load camera statuses:', err)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadData()
    loadStatuses()
    
    // Refresh statuses periodically
    const statusInterval = setInterval(loadStatuses, 10000)
    // Refresh camera list every 5 minutes
    const dataInterval = setInterval(loadData, 300000)
    
    return () => {
      clearInterval(statusInterval)
      clearInterval(dataInterval)
    }
  }, [loadData, loadStatuses])

  // Handle manual page navigation
  useEffect(() => {
    if (manualPageIndex !== null && manualPageIndex !== undefined) {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentPageIndex(manualPageIndex)
        setIsTransitioning(false)
      }, 300)
    }
  }, [manualPageIndex])

  // Auto-rotation timer
  useEffect(() => {
    if (isPaused || playlist.length <= 1) return
    
    const timer = setInterval(() => {
      setIsTransitioning(true)
      
      setTimeout(() => {
        setCurrentPageIndex(prev => (prev + 1) % playlist.length)
        setIsTransitioning(false)
      }, 300) // Fade out duration
      
    }, intervalSeconds * 1000)
    
    return () => clearInterval(timer)
  }, [intervalSeconds, isPaused, playlist.length])

  // Notify parent of page changes
  useEffect(() => {
    if (playlist.length > 0 && onPageChange) {
      const currentGroup = playlist[currentPageIndex]
      onPageChange(currentPageIndex + 1, playlist.length, currentGroup?.name || '')
    }
  }, [currentPageIndex, playlist, onPageChange])

  // TODO: Pause rotation when a camera detects motion (is_recording or alert state)
  // This would require checking if any camera in the current view has is_recording=true
  // and pausing the timer until the recording stops

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white/50 animate-spin mx-auto mb-4" />
          <p className="text-white/50">Cargando cámaras...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-400">{error}</p>
          <button 
            onClick={loadData}
            className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (cameras.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <p className="text-white/70">No hay cámaras configuradas</p>
        </div>
      </div>
    )
  }

  const currentGroup = playlist[currentPageIndex]
  const camerasToShow = currentGroup?.cameras || []

  // Calculate optimal grid columns based on camera count
  const getGridCols = (count: number) => {
    if (count === 1) return 'grid-cols-1'
    if (count === 2) return 'grid-cols-2'
    if (count <= 4) return 'grid-cols-2'
    if (count <= 6) return 'grid-cols-3'
    if (count <= 9) return 'grid-cols-3'
    if (count <= 12) return 'grid-cols-4'
    if (count <= 16) return 'grid-cols-4'
    return 'grid-cols-5'
  }

  return (
    <div className="h-full flex flex-col">
      {/* Camera Grid */}
      <div 
        className={cn(
          "flex-1 p-4 transition-opacity duration-300",
          isTransitioning ? "opacity-0" : "opacity-100"
        )}
      >
        <div className={cn(
          "grid gap-2 h-full auto-rows-fr",
          getGridCols(camerasToShow.length)
        )}>
          {camerasToShow.map(camera => (
            <KioskCameraCard
              key={camera.id}
              camera={camera}
              connectionStatus={cameraStatuses[camera.id]}
            />
          ))}
        </div>
      </div>

      {/* Progress Bar - Bottom edge */}
      {!isPaused && playlist.length > 1 && (
        <div className="h-1 bg-white/10">
          <div 
            className="h-full bg-blue-500 transition-none"
            style={{
              animation: `progressBar ${intervalSeconds}s linear infinite`
            }}
          />
        </div>
      )}

      {/* CSS for progress bar animation */}
      <style>{`
        @keyframes progressBar {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  )
}
