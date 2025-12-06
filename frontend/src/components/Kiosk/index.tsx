/**
 * Kiosk Mode - Video Wall for monitoring displays
 * 
 * Full-screen, no-interaction mode that rotates through camera groups.
 * Designed for large monitors in security operations centers.
 */
import { useState, useCallback } from 'react'
import { KioskLayout } from './KioskLayout'
import { KioskRotator } from './KioskRotator'
import { KioskControls } from './KioskControls'

export function KioskPage() {
  const [isPaused, setIsPaused] = useState(false)
  const [intervalSeconds, setIntervalSeconds] = useState(30)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [currentGroupName, setCurrentGroupName] = useState('')
  const [manualPageIndex, setManualPageIndex] = useState<number | null>(null)

  const handlePageChange = useCallback((current: number, total: number, groupName: string) => {
    setCurrentPage(current)
    setTotalPages(total)
    setCurrentGroupName(groupName)
    setManualPageIndex(null) // Reset manual navigation
  }, [])

  const handlePrevious = useCallback(() => {
    const newIndex = currentPage <= 1 ? totalPages - 1 : currentPage - 2
    setManualPageIndex(newIndex)
  }, [currentPage, totalPages])

  const handleNext = useCallback(() => {
    const newIndex = currentPage >= totalPages ? 0 : currentPage
    setManualPageIndex(newIndex)
  }, [currentPage, totalPages])

  return (
    <KioskLayout>
      <KioskRotator
        intervalSeconds={intervalSeconds}
        isPaused={isPaused}
        onPageChange={handlePageChange}
        manualPageIndex={manualPageIndex}
      />
      
      <KioskControls
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(p => !p)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        intervalSeconds={intervalSeconds}
        onIntervalChange={setIntervalSeconds}
        currentPage={currentPage}
        totalPages={totalPages}
        currentGroupName={currentGroupName}
      />
    </KioskLayout>
  )
}

// Re-export components for external use
export { KioskLayout } from './KioskLayout'
export { KioskRotator } from './KioskRotator'
export { KioskControls } from './KioskControls'
