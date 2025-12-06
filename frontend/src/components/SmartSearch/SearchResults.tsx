import { useState } from 'react'
import { 
  Play, 
  Camera, 
  Clock, 
  Film,
  Image,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ExternalLink
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type SearchResultItem, type SearchResponse } from '@/lib/api'

interface SearchResultsProps {
  results: SearchResponse | null
  isLoading: boolean
  onPageChange: (page: number) => void
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

function formatDateTime(isoString: string): { date: string; time: string } {
  const d = new Date(isoString)
  return {
    date: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
    time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}m ${secs}s`
}

interface EventCardProps {
  event: SearchResultItem
  onClick: () => void
}

function EventCard({ event, onClick }: EventCardProps) {
  const { date, time } = formatDateTime(event.start_time)
  const scorePercent = Math.round(event.score * 100)
  
  return (
    <Card
      onClick={onClick}
      className="group relative overflow-hidden bg-zinc-900/50 border-zinc-800 hover:border-zinc-600 cursor-pointer transition-all"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-zinc-800 relative overflow-hidden">
        {event.thumbnail_url ? (
          <img
            src={event.thumbnail_url}
            alt={`${event.label} en ${event.camera}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Hide broken image
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="w-8 h-8 text-zinc-700" />
          </div>
        )}
        
        {/* Play overlay for clips */}
        {event.has_clip && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="p-3 rounded-full bg-white/20 backdrop-blur-sm">
              <Play className="w-6 h-6 text-white" fill="white" />
            </div>
          </div>
        )}
        
        {/* Score Badge */}
        <div
          className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: event.color }}
        >
          {LABEL_NAMES[event.label] || event.label} {scorePercent}%
        </div>
        
        {/* Clip indicator */}
        {event.has_clip && (
          <div className="absolute bottom-2 right-2">
            <Film className="w-4 h-4 text-white drop-shadow-lg" />
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <Camera className="w-3 h-3" />
            <span className="truncate max-w-[120px]">{event.camera}</span>
          </div>
          {event.duration_seconds && (
            <span className="text-[10px] text-zinc-500">
              {formatDuration(event.duration_seconds)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <Clock className="w-3 h-3" />
          <span>{date}</span>
          <span className="text-zinc-600">•</span>
          <span>{time}</span>
        </div>
      </div>
    </Card>
  )
}

interface EventDetailDialogProps {
  event: SearchResultItem | null
  isOpen: boolean
  onClose: () => void
}

function EventDetailDialog({ event, isOpen, onClose }: EventDetailDialogProps) {
  if (!event) return null
  
  const { date, time } = formatDateTime(event.start_time)
  const scorePercent = Math.round(event.score * 100)
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] bg-zinc-900 border-zinc-800 p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: event.color }}
            />
            {LABEL_NAMES[event.label] || event.label} - {event.camera}
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-4 space-y-4">
          {/* Video Player or Snapshot */}
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {event.has_clip && event.clip_url ? (
              <video
                src={event.clip_url}
                controls
                autoPlay
                className="w-full h-full object-contain"
              >
                Tu navegador no soporta video HTML5.
              </video>
            ) : event.thumbnail_url ? (
              <img
                src={event.thumbnail_url}
                alt={`${event.label} en ${event.camera}`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600">
                <AlertCircle className="w-12 h-12" />
              </div>
            )}
          </div>
          
          {/* Event Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-zinc-800/50">
              <div className="text-[10px] text-zinc-500 uppercase">Cámara</div>
              <div className="text-sm font-medium text-zinc-200">{event.camera}</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-800/50">
              <div className="text-[10px] text-zinc-500 uppercase">Objeto</div>
              <div className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: event.color }}
                />
                {LABEL_NAMES[event.label] || event.label}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-800/50">
              <div className="text-[10px] text-zinc-500 uppercase">Confianza</div>
              <div className="text-sm font-medium text-zinc-200">{scorePercent}%</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-800/50">
              <div className="text-[10px] text-zinc-500 uppercase">Duración</div>
              <div className="text-sm font-medium text-zinc-200">
                {formatDuration(event.duration_seconds)}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-zinc-800/50">
              <div className="text-[10px] text-zinc-500 uppercase">Fecha/Hora</div>
              <div className="text-sm font-medium text-zinc-200">{date} a las {time}</div>
            </div>
            {event.zones && (
              <div className="p-3 rounded-lg bg-zinc-800/50">
                <div className="text-[10px] text-zinc-500 uppercase">Zonas</div>
                <div className="text-sm font-medium text-zinc-200">{event.zones}</div>
              </div>
            )}
          </div>
          
          {/* External Links */}
          <div className="flex gap-2 pt-2">
            {event.clip_url && (
              <a
                href={event.clip_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Abrir clip en nueva pestaña
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SearchResults({ results, isLoading, onPageChange }: SearchResultsProps) {
  const [selectedEvent, setSelectedEvent] = useState<SearchResultItem | null>(null)
  
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-zinc-400">Buscando eventos...</p>
        </div>
      </div>
    )
  }
  
  if (!results) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <Camera className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-zinc-300 mb-2">Búsqueda Forense</h3>
          <p className="text-sm text-zinc-500">
            Usa los filtros de la izquierda para buscar eventos de detección.
            Puedes filtrar por cámara, tipo de objeto, fecha y confianza.
          </p>
        </div>
      </div>
    )
  }
  
  if (results.results.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-zinc-300 mb-2">Sin Resultados</h3>
          <p className="text-sm text-zinc-500">
            No se encontraron eventos con los filtros seleccionados.
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex-1 flex flex-col">
      {/* Results Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-zinc-400">
          <span className="font-medium text-zinc-200">{results.total}</span> eventos encontrados
        </div>
        <div className="text-xs text-zinc-500">
          Página {results.page} de {results.total_pages}
        </div>
      </div>
      
      {/* Results Grid */}
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 auto-rows-min">
        {results.results.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onClick={() => setSelectedEvent(event)}
          />
        ))}
      </div>
      
      {/* Pagination */}
      {results.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-zinc-800">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(results.page - 1)}
            disabled={results.page <= 1}
            className="border-zinc-700"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, results.total_pages) }, (_, i) => {
              let pageNum: number
              if (results.total_pages <= 5) {
                pageNum = i + 1
              } else if (results.page <= 3) {
                pageNum = i + 1
              } else if (results.page >= results.total_pages - 2) {
                pageNum = results.total_pages - 4 + i
              } else {
                pageNum = results.page - 2 + i
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`w-8 h-8 rounded text-sm ${
                    pageNum === results.page
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(results.page + 1)}
            disabled={results.page >= results.total_pages}
            className="border-zinc-700"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
      
      {/* Event Detail Dialog */}
      <EventDetailDialog
        event={selectedEvent}
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  )
}
