import { X, Plus, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SmartCameraCard } from '@/components/SmartCameraCard'
import { type Camera, type ConnectionStatus } from '@/lib/api'

interface VideoSlotProps {
  camera: Camera | null
  connectionStatus?: ConnectionStatus
  onSelect: () => void
  onRemove: () => void
  onEditCamera?: (camera: Camera) => void
  className?: string
}

/**
 * VideoSlot - A slot in the video matrix
 * 
 * Shows either a camera stream or an empty placeholder
 * that allows the user to select a camera.
 */
export function VideoSlot({
  camera,
  connectionStatus,
  onSelect,
  onRemove,
  onEditCamera,
  className
}: VideoSlotProps) {
  if (camera) {
    // Slot with camera assigned
    return (
      <div className={cn("relative group", className)}>
        <SmartCameraCard
          camera={camera}
          connectionStatus={connectionStatus}
          onEdit={onEditCamera}
        />
        
        {/* Remove Button - Top Right */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute top-2 right-2 z-30 p-1.5 rounded-full bg-black/60 hover:bg-red-500/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all"
          title="Quitar del slot"
        >
          <X className="w-3.5 h-3.5 text-white" />
        </button>
      </div>
    )
  }

  // Empty slot placeholder
  return (
    <div
      onClick={onSelect}
      className={cn(
        "relative aspect-video rounded-lg cursor-pointer transition-all duration-200",
        "border-2 border-dashed border-zinc-700 hover:border-zinc-500",
        "bg-zinc-900/50 hover:bg-zinc-800/50",
        "flex flex-col items-center justify-center gap-3",
        "group",
        className
      )}
    >
      {/* Icon */}
      <div className="p-4 rounded-full bg-zinc-800 group-hover:bg-zinc-700 transition-colors">
        <Plus className="w-8 h-8 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
      </div>
      
      {/* Text */}
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">
          Seleccionar cámara
        </p>
        <p className="text-xs text-zinc-600 mt-1">
          Haz clic para asignar
        </p>
      </div>
      
      {/* Decorative video icon */}
      <Video className="absolute bottom-3 right-3 w-5 h-5 text-zinc-800" />
    </div>
  )
}
