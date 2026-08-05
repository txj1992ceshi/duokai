import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import tailwindcss from '@tailwindcss/vite'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

const require = createRequire(import.meta.url)
const reactPackageRoot = dirname(require.resolve('react'))
const reactDomPackageRoot = dirname(require.resolve('react-dom'))

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      react: reactPackageRoot,
      'react-dom': reactDomPackageRoot,
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/')
          return normalizedId.includes('/node_modules/') ? 'vendor' : undefined
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
              external: ['node:original-fs', 'better-sqlite3', 'electron-updater', 'cloakbrowser'],
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
