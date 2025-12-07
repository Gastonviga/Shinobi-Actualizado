import axios from 'axios'

// API URL - use localhost:8000 for browser access (backend is exposed on this port)
// In Docker, the browser can't resolve 'backend:8000', so we use localhost
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

// Go2RTC URL for direct stream access from browser
const GO2RTC_URL = import.meta.env.VITE_GO2RTC_URL || 'http://localhost:1984'

// Log the configured URLs for debugging
console.log('[API] Backend URL:', API_URL)
console.log('[API] Go2RTC URL:', GO2RTC_URL)

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('titan_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('titan_token')
      localStorage.removeItem('titan_user')
      // Optionally redirect to login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// ============================================================
// Types
// ============================================================

export type RecordingMode = 'continuous' | 'motion' | 'events'

export interface Camera {
  id: number
  name: string
  main_stream_url: string
  sub_stream_url: string | null
  is_recording: boolean
  is_active: boolean
  location: string | null
  group: string | null
  // Enterprise recording settings
  retention_days: number
  recording_mode: RecordingMode
  event_retention_days: number
  zones_config: Record<string, unknown> | null
  // PTZ capability
  features_ptz: boolean
  // Map positioning
  map_id: number | null
  map_x: number | null
  map_y: number | null
  created_at: string
  updated_at: string
}

export interface CameraCreate {
  name: string
  main_stream_url: string
  sub_stream_url?: string | null
  location?: string | null
  group?: string | null
  // Enterprise recording settings
  retention_days?: number
  recording_mode?: RecordingMode
  event_retention_days?: number
}

export interface CameraUpdate {
  name?: string
  main_stream_url?: string
  sub_stream_url?: string | null
  location?: string | null
  group?: string | null
  is_active?: boolean
  retention_days?: number
  recording_mode?: RecordingMode
  event_retention_days?: number
}

export interface BulkCreateResponse {
  created: number
  failed: number
  errors: string[]
  cameras: Camera[]
}

// Auth types
export interface User {
  id: number
  username: string
  email: string | null
  role: 'admin' | 'operator' | 'viewer'
  is_active: boolean
  receive_email_alerts: boolean
}

export interface UserUpdate {
  email?: string | null
  role?: 'admin' | 'operator' | 'viewer'
  is_active?: boolean
  receive_email_alerts?: boolean
  password?: string  // For admin password reset (leave empty to not change)
}

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

// Settings types
export interface PublicSettings {
  system_title: string
  theme_color: string
  logo_url: string | null
  company_name: string
}

export interface RecordingModeInfo {
  mode: string
  name: string
  description: string
  storage_impact: string
}

export interface HealthStatus {
  status: string
  go2rtc_status: string
  go2rtc_url: string
}

export interface StreamUrls {
  webrtc: string
  mse: string
  hls: string
  mjpeg: string
}

export interface CameraStreams {
  camera_id: number
  camera_name: string
  streams: {
    main: StreamUrls
    sub: StreamUrls
  }
}

export type ConnectionStatus = 'online' | 'offline' | 'connecting' | 'unknown'

export interface CameraStatus {
  camera_id: number
  camera_name: string
  connection_status: ConnectionStatus
  is_active: boolean
  details?: string
}

export interface AllCamerasStatus {
  cameras: CameraStatus[]
}

// ============================================================
// Health API
// ============================================================

export const healthCheck = async (): Promise<HealthStatus> => {
  const response = await api.get<HealthStatus>('/health')
  return response.data
}

export const forceSync = async (): Promise<{ status: string; synced: number; failed: number }> => {
  const response = await api.post('/sync')
  return response.data
}

// ============================================================
// Authentication API
// ============================================================

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const formData = new URLSearchParams()
  formData.append('username', username)
  formData.append('password', password)
  
  const response = await api.post<LoginResponse>('/auth/login', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  
  // Store token and user
  localStorage.setItem('titan_token', response.data.access_token)
  localStorage.setItem('titan_user', JSON.stringify(response.data.user))
  
  return response.data
}

export const logout = (): void => {
  localStorage.removeItem('titan_token')
  localStorage.removeItem('titan_user')
}

export const getCurrentUser = async (): Promise<User> => {
  const response = await api.get<User>('/auth/me')
  return response.data
}

export const getStoredUser = (): User | null => {
  const userStr = localStorage.getItem('titan_user')
  if (userStr) {
    try {
      return JSON.parse(userStr)
    } catch {
      return null
    }
  }
  return null
}

export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('titan_token')
}

