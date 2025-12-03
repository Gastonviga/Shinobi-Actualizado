/**
 * TitanNVR - Event Timeline Component
 * Enterprise v2.0 - NVR-Style Timeline Visualization
 * 
 * Displays a horizontal timeline bar showing detection events
 * with clickable segments to navigate to clips.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Clock, 
  AlertCircle, 
  Play,
  User,
  Car,
  Dog,
  Loader2,
  Calendar,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  getEventTimeline,
  getEventDetail,
  type TimelineEvent,
  type EventDetail
} from '@/lib/api'

// Frigate base URL for clips
const FRIGATE_URL = 'http://localhost:5000'

interface EventTimelineProps {
  cameraName: string
  onEventSelect?: (event: EventDetail) => void
  hours?: number  // Timeline span (default 24h)
}

// Label icons mapping
const LABEL_ICONS: Record<string, React.ReactNode> = {
  person: <User className="h-3 w-3" />,
  car: <Car className="h-3 w-3" />,
  dog: <Dog className="h-3 w-3" />,
}

export function EventTimeline({ cameraName, onEventSelect, hours = 24 }: EventTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null)
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  
  // Time range state
  const [timeOffset, setTimeOffset] = useState(0) // Hours offset from now
  
  // Calculate time range
  const now = new Date()
  const endTime = new Date(now.getTime() - timeOffset * 60 * 60 * 1000)
  const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000)
  
  // Fetch timeline events
  const fetchTimeline = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const data = await getEventTimeline(
        cameraName,
        startTime.toISOString(),
        endTime.toISOString()
      )
      setEvents(data.events)
    } catch (err) {
      console.error('Failed to fetch timeline:', err)
      setError('Error al cargar eventos')
    } finally {
      setLoading(false)
    }
  }, [cameraName, startTime.toISOString(), endTime.toISOString()])
  
  useEffect(() => {
    fetchTimeline()
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchTimeline, 30000)
    return () => clearInterval(interval)
  }, [fetchTimeline])
  
  // Draw timeline on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Set canvas size
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = 60
    
    const width = canvas.width
    const height = canvas.height
    const timeRange = endTime.getTime() - startTime.getTime()
    
    // Clear canvas
    ctx.fillStyle = '#18181b' // zinc-900
    ctx.fillRect(0, 0, width, height)
    
    // Draw time markers
    ctx.fillStyle = '#3f3f46' // zinc-700
    ctx.strokeStyle = '#3f3f46'
    ctx.lineWidth = 1
    
    const hoursToMark = hours <= 12 ? 1 : hours <= 24 ? 2 : 4
    for (let i = 0; i <= hours; i += hoursToMark) {
      const x = (i / hours) * width
      
      // Vertical line
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 10)
      ctx.stroke()
      
      // Time label
      const markerTime = new Date(startTime.getTime() + i * 60 * 60 * 1000)
      const label = markerTime.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
      ctx.fillStyle = '#71717a' // zinc-500
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(label, x, 22)
    }
    
    // Draw events as colored segments
    const barY = 32
    const barHeight = 20
    
    events.forEach(event => {
      const eventStart = event.start_timestamp * 1000
      const eventEnd = (event.end_timestamp || Date.now() / 1000) * 1000
      
      // Calculate position
      const startX = Math.max(0, ((eventStart - startTime.getTime()) / timeRange) * width)
      const endX = Math.min(width, ((eventEnd - startTime.getTime()) / timeRange) * width)
      const segmentWidth = Math.max(4, endX - startX) // Min 4px width for visibility
      
      // Draw segment with rounded corners
      ctx.fillStyle = event.color
      ctx.globalAlpha = hoveredEvent?.id === event.id ? 1 : 0.8
      
      const radius = 3
      ctx.beginPath()
      ctx.roundRect(startX, barY, segmentWidth, barHeight, radius)
      ctx.fill()
      
      // Draw border if selected
      if (selectedEvent?.id === event.id) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      
      ctx.globalAlpha = 1
    })
    
    // Draw base timeline bar (empty periods)
    if (events.length === 0) {
      ctx.fillStyle = '#27272a' // zinc-800
      ctx.fillRect(0, barY, width, barHeight)
      
      // "No events" text
      ctx.fillStyle = '#52525b' // zinc-600
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Sin eventos detectados', width / 2, barY + barHeight / 2 + 4)
    }
    
  }, [events, startTime, endTime, hours, hoveredEvent, selectedEvent])
  
  // Handle click on timeline
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = canvas.width
    const timeRange = endTime.getTime() - startTime.getTime()
    
    // Calculate clicked time
    const clickedTime = startTime.getTime() + (x / width) * timeRange
    
    // Find event at this time
    const clickedEvent = events.find(event => {
      const eventStart = event.start_timestamp * 1000
      const eventEnd = (event.end_timestamp || Date.now() / 1000) * 1000
      return clickedTime >= eventStart && clickedTime <= eventEnd
    })
    
    if (clickedEvent) {
      setSelectedEvent(clickedEvent)
      
      // Fetch full event details
      getEventDetail(clickedEvent.id)
        .then(detail => {
          setEventDetail(detail)
          onEventSelect?.(detail)
        })
        .catch(console.error)
    }
  }, [events, startTime, endTime, onEventSelect])
  
  // Handle mouse move for tooltip
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = canvas.width
    const timeRange = endTime.getTime() - startTime.getTime()
    
    const hoverTime = startTime.getTime() + (x / width) * timeRange
    
    const hovered = events.find(event => {
      const eventStart = event.start_timestamp * 1000
      const eventEnd = (event.end_timestamp || Date.now() / 1000) * 1000
      return hoverTime >= eventStart && hoverTime <= eventEnd
    })
    
    setHoveredEvent(hovered || null)
    setTooltipPos({ x: e.clientX, y: e.clientY })
  }, [events, startTime, endTime])
  
  // Navigate time
  const goBack = () => setTimeOffset(prev => prev + hours)
  const goForward = () => setTimeOffset(prev => Math.max(0, prev - hours))
  const goToNow = () => setTimeOffset(0)
  
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">
            Timeline de Eventos
          </span>
          {events.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {events.length} eventos
            </Badge>
          )}
        </div>
        
        {/* Navigation controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            className="h-7 w-7 p-0"
            title={`Retroceder ${hours}h`}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={goToNow}
            disabled={timeOffset === 0}
            className="h-7 px-2 text-xs"
          >
            Ahora
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={goForward}
            disabled={timeOffset === 0}
            className="h-7 w-7 p-0"
            title={`Avanzar ${hours}h`}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Time range indicator */}
      <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
        <span>{startTime.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>
        <span>{endTime.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </div>
      
      {/* Canvas timeline */}
      <div 
        ref={containerRef} 
        className="relative w-full cursor-pointer"
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10">
            <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}
        
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={() => setHoveredEvent(null)}
          className="w-full rounded"
          style={{ height: '60px' }}
        />
        
        {/* Hover tooltip */}
        {hoveredEvent && (
          <div 
            className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg p-2 shadow-xl pointer-events-none"
            style={{
              left: tooltipPos.x + 10,
              top: tooltipPos.y - 60,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: hoveredEvent.color }}
              />
              <span className="text-sm font-medium text-white capitalize">
                {hoveredEvent.label}
              </span>
              <Badge variant="outline" className="text-xs">
                {(hoveredEvent.score * 100).toFixed(0)}%
              </Badge>
            </div>
            <div className="text-xs text-zinc-400">
              {new Date(hoveredEvent.start_time).toLocaleTimeString('es')}
              {hoveredEvent.has_clip && (
                <span className="ml-2 text-green-400">• Clip disponible</span>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-zinc-400">Persona</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-zinc-400">Vehículo</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-zinc-400">Animal</span>
        </div>
      </div>
      
      {/* Selected event details */}
      {selectedEvent && eventDetail && (
        <div className="mt-3 p-3 bg-zinc-800 rounded-lg border border-zinc-700">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {LABEL_ICONS[eventDetail.label] || <AlertCircle className="h-4 w-4" />}
              <span className="font-medium text-white capitalize">{eventDetail.label}</span>
              <Badge 
                variant="outline" 
                style={{ borderColor: selectedEvent.color, color: selectedEvent.color }}
              >
                {(eventDetail.score * 100).toFixed(0)}% confianza
              </Badge>
            </div>
            
            {eventDetail.has_clip && (
              <a
                href={`${FRIGATE_URL}/api/events/${eventDetail.id}/clip.mp4`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white transition-colors"
              >
                <Play className="h-3 w-3" />
                Ver Clip
              </a>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-zinc-500">Inicio:</span>
              <span className="ml-2 text-zinc-300">
                {new Date(eventDetail.start_time).toLocaleString('es')}
              </span>
            </div>
            {eventDetail.end_time && (
              <div>
                <span className="text-zinc-500">Fin:</span>
                <span className="ml-2 text-zinc-300">
                  {new Date(eventDetail.end_time).toLocaleString('es')}
                </span>
              </div>
            )}
            {eventDetail.duration_seconds && (
              <div>
                <span className="text-zinc-500">Duración:</span>
                <span className="ml-2 text-zinc-300">
                  {eventDetail.duration_seconds.toFixed(1)}s
                </span>
              </div>
            )}
            {eventDetail.zones && (
              <div>
                <span className="text-zinc-500">Zonas:</span>
                <span className="ml-2 text-zinc-300">{eventDetail.zones}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
