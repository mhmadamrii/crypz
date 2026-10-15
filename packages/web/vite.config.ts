import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig(({ mode }) => {
  // Local dev: single .env at repo root, exposed to server code via process.env (secrets never reach the client).
  // On Vercel there is no .env file; project env vars arrive in process.env directly.
  Object.assign(process.env, loadEnv(mode, '../..', ''))
  return {
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    // nitro() produces the server build; on Vercel it emits .vercel/output automatically
    plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
  }
})
