import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  status: 'connected' | 'disconnected' | 'recording' | 'error'
  label?: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const statusConfig = {
    connected: {
      color: 'bg-green-500',
      text: label || 'Conectado',
    },
    disconnected: {
      color: 'bg-gray-500',
      text: label || 'Desconectado',
    },
    recording: {
      color: 'bg-red-500 animate-pulse',
      text: label || 'Grabando',
    },
    error: {
      color: 'bg-yellow-500',
      text: label || 'Error',
    },
  }

  const config = statusConfig[status]

  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={cn("h-2 w-2 rounded-full", config.color)} />
      {config.text}
    </span>
  )
}
