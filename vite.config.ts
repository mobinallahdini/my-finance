import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { applicationWorker } from './scripts/pwaBuild.ts'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), applicationWorker()],
})
