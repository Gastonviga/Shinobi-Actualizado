/**
 * KioskLayout - Full screen container for Video Wall mode
 * 
 * No navbar, no footer. Pure black background for monitoring displays.
 * Handles Fullscreen API for true kiosk experience.
 */
import { useState, useEffect, useCallback, ReactNode } from 'react'
import { Maximize, Minimize } from 'lucide-react'

interface KioskLayoutProps {
  children: ReactNode
}

export function KioskLayout({ children }: KioskLayoutProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Check fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Toggle fullscreen
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.error('Fullscreen error:', err)
    }
  }, [])

  // Keyboard shortcut for fullscreen (F11 or F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleFullscreen])

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Main Content */}
      {children}

      {/* Fullscreen Toggle Button - Bottom Right Corner */}
      <button
        onClick={toggleFullscreen}
        className="fixed bottom-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 
                   text-white/70 hover:text-white transition-all z-50 backdrop-blur-sm"
        title={isFullscreen ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'}
      >
        {isFullscreen ? (
          <Minimize className="w-5 h-5" />
        ) : (
          <Maximize className="w-5 h-5" />
        )}
      </button>
    </div>
  )
}
