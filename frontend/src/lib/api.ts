import axios from 'axios'

// Use relative URL when proxy is configured, fallback to env var
const API_URL = '/api'

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
