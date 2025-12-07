import { useState, useEffect } from 'react'
import { 
  Search, 
  Calendar,
  Camera,
  User,
  Car,
  Dog,
  Loader2,
  Film,
  RotateCcw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { 
  getSearchLabels, 
  getSearchCameras,
  type LabelInfo,
  type CameraEventInfo,
  type SearchFilters as SearchFiltersType
} from '@/lib/api'

interface SearchFiltersProps {
  onSearch: (filters: SearchFiltersType) => void
  isSearching: boolean
}

// Label icon mapping
const LABEL_ICONS: Record<string, typeof User> = {
  person: User,
  car: Car,
  dog: Dog,
  cat: Dog, // No cat icon, use dog
  motorcycle: Car,
  bicycle: Car,
  truck: Car,
}

// Common object labels with translations
const LABEL_NAMES: Record<string, string> = {
  person: 'Persona',
  car: 'Vehículo',
  dog: 'Perro',
  cat: 'Gato',
  motorcycle: 'Moto',
  bicycle: 'Bicicleta',
  truck: 'Camión',
}

export function SearchFilters({ onSearch, isSearching }: SearchFiltersProps) {
  // Filter options from API
  const [availableLabels, setAvailableLabels] = useState<LabelInfo[]>([])
  const [availableCameras, setAvailableCameras] = useState<CameraEventInfo[]>([])
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)

  // Selected filters
  const [selectedCameras, setSelectedCameras] = useState<Set<string>>(new Set())
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set())
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [minScore, setMinScore] = useState<number>(50)
  const [hasClipOnly, setHasClipOnly] = useState<boolean>(false)

  // Load filter options
  useEffect(() => {
    loadFilterOptions()
  }, [])

  const loadFilterOptions = async () => {
    setIsLoadingOptions(true)
    try {
      const [labelsRes, camerasRes] = await Promise.all([
        getSearchLabels(),
        getSearchCameras()
      ])
      setAvailableLabels(labelsRes.labels)
      setAvailableCameras(camerasRes.cameras)
    } catch (err) {
      console.error('Failed to load filter options:', err)
    } finally {
      setIsLoadingOptions(false)
    }
  }

  // Toggle camera selection
  const toggleCamera = (camera: string) => {
    setSelectedCameras(prev => {
      const newSet = new Set(prev)
      if (newSet.has(camera)) {
        newSet.delete(camera)
      } else {
        newSet.add(camera)
      }
      return newSet
    })
  }

  // Toggle label selection
  const toggleLabel = (label: string) => {
    setSelectedLabels(prev => {
      const newSet = new Set(prev)
      if (newSet.has(label)) {
        newSet.delete(label)
      } else {
        newSet.add(label)
      }
      return newSet
    })
  }

  // Handle search
  const handleSearch = () => {
    const filters: SearchFiltersType = {}
    
    if (selectedCameras.size > 0) {
      filters.camera_ids = Array.from(selectedCameras)
    }
    
    if (selectedLabels.size > 0) {
      filters.labels = Array.from(selectedLabels)
    }
    
    if (dateFrom) {
      filters.date_from = new Date(dateFrom).toISOString()
    }
    
    if (dateTo) {
      filters.date_to = new Date(dateTo).toISOString()
    }
    
    if (minScore > 0) {
      filters.min_score = minScore / 100
    }
    
    if (hasClipOnly) {
      filters.has_clip = true
    }
    
    onSearch(filters)
  }

  // Reset filters
  const handleReset = () => {
    setSelectedCameras(new Set())
    setSelectedLabels(new Set())
    setDateFrom('')
    setDateTo('')
    setMinScore(50)
    setHasClipOnly(false)
  }

  // Set quick date ranges
  const setQuickRange = (hours: number) => {
    const now = new Date()
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000)
    setDateFrom(from.toISOString().slice(0, 16))
    setDateTo(now.toISOString().slice(0, 16))
  }

  if (isLoadingOptions) {
    return (
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4 bg-card border-border space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">Filtros</h2>
        </div>
        <button
          onClick={handleReset}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" />
          Limpiar
        </button>
      </div>

      {/* Date Range */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          Rango de Fechas
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-muted-foreground">Desde</span>
            <Input
              type="datetime-local"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-muted border-border text-xs h-8"
            />
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground">Hasta</span>
            <Input
              type="datetime-local"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-muted border-border text-xs h-8"
            />
          </div>
        </div>
        {/* Quick ranges */}
        <div className="flex flex-wrap gap-1">
          {[
            { label: '1h', hours: 1 },
            { label: '6h', hours: 6 },
            { label: '24h', hours: 24 },
            { label: '7d', hours: 168 },
          ].map(({ label, hours }) => (
            <button
              key={hours}
              onClick={() => setQuickRange(hours)}
              className="px-2 py-0.5 text-[10px] rounded bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              Últimas {label}
            </button>
          ))}
        </div>
      </div>

      {/* Cameras */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5" />
          Cámaras ({selectedCameras.size}/{availableCameras.length})
        </Label>
        <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
          {availableCameras.map((cam) => (
            <label
              key={cam.camera}
              className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
            >
              <Checkbox
                checked={selectedCameras.has(cam.camera)}
                onCheckedChange={() => toggleCamera(cam.camera)}
              />
              <span className="text-xs text-foreground flex-1 truncate">{cam.camera}</span>
              <span className="text-[10px] text-muted-foreground">{cam.event_count}</span>
            </label>
          ))}
          {availableCameras.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">Sin cámaras</p>
          )}
        </div>
      </div>

      {/* Object Labels */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Objetos Detectados</Label>
        <div className="flex flex-wrap gap-1.5">
          {availableLabels.map((labelInfo) => {
            const Icon = LABEL_ICONS[labelInfo.label] || User
            const isSelected = selectedLabels.has(labelInfo.label)
            return (
              <button
                key={labelInfo.label}
                onClick={() => toggleLabel(labelInfo.label)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isSelected
                    ? 'text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
                style={{
                  backgroundColor: isSelected ? labelInfo.color : undefined,
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {LABEL_NAMES[labelInfo.label] || labelInfo.label}
                <span className={`text-[10px] ${isSelected ? 'text-white/70' : 'text-muted-foreground'}`}>
                  {labelInfo.count}
                </span>
              </button>
            )
          })}
          {availableLabels.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin etiquetas</p>
          )}
        </div>
      </div>

      {/* Min Score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Confianza Mínima</Label>
          <span className="text-xs font-medium text-foreground">{minScore}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={minScore}
          onChange={(e) => setMinScore(parseInt(e.target.value))}
          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Has Clip Only */}
      <label className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted">
        <Checkbox
          checked={hasClipOnly}
          onCheckedChange={(checked) => setHasClipOnly(!!checked)}
        />
        <Film className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs text-foreground">Solo con video</span>
      </label>

      {/* Search Button */}
      <Button
        onClick={handleSearch}
        disabled={isSearching}
        className="w-full bg-blue-600 hover:bg-blue-700"
      >
        {isSearching ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Buscando...
          </>
        ) : (
          <>
            <Search className="w-4 h-4 mr-2" />
            Buscar Eventos
          </>
        )}
      </Button>
    </Card>
  )
}
