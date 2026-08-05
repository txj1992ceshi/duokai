import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDirectory, '..')
const rendererRoot = path.resolve(appRoot, process.argv[2] || 'dist')

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectJavaScriptFiles(absolutePath)))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(absolutePath)
    }
  }
  return files.sort()
}

const reactRuntimeSignatures = [
  'react.transitional.element',
  '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE',
]
const sonnerSignature = 'data-sonner-toaster'

const files = await collectJavaScriptFiles(rendererRoot)
if (files.length === 0) {
  throw new Error(`No renderer JavaScript files found under ${rendererRoot}`)
}

const inspected = []
for (const file of files) {
  const source = await readFile(file, 'utf8')
  inspected.push({
    file: path.relative(rendererRoot, file),
    containsReactRuntime: reactRuntimeSignatures.every((signature) => source.includes(signature)),
    containsSonner: source.includes(sonnerSignature),
  })
}

const reactRuntimeFiles = inspected.filter((entry) => entry.containsReactRuntime)
const sonnerFiles = inspected.filter((entry) => entry.containsSonner)
const sonnerReactRuntimeFiles = sonnerFiles.filter((entry) => entry.containsReactRuntime)

const result = {
  schemaVersion: 1,
  rendererRoot,
  scannedJavaScriptFiles: inspected.length,
  reactRuntimeFiles: reactRuntimeFiles.map((entry) => entry.file),
  sonnerFiles: sonnerFiles.map((entry) => entry.file),
  sonnerReactRuntimeFiles: sonnerReactRuntimeFiles.map((entry) => entry.file),
}

console.log(JSON.stringify(result, null, 2))

if (reactRuntimeFiles.length !== 1) {
  throw new Error(
    `Renderer bundle must contain exactly one React runtime; found ${reactRuntimeFiles.length}: ${reactRuntimeFiles
      .map((entry) => entry.file)
      .join(', ')}`,
  )
}
if (sonnerFiles.length === 0) {
  throw new Error('Renderer bundle does not contain the expected Sonner toaster implementation.')
}