// ============================================================
// User Management API (Admin)
// ============================================================

export const getUsers = async (): Promise<User[]> => {
  const response = await api.get<User[]>('/auth/users')
  return response.data
}

export const createUser = async (data: { username: string; password: string; email?: string; role?: string }): Promise<User> => {
  const response = await api.post<User>('/auth/users', data)
  return response.data
}

export const updateUser = async (id: number, data: UserUpdate): Promise<User> => {
  const response = await api.put<User>(`/auth/users/${id}`, data)
  return response.data
}

export const deleteUser = async (id: number): Promise<void> => {
  await api.delete(`/auth/users/${id}`)
}

// ============================================================
// Settings API
// ============================================================

export const getPublicSettings = async (): Promise<PublicSettings> => {
  const response = await api.get<PublicSettings>('/settings/public')
  return response.data
}

export const getRecordingModesInfo = async (): Promise<{ modes: RecordingModeInfo[], default: string }> => {
  const response = await api.get('/cameras/recording-modes/info')
  return response.data
}

// ============================================================
// Camera CRUD API
// ============================================================

export const getCameras = async (): Promise<Camera[]> => {
  const response = await api.get<Camera[]>('/cameras/')
  return response.data
}

export const getCamera = async (id: number): Promise<Camera> => {
  const response = await api.get<Camera>(`/cameras/${id}`)
  return response.data
}

export const createCamera = async (camera: CameraCreate): Promise<Camera> => {
  const response = await api.post<Camera>('/cameras/', camera)
  return response.data
}

export const updateCamera = async (id: number, camera: Partial<Camera>): Promise<Camera> => {
  const response = await api.patch<Camera>(`/cameras/${id}`, camera)
  return response.data
}

export const deleteCamera = async (id: number): Promise<void> => {
  await api.delete(`/cameras/${id}`)
}

export const createCamerasBulk = async (cameras: CameraCreate[]): Promise<BulkCreateResponse> => {
  const response = await api.post<BulkCreateResponse>('/cameras/bulk', { cameras })
  return response.data
}

export const getCameraGroups = async (): Promise<{ groups: string[] }> => {
  const response = await api.get<{ groups: string[] }>('/cameras/groups/list')
  return response.data
}

export interface BulkDeleteCamerasResponse {
  deleted: number
  failed: number
  errors: string[]
}

export const bulkDeleteCameras = async (cameraIds: number[]): Promise<BulkDeleteCamerasResponse> => {
  const response = await api.post<BulkDeleteCamerasResponse>('/cameras/bulk-delete', { camera_ids: cameraIds })
  return response.data
}

// ============================================================
// Camera Connection Test (QA Feature)
// ============================================================

export interface StreamTestResponse {
  success: boolean
  details: string | null
  error: string | null
}

/**
 * Test if a stream URL is accessible before saving a camera.
 * 
 * This endpoint temporarily registers the stream in Go2RTC,
 * waits for connection (~3 seconds), and returns the result.
 * 
 * @param streamUrl - The RTSP/HTTP stream URL to test
 * @returns Promise with success status and details/error message
 */
export const testCameraConnection = async (streamUrl: string): Promise<StreamTestResponse> => {
  const response = await api.post<StreamTestResponse>('/cameras/test', { stream_url: streamUrl })
  return response.data
}

// ============================================================
// Recordings API
// ============================================================

export interface Recording {
  camera: string
  name: string
  path: string
  size: number
  size_mb: number
  created: string
  modified: string
}

