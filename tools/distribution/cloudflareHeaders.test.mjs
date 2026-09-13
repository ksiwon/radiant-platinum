import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { collectShell } from './appShell.mjs'
import { cspHeader, EXTRA_HEADERS } from './csp.mjs'

const root = resolve(import.meta.dirname, '../..')
const headers = readFileSync(resolve(root, 'public/_headers'), 'utf8')
const global = headers.split(/\r?\n(?=\/assets\/)/)[0]
const value = (key) => global.split(/\r?\n/)
  .map((line) => line.trim()).find((line) => line.startsWith(`${key}:`))
  ?.slice(key.length + 1).trim()

describe('Cloudflare static asset deployment', () => {
  it('ships the header configuration through the build allowlist', () => {
    expect(collectShell(resolve(root, 'public'))).toContain('_headers')
  })
  it('applies canonical security headers to all paths', () => {
    expect(global.split(/\r?\n/)[0]).toBe('/*')
    expect(value('Content-Security-Policy')).toBe(cspHeader())
    for (const [key, want] of Object.entries(EXTRA_HEADERS)) {
      expect(value(key), key).toBe(want)
    }
    expect(value('Strict-Transport-Security')).toBe('max-age=31536000')
  })
  it('serves dist with SPA fallback', () => {
    const config = JSON.parse(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8'))
    expect(config.assets.directory).toBe('./dist')
    expect(config.assets.not_found_handling).toBe('single-page-application')
  })
})
