import { useState } from 'react'
import { 
  Package, 
  Download, 
  FileText,
  AlertTriangle,
  CheckCircle,
  Loader2,
  X,
  Camera,
  Clock
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  createEvidenceExport, 
  getExportDownloadUrl,
  type ExportResponse 
} from '@/lib/api'

interface SelectedEvent {
  id: string
  camera: string
  label: string
  start_time: string
  thumbnail_url?: string
}

interface EvidenceExportDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedEvents: SelectedEvent[]
  onExportComplete?: (exportId: string) => void
}

export function EvidenceExportDialog({ 
  isOpen, 
  onClose, 
  selectedEvents,
  onExportComplete
}: EvidenceExportDialogProps) {
  const [caseName, setCaseName] = useState('')
  const [caseNumber, setCaseNumber] = useState('')
  const [operatorNotes, setOperatorNotes] = useState('')
  const [includeClips, setIncludeClips] = useState(true)
  const [includeSnapshots, setIncludeSnapshots] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [exportResult, setExportResult] = useState<ExportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const handleExport = async () => {
    if (!caseName.trim()) {
      setError('El nombre del caso es requerido')
      return
    }
    
    if (selectedEvents.length === 0) {
      setError('No hay eventos seleccionados')
      return
    }
    
    setIsExporting(true)
    setError(null)
    
    try {
      const result = await createEvidenceExport({
        event_ids: selectedEvents.map(e => e.id),
        case_name: caseName.trim(),
        case_number: caseNumber.trim() || undefined,
        operator_notes: operatorNotes.trim() || undefined,
        include_clips: includeClips,
        include_snapshots: includeSnapshots
      })
      
      setExportResult(result)
      onExportComplete?.(result.export_id)
    } catch (err) {
      console.error('Export failed:', err)
      setError('Error al crear el paquete de evidencia. Verifique que los eventos tengan medios disponibles.')
    } finally {
      setIsExporting(false)
    }
  }
  
  const handleDownload = () => {
    if (exportResult) {
      window.open(getExportDownloadUrl(exportResult.export_id), '_blank')
    }
  }
  
  const handleClose = () => {
    setCaseName('')
    setCaseNumber('')
    setOperatorNotes('')
    setExportResult(null)
    setError(null)
    onClose()
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Package className="w-5 h-5 text-blue-400" />
            Exportar Evidencia
          </DialogTitle>
        </DialogHeader>
        
        {exportResult ? (
          /* Success State */
          <div className="space-y-4">
            <div className="flex flex-col items-center p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle className="w-12 h-12 text-emerald-400 mb-3" />
              <h3 className="text-lg font-semibold text-zinc-100">Paquete Creado</h3>
              <p className="text-sm text-zinc-400 text-center mt-1">
                El paquete de evidencia está listo para descargar
              </p>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between p-2 rounded bg-zinc-800/50">
                <span className="text-zinc-400">ID de Exportación:</span>
                <span className="text-zinc-200 font-mono">{exportResult.export_id}</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-zinc-800/50">
                <span className="text-zinc-400">Archivos:</span>
                <span className="text-zinc-200">{exportResult.file_count}</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-zinc-800/50">
                <span className="text-zinc-400">Tamaño:</span>
                <span className="text-zinc-200">{exportResult.total_size_mb} MB</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-zinc-800/50">
                <span className="text-zinc-400">Expira:</span>
                <span className="text-zinc-200">{new Date(exportResult.expires_at).toLocaleString()}</span>
              </div>
            </div>
            
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleClose}
                variant="ghost"
                className="flex-1 text-zinc-400"
              >
                Cerrar
              </Button>
              <Button
                onClick={handleDownload}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Descargar ZIP
              </Button>
            </div>
          </div>
        ) : (
          /* Form State */
          <div className="space-y-4">
            {/* Selected Events Summary */}
            <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <div className="flex items-center gap-2 mb-2">
                <Camera className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-zinc-300">
                  {selectedEvents.length} evento(s) seleccionado(s)
                </span>
              </div>
              <div className="max-h-24 overflow-y-auto space-y-1">
                {selectedEvents.map((event) => (
                  <div key={event.id} className="flex items-center gap-2 text-xs text-zinc-400">
                    <Clock className="w-3 h-3" />
                    <span className="truncate">
                      {event.camera} - {event.label} ({new Date(event.start_time).toLocaleString()})
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Error Alert */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            {/* Form Fields */}
            <div className="space-y-3">
              <div>
                <Label htmlFor="caseName" className="text-zinc-300">
                  Nombre del Caso *
                </Label>
                <Input
                  id="caseName"
                  value={caseName}
                  onChange={(e) => setCaseName(e.target.value)}
                  placeholder="Ej: Incidente Estacionamiento 2024-03-15"
                  className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              
              <div>
                <Label htmlFor="caseNumber" className="text-zinc-300">
                  Número de Caso (opcional)
                </Label>
                <Input
                  id="caseNumber"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  placeholder="Ej: INC-2024-0315"
                  className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              
              <div>
                <Label htmlFor="notes" className="text-zinc-300">
                  Notas del Operador
                </Label>
                <textarea
                  id="notes"
                  value={operatorNotes}
                  onChange={(e) => setOperatorNotes(e.target.value)}
                  placeholder="Descripción del incidente, observaciones, etc."
                  rows={3}
                  className="mt-1 w-full p-2 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeClips}
                    onChange={(e) => setIncludeClips(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-zinc-300">Incluir clips de video</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSnapshots}
                    onChange={(e) => setIncludeSnapshots(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-zinc-300">Incluir capturas</span>
                </label>
              </div>
            </div>
            
            {/* Info */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs">
              <FileText className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Cadena de Custodia</p>
                <p className="text-blue-300/70 mt-1">
                  El paquete incluirá un manifiesto con hashes SHA-256 de cada archivo
                  para verificación de integridad y cumplimiento legal.
                </p>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleClose}
                variant="ghost"
                className="flex-1 text-zinc-400"
                disabled={isExporting}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleExport}
                disabled={isExporting || !caseName.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4 mr-2" />
                    Crear Paquete
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