export const getRecordings = async (camera?: string, date?: string): Promise<{ recordings: Recording[], total: number }> => {
  const params = new URLSearchParams()
  if (camera) params.append('camera', camera)
  if (date) params.append('date', date)
  const response = await api.get(`/recordings/?${params.toString()}`)
  return response.data
}

export const deleteRecording = async (filePath: string): Promise<void> => {
  await api.delete(`/recordings/${filePath}`)
}

export interface BulkDeleteResponse {
  deleted: number
  errors: number
  details: string[]
}

export const bulkDeleteRecordings = async (files: string[]): Promise<BulkDeleteResponse> => {
  const response = await api.post<BulkDeleteResponse>('/recordings/bulk-delete', { files })
  return response.data
}

// ============================================================
// Stream URLs API
// ============================================================

export const getStreamUrls = async (cameraId: number): Promise<CameraStreams> => {
  const response = await api.get<CameraStreams>(`/cameras/${cameraId}/streams`)
  return response.data
}

// ============================================================
// Camera Status API
// ============================================================

export const getCameraStatus = async (cameraId: number): Promise<CameraStatus> => {
  const response = await api.get<CameraStatus>(`/cameras/${cameraId}/status`)
  return response.data
}

export const getAllCamerasStatus = async (): Promise<AllCamerasStatus> => {
  const response = await api.get<AllCamerasStatus>('/cameras/status/all')
  return response.data
}

// ============================================================
// Direct Go2RTC URL Builders
// ============================================================

/**
 * Normalize camera name to match backend format
 */
const normalizeName = (name: string): string => {
  return name.toLowerCase().replace(/ /g, '_').replace(/-/g, '_')
}

/**
 * Get Go2RTC embed URL for iframe playback
 * This is the most reliable way to play streams
 */
export const getGo2RTCEmbedUrl = (cameraName: string, quality: 'main' | 'sub' = 'sub'): string => {
  const streamId = `${normalizeName(cameraName)}_${quality}`
  return `${GO2RTC_URL}/stream.html?src=${streamId}`
}

/**
 * Get Go2RTC WebRTC URL
 */
export const getGo2RTCWebRTCUrl = (cameraName: string, quality: 'main' | 'sub' = 'sub'): string => {
  const streamId = `${normalizeName(cameraName)}_${quality}`
  return `${GO2RTC_URL}/api/webrtc?src=${streamId}`
}

/**
 * Get Go2RTC MSE (MP4) URL
 */
export const getGo2RTCMseUrl = (cameraName: string, quality: 'main' | 'sub' = 'sub'): string => {
  const streamId = `${normalizeName(cameraName)}_${quality}`
  return `${GO2RTC_URL}/api/stream.mp4?src=${streamId}`
}

/**
 * Get Go2RTC snapshot URL
 */
export const getGo2RTCSnapshotUrl = (cameraName: string, quality: 'main' | 'sub' = 'sub'): string => {
  const streamId = `${normalizeName(cameraName)}_${quality}`
  return `${GO2RTC_URL}/api/frame.jpeg?src=${streamId}`
}

export { GO2RTC_URL }

// ============================================================
// Maps API (Enterprise E-Maps)
// ============================================================

export interface MapInfo {
  id: number
  name: string
  description: string | null
  image_path: string
  image_url: string
  created_at: string
  updated_at: string
}

export interface MapCameraInfo {
  id: number
  name: string
  map_x: number
  map_y: number
  is_recording: boolean
  is_active: boolean
  features_ptz: boolean
  has_alert: boolean
}

export interface MapWithCameras extends MapInfo {
  cameras: MapCameraInfo[]
}

export const getMaps = async (): Promise<MapInfo[]> => {
  const response = await api.get<MapInfo[]>('/maps/')
  return response.data
}

export const getMap = async (id: number): Promise<MapWithCameras> => {
  const response = await api.get<MapWithCameras>(`/maps/${id}`)
  return response.data
}

