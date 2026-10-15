import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig(() => {
  return {
    // The web app holds no secrets: it only reads VITE_API_URL from the root .env (or Vercel's env).
    envDir: '../..',
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    // nitro() produces the server build; on Vercel it emits .vercel/output automatically
    plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
  }
})
