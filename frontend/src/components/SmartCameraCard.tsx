import { useState } from 'react'
import { 
  Maximize2, 
  Circle,
  Trash2,
  Settings,
  Wifi,
  WifiOff,
  Loader2,
  CheckSquare,
  Square
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CameraPlayer } from '@/components/CameraPlayer'
import { CameraViewDialog } from '@/components/CameraViewDialog'
import { type Camera, type ConnectionStatus } from '@/lib/api'

interface SmartCameraCardProps {
  camera: Camera
  connectionStatus?: ConnectionStatus
  onDelete?: (id: number) => void
  onEdit?: (camera: Camera) => void
  // Selection mode props
  selectionMode?: boolean
  isSelected?: boolean
  onSelect?: (id: number) => void
}

/**
 * SmartCameraCard - Frigate-style camera card
 * 
 * Full video with floating overlay information.
 * Zero borders, maximum immersion.
 */
export function SmartCameraCard({ 
  camera, 
  connectionStatus, 
  onDelete, 
  onEdit,
  selectionMode = false,
  isSelected = false,
  onSelect
}: SmartCameraCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const isOnline = connectionStatus === 'online'
  const isConnecting = connectionStatus === 'connecting'
  
  const handleClick = () => {
    if (selectionMode && onSelect) {
      onSelect(camera.id)
    } else {
      setIsExpanded(true)
    }
  }

  return (
    <>
      {/* Frigate-style Card - Full bleed video */}
      <div 
        className={cn(
          "group relative aspect-video bg-black rounded-lg overflow-hidden cursor-pointer transition-all",
          isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}
        onClick={handleClick}
      >
        {/* Selection Checkbox Overlay */}
        {selectionMode && (
          <div className="absolute top-2 left-2 z-20">
            <div className={cn(
              "p-1 rounded-md backdrop-blur-sm transition-colors",
              isSelected ? "bg-primary text-primary-foreground" : "bg-black/50 text-white"
            )}>
              {isSelected ? (
                <CheckSquare className="w-6 h-6" />
              ) : (
                <Square className="w-6 h-6" />
              )}
            </div>
          </div>
        )}
        
        {/* Selection Tint Overlay */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/20 z-10 pointer-events-none" />
        )}
        {/* Video Player - SD Quality */}
        <CameraPlayer
          cameraName={camera.name}
          quality="sub"
          className="w-full h-full object-cover"
          showControls={false}
        />

        {/* Top Bar - Status & Actions (Hidden by default) */}
        <div className="absolute inset-x-0 top-0 p-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-200">
          {/* Connection Status Indicator */}
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

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit?.(camera)
              }}
              className="p-1.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-white/80" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`¿Eliminar cámara "${camera.name}"?`)) {
                  onDelete?.(camera.id)
                }
              }}
              className="p-1.5 rounded-full bg-black/40 hover:bg-red-500/60 backdrop-blur-sm transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-white/80" />
            </button>
          </div>
        </div>

        {/* Bottom Gradient Overlay - Always visible */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-8 pb-2 px-3">
          <div className="flex items-end justify-between">
            {/* Camera Info */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-white truncate">
                {camera.name}
              </h3>
              {camera.location && (
                <p className="text-[10px] text-white/60 truncate">
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

        {/* Center Expand Hint (on hover) */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="p-3 rounded-full bg-black/30 backdrop-blur-sm">
            <Maximize2 className="w-5 h-5 text-white/80" />
          </div>
        </div>

        {/* Offline Overlay */}
        {connectionStatus === 'offline' && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
            <div className="text-center">
              <WifiOff className="w-8 h-8 text-white/40 mx-auto mb-2" />
              <p className="text-xs text-white/50">Sin conexión</p>
            </div>
          </div>
        )}
      </div>

      {/* Expanded View Dialog - HD Stream */}
      <CameraViewDialog
        camera={camera}
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
      />
    </>
  )
}
