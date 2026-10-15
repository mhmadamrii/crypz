import { defineConfig, loadEnv } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // single .env at repo root; expose to server code via process.env (OKX secrets never reach client)
  Object.assign(process.env, loadEnv(mode, '../..', ''))
  return {
    plugins: [tanstackStart(), viteReact()],
  }
})
