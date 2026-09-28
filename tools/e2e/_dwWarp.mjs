// 진단 — **깨어진 세계로 빨려 드는 문** (`DoDWWarp` · `dw_warp/dw_warp.c`)
//
//     node tools/e2e/_dwWarp.mjs [--headed]
//
// 화면을 검게 덮고(스크립트의 `FadeScreenOut`과 같은 자리) 서비스로 연출을 세운 뒤, 세 번 찍고 끝날 때까지 잰다.
// 읽는 것: `useDwWarpStore`(제품) · `cinematicStage.fov` · 페이드 진하기(`fadeAlpha`)
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/dwWarp')
mkdirSync(OUT, { recursive: true })
const args = process.argv.slice(2)
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 720 } })
page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
const results = []
const verdict = (name, ok, detail) => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="jubilife"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
  && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
await page.waitForTimeout(3000)

// 모델을 미리 받아 둔다 — 원작은 앱이 설 때 이미 램에 있다
await page.evaluate(async () => {
  const mesh = await import('/src/scene/chunkMesh.ts')
  await Promise.all([mesh.loadDemoMesh('portal'), mesh.loadDemoSheet('portal'), mesh.loadDemoAnims('portal')])
})
const t0 = await page.evaluate(async () => {
  const { useDwWarpStore } = await import('/src/state/dwWarpStore.ts')
  const fade = await import('/src/engine/script/fade.ts')
  const refs = await import('/src/scene/battle/stageRefs.ts')
  const { fieldScripts } = await import('/src/engine/script/field.ts')
  Object.assign(globalThis, { __dw: { store: useDwWarpStore, fade, refs } })
  fade.coverScreen(0)
  fieldScripts.services.dwWarp.start()
  return performance.now()
})
const peek = () => page.evaluate(() => ({
  on: globalThis.__dw.store.getState().on,
  fov: +globalThis.__dw.refs.cinematicStage.fov.toFixed(2),
  alpha: +globalThis.__dw.fade.fadeAlpha().toFixed(2),
}))
const shots = []
for (const at of (args.find((a) => a.startsWith("--at="))?.slice(5).split(",").map(Number) ?? [500, 1100, 1600])) {
  const now = await page.evaluate((s) => performance.now() - s, t0)
  if (at > now) await page.waitForTimeout(at - now)
  await page.screenshot({ path: resolve(OUT, `t${at}.png`) })
  shots.push({ at, ...(await peek()) })
}
console.log('  ', JSON.stringify(shots))
verdict('문이 선 동안 밝아졌다가(덮개 0) 화각이 줄어든다', shots[0].on && shots[0].alpha < 0.2 && shots[1].fov < shots[0].fov, shots)
await page.waitForFunction(() => globalThis.__dw.store.getState().on === false, null, { timeout: 20_000, polling: 16 })
const ms = await page.evaluate((s) => performance.now() - s, t0)
const end = await peek()
// 16 + 86 + 1 + 20틱쯤 — 1/60초로 124틱이면 2.07초
verdict('스스로 닫힌다 — 검게 덮인 채로 (124틱쯤)', ms > 1800 && ms < 3200 && end.alpha === 1, { ms: Math.round(ms), end })

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
