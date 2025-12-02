import { useEffect, useState, useCallback } from 'react'
import { 
  Camera, 
  Video, 
  Activity, 
  Settings, 
  RefreshCw, 
  Plus,
  LayoutGrid,
  List,
  AlertCircle,
  Film
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/StatusBadge'
import { SmartCameraCard } from '@/components/SmartCameraCard'
import { AddCameraDialog } from '@/components/AddCameraDialog'
import { RecordingsView } from '@/components/RecordingsView'
import { 
  healthCheck, 
  getCameras, 
  deleteCamera,
  forceSync,
  getAllCamerasStatus,
  type HealthStatus, 
  type Camera as CameraType,
  type ConnectionStatus
} from '@/lib/api'

function App() {
  // State
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [cameras, setCameras] = useState<CameraType[]>([])
  const [loading, setLoading] = useState(true)
  const [camerasLoading, setCamerasLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [syncing, setSyncing] = useState(false)
  const [cameraStatuses, setCameraStatuses] = useState<Record<number, ConnectionStatus>>({})
  const [activeView, setActiveView] = useState<'cameras' | 'recordings'>('cameras')

  // Load cameras
  const loadCameras = useCallback(async () => {
    setCamerasLoading(true)
    try {
      const data = await getCameras()
      setCameras(data)
    } catch (err) {
      console.error('Failed to load cameras:', err)
    } finally {
      setCamerasLoading(false)
    }
  }, [])

  // Load camera connection statuses
  const loadCameraStatuses = useCallback(async () => {
    try {
      const data = await getAllCamerasStatus()
      const statusMap: Record<number, ConnectionStatus> = {}
      data.cameras.forEach(cam => {
        statusMap[cam.camera_id] = cam.connection_status
      })
      setCameraStatuses(statusMap)
    } catch (err) {
      console.error('Failed to load camera statuses:', err)
    }
  }, [])

  // Health check
  const checkHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await healthCheck()
      setHealth(status)
    } catch (err) {
      setError('No se pudo conectar con el backend')
      console.error('Health check failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Force sync with Go2RTC
  const handleForceSync = async () => {
    setSyncing(true)
    try {
      await forceSync()
      await checkHealth()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  // Delete camera
  const handleDeleteCamera = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar esta cámara?')) return
    try {
      await deleteCamera(id)
      await loadCameras()
    } catch (err) {
      console.error('Failed to delete camera:', err)
    }
  }

  // Initial load
  useEffect(() => {
    checkHealth()
    loadCameras()
    loadCameraStatuses()
    
    // Poll health every 30 seconds
    const healthInterval = setInterval(checkHealth, 30000)
    // Poll camera statuses every 10 seconds
    const statusInterval = setInterval(loadCameraStatuses, 10000)
    
    return () => {
      clearInterval(healthInterval)
      clearInterval(statusInterval)
    }
  }, [checkHealth, loadCameras, loadCameraStatuses])

  const activeCameras = cameras.filter(c => c.is_active).length

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-40">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Video className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-xl font-bold">TitanNVR</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Sistema de Videovigilancia
                </p>
              </div>
            </div>
            
            {/* Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1">
              <Button
                variant={activeView === 'cameras' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('cameras')}
              >
                <Camera className="h-4 w-4 mr-2" />
                Cámaras
              </Button>
              <Button
                variant={activeView === 'recordings' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('recordings')}
              >
                <Film className="h-4 w-4 mr-2" />
                Grabaciones
              </Button>
            </nav>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Add Camera Button */}
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Agregar Cámara</span>
              <span className="sm:hidden">Agregar</span>
            </Button>
            
            {/* Settings */}
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6 flex-1">
        {activeView === 'recordings' ? (
          <RecordingsView />
        ) : (
          <>
        {/* Status Section */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Estado del Sistema</h2>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleForceSync}
                disabled={syncing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sincronizando...' : 'Sync Go2RTC'}
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { checkHealth(); loadCameras(); }}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            {/* API Status */}
            <Card className="bg-card/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  API Backend
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {loading ? (
                  <span className="text-muted-foreground text-sm">Verificando...</span>
                ) : error ? (
                  <StatusBadge status="error" label="Desconectado" />
                ) : (
                  <StatusBadge status="connected" />
                )}
              </CardContent>
            </Card>

            {/* Go2RTC Status */}
            <Card className="bg-card/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Motor de Video
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {loading ? (
                  <span className="text-muted-foreground text-sm">Verificando...</span>
                ) : health ? (
                  <StatusBadge 
                    status={health.go2rtc_status === 'connected' ? 'connected' : 'disconnected'} 
                    label={health.go2rtc_status === 'connected' ? 'Conectado' : 'Desconectado'}
                  />
                ) : (
                  <StatusBadge status="error" label="Sin datos" />
                )}
              </CardContent>
            </Card>

            {/* Cameras Count */}
            <Card className="bg-card/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Cámaras
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <span className="text-2xl font-bold">{activeCameras}</span>
                <span className="text-muted-foreground text-sm ml-1">
                  / {cameras.length} total
                </span>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Camera Grid Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Vista de Cámaras
              {camerasLoading && (
                <RefreshCw className="inline-block ml-2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </h2>
            
            {cameras.length > 0 && (
              <div className="flex items-center gap-1 border rounded-lg p-1">
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Empty State */}
          {!camerasLoading && cameras.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Camera className="h-16 w-16 text-muted-foreground mb-4" />
                <CardTitle className="text-lg mb-2">No hay cámaras configuradas</CardTitle>
                <CardDescription className="text-center mb-4">
                  Agrega tu primera cámara para comenzar a monitorear
                </CardDescription>
                <Button onClick={() => setShowAddDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Cámara
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Camera Grid */}
          {cameras.length > 0 && (
            <div className={
              viewMode === 'grid' 
                ? "grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                : "flex flex-col gap-4"
            }>
              {cameras.map((camera) => (
                <SmartCameraCard
                  key={camera.id}
                  camera={camera}
                  connectionStatus={cameraStatuses[camera.id]}
                  onDelete={handleDeleteCamera}
                />
              ))}
            </div>
          )}

          {/* Connection Warning */}
          {health && health.go2rtc_status !== 'connected' && cameras.length > 0 && (
            <Card className="mt-4 border-yellow-500/50 bg-yellow-500/10">
              <CardContent className="flex items-center gap-3 py-4">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="font-medium text-yellow-600 dark:text-yellow-400">
                    Motor de video desconectado
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Las cámaras no podrán transmitir hasta que Go2RTC esté disponible.
                    <Button 
                      variant="link" 
                      className="px-1 h-auto" 
                      onClick={handleForceSync}
                    >
                      Intentar reconectar
                    </Button>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="container flex h-12 items-center justify-between px-4 text-xs text-muted-foreground">
          <span>TitanNVR v0.1.0</span>
          <span className="hidden sm:inline">Sistema de Videovigilancia Empresarial</span>
          <span>{cameras.length} cámaras configuradas</span>
        </div>
      </footer>

      {/* Add Camera Dialog */}
      <AddCameraDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSuccess={loadCameras}
      />
    </div>
  )
}

export default App