export const createMap = async (name: string, description: string | null, image: File): Promise<MapInfo> => {
  const formData = new FormData()
  formData.append('name', name)
  if (description) formData.append('description', description)
  formData.append('image', image)
  
  const response = await api.post<MapInfo>('/maps/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}

export const updateMap = async (id: number, data: { name?: string; description?: string }): Promise<MapInfo> => {
  const response = await api.patch<MapInfo>(`/maps/${id}`, data)
  return response.data
}

export const deleteMap = async (id: number): Promise<void> => {
  await api.delete(`/maps/${id}`)
}

export const updateCameraPosition = async (
  cameraId: number, 
  mapId: number, 
  x: number, 
  y: number
): Promise<Camera> => {
  const response = await api.patch<Camera>(`/maps/cameras/${cameraId}/position`, {
    map_id: mapId,
    map_x: x,
    map_y: y
  })
  return response.data
}

export const removeCameraFromMap = async (cameraId: number): Promise<void> => {
  await api.delete(`/maps/cameras/${cameraId}/position`)
}

export const getUnpositionedCameras = async (): Promise<Camera[]> => {
  const response = await api.get<Camera[]>('/maps/cameras/unpositioned')
  return response.data
}

export interface CameraAlertInfo {
  has_alert: boolean
  label: string | null
  score: number | null
}

export interface MapAlertsResponse {
  alerts: Record<number, CameraAlertInfo>
  timestamp: string
}

export const getMapAlerts = async (mapId: number): Promise<MapAlertsResponse> => {
  const response = await api.get<MapAlertsResponse>(`/maps/${mapId}/alerts`)
  return response.data
}

// ============================================================
// PTZ Control API
// ============================================================

export type PTZAction = 'move_up' | 'move_down' | 'move_left' | 'move_right' | 'zoom_in' | 'zoom_out' | 'stop'

export interface PTZResponse {
  success: boolean
  message: string
  camera_name: string
}

export interface PTZStatus {
  camera_id: number
  camera_name: string
  ptz_enabled: boolean
  available_actions: PTZAction[]
}

export const sendPTZCommand = async (
  cameraId: number, 
  action: PTZAction, 
  speed: number = 0.5
): Promise<PTZResponse> => {
  const response = await api.post<PTZResponse>(`/cameras/${cameraId}/ptz`, {
    action,
    speed
  })
  return response.data
}

export const gotoPTZPreset = async (cameraId: number, presetId: number): Promise<PTZResponse> => {
  const response = await api.post<PTZResponse>(`/cameras/${cameraId}/ptz/preset/${presetId}`)
  return response.data
}

export const getPTZStatus = async (cameraId: number): Promise<PTZStatus> => {
  const response = await api.get<PTZStatus>(`/cameras/${cameraId}/ptz/status`)
  return response.data
}

// ============================================================
// Timeline & Events API (Evidence Management)
// ============================================================

export interface TimelineEvent {
  id: string
  start_time: string
  end_time: string | null
  label: string
  score: number
  has_clip: boolean
  start_timestamp: number
  end_timestamp: number | null
  color: string
}

export interface EventTimeline {
  camera: string
  start: string
  end: string
  events: TimelineEvent[]
  total_count: number
}

export interface EventDetail {
  id: string
  camera: string
  label: string
  score: number
  start_time: string
  end_time: string | null
  has_clip: boolean
  has_snapshot: boolean
  zones: string | null
  thumbnail_path: string | null
  created_at: string
  duration_seconds: number | null
}

export const getEventTimeline = async (
  cameraName: string,
  start?: string,
  end?: string
): Promise<EventTimeline> => {
  const params = new URLSearchParams({ camera_name: cameraName })
  if (start) params.append('start', start)
  if (end) params.append('end', end)
  
  const response = await api.get<EventTimeline>(`/events/timeline?${params.toString()}`)
  return response.data
}

export const getEventDetail = async (eventId: string): Promise<EventDetail> => {
  const response = await api.get<EventDetail>(`/events/db/${eventId}`)
  return response.data
}

export const getEventsFromDB = async (params: {
  camera?: string
  label?: string
  min_score?: number
  start_time?: string
  end_time?: string
  has_clip?: boolean
  limit?: number
  offset?: number
}): Promise<EventDetail[]> => {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.append(key, String(value))
  })
  
  const response = await api.get<EventDetail[]>(`/events/db?${searchParams.toString()}`)
  return response.data
}

