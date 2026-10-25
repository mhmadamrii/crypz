import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests run in plain node against the pure modules and server-rendered views, so the app's Vite plugins (TanStack
// Start, Nitro) stay out of it.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
})
