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
  AlertCircle,
  FileText,
  Activity,
  Edit2,
  Lock,
  HardDrive,
  Key
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
import { 
  api, 
  type User,
  type UserUpdate,
  updateUser as updateUserApi
} from '@/lib/api'
import { AuditPanel } from '@/components/AuditPanel'
import { SystemStatusPanel } from '@/components/SystemStatusPanel'
import { StorageManager } from '@/components/StorageManager'
import { UserPermissionsDialog } from '@/components/UserPermissionsDialog'
import { useAuth } from '@/contexts/AuthContext'

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
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [activeTab, setActiveTab] = useState<'branding' | 'users' | 'audit' | 'system' | 'storage'>('branding')
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
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editUserData, setEditUserData] = useState<{ role: string; email: string; password: string; is_active: boolean }>({ 
    role: 'viewer', 
    email: '', 
    password: '', 
    is_active: true 
  })
  const [permissionsUser, setPermissionsUser] = useState<User | null>(null)

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

  // Open edit modal for a user
  const openEditUser = (userToEdit: User) => {
    setEditingUser(userToEdit)
    setEditUserData({
      role: userToEdit.role,
      email: userToEdit.email || '',
      password: '',
      is_active: userToEdit.is_active
    })
  }

  // Update user
  const handleUpdateUser = async () => {
    if (!editingUser) return
    
    setIsSaving(true)
    try {
      const updateData: UserUpdate = {
        role: editUserData.role as 'admin' | 'operator' | 'viewer',
        email: editUserData.email || null,
        is_active: editUserData.is_active
      }
      
      // Only include password if provided
      if (editUserData.password.trim()) {
        updateData.password = editUserData.password
      }
      
      await updateUserApi(editingUser.id, updateData)
      
      setAlert({ 
        type: 'success', 
        message: editUserData.password.trim() 
          ? `Usuario "${editingUser.username}" actualizado con nueva contraseña`
          : `Usuario "${editingUser.username}" actualizado`
      })
      
      setEditingUser(null)
      setEditUserData({ role: 'viewer', email: '', password: '', is_active: true })
      loadData()
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Error al actualizar usuario'
      setAlert({ type: 'error', message })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border p-0 sm:max-w-4xl w-[95vw]">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Settings className="w-5 h-5" />
            Configuración del Sistema
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('branding')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'branding' 
                ? 'text-primary border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Palette className="w-4 h-4" />
            Branding
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'users' 
                ? 'text-primary border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="w-4 h-4" />
            Usuarios
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('audit')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'audit' 
                    ? 'text-primary border-b-2 border-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="w-4 h-4" />
                Auditoría
              </button>
              <button
                onClick={() => setActiveTab('storage')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'storage' 
                    ? 'text-primary border-b-2 border-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <HardDrive className="w-4 h-4" />
                Almacenamiento
              </button>
            </>
          )}
          <button
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'system' 
                ? 'text-primary border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Activity className="w-4 h-4" />
            Sistema
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
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === 'branding' ? (
            <div className="space-y-4">
              {/* Logo Upload */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Logo del Sistema</Label>
                <div className="flex items-center gap-4">
                  {/* Logo Preview */}
                  <div className="w-20 h-20 rounded-lg bg-secondary border border-border flex items-center justify-center overflow-hidden">
                    {logoPreview ? (
                      <img 
                        src={logoPreview} 
                        alt="Logo preview" 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Image className="w-8 h-8 text-muted-foreground" />
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
                    <p className="text-[10px] text-muted-foreground">
                      PNG o JPG, máximo 2MB
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Nombre del Sistema</Label>
                <Input
                  value={systemTitle}
                  onChange={(e) => setSystemTitle(e.target.value)}
                  placeholder="TitanNVR Enterprise"
                  className="bg-secondary border-border"
                />
                <p className="text-[10px] text-muted-foreground">
                  Se muestra en el header y la página de login
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Nombre de la Empresa</Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Tu Empresa S.A."
                  className="bg-secondary border-border"
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
          ) : activeTab === 'users' ? (
            <div className="space-y-4">
              {/* User List */}
              <div className="space-y-2">
                {users.map((user) => {
                  const RoleIcon = ROLE_ICONS[user.role] || Eye
                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          user.role === 'admin' ? 'bg-red-500/10 text-red-400' :
                          user.role === 'operator' ? 'bg-yellow-500/10 text-yellow-400' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          <RoleIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{user.username}</p>
                          <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[user.role]}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Permissions button - for non-admin users */}
                        {user.role !== 'admin' && (
                          <button
                            onClick={() => setPermissionsUser(user)}
                            className="p-2 rounded-full hover:bg-amber-500/10 text-muted-foreground hover:text-amber-400 transition-colors"
                            title="Permisos de cámaras"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                        )}
                        {/* Edit button - always visible */}
                        <button
                          onClick={() => openEditUser(user)}
                          className="p-2 rounded-full hover:bg-blue-500/10 text-muted-foreground hover:text-blue-400 transition-colors"
                          title="Editar usuario"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {/* Delete button - not for admin user */}
                        {user.username !== 'admin' && (
                          <button
                            onClick={() => setDeleteConfirm({ userId: user.id, username: user.username })}
                            className="p-2 rounded-full hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* New User Form */}
              {showNewUser ? (
                <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="Usuario"
                      value={newUser.username}
                      onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                      className="bg-secondary border-border"
                    />
                    <Input
                      type="password"
                      placeholder="Contraseña"
                      value={newUser.password}
                      onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                      className="bg-secondary border-border"
                    />
                  </div>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full p-2 rounded-md bg-secondary border border-border text-sm text-foreground"
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
                      className="text-muted-foreground"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => setShowNewUser(true)}
                  variant="outline"
                  className="w-full border-dashed"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar Usuario
                </Button>
              )}
            </div>
          ) : activeTab === 'audit' ? (
            /* Audit Tab */
            <AuditPanel isAdmin={isAdmin} />
          ) : activeTab === 'storage' ? (
            /* Storage Tab */
            <StorageManager />
          ) : (
            /* System Tab */
            <SystemStatusPanel isAdmin={isAdmin} />
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
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-red-500/10">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
            </div>
            
            {/* Content */}
            <h3 className="text-lg font-semibold text-foreground text-center mb-2">
              Eliminar Usuario
            </h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              ¿Estás seguro de eliminar al usuario <span className="font-medium text-foreground">"{deleteConfirm.username}"</span>? Esta acción no se puede deshacer.
            </p>
            
            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1"
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

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setEditingUser(null)}
          />
          
          {/* Modal */}
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Edit2 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Editar Usuario
                </h3>
                <p className="text-xs text-muted-foreground">
                  {editingUser.username}
                </p>
              </div>
            </div>
            
            {/* Form */}
            <div className="space-y-4">
              {/* Role */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Rol</Label>
                <select
                  value={editUserData.role}
                  onChange={(e) => setEditUserData(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full p-2.5 rounded-md bg-secondary border border-border text-sm text-foreground"
                  disabled={editingUser.username === 'admin'}
                >
                  <option value="viewer">Visualizador</option>
                  <option value="operator">Operador</option>
                  <option value="admin">Administrador</option>
                </select>
                {editingUser.username === 'admin' && (
                  <p className="text-[10px] text-amber-400">El usuario admin no puede cambiar de rol</p>
                )}
              </div>
              
              {/* Email */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email (opcional)</Label>
                <Input
                  type="email"
                  placeholder="usuario@empresa.com"
                  value={editUserData.email}
                  onChange={(e) => setEditUserData(prev => ({ ...prev, email: e.target.value }))}
                  className="bg-secondary border-border"
                />
              </div>
              
              {/* Active Status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Usuario Activo</span>
                </div>
                <button
                  onClick={() => setEditUserData(prev => ({ ...prev, is_active: !prev.is_active }))}
                  disabled={editingUser.username === 'admin'}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    editUserData.is_active ? 'bg-emerald-500' : 'bg-muted'
                  } ${editingUser.username === 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    editUserData.is_active ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              
              {/* Password Reset Section */}
              <div className="pt-3 border-t border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <Label className="text-xs text-amber-400 font-medium">Restablecer Contraseña</Label>
                </div>
                <Input
                  type="password"
                  placeholder="Dejar en blanco para no cambiar"
                  value={editUserData.password}
                  onChange={(e) => setEditUserData(prev => ({ ...prev, password: e.target.value }))}
                  className="bg-secondary border-border"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Si escribes una nueva contraseña, el usuario deberá usarla inmediatamente
                </p>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                onClick={() => setEditingUser(null)}
                className="flex-1"
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpdateUser}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isSaving}
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
          </div>
        </div>
      )}

      {/* User Permissions Dialog */}
      <UserPermissionsDialog
        user={permissionsUser}
        isOpen={!!permissionsUser}
        onClose={() => setPermissionsUser(null)}
        onSuccess={() => {
          // Optionally reload users or show notification
        }}
      />
    </Dialog>
  )
}
