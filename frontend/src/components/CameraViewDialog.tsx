import { 
  MapPin, 
  Circle, 
  Maximize, 
  Minimize,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Move,
  Crosshair,
  X
} from 'lucide-react'
import { useState, useCallback, useRef, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CameraPlayer } from '@/components/CameraPlayer'
import { EventTimeline } from '@/components/EventTimeline'
import { type Camera, sendPTZCommand, type PTZAction, type EventDetail } from '@/lib/api'

interface CameraViewDialogProps {
  camera: Camera | null
  isOpen: boolean
  onClose: () => void
}

/**
 * PTZ Control Overlay Component
 */
function PTZControls({ 
  cameraId, 
  onError 
}: { 
  cameraId: number
  onError?: (msg: string) => void 
}) {
  const [isControlling, setIsControlling] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Handle PTZ action (send command while button pressed)
  const handlePTZAction = useCallback(async (action: PTZAction) => {
    setIsControlling(true)
    try {
      await sendPTZCommand(cameraId, action, 0.5)
    } catch (err) {
      console.error('PTZ command failed:', err)
      onError?.('Error al controlar PTZ')
    } finally {
      setIsControlling(false)
    }
  }, [cameraId, onError])

  // Stop movement when button released
  const handleStop = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    try {
      await sendPTZCommand(cameraId, 'stop', 0.5)
    } catch (err) {
      console.error('PTZ stop failed:', err)
    }
  }, [cameraId])

  // Continuous movement while pressed
  const handleMouseDown = useCallback((action: PTZAction) => {
    handlePTZAction(action)
    intervalRef.current = setInterval(() => {
      handlePTZAction(action)
    }, 200)
  }, [handlePTZAction])

  const handleMouseUp = useCallback(() => {
    handleStop()
  }, [handleStop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  if (!showControls) {
    return (
      <button
        onClick={() => setShowControls(true)}
        className="absolute bottom-4 right-4 p-2 bg-zinc-900/80 hover:bg-zinc-800 rounded-lg border border-zinc-700 transition-colors"
        title="Mostrar controles PTZ"
      >
        <Move className="h-5 w-5 text-zinc-300" />
      </button>
    )
  }

  return (
    <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
      {/* Hide button */}
      <button
        onClick={() => setShowControls(false)}
        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Ocultar controles"
      >
        <X className="h-4 w-4" />
      </button>

      {/* PTZ D-Pad */}
      <div className="relative bg-zinc-900/90 backdrop-blur-sm rounded-xl p-2 border border-zinc-700 shadow-2xl">
        {/* Direction Controls Grid */}
        <div className="grid grid-cols-3 gap-1">
          {/* Empty top-left */}
          <div />
          
          {/* Up */}
          <button
            onMouseDown={() => handleMouseDown('move_up')}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={() => handleMouseDown('move_up')}
            onTouchEnd={handleMouseUp}
            disabled={isControlling}
            className="p-3 bg-zinc-800 hover:bg-blue-600 rounded-lg transition-colors active:scale-95 disabled:opacity-50"
            title="Arriba"
          >
            <ChevronUp className="h-5 w-5 text-white" />
          </button>
          
          {/* Empty top-right */}
          <div />
          
          {/* Left */}
          <button
            onMouseDown={() => handleMouseDown('move_left')}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={() => handleMouseDown('move_left')}
            onTouchEnd={handleMouseUp}
            disabled={isControlling}
            className="p-3 bg-zinc-800 hover:bg-blue-600 rounded-lg transition-colors active:scale-95 disabled:opacity-50"
            title="Izquierda"
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>
          
          {/* Center - Home/Stop */}
          <button
            onClick={() => handleStop()}
            className="p-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
            title="Detener"
          >
            <Crosshair className="h-5 w-5 text-zinc-300" />
          </button>
          
          {/* Right */}
          <button
            onMouseDown={() => handleMouseDown('move_right')}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={() => handleMouseDown('move_right')}
            onTouchEnd={handleMouseUp}
            disabled={isControlling}
            className="p-3 bg-zinc-800 hover:bg-blue-600 rounded-lg transition-colors active:scale-95 disabled:opacity-50"
            title="Derecha"
          >
            <ChevronRight className="h-5 w-5 text-white" />
          </button>
          
          {/* Empty bottom-left */}
          <div />
          
          {/* Down */}
          <button
            onMouseDown={() => handleMouseDown('move_down')}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={() => handleMouseDown('move_down')}
            onTouchEnd={handleMouseUp}
            disabled={isControlling}
            className="p-3 bg-zinc-800 hover:bg-blue-600 rounded-lg transition-colors active:scale-95 disabled:opacity-50"
            title="Abajo"
          >
            <ChevronDown className="h-5 w-5 text-white" />
          </button>
          
          {/* Empty bottom-right */}
          <div />
        </div>

        {/* Zoom Controls */}
        <div className="flex justify-center gap-2 mt-2 pt-2 border-t border-zinc-700">
          <button
            onMouseDown={() => handleMouseDown('zoom_out')}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={() => handleMouseDown('zoom_out')}
            onTouchEnd={handleMouseUp}
            disabled={isControlling}
            className="p-2 bg-zinc-800 hover:bg-blue-600 rounded-lg transition-colors active:scale-95 disabled:opacity-50"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4 text-white" />
          </button>
          <span className="flex items-center text-xs text-zinc-500 px-2">ZOOM</span>
          <button
            onMouseDown={() => handleMouseDown('zoom_in')}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={() => handleMouseDown('zoom_in')}
            onTouchEnd={handleMouseUp}
            disabled={isControlling}
            className="p-2 bg-zinc-800 hover:bg-blue-600 rounded-lg transition-colors active:scale-95 disabled:opacity-50"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4 text-white" />
          </button>
        </div>

        {/* PTZ Label */}
        <div className="flex items-center justify-center gap-1 mt-2 pt-2 border-t border-zinc-700">
          <Move className="h-3 w-3 text-blue-500" />
          <span className="text-xs text-zinc-400 font-medium">PTZ Control</span>
        </div>
      </div>
    </div>
  )
}

/**
 * CameraViewDialog - Full screen HD view of a camera
 * 
 * Opens the main (HD) stream for detailed viewing.
 * Includes PTZ controls overlay for PTZ-capable cameras.
 */
export function CameraViewDialog({ camera, isOpen, onClose }: CameraViewDialogProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [ptzError, setPtzError] = useState<string | null>(null)
  const playerContainerRef = useRef<HTMLDivElement>(null)
  const dialogContentRef = useRef<HTMLDivElement>(null)

  // Listen for fullscreen changes (including Escape key exit)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  if (!camera) return null

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        // Fullscreen the dialog content (includes player + timeline + controls)
        const target = dialogContentRef.current
        if (target) {
          await target.requestFullscreen()
          setIsFullscreen(true)
        }
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (err) {
      console.error('Fullscreen error:', err)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        ref={dialogContentRef}
        className={`max-w-5xl w-[95vw] p-0 gap-0 overflow-hidden transition-all ${isFullscreen ? 'h-screen max-w-none w-screen' : 'h-[85vh]'}`}
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
              {camera.features_ptz && (
                <Badge variant="secondary" className="flex items-center gap-1 bg-purple-600">
                  <Move className="w-3 h-3" />
                  PTZ
                </Badge>
              )}
              <Badge variant={camera.is_active ? "success" : "secondary"}>
                {camera.is_active ? 'Activa' : 'Inactiva'}
              </Badge>
            </div>
          </div>

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
        </div>

        {/* Video Player - HD Quality with PTZ Overlay */}
        <div ref={playerContainerRef} className="flex-1 bg-black relative">
          <CameraPlayer
            cameraName={camera.name}
            quality="main"
            className="w-full h-full"
            showControls={true}
          />
          
          {/* PTZ Controls Overlay - Only if camera has PTZ */}
          {camera.features_ptz && (
            <PTZControls 
              cameraId={camera.id} 
              onError={setPtzError}
            />
          )}

          {/* PTZ Error Toast */}
          {ptzError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-4 py-2 rounded-lg text-sm animate-pulse">
              {ptzError}
              <button 
                onClick={() => setPtzError(null)}
                className="ml-2 hover:text-red-200"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Event Timeline */}
        <div className="p-3 border-t border-zinc-800">
          <EventTimeline 
            cameraName={camera.name}
            hours={24}
            onEventSelect={(event) => {
              // Could implement seeking to event time or showing clip
              console.log('Event selected:', event)
            }}
          />
        </div>

        {/* Footer Info */}
        <div className="p-3 border-t bg-muted/30 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>
              Stream principal (Alta calidad)
              {camera.features_ptz && ' • PTZ habilitado'}
            </span>
            <span className="font-mono text-xs">
              ID: {camera.id} | Creada: {new Date(camera.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
