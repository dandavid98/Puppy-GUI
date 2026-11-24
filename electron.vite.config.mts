import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Everything (incl. the ESM-only ACP SDK) is a devDependency, so it gets
// bundled into main/preload instead of being require()d at runtime.
const sharedAlias = { '@shared': resolve(import.meta.dirname, 'src/shared') }

export default defineConfig({
  main: { resolve: { alias: sharedAlias } },
  preload: { resolve: { alias: sharedAlias } },
  renderer: {
    resolve: {
      alias: { ...sharedAlias, '@renderer': resolve(import.meta.dirname, 'src/renderer/src') },
    },
    plugins: [react(), tailwindcss()],
  },
})