// ============================================================
// Audit Log API (Compliance)
// ============================================================

export interface AuditLog {
  id: number
  user_id: number | null
  username: string
  action: string
  details: string | null
  ip_address: string | null
  user_agent: string | null
  resource_type: string | null
  resource_id: string | null
  timestamp: string
}

export interface AuditLogList {
  items: AuditLog[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface AuditStats {
  total_logs: number
  logs_today: number
  unique_users: number
  actions_breakdown: Record<string, number>
  period_start: string
  period_end: string
}

export interface AuditActionType {
  code: string
  label: string
  category: string
}

export const getAuditLogs = async (params: {
  username?: string
  action?: string
  resource_type?: string
  start_time?: string
  end_time?: string
  page?: number
  page_size?: number
}): Promise<AuditLogList> => {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.append(key, String(value))
  })
  
  const response = await api.get<AuditLogList>(`/audit?${searchParams.toString()}`)
  return response.data
}

export const getAuditStats = async (days: number = 7): Promise<AuditStats> => {
  const response = await api.get<AuditStats>(`/audit/stats?days=${days}`)
  return response.data
}

export const getAuditActionTypes = async (): Promise<{ actions: AuditActionType[] }> => {
  const response = await api.get<{ actions: AuditActionType[] }>('/audit/actions')
  return response.data
}

// ============================================================
// System Health API
// ============================================================

export interface CPUStats {
  percent_total: number
  percent_per_core: number[]
  core_count: number
  frequency_mhz: number | null
}

export interface MemoryStats {
  total_gb: number
  used_gb: number
  free_gb: number
  percent_used: number
}

export interface DiskStats {
  path: string
  total_gb: number
  used_gb: number
  free_gb: number
  percent_used: number
  is_critical: boolean
}

export interface NetworkStats {
  bytes_sent: number
  bytes_recv: number
  bytes_sent_gb: number
  bytes_recv_gb: number
}

export interface UptimeStats {
  seconds: number
  formatted: string
  started_at: string
}

export interface SystemHealth {
  timestamp: string
  cpu: CPUStats
  memory: MemoryStats
  disk: DiskStats
  network: NetworkStats
  uptime: UptimeStats
  overall_status: 'healthy' | 'warning' | 'critical'
  alerts: string[]
}

export interface ServicesStatus {
  backend: string
  go2rtc: string
  frigate: string
  mqtt: string
  containers: Array<{
    name: string
    status: string
    health: string | null
  }>
}

export const getSystemStats = async (): Promise<SystemHealth> => {
  const response = await api.get<SystemHealth>('/system/stats')
  return response.data
}

export const getServicesStatus = async (): Promise<ServicesStatus> => {
  const response = await api.get<ServicesStatus>('/system/services')
  return response.data
}

// ============================================================
// Evidence Export API
// ============================================================

export interface ExportRequest {
  event_ids: string[]
  case_name: string
  case_number?: string
  operator_notes?: string
  include_snapshots?: boolean
  include_clips?: boolean
}

export interface ExportResponse {
  export_id: string
  case_name: string
  download_url: string
  file_count: number
  total_size_mb: number
  created_at: string
  expires_at: string
}

export interface ExportListItem {
  export_id: string
  case_name: string
  case_number: string | null
  created_at: string
  created_by: string
  file_count: number
  size_mb: number
  download_url: string
}

export const createEvidenceExport = async (request: ExportRequest): Promise<ExportResponse> => {
  const response = await api.post<ExportResponse>('/export/create', request)
  return response.data
}

