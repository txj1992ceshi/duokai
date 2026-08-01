import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import process from 'node:process'

const cwd = process.cwd()
const outputDir = process.env.SMOKE_OUTPUT_DIR
  ? path.resolve(process.env.SMOKE_OUTPUT_DIR)
  : path.join(os.tmpdir(), 'duokai2-smoke-artifacts')
const logPath = path.join(outputDir, 'desktop-main.log')
const resultPath = path.join(outputDir, 'smoke-result.json')
const packagedDirectory = path.join(cwd, 'release', 'win-unpacked')
const packagedExecutable =
  process.platform === 'win32' && existsSync(packagedDirectory)
    ? readdirSync(packagedDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
        .map((entry) => path.join(packagedDirectory, entry.name))
        .sort((left, right) => left.localeCompare(right))[0] ?? null
    : null

mkdirSync(outputDir, { recursive: true })
writeFileSync(logPath, '', 'utf8')

const electronBinary = path.join(
  cwd,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
)

if (process.platform === 'win32' && !packagedExecutable) {
  console.error(`Packaged Windows executable not found under ${packagedDirectory}`)
  process.exit(1)
}

const child = process.platform === 'win32'
  ? spawn(packagedExecutable, [], {
      cwd: path.dirname(packagedExecutable),
      env: {
        ...process.env,
        CI: '1',
        SMOKE_TEST: '1',
        SMOKE_OUTPUT_DIR: outputDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  : spawn(electronBinary, ['.'], {
      cwd,
      env: {
        ...process.env,
        CI: '1',
        SMOKE_TEST: '1',
        SMOKE_OUTPUT_DIR: outputDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

child.stdout.on('data', (chunk) => {
  writeFileSync(logPath, chunk, { flag: 'a' })
})

child.stderr.on('data', (chunk) => {
  writeFileSync(logPath, chunk, { flag: 'a' })
})

const exitCode = await new Promise((resolve) => {
  child.on('close', (code) => resolve(code ?? 1))
})

if (!existsSync(resultPath)) {
  if (existsSync(logPath)) {
    const logContent = readFileSync(logPath, 'utf8')
    if (logContent.trim()) {
      console.error(logContent)
    }
  }
  console.error(`Smoke result missing at ${resultPath}`)
  process.exit(typeof exitCode === 'number' ? exitCode : 1)
}

const result = JSON.parse(readFileSync(resultPath, 'utf8'))
console.log(JSON.stringify(result, null, 2))
process.exit(result.success ? 0 : (typeof exitCode === 'number' ? exitCode : 1))
