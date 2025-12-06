import { useState, useEffect } from 'react'
import { 
  HardDrive, 
  Loader2, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Database
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api'

interface StorageVolume {
  mount_point: string
  device: string
  total_gb: number
  used_gb: number
  free_gb: number
  percent_used: number
  is_primary: boolean
  fs_type: string | null
}

interface StorageVolumesResponse {
  volumes: StorageVolume[]
  primary_path: string
  estimated_days_remaining: number | null
}

function getStorageStatusColor(percentUsed: number): {
  bar: string
  text: string
  bg: string
  status: 'critical' | 'warning' | 'healthy'
} {
  if (percentUsed > 90) {
    return {
      bar: 'bg-red-500',
      text: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/30',
      status: 'critical'
    }
  }
  if (percentUsed > 75) {
    return {
      bar: 'bg-yellow-500',
      text: 'text-yellow-400',
      bg: 'bg-yellow-500/10 border-yellow-500/30',
      status: 'warning'
    }
  }
  return {
    bar: 'bg-emerald-500',
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    status: 'healthy'
  }
}

function formatBytes(gb: number): string {
  if (gb >= 1000) {
    return `${(gb / 1000).toFixed(2)} TB`
  }
  return `${gb.toFixed(1)} GB`
}

export function StorageManager() {
  const [volumes, setVolumes] = useState<StorageVolume[]>([])
  const [primaryPath, setPrimaryPath] = useState<string>('')
  const [estimatedDays, setEstimatedDays] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadStorageInfo = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await api.get<StorageVolumesResponse>('/system/storage/volumes')
      setVolumes(response.data.volumes)
      setPrimaryPath(response.data.primary_path)
      setEstimatedDays(response.data.estimated_days_remaining)
    } catch (err: any) {
      console.error('Failed to load storage info:', err)
      setError(err?.response?.data?.detail || 'Error al cargar información de almacenamiento')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStorageInfo()
  }, [])

  // Check if any volume is critical
  const hasCriticalVolume = volumes.some(v => v.percent_used > 90)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-medium">Error</span>
        </div>
        <p className="text-sm">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={loadStorageInfo}
          className="mt-3 border-red-500/30 text-red-400 hover:bg-red-500/10"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-400" />
          <span className="text-sm text-zinc-400">
            Ruta de grabaciones: <code className="text-zinc-200 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">{primaryPath}</code>
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadStorageInfo}
          disabled={isLoading}
          className="text-zinc-400 hover:text-zinc-200"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Critical Alert */}
      {hasCriticalVolume && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">¡Espacio crítico!</p>
            <p className="text-xs text-red-300/80">
              Uno o más discos tienen menos del 10% de espacio libre. Considera eliminar grabaciones antiguas.
            </p>
          </div>
        </div>
      )}

      {/* Estimated days remaining */}
      {estimatedDays !== null && (
        <div className={`p-3 rounded-lg flex items-center gap-3 ${
          estimatedDays < 3 
            ? 'bg-red-500/10 border border-red-500/30' 
            : estimatedDays < 7 
              ? 'bg-yellow-500/10 border border-yellow-500/30'
              : 'bg-emerald-500/10 border border-emerald-500/30'
        }`}>
          <CheckCircle className={`w-5 h-5 flex-shrink-0 ${
            estimatedDays < 3 
              ? 'text-red-400' 
              : estimatedDays < 7 
                ? 'text-yellow-400'
                : 'text-emerald-400'
          }`} />
          <div>
            <p className={`text-sm font-medium ${
              estimatedDays < 3 
                ? 'text-red-400' 
                : estimatedDays < 7 
                  ? 'text-yellow-400'
                  : 'text-emerald-400'
            }`}>
              ~{estimatedDays} días de grabación restantes
            </p>
            <p className="text-xs text-zinc-400">
              Estimación basada en uso promedio de 5 GB/día
            </p>
          </div>
        </div>
      )}

      {/* Volume Cards */}
      {volumes.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <HardDrive className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No se encontraron volúmenes de almacenamiento</p>
        </div>
      ) : (
        <div className="space-y-3">
          {volumes.map((volume) => {
            const status = getStorageStatusColor(volume.percent_used)
            
            return (
              <Card
                key={volume.mount_point}
                className={`p-4 bg-zinc-800/50 border ${
                  volume.is_primary ? 'border-blue-500/50' : 'border-zinc-700'
                }`}
              >
                {/* Volume Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <HardDrive className={`w-4 h-4 ${volume.is_primary ? 'text-blue-400' : 'text-zinc-500'}`} />
                    <span className="font-medium text-zinc-200">{volume.mount_point}</span>
                    {volume.is_primary && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">
                        PRINCIPAL
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500">{volume.device}</span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <Progress
                    value={volume.percent_used}
                    max={100}
                    className="h-3 bg-zinc-700"
                    indicatorClassName={status.bar}
                  />
                  
                  {/* Stats Row */}
                  <div className="flex items-center justify-between text-xs">
                    <span className={status.text}>
                      {formatBytes(volume.free_gb)} libres de {formatBytes(volume.total_gb)}
                    </span>
                    <span className={`font-medium ${status.text}`}>
                      {volume.percent_used.toFixed(1)}% usado
                    </span>
                  </div>
                  
                  {/* FS Type */}
                  {volume.fs_type && (
                    <div className="text-[10px] text-zinc-600">
                      Sistema de archivos: {volume.fs_type}
                    </div>
                  )}
                </div>

                {/* Warning for critical volumes */}
                {status.status === 'critical' && (
                  <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs text-red-400">Espacio casi agotado</span>
                  </div>
                )}
                {status.status === 'warning' && (
                  <div className="mt-3 p-2 rounded bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-xs text-yellow-400">Espacio limitado</span>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
