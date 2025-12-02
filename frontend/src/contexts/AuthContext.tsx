import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { 
  User, 
  PublicSettings, 
  login as apiLogin, 
  logout as apiLogout, 
  getStoredUser, 
  isAuthenticated,
  getPublicSettings,
  getCurrentUser
} from '@/lib/api'

interface AuthContextType {
  user: User | null
  settings: PublicSettings | null
  isLoading: boolean
  isLoggedIn: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load settings and user on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Load public settings (no auth required)
        const publicSettings = await getPublicSettings()
        setSettings(publicSettings)
        
        // Update document title
        document.title = publicSettings.system_title
        
        // Update favicon if custom logo exists
        if (publicSettings.logo_url) {
          const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link')
          link.type = 'image/png'
          link.rel = 'icon'
          link.href = publicSettings.logo_url
          document.head.appendChild(link)
        }
        
        // Check if user is authenticated
        if (isAuthenticated()) {
          const storedUser = getStoredUser()
          if (storedUser) {
            setUser(storedUser)
            // Verify token is still valid
            try {
              const currentUser = await getCurrentUser()
              setUser(currentUser)
            } catch {
              // Token expired, clear auth
              apiLogout()
              setUser(null)
            }
          }
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
        // Use defaults
        setSettings({
          system_title: 'TitanNVR Enterprise',
          theme_color: '#3B82F6',
          logo_url: null,
          company_name: 'Your Company'
        })
      } finally {
        setIsLoading(false)
      }
    }
    
    init()
  }, [])

  const login = async (username: string, password: string) => {
    const response = await apiLogin(username, password)
    setUser(response.user)
  }

  const logout = () => {
    apiLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        settings, 
        isLoading, 
        isLoggedIn: !!user,
        login, 
        logout 
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
