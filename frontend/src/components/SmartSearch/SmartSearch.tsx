import { useState, useCallback } from 'react'
import { Search, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SearchFilters } from './SearchFilters'
import { SearchResults } from './SearchResults'
import { 
  searchEvents, 
  type SearchFilters as SearchFiltersType,
  type SearchResponse 
} from '@/lib/api'

interface SmartSearchProps {
  onBack: () => void
}

export function SmartSearch({ onBack }: SmartSearchProps) {
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [currentFilters, setCurrentFilters] = useState<SearchFiltersType>({})
  const [currentPage, setCurrentPage] = useState(1)

  // Handle search
  const handleSearch = useCallback(async (filters: SearchFiltersType, page: number = 1) => {
    setIsSearching(true)
    setCurrentFilters(filters)
    setCurrentPage(page)
    
    try {
      const response = await searchEvents(filters, page, 48) // 48 = nice grid
      setResults(response)
    } catch (err) {
      console.error('Search failed:', err)
      setResults(null)
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    handleSearch(currentFilters, page)
  }, [currentFilters, handleSearch])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 sticky top-0 z-50 glass border-b border-border">
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
              <Search className="h-5 w-5 text-blue-500" />
              <span className="font-semibold text-foreground">
                Búsqueda Forense
              </span>
            </div>
          </div>
          
          {results && (
            <div className="text-sm text-muted-foreground">
              {results.total} eventos • Página {results.page}/{results.total_pages}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex p-4 gap-4">
        {/* Sidebar Filters */}
        <aside className="w-72 flex-shrink-0">
          <div className="sticky top-[72px]">
            <SearchFilters
              onSearch={(filters) => handleSearch(filters, 1)}
              isSearching={isSearching}
            />
          </div>
        </aside>

        {/* Results Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <SearchResults
            results={results}
            isLoading={isSearching}
            onPageChange={handlePageChange}
          />
        </div>
      </main>
    </div>
  )
}

// Re-export for convenience
export { SearchFilters } from './SearchFilters'
export { SearchResults } from './SearchResults'
