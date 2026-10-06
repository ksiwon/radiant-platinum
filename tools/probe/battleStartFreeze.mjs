// 배틀 시작 프리즈 탐침: 확인 지점(기본 champion)을 열어 배틀이 서는 동안 rAF 간격·longtask·CDP 프로파일을 적는다
//   node tools/probe/battleStartFreeze.mjs [--cp=champion] [--run=1] [--out=.audit/probe-freeze-champion-1.json]
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { startVite, freePort } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3)
const cp = arg('cp', 'champion')
const run = arg('run', '1')
const out = arg('out', `.audit/probe-freeze-${cp}-${run}.json`)
const vite = await startVite(await freePort())
const browser = await chromium.launch({ args: gpuArgs('webgpu') })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
page.setDefaultNavigationTimeout(600_000)
const consoleLog = []
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || t.includes('[fx]') || t.includes('배틀')) consoleLog.push([Date.now(), m.type(), t.slice(0, 300)]) })
await page.addInitScript(() => {
  window.__gaps = []; window.__long = []; window.__stage = []
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) }) }).observe({ entryTypes: ['longtask'] }) } catch {}

  // WebGPU 호출 감시: 느린 호출(>25ms)과 메서드별 누계
  window.__gpu = { slow: [], tot: {} }
  const wrapProto = (proto, names, tag) => {
    for (const n of names) {
      const f = proto?.[n]; if (typeof f !== 'function') continue
      proto[n] = function (...a) {
        const t = performance.now(); const r = f.apply(this, a); const d = performance.now() - t
        const o = (window.__gpu.tot[tag + '.' + n] ??= { n: 0, ms: 0 }); o.n++; o.ms += d
        if (d > 25) window.__gpu.slow.push({ at: Math.round(t), ms: Math.round(d), call: tag + '.' + n, label: String(a[0]?.label ?? '').slice(0, 80), size: a[0]?.size ?? null, stack: (new Error().stack ?? '').split(String.fromCharCode(10)).slice(2, 8).map((x) => x.trim().replace(/^.*[/][/][^/]+/, '')).join(' < ') })
        return r
      }
    }
  }
  // 동기/비동기 파이프라인 굽기 호출을 전부 적는다 (호출 시각 · 호출 줄)
  window.__pipe = []
  if (window.GPUDevice) for (const n of ['createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync']) {
    const f = GPUDevice.prototype[n]
    GPUDevice.prototype[n] = function (...a) {
      const st = (new Error().stack ?? '').split(String.fromCharCode(10)).slice(2, 40).map((x) => x.trim().replace(/^.*[/][/][^/]+/, '').replace(/[?]v=[0-9a-f]+/, ''))
      const src = st.filter((x) => x.includes('/src/')).slice(0, 3)
      window.__pipe.push({ t: Math.round(performance.now()), n, ap: window.__ap ? window.__ap.asyncPipelinesState().on : null, ph: window.__stage.at(-1)?.phase ?? 'off',  label: String(a[0]?.label ?? '').slice(0, 60), src, top: st.slice(0, 2) })
      return f.apply(this, a)
    }
  }
  if (window.GPUDevice) wrapProto(GPUDevice.prototype, ['createBuffer', 'createTexture', 'createShaderModule', 'createRenderPipeline', 'createComputePipeline', 'createBindGroup', 'createBindGroupLayout', 'createPipelineLayout', 'createSampler', 'createCommandEncoder', 'importExternalTexture', 'createQuerySet', 'createRenderBundleEncoder', 'pushErrorScope', 'popErrorScope'], 'dev')
  if (window.GPUQueue) wrapProto(GPUQueue.prototype, ['submit', 'writeBuffer', 'writeTexture', 'copyExternalImageToTexture'], 'q')
  if (window.GPUBuffer) wrapProto(GPUBuffer.prototype, ['mapAsync', 'getMappedRange', 'unmap'], 'buf')
  if (window.GPUTexture) wrapProto(GPUTexture.prototype, ['createView'], 'tex')
  if (window.GPUCanvasContext) wrapProto(GPUCanvasContext.prototype, ['getCurrentTexture'], 'ctx')
  let last = performance.now()
  const tick = (t) => { const g = t - last; last = t; if (g > 60) window.__gaps.push({ at: Math.round(t), gap: Math.round(g) }); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})
