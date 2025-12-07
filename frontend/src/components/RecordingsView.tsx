import { useState, useEffect, useRef } from 'react'
import {
  HardDrive,
  RefreshCw,
  Play,
  Calendar,
  Film,
  Video,
  Loader2,
  X,
  Trash2,
  Filter,
  Camera,
  Zap,
  Download,
  AlertTriangle,
  ExternalLink
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


export function RecordingsView() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [stats, setStats] = useState<RecordingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null)
  
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
  
  // Video playback state
  const [videoError, setVideoError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

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
      
      const [recordingsRes, statsRes, camerasRes] = await Promise.all([
        api.get(`/recordings/?${params.toString()}`),
        api.get('/recordings/stats'),
        getCameras()
      ])
      
      setRecordings(recordingsRes.data.recordings || [])
      setStats(statsRes.data)
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

  // Helper to detect if recording is an event clip
  const isEventClip = (recording: Recording): boolean => {
    return recording.path.includes('/clips/') || 
           recording.name.includes('_clip') ||
           recording.size_mb < 50 // Clips are typically smaller
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Film className="w-5 h-5" />
          Grabaciones
        </h2>
        
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
          
        </div>
      )}

      {/* Recordings List */}
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
                
                {recordings.map((recording, idx) => {
                  const isClip = isEventClip(recording)
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedRecording(recording)}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors ${
                        selectedFiles.has(recording.path) ? 'bg-accent/30 border-primary/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedFiles.has(recording.path)}
                          onCheckedChange={(e) => {
                            e.stopPropagation?.()
                            toggleFileSelection(recording.path)
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className={`p-2 rounded ${
                          isClip 
                            ? 'bg-amber-500/10 text-amber-500' 
                            : 'bg-blue-500/10 text-blue-500'
                        }`}>
                          {isClip ? <Zap className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{recording.name}</p>
                            <Badge 
                              variant="outline" 
                              className={`text-[10px] px-1.5 py-0 ${
                                isClip 
                                  ? 'border-amber-500/50 text-amber-500' 
                                  : 'border-blue-500/50 text-blue-500'
                              }`}
                            >
                              {isClip ? 'Evento' : 'Continua'}
                            </Badge>
                          </div>
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
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedRecording(recording)
                          }}
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirm(recording)
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

      {/* Video Player Dialog */}
      <Dialog 
        open={!!selectedRecording} 
        onOpenChange={() => {
          setSelectedRecording(null)
          setVideoError(false)
        }}
      >
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-card">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Film className="w-5 h-5" />
                {selectedRecording?.name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSelectedRecording(null)
                  setVideoError(false)
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          {/* Video Player */}
          <div className="bg-black aspect-video relative">
            {selectedRecording && (
              <video
                ref={videoRef}
                controls
                autoPlay
                className="w-full h-full"
                src={`/api/recordings/play/${selectedRecording.path}`}
                onError={() => setVideoError(true)}
                onLoadStart={() => setVideoError(false)}
              >
                Tu navegador no soporta la reproducción de video.
              </video>
            )}
            
            {/* Error Overlay */}
            {videoError && (
              <div className="absolute inset-0 bg-black/90 flex items-center justify-center">
                <div className="text-center p-6">
                  <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                  <p className="text-foreground font-medium mb-2">No se pudo reproducir el video</p>
                  <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                    Es posible que el formato original de la cámara no sea compatible con tu navegador (codec mp4v).
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button
                      variant="default"
                      onClick={() => {
                        const link = document.createElement('a')
                        link.href = `/api/recordings/play/${selectedRecording?.path}`
                        link.download = selectedRecording?.name || 'video.mp4'
                        link.click()
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Descargar Video
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => window.open('http://localhost:5000', '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Abrir Frigate
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Footer with info and actions */}
          <div className="p-4 pt-2 flex items-center justify-between border-t">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Camera className="w-3.5 h-3.5" />
                {selectedRecording?.camera}
              </span>
              <span>{selectedRecording?.size_mb} MB</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = `/api/recordings/play/${selectedRecording?.path}`
                  link.download = selectedRecording?.name || 'video.mp4'
                  link.click()
                }}
              >
                <Download className="w-4 h-4 mr-1" />
                Descargar
              </Button>
              <a 
                href="http://localhost:5000" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Ver en Frigate
              </a>
            </div>
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
