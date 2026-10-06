// 시퀀스 탐침: 챔피언전(D13-garchomp와 같은 준비)에서 한카리아스가 기술을 쓰는 동안 rAF마다 시퀀스 무대 값을 적는다
//   node tools/reels/seqProbe.mjs [out.json] [--force=407]
// 실시간으로 돈다(가상 시계 없음). `--force=기술`이면 한카리아스의 기술 넷을 그 기술로 메모리에서 바꾼다
import { createServer as netServer } from 'node:net'
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const freePort = () => new Promise((d) => { const s = netServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => { d(port) }) }) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '.audit/seqprobe-ew407.json'
const force = Number((process.argv.find((a) => a.startsWith('--force=')) ?? '--force=0').slice(8))
const vite = await startVite(await freePort())
const browser = await chromium.launch({ args: gpuArgs('webgpu') })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
page.setDefaultNavigationTimeout(600_000)
const logs = []
page.on('console', (m) => { const t = m.text(); if (t.includes('[fx]')) logs.push([Date.now(), t]) })
const seen = (sel) => page.locator(sel).first().isVisible().catch(() => false)
try {
  await page.goto(vite.url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 400_000 })
  for (let i = 0; ; i++) {
    await page.keyboard.press('Backquote')
    try { await page.getByText('확인 지점').first().waitFor({ timeout: 15_000 }); break } catch (e) { if (i >= 11) throw e }
  }
  const row = page.locator('[data-checkpoint="mart8"]').first()
  await row.hover(); await page.waitForTimeout(200); await row.click()
  await page.waitForURL('**/play', { timeout: 60_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
  await page.evaluate(async ([c, m]) => {
    const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
    const { warpTo } = await import('/src/app/devWarp.ts')
    const base = CHECKPOINTS.find((x) => x.id === c)
    await warpTo({ ...base, id: `${c}>${String(m)}`, map: m, spot: { kind: 'warp', index: 1 } })
  }, ['mart8', 185])
  await page.waitForFunction(async () => (await import('/src/engine/map/world.ts')).world.mapId === 185, null, { timeout: 120_000 })
  await page.waitForTimeout(6000)
  console.log(JSON.stringify(await page.evaluate(`(async()=>{const {loadTrainers}=await import('/src/data/gameData.ts');const t=(await loadTrainers()).get(267);const i=t.party.findIndex((m)=>m.species===445);if(i>0){const [m]=t.party.splice(i,1);t.party.unshift(m)}${force ? `t.party[0].moves=[${force},${force},${force},${force}];` : ''}return t.party.map((m)=>[m.species,m.moves])})()`)))
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(3000); await page.keyboard.up('ArrowUp'); await page.waitForTimeout(600)
  // 메뉴까지
  for (let i = 0; i < 1200; i++) {
    if (await seen('[data-pilot="fight"]')) break
    if (await seen('[data-pilot="move-0"]')) { await page.keyboard.press('KeyX'); await page.waitForTimeout(500); continue }
    if (i % 5 === 4) await page.keyboard.press('KeyZ')
    await page.waitForTimeout(250)
  }
  await page.waitForSelector('[data-pilot="fight"]', { timeout: 10_000 })
  await page.waitForTimeout(300)
  // 탐침 설치
  await page.evaluate(async () => {
    const R = await import('/src/scene/battle/stageRefs.ts')
    const C = await import('/src/engine/battle/presentationClock.ts')
    const B = await import('/src/state/battleStore.ts')
    window.__log = []
    window.__t0 = performance.now()
    const base = { pos: [2.7, 1.5, 5], target: [0, 1, 0], fov: 30, roll: 0 }
    const r3 = (a) => a && a.map((x) => Math.round(x * 1000) / 1000)
    const tick = () => {
      const now = C.battleClock.now()
      const S = R.seqStage
      const seqs = {}
      for (const [k, v] of Object.entries(window.__fxSeqs ?? {})) seqs[k] = { startedAt: v.startedAt, frames: v.frames, usesCamera: v.usesCamera, cams: v.cams, owner: v.owner, slot: v.slot, f: Math.round((now - v.startedAt) * 30 * 100) / 100 }
      let cam = null
      try { const c = S.camera ? S.camera(base) : null; cam = c ? { pos: r3(c.pos), target: r3(c.target), fov: c.fov, roll: c.roll } : null } catch (e) { cam = { err: String(e) } }
      const lm = B.useBattleStore.getState().view?.lastMove ?? null
      const bodies = {}
      for (const [s, b] of Object.entries(S.body)) bodies[s] = b ? { vis: b.visible, f: Math.round(b.frame * 100) / 100, off: r3(b.offset), mot: b.motion ? b.motion.name : null } : null
      const rigs = {}
      for (const [s, g] of Object.entries(R.slotRig)) rigs[s] = { shown: g.shown, root: !!g.root }
      window.__log.push({
        ms: Math.round(performance.now() - window.__t0), now: Math.round(now * 1000) / 1000,
        running: S.running, owner: S.owner ? S.owner.description : null, hasCam: S.camera !== null, camRet: cam,
        back: S.back ? { c: r3(S.back.color), a: S.back.alpha } : null, shake: S.shake, hide: Object.keys(S.hide),
        bpos: r3(R.battleStage.position.toArray()), btgt: r3(R.battleStage.target.toArray()), bfov: R.battleStage.fov,
        lastMove: lm ? { move: lm.move, by: lm.by, to: lm.to, seq: lm.seq } : null, seqs, bodies, rigs,
        moveImpactT: R.moveImpact.t, mvCam: R.moveImpact.camera,
      })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.keyboard.press('KeyZ'); await page.waitForSelector('[data-pilot="move-0"]', { timeout: 10000 }); await page.waitForTimeout(400)
  await page.keyboard.press('KeyZ')
  const t0 = Date.now()
  // 한카리아스 기술 시퀀스(ew407)가 끝나고 몇 초 지날 때까지
  let doneAt = null
  for (let i = 0; i < 400; i++) {
    await sleep(250)
    const st = await page.evaluate(() => {
      const s = window.__fxSeqs?.ew407
      const C = window.__log.at(-1)
      return s && C ? { f: (C.now - s.startedAt) * 30, frames: s.frames } : null
    })
    if (st && st.f > st.frames + 45 + 150 && doneAt === null) doneAt = Date.now()
    if (doneAt !== null && Date.now() - doneAt > 500) break
    if (Date.now() - t0 > 90_000 && !st) { console.log('90초가 지나도 ew407이 안 돈다'); break }
    if (i % 8 === 7 && !(await seen('[data-pilot="fight"]'))) await page.keyboard.press('KeyZ')
  }
  const log = await page.evaluate(() => window.__log)
  writeFileSync(out, JSON.stringify({ force, console: logs, log }))
  console.log('frames', log.length, 'fx logs', logs.length)
} catch (e) { console.error('실패', e) } finally { await browser.close(); vite.child.kill() }
