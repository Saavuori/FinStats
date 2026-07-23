import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The frontend talks to Statistics Finland (pxdata.stat.fi, geo.stat.fi)
// directly from the browser — both send CORS headers, so there is no data
// proxy here. The only thing the Go backend serves is this build plus
// /api/version and /api/health, hence the small proxy for local dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    proxy: {
      '/api': 'http://localhost:8081',
    },
  },
})
