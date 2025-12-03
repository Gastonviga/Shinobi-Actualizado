import { useEffect, useState, useCallback } from 'react'
import { 
  Camera, 
  Video, 
  Plus,
  Film,
  LogOut,
  Settings,
  Loader2,
  Shield,
  UserCog,
  Eye,
  Map
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SmartCameraCard } from '@/components/SmartCameraCard'
import { AddCameraDialog } from '@/components/AddCameraDialog'
import { EditCameraDialog } from '@/components/EditCameraDialog'
import { SettingsDialog } from '@/components/SettingsDialog'
import { RecordingsView } from '@/components/RecordingsView'
import { MapsView } from '@/components/MapsView'
import { LoginPage } from '@/components/LoginPage'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { 
  getCameras, 
  deleteCamera,
  bulkDeleteCameras,
  getAllCamerasStatus,
  getCameraGroups,
  type Camera as CameraType,
  type ConnectionStatus
} from '@/lib/api'
import { ChevronLeft, ChevronRight, Filter, CheckSquare, Square, X, Trash2 } from 'lucide-react'

function Dashboard() {
  const { user, logout, settings } = useAuth()
  
  // State
  const [cameras, setCameras] = useState<CameraType[]>([])
  const [camerasLoading, setCamerasLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [editingCamera, setEditingCamera] = useState<CameraType | null>(null)
  const [cameraStatuses, setCameraStatuses] = useState<Record<number, ConnectionStatus>>({})
  const [activeView, setActiveView] = useState<'cameras' | 'recordings' | 'maps'>('cameras')
  
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
      const statusMap: Record<number, ConnectionStatus> = {}
      data.cameras.forEach(cam => {
        statusMap[cam.camera_id] = cam.connection_status
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
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Glassmorphic Header */}
      <header className="h-14 sticky top-0 z-50 glass border-b border-zinc-800">
        <div className="h-full flex items-center justify-between px-4">
          {/* Logo & Nav */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              {settings?.logo_url ? (
                <img 
                  src={settings.logo_url} 
                  alt="Logo" 
                  className="h-8 w-8 object-contain rounded"
                />
              ) : (
                <Video className="h-6 w-6 text-blue-500" />
              )}
              <span className="font-semibold text-zinc-100">
                {settings?.system_title || 'TitanNVR'}
              </span>
            </div>
            
            {/* Nav Tabs */}
            <nav className="flex items-center">
              <button
                onClick={() => setActiveView('cameras')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeView === 'cameras' 
                    ? 'bg-zinc-800 text-zinc-100' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Camera className="h-4 w-4 inline mr-1.5" />
                Cámaras
              </button>
              <button
                onClick={() => setActiveView('recordings')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeView === 'recordings' 
                    ? 'bg-zinc-800 text-zinc-100' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Film className="h-4 w-4 inline mr-1.5" />
                Grabaciones
              </button>
              <button
                onClick={() => setActiveView('maps')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeView === 'maps' 
                    ? 'bg-zinc-800 text-zinc-100' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Map className="h-4 w-4 inline mr-1.5" />
                Mapa
              </button>
            </nav>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* User Role Badge */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              user?.role === 'admin' 
                ? 'bg-red-600 text-white' 
                : user?.role === 'operator' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-zinc-600 text-zinc-200'
            }`}>
              {user?.role === 'admin' && <Shield className="h-3.5 w-3.5" />}
              {user?.role === 'operator' && <UserCog className="h-3.5 w-3.5" />}
              {user?.role === 'viewer' && <Eye className="h-3.5 w-3.5" />}
              <span>{user?.username}</span>
            </div>
            
            {/* Add Camera - Only for non-viewers */}
            {canEdit && (
              <Button 
                onClick={() => setShowAddDialog(true)}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 h-8"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            )}
            
            {/* Settings - Only for admin */}
            {isAdmin && (
              <button
                onClick={() => setShowSettingsDialog(true)}
                className="p-2 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}
            
            {/* Logout */}
            <button
              onClick={logout}
              className="p-2 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-2">
        {activeView === 'recordings' ? (
          <RecordingsView />
        ) : activeView === 'maps' ? (
          <MapsView />
        ) : (
          <>
            {/* Empty State */}
            {!camerasLoading && cameras.length === 0 && (
              <div className="flex flex-col items-center justify-center h-[60vh]">
                <Camera className="h-16 w-16 text-zinc-700 mb-4" />
                <h2 className="text-lg font-medium text-zinc-300 mb-2">
                  No hay cámaras configuradas
                </h2>
                <p className="text-sm text-zinc-500 mb-4">
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
              <div className="flex items-center justify-between mb-3 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                <div className="flex items-center gap-3">
                  <CheckSquare className="h-5 w-5 text-red-400" />
                  <span className="text-sm font-medium text-zinc-200">
                    {selectedCameras.size} cámara{selectedCameras.size !== 1 ? 's' : ''} seleccionada{selectedCameras.size !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={selectAllCameras}
                    className="text-xs text-zinc-400 hover:text-zinc-200 underline"
                  >
                    Seleccionar todas ({paginatedCameras.length})
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
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
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar Selección
                  </Button>
                </div>
              </div>
            )}

            {/* Filter Bar */}
            {cameras.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 mb-3 p-2 bg-zinc-900/50 rounded-lg border border-zinc-800">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-zinc-500" />
                  <select
                    value={selectedGroup}
                    onChange={(e) => { setSelectedGroup(e.target.value); setCurrentPage(1) }}
                    className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-sm text-zinc-200"
                  >
                    <option value="">Todos los grupos</option>
                    {groups.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <span>Mostrar:</span>
                  <select
                    value={viewLimit}
                    onChange={(e) => { setViewLimit(Number(e.target.value)); setCurrentPage(1) }}
                    className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-zinc-200"
                  >
                    <option value={4}>4</option>
                    <option value={8}>8</option>
                    <option value={12}>12</option>
                    <option value={16}>16</option>
                  </select>
                </div>
                
                <div className="flex-1" />
                
                {/* Selection Mode Toggle */}
                {canEdit && (
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
                
                <span className="text-xs text-zinc-500">
                  {filteredCameras.length} cámaras
                  {selectedGroup && ` en "${selectedGroup}"`}
                </span>
              </div>
            )}

            {/* Camera Grid - Frigate style (compact) */}
            {cameras.length > 0 && (
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {paginatedCameras.map((camera) => (
                  <SmartCameraCard
                    key={camera.id}
                    camera={camera}
                    connectionStatus={cameraStatuses[camera.id]}
                    onDelete={handleDeleteCamera}
                    onEdit={canEdit ? (cam) => setEditingCamera(cam) : undefined}
                    selectionMode={isSelectionMode}
                    isSelected={selectedCameras.has(camera.id)}
                    onSelect={toggleCameraSelection}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-zinc-400">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Loading */}
            {camerasLoading && cameras.length === 0 && (
              <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
              </div>
            )}
          </>
        )}
      </main>

      {/* Minimal Footer */}
      <footer className="h-8 flex items-center justify-center text-[10px] text-zinc-600 border-t border-zinc-900">
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
      
      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />

      {/* Bulk Delete Cameras Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowBulkDeleteConfirm(false)}
          />
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-red-500/10">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-center text-zinc-100 mb-2">
              Eliminar {selectedCameras.size} Cámaras
            </h3>
            <p className="text-sm text-zinc-400 text-center mb-4">
              ¿Estás seguro de eliminar <span className="font-medium text-red-400">{selectedCameras.size}</span> cámaras? 
              Se eliminarán de la base de datos, Go2RTC y Frigate.
            </p>
            <div className="max-h-32 overflow-y-auto mb-4 p-2 bg-zinc-800/50 rounded-lg text-xs">
              {cameras
                .filter(c => selectedCameras.has(c.id))
                .slice(0, 5)
                .map((camera) => (
                  <div key={camera.id} className="truncate text-zinc-400">{camera.name}</div>
                ))}
              {selectedCameras.size > 5 && (
                <div className="text-zinc-500 mt-1">
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

// Main App with Authentication
function AppContent() {
  const { isLoggedIn, isLoading, user, logout, settings } = useAuth()

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

  return <Dashboard />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
