import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  PlaySquare,
  Search,
  Film,
  Camera,
  Clock,
  Loader2,
  CheckSquare,
  Square,
  AlertCircle,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { SyncPlayer } from './SyncPlayer'
import { 
  searchEvents, 
  type SearchResultItem,
  type SearchFilters 
} from '@/lib/api'

interface IncidentWorkspaceProps {
  onBack: () => void
}

const MAX_SELECTED = 4

function formatEventDateTime(isoString: string): { date: string; time: string } {
  const d = new Date(isoString)
  return {
    date: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
    time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }
}

// Label translations
const LABEL_NAMES: Record<string, string> = {
  person: 'Persona',
  car: 'Vehículo',
  dog: 'Perro',
  cat: 'Gato',
  motorcycle: 'Moto',
  bicycle: 'Bicicleta',
  truck: 'Camión',
}

export function IncidentWorkspace({ onBack }: IncidentWorkspaceProps) {
  // Event list state
  const [events, setEvents] = useState<SearchResultItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Selected events for sync playback
  const [selectedEvents, setSelectedEvents] = useState<SearchResultItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Load recent events with clips
  useEffect(() => {
    loadRecentEvents()
  }, [])

  const loadRecentEvents = async () => {
    setIsLoading(true)
    try {
      // Search for recent events that have clips
      const filters: SearchFilters = {
        has_clip: true
      }
      
      // Get last 7 days
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      filters.date_from = weekAgo.toISOString()
      filters.date_to = now.toISOString()
      
      const response = await searchEvents(filters, 1, 100)
      setEvents(response.results)
    } catch (err) {
      console.error('Failed to load events:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Filter events by search query
  const filteredEvents = events.filter(event => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      event.camera.toLowerCase().includes(q) ||
      event.label.toLowerCase().includes(q) ||
      (LABEL_NAMES[event.label] || '').toLowerCase().includes(q)
    )
  })

  // Only show events with clips
  const eventsWithClips = filteredEvents.filter(e => e.has_clip && e.clip_url)

  // Toggle event selection
  const toggleEventSelection = useCallback((event: SearchResultItem) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      
      if (newSet.has(event.id)) {
        // Remove from selection
        newSet.delete(event.id)
        setSelectedEvents(current => current.filter(e => e.id !== event.id))
      } else {
        // Add to selection (if under max)
        if (newSet.size < MAX_SELECTED) {
          newSet.add(event.id)
          setSelectedEvents(current => [...current, event])
        }
      }
      
      return newSet
    })
  }, [])

  // Remove event from player
  const handleRemoveEvent = useCallback((eventId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      newSet.delete(eventId)
      return newSet
    })
    setSelectedEvents(current => current.filter(e => e.id !== eventId))
  }, [])

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setSelectedEvents([])
  }, [])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 flex-shrink-0 bg-card border-b border-border">
        <div className="h-full flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver
            </Button>
            <div className="flex items-center gap-2">
              <PlaySquare className="h-5 w-5 text-purple-500" />
              <span className="font-semibold text-foreground">
                Reproducción Sincronizada
              </span>
            </div>
          </div>
          
          {selectedEvents.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {selectedEvents.length}/{MAX_SELECTED} seleccionados
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="w-4 h-4 mr-1" />
                Limpiar
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Event Selector */}
        <aside className="w-80 flex-shrink-0 bg-card border-r border-border flex flex-col">
          {/* Search Bar */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar eventos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-muted border-border text-sm"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Mostrando eventos con video de las últimas 24 horas
            </p>
          </div>

          {/* Event List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : eventsWithClips.length === 0 ? (
              <div className="p-6 text-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm font-medium text-foreground mb-2">
                  No hay eventos de IA detectados
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Esta sala muestra solo eventos detectados por análisis de video.
                </p>
                <div className="p-3 bg-muted/50 rounded-lg text-left">
                  <p className="text-xs text-muted-foreground">
                    💡 <strong>Tip:</strong> Ve a la sección <strong>"Grabaciones"</strong> para ver el video continuo grabado por tus cámaras.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {eventsWithClips.map((event) => {
                  const { date, time } = formatEventDateTime(event.start_time)
                  const isSelected = selectedIds.has(event.id)
                  const isDisabled = !isSelected && selectedIds.size >= MAX_SELECTED

                  return (
                    <Card
                      key={event.id}
                      onClick={() => !isDisabled && toggleEventSelection(event)}
                      className={`p-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-primary/20 border-primary/50'
                          : isDisabled
                            ? 'bg-muted/30 border-border opacity-50 cursor-not-allowed'
                            : 'bg-muted/50 border-border hover:border-primary/30'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {/* Checkbox */}
                        <div className="flex-shrink-0 mt-0.5">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>

                        {/* Thumbnail */}
                        <div className="w-16 h-10 flex-shrink-0 bg-black rounded overflow-hidden">
                          {event.thumbnail_url ? (
                            <img
                              src={event.thumbnail_url}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => e.currentTarget.style.display = 'none'}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Film className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: event.color }}
                            />
                            <span className="text-xs font-medium text-foreground truncate">
                              {LABEL_NAMES[event.label] || event.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {Math.round(event.score * 100)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                            <Camera className="w-3 h-3" />
                            <span className="truncate">{event.camera}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 mt-0.5">
                            <Clock className="w-3 h-3" />
                            <span>{date} {time}</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* Selection Summary */}
          {selectedEvents.length > 0 && (
            <div className="p-3 border-t border-border bg-card">
              <div className="text-xs text-muted-foreground mb-2">
                Seleccionados ({selectedEvents.length}):
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedEvents.map(event => (
                  <span
                    key={event.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-primary/20 text-primary"
                  >
                    {event.camera}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveEvent(event.id)
                      }}
                      className="hover:text-white"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Right Panel - Sync Player */}
        <main className="flex-1 p-4 flex flex-col min-w-0">
          <SyncPlayer
            events={selectedEvents}
            onRemoveEvent={handleRemoveEvent}
          />
        </main>
      </div>
    </div>
  )
}