export const listExports = async (): Promise<ExportListItem[]> => {
  const response = await api.get<ExportListItem[]>('/export/list')
  return response.data
}

export const deleteExport = async (exportId: string): Promise<void> => {
  await api.delete(`/export/${exportId}`)
}

export const getExportDownloadUrl = (exportId: string): string => {
  return `${API_URL}/export/download/${exportId}`
}

// ============================================================
// Notifications (SMTP) API
// ============================================================

export interface SmtpTestRequest {
  provider: 'gmail' | 'custom'
  email: string
  password: string
  host?: string
  port?: number
  use_tls?: boolean
}

export interface SmtpTestResponse {
  success: boolean
  message: string
  details?: string
}

export const testSmtpConnection = async (config: SmtpTestRequest): Promise<SmtpTestResponse> => {
  const response = await api.post<SmtpTestResponse>('/settings/smtp/test', config)
  return response.data
}

export const saveSmtpConfig = async (config: SmtpTestRequest): Promise<{ success: boolean; message: string }> => {
  const response = await api.post('/settings/smtp/save', config)
  return response.data
}

export interface SmtpConfig {
  enabled: boolean
  provider: string
  host: string
  port: number
  username: string
  from_email: string
  use_tls: boolean
}

export const getSmtpConfig = async (): Promise<SmtpConfig | null> => {
  try {
    const response = await api.get<{ value_json: SmtpConfig }>('/settings/smtp_config')
    return response.data.value_json
  } catch {
    return null
  }
}

// ============================================================
// Cloud (Google Drive) API
// ============================================================

export interface DriveStatus {
  connected: boolean
  email: string | null
  remote_name: string
  folder: string
  oauth_configured: boolean
}

export interface OAuthCredentials {
  client_id: string
  client_secret: string
}

export interface OAuthStatus {
  configured: boolean
  client_id_preview: string | null
}

export interface DriveAuthResponse {
  auth_url: string
  instructions: string
}

export interface DriveTestUploadResponse {
  success: boolean
  message: string
  filename?: string
}

export const getDriveStatus = async (): Promise<DriveStatus> => {
  const response = await api.get<DriveStatus>('/cloud/drive/status')
  return response.data
}

export const getOAuthStatus = async (): Promise<OAuthStatus> => {
  const response = await api.get<OAuthStatus>('/cloud/drive/oauth-status')
  return response.data
}

export const saveOAuthCredentials = async (creds: OAuthCredentials): Promise<{ success: boolean; message: string }> => {
  const response = await api.post('/cloud/drive/oauth-credentials', creds)
  return response.data
}

export const deleteOAuthCredentials = async (): Promise<{ success: boolean; message: string }> => {
  const response = await api.delete('/cloud/drive/oauth-credentials')
  return response.data
}

export const startDriveAuth = async (): Promise<DriveAuthResponse> => {
  const response = await api.post<DriveAuthResponse>('/cloud/drive/auth')
  return response.data
}

export const verifyDriveAuth = async (code: string): Promise<{ success: boolean; message: string }> => {
  const response = await api.post('/cloud/drive/verify', { code })
  return response.data
}

export const testDriveUpload = async (): Promise<DriveTestUploadResponse> => {
  const response = await api.post<DriveTestUploadResponse>('/cloud/drive/test-upload')
  return response.data
}

export const disconnectDrive = async (): Promise<{ success: boolean; message: string }> => {
  const response = await api.post('/cloud/drive/disconnect')
  return response.data
}

// ============================================================
// Camera Schedules API
// ============================================================

export type ScheduleMode = 'continuous' | 'motion' | 'events' | 'none'

export interface ScheduleSlot {
  day_of_week: number  // 0=Monday, 6=Sunday
  start_time: string   // HH:MM format
  end_time: string     // HH:MM format
  mode: ScheduleMode
}

export interface CameraScheduleEntry {
  id: number
  camera_id: number
  day_of_week: number
  start_time: string
  end_time: string
  mode: string
  created_at: string
}

