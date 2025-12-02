import { useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCamera, type CameraCreate } from '@/lib/api'

interface AddCameraDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

/**
 * AddCameraDialog - Form to add a new camera
 */
export function AddCameraDialog({ isOpen, onClose, onSuccess }: AddCameraDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<CameraCreate>({
    name: '',
    main_stream_url: '',
    sub_stream_url: '',
    location: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        throw new Error('El nombre es requerido')
      }
      if (!formData.main_stream_url.trim()) {
        throw new Error('La URL del stream principal es requerida')
      }

      await createCamera({
        ...formData,
        // Use main stream as sub if not provided
        sub_stream_url: formData.sub_stream_url || formData.main_stream_url,
      })

      // Reset form and close
      setFormData({
        name: '',
        main_stream_url: '',
        sub_stream_url: '',
        location: '',
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la cámara')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (field: keyof CameraCreate) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Agregar Nueva Cámara
          </DialogTitle>
          <DialogDescription>
            Ingresa los datos de la cámara IP. Necesitarás las URLs RTSP.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Camera Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la Cámara *</Label>
            <Input
              id="name"
              placeholder="Ej: Entrada Principal"
              value={formData.name}
              onChange={handleChange('name')}
              disabled={isLoading}
            />
          </div>

          {/* Main Stream URL */}
          <div className="space-y-2">
            <Label htmlFor="main_stream_url">
              URL Stream Principal (HD) *
            </Label>
            <Input
              id="main_stream_url"
              placeholder="rtsp://usuario:clave@192.168.1.100:554/stream1"
              value={formData.main_stream_url}
              onChange={handleChange('main_stream_url')}
              disabled={isLoading}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Stream de alta calidad para grabación y vista detallada
            </p>
          </div>

          {/* Sub Stream URL */}
          <div className="space-y-2">
            <Label htmlFor="sub_stream_url">
              URL Stream Secundario (SD)
            </Label>
            <Input
              id="sub_stream_url"
              placeholder="rtsp://usuario:clave@192.168.1.100:554/stream2"
              value={formData.sub_stream_url || ''}
              onChange={handleChange('sub_stream_url')}
              disabled={isLoading}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Stream de baja calidad para vista en mosaico. Si no se especifica, se usará el principal.
            </p>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">Ubicación</Label>
            <Input
              id="location"
              placeholder="Ej: Edificio A, Piso 1"
              value={formData.location || ''}
              onChange={handleChange('location')}
              disabled={isLoading}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Agregando...
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 mr-2" />
                  Agregar Cámara
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
