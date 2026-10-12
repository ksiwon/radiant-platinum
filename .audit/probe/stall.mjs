// 2026-10-12 gaps-perf — 맵 172에서 걸을 때 멈춘 프레임마다 그 안에서 무엇이 돌았는지 귀속한다
//   node .audit/probe/stall.mjs <라벨> [걷는 초=60] [포트=5402]
// 읽는 것: rAF 간격 · long-animation-frame(스크립트 귀속) · longtask · GPUDevice 생성 호출(동기 파이프라인 · 셰이더 · 텍스처 · 업로드)
//   · fetch/resource · CDP 트레이싱(v8.gc · 메인 스레드 이벤트). 멈춘 프레임 창에 겹친 것을 줄마다 적는다.
// 절대 시간은 기계 부하에 흔들린다 — 그래서 「그 창에서 무엇이 얼마나 돌았나」의 귀속을 본다.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gpuArgs } from '../../tools/gpuFlags.mjs'
import { openTitle, warpTo, settle, marks } from '../../tools/saves/common.mjs'
const label = process.argv[2] ?? 'run'
const WALK_S = Number(process.argv[3] ?? 60)
const URL = `http://localhost:${process.argv[4] ?? 5402}`
const OUT = resolve(import.meta.dirname, '../out')
const GAP = 250
const INIT = `(() => {
  const g = globalThis.__st = { hb: [], iv: [], stk: [], calls: [], gaps: [], loaf: [], lt: [], res: [] }
  const wrap = (P, name, tag) => {
    const f = P && P[name]; if (!f) return
    P[name] = function (...a) {
      const t = performance.now()
      try { return f.apply(this, a) } finally {
        const d = performance.now() - t
        if (d >= 2) g.calls.push([t, d, tag, (a[0] && a[0].label) || null])
      }
    }
  }
  const D = globalThis.GPUDevice && GPUDevice.prototype
  for (const n of ['createRenderPipeline', 'createShaderModule', 'createTexture', 'createBuffer', 'createBindGroup', 'createComputePipeline', 'createTextureView']) wrap(D, n, n)
  const Q = globalThis.GPUQueue && GPUQueue.prototype
  for (const n of ['writeTexture', 'writeBuffer', 'copyExternalImageToTexture', 'submit']) wrap(Q, n, 'q.' + n)
  const a = D && D.createRenderPipelineAsync
  if (a) D.createRenderPipelineAsync = function (d) { g.calls.push([performance.now(), 0, 'asyncReq', (d && d.label) || null]); if (g.stk.length < 20000) g.stk.push([performance.now(), (d && d.label) || null, (new Error().stack || '').split(String.fromCharCode(10)).slice(2, 16).map((x) => x.trim().split('?v=')[0].slice(0, 110)).join(' < ')]); return a.call(this, d) }
  const cb = globalThis.createImageBitmap
  globalThis.createImageBitmap = function (...x) { const t = performance.now(); return cb.apply(this, x).finally(() => g.calls.push([t, performance.now() - t, 'imageBitmap', null])) }
  const fe = globalThis.fetch
  globalThis.fetch = function (u, ...x) { const t = performance.now(); const s = String(u && u.url || u); return fe.call(this, u, ...x).finally(() => g.res.push([t, performance.now() - t, s.slice(-80)])) }
  g.hb = []
  try {
    const w = new Worker(URL.createObjectURL(new Blob(['let l=performance.timeOrigin+performance.now();setInterval(()=>{const n=performance.timeOrigin+performance.now();if(n-l>60)postMessage([l,n-l]);l=n},5)'])))
    w.onmessage = (e) => { const [l, d] = e.data; g.hb.push([l - performance.timeOrigin, d]) }
  } catch (e) {}
  let last = performance.now()
  const tick = (n) => { const gap = n - last; last = n; g.iv.push([n, gap]); if (gap > ${GAP}) g.gaps.push([n - gap, gap]); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) g.loaf.push({ s: e.startTime, d: e.duration, block: e.blockingDuration, render: e.renderStart, style: e.styleAndLayoutStart, scripts: (e.scripts || []).map((x) => [x.invoker, x.sourceURL && x.sourceURL.slice(-60), x.sourceFunctionName, Math.round(x.duration), x.forcedStyleAndLayoutDuration && Math.round(x.forcedStyleAndLayoutDuration)]) }) }).observe({ type: 'long-animation-frame', buffered: true }) } catch (e) { g.loafErr = String(e) }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) g.lt.push([e.startTime, e.duration]) }).observe({ type: 'longtask', buffered: true }) } catch (e) {}
})()`
const browser = await chromium.launch({ headless: true, args: gpuArgs('webgpu') })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
page.setDefaultNavigationTimeout(300_000); page.setDefaultTimeout(120_000)
await page.addInitScript(INIT)
page.on('pageerror', (e) => console.log('pageerror', String(e.message).slice(0, 160)))
const out = { label, walkS: WALK_S, cpuLoadBefore: (await import('node:child_process')).execSync('powershell -c "(Get-CimInstance Win32_Processor).LoadPercentage"').toString().trim() }
const cdp = await page.context().newCDPSession(page)
const events = []
cdp.on('Tracing.dataCollected', (d) => events.push(...d.value))
try {
  await openTitle(page, URL)
  await warpTo(page, { id: 'league', map: 175 })
  await settle(page)
  await page.evaluate(async () => {
    const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
    const { warpTo } = await import('/src/app/devWarp.ts')
    const base = CHECKPOINTS.find((c) => c.id === 'league')
    await warpTo({ ...base, id: 'league>172', map: 172, spot: { kind: 'warp', index: 0 } })
  })
  await page.waitForFunction(async () => (await import('/src/engine/map/world.ts')).world.mapId === 172, null, { timeout: 120_000 })
  const s = await settle(page)
  out.settle = s
  // 걷기 시작 전에 5초 더 둬 처음 몰리는 비동기가 끝나게 한다
  // 처음 몰리는 비동기 · 청크 로드가 가라앉을 때까지 — 간격 250ms 넘는 프레임이 4초 동안 없을 때 (최대 90초)
  const q0 = Date.now()
  for (;;) {
    await page.waitForTimeout(1000)
    const quiet = await page.evaluate(() => { const g = globalThis.__st; const n = performance.now(); return !g.gaps.some((x) => x[0] + x[1] > n - 4000) && !g.calls.some((c) => c[2] === 'asyncReq' && c[0] > n - 4000) })
    if (quiet || Date.now() - q0 > 90_000) { out.quietAfterMs = Date.now() - q0; out.quiet = quiet; break }
  }
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8.gc,blink.user_timing,disabled-by-default-v8.gc,toplevel', transferMode: 'ReportEvents' })
  if (process.env.MAT) {
    await page.evaluate(async () => {
      const { sceneRefs } = await import('/src/scene/sceneRefs.ts')
      let sc = sceneRefs.player; while (sc.parent) sc = sc.parent
      const log = globalThis.__mat = []
      const mats = new Map()
      sc.traverse((o) => { for (const m of [o.material].flat()) if (m) mats.set(m.uuid, m) })
      // needsUpdate 세터를 감싼다
      let proto = [...mats.values()][0]; while (proto && !Object.getOwnPropertyDescriptor(proto, 'needsUpdate')) proto = Object.getPrototypeOf(proto)
      const d = Object.getOwnPropertyDescriptor(proto, 'needsUpdate')
      Object.defineProperty(proto, 'needsUpdate', { configurable: true, get: d.get, set(v) {
        if (v === true) log.push([performance.now(), 'needsUpdate', this.name, this.transparent, this.depthWrite, this.type, (new Error().stack || '').split(String.fromCharCode(10)).slice(2, 6).map((x) => x.trim().replace(/http:..localhost:\d+/, '')).join(' < ')])
        return d.set.call(this, v)
      } })
      // 의심 재질 셋의 깃발을 프레임마다 본다
      const watch = [...mats.values()].filter((m) => /SeaWater|DoorOuter_02/.test(m.name) || m.type === 'MeshStandardMaterial' && !m.name)
      const prev = new Map()
      const tick = () => {
        for (const m of mats.size ? watch : []) {
          const k = [m.transparent, m.depthWrite, m.opacity.toFixed(2), m.alphaTest.toFixed(2), m.side, m.version].join()
          if (prev.get(m.uuid) !== k) { log.push([performance.now(), 'flags', m.name || m.type, k]); prev.set(m.uuid, k) }
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      log.push([performance.now(), 'watching', watch.length, mats.size])
    })
  }
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start')
  const t0 = await page.evaluate(() => { const t = performance.now(); performance.mark('stallStart'); globalThis.__st.t0 = t; return t })
  const t1 = Date.now()
  const dirs = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']
  const tiles = []
  let di = 0
  while (Date.now() - t1 < WALK_S * 1000) {
    const key = dirs[di % 4]
    if (!process.env.STAND) await page.keyboard.down(key)
    for (let i = 0; i < 10 && Date.now() - t1 < WALK_S * 1000; i++) await page.waitForTimeout(300)
    if (!process.env.STAND) await page.keyboard.up(key)
    tiles.push((await marks(page)).tile)
    di++
  }
  out.tiles = tiles
  const prof = (await cdp.send('Profiler.stop')).profile
  const samp = []
  {
    let tt = prof.startTime
    const byId2 = new Map(prof.nodes.map((n) => [n.id, n]))
    prof.samples.forEach((id, i) => { tt += prof.timeDeltas[i] ?? 0; const cf = byId2.get(id).callFrame; samp.push([tt, `${cf.functionName || '(anon)'}`]) })
  }
  {
    const self = {}
    const byId = new Map(prof.nodes.map((n) => [n.id, n]))
    const dts = prof.timeDeltas
    prof.samples.forEach((id, i) => {
      const n = byId.get(id); const cf = n.callFrame
      const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber}`
      self[k] = (self[k] ?? 0) + (dts[i] ?? 0) / 1000
    })
    out.profileTop = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(0)}ms ${k}`)
  }
  await cdp.send('Tracing.end')
  await new Promise((r) => cdp.once('Tracing.tracingComplete', r))
  const g = await page.evaluate(() => globalThis.__st)
  // 트레이스 시계 맞추기: performance.mark 'stallStart'
  const mk = events.find((e) => e.name === 'stallStart' && e.cat.includes('user_timing'))
  const trBase = mk ? mk.ts : null // µs
  out.traceAligned = trBase !== null
  const inWin = (a, b, w) => a < w[1] && a + b > w[0]
  const gaps = g.gaps.filter((x) => x[0] >= t0)
  out.gapCount = gaps.length
  out.gaps = gaps.map(([start, gap]) => {
    const w = [start, start + gap]
    const near = (arr, f) => arr.filter((x) => f(x))
    const calls = near(g.calls, (c) => c[0] + c[1] >= w[0] && c[0] <= w[1])
    const byTag = {}
    for (const c of calls) { const b = (byTag[c[2]] ??= { n: 0, ms: 0, max: 0, labels: [] }); b.n++; b.ms += c[1]; b.max = Math.max(b.max, c[1]); if (b.labels.length < 3 && c[3]) b.labels.push(c[3]) }
    for (const k of Object.keys(byTag)) { byTag[k].ms = +byTag[k].ms.toFixed(0); byTag[k].max = +byTag[k].max.toFixed(0) }
    const loaf = g.loaf.filter((l) => l.s < w[1] && l.s + l.d > w[0]).map((l) => ({ d: Math.round(l.d), block: Math.round(l.block), render: Math.round(l.render - l.s), style: Math.round(l.style - l.s), scripts: l.scripts }))
    const lt = g.lt.filter((l) => l[0] < w[1] && l[0] + l[1] > w[0]).map((l) => Math.round(l[1]))
    const res = g.res.filter((r) => r[0] + r[1] >= w[0] && r[0] <= w[1]).length
    // 트레이스: 창에 겹친 메인 스레드 이벤트를 이름별 합으로
    let tr = null
    if (trBase !== null) {
      const lo = trBase + (w[0] - t0) * 1000, hi = trBase + (w[1] - t0) * 1000
      const sum = {}
      for (const e of events) {
        if (e.ph !== 'X' || e.dur === undefined || e.dur < 5000) continue
        if (e.ts + e.dur < lo || e.ts > hi) continue
        const k = e.name; const b = (sum[k] ??= { n: 0, ms: 0 }); b.n++; b.ms += e.dur / 1000
      }
      tr = Object.entries(sum).sort((a, b) => b[1].ms - a[1].ms).slice(0, 8).map(([k, v]) => `${k}×${v.n}=${v.ms.toFixed(0)}ms`)
    }
    let prf = null
    if (trBase !== null) {
      const lo = trBase + (w[0] - t0) * 1000, hi = trBase + (w[1] - t0) * 1000
      const c = {}
      for (const [tt, nm] of samp) if (tt >= lo && tt <= hi) c[nm] = (c[nm] ?? 0) + 1
      prf = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}=${v}`)
    }
    const hb = g.hb.filter((x) => x[0] < w[1] && x[0] + x[1] > w[0]).map((x) => Math.round(x[1]))
    return { prf, workerGaps: hb, at: Math.round(start - t0), gap: Math.round(gap), calls: byTag, loaf, longtask: lt, fetches: res, trace: tr }
  })
  out.gcTotals = (() => {
    const gcs = events.filter((e) => /GC|MajorGC|MinorGC/.test(e.name) && e.ph === 'X')
    const sum = {}
    for (const e of gcs) { const b = (sum[e.name] ??= { n: 0, ms: 0, max: 0 }); b.n++; b.ms += e.dur / 1000; b.max = Math.max(b.max, e.dur / 1000) }
    return sum
  })()
  out.callTotals = (() => {
    const sum = {}
    for (const c of g.calls) if (c[0] >= t0) { const b = (sum[c[2]] ??= { n: 0, ms: 0, max: 0 }); b.n++; b.ms += c[1]; b.max = Math.max(b.max, c[1]) }
    return sum
  })()
  out.asyncTimeline = g.calls.filter((c) => c[2] === 'asyncReq' && c[0] >= t0).map((c) => [Math.round(c[0] - t0), c[3].replace(/_\d+$/, '')])
  if (process.env.MAT) out.mat = (await page.evaluate(() => globalThis.__mat)).filter((x) => x[0] >= t0).map((x) => [Math.round(x[0] - t0), ...x.slice(1)])
  {
    const iv = g.iv.filter((x) => x[0] >= t0).map((x) => x[1]).sort((a, b) => a - b)
    out.frames = { n: iv.length, med: Math.round(iv[iv.length >> 1] ?? 0), p95: Math.round(iv[Math.floor(iv.length * 0.95)] ?? 0), max: Math.round(iv[iv.length - 1] ?? 0) }
    out.cpuLoadAfter = (await import('node:child_process')).execSync('powershell -c "(Get-CimInstance Win32_Processor).LoadPercentage"').toString().trim()
  }
  out.stk = g.stk.filter((x) => x[0] >= t0).slice(0, 7)
  { const hb = g.hb.filter((x) => x[0] >= t0); out.workerStalls = { n: hb.length, over100: hb.filter((x) => x[1] > 100).length, max: Math.round(Math.max(0, ...hb.map((x) => x[1]))) } }
  out.loafN = g.loaf.filter((l) => l.s >= t0).length
  out.loafErr = g.loafErr ?? null
  out.loafOver200 = g.loaf.filter((l) => l.s >= t0 && l.d > 200).length
} finally {
  writeFileSync(resolve(OUT, `stall-${label}.json`), JSON.stringify(out, null, 1))
  console.log(JSON.stringify({ ...out, gaps: undefined, tiles: undefined, gcTotals: undefined, asyncTimeline: undefined }))
  for (const k of out.stk ?? []) console.log('STK', Math.round(k[0] - t0), k[1], k[2])
  console.log('SUMMARY', label, 'cpu', out.cpuLoadBefore, out.cpuLoadAfter, 'quietAfter', out.quietAfterMs, 'frames', JSON.stringify(out.frames), 'worker', JSON.stringify(out.workerStalls), 'gaps', out.gapCount, 'async', out.asyncTimeline?.length, 'loaf>200', out.loafOver200)
  console.log('ASYNC', JSON.stringify(out.asyncTimeline))
  for (const m of out.mat ?? []) console.log('MAT', JSON.stringify(m))
  for (const x of out.gaps ?? []) console.log(x.at, x.gap, JSON.stringify(x.calls), 'loaf', JSON.stringify(x.loaf.map((l) => [l.d, l.block, l.render, l.scripts.map((q) => q[1]?.split('/').pop() + ':' + q[2] + ':' + q[3]).join('|')])), 'prf', JSON.stringify(x.prf), 'worker', JSON.stringify(x.workerGaps), 'lt', x.longtask, 'fetch', x.fetches, (x.trace ?? []).slice(0, 5).join(' ; '))
  await browser.close()
}
