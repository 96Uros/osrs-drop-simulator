import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ["osrs-drop-simulator.onrender.com", "osrs-drop-simulator.com"],
  },
})
