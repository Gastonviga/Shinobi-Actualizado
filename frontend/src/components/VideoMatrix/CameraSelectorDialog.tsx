import { useState, useMemo } from 'react'
import { Search, Video, MapPin, X, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { type Camera } from '@/lib/api'

interface CameraSelectorDialogProps {
  isOpen: boolean
  onClose: () => void
  cameras: Camera[]
  assignedCameraIds: number[]
  onSelect: (camera: Camera) => void
}

/**
 * CameraSelectorDialog - Modal to search and select a camera for a slot
 */
export function CameraSelectorDialog({
  isOpen,
  onClose,
  cameras,
  assignedCameraIds,
  onSelect
}: CameraSelectorDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Filter cameras based on search
  const filteredCameras = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return cameras
    
    return cameras.filter(camera => 
      camera.name.toLowerCase().includes(query) ||
      camera.location?.toLowerCase().includes(query) ||
      camera.group?.toLowerCase().includes(query)
    )
  }, [cameras, searchQuery])

  // Group by availability
  const { available, assigned } = useMemo(() => {
    const available: Camera[] = []
    const assigned: Camera[] = []
    
    filteredCameras.forEach(camera => {
      if (assignedCameraIds.includes(camera.id)) {
        assigned.push(camera)
      } else {
        available.push(camera)
      }
    })
    
    return { available, assigned }
  }, [filteredCameras, assignedCameraIds])

  const handleSelect = (camera: Camera) => {
    onSelect(camera)
    setSearchQuery('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Video className="w-5 h-5" />
            Seleccionar Cámara
          </DialogTitle>
        </DialogHeader>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Buscar por nombre, ubicación o grupo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Camera List */}
        <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
          {/* Available Cameras */}
          {available.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-zinc-500 px-2 py-1">
                Disponibles ({available.length})
              </p>
              {available.map(camera => (
                <button
                  key={camera.id}
                  onClick={() => handleSelect(camera)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 border border-transparent hover:border-zinc-600 transition-all text-left"
                >
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Video className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {camera.name}
                    </p>
                    {camera.location && (
                      <p className="text-xs text-zinc-500 truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {camera.location}
                      </p>
                    )}
                  </div>
                  {camera.is_recording && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400">
                      REC
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Already Assigned Cameras */}
          {assigned.length > 0 && (
            <div className="space-y-1 mt-4">
              <p className="text-xs font-medium text-zinc-500 px-2 py-1">
                Ya asignadas ({assigned.length})
              </p>
              {assigned.map(camera => (
                <div
                  key={camera.id}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-zinc-800/30 border border-zinc-800 opacity-50"
                >
                  <div className="p-2 rounded-lg bg-zinc-700">
                    <Video className="w-4 h-4 text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-400 truncate">
                      {camera.name}
                    </p>
                    {camera.location && (
                      <p className="text-xs text-zinc-600 truncate">
                        {camera.location}
                      </p>
                    )}
                  </div>
                  <Check className="w-4 h-4 text-emerald-500" />
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {filteredCameras.length === 0 && (
            <div className="py-12 text-center">
              <Video className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">
                {searchQuery 
                  ? `No se encontraron cámaras para "${searchQuery}"`
                  : 'No hay cámaras disponibles'
                }
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-zinc-800">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-zinc-400"
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
