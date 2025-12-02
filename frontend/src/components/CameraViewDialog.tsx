import { MapPin, Circle, X, Maximize, Minimize } from 'lucide-react'
import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CameraPlayer } from '@/components/CameraPlayer'
import { type Camera } from '@/lib/api'

interface CameraViewDialogProps {
  camera: Camera | null
  isOpen: boolean
  onClose: () => void
}

/**
 * CameraViewDialog - Full screen HD view of a camera
 * 
 * Opens the main (HD) stream for detailed viewing.
 */
export function CameraViewDialog({ camera, isOpen, onClose }: CameraViewDialogProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  if (!camera) return null

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-5xl w-[95vw] h-[85vh] p-0 gap-0 overflow-hidden"
        onClose={onClose}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-background">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-lg font-semibold">{camera.name}</h2>
              {camera.location && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {camera.location}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-blue-500">
                HD
              </Badge>
              {camera.is_recording && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <Circle className="w-2 h-2 fill-current animate-pulse" />
                  REC
                </Badge>
              )}
              <Badge variant={camera.is_active ? "success" : "secondary"}>
                {camera.is_active ? 'Activa' : 'Inactiva'}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            >
              {isFullscreen ? (
                <Minimize className="w-5 h-5" />
              ) : (
                <Maximize className="w-5 h-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Video Player - HD Quality */}
        <div className="flex-1 bg-black">
          <CameraPlayer
            cameraName={camera.name}
            quality="main"
            className="w-full h-full"
            showControls={true}
          />
        </div>

        {/* Footer Info */}
        <div className="p-3 border-t bg-muted/30 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Stream principal (Alta calidad)</span>
            <span className="font-mono text-xs">
              ID: {camera.id} | Creada: {new Date(camera.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
