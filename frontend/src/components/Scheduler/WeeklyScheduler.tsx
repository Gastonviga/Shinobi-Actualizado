import { useState, useEffect, useCallback } from 'react'
import { 
  Loader2, 
  Disc, 
  Activity, 
  Sparkles, 
  Ban,
  Save,
  Trash2,
  Clock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { 
  getCameraSchedules, 
  setCameraSchedules, 
  type ScheduleSlot, 
  type ScheduleMode,
  type CameraScheduleEntry 
} from '@/lib/api'

interface WeeklySchedulerProps {
  cameraId: number
  cameraName: string
  onSaved?: () => void
}

// Days of week (0=Monday, 6=Sunday)
const DAYS = [
  { value: 0, label: 'Lun', fullLabel: 'Lunes' },
  { value: 1, label: 'Mar', fullLabel: 'Martes' },
  { value: 2, label: 'Mié', fullLabel: 'Miércoles' },
  { value: 3, label: 'Jue', fullLabel: 'Jueves' },
  { value: 4, label: 'Vie', fullLabel: 'Viernes' },
  { value: 5, label: 'Sáb', fullLabel: 'Sábado' },
  { value: 6, label: 'Dom', fullLabel: 'Domingo' },
]

// Hours 0-23
const HOURS = Array.from({ length: 24 }, (_, i) => i)

// Recording modes with colors
const MODES: { value: ScheduleMode; label: string; color: string; bgColor: string; icon: typeof Disc }[] = [
  { 
    value: 'continuous', 
    label: 'Continuo', 
    color: 'bg-red-500', 
    bgColor: 'bg-red-500/20 border-red-500/50 text-red-400',
    icon: Disc 
  },
  { 
    value: 'motion', 
    label: 'Movimiento', 
    color: 'bg-yellow-500', 
    bgColor: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400',
    icon: Activity 
  },
  { 
    value: 'events', 
    label: 'Eventos IA', 
    color: 'bg-emerald-500', 
    bgColor: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
    icon: Sparkles 
  },
  { 
    value: 'none', 
    label: 'Sin Grabación', 
    color: 'bg-zinc-600', 
    bgColor: 'bg-zinc-700/50 border-zinc-600/50 text-zinc-400',
    icon: Ban 
  },
]

// Grid cell type: [day][hour] = mode
type ScheduleGrid = (ScheduleMode | null)[][]

export function WeeklyScheduler({ cameraId, cameraName, onSaved }: WeeklySchedulerProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState<ScheduleMode>('motion')
  const [grid, setGrid] = useState<ScheduleGrid>(() => 
    // Initialize empty grid: 7 days x 24 hours
    Array.from({ length: 7 }, () => Array(24).fill(null))
  )
  const [isDragging, setIsDragging] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Load existing schedules
  useEffect(() => {
    loadSchedules()
  }, [cameraId])

  const loadSchedules = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await getCameraSchedules(cameraId)
      
      // Convert schedule entries to grid
      const newGrid: ScheduleGrid = Array.from({ length: 7 }, () => Array(24).fill(null))
      
      for (const entry of response.schedules) {
        const startHour = parseInt(entry.start_time.split(':')[0], 10)
        const endHour = parseInt(entry.end_time.split(':')[0], 10)
        const mode = entry.mode as ScheduleMode
        
        // Fill the hours in this range
        for (let h = startHour; h <= endHour; h++) {
          if (h < 24) {
            newGrid[entry.day_of_week][h] = mode
          }
        }
      }
      
      setGrid(newGrid)
      setHasChanges(false)
    } catch (err: any) {
      console.error('Failed to load schedules:', err)
      setError(err?.response?.data?.detail || 'Error al cargar horarios')
    } finally {
      setIsLoading(false)
    }
  }

  // Convert grid back to schedule slots
  const gridToSlots = useCallback((): ScheduleSlot[] => {
    const slots: ScheduleSlot[] = []
    
    for (let day = 0; day < 7; day++) {
      let currentMode: ScheduleMode | null = null
      let startHour = 0
      
      for (let hour = 0; hour <= 24; hour++) {
        const mode = hour < 24 ? grid[day][hour] : null
        
        if (mode !== currentMode) {
          // Save previous range if it had a mode
          if (currentMode !== null) {
            slots.push({
              day_of_week: day,
              start_time: `${startHour.toString().padStart(2, '0')}:00`,
              end_time: `${(hour - 1).toString().padStart(2, '0')}:59`,
              mode: currentMode
            })
          }
          
          // Start new range
          currentMode = mode
          startHour = hour
        }
      }
    }
    
    return slots
  }, [grid])

  // Handle cell click or drag
  const handleCellInteraction = (day: number, hour: number) => {
    setGrid(prev => {
      const newGrid = prev.map(row => [...row])
      newGrid[day][hour] = selectedMode
      return newGrid
    })
    setHasChanges(true)
  }

  // Mouse events for drag selection
  const handleMouseDown = (day: number, hour: number) => {
    setIsDragging(true)
    handleCellInteraction(day, hour)
  }

  const handleMouseEnter = (day: number, hour: number) => {
    if (isDragging) {
      handleCellInteraction(day, hour)
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Save schedules
  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const slots = gridToSlots()
      await setCameraSchedules(cameraId, slots)
      setHasChanges(false)
      onSaved?.()
    } catch (err: any) {
      console.error('Failed to save schedules:', err)
      setError(err?.response?.data?.detail || 'Error al guardar horarios')
    } finally {
      setIsSaving(false)
    }
  }

  // Clear all schedules
  const handleClear = () => {
    setGrid(Array.from({ length: 7 }, () => Array(24).fill(null)))
    setHasChanges(true)
  }

  // Get cell color based on mode
  const getCellColor = (mode: ScheduleMode | null): string => {
    if (mode === null) return 'bg-zinc-800/50'
    const modeConfig = MODES.find(m => m.value === mode)
    return modeConfig?.color || 'bg-zinc-800/50'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div 
      className="space-y-4 select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-zinc-200">
            Horario de Grabación
          </span>
        </div>
        {hasChanges && (
          <span className="text-xs text-yellow-400">• Cambios sin guardar</span>
        )}
      </div>

      {/* Mode Selector */}
      <div className="flex flex-wrap gap-2">
        {MODES.map((mode) => {
          const Icon = mode.icon
          const isSelected = selectedMode === mode.value
          return (
            <button
              key={mode.value}
              onClick={() => setSelectedMode(mode.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                isSelected 
                  ? mode.bgColor + ' border-current'
                  : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {mode.label}
            </button>
          )
        })}
      </div>

      {/* Schedule Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Hour headers */}
          <div className="flex">
            <div className="w-12 flex-shrink-0" /> {/* Day label spacer */}
            {HOURS.map(hour => (
              <div 
                key={hour} 
                className="flex-1 text-center text-[10px] text-zinc-500 pb-1"
              >
                {hour.toString().padStart(2, '0')}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {DAYS.map((day) => (
            <div key={day.value} className="flex items-center">
              {/* Day label */}
              <div className="w-12 flex-shrink-0 text-xs font-medium text-zinc-400 pr-2">
                {day.label}
              </div>
              
              {/* Hour cells */}
              <div className="flex flex-1 gap-px">
                {HOURS.map(hour => {
                  const mode = grid[day.value][hour]
                  return (
                    <div
                      key={hour}
                      className={`flex-1 h-6 cursor-pointer transition-colors rounded-sm ${getCellColor(mode)} hover:opacity-80`}
                      onMouseDown={() => handleMouseDown(day.value, hour)}
                      onMouseEnter={() => handleMouseEnter(day.value, hour)}
                      title={`${day.fullLabel} ${hour}:00 - ${mode || 'Sin configurar'}`}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] text-zinc-500">
        {MODES.map((mode) => (
          <div key={mode.value} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${mode.color}`} />
            <span>{mode.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-zinc-800/50 border border-zinc-700" />
          <span>Modo predeterminado</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-2 border-t border-zinc-800">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={isSaving}
          className="text-zinc-400 hover:text-red-400"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Limpiar Todo
        </Button>
        
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4 mr-1" />
              Guardar Horario
            </>
          )}
        </Button>
      </div>

      {/* Help text */}
      <p className="text-[10px] text-zinc-500 text-center">
        Haz clic y arrastra para seleccionar múltiples horas. 
        Las celdas vacías usarán el modo de grabación predeterminado de la cámara.
      </p>
    </div>
  )
}
