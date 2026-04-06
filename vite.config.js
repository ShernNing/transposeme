import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /api to the Express backend so VITE_API_BASE_URL is not needed in dev
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Warn at 1MB instead of default 500KB (app has heavy WASM deps)
    chunkSizeWarningLimit: 1024,
  },
})
