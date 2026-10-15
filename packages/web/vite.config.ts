import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // single .env at repo root; expose to server code via process.env (exchange secrets never reach client)
  Object.assign(process.env, loadEnv(mode, '../..', ''))
  return {
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    plugins: [tailwindcss(), tanstackStart(), viteReact()],
  }
})
