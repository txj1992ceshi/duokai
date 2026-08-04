import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceDirectory = fileURLToPath(new URL('.', import.meta.url))
const stylesPath = fileURLToPath(new URL('./styles.css', import.meta.url))
const styles = readFileSync(stylesPath, 'utf8')

function collectSourceFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(path))
      continue
    }
    if (['.css', '.ts', '.tsx'].includes(extname(entry.name))) {
      files.push(path)
    }
  }
  return files
}

function collectMatches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1])
}

function declarationsFrom(source) {
  return new Map(
    [...source.matchAll(/^\s*(--duokai-[\w-]+)\s*:\s*([^;]+);/gm)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  )
}

test('every shared Duokai design token reference has a CSS definition', () => {
  const sources = collectSourceFiles(sourceDirectory)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
  const usedTokens = new Set(collectMatches(sources, /var\(\s*(--duokai-[\w-]+)/g))
  const definedTokens = new Set(collectMatches(styles, /^\s*(--duokai-[\w-]+)\s*:/gm))
  const missingTokens = [...usedTokens].filter((token) => !definedTokens.has(token)).sort()

  assert.deepEqual(missingTokens, [])
})

test('shared geometry defaults preserve the rounded desktop design', () => {
  const rootBlock = styles.match(/^:root\s*\{([\s\S]*?)^\}/m)
  assert.ok(rootBlock, 'Expected a base :root token block.')
  const declarations = declarationsFrom(rootBlock[1])
  const expected = new Map([
    ['--duokai-ui-scale', '1'],
    ['--duokai-layout-scale', 'var(--duokai-ui-scale)'],
    ['--duokai-font-scale', 'var(--duokai-ui-scale)'],
    ['--duokai-card-padding', 'calc(24px * var(--duokai-layout-scale))'],
    ['--duokai-control-height-sm', 'calc(36px * var(--duokai-layout-scale))'],
    ['--duokai-control-height-md', 'calc(40px * var(--duokai-layout-scale))'],
    ['--duokai-control-height-lg', 'calc(44px * var(--duokai-layout-scale))'],
    ['--duokai-control-px-sm', 'calc(12px * var(--duokai-layout-scale))'],
    ['--duokai-control-px-md', 'calc(16px * var(--duokai-layout-scale))'],
    ['--duokai-control-px-lg', 'calc(20px * var(--duokai-layout-scale))'],
    ['--duokai-radius-sm', 'calc(12px * var(--duokai-layout-scale))'],
    ['--duokai-radius-md', 'calc(16px * var(--duokai-layout-scale))'],
    ['--duokai-radius-xl', 'calc(28px * var(--duokai-layout-scale))'],
  ])

  for (const [token, value] of expected) {
    assert.equal(declarations.get(token), value, `${token} must retain its intended default.`)
  }
})
