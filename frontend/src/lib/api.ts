import axios from 'axios'

// Use relative URL when proxy is configured, fallback to env var
const API_URL = '/api'

// Go2RTC URL for direct stream access from browser
// In browser, we need to access Go2RTC directly (not through Docker network)
// Default to localhost:1984 for development
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

// ============================================================
// Types
// ============================================================

export interface Camera {
  id: number
  name: string
  main_stream_url: string
  sub_stream_url: string | null
  is_recording: boolean
  is_active: boolean
  location: string | null
  created_at: string
  updated_at: string
}

export interface CameraCreate {
  name: string
  main_stream_url: string
  sub_stream_url?: string | null
  location?: string | null
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
