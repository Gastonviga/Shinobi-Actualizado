import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { 
  Camera, 
  Video, 
  Plus,
  Film,
  LogOut,
  Settings,
  Loader2,
  Map,
  Search,
  PlaySquare,
  MonitorPlay,
  ServerCog
} from 'lucide-react'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { SmartCameraCard } from '@/components/SmartCameraCard'
import { AddCameraDialog } from '@/components/AddCameraDialog'
import { EditCameraDialog } from '@/components/EditCameraDialog'
import { RecordingsView } from '@/components/RecordingsView'

// Lazy load heavy views and dialogs for faster initial load
const MapsView = lazy(() => import('@/components/MapsView').then(m => ({ default: m.MapsView })))
const SmartSearch = lazy(() => import('@/components/SmartSearch/SmartSearch').then(m => ({ default: m.SmartSearch })))
const IncidentWorkspace = lazy(() => import('@/components/SyncPlayback/IncidentWorkspace').then(m => ({ default: m.IncidentWorkspace })))
const SettingsDialog = lazy(() => import('@/components/SettingsDialog').then(m => ({ default: m.SettingsDialog })))
const AdminDialog = lazy(() => import('@/components/AdminDialog').then(m => ({ default: m.AdminDialog })))
import { LoginPage } from '@/components/LoginPage'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { 
  getCameras, 
  deleteCamera,
  bulkDeleteCameras,
  getAllCamerasStatus,
  getCameraGroups,
  type Camera as CameraType,
  type CameraStatus
} from '@/lib/api'
import { MatrixContainer } from '@/components/VideoMatrix'
import { KioskPage } from '@/components/Kiosk'
import { ChevronLeft, ChevronRight, Filter, CheckSquare, Square, X, Trash2, LayoutGrid, List } from 'lucide-react'

// Loading fallback for lazy-loaded views
function ViewLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Cargando...</span>
      </div>
    </div>
  )
}

