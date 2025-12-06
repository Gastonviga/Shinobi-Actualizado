/**
 * BackupManager - System backup and restore interface
 * 
 * Allows admins to export/import full system configuration
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { 
  Download, 
  Upload, 
  AlertTriangle, 
  CheckCircle, 
  Loader2,
  Database,
  Camera,
  Users,
  Settings,
  Map,
  FileJson,
  Shield
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  getBackupInfo, 
  exportBackup, 
  importBackup,
  type BackupMetadata,
  type ImportResult
} from '@/lib/api'

const CONFIRM_WORD = 'RESTAURAR'

export function BackupManager() {
  const [backupInfo, setBackupInfo] = useState<BackupMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'warning', message: string, details?: string[] } | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load backup info on mount
  useEffect(() => {
    loadBackupInfo()
  }, [])

  const loadBackupInfo = async () => {
    try {
      setLoading(true)
      const info = await getBackupInfo()
      setBackupInfo(info)
    } catch (err) {
      console.error('Failed to load backup info:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle export
  const handleExport = useCallback(async () => {
    setExporting(true)
    setResult(null)
    
    try {
      const blob = await exportBackup()
      
      // Create download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // Generate filename with date
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      link.download = `backup_titannvr_${date}.json`
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      setResult({
        type: 'success',
        message: 'Backup exportado correctamente'
      })
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Error al exportar backup'
      setResult({
        type: 'error',
        message
      })
    } finally {
      setExporting(false)
    }
  }, [])

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Validate JSON file
    if (!file.name.endsWith('.json')) {
      setResult({
        type: 'error',
        message: 'Solo se permiten archivos JSON'
      })
      return
    }
    
    setSelectedFile(file)
    setResult(null)
  }

  // Handle import button click
  const handleImportClick = () => {
    if (!selectedFile) return
    
    if (importMode === 'replace') {
      // Show confirmation dialog for replace mode
      setShowConfirmDialog(true)
      setConfirmInput('')
    } else {
      // Merge mode doesn't need confirmation
      performImport()
    }
  }

  // Perform the actual import
  const performImport = async () => {
    if (!selectedFile) return
    
    setImporting(true)
    setShowConfirmDialog(false)
    setResult(null)
    
    try {
      const importResult: ImportResult = await importBackup(selectedFile, importMode, true)
      
      if (importResult.success) {
        setResult({
          type: importResult.errors.length > 0 ? 'warning' : 'success',
          message: `Importación completada: ${importResult.cameras_imported} cámaras, ${importResult.users_imported} usuarios, ${importResult.settings_imported} ajustes, ${importResult.maps_imported} mapas`,
          details: importResult.errors.length > 0 ? importResult.errors : undefined
        })
        
        // Reload backup info
        await loadBackupInfo()
        
        // Clear file selection
        setSelectedFile(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      } else {
        setResult({
          type: 'error',
          message: importResult.message,
          details: importResult.errors
        })
      }
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Error al importar backup'
      setResult({
        type: 'error',
        message
      })
    } finally {
      setImporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/20">
          <Database className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-zinc-200">Copia de Seguridad</h3>
          <p className="text-xs text-zinc-500">Exporta e importa la configuración del sistema</p>
        </div>
      </div>

      {/* Result Banner */}
      {result && (
        <div className={`p-3 rounded-lg flex items-start gap-2 ${
          result.type === 'success' 
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
            : result.type === 'warning'
            ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
            : 'bg-red-500/10 border border-red-500/30 text-red-400'
        }`}>
          {result.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          ) : result.type === 'warning' ? (
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <span className="text-sm">{result.message}</span>
            {result.details && result.details.length > 0 && (
              <div className="mt-2 text-xs opacity-80 space-y-1">
                {result.details.slice(0, 5).map((detail, i) => (
                  <p key={i}>• {detail}</p>
                ))}
                {result.details.length > 5 && (
                  <p>...y {result.details.length - 5} más</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Export Section */}
        <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50">
          <div className="flex items-center gap-2 mb-4">
            <Download className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-zinc-300">Exportar</span>
          </div>
          
          {/* Current Data Summary */}
          {backupInfo && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Camera className="w-3 h-3" />
                <span>{backupInfo.cameras_count} cámaras</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Users className="w-3 h-3" />
                <span>{backupInfo.users_count} usuarios</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Settings className="w-3 h-3" />
                <span>{backupInfo.settings_count} ajustes</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Map className="w-3 h-3" />
                <span>{backupInfo.maps_count} mapas</span>
              </div>
            </div>
          )}
          
          <Button
            onClick={handleExport}
            disabled={exporting}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {exporting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exportando...</>
            ) : (
              <><Download className="w-4 h-4 mr-2" />Descargar Backup</>
            )}
          </Button>
          
          <p className="text-[10px] text-zinc-500 mt-2 text-center">
            Genera un archivo JSON con toda la configuración
          </p>
        </div>

        {/* Import Section */}
        <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50">
          <div className="flex items-center gap-2 mb-4">
            <Upload className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-zinc-300">Importar</span>
          </div>
          
          {/* File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
            id="backup-file-input"
          />
          
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="mb-3 p-4 rounded-lg border-2 border-dashed border-zinc-700 hover:border-zinc-600 cursor-pointer transition-colors text-center"
          >
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2 text-zinc-300">
                <FileJson className="w-5 h-5 text-blue-400" />
                <span className="text-sm truncate max-w-[150px]">{selectedFile.name}</span>
              </div>
            ) : (
              <>
                <Upload className="w-6 h-6 text-zinc-500 mx-auto mb-1" />
                <p className="text-xs text-zinc-500">Click para seleccionar archivo</p>
              </>
            )}
          </div>
          
          {/* Import Mode Selection */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setImportMode('merge')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                importMode === 'merge'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Combinar
            </button>
            <button
              onClick={() => setImportMode('replace')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                importMode === 'replace'
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Reemplazar
            </button>
          </div>
          
          <p className="text-[10px] text-zinc-500 mb-3">
            {importMode === 'merge' 
              ? 'Combinar: Actualiza existentes y crea nuevos'
              : '⚠️ Reemplazar: Borra TODO y restaura desde backup'}
          </p>
          
          <Button
            onClick={handleImportClick}
            disabled={!selectedFile || importing}
            variant={importMode === 'replace' ? 'destructive' : 'default'}
            className={`w-full ${importMode === 'merge' ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
          >
            {importing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" />Restaurar Backup</>
            )}
          </Button>
        </div>
      </div>

      {/* Security Notice */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
        <Shield className="w-4 h-4 text-amber-400 mt-0.5" />
        <div className="text-xs text-amber-400/80">
          <p className="font-medium text-amber-400 mb-1">Nota de Seguridad</p>
          <p>Las contraseñas de usuarios NO se incluyen en el backup. Los usuarios importados tendrán una contraseña temporal "changeme123" que deberán cambiar.</p>
        </div>
      </div>

      {/* Confirmation Dialog for Replace Mode */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowConfirmDialog(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-zinc-900 border border-red-500/50 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            {/* Warning Icon */}
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-red-500/20">
                <AlertTriangle className="w-10 h-10 text-red-500" />
              </div>
            </div>
            
            {/* Content */}
            <h3 className="text-xl font-bold text-red-400 text-center mb-2">
              ⚠️ OPERACIÓN DESTRUCTIVA
            </h3>
            <p className="text-sm text-zinc-300 text-center mb-4">
              Esta acción <span className="text-red-400 font-bold">ELIMINARÁ PERMANENTEMENTE</span> todos los datos actuales:
            </p>
            
            <ul className="text-sm text-zinc-400 mb-4 space-y-1">
              <li>• Todas las cámaras configuradas</li>
              <li>• Todos los usuarios (excepto el actual)</li>
              <li>• Toda la configuración del sistema</li>
              <li>• Todos los mapas</li>
            </ul>
            
            <p className="text-sm text-zinc-300 text-center mb-4">
              Para confirmar, escribe <span className="font-mono font-bold text-red-400">{CONFIRM_WORD}</span> abajo:
            </p>
            
            <Input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value.toUpperCase())}
              placeholder={CONFIRM_WORD}
              className="bg-zinc-800 border-red-500/50 text-center font-mono text-lg mb-4"
              autoFocus
            />
            
            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 text-zinc-400 hover:text-zinc-200"
              >
                Cancelar
              </Button>
              <Button
                onClick={performImport}
                disabled={confirmInput !== CONFIRM_WORD}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                CONFIRMAR
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
