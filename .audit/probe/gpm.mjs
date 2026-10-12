// 2026-10-12 gaps-perf 측정 — F2(첫 프레임·동기 컴파일) · F3(맵 172 파이프라인) · F1(도감 5회) · devWarp
//   node .audit/probe/gpm.mjs f2 <라벨>   (서버는 5405에 따로 떠 있다)
// 읽는 것: GPUDevice.createRenderPipeline(동기)/Async 호출을 감싼 기록 · rAF 간격 · 제품이 export하는 world/menuStore
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gpuArgs } from '../../tools/gpuFlags.mjs'
import { openTitle, warpTo, settle } from '../../tools/saves/common.mjs'
const URL = 'http://localhost:5405'
const mode = process.argv[2]
const label = process.argv[3] ?? 'run'
const OUT = resolve(import.meta.dirname, '../out')
const INIT = `(() => {
  const g = globalThis.__gp = { sync: [], asy: [], gaps: [] }
  const P = globalThis.GPUDevice && GPUDevice.prototype
  if (P) {
    const s = P.createRenderPipeline
    P.createRenderPipeline = function (d) { const t = performance.now(); try { return s.call(this, d) } finally { g.sync.push([t, performance.now() - t, d && d.label || null]) } }
    const a = P.createRenderPipelineAsync
    P.createRenderPipelineAsync = function (d) { g.asy.push([performance.now(), d && d.label || null]); return a.call(this, d) }
  }
  let last = performance.now()
  const tick = (n) => { const gap = n - last; last = n; if (gap > 100) g.gaps.push([n, gap]); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})()`
const browser = await chromium.launch({ headless: true, args: gpuArgs('webgpu') })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
page.setDefaultNavigationTimeout(300_000); page.setDefaultTimeout(120_000)
await page.addInitScript(INIT)
page.on('pageerror', (e) => console.log('pageerror', String(e.message).slice(0, 160)))
const mark = () => page.evaluate(() => { const g = globalThis.__gp; const t = performance.now(); g.m = t; return t })
const dump = (since) => page.evaluate((m) => {
  const g = globalThis.__gp
  const sy = g.sync.filter((x) => x[0] >= m)
  return {
    sync: sy.length, syncMs: +sy.reduce((a, x) => a + x[1], 0).toFixed(0), syncMax: +Math.max(0, ...sy.map((x) => x[1])).toFixed(0),
    async: g.asy.filter((x) => x[0] >= m).length,
    gaps: g.gaps.filter((x) => x[0] >= m).map((x) => [Math.round(x[0] - m), Math.round(x[1])]),
  }
}, since)
const out = { mode, label }
try {
  await openTitle(page, URL)
  if (mode === 'f2') {
    const m = await mark()
    const t0 = Date.now()
    await warpTo(page, { id: 'league', map: 175 })
    out.warpToMs = Date.now() - t0
    const s = await settle(page)
    out.settleMs = Date.now() - t0; out.settle = s
    await page.waitForTimeout(3000)
    Object.assign(out, await dump(m))
  } else if (mode === 'f3' || mode === 'f3w') {
    await warpTo(page, { id: 'league', map: 175 })
    await settle(page)
    await page.evaluate(async () => {
      const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
      const { warpTo } = await import('/src/app/devWarp.ts')
      const base = CHECKPOINTS.find((c) => c.id === 'league')
      await warpTo({ ...base, id: 'league>172', map: 172, spot: { kind: 'warp', index: 0 } })
    })
    await page.waitForFunction(async () => (await import('/src/engine/map/world.ts')).world.mapId === 172, null, { timeout: 120_000 })
    const m = await mark()
    if (mode === 'f3w') {
      // 걷는 대신 반 초마다 한 칸 반씩 동쪽 · 남쪽으로 번갈아 옮긴다 — 지역 집합 · 청크가 갈리는 길
      const t1 = Date.now()
      let i = 0
      while (Date.now() - t1 < Number(process.argv[4] ?? 40_000)) {
        await page.evaluate(async (k) => {
          const w = await import('/src/state/worldState.ts')
          const p = w.worldState.player
          const dir = Math.floor(k / 20) % 2 === 0 ? 1 : -1
          p.position.x += 1.5 * dir; p.prevPosition.copy(p.position)
        }, i++)
        await page.waitForTimeout(500)
      }
    } else await page.waitForTimeout(Number(process.argv[4] ?? 40_000))
    const g = await page.evaluate((m) => {
      const g = globalThis.__gp
      return { sync: g.sync.filter((x) => x[0] >= m).map((x) => [Math.round(x[0] - m), +x[1].toFixed(1), x[2]]), asy: g.asy.filter((x) => x[0] >= m).map((x) => [Math.round(x[0] - m), x[1]]) }
    }, m)
    out.syncN = g.sync.length; out.asyN = g.asy.length
    // 초 단위 묶음
    const bins = {}
    for (const [t, , l] of g.sync) { const b = Math.floor(t / 1000); (bins[b] ??= { s: 0, a: 0 }).s++ }
    for (const [t] of g.asy) { const b = Math.floor(t / 1000); (bins[b] ??= { s: 0, a: 0 }).a++ }
    out.bins = bins
    const lab = {}
    for (const [, l] of g.asy) lab[l] = (lab[l] ?? 0) + 1
    out.asyLabels = Object.entries(lab).sort((a, b) => b[1] - a[1]).slice(0, 25)
    out.raw = g
    Object.assign(out, await dump(m))
  } else if (mode === 'f1') {
    await warpTo(page, { id: 'center', map: null })
    await settle(page)
    await page.evaluate(() => { globalThis.pt.dex(479, 25, 1) })
    out.opens = []
    for (let i = 0; i < 5; i++) {
      await page.evaluate(async () => { (await import('/src/state/menuStore.ts')).useMenuStore.getState().open('pokedex') })
      await page.waitForTimeout(9000)
      out.opens.push(await page.evaluate(() => [...document.querySelectorAll('[data-mon-viewport]')].map((e) => e.getAttribute('data-mon-viewport'))))
      await page.evaluate(async () => { (await import('/src/state/menuStore.ts')).useMenuStore.getState().closeAll() })
      await page.waitForTimeout(1500)
    }
  }
} finally {
  writeFileSync(resolve(OUT, `gpm-${mode}-${label}.json`), JSON.stringify(out, null, 1))
  console.log(JSON.stringify({ ...out, raw: undefined, asyLabels: undefined }))
  await browser.close()
}
