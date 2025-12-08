/**
 * AdminDialog - System Administration Panel
 * 
 * Contains: Email notifications, Cloud storage, Backups
 * Data is loaded lazily per-tab for better performance
 */
import { useState, useEffect } from 'react'
import { 
  ServerCog, 
  Loader2, 
  Save,
  CheckCircle,
  AlertCircle,
  Mail,
  Cloud,
  ExternalLink,
  Unlink,
  KeyRound,
  Send,
  Trash2,
  Archive
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
  testSmtpConnection,
  saveSmtpConfig,
  getSmtpConfig,
  getDriveStatus,
  saveOAuthCredentials,
  deleteOAuthCredentials,
  startDriveAuth,
  verifyDriveAuth,
  testDriveUpload,
  disconnectDrive,
  type DriveStatus
} from '@/lib/api'
import { BackupManager } from '@/components/BackupManager'

interface AdminDialogProps {
  isOpen: boolean
  onClose: () => void
}

type AdminTab = 'notifications' | 'cloud' | 'backups'

// ============================================================
// Email Tab Component - Loads data only when active
// ============================================================
function EmailTab() {
  const [smtpEmail, setSmtpEmail] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpConfigured, setSmtpConfigured] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Load SMTP config when tab mounts
  useEffect(() => {
    const loadSmtpConfig = async () => {
      setIsLoading(true)
      try {
        const smtpConfig = await getSmtpConfig()
        if (smtpConfig && smtpConfig.enabled) {
          setSmtpEmail(smtpConfig.username || '')
          setSmtpConfigured(true)
        }
      } catch {
        // SMTP not configured yet
      } finally {
        setIsLoading(false)
      }
    }
    loadSmtpConfig()
  }, [])

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
      setTestResult({ success: false, message: 'Completa el email y contraseña' })
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
      setTestResult({ success: true, message: 'Configuración de notificaciones guardada' })
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Error al guardar configuración'
      setTestResult({ success: false, message })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/20">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-red-500/20">
            <Mail className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">Notificaciones Gmail</h3>
            <p className="text-xs text-muted-foreground">Recibe alertas por email cuando se detecte movimiento</p>
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
          <Label className="text-xs text-muted-foreground">Tu correo de Gmail</Label>
          <Input
            type="email"
            placeholder="tu-email@gmail.com"
            value={smtpEmail}
            onChange={(e) => setSmtpEmail(e.target.value)}
            className="bg-secondary border-border"
          />
        </div>
        
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-2">
            <KeyRound className="w-3 h-3" />
            Contraseña de Aplicación
          </Label>
          <Input
            type="password"
            placeholder="xxxx xxxx xxxx xxxx"
            value={smtpPassword}
            onChange={(e) => setSmtpPassword(e.target.value)}
            className="bg-secondary border-border font-mono"
          />
          <p className="text-[10px] text-muted-foreground">
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
          className="flex-1"
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
  )
}

// ============================================================
// Cloud Tab Component - Loads data only when active
// ============================================================
function CloudTab() {
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null)
  const [driveAuthUrl, setDriveAuthUrl] = useState<string | null>(null)
  const [driveAuthCode, setDriveAuthCode] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isTestingUpload, setIsTestingUpload] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [driveTestResult, setDriveTestResult] = useState<{ success: boolean; message: string } | null>(null)
  
  // OAuth credentials state
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthClientSecret, setOauthClientSecret] = useState('')
  const [isSavingOAuth, setIsSavingOAuth] = useState(false)

  // Load Drive status when tab mounts
  useEffect(() => {
    const loadDriveStatus = async () => {
      setIsLoading(true)
      try {
        const status = await getDriveStatus()
        setDriveStatus(status)
      } catch {
        // Drive not configured yet
      } finally {
        setIsLoading(false)
      }
    }
    loadDriveStatus()
  }, [])

  const handleStartDriveAuth = async () => {
    setIsConnecting(true)
    setDriveTestResult(null)
    
    try {
      const result = await startDriveAuth()
      setDriveAuthUrl(result.auth_url)
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
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
                <h3 className="font-medium text-foreground">Conectado a Google Drive</h3>
                {driveStatus.email && (
                  <p className="text-xs text-muted-foreground">{driveStatus.email}</p>
                )}
                <p className="text-xs text-emerald-400">Carpeta: {driveStatus.folder}</p>
              </div>
            </div>
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
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleTestDriveUpload}
              disabled={isTestingUpload}
              className="flex-1"
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
                <h3 className="font-medium text-foreground">Google Drive</h3>
                <p className="text-xs text-muted-foreground">Respalda grabaciones automáticamente en la nube</p>
              </div>
            </div>
          </div>
          
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <h4 className="font-medium text-yellow-400 mb-2">⚙️ Paso 1: Configurar Credenciales OAuth</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Necesitas crear credenciales OAuth en Google Cloud Console:
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 mb-3 list-decimal ml-4">
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
              <Label className="text-xs text-muted-foreground">Client ID</Label>
              <Input
                placeholder="xxxxx.apps.googleusercontent.com"
                value={oauthClientId}
                onChange={(e) => setOauthClientId(e.target.value)}
                className="bg-secondary border-border font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Client Secret</Label>
              <Input
                type="password"
                placeholder="GOCSPX-xxxxxxxxxxxx"
                value={oauthClientSecret}
                onChange={(e) => setOauthClientSecret(e.target.value)}
                className="bg-secondary border-border font-mono text-xs"
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
                  <h3 className="font-medium text-foreground">Google Drive</h3>
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
              <p className="text-sm text-muted-foreground mb-4">
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
                <Label className="text-xs text-muted-foreground">Código de Autorización</Label>
                <Input
                  placeholder="Pega el código de Google aquí"
                  value={driveAuthCode}
                  onChange={(e) => setDriveAuthCode(e.target.value)}
                  className="bg-secondary border-border font-mono text-sm"
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
          
          {driveTestResult && !driveTestResult.success && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{driveTestResult.message}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================
// Main AdminDialog Component
// ============================================================
export function AdminDialog({ isOpen, onClose }: AdminDialogProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('notifications')

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border p-0 sm:max-w-3xl w-[95vw]">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ServerCog className="w-5 h-5" />
            Administración del Sistema
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'notifications' 
                ? 'text-primary border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Mail className="w-4 h-4" />
            Email
          </button>
          <button
            onClick={() => setActiveTab('cloud')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'cloud' 
                ? 'text-primary border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Cloud className="w-4 h-4" />
            Nube
          </button>
          <button
            onClick={() => setActiveTab('backups')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'backups' 
                ? 'text-primary border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Archive className="w-4 h-4" />
            Backups
          </button>
        </div>

        {/* Content - Lazy loaded per tab */}
        <div className="p-4 min-h-[300px]">
          {activeTab === 'notifications' && <EmailTab />}
          {activeTab === 'cloud' && <CloudTab />}
          {activeTab === 'backups' && <BackupManager />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
