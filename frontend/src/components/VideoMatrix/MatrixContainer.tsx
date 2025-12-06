import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { VideoSlot } from './VideoSlot'
import { LayoutSelector, type LayoutType, LAYOUT_OPTIONS } from './LayoutSelector'
import { CameraSelectorDialog } from './CameraSelectorDialog'
import { type Camera, type CameraStatus } from '@/lib/api'

const STORAGE_KEY = 'titan_user_view'

interface MatrixState {
  layout: LayoutType
  slotCameraIds: (number | null)[]
}

interface MatrixContainerProps {
  availableCameras: Camera[]
  camerasStatus: Record<number, CameraStatus>
  onEditCamera?: (camera: Camera) => void
  className?: string
}

// Get number of slots for each layout
function getSlotCount(layout: LayoutType): number {
  const option = LAYOUT_OPTIONS.find(o => o.id === layout)
  return option?.slots ?? 4
}

// Load state from localStorage
function loadState(): MatrixState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // Validate structure
      if (parsed.layout && Array.isArray(parsed.slotCameraIds)) {
        return parsed
      }
    }
  } catch (e) {
    console.warn('[Matrix] Failed to load saved state:', e)
  }
  // Default state
  return {
    layout: '2x2',
    slotCameraIds: [null, null, null, null]
  }
}

// Save state to localStorage
function saveState(state: MatrixState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('[Matrix] Failed to save state:', e)
  }
}

/**
 * MatrixContainer - Main video matrix component
 * 
 * Manages layout selection and camera slot assignments.
 * Persists configuration to localStorage.
 */
export function MatrixContainer({
  availableCameras,
  camerasStatus,
  onEditCamera,
  className
}: MatrixContainerProps) {
  // Load initial state from localStorage
  const [layout, setLayout] = useState<LayoutType>(() => loadState().layout)
  const [slotCameraIds, setSlotCameraIds] = useState<(number | null)[]>(() => loadState().slotCameraIds)
  
  // Selector dialog state
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null)

  // Persist state changes
  useEffect(() => {
    saveState({ layout, slotCameraIds })
  }, [layout, slotCameraIds])

  // Handle layout change - resize slots array
  const handleLayoutChange = useCallback((newLayout: LayoutType) => {
    setLayout(newLayout)
    
    const newSlotCount = getSlotCount(newLayout)
    setSlotCameraIds(prev => {
      if (prev.length === newSlotCount) return prev
      
      if (prev.length < newSlotCount) {
        // Expand: add null slots
        return [...prev, ...Array(newSlotCount - prev.length).fill(null)]
      } else {
        // Shrink: keep only first N slots
        return prev.slice(0, newSlotCount)
      }
    })
  }, [])

  // Open camera selector for a specific slot
  const handleSelectSlot = useCallback((slotIndex: number) => {
    setSelectedSlotIndex(slotIndex)
    setSelectorOpen(true)
  }, [])

  // Assign camera to slot
  const handleAssignCamera = useCallback((camera: Camera) => {
    if (selectedSlotIndex === null) return
    
    setSlotCameraIds(prev => {
      const newSlots = [...prev]
      newSlots[selectedSlotIndex] = camera.id
      return newSlots
    })
    setSelectorOpen(false)
    setSelectedSlotIndex(null)
  }, [selectedSlotIndex])

  // Remove camera from slot
  const handleRemoveFromSlot = useCallback((slotIndex: number) => {
    setSlotCameraIds(prev => {
      const newSlots = [...prev]
      newSlots[slotIndex] = null
      return newSlots
    })
  }, [])

  // Get camera object from ID
  const getCameraById = useCallback((id: number | null): Camera | null => {
    if (id === null) return null
    return availableCameras.find(c => c.id === id) ?? null
  }, [availableCameras])

  // Get list of currently assigned camera IDs (for selector to show which are in use)
  const assignedCameraIds = slotCameraIds.filter((id): id is number => id !== null)

  // Determine grid classes based on layout
  const getGridClasses = (): string => {
    switch (layout) {
      case '1x1':
        return 'grid-cols-1 max-w-4xl mx-auto'
      case '2x2':
        return 'grid-cols-2'
      case '3x3':
        return 'grid-cols-3'
      case 'focus':
        return 'grid-cols-3 grid-rows-2'
      default:
        return 'grid-cols-2'
    }
  }

  // Get slot-specific classes for focus layout
  const getSlotClasses = (index: number): string => {
    if (layout === 'focus' && index === 0) {
      return 'col-span-2 row-span-2'
    }
    return ''
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Layout Toolbar */}
      <div className="flex items-center justify-between">
        <LayoutSelector
          currentLayout={layout}
          onLayoutChange={handleLayoutChange}
        />
        
        <div className="text-xs text-zinc-500">
          {assignedCameraIds.length} / {slotCameraIds.length} slots asignados
        </div>
      </div>

      {/* Video Grid */}
      <div className={cn(
        "grid gap-3",
        getGridClasses()
      )}>
        {slotCameraIds.map((cameraId, index) => {
          const camera = getCameraById(cameraId)
          const status = cameraId ? camerasStatus[cameraId] : undefined
          
          return (
            <VideoSlot
              key={`slot-${index}`}
              camera={camera}
              connectionStatus={status?.connection_status}
              onSelect={() => handleSelectSlot(index)}
              onRemove={() => handleRemoveFromSlot(index)}
              onEditCamera={onEditCamera}
              className={getSlotClasses(index)}
            />
          )
        })}
      </div>

      {/* Camera Selector Dialog */}
      <CameraSelectorDialog
        isOpen={selectorOpen}
        onClose={() => {
          setSelectorOpen(false)
          setSelectedSlotIndex(null)
        }}
        cameras={availableCameras.filter(c => c.is_active)}
        assignedCameraIds={assignedCameraIds}
        onSelect={handleAssignCamera}
      />
    </div>
  )
}
