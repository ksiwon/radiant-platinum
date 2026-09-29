// 진단 — **창기둥 영상** (`ScrCmd_2FB` · `overlay100`)
//
//     node tools/e2e/_spearMovie.mjs [--headed]
//
// 창기둥 확인 지점에서 붉은 사슬이 끝난 자리(검게 덮인 화면)를 세우고 서비스로 영상을 연다. 글이 뜨면 Z로 넘기며
// 장면 셋의 몇 자리를 찍고, 끝까지 간다. 읽는 것: `movieLive`(제품) · `fadeAlpha` · `screenTint` · 문서의 `talk`
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/spearMovie')
mkdirSync(OUT, { recursive: true })
const args = process.argv.slice(2)
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
const row = page.locator('[data-checkpoint="spear"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
  && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
await page.waitForTimeout(4000)

await page.evaluate(async () => {
  const fade = await import('/src/engine/script/fade.ts')
  const { fieldScripts } = await import('/src/engine/script/field.ts')
  const live = await import('/src/scene/spearPillarMovie.ts')
  Object.assign(globalThis, { __pm: { fade, live } })
  // 붉은 사슬의 끝 — 검게 덮인 채다
  fade.holdCover(1, 0)
  fieldScripts.services.spearPillarMovie.start()
})

const read = () => page.evaluate(async () => {
  const { useSpearPillarMovieStore } = await import('/src/state/spearPillarMovieStore.ts')
  const m = globalThis.__pm.live.movieLive.movie
  return {
    on: useSpearPillarMovieStore.getState().on,
    ready: globalThis.__pm.live.movieLive.ready,
    scene: m?.scene ?? null, state: m?.state ?? null, ticks: m?.ticks ?? 0, t: m?.t ?? 0, branch: m?.branch ?? 0,
    shown: m?.shown.objects.map((o) => o.key) ?? [],
    bright: m?.bright ?? 0, afterimage: m?.afterimage ?? false,
    talk: document.documentElement.dataset.talk === '1',
    cover: +globalThis.__pm.fade.fadeAlpha().toFixed(3), tint: globalThis.__pm.fade.screenTint.alpha,
  }
})

// 찍을 자리 — [장면, 단계, 이 틱 이후, 이름, 호수의 몇째]
const SHOTS = [
  [0, 3, 0, 'scene0-text14'], [0, 6, 200, 'scene0-orbs'], [0, 7, 0, 'scene0-dialga'], [0, 13, 0, 'scene0-galaxy'],
  [0, 14, 0, 'scene0-text18'], [1, 3, 150, 'scene1-uxie', 0], [1, 3, 90, 'scene1-mesprit', 1], [1, 3, 90, 'scene1-azelf', 2], [2, 4, 0, 'scene2-text20'],
  [2, 8, 0, 'scene2-text22'], [2, 12, 90, 'scene2-shadow'], [2, 15, 0, 'scene2-rise'], [2, 17, 0, 'scene2-roar'],
  [2, 19, 120, 'scene2-origin'],
]
const taken = new Set()
let lastTicks = 0
let s = await read()
const seen = { scene0: 0, scene1: 0, scene2: 0, afterimage: false, maxObjects: 0 }
const t0 = Date.now()
while (Date.now() - t0 < 240_000) {
  s = await read()
  if (!s.on && s.ticks > 0) break
  if (s.scene !== null) {
    seen[`scene${String(s.scene)}`] = Math.max(seen[`scene${String(s.scene)}`], s.shown.length)
    seen.maxObjects = Math.max(seen.maxObjects, s.shown.length)
    if (s.afterimage) seen.afterimage = true
    for (const [sc, st, after, name, branch] of SHOTS) {
      if (taken.has(name) || s.scene !== sc || s.state !== st || s.t < after || (branch !== undefined && s.branch !== branch)) continue
      taken.add(name)
      await page.screenshot({ path: resolve(OUT, `${name}.png`) })
      console.log(`  찍음 ${name} (틱 ${String(s.ticks)})`)
    }
  }
  lastTicks = Math.max(lastTicks, s.ticks)
  if (s.talk) {
    await page.waitForTimeout(250)
    await page.keyboard.down('KeyZ'); await page.waitForTimeout(80); await page.keyboard.up('KeyZ')
  }
  await page.waitForTimeout(60)
}
const end = await read()
verdict('모델을 받고 연다', end.ready === true, { ready: end.ready })
// 글을 곧바로 넘기면 2661틱이다(`spearPillarMovie.test`) — 글을 읽는 동안이 더해진다
verdict('끝까지 돈다 — 스크립트가 풀린다', !end.on && lastTicks > 2600, { on: end.on, ticks: lastTicks })
verdict('장면마다 물체가 그려진다', seen.scene0 >= 8 && seen.scene1 >= 2 && seen.scene2 >= 8, seen)
verdict('장면 0에 잔상이 켜진다', seen.afterimage, seen)
verdict('끝에는 검게 덮이고 밝기 한 겹이 걷힌다', end.cover === 1 && end.tint === 0, { cover: end.cover, tint: end.tint })
verdict('페이지 오류가 없다', errors.length === 0, errors.slice(0, 3))
console.log(`찍은 것 ${String(taken.size)}/${String(SHOTS.length)}`)

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