const res = { cp, run, stage: [], error: null }
try {
  await page.goto(vite.url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 400_000 })
  for (let i = 0; ; i++) {
    await page.keyboard.press('Backquote')
    try { await page.getByText('확인 지점').first().waitFor({ timeout: 15_000 }); break } catch (e) { if (i >= 11) throw e }
  }
  // 상태 구독 (battleStore) — 변할 때마다 시각을 적는다
  await page.evaluate(async () => {
    const B = await import('/src/state/battleStore.ts')
    let p = ''
    const log = (s) => { const st = B.useBattleStore.getState(); const k = `${st.phase}|${st.sceneReady}`; if (k !== p) { p = k; window.__stage.push({ t: Math.round(performance.now()), phase: st.phase, sceneReady: st.sceneReady, seqs: Object.keys(window.__fxSeqs ?? {}).length }) } }
    B.useBattleStore.subscribe(log)
    window.__stageT0 = performance.now()
    window.__ap = await import('/src/scene/asyncPipelines.ts')
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
  const row = page.locator(`[data-checkpoint="${cp}"]`).first()
  await row.hover(); await page.waitForTimeout(150)
  const clickPerf = await page.evaluate(() => performance.now())
  await cdp.send('Profiler.start')
  const TRACE = process.argv.includes('--trace')
  if (TRACE) await browser.startTracing(page, { screenshots: false, categories: ['devtools.timeline', 'gpu', 'gpu.dawn', 'disabled-by-default-gpu.dawn', 'gpu.service', 'viz', 'cc', 'toplevel', 'webgpu'] })
  await row.click()
  res.clickPerf = Math.round(clickPerf)
  // sceneReady까지 (최대 60초)
  const t0 = Date.now()
  let ready = false
  while (Date.now() - t0 < 90_000) {
    await page.waitForTimeout(300)
    const s = await page.evaluate(async () => { const B = await import('/src/state/battleStore.ts'); const x = B.useBattleStore.getState(); return { phase: x.phase, ready: x.sceneReady } }).catch(() => null)
    if (s && s.phase !== 'off' && s.ready) { ready = true; break }
  }
  await page.waitForTimeout(2000)
  const { profile } = await cdp.send('Profiler.stop')
  res.ready = ready
  if (TRACE) {
    const buf = await browser.stopTracing()
    const events = JSON.parse(buf.toString()).traceEvents
    const procName = new Map(), thrName = new Map()
    for (const e of events) { if (e.ph === 'M' && e.name === 'process_name') procName.set(e.pid, e.args?.name); if (e.ph === 'M' && e.name === 'thread_name') thrName.set(e.pid + ':' + e.tid, e.args?.name) }
    let t0 = Infinity
    for (const e of events) if (e.ts && e.ts < t0) t0 = e.ts
    const longest = []
    const acc = new Map()
    for (const e of events) {
      if (e.ph !== 'X' || e.dur === undefined) continue
      const k = (procName.get(e.pid) ?? e.pid) + ' / ' + (thrName.get(e.pid + ':' + e.tid) ?? e.tid) + ' / ' + e.cat + ' / ' + e.name
      const a = acc.get(k) ?? { n: 0, ms: 0, max: 0 }; a.n++; a.ms += e.dur / 1000; a.max = Math.max(a.max, e.dur / 1000); acc.set(k, a)
      if (e.dur > 200_000) longest.push({ k, startRel: Math.round((e.ts - t0) / 1000), ms: Math.round(e.dur / 1000), args: JSON.stringify(e.args ?? {}).slice(0, 200) })
    }
    // GPU 주 스레드를 1초 칸으로 쪼개 이름별 합 (래퍼 제외) — 렌더러의 긴 프레임과 맞대려고 긴 FireAnimationFrame의 시작도 적는다
    const skip = /ThreadControllerImpl|Scheduler::RunTask|ExecuteDeferredRequest|^WebGPU$|CommandBuffer|PutChanged|DawnCommands|HandleDawnCommands/
    const buckets = {}
    for (const e of events) {
      if (e.ph !== 'X' || e.dur === undefined || procName.get(e.pid) !== 'GPU Process' || thrName.get(e.pid + ':' + e.tid) !== 'CrGpuMain' || skip.test(e.name)) continue
      const b = Math.floor((e.ts - t0) / 1e6); const o = (buckets[b] ??= {}); o[e.name] = (o[e.name] ?? 0) + e.dur / 1000
    }
    res.gpuMainBuckets = Object.fromEntries(Object.entries(buckets).map(([b, o]) => [b, Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => k + ':' + Math.round(v))]))
    res.rendererLong = events.filter((e) => e.ph === 'X' && procName.get(e.pid) === 'Renderer' && e.name === 'FireAnimationFrame' && e.dur > 1e6).map((e) => ({ startRel: Math.round((e.ts - t0) / 1000), ms: Math.round(e.dur / 1000) }))
    res.trace = { longest: longest.sort((a, b) => b.ms - a.ms).slice(0, 40), byName: [...acc].sort((a, b) => b[1].ms - a[1].ms).slice(0, 40).map(([k, v]) => [k, v.n, Math.round(v.ms), Math.round(v.max)]), t0us: t0 }
  }
  const endPerf = await page.evaluate(() => performance.now())
  res.endPerf = Math.round(endPerf)
  res.stage = await page.evaluate(() => window.__stage)
  res.gaps = (await page.evaluate(() => window.__gaps)).filter((g) => g.at >= clickPerf)
  res.long = (await page.evaluate(() => window.__long)).filter((g) => g.start + g.dur >= clickPerf)
  res.console = consoleLog
  res.pipe = await page.evaluate(() => window.__pipe)
  res.gpu = await page.evaluate(() => ({ slow: window.__gpu.slow, tot: Object.fromEntries(Object.entries(window.__gpu.tot).map(([k, v]) => [k, { n: v.n, ms: Math.round(v.ms) }])) }))
  // 프로파일 집계
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]))
  const self = new Map()
  const samples = profile.samples, deltas = profile.timeDeltas
  // 샘플 시각(ms, performance.now 기준으로 보정)
  const startMs = profile.startTime / 1000
  const offset = clickPerf - startMs
  let t = profile.startTime
  const sampleT = new Array(samples.length)
  for (let i = 0; i < samples.length; i++) { t += deltas[i]; sampleT[i] = t / 1000 + offset }
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const key = (n) => `${n.callFrame.functionName || '(anon)'} @ ${n.callFrame.url.replace(/^.*\/\/[^/]+/, '').replace(/\?.*$/, '')}:${n.callFrame.lineNumber + 1}`
  const agg = (from, to) => {
    const selfMs = new Map(), totalMs = new Map(), fileMs = new Map()
    for (let i = 0; i < samples.length; i++) {
      if (sampleT[i] < from || sampleT[i] > to) continue
      const d = (deltas[i + 1] ?? deltas[i]) / 1000
      const id = samples[i]; const n = nodes.get(id)
      const k = key(n)
      selfMs.set(k, (selfMs.get(k) ?? 0) + d)
      const f = n.callFrame.url.replace(/^.*\/\/[^/]+/, '').replace(/\?.*$/, '') || '(native)'
      fileMs.set(f, (fileMs.get(f) ?? 0) + d)
      const seen = new Set()
      for (let c = id; c !== undefined; c = parent.get(c)) { const kk = key(nodes.get(c)); if (!seen.has(kk)) { seen.add(kk); totalMs.set(kk, (totalMs.get(kk) ?? 0) + d) } }
    }
    const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, Math.round(v)])
    return { self: top(selfMs), total: top(totalMs), file: top(fileMs) }
  }
  res.whole = agg(clickPerf, endPerf)
  const worst = [...res.gaps].sort((a, b) => b.gap - a.gap)[0]
  res.worst = worst ?? null
  if (worst) res.worstWindow = agg(worst.at - worst.gap, worst.at)
  // 긴 작업별로
  res.longAgg = res.long.filter((l) => l.dur >= 500).map((l) => ({ ...l, agg: agg(l.start, l.start + l.dur) }))
} catch (e) { res.error = String(e) } finally {
  writeFileSync(out, JSON.stringify(res, null, 1))
  await browser.close(); vite.child.kill()
}
console.log(out, 'ready', res.ready, 'error', res.error, 'worst gap', JSON.stringify(res.worst), 'stage', JSON.stringify(res.stage))
