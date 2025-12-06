/**
 * KioskControls - Floating control bar for Video Wall mode
 * 
 * Auto-hides after 3 seconds of inactivity.
 * Provides play/pause, navigation, interval selection, and exit.
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  X,
  Monitor
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface KioskControlsProps {
  isPaused: boolean
  onTogglePause: () => void
  onPrevious: () => void
  onNext: () => void
  intervalSeconds: number
  onIntervalChange: (seconds: number) => void
  currentPage: number
  totalPages: number
  currentGroupName: string
}

const INTERVAL_OPTIONS = [
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 120, label: '2m' },
]

export function KioskControls({
  isPaused,
  onTogglePause,
  onPrevious,
  onNext,
  intervalSeconds,
  onIntervalChange,
  currentPage,
  totalPages,
  currentGroupName
}: KioskControlsProps) {
  const navigate = useNavigate()
  const [isVisible, setIsVisible] = useState(true)
  const [showIntervalMenu, setShowIntervalMenu] = useState(false)

  // Auto-hide timer
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout>
    
    const showControls = () => {
      setIsVisible(true)
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => {
        setIsVisible(false)
        setShowIntervalMenu(false)
      }, 3000)
    }
    
    // Show on mount
    showControls()
    
    // Show on mouse movement
    const handleMouseMove = () => showControls()
    const handleKeyDown = () => showControls()
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('keydown', handleKeyDown)
    
    return () => {
      clearTimeout(hideTimer)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault()
          onTogglePause()
          break
        case 'ArrowLeft':
          onPrevious()
          break
        case 'ArrowRight':
          onNext()
          break
        case 'Escape':
          navigate('/')
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onTogglePause, onPrevious, onNext, navigate])

  const handleExit = useCallback(() => {
    // Exit fullscreen if active
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
    navigate('/')
  }, [navigate])

  return (
    <div 
      className={cn(
        "fixed bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-300",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl">
        {/* Current Group Info */}
        <div className="flex items-center gap-2 pr-3 border-r border-white/20">
          <Monitor className="w-4 h-4 text-blue-400" />
          <div className="text-sm">
            <span className="text-white font-medium">{currentGroupName}</span>
            <span className="text-white/50 ml-2">
              {currentPage} / {totalPages}
            </span>
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center gap-1">
          {/* Previous */}
          <button
            onClick={onPrevious}
            disabled={totalPages <= 1}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white 
                       transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Anterior (←)"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={onTogglePause}
            className={cn(
              "p-3 rounded-full transition-colors",
              isPaused 
                ? "bg-blue-600 hover:bg-blue-700 text-white" 
                : "bg-white/10 hover:bg-white/20 text-white"
            )}
            title={isPaused ? "Reproducir (Space)" : "Pausar (Space)"}
          >
            {isPaused ? (
              <Play className="w-5 h-5" />
            ) : (
              <Pause className="w-5 h-5" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={onNext}
            disabled={totalPages <= 1}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white 
                       transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Siguiente (→)"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Interval Selector */}
        <div className="relative pl-3 border-l border-white/20">
          <button
            onClick={() => setShowIntervalMenu(!showIntervalMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 
                       text-white/70 hover:text-white transition-colors"
          >
            <Clock className="w-4 h-4" />
            <span className="text-sm">
              {INTERVAL_OPTIONS.find(o => o.value === intervalSeconds)?.label || `${intervalSeconds}s`}
            </span>
          </button>

          {/* Interval Dropdown */}
          {showIntervalMenu && (
            <div className="absolute bottom-full left-0 mb-2 py-1 rounded-lg bg-zinc-900 border border-white/10 shadow-xl">
              {INTERVAL_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    onIntervalChange(option.value)
                    setShowIntervalMenu(false)
                  }}
                  className={cn(
                    "w-full px-4 py-2 text-sm text-left hover:bg-white/10 transition-colors",
                    intervalSeconds === option.value 
                      ? "text-blue-400 bg-blue-500/10" 
                      : "text-white/70"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Exit Button */}
        <button
          onClick={handleExit}
          className="p-2 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 
                     transition-colors ml-2"
          title="Salir (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Keyboard Hints */}
      <div className="flex justify-center mt-2 text-[10px] text-white/30 gap-4">
        <span>Space: Pausa</span>
        <span>← →: Navegar</span>
        <span>F: Pantalla completa</span>
        <span>Esc: Salir</span>
      </div>
    </div>
  )
}
