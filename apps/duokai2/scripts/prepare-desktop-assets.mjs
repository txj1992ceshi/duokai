import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const outputRoot = path.join(repoRoot, 'build-resources')
const webFavicon = path.join(repoRoot, '..', '..', 'fingerprint-dashboard', 'src', 'app', 'favicon.ico')
const fallbackIcns = path.join(
  repoRoot,
  'node_modules',
  'app-builder-lib',
  'templates',
  'icons',
  'proton-native',
  'proton-native.icns',
)

rmSync(outputRoot, { recursive: true, force: true })
mkdirSync(outputRoot, { recursive: true })

if (!existsSync(webFavicon)) {
  throw new Error(`Desktop icon source not found: ${webFavicon}`)
}
if (!existsSync(fallbackIcns)) {
  throw new Error(`Fallback macOS icon source not found: ${fallbackIcns}`)
}

copyFileSync(webFavicon, path.join(outputRoot, 'icon.ico'))
copyFileSync(fallbackIcns, path.join(outputRoot, 'icon.icns'))

console.log('Prepared desktop icon resources:')
console.log(`- Windows ICO: ${path.join(outputRoot, 'icon.ico')}`)
console.log(`- macOS ICNS: ${path.join(outputRoot, 'icon.icns')}`)
