// 실시간 끊김 탐침: 배틀 등장 · 기술 사용 중 rAF 간격과 fx 요청을 잰다
import { createServer as netServer } from 'node:net'
import { chromium } from 'playwright'
import { gpuArgs } from '../gpuFlags.mjs'

const freePort = () => new Promise((d) => { const s = netServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => { d(port) }) }) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
import http from 'node:http'
import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
const ROOT = resolve(import.meta.dirname, '../..')
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2', '.woff2': 'font/woff2' }
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0])
  for (const base of ['.audit/dist-lag', 'public']) {
    const f = resolve(ROOT, base + p)
    if (f.startsWith(resolve(ROOT, base)) && existsSync(f) && statSync(f).isFile()) {
      r.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }); createReadStream(f).pipe(r); return
    }
  }
  r.writeHead(200, { 'content-type': 'text/html' }); createReadStream(resolve(ROOT, '.audit/dist-lag/index.html')).pipe(r)
})
const PORT = await freePort()
await new Promise((d) => srv.listen(PORT, '127.0.0.1', d))
const { startVite } = await import('../devServer.mjs')
const vite = process.env.DEVSRV ? await startVite(await freePort()) : { url: 'http://127.0.0.1:' + PORT + '/', child: { kill: () => srv.close() } }
const browser = await chromium.launch({ args: gpuArgs('webgpu') })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
page.setDefaultNavigationTimeout(600_000)
const reqs = [] // {t(ms, 페이지 시계 근사), url}
let t0node = 0
page.on('request', (r) => { if (/fx/i.test(r.url())) reqs.push({ n: Date.now(), url: r.url().replace(/^https?:\/\/[^/]+/, '') }) })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 200));  if (/ms|hitch|compile|pipeline/i.test(m.text()) && m.type() !== 'debug') console.log('  [console]', m.text().slice(0, 160)) })
await page.addInitScript(() => {
  window.__pipes = []
  const wrap = () => {
    if (typeof GPUDevice === 'undefined') return
    const P = GPUDevice.prototype
    for (const k of ['createRenderPipeline', 'createRenderPipelineAsync', 'createShaderModule', 'createComputePipeline']) {
      const f = P[k]
      P[k] = function (...a) {
        const t = performance.now()
        const r = f.apply(this, a)
        const st = (new Error().stack || '').split(String.fromCharCode(10)).slice(2, 12).map((l) => l.trim().replace(/https?:\/\/[^/]+/, '').replace(/\?[^:)]*/, '')).join(' | ')
        window.__pipes.push([t, performance.now() - t, k, (a[0] && a[0].label) || '', st])
        return r
      }
    }
  }
  wrap()
})
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
  await page.evaluate(async () => { try { const w = await import('/src/state/worldState.ts'); w.worldState.time.gameHour = 15 } catch { /* 번들 */ } })
  await page.waitForTimeout(8000)
  // rAF 기록기 + 표식
  await page.evaluate(() => {
    window.__d = []; window.__marks = []
    let last = performance.now()
    const tick = (n) => { window.__d.push([n, n - last]); last = n; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    window.__mark = (s) => window.__marks.push([performance.now(), s])
  })
  const mark = (s) => page.evaluate((x) => window.__mark(x), s)
  const nreq = () => reqs.length
  const seen = (sel) => page.locator(sel).first().isVisible().catch(() => false)
  await page.evaluate(async () => {
    let P = null
    let R = null
    try { const { sceneRefs } = await import('/src/scene/sceneRefs.ts'); R = sceneRefs.stage.gl; P = R._pipelines } catch { window.__objs = []; return }
    const f = P._getRenderPipeline.bind(P)
    window.__objs = []
    const N = R._nodes
    const g = N.getForRender.bind(N)
    window.__builds = []
    N.getForRender = function (ro, ...rest) {
      const fresh = this.get(ro).nodeBuilderState === undefined && !this.nodeBuilderCache.has(ro.initialCacheKey)
      const t = performance.now()
      const r = g(ro, ...rest)
      if (fresh) window.__builds.push([t, performance.now() - t, ro.material?.name || ro.material?.type, ro.object?.name || ro.object?.type, ro.scene?.name || ro.scene?.type, ro.material?.uuid, ro.object?.uuid, ro.material?.transparent, ro.material?.version, (ro.lightsNode?.getLights?.() ?? []).map((l) => `${l.type}${l.castShadow ? '*' : ''}:${l.name || l.parent?.name || ''}`).join(','), String(ro.initialCacheKey).slice(0, 80), ro.scene?.environment?.uuid ?? '-', ro.camera?.uuid?.slice(0, 6)])
      return r
    }
    P._getRenderPipeline = function (ro, ...rest) {
      const t = performance.now()
      const had = this.caches.size
      const r = f(ro, ...rest)
      if (this.caches.size > had) {
        const rt = ro.context?.renderTarget
        window.__objs.push([t, performance.now() - t, ro.material?.name || ro.material?.type, ro.object?.name || ro.object?.type,
          rt ? `rt ${rt.samples}s ${rt.texture?.format}` : 'canvas', ro.context?.sampleCount, ro.geometry?.type, String(rest[2] ?? '')])
      }
      return r
    }
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
  await cdp.send('Profiler.start')
  await mark('wild-call'); const r0 = nreq()
  await page.evaluate(async (lv) => { await globalThis.pt.wild(403, lv, 0) }, Number(process.env.LEVEL ?? 5))
  await mark('wild-returned')
  for (let i = 0; i < 400; i++) {
    if (await seen('[data-pilot="fight"]')) break
    if (i % 4 === 3) { await page.keyboard.press('KeyZ'); await mark('Z(intro)') }
    await sleep(250)
  }
  await mark('menu-visible'); const rMenu = nreq()
  {
    const { profile } = await cdp.send('Profiler.stop')
    const self = new Map()
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    const dt = profile.timeDeltas
    const counts = new Map()
    profile.samples.forEach((id, i) => { counts.set(id, (counts.get(id) ?? 0) + (dt[i] ?? 0)) })
    for (const [id, us] of counts) {
      const n = byId.get(id); const f = n.callFrame
      const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`
      self.set(k, (self.get(k) ?? 0) + us)
    }
    console.log('== CPU self time (배틀 등장, 상위 25)')
    for (const [k, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  CPU ${(us / 1000).toFixed(0)}ms ${k}`)
  }
  await sleep(2500)
  if (process.env.FLEE) {
    if (process.env.FLEE_WAIT) { await mark('idle'); await sleep(Number(process.env.FLEE_WAIT) * 1000) }
    await mark('flee')
    await page.getByText('도망간다').first().click()
    for (let i = 0; i < 48; i++) { await sleep(250); if (i % 4 === 3) await page.keyboard.press('KeyZ') }
    await mark('flee-end')
  }
  const plan = process.env.FLEE ? [] : process.env.WIN ? [['W1', 0], ['W2', 0], ['W3', 0], ['W4', 0], ['W5', 0], ['W6', 0]] : [['A', 0], ['B', 1], ['A-again', 0]]
  const out = []
  for (const [name, idx] of plan) {
    const rb = nreq()
    await page.keyboard.press('KeyZ'); await mark(`${name}:Z-fight`)
    try { await page.waitForSelector('[data-pilot="move-0"]', { timeout: 10000 }) } catch {
      // 판이 끝났다 — 필드로 돌아가는 구간을 잰다
      await mark('over')
      if (process.env.PROF_END) { await cdp.send('Profiler.start') }
      for (let i = 0; i < 60; i++) { await sleep(250); if (i % 4 === 3) await page.keyboard.press('KeyZ') }
      await mark('over-end')
      if (process.env.PROF_END) {
        const { profile } = await cdp.send('Profiler.stop')
        const byId = new Map(profile.nodes.map((n) => [n.id, n]))
        const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
        const self = new Map(); const total = new Map()
        profile.samples.forEach((id, i) => {
          const us = profile.timeDeltas[i] ?? 0
          const f = byId.get(id).callFrame
          const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`
          self.set(k, (self.get(k) ?? 0) + us)
          const seen = new Set(); let cur = id
          while (cur !== undefined) { const cf = byId.get(cur).callFrame; const kk = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber}`; if (!seen.has(kk)) { seen.add(kk); total.set(kk, (total.get(kk) ?? 0) + us) } cur = parent.get(cur) }
        })
        console.log('== END CPU self (상위 20)'); for (const [k, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ENDSELF ${(us / 1000).toFixed(0)}ms ${k}`)
        console.log('== END CPU total (상위 40)'); for (const [k, us] of [...total].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ENDTOT ${(us / 1000).toFixed(0)}ms ${k}`)
      }
      break
    }
    await sleep(400)
    for (let k = 0; k < idx; k++) { await page.keyboard.press('ArrowDown'); await sleep(150) }
    await page.keyboard.press('KeyZ'); await mark(`${name}:Z-move(start)`)
    const ra = nreq()
    for (let i = 0; i < 160; i++) {
      await sleep(250)
      if (await seen('[data-pilot="fight"]')) break
      if (i % 6 === 5) { await page.keyboard.press('KeyZ'); await mark(`${name}:Z(text)`) }
    }
    await mark(`${name}:menu-back`)
    out.push([name, nreq() - ra])
    await sleep(2000)
  }
  const { d, marks, off } = await page.evaluate(() => ({ d: window.__d, marks: window.__marks, off: Date.now() - performance.now() }))
  {
    const builds = await page.evaluate(() => window.__builds ?? [])
    const over = marks.find((m) => m[1] === 'over')?.[0] ?? Infinity
    const lastMove = [...marks].reverse().find((m) => /Z-move\(start\)/.test(m[1]))?.[0] ?? 0
    const after = builds.filter((b) => b[0] >= lastMove)
    const sum = new Map()
    for (const b of after) { const k = `${b[2]} | ${b[4]}`; const e = sum.get(k) ?? [0, 0]; e[0]++; e[1] += b[1]; sum.set(k, e) }
    console.log(`
== 마지막 기술 뒤 노드 빌드 ${after.length}건, ${after.reduce((a, b) => a + b[1], 0).toFixed(0)}ms`)
    for (const [k, [n, ms]] of [...sum].sort((a, b) => b[1][1] - a[1][1]).slice(0, 30)) console.log(`  BUILD ${n}× ${ms.toFixed(0)}ms ${k}`)
    const mats = new Set(after.map((b) => b[5])), objs = new Set(after.map((b) => b[6]))
    console.log(`  DISTINCT 재질 ${mats.size} · 물체 ${objs.size} · 투명 ${after.filter((b) => b[7]).length}/${after.length}`)
    const flower = after.filter((b) => b[2] === 'M_C_001_Flower_01').map((b) => `${((b[0] - lastMove) / 1000).toFixed(1)}s mat=${String(b[5]).slice(0, 6)} obj=${String(b[6]).slice(0, 6)} tr=${b[7]} v=${b[8]}`)
    for (const f of flower) console.log(`  FLOWER ${f}`)
    const sig = new Map(); for (const b of after) { const k = `L=[${b[9]}] env=${String(b[11]).slice(0, 6)} cam=${b[12]}`; sig.set(k, (sig.get(k) ?? 0) + 1) }
    for (const [k, n] of sig) console.log(`  SIG ${n}× ${k}`)
    const before = builds.filter((b) => b[0] < lastMove)
    const sig0 = new Map(); for (const b of before) { const k = `L=[${b[9]}] env=${String(b[11]).slice(0, 6)} cam=${b[12]}`; sig0.set(k, (sig0.get(k) ?? 0) + 1) }
    for (const [k, n] of [...sig0].slice(0, 8)) console.log(`  SIG0 ${n}× ${k}`)
    // 빛 개수별로 언제 지어졌나 (표식 기준)
    const at = (t) => { const pm = marks.filter((m) => m[0] <= t).slice(-1)[0]; return `${pm?.[1]}+${((t - (pm?.[0] ?? 0)) / 1000).toFixed(1)}s` }
    const when = new Map(); for (const b of builds) { const k = `${b[9].split(',').length}빛 @ ${at(b[0]).replace(/\+[0-9.]+s$/, '')}`; when.set(k, (when.get(k) ?? 0) + 1) }
    for (const [k, n] of when) console.log(`  WHEN ${n}× ${k}`)
    const hist = new Map(); for (const b of after) { const k = Math.floor((b[0] - lastMove) / 1000); hist.set(k, (hist.get(k) ?? 0) + 1) }
    console.log(`  HIST ${[...hist].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}s:${n}`).join(' ')}`)
    const ts = after.map((b) => b[0]); if (ts.length) console.log(`  시각 ${((Math.min(...ts) - lastMove) / 1000).toFixed(2)}s ~ ${((Math.max(...ts) - lastMove) / 1000).toFixed(2)}s (마지막 기술 기준)`)
  }
  const objs = await page.evaluate(() => window.__objs)
  {
    const ta = marks.find((m) => m[1] === 'wild-call')?.[0] ?? 0
    console.log(`
== 새 파이프라인 ${objs.length}건 (배틀 시작 뒤)`)
    for (const o of objs) {
      const pm = marks.filter((m) => m[0] <= o[0]).slice(-1)[0]
      console.log(`  OBJ ${((o[0] - ta) / 1000).toFixed(2)}s ${o[1].toFixed(1)}ms [${pm?.[1]}] mat=${o[2]} obj=${o[3]} ${o[4]} samples=${o[5]} geo=${o[6]} KEY=${o[7]}`)
    }
  }
  const pipes = await page.evaluate(() => window.__pipes)
  {
    const ta = marks.find((m) => m[1] === 'menu-visible')?.[0] ?? 0
    const after = pipes.filter((p) => p[0] >= ta)
    console.log(`
== 메뉴 뒤 파이프라인/셰이더 생성 ${after.length}건`)
    for (const p of after.slice(0, 80)) {
      const pm = marks.filter((m) => m[0] <= p[0]).slice(-1)[0]
      console.log(`  ${((p[0] - ta) / 1000).toFixed(2)}s ${p[2]} ${p[1].toFixed(1)}ms [${pm?.[1]}] ${p[4].slice(0, 400)}`)
    }
  }
  const reqP = reqs.map((r) => ({ t: r.n - off, url: r.url }))
  const find = (s) => marks.find((m) => m[1] === s)?.[0]
  const rel = (t, base) => ((t - base) / 1000).toFixed(2)
  const seg = (a, b, label) => {
    const ta = find(a), tb = find(b) ?? Infinity
    const fr = d.filter(([n]) => n >= ta && n <= tb)
    const ds = fr.map((x) => x[1]).sort((x, y) => x - y)
    const over = fr.filter(([, dt]) => dt > 50)
    const max = fr.reduce((m, x) => (x[1] > m[1] ? x : m), [0, 0])
    console.log(`\n== ${label}: ${fr.length}프레임, 중앙 ${ds[Math.floor(ds.length / 2)]?.toFixed(1)}ms, >50ms ${over.length}개, 최대 ${max[1].toFixed(0)}ms @+${rel(max[0], ta)}s`)
    for (const [n, dt] of over.slice(0, 25)) {
      const st = n - dt
      const pm = marks.filter((m) => m[0] <= n).slice(-1)[0]
      const rq = reqP.filter((r) => r.t >= st - 300 && r.t <= n + 100).map((r) => r.url.split('/').pop())
      console.log(`   +${rel(n, ta)}s  ${dt.toFixed(0)}ms  직전 표식 ${pm?.[1]} (+${pm ? ((n - dt - pm[0]) / 1000).toFixed(2) : '?'}s 전 시작)  fx요청 ${rq.length}: ${rq.slice(0, 6).join(',')}`)
    }
  }
  seg('wild-call', 'menu-visible', '배틀 등장(보냄)')
  if (process.env.FLEE) seg('flee', 'flee-end', '도망 → 필드')
  for (const [name] of plan) if (marks.some((m) => m[1] === `${name}:menu-back`)) seg(`${name}:Z-move(start)`, `${name}:menu-back`, `기술 ${name}`)
  if (marks.some((m) => m[1] === 'over')) seg(`${plan.find(([n]) => !marks.some((m) => m[1] === `${n}:menu-back`))?.[0] ?? 'W1'}:Z-move(start)`, 'over-end', '이긴 뒤 → 필드')
  console.log('\nmarks:'); for (const [t, s] of marks) console.log(`  ${rel(t, marks[0][0])}s ${s}`)
  console.log(`\nfx 요청: 등장 전~등장 ${rMenu - r0}, 기술별 ${JSON.stringify(out)}`)
  const st = reqs.slice(r0)
  console.log('fx 요청 목록(앞 30):'); for (const r of st.slice(0, 30)) console.log('  ', r.url)
  console.log(`
== 콘솔 오류/경고 ${errs.length}건`); const c = {}; for (const e of errs) c[e.slice(0, 120)] = (c[e.slice(0, 120)] ?? 0) + 1; for (const [k, v] of Object.entries(c).slice(0, 30)) console.log(`  ${v}× ${k}`)
} catch (e) { console.error('실패', e) } finally { await browser.close(); vite.child.kill() }
