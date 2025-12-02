import { useState } from 'react'
import { 
  Maximize2, 
  MapPin, 
  Circle,
  MoreVertical,
  Trash2,
  Edit,
  Wifi,
  WifiOff,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CameraPlayer } from '@/components/CameraPlayer'
import { CameraViewDialog } from '@/components/CameraViewDialog'
import { type Camera, type ConnectionStatus } from '@/lib/api'

interface SmartCameraCardProps {
  camera: Camera
  connectionStatus?: ConnectionStatus
  onDelete?: (id: number) => void
  onEdit?: (camera: Camera) => void
}

/**
 * SmartCameraCard - Adaptive streaming camera card
 * 
 * Shows SD (sub stream) in grid view for low bandwidth.
 * Opens HD (main stream) when expanded/fullscreen.
 */
// Helper to get status badge props
const getStatusBadge = (status?: ConnectionStatus) => {
  switch (status) {
    case 'online':
      return { variant: 'success' as const, label: 'Online', icon: Wifi }
    case 'offline':
      return { variant: 'destructive' as const, label: 'Offline', icon: WifiOff }
    case 'connecting':
      return { variant: 'warning' as const, label: 'Conectando', icon: Loader2 }
    default:
      return { variant: 'secondary' as const, label: 'Desconocido', icon: WifiOff }
  }
}

export function SmartCameraCard({ camera, connectionStatus, onDelete, onEdit }: SmartCameraCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  
  const statusInfo = getStatusBadge(connectionStatus)

  const handleExpand = () => {
    setIsExpanded(true)
  }

  const handleClose = () => {
    setIsExpanded(false)
  }

  return (
    <>
      {/* Grid Card - SD Stream */}
      <Card className="group relative overflow-hidden bg-card hover:ring-2 hover:ring-primary/50 transition-all">
        {/* Video Player - SD Quality */}
        <div className="aspect-video relative">
          <CameraPlayer
            cameraName={camera.name}
            quality="sub"
            className="w-full h-full"
            showControls={false}
            onFullscreen={handleExpand}
          />

          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Expand Button */}
            <button
              onClick={handleExpand}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="p-3 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors">
                <Maximize2 className="w-6 h-6 text-white" />
              </div>
            </button>
          </div>

          {/* Recording Indicator */}
          {camera.is_recording && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-red-500/90">
              <Circle className="w-2 h-2 fill-white text-white animate-pulse" />
              <span className="text-xs font-medium text-white">REC</span>
            </div>
          )}
        </div>

        {/* Card Footer */}
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate">{camera.name}</h3>
              {camera.location && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">{camera.location}</span>
                </p>
              )}
            </div>

            {/* Status & Menu */}
            <div className="flex items-center gap-2">
              <Badge 
                variant={statusInfo.variant}
                className="text-[10px] px-1.5 flex items-center gap-1"
              >
                <statusInfo.icon className={cn(
                  "w-3 h-3",
                  connectionStatus === 'connecting' && "animate-spin"
                )} />
                {statusInfo.label}
              </Badge>

              {/* Actions Menu */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowMenu(!showMenu)}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>

                {showMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowMenu(false)} 
                    />
                    <div className="absolute right-0 top-full mt-1 z-50 w-36 rounded-md border bg-popover p-1 shadow-md">
                      <button
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => {
                          onEdit?.(camera)
                          setShowMenu(false)
                        }}
                      >
                        <Edit className="w-4 h-4" />
                        Editar
                      </button>
                      <button
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          onDelete?.(camera.id)
                          setShowMenu(false)
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expanded View Dialog - HD Stream */}
      <CameraViewDialog
        camera={camera}
        isOpen={isExpanded}
        onClose={handleClose}
      />
    </>
  )
}
