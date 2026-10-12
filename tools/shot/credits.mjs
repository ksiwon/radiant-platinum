// 엔딩 크레딧 3D 장면을 찍는다 — `node tools/shot/credits.mjs '[[틱,"이름"],…]'` (틱은 오름차순) · `flow`를 셋째 인자로 주면 키 흐름(건너뛰기 → The End → 만든 사람 → 타이틀)을 잰다.
// 개발 서버가 열려 있는 크레딧 화면의 `__credits` 손잡이(`ui/menu/CreditsScreen` — 개발 빌드에만 있다)로 시계를 멈추고 앞으로 돌린다. 작업트리에는 node_modules가 없어 본 트리의 vite를 쓴다.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { gpuArgs } from '../gpuFlags.mjs'
const OUT = new URL('../../shots/credits', import.meta.url).pathname.slice(1)
mkdirSync(OUT, { recursive: true })
// 작업트리에는 node_modules가 없다 — 본 트리의 vite를 이 작업트리에서 돌린다 (설정 · 소스는 여기 것)
const VITE = new URL('../../../../../node_modules/vite/bin/vite.js', import.meta.url).pathname.slice(1)
const child = spawn(process.execPath, [VITE, '--port', '5408', '--strictPort'], { cwd: new URL('../../', import.meta.url).pathname.slice(1), stdio: 'ignore', env: { ...process.env, VITE_CACHE_DIR: 'node_modules/.vite-credits' } })
const vite = { child, url: 'http://localhost:5408' }
for (;;) { const ok = await new Promise((r) => { const s = connect({ port: 5408, host: 'localhost' }); s.once('connect', () => { s.destroy(); r(true) }); s.once('error', () => r(false)) }); if (ok) break; await new Promise((r) => setTimeout(r, 500)) }
const browser = await chromium.launch({ args: gpuArgs('webgpu') })
const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 })
page.setDefaultNavigationTimeout(240000)
const noise = []
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) noise.push(`${m.type()}: ${m.text().slice(0, 300)}`) })
page.on('pageerror', (e) => noise.push('pageerror: ' + e.message))
process.on('exit', () => vite.child.kill())
await page.goto(vite.url, { waitUntil: 'load' })
await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 120000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 60000 })
const row = page.locator('[data-checkpoint]').first()
await row.hover(); await page.waitForTimeout(200); await row.click()
await page.waitForURL('**/play', { timeout: 120000 })
await page.waitForSelector('canvas', { timeout: 240000 })
await page.waitForTimeout(8000)
await page.evaluate(async () => { const m = await import('/src/state/menuStore.ts'); m.useMenuStore.getState().open('credits') })
await page.waitForFunction(() => globalThis.__credits, null, { timeout: 120000 })
const FLOW = process.argv[3] === 'flow'
await page.evaluate((flow) => {
  if (!flow) globalThis.__credits.hold = true
  // 확인 지점의 대사창이 크레딧 위에 남는다 — 가린다 (크레딧의 것이 아니다)
  const els = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent ?? '').includes('마박사'))
  for (const e of els) { let n = e; while (n && n !== document.body && getComputedStyle(n).position !== 'fixed' && getComputedStyle(n).position !== 'absolute') n = n.parentElement; if (n && n !== document.body) n.style.display = 'none' }
}, FLOW)
if (FLOW) {
  const view = () => page.evaluate(() => { const v = globalThis.__credits?.clock.view(); return v ? [v.tick, v.scene, +v.sceneDim.toFixed(2), v.endText, v.done] : null })
  const part = () => page.evaluate(() => document.querySelector('[data-credits]')?.getAttribute('data-credits') ?? location.pathname)
  await page.waitForTimeout(3000); console.log('t3s', JSON.stringify(await view()), await part())
  await page.keyboard.press('KeyZ'); await page.waitForTimeout(100); console.log('after Z', JSON.stringify(await view()))
  await page.waitForTimeout(400); console.log('+0.5s', JSON.stringify(await view()))
  await page.waitForTimeout(1500); console.log('+2s', JSON.stringify(await view()))
  await page.keyboard.press('KeyZ'); await page.waitForTimeout(500); console.log('Z2', JSON.stringify(await view()), await part())
  await page.waitForTimeout(1500); console.log('+1.5', JSON.stringify(await view()), await part())
  await page.keyboard.press('KeyZ'); await page.waitForTimeout(1000); console.log('Z3 (end press)', JSON.stringify(await view()), await part())
  await page.waitForTimeout(1200); console.log('+', await part())
  await page.screenshot({ path: `${OUT}/maker.png` })
  await page.keyboard.press('KeyZ'); await page.waitForTimeout(4000); console.log('Z4', await part())
  console.log('NOISE', noise.length); for (const n of noise.slice(0, 30)) console.log(n)
  await browser.close(); vite.child.kill(); process.exit(0)
}
const seek = async (tick) => page.evaluate((t) => { const c = globalThis.__credits.clock; while (c.tick < t) c.step(false); return c.view() }, tick)
const shots = JSON.parse(process.argv[2] ?? '[[600,"s0a"]]')
for (const [t, name] of shots) {
  const v = await seek(t)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(name, t, JSON.stringify({ scene: v.scene, steps: v.steps, dim: v.sceneDim, photo: v.photo }))
}
console.log('NOISE', noise.length); for (const n of noise.slice(0, 30)) console.log(n)
await browser.close(); vite.child.kill()
