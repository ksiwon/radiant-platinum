// 진단 — **명예의 전당 등록 장면이 원작 창 · 배경 · 3D로 서는가** (PARITY §8.11 · `cutscenes/hall_of_fame.c`)
//
//     node tools/e2e/_hallOfFame.mjs [--headed]
//
// 확인 지점 `frontier`의 파티로 등록 장면을 열고 걸음마다 찍는다. 읽는 것: 장면 스토어의 걸음(`beat`) ·
// 검정 판(`clip-path`)의 구멍 · 리포트 대사창의 글. 창 좌표는 `hallOfFameChoreo`가 낸 값과 맞대고,
// 그림은 사람이 본다 (shots/hallOfFame).
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/hallOfFame')
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
const row = page.locator('[data-checkpoint="frontier"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
  && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
await page.waitForTimeout(3000)

// ⚠️ **기다리는 식은 동기여야 한다** — `waitForFunction`에 async를 주면 약속 자체가 참이라 바로 풀린다
await page.evaluate(async () => {
  const { useMenuStore } = await import('/src/state/menuStore.ts')
  const { useHallOfFameStageStore } = await import('/src/state/hallOfFameStageStore.ts')
  const choreo = await import('/src/scene/hallOfFameChoreo.ts')
  Object.assign(globalThis, { __hof: { menu: useMenuStore, stage: useHallOfFameStageStore, choreo } })
  useMenuStore.getState().openHallOfFame(false)
})

/** 그 걸음이 될 때까지 기다렸다가 `after`밀리초 뒤에 찍는다 */
const at = async (beat, after, name) => {
  await page.waitForFunction((b) => globalThis.__hof.stage.getState().beat === b, beat, { timeout: 60_000, polling: 16 })
  await page.waitForTimeout(after)
  const seen = await page.evaluate(() => {
    const { hofWindow, HOF_FRAME_MS } = globalThis.__hof.choreo
    const s = globalThis.__hof.stage.getState()
    const shade = document.querySelector('[class*="shade"]')
    return {
      beat: s.beat,
      want: hofWindow(s.beat, (performance.now() - s.since) / HOF_FRAME_MS, s.selected & 1),
      clip: shade ? getComputedStyle(shade).clipPath : null,
    }
  })
  await page.screenshot({ path: resolve(OUT, `${name}.png`) })
  return seen
}

const hold = await at('monHold', 200, '1-mon0')
verdict('첫 마리 — 창이 왼쪽 (24, 32)–(120, 160)에 뚫린다', hold.beat === 'monHold'
  && JSON.stringify(hold.want) === JSON.stringify([24, 32, 120, 160]) && /evenodd/.test(hold.clip ?? ''), hold)
const out = await at('monOut', 230, '2-mon0-out')
verdict('나갈 때 창이 위로 걷힌다', out.want[1] === 0 && out.want[3] < 160, out)
const second = await at('monHold', 200, '3-mon1')
verdict('둘째 마리 — 창이 오른쪽이다', JSON.stringify(second.want) === JSON.stringify([136, 32, 232, 160]), second)
await at('playerHold', 100, '4-player')
await at('partyHold', 150, '5-party')
const conf = await at('confetti', 1500, '6-confetti')
verdict('파티 장면 — 창이 가로 전체 (0, 24)–(255, 168)', JSON.stringify(conf.want) === JSON.stringify([0, 24, 255, 168]), conf)
await page.keyboard.down('KeyZ'); await page.waitForTimeout(120); await page.keyboard.up('KeyZ')
await at('wipe', 200, '7-wipe')
await page.waitForFunction(() => globalThis.__hof.stage.getState().beat === 'saved', null, { timeout: 60_000, polling: 16 })
await page.waitForTimeout(100)
const said = await page.evaluate(() => document.querySelector('[class*="dialog"]')?.textContent ?? '')
await page.screenshot({ path: resolve(OUT, '8-saved.png') })
verdict('리포트 글이 롬 뱅크 213의 16번이다', /리포트를 꼼꼼히 기록했다/.test(said), { said: said.slice(0, 120) })
const t0 = Date.now()
await page.waitForFunction(() => globalThis.__hof.menu.getState().top === 'credits', null, { timeout: 10_000, polling: 16 })
verdict('누르지 않아도 크레딧으로 넘어간다 (18 + 8프레임 ≈ 0.43초)', Date.now() - t0 < 1500, { ms: Date.now() - t0 })

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
