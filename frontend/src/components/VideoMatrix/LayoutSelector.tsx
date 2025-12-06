import { cn } from '@/lib/utils'
import { 
  Square, 
  Grid2X2, 
  Grid3X3, 
  LayoutDashboard,
  Monitor
} from 'lucide-react'

export type LayoutType = '1x1' | '2x2' | '3x3' | 'focus'

interface LayoutOption {
  id: LayoutType
  label: string
  icon: typeof Square
  slots: number
  description: string
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  { 
    id: '1x1', 
    label: '1', 
    icon: Square, 
    slots: 1,
    description: 'Vista única'
  },
  { 
    id: '2x2', 
    label: '4', 
    icon: Grid2X2, 
    slots: 4,
    description: 'Cuadrícula 2×2'
  },
  { 
    id: '3x3', 
    label: '9', 
    icon: Grid3X3, 
    slots: 9,
    description: 'Cuadrícula 3×3'
  },
  { 
    id: 'focus', 
    label: 'Focus', 
    icon: LayoutDashboard, 
    slots: 6,
    description: '1 principal + 5'
  },
]

interface LayoutSelectorProps {
  currentLayout: LayoutType
  onLayoutChange: (layout: LayoutType) => void
  className?: string
}

/**
 * LayoutSelector - Toolbar to select the video matrix layout
 */
export function LayoutSelector({
  currentLayout,
  onLayoutChange,
  className
}: LayoutSelectorProps) {
  return (
    <div className={cn(
      "flex items-center gap-1 p-1 rounded-lg bg-zinc-800/50 border border-zinc-700",
      className
    )}>
      {/* Title */}
      <div className="flex items-center gap-2 px-3 text-zinc-400">
        <Monitor className="w-4 h-4" />
        <span className="text-xs font-medium hidden sm:inline">Layout</span>
      </div>
      
      {/* Divider */}
      <div className="w-px h-6 bg-zinc-700" />
      
      {/* Layout Buttons */}
      <div className="flex items-center gap-1">
        {LAYOUT_OPTIONS.map((option) => {
          const Icon = option.icon
          const isActive = currentLayout === option.id
          
          return (
            <button
              key={option.id}
              onClick={() => onLayoutChange(option.id)}
              title={option.description}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                isActive 
                  ? "bg-blue-600 text-white shadow-lg" 
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { LAYOUT_OPTIONS }
