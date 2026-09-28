// 진단 — **깨어진 세계 소품이 스스로 움직이는가** (PARITY §6.10 · `ov9_02249960.c`의 `DistWorld*Prop_AnimTick`)
//
//     node tools/e2e/_distortionProps.mjs [--headed]
//
// 1F(문 · 떠 있는 발판)와 B4F(덩굴꽃 · 바위)에 들어가 1초 사이를 두고 두 번 읽고 찍는다. 읽는 것: 제품의
// `distortionPropAnimState`(발판 높이 · 알파 · 덩굴꽃 프레임과 틱 수)
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/distortionProps')
mkdirSync(OUT, { recursive: true })
const args = process.argv.slice(2)
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
const results = []
const verdict = (name, ok, detail) => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="distortion"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
const settle = async () => {
  await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(6000)
}
const read = () => page.evaluate(async () => {
  const { distortionPropAnimState } = await import('/src/scene/DistortionProps.tsx')
  return { map: Number(document.documentElement.dataset.map), s: distortionPropAnimState() }
})

await settle()
const a = await read()
await page.screenshot({ path: resolve(OUT, '1f-a.png') })
await page.waitForTimeout(1000)
const b = await read()
await page.screenshot({ path: resolve(OUT, '1f-b.png') })
const shown = (s) => s?.platforms.filter((p) => p.opacity === 31) ?? []
verdict('1F — 틱이 1초에 60쯤 흐른다', b.s !== null && a.s !== null && Math.abs((b.s.ticks - a.s.ticks) - 60) <= 12, { map: b.map, dt: (b.s?.ticks ?? 0) - (a.s?.ticks ?? 0) })
const ys = shown(b.s).map((p) => p.y)
verdict('1F — 보이는 발판이 제각각 둥실거린다 (높이 0 ~ −3/8칸, 서로 다르다)', ys.length > 0 && ys.every((y) => y <= 0 && y >= -0.375) && new Set(ys).size > 1, { n: ys.length, ys: ys.slice(0, 8) })
const moved = shown(a.s).some((p, i) => shown(b.s)[i] !== undefined && shown(b.s)[i].y !== p.y)
verdict('1F — 1초 뒤 높이가 바뀌었다', moved, {})

await page.evaluate(async () => {
  const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
  const { warpTo } = await import('/src/app/devWarp.ts')
  await warpTo(CHECKPOINTS.find((c) => c.id === 'distortion-b4f'))
})
await settle()
const c = await read()
await page.screenshot({ path: resolve(OUT, 'b4f.png') })
const obs = c.s?.obstacles ?? []
verdict('B4F — 덩굴꽃 · 바위가 선다 (보이는 것은 다 자란 채로 · 알파 31 · 프레임 31)', obs.length > 0
  && obs.every((o) => (o.opacity === 31 && o.frame === 31) || (o.opacity === 0 && o.frame === 0)), { map: c.map, obs })

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
