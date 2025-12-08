import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Map as MapIcon, 
  Plus, 
  Edit2, 
  Trash2, 
  Camera, 
  Upload,
  X,
  Save,
  AlertCircle,
  Loader2,
  GripVertical
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CameraViewDialog } from '@/components/CameraViewDialog'
import { useAuth } from '@/contexts/AuthContext'
import {
  getMaps,
  getMap,
  getMapAlerts,
  createMap,
  deleteMap,
  updateCameraPosition,
  removeCameraFromMap,
  getUnpositionedCameras,
  getCameras,
  type MapInfo,
  type MapWithCameras,
  type MapCameraInfo,
  type CameraAlertInfo,
  type Camera as CameraType
} from '@/lib/api'

/**
 * MapsView - Enterprise E-Maps for camera positioning
 * 
 * Features:
 * - Upload floor plan images
 * - Drag & drop cameras onto the map
 * - View mode with clickable camera icons
 * - Recording/alert indicators with radar effect
 */
export function MapsView() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const canEdit = user?.role !== 'viewer'

  // State
  const [maps, setMaps] = useState<MapInfo[]>([])
  const [selectedMap, setSelectedMap] = useState<MapWithCameras | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditMode, setIsEditMode] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  // Cameras
  const [unpositionedCameras, setUnpositionedCameras] = useState<CameraType[]>([])
  const [allCameras, setAllCameras] = useState<CameraType[]>([])
  const [selectedCameraForView, setSelectedCameraForView] = useState<CameraType | null>(null)
  
  // Alert state for real-time updates
  const [cameraAlerts, setCameraAlerts] = useState<Record<number, CameraAlertInfo>>({})
  
  // Drag state
  const [draggingCamera, setDraggingCamera] = useState<CameraType | MapCameraInfo | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  // Create map state
  const [newMapName, setNewMapName] = useState('')
  const [newMapDescription, setNewMapDescription] = useState('')
  const [newMapImage, setNewMapImage] = useState<File | null>(null)
  const [creating, setCreating] = useState(false)

  // Load maps
  const loadMaps = useCallback(async (selectFirst: boolean = false) => {
    setLoading(true)
    try {
      const data = await getMaps()
      setMaps(data)
      
      // If selectFirst is true OR no map is selected, select the first available
      if (selectFirst || !selectedMap) {
        if (data.length > 0) {
          const mapDetails = await getMap(data[0].id)
          setSelectedMap(mapDetails)
        } else {
          setSelectedMap(null)
        }
      } else if (selectedMap) {
        // Verify selected map still exists, otherwise select first
        const stillExists = data.some(m => m.id === selectedMap.id)
        if (!stillExists && data.length > 0) {
          const mapDetails = await getMap(data[0].id)
          setSelectedMap(mapDetails)
        } else if (!stillExists) {
          setSelectedMap(null)
        }
      }
    } catch (err) {
      console.error('Failed to load maps:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedMap])

  // Load cameras
  const loadCameras = useCallback(async () => {
    try {
      const [unpositioned, all] = await Promise.all([
        getUnpositionedCameras(),
        getCameras()
      ])
      setUnpositionedCameras(unpositioned)
      setAllCameras(all)
    } catch (err) {
      console.error('Failed to load cameras:', err)
    }
  }, [])

  // Select map
  const handleSelectMap = async (mapId: number) => {
    try {
      const mapDetails = await getMap(mapId)
      setSelectedMap(mapDetails)
    } catch (err) {
      console.error('Failed to load map:', err)
    }
  }

  // Create map
  const handleCreateMap = async () => {
    if (!newMapName || !newMapImage) return
    
    setCreating(true)
    try {
      // Create the map and get the response with the new map data
      const newMap = await createMap(newMapName, newMapDescription || null, newMapImage)
      
      // Close dialog and reset form
      setShowCreateDialog(false)
      setNewMapName('')
      setNewMapDescription('')
      setNewMapImage(null)
      
      // Reload maps list
      await loadMaps(true)
      
      // If we got the new map data, select it
      if (newMap && newMap.id) {
        try {
          const mapDetails = await getMap(newMap.id)
          setSelectedMap(mapDetails)
        } catch {
          // If fetching details fails, the loadMaps already selected the first one
        }
      }
    } catch (err) {
      console.error('Failed to create map:', err)
    } finally {
      setCreating(false)
    }
  }

  // Delete map
  const handleDeleteMap = async () => {
    if (!selectedMap) return
    
    try {
      // 1. Delete the map
      await deleteMap(selectedMap.id)
      
      // 2. Clear selection IMMEDIATELY
      setSelectedMap(null)
      
      // 3. Close confirmation dialog
      setShowDeleteConfirm(false)
      
      // 4. Reload maps and select the first one
      await loadMaps(true)
    } catch (err) {
      console.error('Failed to delete map:', err)
    }
  }

  // Camera positioning
  const handleDragStart = (camera: CameraType | MapCameraInfo) => {
    setDraggingCamera(camera)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggingCamera || !selectedMap || !mapContainerRef.current) return

    const rect = mapContainerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    // Clamp to valid range
    const clampedX = Math.max(0, Math.min(100, x))
    const clampedY = Math.max(0, Math.min(100, y))

    try {
      await updateCameraPosition(draggingCamera.id, selectedMap.id, clampedX, clampedY)
      // Refresh data
      const mapDetails = await getMap(selectedMap.id)
      setSelectedMap(mapDetails)
      await loadCameras()
    } catch (err) {
      console.error('Failed to update camera position:', err)
    } finally {
      setDraggingCamera(null)
    }
  }

  const handleRemoveCameraFromMap = async (cameraId: number) => {
    try {
      await removeCameraFromMap(cameraId)
      if (selectedMap) {
        const mapDetails = await getMap(selectedMap.id)
        setSelectedMap(mapDetails)
      }
      await loadCameras()
    } catch (err) {
      console.error('Failed to remove camera from map:', err)
    }
  }

  // Click on camera icon
  const handleCameraClick = (camera: MapCameraInfo) => {
    if (isEditMode) return
    
    // Find full camera data
    const fullCamera = allCameras.find(c => c.id === camera.id)
    if (fullCamera) {
      setSelectedCameraForView(fullCamera)
    }
  }

  // Initial load
  useEffect(() => {
    loadMaps()
    loadCameras()
  }, [loadMaps, loadCameras])

  // Poll for camera alerts every 5 seconds (only when not editing)
  useEffect(() => {
    if (!selectedMap || isEditMode) return
    
    const pollAlerts = async () => {
      try {
        const response = await getMapAlerts(selectedMap.id)
        setCameraAlerts(response.alerts)
      } catch (err) {
        // Silently ignore polling errors
        console.debug('[MapsView] Alert polling error:', err)
      }
    }
    
    // Initial fetch
    pollAlerts()
    
    // Set up interval
    const interval = setInterval(pollAlerts, 5000)
    
    return () => clearInterval(interval)
  }, [selectedMap?.id, isEditMode])

  if (loading && maps.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header Bar */}
      <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border mb-3">
        <div className="flex items-center gap-3">
          <MapIcon className="h-5 w-5 text-blue-500" />
          <span className="font-medium text-foreground">Mapas Interactivos</span>
          
          {/* Map Selector */}
          {maps.length > 0 && (
            <select
              value={selectedMap?.id || ''}
              onChange={(e) => handleSelectMap(Number(e.target.value))}
              className="bg-muted border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
            >
              {maps.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Edit Mode Toggle */}
          {canEdit && selectedMap && (
            <Button
              variant={isEditMode ? "default" : "outline"}
              size="sm"
              onClick={() => setIsEditMode(!isEditMode)}
              className={isEditMode ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              {isEditMode ? <Save className="h-4 w-4 mr-1" /> : <Edit2 className="h-4 w-4 mr-1" />}
              {isEditMode ? "Guardar" : "Editar"}
            </Button>
          )}

          {/* Delete Map */}
          {isAdmin && selectedMap && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}

          {/* Create Map */}
          {isAdmin && (
            <Button
              onClick={() => setShowCreateDialog(true)}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-1" />
              Nuevo Mapa
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Map Display */}
        <div className="flex-1 relative">
          {selectedMap ? (
            <div 
              ref={mapContainerRef}
              className="relative w-full h-full rounded-lg overflow-hidden border border-border bg-black"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {/* Floor Plan Image */}
              <img
                src={selectedMap.image_url}
                alt={selectedMap.name}
                className="w-full h-full object-contain"
                draggable={false}
              />

              {/* Dark Overlay for better icon visibility */}
              <div className="absolute inset-0 bg-black/20 pointer-events-none" />

              {/* Camera Icons */}
              {selectedMap.cameras.map((camera) => {
                // Use real-time alert status from polling, fallback to initial status
                const alertInfo = cameraAlerts[camera.id]
                const hasActiveAlert = alertInfo?.has_alert ?? camera.has_alert
                const alertLabel = alertInfo?.label
                
                return (
                <div
                  key={camera.id}
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-110 ${
                    isEditMode ? 'cursor-move' : ''
                  }`}
                  style={{ left: `${camera.map_x}%`, top: `${camera.map_y}%` }}
                  draggable={isEditMode}
                  onDragStart={() => handleDragStart(camera)}
                  onClick={() => handleCameraClick(camera)}
                >
                  {/* Camera Marker */}
                  <div className="relative group">
                    {/* Radar Pulse Effect for recording/alert */}
                    {(camera.is_recording || hasActiveAlert) && !isEditMode && (
                      <>
                        <div className="absolute inset-0 -m-2 rounded-full bg-red-500/30 animate-ping" />
                        <div className="absolute inset-0 -m-1 rounded-full bg-red-500/50 animate-pulse" />
                      </>
                    )}

                    {/* Camera Icon */}
                    <div className={`
                      relative z-10 p-2 rounded-full shadow-lg border-2 transition-colors
                      ${camera.is_active 
                        ? camera.is_recording || hasActiveAlert
                          ? 'bg-red-600 border-red-400' 
                          : 'bg-blue-600 border-blue-400'
                        : 'bg-zinc-600 border-zinc-500'
                      }
                    `}>
                      <Camera className="h-4 w-4 text-white" />
                    </div>

                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                      <div className="bg-popover backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                        <p className="text-sm font-medium text-popover-foreground">{camera.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {hasActiveAlert && alertLabel && (
                            <Badge variant="destructive" className="text-xs py-0 animate-pulse">
                              ⚠️ {alertLabel.toUpperCase()}
                            </Badge>
                          )}
                          {camera.is_recording && (
                            <Badge variant="destructive" className="text-xs py-0">
                              REC
                            </Badge>
                          )}
                          {camera.features_ptz && (
                            <Badge variant="secondary" className="text-xs py-0">
                              PTZ
                            </Badge>
                          )}
                          <Badge variant={camera.is_active ? "success" : "secondary"} className="text-xs py-0">
                            {camera.is_active ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Remove button in edit mode */}
                    {isEditMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveCameraFromMap(camera.id)
                        }}
                        className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-500 rounded-full p-0.5 z-20"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    )}
                  </div>
                </div>
              )})}
              

              {/* Edit Mode Hint */}
              {isEditMode && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-popover/90 backdrop-blur-sm border border-border rounded-lg px-4 py-2 text-sm text-foreground">
                  Arrastra las cámaras desde el panel derecho o reposiciónalas en el mapa
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full bg-card rounded-lg border border-border">
              <MapIcon className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No hay mapas configurados</h3>
              <p className="text-sm text-muted-foreground mb-4">Crea un mapa para comenzar a posicionar cámaras</p>
              {isAdmin && (
                <Button onClick={() => setShowCreateDialog(true)} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Mapa
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Camera List Panel (Edit Mode Only) */}
        {isEditMode && selectedMap && (
          <div className="w-64 bg-card rounded-lg border border-border flex flex-col">
            <div className="p-3 border-b border-border">
              <h3 className="font-medium text-foreground flex items-center gap-2">
                <Camera className="h-4 w-4 text-blue-500" />
                Cámaras Disponibles
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Arrastra al mapa para posicionar
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {unpositionedCameras.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Todas las cámaras están posicionadas
                </p>
              ) : (
                unpositionedCameras.map((camera) => (
                  <div
                    key={camera.id}
                    draggable
                    onDragStart={() => handleDragStart(camera)}
                    className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg cursor-move hover:bg-muted transition-colors group"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                    <Camera className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-foreground truncate flex-1">{camera.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Map Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowCreateDialog(false)}
          />
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Crear Nuevo Mapa</h3>
              <button onClick={() => setShowCreateDialog(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nombre del Mapa</label>
                <input
                  type="text"
                  value={newMapName}
                  onChange={(e) => setNewMapName(e.target.value)}
                  placeholder="Ej: Planta Baja, Estacionamiento"
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Descripción (opcional)</label>
                <input
                  type="text"
                  value={newMapDescription}
                  onChange={(e) => setNewMapDescription(e.target.value)}
                  placeholder="Descripción del área"
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Imagen del Plano</label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setNewMapImage(e.target.files?.[0] || null)}
                    className="hidden"
                    id="map-image-input"
                  />
                  <label
                    htmlFor="map-image-input"
                    className="flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary transition-colors"
                  >
                    {newMapImage ? (
                      <span className="text-sm text-foreground">{newMapImage.name}</span>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Seleccionar imagen</span>
                      </>
                    )}
                  </label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP o SVG. Máximo 10MB.</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setShowCreateDialog(false)}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={handleCreateMap}
                disabled={!newMapName || !newMapImage || creating}
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Crear Mapa
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && selectedMap && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-center text-foreground mb-2">
              Eliminar Mapa
            </h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              ¿Eliminar el mapa "{selectedMap.name}"? Las cámaras se desasignarán pero no se eliminarán.
            </p>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDeleteMap}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Camera View Dialog */}
      <CameraViewDialog
        camera={selectedCameraForView}
        isOpen={!!selectedCameraForView}
        onClose={() => setSelectedCameraForView(null)}
      />
    </div>
  )
}
