// 진단 — **도서관 텔레비전이 원작 판 셋으로 뜨고 252프레임 뒤 스스로 닫히는가** (`StartLibraryTV`)
//
//     node tools/e2e/_libraryTv.mjs [--headed]
//
// 서비스로 텔레비전을 열고 가운데에서 한 장 찍는다. 읽는 것: `useLibraryTvStore`(제품) · 닫힐 때까지의 시간
const { mkdirSync } = await import('node:fs')
const { resolve } = await import('node:path')
const { chromium } = await import('playwright')
const { freePort, startVite } = await import('../devServer.mjs')
const { gpuArgs } = await import('../gpuFlags.mjs')

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/libraryTv')
mkdirSync(OUT, { recursive: true })
const args = process.argv.slice(2)
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
const results = []
const verdict = (name, ok, detail) => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="jubilife"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
  && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
await page.waitForTimeout(2500)

const t0 = await page.evaluate(async () => {
  const { useLibraryTvStore } = await import('/src/state/libraryTvStore.ts')
  const { fieldScripts } = await import('/src/engine/script/field.ts')
  Object.assign(globalThis, { __tv: useLibraryTvStore })
  fieldScripts.services.libraryTv.open()
  return performance.now()
})
await page.waitForTimeout(2000)
await page.screenshot({ path: resolve(OUT, 'mid.png') })
const mid = await page.evaluate(() => globalThis.__tv.getState().on)
verdict('떠 있다 (2초)', mid, {})
await page.waitForFunction(() => globalThis.__tv.getState().on === false, null, { timeout: 20_000, polling: 16 })
const ms = await page.evaluate((start) => performance.now() - start, t0)
// 6 + 240 + 6 프레임 = 4.2초 (+ 그림을 받는 시간)
verdict('스스로 닫힌다 — 252프레임쯤', ms > 4100 && ms < 6500, { ms: Math.round(ms) })

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
