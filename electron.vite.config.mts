import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const { puppyVersion } = createRequire(import.meta.url)('./scripts/version.cjs') as { puppyVersion: () => string }

// Everything (incl. the ESM-only ACP SDK) is a devDependency, so it gets
// bundled into main/preload instead of being require()d at runtime.
const sharedAlias = { '@shared': resolve(import.meta.dirname, 'src/shared') }

export default defineConfig({
  // Baked in so a run from source shows the same version as Puppy.app, not package.json's literal "0.1.0".
  main: { resolve: { alias: sharedAlias }, define: { __PUPPY_VERSION__: JSON.stringify(puppyVersion()) } },
  preload: { resolve: { alias: sharedAlias } },
  renderer: {
    resolve: {
      alias: { ...sharedAlias, '@renderer': resolve(import.meta.dirname, 'src/renderer/src') },
    },
    plugins: [react(), tailwindcss()],
  },
})
