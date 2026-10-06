import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The frontend talks to Statistics Finland (pxdata.stat.fi, geo.stat.fi)
// directly from the browser — both send CORS headers, so there is no data
// proxy here. The only thing the Go backend serves is this build plus
// /api/version and /api/health, hence the small proxy for local dev.
export default defineConfig({
  plugins: [react()],
  // MapLibre's worker is an ES module (it imports a shared chunk), so bundle
  // it as one too; see MapView.tsx.
  worker: { format: 'es' },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    proxy: {
      '/api': 'http://localhost:8081',
    },
  },
})
