// 배틀 카메라 탐침: 실시간 rAF마다 카메라 자리 · 시퀀스 흔들림 · 시퀀스 카메라 유무를 적는다
import { createServer as netServer } from 'node:net'
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const freePort = () => new Promise((d) => { const s = netServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => { d(port) }) }) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const vite = await startVite(await freePort())
const browser = await chromium.launch({ args: gpuArgs('webgpu') })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
page.setDefaultNavigationTimeout(600_000)
try {
  await page.goto(vite.url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 400_000 })
  for (let i = 0; ; i++) {
    await page.keyboard.press('Backquote')
    try { await page.getByText('확인 지점').first().waitFor({ timeout: 15_000 }); break } catch (e) { if (i >= 11) throw e }
  }
  const row = page.locator('[data-checkpoint="grass"]').first()
  await row.hover(); await page.waitForTimeout(200); await row.click()
  await page.waitForURL('**/play', { timeout: 60_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
  await page.evaluate(async () => { const w = await import('/src/state/worldState.ts'); w.worldState.time.gameHour = 15 })
  await page.waitForTimeout(8000)
  await page.evaluate(async () => {
    const R = await import('/src/scene/battle/stageRefs.ts')
    const C = await import('/src/engine/battle/presentationClock.ts')
    window.__cam = []
    const tick = (n) => {
      const p = R.battleStage.position
      const raw = R.seqStage.camera ? R.seqStage.camera({ pos: [2.7, 1.5, 5], target: [0, 1, 0], fov: 30, roll: 0 }) : null
      const seqs = Object.entries(window.__fxSeqs ?? {}).filter(([, v]) => v.owner).map(([k, v]) => k + '@' + ((C.battleClock.now() - v.startedAt) * 30).toFixed(2)).join(',')
      const bx = Object.entries(R.slotBox ?? {}).map(([k, b]) => k + ':' + b.min.map((x) => x.toFixed(2)).join('/') + '~' + b.max.map((x) => x.toFixed(2)).join('/') + (R.slotRig?.[k]?.shown ? '' : '(hid)')).join(' ')
      window.__cam.push([n, p.x, p.y, p.z, R.seqStage.shake, R.seqStage.running ? 1 : 0, R.seqStage.camera ? 1 : 0, R.moveImpact.camera, R.moveImpact.t, C.battleClock.now(), raw ? raw.pos : null, seqs, bx])
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__marks = []
  })
  const mark = (s) => page.evaluate((x) => window.__marks.push([performance.now(), x]), s)
  const seen = (sel) => page.locator(sel).first().isVisible().catch(() => false)
  await mark('wild')
  await page.evaluate(async () => { await globalThis.pt.wild(403, 5, 0) })
  for (let i = 0; i < 400; i++) {
    if (await seen('[data-pilot="fight"]')) break
    if (i % 4 === 3) await page.keyboard.press('KeyZ')
    await sleep(250)
  }
  await mark('menu'); await sleep(1500)
  for (let i = 0; i < 6; i++) { await page.screenshot({ path: (process.argv[3] ?? '.') + `/idle-${i}.png` }); await sleep(150) }
  await page.keyboard.press('KeyZ'); await page.waitForSelector('[data-pilot="move-0"]', { timeout: 10000 }); await sleep(400)
  await page.keyboard.press('KeyZ'); await mark('move')
  for (let i = 0; i < 120; i++) { await sleep(250); if (await seen('[data-pilot="fight"]')) break; if (i % 6 === 5) await page.keyboard.press('KeyZ') }
  await mark('end')
  const out = await page.evaluate(() => ({ cam: window.__cam, marks: window.__marks }))
  writeFileSync(process.argv[2] ?? 'cam.json', JSON.stringify(out))
  console.log('frames', out.cam.length)
} catch (e) { console.error('실패', e) } finally { await browser.close(); vite.child.kill() }
