import { useState, useEffect, useRef } from 'react'
import { 
  Settings, 
  Loader2, 
  Save,
  Users,
  Palette,
  Trash2,
  Plus,
  Shield,
  Eye,
  UserCog,
  Upload,
  Image,
  X,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, type User } from '@/lib/api'

const MAX_LOGO_SIZE = 2 * 1024 * 1024 // 2MB

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

interface SystemSetting {
  key: string
  value: string | null
  value_json: any
  description: string | null
}

const ROLE_ICONS: Record<string, typeof Shield> = {
  admin: Shield,
  operator: UserCog,
  viewer: Eye,
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  operator: 'Operador',
  viewer: 'Visualizador',
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<'branding' | 'users'>('branding')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Branding state
  const [systemTitle, setSystemTitle] = useState('TitanNVR Enterprise')
  const [companyName, setCompanyName] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  
  // Alert state
  const [alert, setAlert] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  
  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: number, username: string } | null>(null)
  
  // Users state
  const [users, setUsers] = useState<User[]>([])
  const [showNewUser, setShowNewUser] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'viewer' })

  // Load settings and users
  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen])

  const loadData = async () => {
    setIsLoading(true)
    setAlert(null)
    try {
      // Load settings
      const settingsRes = await api.get<SystemSetting[]>('/settings/')
      const settings = settingsRes.data
      
      const titleSetting = settings.find((s: SystemSetting) => s.key === 'system_title')
      const companySetting = settings.find((s: SystemSetting) => s.key === 'company_name')
      const logoSetting = settings.find((s: SystemSetting) => s.key === 'logo_url')
      
      if (titleSetting?.value) setSystemTitle(titleSetting.value)
      if (companySetting?.value) setCompanyName(companySetting.value)
      if (logoSetting?.value) {
        setLogoUrl(logoSetting.value)
        setLogoPreview(logoSetting.value)
      }
      
      // Load users
      const usersRes = await api.get<User[]>('/auth/users')
      setUsers(usersRes.data)
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle logo file selection
  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Validate size
    if (file.size > MAX_LOGO_SIZE) {
      setAlert({ type: 'error', message: 'El archivo es demasiado grande. Máximo 2MB.' })
      return
    }
    
    // Validate type
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setAlert({ type: 'error', message: 'Solo se permiten archivos PNG y JPG.' })
      return
    }
    
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setAlert(null)
  }

  // Remove logo preview
  const handleRemoveLogo = async () => {
    if (logoUrl) {
      // Delete from server
      try {
        await api.delete('/settings/logo')
      } catch (err) {
        console.error('Failed to delete logo:', err)
      }
    }
    setLogoFile(null)
    setLogoPreview(null)
    setLogoUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const saveBranding = async () => {
    setIsSaving(true)
    setAlert(null)
    
    try {
      // Save text settings
      await api.put('/settings/system_title', { value: systemTitle })
      await api.put('/settings/company_name', { value: companyName })
      
      // Upload logo if new file selected
      if (logoFile) {
        const formData = new FormData()
        formData.append('file', logoFile)
        
        await api.post('/settings/logo', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }
      
      // Success!
      setAlert({ type: 'success', message: 'Los cambios se aplicaron exitosamente. La página se recargará para aplicar el nuevo branding.' })
      
      // Force reload after 2 seconds to apply new branding
      setTimeout(() => {
        window.location.reload()
      }, 2000)
      
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || 'Error al guardar los cambios'
      setAlert({ type: 'error', message: errorMsg })
    } finally {
      setIsSaving(false)
    }
  }

  const createUser = async () => {
    if (!newUser.username || !newUser.password) return
    
    setIsSaving(true)
    try {
      await api.post('/auth/users', newUser)
      setNewUser({ username: '', password: '', role: 'viewer' })
      setShowNewUser(false)
      loadData()
    } catch (err) {
      console.error('Failed to create user:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const deleteUser = async () => {
    if (!deleteConfirm) return
    
    try {
      await api.delete(`/auth/users/${deleteConfirm.userId}`)
      loadData()
      setDeleteConfirm(null)
    } catch (err) {
      console.error('Failed to delete user:', err)
      setAlert({ type: 'error', message: 'Error al eliminar usuario' })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] bg-zinc-900 border-zinc-800 p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Settings className="w-5 h-5" />
            Configuración del Sistema
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('branding')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'branding' 
                ? 'text-blue-400 border-b-2 border-blue-400' 
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Palette className="w-4 h-4" />
            Branding
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'users' 
                ? 'text-blue-400 border-b-2 border-blue-400' 
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Usuarios
          </button>
        </div>

        {/* Content */}
        <div className="p-4 min-h-[300px]">
          {/* Alert Banner */}
          {alert && (
            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
              alert.type === 'success' 
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
              {alert.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="text-sm">{alert.message}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-[200px]">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : activeTab === 'branding' ? (
            <div className="space-y-4">
              {/* Logo Upload */}
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Logo del Sistema</Label>
                <div className="flex items-center gap-4">
                  {/* Logo Preview */}
                  <div className="w-20 h-20 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
                    {logoPreview ? (
                      <img 
                        src={logoPreview} 
                        alt="Logo preview" 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Image className="w-8 h-8 text-zinc-600" />
                    )}
                  </div>
                  
                  {/* Upload Controls */}
                  <div className="flex-1 space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleLogoSelect}
                      className="hidden"
                      id="logo-upload"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="border-zinc-700 text-zinc-300"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Subir Logo
                      </Button>
                      {logoPreview && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleRemoveLogo}
                          className="text-red-400 hover:text-red-300"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Quitar
                        </Button>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      PNG o JPG, máximo 2MB
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Nombre del Sistema</Label>
                <Input
                  value={systemTitle}
                  onChange={(e) => setSystemTitle(e.target.value)}
                  placeholder="TitanNVR Enterprise"
                  className="bg-zinc-800 border-zinc-700"
                />
                <p className="text-[10px] text-zinc-500">
                  Se muestra en el header y la página de login
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Nombre de la Empresa</Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Tu Empresa S.A."
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              <Button 
                onClick={saveBranding}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700 w-full"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Guardar Cambios
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* User List */}
              <div className="space-y-2">
                {users.map((user) => {
                  const RoleIcon = ROLE_ICONS[user.role] || Eye
                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-700"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          user.role === 'admin' ? 'bg-red-500/10 text-red-400' :
                          user.role === 'operator' ? 'bg-yellow-500/10 text-yellow-400' :
                          'bg-zinc-500/10 text-zinc-400'
                        }`}>
                          <RoleIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{user.username}</p>
                          <p className="text-[10px] text-zinc-500">{ROLE_LABELS[user.role]}</p>
                        </div>
                      </div>
                      {user.username !== 'admin' && (
                        <button
                          onClick={() => setDeleteConfirm({ userId: user.id, username: user.username })}
                          className="p-2 rounded-full hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* New User Form */}
              {showNewUser ? (
                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="Usuario"
                      value={newUser.username}
                      onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                      className="bg-zinc-900 border-zinc-600"
                    />
                    <Input
                      type="password"
                      placeholder="Contraseña"
                      value={newUser.password}
                      onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                      className="bg-zinc-900 border-zinc-600"
                    />
                  </div>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full p-2 rounded-md bg-zinc-900 border border-zinc-600 text-sm text-zinc-200"
                  >
                    <option value="viewer">Visualizador</option>
                    <option value="operator">Operador</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <div className="flex gap-2">
                    <Button 
                      onClick={createUser}
                      disabled={isSaving}
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      Crear
                    </Button>
                    <Button 
                      onClick={() => setShowNewUser(false)}
                      variant="ghost"
                      size="sm"
                      className="text-zinc-400"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => setShowNewUser(true)}
                  variant="outline"
                  className="w-full border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-200"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar Usuario
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDeleteConfirm(null)}
          />
          
          {/* Modal */}
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-red-500/10">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
            </div>
            
            {/* Content */}
            <h3 className="text-lg font-semibold text-zinc-100 text-center mb-2">
              Eliminar Usuario
            </h3>
            <p className="text-sm text-zinc-400 text-center mb-6">
              ¿Estás seguro de eliminar al usuario <span className="font-medium text-zinc-200">"{deleteConfirm.username}"</span>? Esta acción no se puede deshacer.
            </p>
            
            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 text-zinc-400 hover:text-zinc-200"
              >
                Cancelar
              </Button>
              <Button
                onClick={deleteUser}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
