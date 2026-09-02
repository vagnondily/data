import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// MEMS — frontend-only SPA. Data persists in the browser (localStorage).
export default defineConfig({
  plugins: [react()],
  server: { port: 4000, host: true },
  preview: { port: 4000, host: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
})
