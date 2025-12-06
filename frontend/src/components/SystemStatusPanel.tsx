import { useState, useEffect, useCallback } from 'react'
import { 
  Cpu, 
  HardDrive, 
  MemoryStick, 
  Activity,
  Wifi,
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Server
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { 
  getSystemStats, 
  getServicesStatus,
  type SystemHealth,
  type ServicesStatus
} from '@/lib/api'

interface SystemStatusPanelProps {
  isAdmin: boolean
}

// Circular gauge component
const CircularGauge = ({ 
  value, 
  max = 100, 
  label, 
  unit = '%',
  size = 120,
  strokeWidth = 10,
  colorClass = 'text-blue-500'
}: {
  value: number
  max?: number
  label: string
  unit?: string
  size?: number
  strokeWidth?: number
  colorClass?: string
}) => {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const percent = Math.min((value / max) * 100, 100)
  const offset = circumference - (percent / 100) * circumference
  
  // Determine color based on value
  let actualColorClass = colorClass
  if (percent > 90) {
    actualColorClass = 'text-red-500'
  } else if (percent > 75) {
    actualColorClass = 'text-yellow-500'
  }
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background circle */}
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={`${actualColorClass} transition-all duration-500`}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${actualColorClass}`}>
            {value.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
      <span className="mt-2 text-sm font-medium text-foreground">{label}</span>
    </div>
  )
}

// Service status indicator
const ServiceIndicator = ({ 
  name, 
  status 
}: { 
  name: string
  status: string 
}) => {
  const isOnline = status === 'online'
  
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
      <span className="text-sm text-foreground">{name}</span>
      <div className={`flex items-center gap-1 text-xs ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
        {status}
      </div>
    </div>
  )
}

export function SystemStatusPanel({ isAdmin }: SystemStatusPanelProps) {
  const [stats, setStats] = useState<SystemHealth | null>(null)
  const [services, setServices] = useState<ServicesStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  
  const loadData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true)
      
      const [statsData, servicesData] = await Promise.all([
        getSystemStats(),
        isAdmin ? getServicesStatus() : Promise.resolve(null)
      ])
      
      setStats(statsData)
      setServices(servicesData)
      setError(null)
    } catch (err) {
      console.error('Failed to load system stats:', err)
      setError('Error al cargar estadísticas del sistema')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isAdmin])
  
  useEffect(() => {
    loadData()
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(() => loadData(), 10000)
    return () => clearInterval(interval)
  }, [loadData])
  
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    )
  }
  
  if (!stats) return null
  
  return (
    <div className="space-y-6">
      {/* Header with status and refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${
            stats.overall_status === 'healthy' ? 'bg-emerald-500/10' :
            stats.overall_status === 'warning' ? 'bg-yellow-500/10' : 'bg-red-500/10'
          }`}>
            {stats.overall_status === 'healthy' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className={`w-5 h-5 ${
                stats.overall_status === 'warning' ? 'text-yellow-400' : 'text-red-400'
              }`} />
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Estado del Sistema</h3>
            <p className="text-xs text-muted-foreground">
              {stats.overall_status === 'healthy' ? 'Todo funcionando correctamente' :
               stats.overall_status === 'warning' ? 'Atención requerida' : 'Estado crítico'}
            </p>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>
      
      {/* Alerts */}
      {stats.alerts.length > 0 && (
        <div className="space-y-2">
          {stats.alerts.map((alert, index) => (
            <div 
              key={index}
              className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{alert}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Resource Gauges */}
      <div className="grid grid-cols-3 gap-6">
        <div className="flex flex-col items-center p-4 rounded-xl bg-secondary/30 border border-border">
          <Cpu className="w-5 h-5 text-blue-400 mb-2" />
          <CircularGauge 
            value={stats.cpu.percent_total}
            label="CPU"
            colorClass="text-blue-500"
          />
          <span className="mt-2 text-xs text-muted-foreground">
            {stats.cpu.core_count} núcleos
          </span>
        </div>
        
        <div className="flex flex-col items-center p-4 rounded-xl bg-secondary/30 border border-border">
          <MemoryStick className="w-5 h-5 text-purple-400 mb-2" />
          <CircularGauge 
            value={stats.memory.percent_used}
            label="Memoria RAM"
            colorClass="text-purple-500"
          />
          <span className="mt-2 text-xs text-muted-foreground">
            {stats.memory.used_gb.toFixed(1)} / {stats.memory.total_gb.toFixed(1)} GB
          </span>
        </div>
        
        <div className="flex flex-col items-center p-4 rounded-xl bg-secondary/30 border border-border">
          <HardDrive className={`w-5 h-5 mb-2 ${stats.disk.is_critical ? 'text-red-400' : 'text-emerald-400'}`} />
          <CircularGauge 
            value={stats.disk.percent_used}
            label="Almacenamiento"
            colorClass={stats.disk.is_critical ? 'text-red-500' : 'text-emerald-500'}
          />
          <span className="mt-2 text-xs text-muted-foreground">
            {stats.disk.free_gb.toFixed(1)} GB libres
          </span>
          {stats.disk.is_critical && (
            <span className="mt-1 text-xs text-red-400 font-medium">
              ⚠️ Espacio crítico
            </span>
          )}
        </div>
      </div>
      
      {/* Network & Uptime */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-secondary/30 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Wifi className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-foreground">Red</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-lg font-semibold text-foreground">
                {stats.network.bytes_sent_gb.toFixed(2)} GB
              </p>
              <p className="text-xs text-muted-foreground">Enviados</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">
                {stats.network.bytes_recv_gb.toFixed(2)} GB
              </p>
              <p className="text-xs text-muted-foreground">Recibidos</p>
            </div>
          </div>
        </div>
        
        <div className="p-4 rounded-xl bg-secondary/30 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-foreground">Tiempo Activo</span>
          </div>
          <p className="text-2xl font-semibold text-foreground text-center">
            {stats.uptime.formatted}
          </p>
          <p className="text-xs text-muted-foreground text-center mt-1">
            Desde {new Date(stats.uptime.started_at).toLocaleString()}
          </p>
        </div>
      </div>
      
      {/* Services Status (Admin only) */}
      {isAdmin && services && (
        <div className="p-4 rounded-xl bg-secondary/30 border border-border">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-foreground">Servicios</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ServiceIndicator name="Backend API" status={services.backend} />
            <ServiceIndicator name="Go2RTC" status={services.go2rtc} />
            <ServiceIndicator name="Frigate NVR" status={services.frigate} />
            <ServiceIndicator name="MQTT Broker" status={services.mqtt} />
          </div>
          
          {services.containers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Contenedores Docker</p>
              <div className="space-y-1">
                {services.containers.map((container) => (
                  <div key={container.name} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{container.name}</span>
                    <span className={`${
                      container.status === 'running' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {container.status}
                      {container.health && ` (${container.health})`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Quick Info */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <Activity className="w-3 h-3" />
        <span>Última actualización: {new Date(stats.timestamp).toLocaleTimeString()}</span>
      </div>
    </div>
  )
}
