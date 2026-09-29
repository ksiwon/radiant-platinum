// 진단 — **배로 건너가기** (`ScrCmd_PlayBoatCutscene` · `cutscenes/boat_cutscene`)
//
//     node tools/e2e/_boat.mjs [--headed] [--from=canalave|snowpoint]
//
// 확인 지점에 선 뒤 배 소품 옆에 주인공을 세우고 서비스로 장면을 연다(원작 스크립트가 부르는 인자 그대로 —
// 운하 → 강철섬 `TakeShipFromCanalave DIR_EAST, IRON_ISLAND, 100, 502` · 선단 → 싸움의섬 `DIR_EAST, FIGHT_AREA, 623, 434`).
// 배가 밀리는지 · 다리가 들리는지 · 건너기 앱이 도는지 · 도착 맵과 밝기를 잰다. 읽는 것: `boatLive` · `shipProps` ·
// `shipOffset` · `bridgeFrame`(제품) · `fadeAlpha` · 문서의 `data-map`
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const from = args.find((a) => a.startsWith('--from='))?.slice(7) ?? 'canalave'
const CASE = {
  // 선 자리 — 뱃사람 앞에서 한 걸음 들어선 칸 (운하 뱃사람 (45, 750) · 선단은 돌아올 때 내리는 칸 (356, 246))
  canalave: { checkpoint: 'canalave', dir: 3, ship: 34, dest: [288, 100, 502], facing: 3, bridge: true, at: [45, 750] },
  snowpoint: { checkpoint: 'snowpoint', dir: 2, ship: 538, dest: [188, 623, 434], facing: 3, bridge: false, at: [356, 246] },
}[from]
const OUT = resolve(ROOT, `shots/boat-${from}`)
mkdirSync(OUT, { recursive: true })
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 720 } })
const errors = []
page.on('pageerror', (e) => { errors.push(String(e.message).slice(0, 200)); console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
const results = []
const verdict = (name, ok, detail) => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator(`[data-checkpoint="${CASE.checkpoint}"]`).first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
  && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
await page.waitForTimeout(5000)

const setup = await page.evaluate(async (c) => {
  const boat = await import('/src/scene/boatCutscene.ts')
  const fade = await import('/src/engine/script/fade.ts')
  const { worldState } = await import('/src/state/worldState.ts')
  const { fieldScripts } = await import('/src/engine/script/field.ts')
  const { cameraSystem } = await import('/src/engine/actor/camera.ts')
  globalThis.__bt = { boat, fade, worldState, cameraSystem }
  const ships = [...boat.shipProps.entries()].filter(([, p]) => p.model === c.ship)
  if (ships.length === 0) return { ships: 0 }
  // 스크립트가 주인공을 배에 태운 자리 · 숨김 (`PlayerWalkToShip…` · `SetInvisible`)
  worldState.player.position.x = c.at[0] + 0.5
  worldState.player.position.z = c.at[1] + 0.5
  worldState.player.hidden = true
  // 원작 찾기 네모(`shipHitbox`)에 드는 배 — 가운데에 가장 가까운 것
  const box = c.dir === 3 ? [1, -3, 3, 6] : [-2, 2, 6, 3]
  const cx = c.at[0] + box[0] + box[2] / 2, cz = c.at[1] + box[1] + box[3] / 2
  ships.sort((a, b) => Math.hypot(a[1].x - cx, a[1].z - cz) - Math.hypot(b[1].x - cx, b[1].z - cz))
  const [, p] = ships[0]
  const start = { x: worldState.player.position.x, z: worldState.player.position.z }
  fieldScripts.services.boat.start(c.dir, c.facing, c.dest[0], c.dest[1], c.dest[2])
  return { ships: ships.length, at: p, start, key: boat.boatLive.shipKey, want: ships[0][0] }
}, CASE)
console.log('  ', JSON.stringify(setup))
verdict('배 소품을 찾아 고른다', setup.ships > 0 && setup.key === setup.want, setup)

const read = () => page.evaluate(() => {
  const { boat, fade, cameraSystem } = globalThis.__bt
  const L = boat.boatLive
  return {
    phase: L.phase, ticks: L.ticks, off: L.shipKey ? boat.shipOffset(L.shipKey) : null,
    bridge: boat.bridgeFrame(31), cam: cameraSystem.free, travel: L.travel ? L.travel.frames[0] : null,
    cover: +fade.fadeAlpha().toFixed(2), map: Number(document.documentElement.dataset.map),
  }
})
const seen = { maxOff: 0, bridgeMax: -1, travelMax: -1, phases: [], camMoved: false }
const shots = new Set()
const t0 = Date.now()
let s = await read()
while (Date.now() - t0 < 60_000) {
  s = await read()
  if (seen.phases.at(-1) !== s.phase) seen.phases.push(s.phase)
  if (s.off) seen.maxOff = Math.max(seen.maxOff, Math.hypot(s.off[0], s.off[1]))
  if (s.bridge !== null) seen.bridgeMax = Math.max(seen.bridgeMax, s.bridge)
  if (s.travel !== null) seen.travelMax = Math.max(seen.travelMax, s.travel)
  if (s.cam && setup.start && Math.hypot(s.cam.x - setup.start.x, s.cam.z - setup.start.z) > 1) seen.camMoved = true
  const snap = async (name) => { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: resolve(OUT, `${name}.png`) }); console.log(`  찍음 ${name} (틱 ${String(s.ticks)})`) }
  if (s.phase === 'field' && s.ticks > 60) await snap('field-early')
  if (s.phase === 'field' && s.bridge !== null && s.bridge > 60) await snap('bridge')
  if (s.phase === 'travel' && s.travel !== null && s.travel > 40) await snap('travel')
  if (s.phase === 'off' && s.ticks > 0) break
  await page.waitForTimeout(40)
}
await page.waitForTimeout(800)
const end = await read()
await page.screenshot({ path: resolve(OUT, 'arrive.png') })
console.log('  ', JSON.stringify(seen))
verdict('필드에서 배가 밀린다 (운하 25칸 · 선단 12칸 가까이)', seen.maxOff > (CASE.bridge ? 20 : 9), seen)
verdict('카메라가 배와 같이 간다', seen.camMoved, seen)
verdict(CASE.bridge ? '운하 다리가 끝까지 들린다 (130프레임)' : '다리가 없다', CASE.bridge ? seen.bridgeMax === 129 : seen.bridgeMax === -1, seen)
verdict('건너기 앱이 첫 애니 끝(89)까지 돈다', seen.travelMax === 89, seen)
verdict('차례 — 필드 → 닫기 → 건너기 → 도착 → 끝', JSON.stringify(seen.phases) === JSON.stringify(['field', 'closing', 'travel', 'arrive', 'off']), seen.phases)
verdict('도착 맵에 밝게 선다', end.map === CASE.dest[0] && end.cover === 0 && end.cam === null, end)
verdict('페이지 오류가 없다', errors.length === 0, errors.slice(0, 3))

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
