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
  X
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
import { api } from '@/lib/api'

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

  // Load data
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [recordingsRes, statsRes, backupRes] = await Promise.all([
        api.get('/recordings/'),
        api.get('/recordings/stats'),
        api.get('/recordings/backup/status').catch(() => ({ data: null }))
      ])
      
      setRecordings(recordingsRes.data.recordings || [])
      setStats(statsRes.data)
      setBackupStatus(backupRes.data)
    } catch (err) {
      console.error('Failed to load recordings:', err)
    } finally {
      setLoading(false)
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
          <CardContent>
            {recordings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Film className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No hay grabaciones disponibles</p>
                <p className="text-sm">Las grabaciones aparecerán aquí cuando Frigate detecte movimiento</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recordings.map((recording, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                    onDoubleClick={() => setSelectedRecording(recording)}
                  >
                    <div className="flex items-center gap-3">
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
                    <div className="flex items-center gap-3">
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
    </div>
  )
}
