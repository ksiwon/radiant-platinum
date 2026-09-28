// 진단 — **신수유적 벽글이 안농 글꼴로 뜨는가** (PARITY §6.8 · `ScrCmd_MessageUnown`)
//
//     node tools/e2e/_unown.mjs [--headed]
//
// 방 1(맵 226)의 벽글 (5,1) 아래에서 북쪽으로 A. 대사창에 안농 글리프가 놓이고 A로 닫히는지 본다.
// 읽는 것: `data-talk` · 대사창의 글리프 칸 수(롬 글은 안 읽는다)
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/unown')
mkdirSync(OUT, { recursive: true })
const args = process.argv.slice(2)
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
const results = []
const verdict = (name, ok, detail) => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }
const tap = async (key = 'KeyZ') => { await page.keyboard.down(key); await page.waitForTimeout(120); await page.keyboard.up(key); await page.waitForTimeout(400) }

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="frontier"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
const settle = async () => {
  await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(3000)
}
await settle()
await page.evaluate(async () => {
  const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
  const { warpTo } = await import('/src/app/devWarp.ts')
  const cp = CHECKPOINTS.find((c) => c.id === 'frontier')
  await warpTo({ ...cp, id: 'unown-wall', map: 226, spot: { kind: 'tile', x: 5, z: 2, facing: Math.PI } })
})
await settle()
await tap()
await page.waitForTimeout(1500)
const shown = await page.evaluate(() => ({
  talk: document.documentElement.dataset.talk === '1',
  glyphs: [...document.querySelectorAll('span[aria-hidden]')].filter((s) => s.style.backgroundImage.includes('unownFont')).length,
}))
await page.screenshot({ path: resolve(OUT, 'room1.png') })
verdict('벽글이 안농 글리프로 뜬다', shown.talk && shown.glyphs > 0, shown)
// 여섯 쪽(\r)에 `WaitButton` 하나 — 일곱 번이면 닫혀야 한다
let presses = 0
let after = true
for (; presses < 20 && after; presses++) {
  await tap()
  after = await page.evaluate(() => document.documentElement.dataset.talk === '1')
}
verdict('A로 넘겨 닫힌다 (쪽 여섯 + 버튼 하나)', !after && presses <= 8, { talk: after, presses })
console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
