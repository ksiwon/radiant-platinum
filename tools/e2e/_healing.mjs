// 진단 — **간호순에게 회복을 맡기면 회복기에 볼이 놓이나** (PARITY §8.11 · 판정이 아니라 진단이다)
//
//     node tools/e2e/_healing.mjs [--map=6] [--headed]
//
// 잔모시티 포켓몬센터(맵 6)에서 간호순(8,4) 앞 칸(8,6)에 북쪽을 보고 서서 A를 누르고, 「예」로 맡긴다.
// 읽는 것은 제품이 내보내는 값뿐이다: `healBalls`(놓인 볼 자리) · `healingTick` · `healingFrame`(볼 · 화면의 클립 프레임) ·
// 파티 마릿수 · `data-talk`. 볼이 다 놓인 순간과 클립이 도는 순간을 찍는다
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const MAP = Number(flag('map', '6'))
const OUT = resolve(ROOT, 'shots/healing')
mkdirSync(OUT, { recursive: true })

const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: [...gpuArgs('gl'), '--autoplay-policy=no-user-gesture-required'], headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
page.on('console', (m) => { if (m.type() === 'error') console.error(`  console ${m.text().slice(0, 200)}`) })
const results = []
const verdict = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }
const tap = async (key, ms = 150, hold = 70) => {
  await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key); await page.waitForTimeout(ms)
}

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="siwon"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
  && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
await page.mouse.move(2, 2)

await page.evaluate(async (m) => {
  const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
  const { warpTo } = await import('/src/app/devWarp.ts')
  const cp = CHECKPOINTS.find((c) => c.id === 'siwon')
  await warpTo({ ...cp, id: `heal>${String(m)}`, map: m, spot: { kind: 'tile', x: 8, z: 6, facing: Math.PI } })
}, MAP)
await page.waitForFunction((m) => document.documentElement.dataset.map === String(m)
  && document.documentElement.dataset.restoring === undefined, MAP, { timeout: 120_000 })
await page.waitForTimeout(5000)

const party = await page.evaluate(async () => (await import('/src/state/saveStore.ts')).useSaveStore.getState().party.filter((p) => !p.isEgg).length)
const machine = await page.evaluate(async () => {
  const { world } = await import('/src/engine/map/world.ts')
  const { propPlacement } = await import('/src/engine/map/propPlacement.ts')
  return propPlacement(world.grid.meta, world.mapId, 123)
})
console.log(`  맵 ${String(MAP)} · 파티 ${String(party)}마리 · 회복기 ${JSON.stringify(machine)}`)

const sample = () => page.evaluate(async () => {
  const h = await import('/src/scene/healingMachine.ts')
  const f = await import('/src/engine/script/field.ts')
  return {
    t: performance.now(),
    tick: h.healingTick(),
    balls: h.healBalls(),
    ball: h.healingFrame(517, 68),
    screen: h.healingFrame(124, 73),
    talk: document.documentElement.dataset.talk === '1',
    script: document.documentElement.dataset.script === '1',
    choice: f.fieldScripts.world?.menu != null,
  }
})

const CLIP = { x: 250, y: 0, width: 240, height: 180 }
await page.screenshot({ path: resolve(OUT, 'machine-before.png'), clip: CLIP })
await tap('KeyZ', 400)
const seen = { maxBalls: 0, firstBall: null, full: null, final: null, end: null, ballFrame: 0, screenFrame: 0, choices: 0, positions: [] }
let shotFull = false, shotFinal = false
const t0 = Date.now()
let idle = 0
while (Date.now() - t0 < 60_000) {
  const s = await sample()
  if (s.balls.length > 0 && seen.firstBall === null) seen.firstBall = s.t
  if (s.balls.length > seen.maxBalls) { seen.maxBalls = s.balls.length; seen.positions = s.balls }
  if (s.balls.length === party && seen.full === null) seen.full = s.t
  if (s.ball !== null) { seen.ballFrame = Math.max(seen.ballFrame, s.ball); if (seen.final === null) seen.final = s.t }
  if (s.screen !== null) seen.screenFrame = Math.max(seen.screenFrame, s.screen)
  if (seen.full !== null && !shotFull) { shotFull = true; await page.screenshot({ path: resolve(OUT, 'balls-full.png') }); await page.screenshot({ path: resolve(OUT, 'machine-full.png'), clip: CLIP }) }
  if (s.ball !== null && s.ball > 20 && !shotFinal) { shotFinal = true; await page.screenshot({ path: resolve(OUT, 'balls-flash.png') }); await page.screenshot({ path: resolve(OUT, 'machine-flash.png'), clip: CLIP }) }
  if (seen.final !== null && s.balls.length === 0 && seen.end === null) seen.end = s.t
  if (s.choice) { seen.choices++; await tap('KeyZ', 400); continue }
  if (s.tick !== null) { await page.waitForTimeout(30); continue }
  if (!s.talk && !s.script) { if (++idle > 8) break } else idle = 0
  if (s.talk) await tap('Space', 250)
  else await page.waitForTimeout(80)
}
console.log('  ', JSON.stringify(seen))
const perBall = seen.full !== null && seen.firstBall !== null && party > 1 ? (seen.full - seen.firstBall) / (party - 1) / (1000 / 60) : null
verdict('맡기겠냐는 물음에 답했다', seen.choices >= 1, seen.choices)
verdict('볼이 파티 마릿수만큼 놓였다', seen.maxBalls === party, { balls: seen.maxBalls, party })
verdict('볼 사이 간격이 17틱 안팎이다', perBall === null || Math.abs(perBall - 17) < 3, perBall)
verdict('다 놓인 뒤 볼 · 화면 클립이 끝까지 돌았다', seen.ballFrame >= 60 && seen.screenFrame >= 65, { ball: seen.ballFrame, screen: seen.screenFrame })
verdict('끝나면 볼을 치웠다', seen.end !== null, seen.end !== null && seen.final !== null ? Math.round(seen.end - seen.final) : null)

const bad = results.filter((r) => !r.ok)
console.log(`\n${String(results.length - bad.length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(bad.length === 0 ? 0 : 1)