function Dashboard() {
  const { user, logout, settings } = useAuth()
  
  // State
  const [cameras, setCameras] = useState<CameraType[]>([])
  const [camerasLoading, setCamerasLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [showAdminDialog, setShowAdminDialog] = useState(false)
  const [editingCamera, setEditingCamera] = useState<CameraType | null>(null)
  const [cameraStatuses, setCameraStatuses] = useState<Record<number, CameraStatus>>({})
  const [activeView, setActiveView] = useState<'cameras' | 'recordings' | 'maps' | 'search' | 'playback'>('cameras')
  const [cameraViewMode, setCameraViewMode] = useState<'matrix' | 'list'>('matrix')
  
  // Filter and pagination state
  const [groups, setGroups] = useState<string[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [viewLimit, setViewLimit] = useState<number>(16)
  const [currentPage, setCurrentPage] = useState<number>(1)
  
  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedCameras, setSelectedCameras] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  
  const isAdmin = user?.role === 'admin'
  const canEdit = user?.role !== 'viewer'
  
  // Filter cameras by group
  const filteredCameras = selectedGroup 
    ? cameras.filter(c => c.group === selectedGroup)
    : cameras
  
  // Pagination
  const totalPages = Math.ceil(filteredCameras.length / viewLimit)
  const paginatedCameras = filteredCameras.slice(
    (currentPage - 1) * viewLimit,
    currentPage * viewLimit
  )

  // Load cameras and groups
  const loadCameras = useCallback(async () => {
    setCamerasLoading(true)
    try {
      const [camerasData, groupsData] = await Promise.all([
        getCameras(),
        getCameraGroups()
      ])
      setCameras(camerasData)
      setGroups(groupsData.groups)
      setCurrentPage(1) // Reset to first page on reload
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
      const statusMap: Record<number, CameraStatus> = {}
      data.cameras.forEach(cam => {
        statusMap[cam.camera_id] = cam
      })
      setCameraStatuses(statusMap)
    } catch (err) {
      console.error('Failed to load camera statuses:', err)
    }
  }, [])

  // Delete camera
  const handleDeleteCamera = async (id: number) => {
    try {
      await deleteCamera(id)
      await loadCameras()
    } catch (err) {
      console.error('Failed to delete camera:', err)
    }
  }
  
  // Selection mode handlers
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode)
    setSelectedCameras(new Set())
  }
  
  const toggleCameraSelection = (id: number) => {
    setSelectedCameras(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }
  
  const selectAllCameras = () => {
    setSelectedCameras(new Set(paginatedCameras.map(c => c.id)))
  }
  
  const handleBulkDeleteCameras = async () => {
    if (selectedCameras.size === 0) return
    setBulkDeleting(true)
    try {
      await bulkDeleteCameras(Array.from(selectedCameras))
      setSelectedCameras(new Set())
      setShowBulkDeleteConfirm(false)
      setIsSelectionMode(false)
      await loadCameras()
    } catch (err) {
      console.error('Bulk delete cameras failed:', err)
    } finally {
      setBulkDeleting(false)
    }
  }

  // Initial load
  useEffect(() => {
    loadCameras()
    loadCameraStatuses()
    
    // Poll camera statuses every 10 seconds
    const statusInterval = setInterval(loadCameraStatuses, 10000)
    
    return () => {
      clearInterval(statusInterval)
    }
  }, [loadCameras, loadCameraStatuses])

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Glassmorphic Header - 3 Column Layout */}
      <header className="h-14 sticky top-0 z-50 glass border-b border-border">
        <div className="h-full grid grid-cols-[auto_1fr_auto] items-center px-4 gap-4">
          
          {/* Left: Branding */}
          <div className="flex items-center gap-2">
            {settings?.logo_url ? (
              <img 
                src={settings.logo_url} 
                alt="Logo" 
                className="h-8 w-8 object-contain rounded"
              />
            ) : (
              <Video className="h-6 w-6 text-primary" />
            )}
            <span className="font-semibold text-foreground hidden sm:inline">
              {settings?.system_title || 'TitanNVR'}
            </span>
          </div>
          
          {/* Center: Navigation */}
          <nav className="flex items-center justify-center gap-1">
            <button
              onClick={() => setActiveView('cameras')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeView === 'cameras' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Camera className="h-4 w-4 inline mr-1.5" />
              <span className="hidden md:inline">Cámaras</span>
            </button>
            <button
              onClick={() => setActiveView('recordings')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeView === 'recordings' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Film className="h-4 w-4 inline mr-1.5" />
              <span className="hidden md:inline">Grabaciones</span>
            </button>
            <button
              onClick={() => setActiveView('maps')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeView === 'maps' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Map className="h-4 w-4 inline mr-1.5" />
              <span className="hidden md:inline">Mapa</span>
            </button>
            <button
              onClick={() => setActiveView('search')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeView === 'search' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Search className="h-4 w-4 inline mr-1.5" />
              <span className="hidden md:inline">Búsqueda</span>
            </button>
            <button
              onClick={() => setActiveView('playback')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeView === 'playback' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <PlaySquare className="h-4 w-4 inline mr-1.5" />
              <span className="hidden md:inline">Sala</span>
            </button>
          </nav>
          
          {/* Right: System Actions */}
          <div className="flex items-center gap-1">
            {/* Settings - Only for admin */}
            {isAdmin && (
              <>
                <button
                  onClick={() => setShowSettingsDialog(true)}
                  className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Configuración"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setShowAdminDialog(true)}
                  className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Sistema (Email, Nube, Backups)"
                >
                  <ServerCog className="h-4 w-4" />
                </button>
              </>
            )}
            
            {/* Kiosk Mode */}
            <button
              onClick={() => window.open('/kiosk', '_blank')}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Modo Kiosco"
            >
              <MonitorPlay className="h-4 w-4" />
            </button>
            
            {/* Theme Toggle */}
            <ModeToggle />
            
            {/* Logout */}
            <button
              onClick={logout}
              className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {activeView === 'search' ? (
        <Suspense fallback={<ViewLoadingFallback />}>
          <SmartSearch onBack={() => setActiveView('cameras')} />
        </Suspense>
      ) : activeView === 'playback' ? (
        <Suspense fallback={<ViewLoadingFallback />}>
          <IncidentWorkspace onBack={() => setActiveView('cameras')} />
        </Suspense>
      ) : (
      <main className={`flex-1 ${
        activeView === 'cameras' && cameraViewMode === 'matrix' 
          ? 'p-2 h-[calc(100vh-3.5rem)] overflow-hidden' 
          : 'p-2'
      }`}>
        {activeView === 'recordings' ? (
          <RecordingsView />
        ) : activeView === 'maps' ? (
          <Suspense fallback={<ViewLoadingFallback />}>
            <MapsView />
          </Suspense>
        ) : (
          <>
            {/* Empty State */}
            {!camerasLoading && cameras.length === 0 && (
              <div className="flex flex-col items-center justify-center h-[60vh]">
                <Camera className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-lg font-medium text-foreground mb-2">
                  No hay cámaras configuradas
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Agrega tu primera cámara para comenzar
                </p>
                {canEdit && (
                  <Button 
                    onClick={() => setShowAddDialog(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Cámara
                  </Button>
                )}
              </div>
            )}

            {/* Selection Actions Bar */}
            {isSelectionMode && selectedCameras.size > 0 && (
              <div className="flex items-center justify-between mb-3 p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                <div className="flex items-center gap-3">
                  <CheckSquare className="h-5 w-5 text-destructive" />
                  <span className="text-sm font-medium text-foreground">
                    {selectedCameras.size} cámara{selectedCameras.size !== 1 ? 's' : ''} seleccionada{selectedCameras.size !== 1 ? 's' : ''}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={selectAllCameras}
                    className="text-xs p-0 h-auto"
                  >
                    Seleccionar todas ({paginatedCameras.length})
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={toggleSelectionMode}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowBulkDeleteConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Eliminar ({selectedCameras.size})
                  </Button>
                </div>
              </div>
            )}

            {/* View Mode Toolbar */}
            {cameras.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 mb-3 p-2 bg-secondary/50 rounded-lg border border-border">
                {/* View Mode Toggle */}
                <div className="flex items-center gap-1 p-1 rounded-md bg-secondary border border-border">
                  <button
                    onClick={() => setCameraViewMode('matrix')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      cameraViewMode === 'matrix' 
                        ? 'bg-blue-600 text-white' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                    }`}
                    title="Vista Matriz - Layouts personalizados"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Matrix
                  </button>
                  <button
                    onClick={() => setCameraViewMode('list')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      cameraViewMode === 'list' 
                        ? 'bg-blue-600 text-white' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                    }`}
                    title="Vista Lista - Administración masiva"
                  >
                    <List className="h-3.5 w-3.5" />
                    Lista
                  </button>
                </div>
                
                {/* List View Filters - Only show in list mode */}
                {cameraViewMode === 'list' && (
                  <>
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <select
                        value={selectedGroup}
                        onChange={(e) => { setSelectedGroup(e.target.value); setCurrentPage(1) }}
                        className="bg-secondary border border-border rounded-md px-2 py-1 text-sm text-foreground"
                      >
                        <option value="">Todos los grupos</option>
                        {groups.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Mostrar:</span>
                      <select
                        value={viewLimit}
                        onChange={(e) => { setViewLimit(Number(e.target.value)); setCurrentPage(1) }}
                        className="bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
                      >
                        <option value={4}>4</option>
                        <option value={8}>8</option>
                        <option value={12}>12</option>
                        <option value={16}>16</option>
                      </select>
                    </div>
                  </>
                )}
                
                <div className="flex-1" />
                
                {/* Selection Mode Toggle - Only in list mode */}
                {canEdit && cameraViewMode === 'list' && (
                  <Button
                    variant={isSelectionMode ? "default" : "outline"}
                    size="sm"
                    onClick={toggleSelectionMode}
                    className={isSelectionMode ? "bg-primary" : ""}
                  >
                    {isSelectionMode ? (
                      <CheckSquare className="h-4 w-4 mr-1" />
                    ) : (
                      <Square className="h-4 w-4 mr-1" />
                    )}
                    {isSelectionMode ? "Seleccionando" : "Seleccionar"}
                  </Button>
                )}
                
                <span className="text-xs text-muted-foreground">
                  {cameras.length} cámaras
                  {cameraViewMode === 'list' && selectedGroup && ` • "${selectedGroup}"`}
                </span>
                
                {/* Add Camera Button - Always visible */}
                {canEdit && (
                  <Button
                    size="sm"
                    onClick={() => setShowAddDialog(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Agregar Cámara</span>
                    <span className="sm:hidden">Agregar</span>
                  </Button>
                )}
              </div>
            )}

            {/* Matrix View - Smart Video Matrix */}
            {cameras.length > 0 && cameraViewMode === 'matrix' && (
              <MatrixContainer
                availableCameras={cameras}
                camerasStatus={cameraStatuses}
                onEditCamera={canEdit ? (cam) => setEditingCamera(cam) : undefined}
                className="h-[calc(100vh-8rem)]"
              />
            )}

            {/* List View - Traditional Grid */}
            {cameras.length > 0 && cameraViewMode === 'list' && (
              <>
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {paginatedCameras.map((camera) => (
                    <SmartCameraCard
                      key={camera.id}
                      camera={camera}
                      connectionStatus={cameraStatuses[camera.id]?.connection_status}
                      onDelete={handleDeleteCamera}
                      onEdit={canEdit ? (cam) => setEditingCamera(cam) : undefined}
                      selectionMode={isSelectionMode}
                      isSelected={selectedCameras.has(camera.id)}
                      onSelect={toggleCameraSelection}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-md bg-secondary text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm text-muted-foreground">
                      Página {currentPage} de {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-md bg-secondary text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Loading */}
            {camerasLoading && cameras.length === 0 && (
              <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </main>
      )}

      {/* Minimal Footer */}
      <footer className="h-8 flex items-center justify-center text-[10px] text-muted-foreground border-t border-border">
        <span>{cameras.length} cámaras • TitanNVR Enterprise v2.0</span>
      </footer>

      {/* Dialogs */}
      <AddCameraDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSuccess={loadCameras}
      />
      
      <EditCameraDialog
        camera={editingCamera}
        isOpen={!!editingCamera}
        onClose={() => setEditingCamera(null)}
        onSuccess={loadCameras}
      />
      
      {showSettingsDialog && (
        <Suspense fallback={null}>
          <SettingsDialog
            isOpen={showSettingsDialog}
            onClose={() => setShowSettingsDialog(false)}
          />
        </Suspense>
      )}
      
      {showAdminDialog && (
        <Suspense fallback={null}>
          <AdminDialog
            isOpen={showAdminDialog}
            onClose={() => setShowAdminDialog(false)}
          />
        </Suspense>
      )}

      {/* Bulk Delete Cameras Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowBulkDeleteConfirm(false)}
          />
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-red-500/10">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-center text-foreground mb-2">
              Eliminar {selectedCameras.size} Cámaras
            </h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              ¿Estás seguro de eliminar <span className="font-medium text-red-400">{selectedCameras.size}</span> cámaras? 
              Se eliminarán de la base de datos, Go2RTC y Frigate.
            </p>
            <div className="max-h-32 overflow-y-auto mb-4 p-2 bg-secondary/50 rounded-lg text-xs">
              {cameras
                .filter(c => selectedCameras.has(c.id))
                .slice(0, 5)
                .map((camera) => (
                  <div key={camera.id} className="truncate text-muted-foreground">{camera.name}</div>
                ))}
              {selectedCameras.size > 5 && (
                <div className="text-muted-foreground mt-1">
                  ...y {selectedCameras.size - 5} más
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
                onClick={handleBulkDeleteCameras}
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

// Router wrapper for protected routes
function ProtectedRoutes() {
  const { isLoggedIn, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Video className="h-12 w-12 mx-auto mb-4 text-primary animate-pulse" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    return <LoginPage />
  }

  return (
    <Routes>
      <Route path="/kiosk" element={<KioskPage />} />
      <Route path="/*" element={<Dashboard />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <ProtectedRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
