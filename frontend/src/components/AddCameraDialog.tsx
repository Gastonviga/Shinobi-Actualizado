import { useState, useRef, useEffect } from 'react'
import { Camera, Loader2, HardDrive, Upload, FileJson, CheckCircle, AlertCircle, X, Wifi, WifiOff } from 'lucide-react'
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
import { createCamera, createCamerasBulk, testCameraConnection, type CameraCreate, type RecordingMode, type BulkCreateResponse } from '@/lib/api'

interface AddCameraDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void | Promise<void>
}

type TabMode = 'manual' | 'import'

const RECORDING_MODES = [
  { value: 'motion', label: 'Solo Movimiento', desc: 'Graba cuando detecta movimiento (~2-5 GB/día)', color: 'text-yellow-500' },
  { value: 'events', label: 'Solo Eventos IA', desc: 'Graba solo personas/vehículos (~0.5-2 GB/día)', color: 'text-green-500' },
  { value: 'continuous', label: 'Continuo 24/7', desc: 'Graba todo el tiempo (~10-15 GB/día)', color: 'text-red-500' },
]

export function AddCameraDialog({ isOpen, onClose, onSuccess }: AddCameraDialogProps) {
  const [activeTab, setActiveTab] = useState<TabMode>('manual')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Connection test state
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  
  // Manual form state
  const [formData, setFormData] = useState<CameraCreate>({
    name: '',
    main_stream_url: '',
    sub_stream_url: '',
    location: '',
    group: '',
    retention_days: 7,
    recording_mode: 'motion',
    event_retention_days: 14,
  })
  
  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        main_stream_url: '',
        sub_stream_url: '',
        location: '',
        group: '',
        retention_days: 7,
        recording_mode: 'motion',
        event_retention_days: 14,
      })
      setError(null)
      setTestResult(null)
      setActiveTab('manual')
      setImportData(null)
      setImportResult(null)
    }
  }, [isOpen])
  
  // Import state
  const [importData, setImportData] = useState<CameraCreate[] | null>(null)
  const [importResult, setImportResult] = useState<BulkCreateResponse | null>(null)

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

      // Reset form
      setFormData({
        name: '',
        main_stream_url: '',
        sub_stream_url: '',
        location: '',
        group: '',
        retention_days: 7,
        recording_mode: 'motion',
        event_retention_days: 14,
      })
      
      // Refresh camera list and close
      await onSuccess()
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
    // Reset test result when URL changes
    if (field === 'main_stream_url') {
      setTestResult(null)
    }
  }

  // Test stream connection
  const handleTestConnection = async () => {
    if (!formData.main_stream_url.trim()) {
      setTestResult({ success: false, message: 'Ingrese una URL primero' })
      return
    }
    
    setIsTesting(true)
    setTestResult(null)
    
    try {
      const result = await testCameraConnection(formData.main_stream_url)
      setTestResult({
        success: result.success,
        message: result.success 
          ? result.details || 'Conexión exitosa'
          : result.error || 'Error de conexión'
      })
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Error al probar conexión'
      })
    } finally {
      setIsTesting(false)
    }
  }

  // Handle JSON file import
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string)
        if (!Array.isArray(json)) {
          throw new Error('El archivo debe contener un array de cámaras')
        }
        // Validate each camera has required fields
        for (const cam of json) {
          if (!cam.name || !cam.main_stream_url) {
            throw new Error('Cada cámara debe tener al menos "name" y "main_stream_url"')
          }
        }
        setImportData(json)
        setError(null)
        setImportResult(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al parsear JSON')
        setImportData(null)
      }
    }
    reader.readAsText(file)
  }

  // Handle bulk import
  const handleBulkImport = async () => {
    if (!importData) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await createCamerasBulk(importData)
      setImportResult(result)
      
      if (result.created > 0) {
        await onSuccess()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar cámaras')
    } finally {
      setIsLoading(false)
    }
  }

  // Reset state when dialog closes
  const handleClose = () => {
    setActiveTab('manual')
    setImportData(null)
    setImportResult(null)
    setError(null)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[850px]" onClose={handleClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Agregar Cámaras
          </DialogTitle>
          <DialogDescription>
            Agrega cámaras manualmente o importa múltiples desde un archivo JSON.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Buttons */}
        <div className="flex gap-2 border-b pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'manual'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            <Camera className="w-4 h-4" />
            Manual
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'import'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            <FileJson className="w-4 h-4" />
            Importar JSON
          </button>
        </div>

        {/* Manual Tab */}
        {activeTab === 'manual' && (
          <form onSubmit={handleSubmit} className="py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column - Camera Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Camera className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Datos de la Cámara</span>
                </div>

                {/* Camera Name */}
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs">Nombre *</Label>
                  <Input
                    id="name"
                    placeholder="Ej: Entrada Principal"
                    value={formData.name}
                    onChange={handleChange('name')}
                    disabled={isLoading}
                  />
                </div>

                {/* Group */}
                <div className="space-y-1">
                  <Label htmlFor="group" className="text-xs">Grupo</Label>
                  <Input
                    id="group"
                    placeholder="Ej: Planta Baja, Exterior"
                    value={formData.group || ''}
                    onChange={handleChange('group')}
                    disabled={isLoading}
                  />
                </div>

                {/* Location */}
                <div className="space-y-1">
                  <Label htmlFor="location" className="text-xs">Ubicación</Label>
                  <Input
                    id="location"
                    placeholder="Ej: Edificio A, Piso 1"
                    value={formData.location || ''}
                    onChange={handleChange('location')}
                    disabled={isLoading}
                  />
                </div>

                {/* Main Stream URL with Test Button */}
                <div className="space-y-1">
                  <Label htmlFor="main_stream_url" className="text-xs">Stream Principal (HD) *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="main_stream_url"
                      placeholder="rtsp://user:pass@192.168.1.100:554/stream1"
                      value={formData.main_stream_url}
                      onChange={handleChange('main_stream_url')}
                      disabled={isLoading || isTesting}
                      className="font-mono text-xs flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={isLoading || isTesting || !formData.main_stream_url.trim()}
                      className="shrink-0"
                    >
                      {isTesting ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-1" />Probando...</>
                      ) : (
                        <><Wifi className="w-4 h-4 mr-1" />Probar</>
                      )}
                    </Button>
                  </div>
                  {/* Test Result Indicator */}
                  {testResult && (
                    <div className={`flex items-center gap-2 text-xs mt-1 ${
                      testResult.success ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {testResult.success ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <WifiOff className="w-3 h-3" />
                      )}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>

                {/* Sub Stream URL */}
                <div className="space-y-1">
                  <Label htmlFor="sub_stream_url" className="text-xs">Stream Secundario (SD)</Label>
                  <Input
                    id="sub_stream_url"
                    placeholder="rtsp://user:pass@192.168.1.100:554/stream2"
                    value={formData.sub_stream_url || ''}
                    onChange={handleChange('sub_stream_url')}
                    disabled={isLoading}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              {/* Right Column - Recording Settings */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Configuración de Grabación</span>
                </div>

                {/* Recording Mode */}
                <div className="space-y-2">
                  <Label className="text-xs">Modo de Grabación</Label>
                  <div className="space-y-1">
                    {RECORDING_MODES.map((mode) => (
                      <label
                        key={mode.value}
                        className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                          formData.recording_mode === mode.value 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="recording_mode"
                          value={mode.value}
                          checked={formData.recording_mode === mode.value}
                          onChange={() => setFormData(prev => ({ ...prev, recording_mode: mode.value as RecordingMode }))}
                          className="w-3 h-3"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{mode.label}</span>
                          <span className={`text-[10px] ml-2 ${mode.color}`}>{mode.desc.split('(')[1]?.replace(')', '') || ''}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Retention Days */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="retention_days" className="text-xs">Retención Grab.</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        id="retention_days"
                        type="number"
                        min="1"
                        max="365"
                        value={formData.retention_days}
                        onChange={(e) => setFormData(prev => ({ ...prev, retention_days: parseInt(e.target.value) || 7 }))}
                        disabled={isLoading}
                        className="w-16 h-8 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">días</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="event_retention_days" className="text-xs">Retención Eventos</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        id="event_retention_days"
                        type="number"
                        min="1"
                        max="365"
                        value={formData.event_retention_days}
                        onChange={(e) => setFormData(prev => ({ ...prev, event_retention_days: parseInt(e.target.value) || 14 }))}
                        disabled={isLoading}
                        className="w-16 h-8 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">días</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Agregando...</>
                ) : (
                  <><Camera className="w-4 h-4 mr-2" />Agregar Cámara</>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Import Tab */}
        {activeTab === 'import' && (
          <div className="py-4 space-y-4">
            {/* Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileImport}
                className="hidden"
              />
              <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm font-medium">Haz clic para seleccionar archivo JSON</p>
              <p className="text-xs text-muted-foreground mt-1">o arrastra y suelta aquí</p>
            </div>

            {/* Preview */}
            {importData && !importResult && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-medium">Se importarán {importData.length} cámaras</span>
                </div>
                <div className="max-h-32 overflow-auto text-xs space-y-1">
                  {importData.map((cam, i) => (
                    <div key={i} className="flex items-center gap-2 text-muted-foreground">
                      <span>•</span>
                      <span className="font-medium text-foreground">{cam.name}</span>
                      {cam.group && <span className="text-xs bg-primary/10 px-1.5 rounded">{cam.group}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Import Result */}
            {importResult && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center gap-2">
                  {importResult.created > 0 ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                  )}
                  <span className="font-medium">
                    {importResult.created} cámaras creadas, {importResult.failed} fallidas
                  </span>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="text-xs text-red-400 space-y-1">
                    {importResult.errors.map((err, i) => (
                      <div key={i}>• {err}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* JSON Format Help */}
            <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
              <p className="font-medium mb-1">Formato esperado:</p>
              <pre className="bg-background p-2 rounded text-[10px] overflow-x-auto">
{`[
  {
    "name": "Entrada",
    "main_stream_url": "rtsp://...",
    "group": "Planta Baja"
  }
]`}
              </pre>
            </div>

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                {importResult ? 'Cerrar' : 'Cancelar'}
              </Button>
              {importData && !importResult && (
                <Button onClick={handleBulkImport} disabled={isLoading}>
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" />Importar {importData.length} Cámaras</>
                  )}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
