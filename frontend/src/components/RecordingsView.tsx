import { useState, useEffect } from 'react'
import {
  HardDrive,
  Cloud,
  CloudOff,
  RefreshCw,
  Play,
  Calendar,
  Clock,
  Film,
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  Trash2,
  Filter,
  Camera
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api, deleteRecording, bulkDeleteRecordings, getCameras, type Camera as CameraType } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'

interface Recording {
  camera: string
  name: string
  path: string
  size_mb: number
  modified: string
}

interface RecordingStats {
  recordings: { count: number; size_mb: number }
  clips: { count: number; size_mb: number }
  total_size_mb: number
  total_size_gb: number
}

interface BackupStatus {
  service_available: boolean
  remotes: { status: string; remotes?: string[] }
  sync_status: {
    is_syncing: boolean
    last_sync: string | null
  }
}

export function RecordingsView() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [stats, setStats] = useState<RecordingStats | null>(null)
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null)
  const [activeTab, setActiveTab] = useState<'recordings' | 'backup'>('recordings')
  
  // Filters
  const [cameras, setCameras] = useState<CameraType[]>([])
  const [filterCamera, setFilterCamera] = useState<string>('')
  const [filterDate, setFilterDate] = useState<string>('')
  
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<Recording | null>(null)
  const [deleting, setDeleting] = useState(false)
  
  // Multi-selection for bulk delete
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  // Load data
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Build query params
      const params = new URLSearchParams()
      if (filterCamera) params.append('camera', filterCamera)
      if (filterDate) params.append('date', filterDate)
      
      const [recordingsRes, statsRes, backupRes, camerasRes] = await Promise.all([
        api.get(`/recordings/?${params.toString()}`),
        api.get('/recordings/stats'),
        api.get('/recordings/backup/status').catch(() => ({ data: null })),
        getCameras()
      ])
      
      setRecordings(recordingsRes.data.recordings || [])
      setStats(statsRes.data)
      setBackupStatus(backupRes.data)
      setCameras(camerasRes)
    } catch (err) {
      console.error('Failed to load recordings:', err)
    } finally {
      setLoading(false)
    }
  }
  
  // Reload when filters change
  useEffect(() => {
    loadData()
  }, [filterCamera, filterDate])
  
  // Handle delete
  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await deleteRecording(deleteConfirm.path)
      setDeleteConfirm(null)
      await loadData()
    } catch (err) {
      console.error('Failed to delete:', err)
    } finally {
      setDeleting(false)
    }
  }
  
  // Multi-selection handlers
  const toggleFileSelection = (path: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }
  
  const toggleSelectAll = () => {
    if (selectedFiles.size === recordings.length) {
      setSelectedFiles(new Set())
    } else {
      setSelectedFiles(new Set(recordings.map(r => r.path)))
    }
  }
  
  const handleBulkDelete = async () => {
    if (selectedFiles.size === 0) return
    setBulkDeleting(true)
    try {
      await bulkDeleteRecordings(Array.from(selectedFiles))
      setSelectedFiles(new Set())
      setShowBulkDeleteConfirm(false)
      await loadData()
    } catch (err) {
      console.error('Bulk delete failed:', err)
    } finally {
      setBulkDeleting(false)
    }
  }

  const triggerBackup = async () => {
    setSyncing(true)
    try {
      await api.post('/recordings/backup/sync')
      await loadData()
    } catch (err) {
      console.error('Backup failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'recordings' ? 'default' : 'outline'}
            onClick={() => setActiveTab('recordings')}
          >
            <Film className="w-4 h-4 mr-2" />
            Grabaciones
          </Button>
          <Button
            variant={activeTab === 'backup' ? 'default' : 'outline'}
            onClick={() => setActiveTab('backup')}
          >
            <Cloud className="w-4 h-4 mr-2" />
            Backup
          </Button>
        </div>
        
        <Button variant="outline" onClick={loadData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Film className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.recordings.count}</p>
                  <p className="text-xs text-muted-foreground">Grabaciones</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Play className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.clips.count}</p>
                  <p className="text-xs text-muted-foreground">Clips de Eventos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <HardDrive className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total_size_gb} GB</p>
                  <p className="text-xs text-muted-foreground">Espacio Usado</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  {backupStatus?.service_available ? (
                    <Cloud className="w-5 h-5 text-orange-500" />
                  ) : (
                    <CloudOff className="w-5 h-5 text-orange-500" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {backupStatus?.service_available ? 'Conectado' : 'No Configurado'}
                  </p>
                  <p className="text-xs text-muted-foreground">Backup Cloud</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Content based on active tab */}
      {activeTab === 'recordings' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Film className="w-5 h-5" />
              Grabaciones Recientes
            </CardTitle>
            <CardDescription>
              Archivos de video guardados por Frigate
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/30 rounded-lg border">
              <Filter className="w-4 h-4 text-muted-foreground" />
              
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-muted-foreground" />
                <select
                  value={filterCamera}
                  onChange={(e) => setFilterCamera(e.target.value)}
                  className="bg-background border rounded-md px-2 py-1 text-sm"
                >
                  <option value="">Todas las cámaras</option>
                  {cameras.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-auto h-8 text-sm"
                />
              </div>
              
              {(filterCamera || filterDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setFilterCamera(''); setFilterDate('') }}
                >
                  <X className="w-3 h-3 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          
            {/* Bulk Actions Bar */}
            {selectedFiles.size > 0 && (
              <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedFiles.size === recordings.length}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-sm font-medium">
                    {selectedFiles.size} grabación{selectedFiles.size !== 1 ? 'es' : ''} seleccionada{selectedFiles.size !== 1 ? 's' : ''}
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar Seleccionadas
                </Button>
              </div>
            )}
          
            {recordings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Film className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No hay grabaciones disponibles</p>
                <p className="text-sm">Las grabaciones aparecerán aquí cuando Frigate detecte movimiento</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Select All Header */}
                {selectedFiles.size === 0 && recordings.length > 0 && (
                  <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={false}
                      onCheckedChange={toggleSelectAll}
                    />
                    <span>Seleccionar todo ({recordings.length})</span>
                  </div>
                )}
                
                {recordings.map((recording, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors ${
                      selectedFiles.has(recording.path) ? 'bg-accent/30 border-primary/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedFiles.has(recording.path)}
                        onCheckedChange={() => toggleFileSelection(recording.path)}
                      />
                      <div className="p-2 rounded bg-muted">
                        <Play className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium">{recording.name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(recording.modified)}
                          </span>
                          <span>{recording.camera}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{recording.size_mb} MB</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedRecording(recording)}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => setDeleteConfirm(recording)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="w-5 h-5" />
              Backup en la Nube
            </CardTitle>
            <CardDescription>
              Sincronización automática con Google Drive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Backup Status */}
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                {backupStatus?.service_available ? (
                  <CheckCircle className="w-6 h-6 text-green-500" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-yellow-500" />
                )}
                <div>
                  <p className="font-medium">
                    {backupStatus?.service_available 
                      ? 'Servicio de Backup Activo' 
                      : 'Servicio No Disponible'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {backupStatus?.remotes?.remotes?.length 
                      ? `Remotes: ${backupStatus.remotes.remotes.join(', ')}`
                      : 'Configura un remote en Rclone para habilitar backup'}
                  </p>
                </div>
              </div>
              
              <Button
                onClick={triggerBackup}
                disabled={!backupStatus?.service_available || syncing}
              >
                {syncing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {syncing ? 'Sincronizando...' : 'Sincronizar Ahora'}
              </Button>
            </div>

            {/* Last Sync Info */}
            {backupStatus?.sync_status?.last_sync && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                Última sincronización: {formatDate(backupStatus.sync_status.last_sync)}
              </div>
            )}

            {/* Configuration Help */}
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Configurar Google Drive</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Visita <a href="http://localhost:5572" target="_blank" className="text-primary hover:underline">http://localhost:5572</a> (Rclone Web GUI)</li>
                <li>Crea un nuevo remote llamado "drive" de tipo Google Drive</li>
                <li>Autoriza el acceso a tu cuenta de Google</li>
                <li>El backup se ejecutará automáticamente cada hora</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Video Player Dialog */}
      <Dialog open={!!selectedRecording} onOpenChange={() => setSelectedRecording(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Film className="w-5 h-5" />
                {selectedRecording?.name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedRecording(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="bg-black aspect-video flex items-center justify-center flex-col gap-4 p-8">
            {selectedRecording && (
              <>
                <Film className="w-16 h-16 text-muted-foreground" />
                <p className="text-muted-foreground text-center">
                  Para reproducir grabaciones, usa la interfaz de Frigate
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => window.open('http://localhost:5000', '_blank')}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Abrir en Frigate
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(`/api/recordings/play/${selectedRecording.path}`, '_blank')}
                  >
                    Descargar MP4
                  </Button>
                </div>
              </>
            )}
          </div>
          <div className="p-4 pt-2 flex items-center justify-between text-sm text-muted-foreground border-t">
            <span>Archivo: {selectedRecording?.name}</span>
            <span>{selectedRecording?.size_mb} MB</span>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDeleteConfirm(null)}
          />
          <div className="relative bg-background border rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-red-500/10">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-center mb-2">
              Eliminar Grabación
            </h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              ¿Estás seguro de eliminar <span className="font-medium">{deleteConfirm.name}</span>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowBulkDeleteConfirm(false)}
          />
          <div className="relative bg-background border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-red-500/10">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-center mb-2">
              Eliminar {selectedFiles.size} Grabaciones
            </h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              ¿Estás seguro de eliminar <span className="font-medium text-red-400">{selectedFiles.size}</span> archivos? 
              Esta acción no se puede deshacer.
            </p>
            <div className="max-h-32 overflow-y-auto mb-4 p-2 bg-muted/30 rounded-lg text-xs">
              {Array.from(selectedFiles).slice(0, 5).map((path, i) => (
                <div key={i} className="truncate text-muted-foreground">{path}</div>
              ))}
              {selectedFiles.size > 5 && (
                <div className="text-muted-foreground mt-1">
                  ...y {selectedFiles.size - 5} más
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Eliminar Todo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
