// 진단 — **일그러진 창기둥의 호수 구슬 셋** (`ScrCmd_20D` 4 · 6 · `ov6_0223FAF8`)
//
//     node tools/e2e/_lakeOrbs.mjs [--headed]
//
// 일그러진 창기둥(맵 221 · 30,30 북쪽)에 서서 서비스로 4를 부르고 6이 참이 될 때까지 매 프레임 묻는다. 울음 · 효과음을
// 가로채 차례를 적고, 흰 밝기의 가장 높은 값과 끝나는 시각을 잰다. 읽는 것: `spearPillarLive`(제품) · `fadeAlpha`
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/lakeOrbs')
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
const row = page.locator('[data-checkpoint="spear"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
const settle = async () => {
  await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(4000)
}
await settle()
await page.evaluate(async () => {
  const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
  const { warpTo } = await import('/src/app/devWarp.ts')
  const cp = CHECKPOINTS.find((c) => c.id === 'spear')
  await warpTo({ ...cp, id: 'spear-distorted', map: 221, spot: { kind: 'tile', x: 30, z: 30, facing: Math.PI } })
})
await settle()
await page.evaluate(async () => {
  const mesh = await import('/src/scene/chunkMesh.ts')
  for (const n of ['orbUxie', 'orbAzelf', 'orbMesprit']) await Promise.all([mesh.loadDemoMesh(n), mesh.loadDemoSheet(n), mesh.loadDemoAnims(n)])
  const fx = await import('/src/scene/spearPillarFx.ts')
  const fade = await import('/src/engine/script/fade.ts')
  const { music } = await import('/src/engine/audio/music.ts')
  const { fieldScripts } = await import('/src/engine/script/field.ts')
  const log = []
  const cry = music.playCry.bind(music), se = music.playEffect.bind(music)
  music.playCry = (s) => { log.push(`cry ${s}`); return cry(s) }
  music.playEffect = (s) => { if (s === 1750) log.push('climax10'); return se(s) }
  Object.assign(globalThis, { __lo: { fx, fade, log, peak: 0 } })
  globalThis.__lo.t0 = performance.now()
  fieldScripts.services.spearPillarFx(4)
  const poll = () => {
    globalThis.__lo.peak = Math.max(globalThis.__lo.peak, fade.fadeAlpha())
    if (fieldScripts.services.spearPillarFx(6) === 1) globalThis.__lo.doneAt = performance.now() - globalThis.__lo.t0
    else requestAnimationFrame(poll)
  }
  requestAnimationFrame(poll)
})
for (const at of [900, 1700, 8300]) {
  const now = await page.evaluate(() => performance.now() - globalThis.__lo.t0)
  if (at > now) await page.waitForTimeout(at - now)
  await page.screenshot({ path: resolve(OUT, `t${at}.png`) })
}
await page.waitForFunction(() => globalThis.__lo.doneAt !== undefined, null, { timeout: 30_000, polling: 50 })
const res = await page.evaluate(() => ({ ms: Math.round(globalThis.__lo.doneAt), peak: globalThis.__lo.peak, log: globalThis.__lo.log, end: globalThis.__lo.fade.fadeAlpha() }))
verdict('차례 — 유크시 → 뛰어듦 → 아그놈 → 뛰어듦 → 엠라이트 → 뛰어듦', JSON.stringify(res.log) === JSON.stringify(['cry 480', 'climax10', 'cry 482', 'climax10', 'cry 481', 'climax10']), res.log)
verdict('뛰어들 때마다 온 화면이 하얘진다 (16/16)', res.peak === 1, { peak: res.peak })
// 695틱 = 11.6초
verdict('끝 — 695틱쯤 · 밝기가 돌아와 있다', res.ms > 10800 && res.ms < 13000 && res.end === 0, res)

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
