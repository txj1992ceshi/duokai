import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }
          if (id.includes('/react/') || id.includes('/react-dom/')) {
            return 'vendor-react'
          }
          if (id.includes('/framer-motion/')) {
            return 'vendor-motion'
          }
          if (id.includes('/i18next/') || id.includes('/react-i18next/')) {
            return 'vendor-i18n'
          }
          if (id.includes('/lucide-react/') || id.includes('/@duokai/ui/')) {
            return 'vendor-ui'
          }
          return 'vendor-misc'
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    ...electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['playwright', 'better-sqlite3'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart({ reload }) {
          reload()
        },
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'es',
                codeSplitting: false,
                entryFileNames: 'preload.mjs',
                chunkFileNames: '[name].mjs',
                assetFileNames: '[name].[ext]',
              },
            },
          },
        },
      },
    ]),
  ],
  clearScreen: false,
})
