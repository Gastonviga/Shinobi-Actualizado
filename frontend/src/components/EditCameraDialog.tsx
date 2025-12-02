import { useState, useEffect } from 'react'
import { 
  Camera, 
  Loader2, 
  HardDrive,
  Activity,
  Sparkles,
  Disc,
  Save
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateCamera, type Camera as CameraType, type RecordingMode } from '@/lib/api'

interface EditCameraDialogProps {
  camera: CameraType | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const RECORDING_MODES = [
  { 
    value: 'continuous' as RecordingMode, 
    label: 'Continuo 24/7', 
    icon: Disc,
    desc: 'Alto consumo',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/30'
  },
  { 
    value: 'motion' as RecordingMode, 
    label: 'Movimiento', 
    icon: Activity,
    desc: 'Recomendado',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/30'
  },
  { 
    value: 'events' as RecordingMode, 
    label: 'Eventos IA', 
    icon: Sparkles,
    desc: 'Ahorro máximo',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30'
  },
]

export function EditCameraDialog({ camera, isOpen, onClose, onSuccess }: EditCameraDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    main_stream_url: '',
    sub_stream_url: '',
    location: '',
    retention_days: 7,
    recording_mode: 'motion' as RecordingMode,
    event_retention_days: 14,
  })

  // Load camera data when dialog opens
  useEffect(() => {
    if (camera && isOpen) {
      setFormData({
        name: camera.name,
        main_stream_url: camera.main_stream_url,
        sub_stream_url: camera.sub_stream_url || '',
        location: camera.location || '',
        retention_days: camera.retention_days || 7,
        recording_mode: (camera.recording_mode as RecordingMode) || 'motion',
        event_retention_days: camera.event_retention_days || 14,
      })
      setError(null)
    }
  }, [camera, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!camera) return
    
    setError(null)
    setIsLoading(true)

    try {
      await updateCamera(camera.id, {
        name: formData.name,
        main_stream_url: formData.main_stream_url,
        sub_stream_url: formData.sub_stream_url || formData.main_stream_url,
        location: formData.location,
        retention_days: formData.retention_days,
        recording_mode: formData.recording_mode,
        event_retention_days: formData.event_retention_days,
      })

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar')
    } finally {
      setIsLoading(false)
    }
  }

  if (!camera) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Camera className="w-5 h-5" />
            Configurar Cámara
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Basic Info */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Nombre</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={isLoading}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Ubicación</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                disabled={isLoading}
                placeholder="Ej: Entrada principal"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Stream Principal (HD)</Label>
                <Input
                  value={formData.main_stream_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, main_stream_url: e.target.value }))}
                  disabled={isLoading}
                  className="bg-zinc-800 border-zinc-700 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Stream Secundario (SD)</Label>
                <Input
                  value={formData.sub_stream_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, sub_stream_url: e.target.value }))}
                  disabled={isLoading}
                  className="bg-zinc-800 border-zinc-700 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Recording Settings */}
          <div className="border-t border-zinc-800 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="w-4 h-4 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-300">Grabación</span>
            </div>

            {/* Recording Mode Selector */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {RECORDING_MODES.map((mode) => {
                const Icon = mode.icon
                const isSelected = formData.recording_mode === mode.value
                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, recording_mode: mode.value }))}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      isSelected 
                        ? `${mode.bg} border-current ${mode.color}` 
                        : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mx-auto mb-1 ${isSelected ? mode.color : ''}`} />
                    <div className="text-xs font-medium">{mode.label}</div>
                    <div className={`text-[10px] mt-0.5 ${isSelected ? mode.color : 'text-zinc-500'}`}>
                      {mode.desc}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Retention Slider */}
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-zinc-400">Retención de grabaciones</Label>
                  <span className="text-sm font-medium text-zinc-200">{formData.retention_days} días</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={formData.retention_days}
                  onChange={(e) => setFormData(prev => ({ ...prev, retention_days: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>1 día</span>
                  <span>30 días</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-zinc-400">Retención de eventos</Label>
                  <span className="text-sm font-medium text-zinc-200">{formData.event_retention_days} días</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={formData.event_retention_days}
                  onChange={(e) => setFormData(prev => ({ ...prev, event_retention_days: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isLoading}
              className="text-zinc-400"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