export interface CameraSchedulesResponse {
  camera_id: number
  camera_name: string
  schedules: CameraScheduleEntry[]
  has_schedule: boolean
}

export const getCameraSchedules = async (cameraId: number): Promise<CameraSchedulesResponse> => {
  const response = await api.get<CameraSchedulesResponse>(`/cameras/${cameraId}/schedules`)
  return response.data
}

export const setCameraSchedules = async (
  cameraId: number, 
  schedules: ScheduleSlot[]
): Promise<CameraSchedulesResponse> => {
  const response = await api.post<CameraSchedulesResponse>(
    `/cameras/${cameraId}/schedules`,
    { schedules }
  )
  return response.data
}

// ============================================================
// Forensic Search API
// ============================================================

export interface SearchFilters {
  camera_ids?: string[]
  labels?: string[]
  date_from?: string  // ISO datetime string
  date_to?: string    // ISO datetime string
  min_score?: number
  has_clip?: boolean
}

export interface SearchResultItem {
  id: string
  camera: string
  label: string
  score: number
  start_time: string
  end_time: string | null
  duration_seconds: number | null
  has_clip: boolean
  has_snapshot: boolean
  thumbnail_url: string | null
  clip_url: string | null
  zones: string | null
  color: string
}

export interface SearchResponse {
  results: SearchResultItem[]
  total: number
  page: number
  limit: number
  total_pages: number
  filters_applied: Record<string, unknown>
}

export interface LabelInfo {
  label: string
  count: number
  color: string
}

export interface CameraEventInfo {
  camera: string
  event_count: number
}

export const searchEvents = async (
  filters: SearchFilters,
  page: number = 1,
  limit: number = 50
): Promise<SearchResponse> => {
  const response = await api.post<SearchResponse>(
    `/events/search?page=${page}&limit=${limit}`,
    filters
  )
  return response.data
}

export const getSearchLabels = async (): Promise<{ labels: LabelInfo[] }> => {
  const response = await api.get<{ labels: LabelInfo[] }>('/events/search/labels')
  return response.data
}

export const getSearchCameras = async (): Promise<{ cameras: CameraEventInfo[] }> => {
  const response = await api.get<{ cameras: CameraEventInfo[] }>('/events/search/cameras')
  return response.data
}

// ============================================================
// Backup & Restore
// ============================================================

export interface BackupMetadata {
  version: string
  timestamp: string
  cameras_count: number
  users_count: number
  settings_count: number
  maps_count: number
}

export interface ImportResult {
  success: boolean
  message: string
  cameras_imported: number
  users_imported: number
  settings_imported: number
  maps_imported: number
  errors: string[]
}

export const getBackupInfo = async (): Promise<BackupMetadata> => {
  const response = await api.get<BackupMetadata>('/system/backup/info')
  return response.data
}

export const exportBackup = async (): Promise<Blob> => {
  const response = await api.get('/system/backup/export', {
    responseType: 'blob'
  })
  return response.data
}

export const importBackup = async (
  file: File,
  mode: 'merge' | 'replace' = 'merge',
  skipAdmin: boolean = true
): Promise<ImportResult> => {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await api.post<ImportResult>(
    `/system/backup/import?mode=${mode}&skip_admin=${skipAdmin}`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' }
    }
  )
  return response.data
}

// ============================================================
// User Camera Permissions
// ============================================================

export interface UserPermissions {
  user_id: number
  username: string
  role: string
  camera_ids: number[]
  camera_names: string[]
}

export const getUserPermissions = async (userId: number): Promise<UserPermissions> => {
  const response = await api.get<UserPermissions>(`/auth/users/${userId}/permissions`)
  return response.data
}

export const updateUserPermissions = async (
  userId: number, 
  cameraIds: number[]
): Promise<UserPermissions> => {
  const response = await api.put<UserPermissions>(
    `/auth/users/${userId}/permissions`,
    { camera_ids: cameraIds }
  )
  return response.data
}
