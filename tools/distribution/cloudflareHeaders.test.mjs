import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { collectShell } from './appShell.mjs'
import { cspHeader, EXTRA_HEADERS } from './csp.mjs'

const root = resolve(import.meta.dirname, '../..')
const headers = readFileSync(resolve(root, 'public/_headers'), 'utf8')
const lines = headers.split(/\r?\n/)
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
  it('leaves COEP off — turning it on shakes the blob:/data: path OPFS relies on', () => {
    expect(headers).not.toContain('Cross-Origin-Embedder-Policy')
  })
  it('caches only the content-hashed files forever', () => {
    for (const ext of ['js', 'css']) {
      const block = headers.split(/\r?\n(?=\/)/)
        .find((one) => one.startsWith(`/assets/*.${ext}`))
      expect(block, ext).toBeDefined()
      expect(block).toContain('Cache-Control: public,max-age=31536000,immutable')
    }
    // 이름이 안 변하는 셸 그림은 여기 안 든다 — 걸면 고쳐도 1년 동안 옛 것이 뜬다
    expect(lines).not.toContain('/assets/*')
  })
  it('serves dist with SPA fallback', () => {
    const config = JSON.parse(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8'))
    expect(config.assets.directory).toBe('./dist')
    expect(config.assets.not_found_handling).toBe('single-page-application')
  })
})
