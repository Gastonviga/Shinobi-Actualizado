/**
 * TitanNVR - Audit Panel Component
 * Enterprise v2.0 - Compliance & Activity Tracking
 * 
 * Admin-only panel for viewing system audit logs.
 */
import { useState, useEffect, useCallback } from 'react'
import { 
  Shield,
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Activity,
  AlertCircle,
  Loader2,
  Download,
  Calendar
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  getAuditLogs,
  getAuditStats,
  getAuditActionTypes,
  type AuditLog,
  type AuditLogList,
  type AuditStats,
  type AuditActionType
} from '@/lib/api'

// Action color mapping
const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-green-500/20 text-green-400 border-green-500/30',
  LOGOUT: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  LOGIN_FAILED: 'bg-red-500/20 text-red-400 border-red-500/30',
  CAMERA_CREATE: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  CAMERA_UPDATE: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  CAMERA_DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
  RECORDING_DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
  USER_CREATE: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  USER_DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
  SETTINGS_UPDATE: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  PTZ_CONTROL: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
}

// Action labels in Spanish
const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  LOGIN_FAILED: 'Intento fallido',
  CAMERA_CREATE: 'Cámara creada',
  CAMERA_UPDATE: 'Cámara modificada',
  CAMERA_DELETE: 'Cámara eliminada',
  RECORDING_DELETE: 'Grabación eliminada',
  RECORDING_EXPORT: 'Grabación exportada',
  USER_CREATE: 'Usuario creado',
  USER_UPDATE: 'Usuario modificado',
  USER_DELETE: 'Usuario eliminado',
  SETTINGS_UPDATE: 'Config. modificada',
  MAP_CREATE: 'Mapa creado',
  MAP_DELETE: 'Mapa eliminado',
  PTZ_CONTROL: 'Control PTZ',
  EVENT_ACKNOWLEDGE: 'Evento reconocido',
  EVENT_EXPORT: 'Evento exportado',
}

interface AuditPanelProps {
  isAdmin: boolean
}

export function AuditPanel({ isAdmin }: AuditPanelProps) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [actionTypes, setActionTypes] = useState<AuditActionType[]>([])
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Pagination
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20
  
  // Filters
  const [usernameFilter, setUsernameFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  
  // Fetch audit logs
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params: Record<string, any> = {
        page,
        page_size: pageSize
      }
      
      if (usernameFilter) params.username = usernameFilter
      if (actionFilter) params.action = actionFilter
      
      const data = await getAuditLogs(params)
      setLogs(data.items)
      setTotal(data.total)
      setTotalPages(data.total_pages)
    } catch (err) {
      console.error('Failed to fetch audit logs:', err)
      setError('Error al cargar los logs de auditoría')
    } finally {
      setLoading(false)
    }
  }, [page, usernameFilter, actionFilter])
  
  // Fetch stats and action types on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [statsData, typesData] = await Promise.all([
          getAuditStats(7),
          getAuditActionTypes()
        ])
        setStats(statsData)
        setActionTypes(typesData.actions)
      } catch (err) {
        console.error('Failed to load audit data:', err)
      }
    }
    
    if (isAdmin) {
      loadInitialData()
    }
  }, [isAdmin])
  
  // Fetch logs when filters change
  useEffect(() => {
    if (isAdmin) {
      fetchLogs()
    }
  }, [fetchLogs, isAdmin])
  
  // Format timestamp
  const formatTimestamp = (ts: string) => {
    const date = new Date(ts)
    return date.toLocaleString('es', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  // Apply filters
  const applyFilters = () => {
    setPage(1)
    fetchLogs()
  }
  
  // Clear filters
  const clearFilters = () => {
    setUsernameFilter('')
    setActionFilter('')
    setPage(1)
  }
  
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
        <Shield className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Acceso Restringido</p>
        <p className="text-sm">Solo administradores pueden ver los logs de auditoría</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
            <div className="flex items-center gap-2 text-zinc-400 mb-1">
              <Activity className="h-4 w-4" />
              <span className="text-xs">Total (7 días)</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.total_logs}</p>
          </div>
          
          <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
            <div className="flex items-center gap-2 text-zinc-400 mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-xs">Hoy</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.logs_today}</p>
          </div>
          
          <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
            <div className="flex items-center gap-2 text-zinc-400 mb-1">
              <User className="h-4 w-4" />
              <span className="text-xs">Usuarios activos</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.unique_users}</p>
          </div>
          
          <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
            <div className="flex items-center gap-2 text-zinc-400 mb-1">
              <Shield className="h-4 w-4" />
              <span className="text-xs">Logins fallidos</span>
            </div>
            <p className="text-2xl font-bold text-red-400">
              {stats.actions_breakdown['LOGIN_FAILED'] || 0}
            </p>
          </div>
        </div>
      )}
      
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-zinc-800' : ''}
          >
            <Filter className="h-4 w-4 mr-1" />
            Filtros
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchLogs}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
        
        <div className="text-sm text-zinc-400">
          {total} registros en total
        </div>
      </div>
      
      {/* Filters Panel */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Filtrar por usuario..."
              value={usernameFilter}
              onChange={(e) => setUsernameFilter(e.target.value)}
              className="w-48 h-8 text-sm"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-zinc-400" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="h-8 px-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-300"
            >
              <option value="">Todas las acciones</option>
              {actionTypes.map(type => (
                <option key={type.code} value={type.code}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          
          <Button size="sm" variant="default" onClick={applyFilters}>
            <Search className="h-4 w-4 mr-1" />
            Buscar
          </Button>
          
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            Limpiar
          </Button>
        </div>
      )}
      
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
      
      {/* Logs Table */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800/50 text-zinc-400 text-left">
                <th className="px-4 py-3 font-medium">Fecha/Hora</th>
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Acción</th>
                <th className="px-4 py-3 font-medium">Detalles</th>
                <th className="px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-500" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No hay registros de auditoría
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Clock className="h-3 w-3 text-zinc-500" />
                        {formatTimestamp(log.timestamp)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{log.username}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge 
                        variant="outline"
                        className={`text-xs ${ACTION_COLORS[log.action] || 'bg-zinc-500/20 text-zinc-400'}`}
                      >
                        {ACTION_LABELS[log.action] || log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-zinc-400 text-xs line-clamp-2 max-w-xs">
                        {log.details || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-zinc-500 font-mono text-xs">
                        {log.ip_address || '-'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <span className="text-sm text-zinc-500">
              Página {page} de {totalPages}
            </span>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
