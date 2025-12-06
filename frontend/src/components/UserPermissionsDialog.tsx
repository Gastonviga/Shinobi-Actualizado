/**
 * UserPermissionsDialog - Manage camera access permissions for users
 * 
 * Allows admins to select which cameras a user can access.
 * Admins have implicit full access and cannot be modified.
 */
import { useState, useEffect } from 'react'
import { 
  Key, 
  Camera, 
  CheckCircle, 
  Loader2, 
  AlertCircle,
  Shield,
  CheckSquare,
  Square,
  Save
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { 
  getCameras,
  getUserPermissions, 
  updateUserPermissions,
  type Camera as CameraType,
  type User
} from '@/lib/api'

interface UserPermissionsDialogProps {
  user: User | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function UserPermissionsDialog({ 
  user, 
  isOpen, 
  onClose,
  onSuccess 
}: UserPermissionsDialogProps) {
  const [cameras, setCameras] = useState<CameraType[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Load cameras and current permissions
  useEffect(() => {
    if (isOpen && user) {
      loadData()
    }
  }, [isOpen, user])

  const loadData = async () => {
    if (!user) return
    
    setLoading(true)
    setError(null)
    setSuccess(false)
    
    try {
      // Load all cameras and user permissions in parallel
      const [camerasData, permissions] = await Promise.all([
        getCameras(),
        getUserPermissions(user.id)
      ])
      
      setCameras(camerasData)
      setSelectedIds(new Set(permissions.camera_ids))
    } catch (err: any) {
      console.error('Failed to load permissions:', err)
      setError(err?.response?.data?.detail || 'Error al cargar permisos')
    } finally {
      setLoading(false)
    }
  }

  const toggleCamera = (cameraId: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(cameraId)) {
        newSet.delete(cameraId)
      } else {
        newSet.add(cameraId)
      }
      return newSet
    })
    setSuccess(false)
  }

  const selectAll = () => {
    setSelectedIds(new Set(cameras.map(c => c.id)))
    setSuccess(false)
  }

  const selectNone = () => {
    setSelectedIds(new Set())
    setSuccess(false)
  }

  const handleSave = async () => {
    if (!user) return
    
    setSaving(true)
    setError(null)
    
    try {
      await updateUserPermissions(user.id, Array.from(selectedIds))
      setSuccess(true)
      onSuccess?.()
      
      // Close after short delay
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Error al guardar permisos')
    } finally {
      setSaving(false)
    }
  }

  const isAdmin = user?.role === 'admin'

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Key className="w-5 h-5 text-amber-400" />
            Permisos de Cámaras
          </DialogTitle>
        </DialogHeader>

        {/* User Info */}
        {user && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
            <div className={`p-2 rounded-full ${
              user.role === 'admin' ? 'bg-red-500/20 text-red-400' :
              user.role === 'operator' ? 'bg-blue-500/20 text-blue-400' :
              'bg-zinc-500/20 text-zinc-400'
            }`}>
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">{user.username}</p>
              <p className="text-xs text-zinc-500 capitalize">{user.role}</p>
            </div>
          </div>
        )}

        {/* Admin Notice */}
        {isAdmin && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>Los administradores tienen acceso completo a todas las cámaras.</span>
            </div>
          </div>
        )}

        {/* Error/Success Messages */}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
        
        {success && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Permisos guardados correctamente</span>
          </div>
        )}

        {/* Camera List */}
        {!isAdmin && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                {/* Quick Actions */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    {selectedIds.size} de {cameras.length} cámaras seleccionadas
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Seleccionar todas
                    </button>
                    <span className="text-zinc-600">|</span>
                    <button
                      onClick={selectNone}
                      className="text-xs text-zinc-400 hover:text-zinc-300"
                    >
                      Quitar todas
                    </button>
                  </div>
                </div>

                {/* Camera Grid */}
                <div className="max-h-[300px] overflow-y-auto space-y-1 pr-2">
                  {cameras.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500">
                      <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No hay cámaras configuradas</p>
                    </div>
                  ) : (
                    cameras.map(camera => (
                      <button
                        key={camera.id}
                        onClick={() => toggleCamera(camera.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          selectedIds.has(camera.id)
                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                            : 'bg-zinc-800/30 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        {selectedIds.has(camera.id) ? (
                          <CheckSquare className="w-5 h-5 text-blue-400" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                        <div className="flex-1 text-left">
                          <p className={`text-sm font-medium ${
                            selectedIds.has(camera.id) ? 'text-zinc-200' : 'text-zinc-300'
                          }`}>
                            {camera.name}
                          </p>
                          {camera.location && (
                            <p className="text-xs text-zinc-500">{camera.location}</p>
                          )}
                        </div>
                        {camera.group && (
                          <span className="text-xs px-2 py-0.5 rounded bg-zinc-700 text-zinc-400">
                            {camera.group}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>

                {/* Save Button */}
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="ghost"
                    onClick={onClose}
                    className="flex-1 text-zinc-400"
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    {saving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" />Guardar Permisos</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {/* Close button for admin users */}
        {isAdmin && (
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full text-zinc-400"
          >
            Cerrar
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
