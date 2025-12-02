import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
    },
    proxy: {
      // Proxy API requests to backend
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        // Fallback to localhost when running outside Docker
        configure: (proxy) => {
          proxy.on('error', () => {
            console.log('Proxy error, trying localhost...')
          })
        },
      },
    },
  },
})
