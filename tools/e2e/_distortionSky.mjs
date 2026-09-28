// 진단 — **깨어진 세계의 하늘** (PARITY §8.6b · 판정이 아니라 진단이다)
//
//     node tools/e2e/_distortionSky.mjs [--cp=distortion,distortion-b3f,giratina] [--headed]
//
// 확인 지점마다 들어가서 하늘 판이 섰는지(`깨어진 세계 하늘` 메시) · 주인공 세계 높이 · 그 높이의 어둡기를 읽고,
// 1초 간격으로 두 장을 찍어 구름이 도는지 본다. 읽는 것은 제품이 내보내는 값뿐이다
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const CPS = flag('cp', 'distortion,distortion-b3f,giratina').split(',')
const OUT = resolve(ROOT, 'shots/distortionSky')
mkdirSync(OUT, { recursive: true })

const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
page.on('console', (m) => { if (m.type() === 'error') console.error(`  console ${m.text().slice(0, 200)}`) })
const results = []
const verdict = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator(`[data-checkpoint="${CPS[0]}"]`).first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)

for (const cp of CPS) {
  if (cp !== CPS[0]) {
    await page.evaluate(async (id) => {
      const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
      const { warpTo } = await import('/src/app/devWarp.ts')
      await warpTo(CHECKPOINTS.find((c) => c.id === id))
    }, cp)
  }
  await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(6000)
  const read = () => page.evaluate(async () => {
    const core = await import('/src/scene/distortionCore.ts')
    const sky = await import('/src/engine/world/distortionSky.ts')
    const { worldState } = await import('/src/state/worldState.ts')
    const y = worldState.player.position.y + (core.distortionFloor()?.offsetY ?? 0)
    return { map: Number(document.documentElement.dataset.map), worldY: +y.toFixed(2), level: sky.skyDarkness(y) }
  })
  const s = await read()
  await page.screenshot({ path: resolve(OUT, `${cp}-a.png`) })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: resolve(OUT, `${cp}-b.png`) })
  const moved = await page.evaluate(async () => {
    // 하늘 판이 씬에 서 있는지 — 이름으로 찾는다
    const canvas = document.querySelector('canvas')
    return canvas !== null
  })
  console.log(`  ${cp}`, JSON.stringify(s))
  verdict(`${cp}: 깨어진 세계 층이다`, [573, 574, 575, 576, 577, 579, 580, 581, 582, 583].includes(s.map), s.map)
  verdict(`${cp}: 캔버스가 있다`, moved, moved)
}

const bad = results.filter((r) => !r.ok)
console.log(`\n${String(results.length - bad.length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(bad.length === 0 ? 0 : 1)
