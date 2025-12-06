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
  Mail,
  Cloud,
  ExternalLink,
  Unlink,
  KeyRound,
  Send,
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
  updateUser as updateUserApi,
  testSmtpConnection,
  saveSmtpConfig,
  getSmtpConfig,
  getDriveStatus,
  getOAuthStatus,
  saveOAuthCredentials,
  deleteOAuthCredentials,
  startDriveAuth,
  verifyDriveAuth,
  testDriveUpload,
  disconnectDrive,
  type SmtpConfig,
  type DriveStatus,
  type OAuthStatus
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
  const [activeTab, setActiveTab] = useState<'branding' | 'users' | 'notifications' | 'cloud' | 'audit' | 'system' | 'storage'>('branding')
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
  
  // Notifications (SMTP) state
  const [smtpEmail, setSmtpEmail] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpConfigured, setSmtpConfigured] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  
  // Cloud (Drive) state
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null)
  const [driveAuthUrl, setDriveAuthUrl] = useState<string | null>(null)
  const [driveAuthCode, setDriveAuthCode] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isTestingUpload, setIsTestingUpload] = useState(false)
  const [driveTestResult, setDriveTestResult] = useState<{ success: boolean; message: string } | null>(null)
  
  // OAuth credentials state
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthClientSecret, setOauthClientSecret] = useState('')
  const [isSavingOAuth, setIsSavingOAuth] = useState(false)

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
      
      // Load SMTP config
      try {
        const smtpConfig = await getSmtpConfig()
        if (smtpConfig && smtpConfig.enabled) {
          setSmtpEmail(smtpConfig.username || '')
          setSmtpConfigured(true)
        }
      } catch {
        // SMTP not configured yet
      }
      
      // Load Drive status
      try {
        const status = await getDriveStatus()
        setDriveStatus(status)
      } catch {
        // Drive not configured yet
      }
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

  // ============================================================
  // Notifications (SMTP) Handlers
  // ============================================================
  
  const handleTestEmail = async () => {
    if (!smtpEmail || !smtpPassword) {
      setTestResult({ success: false, message: 'Completa el email y contraseña' })
      return
    }
    
    setIsTesting(true)
    setTestResult(null)
    
    try {
      const result = await testSmtpConnection({
        provider: 'gmail',
        email: smtpEmail,
        password: smtpPassword
      })
      setTestResult({ success: result.success, message: result.message })
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Error al enviar email de prueba'
      setTestResult({ success: false, message })
    } finally {
      setIsTesting(false)
    }
  }
  
  const handleSaveSmtp = async () => {
    if (!smtpEmail || !smtpPassword) {
      setAlert({ type: 'error', message: 'Completa el email y contraseña' })
      return
    }
    
    setIsSaving(true)
    try {
      await saveSmtpConfig({
        provider: 'gmail',
        email: smtpEmail,
        password: smtpPassword
      })
      setSmtpConfigured(true)
      setAlert({ type: 'success', message: 'Configuración de notificaciones guardada' })
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Error al guardar configuración'
      setAlert({ type: 'error', message })
    } finally {
      setIsSaving(false)
    }
  }

  // ============================================================
  // Cloud (Drive) Handlers
  // ============================================================
  
  const handleStartDriveAuth = async () => {
    setIsConnecting(true)
    setDriveTestResult(null)
    
    try {
      const result = await startDriveAuth()
      setDriveAuthUrl(result.auth_url)
      // Open auth URL in new window
      window.open(result.auth_url, '_blank', 'width=600,height=700')
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Error al iniciar autorización'
      setDriveTestResult({ success: false, message })
    } finally {
      setIsConnecting(false)
    }
  }
  
  const handleVerifyDriveCode = async () => {
    if (!driveAuthCode) {
      setDriveTestResult({ success: false, message: 'Ingresa el código de autorización' })
      return
    }
    
    setIsConnecting(true)
    setDriveTestResult(null)
    
    try {
      await verifyDriveAuth(driveAuthCode)
      const status = await getDriveStatus()
      setDriveStatus(status)
      setDriveAuthUrl(null)
      setDriveAuthCode('')
      setDriveTestResult({ success: true, message: 'Google Drive conectado exitosamente' })
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Código inválido o expirado'
      setDriveTestResult({ success: false, message })
    } finally {
      setIsConnecting(false)
    }
  }
  
  const handleTestDriveUpload = async () => {
    setIsTestingUpload(true)
    setDriveTestResult(null)
    
    try {
      const result = await testDriveUpload()
      setDriveTestResult({ success: result.success, message: result.message })
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Error al subir archivo de prueba'
      setDriveTestResult({ success: false, message })
    } finally {
      setIsTestingUpload(false)
    }
  }
  
  const handleDisconnectDrive = async () => {
    setIsConnecting(true)
    try {
      await disconnectDrive()
      setDriveStatus(null)
      setDriveTestResult({ success: true, message: 'Google Drive desvinculado' })
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Error al desvincular'
      setDriveTestResult({ success: false, message })
    } finally {
      setIsConnecting(false)
    }
  }
  
  const handleSaveOAuthCredentials = async () => {
    if (!oauthClientId || !oauthClientSecret) {
      setDriveTestResult({ success: false, message: 'Completa Client ID y Client Secret' })
      return
    }
    
    setIsSavingOAuth(true)
    setDriveTestResult(null)
    
    try {
      await saveOAuthCredentials({ client_id: oauthClientId, client_secret: oauthClientSecret })
      // Reload status to update oauth_configured
      const status = await getDriveStatus()
      setDriveStatus(status)
      setDriveTestResult({ success: true, message: 'Credenciales OAuth guardadas' })
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Error al guardar credenciales'
      setDriveTestResult({ success: false, message })
    } finally {
      setIsSavingOAuth(false)
    }
  }

  const handleResetOAuth = async () => {
    setIsConnecting(true)
    try {
      await deleteOAuthCredentials()
      // Reset all Drive-related state
      setDriveStatus(null)
      setDriveAuthUrl(null)
      setDriveAuthCode('')
      setOauthClientId('')
      setOauthClientSecret('')
      setDriveTestResult({ success: true, message: 'Credenciales eliminadas. Puedes configurar nuevas.' })
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Error al eliminar credenciales'
      setDriveTestResult({ success: false, message })
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 p-0 sm:max-w-4xl w-[95vw]">
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
          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'notifications' 
                    ? 'text-blue-400 border-b-2 border-blue-400' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Mail className="w-4 h-4" />
                Email
              </button>
              <button
                onClick={() => setActiveTab('cloud')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'cloud' 
                    ? 'text-blue-400 border-b-2 border-blue-400' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Cloud className="w-4 h-4" />
                Nube
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'audit' 
                    ? 'text-blue-400 border-b-2 border-blue-400' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileText className="w-4 h-4" />
                Auditoría
              </button>
              <button
                onClick={() => setActiveTab('storage')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'storage' 
                    ? 'text-blue-400 border-b-2 border-blue-400' 
                    : 'text-zinc-400 hover:text-zinc-200'
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
                ? 'text-blue-400 border-b-2 border-blue-400' 
                : 'text-zinc-400 hover:text-zinc-200'
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
          ) : activeTab === 'users' ? (
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
                      <div className="flex items-center gap-1">
                        {/* Permissions button - for non-admin users */}
                        {user.role !== 'admin' && (
                          <button
                            onClick={() => setPermissionsUser(user)}
                            className="p-2 rounded-full hover:bg-amber-500/10 text-zinc-500 hover:text-amber-400 transition-colors"
                            title="Permisos de cámaras"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                        )}
                        {/* Edit button - always visible */}
                        <button
                          onClick={() => openEditUser(user)}
                          className="p-2 rounded-full hover:bg-blue-500/10 text-zinc-500 hover:text-blue-400 transition-colors"
                          title="Editar usuario"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {/* Delete button - not for admin user */}
                        {user.username !== 'admin' && (
                          <button
                            onClick={() => setDeleteConfirm({ userId: user.id, username: user.username })}
                            className="p-2 rounded-full hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
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
          ) : activeTab === 'notifications' ? (
            /* Notifications (Gmail) Tab */
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-red-500/20">
                    <Mail className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-zinc-100">Notificaciones Gmail</h3>
                    <p className="text-xs text-zinc-400">Recibe alertas por email cuando se detecte movimiento</p>
                  </div>
                </div>
                
                {smtpConfigured && (
                  <div className="flex items-center gap-2 text-emerald-400 text-sm mb-3">
                    <CheckCircle className="w-4 h-4" />
                    <span>Configurado: {smtpEmail}</span>
                  </div>
                )}
              </div>
              
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Tu correo de Gmail</Label>
                  <Input
                    type="email"
                    placeholder="tu-email@gmail.com"
                    value={smtpEmail}
                    onChange={(e) => setSmtpEmail(e.target.value)}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400 flex items-center gap-2">
                    <KeyRound className="w-3 h-3" />
                    Contraseña de Aplicación
                  </Label>
                  <Input
                    type="password"
                    placeholder="xxxx xxxx xxxx xxxx"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 font-mono"
                  />
                  <p className="text-[10px] text-zinc-500">
                    <a 
                      href="https://myaccount.google.com/apppasswords" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      Genera una contraseña de aplicación
                    </a>
                    {' '}en tu cuenta de Google (no uses tu contraseña normal)
                  </p>
                </div>
              </div>
              
              {/* Test Result */}
              {testResult && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                  testResult.success 
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                }`}>
                  {testResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span className="text-sm">{testResult.message}</span>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleTestEmail}
                  disabled={isTesting || !smtpEmail || !smtpPassword}
                  className="flex-1 border-zinc-700"
                >
                  {isTesting ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</>
                  ) : (
                    <><Send className="w-4 h-4 mr-2" />Enviar Email de Prueba</>
                  )}
                </Button>
                <Button
                  onClick={handleSaveSmtp}
                  disabled={isSaving || !smtpEmail || !smtpPassword}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" />Guardar</>}
                </Button>
              </div>
            </div>
          ) : activeTab === 'cloud' ? (
            /* Cloud (Google Drive) Tab */
            <div className="space-y-4">
              {driveStatus?.connected ? (
                /* Connected State */
                <>
                  <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-green-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/20">
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-zinc-100">Conectado a Google Drive</h3>
                        {driveStatus.email && (
                          <p className="text-xs text-zinc-400">{driveStatus.email}</p>
                        )}
                        <p className="text-xs text-emerald-400">Carpeta: {driveStatus.folder}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Drive Test Result */}
                  {driveTestResult && (
                    <div className={`p-3 rounded-lg flex items-center gap-2 ${
                      driveTestResult.success 
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                        : 'bg-red-500/10 border border-red-500/30 text-red-400'
                    }`}>
                      {driveTestResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                      <span className="text-sm">{driveTestResult.message}</span>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleTestDriveUpload}
                      disabled={isTestingUpload}
                      className="flex-1 border-zinc-700"
                    >
                      {isTestingUpload ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" />Subiendo...</>
                      ) : (
                        <><Cloud className="w-4 h-4 mr-2" />Subir Archivo de Prueba</>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleDisconnectDrive}
                      disabled={isConnecting}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Unlink className="w-4 h-4 mr-2" />
                      Desvincular
                    </Button>
                  </div>
                </>
              ) : !driveStatus?.oauth_configured ? (
                /* Step 0: Configure OAuth Credentials */
                <>
                  <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-blue-500/20">
                        <Cloud className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-zinc-100">Google Drive</h3>
                        <p className="text-xs text-zinc-400">Respalda grabaciones automáticamente en la nube</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <h4 className="font-medium text-yellow-400 mb-2">⚙️ Paso 1: Configurar Credenciales OAuth</h4>
                    <p className="text-xs text-zinc-400 mb-3">
                      Necesitas crear credenciales OAuth en Google Cloud Console:
                    </p>
                    <ol className="text-xs text-zinc-400 space-y-1 mb-3 list-decimal ml-4">
                      <li>Ve a <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Cloud Console</a></li>
                      <li>Crea un proyecto nuevo o selecciona uno existente</li>
                      <li>Habilita la "Google Drive API"</li>
                      <li>Ve a "Credenciales" → "Crear credenciales" → "ID de cliente OAuth"</li>
                      <li>Tipo: "App de escritorio"</li>
                      <li>Copia el Client ID y Client Secret aquí abajo</li>
                    </ol>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-zinc-400">Client ID</Label>
                      <Input
                        placeholder="xxxxx.apps.googleusercontent.com"
                        value={oauthClientId}
                        onChange={(e) => setOauthClientId(e.target.value)}
                        className="bg-zinc-800 border-zinc-700 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-zinc-400">Client Secret</Label>
                      <Input
                        type="password"
                        placeholder="GOCSPX-xxxxxxxxxxxx"
                        value={oauthClientSecret}
                        onChange={(e) => setOauthClientSecret(e.target.value)}
                        className="bg-zinc-800 border-zinc-700 font-mono text-xs"
                      />
                    </div>
                    
                    <Button
                      onClick={handleSaveOAuthCredentials}
                      disabled={isSavingOAuth || !oauthClientId || !oauthClientSecret}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      {isSavingOAuth ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" />Guardando...</>
                      ) : (
                        <><Save className="w-4 h-4 mr-2" />Guardar Credenciales</>
                      )}
                    </Button>
                  </div>
                  
                  {driveTestResult && (
                    <div className={`p-3 rounded-lg flex items-center gap-2 ${
                      driveTestResult.success 
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                        : 'bg-red-500/10 border border-red-500/30 text-red-400'
                    }`}>
                      {driveTestResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                      <span className="text-sm">{driveTestResult.message}</span>
                    </div>
                  )}
                </>
              ) : (
                /* OAuth Configured - Now authorize */
                <>
                  <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/20">
                          <Cloud className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                          <h3 className="font-medium text-zinc-100">Google Drive</h3>
                          <p className="text-xs text-emerald-400">✓ Credenciales OAuth configuradas</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleResetOAuth}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Resetear
                      </Button>
                    </div>
                  </div>
                  
                  {!driveAuthUrl ? (
                    /* Step 2: Start Auth */
                    <div className="text-center py-4">
                      <p className="text-sm text-zinc-400 mb-4">
                        Ahora autoriza tu cuenta de Google Drive
                      </p>
                      <Button
                        onClick={handleStartDriveAuth}
                        disabled={isConnecting}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {isConnecting ? (
                          <><Loader2 className="w-4 h-4 animate-spin mr-2" />Abriendo...</>
                        ) : (
                          <><ExternalLink className="w-4 h-4 mr-2" />Autorizar con Google</>
                        )}
                      </Button>
                    </div>
                  ) : (
                    /* Step 3: Enter Code */
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
                        <p>1. Autoriza en la ventana de Google que se abrió</p>
                        <p>2. Copia el código de autorización</p>
                        <p>3. Pégalo aquí abajo</p>
                      </div>
                      
                      <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">Código de Autorización</Label>
                        <Input
                          placeholder="Pega el código de Google aquí"
                          value={driveAuthCode}
                          onChange={(e) => setDriveAuthCode(e.target.value)}
                          className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                        />
                      </div>
                      
                      <Button
                        onClick={handleVerifyDriveCode}
                        disabled={isConnecting || !driveAuthCode}
                        className="w-full bg-emerald-600 hover:bg-emerald-700"
                      >
                        {isConnecting ? (
                          <><Loader2 className="w-4 h-4 animate-spin mr-2" />Verificando...</>
                        ) : (
                          <><CheckCircle className="w-4 h-4 mr-2" />Verificar y Conectar</>
                        )}
                      </Button>
                    </div>
                  )}
                  
                  {/* Drive Test Result (errors) */}
                  {driveTestResult && !driveTestResult.success && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm">{driveTestResult.message}</span>
                    </div>
                  )}
                </>
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

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setEditingUser(null)}
          />
          
          {/* Modal */}
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Edit2 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">
                  Editar Usuario
                </h3>
                <p className="text-xs text-zinc-400">
                  {editingUser.username}
                </p>
              </div>
            </div>
            
            {/* Form */}
            <div className="space-y-4">
              {/* Role */}
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Rol</Label>
                <select
                  value={editUserData.role}
                  onChange={(e) => setEditUserData(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full p-2.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-200"
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
                <Label className="text-xs text-zinc-400">Email (opcional)</Label>
                <Input
                  type="email"
                  placeholder="usuario@empresa.com"
                  value={editUserData.email}
                  onChange={(e) => setEditUserData(prev => ({ ...prev, email: e.target.value }))}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              
              {/* Active Status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm text-zinc-300">Usuario Activo</span>
                </div>
                <button
                  onClick={() => setEditUserData(prev => ({ ...prev, is_active: !prev.is_active }))}
                  disabled={editingUser.username === 'admin'}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    editUserData.is_active ? 'bg-emerald-500' : 'bg-zinc-600'
                  } ${editingUser.username === 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    editUserData.is_active ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              
              {/* Password Reset Section */}
              <div className="pt-3 border-t border-zinc-700">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <Label className="text-xs text-amber-400 font-medium">Restablecer Contraseña</Label>
                </div>
                <Input
                  type="password"
                  placeholder="Dejar en blanco para no cambiar"
                  value={editUserData.password}
                  onChange={(e) => setEditUserData(prev => ({ ...prev, password: e.target.value }))}
                  className="bg-zinc-800 border-zinc-700"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Si escribes una nueva contraseña, el usuario deberá usarla inmediatamente
                </p>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                onClick={() => setEditingUser(null)}
                className="flex-1 text-zinc-400 hover:text-zinc-200"
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
