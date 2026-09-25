import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' keeps the build relocatable (GitHub Pages serves it under /<repo>/).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
