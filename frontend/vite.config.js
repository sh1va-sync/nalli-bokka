import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [{ find: /^lottie-web(?:\/build\/player\/lottie_svg\.js)?$/, replacement: 'lottie-web/build/player/lottie_light.js' }],
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})

// https://nalli-bokka-backend.onrender.com
