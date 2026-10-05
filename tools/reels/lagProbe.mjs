// 실시간 끊김 탐침: 배틀 등장 · 기술 사용 중 rAF 간격과 fx 요청을 잰다
import { createServer as netServer } from 'node:net'
import { chromium } from 'playwright'
import { startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const freePort = () => new Promise((d) => { const s = netServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => { d(port) }) }) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const vite = await startVite(await freePort())
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
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
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
    const { sceneRefs } = await import('/src/scene/sceneRefs.ts')
    const P = sceneRefs.stage.gl._pipelines
    const f = P._getRenderPipeline.bind(P)
    window.__objs = []
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
  await mark('wild-call'); const r0 = nreq()
  await page.evaluate(async () => { await globalThis.pt.wild(403, 5, 0) })
  await mark('wild-returned')
  for (let i = 0; i < 400; i++) {
    if (await seen('[data-pilot="fight"]')) break
    if (i % 4 === 3) { await page.keyboard.press('KeyZ'); await mark('Z(intro)') }
    await sleep(250)
  }
  await mark('menu-visible'); const rMenu = nreq()
  await sleep(2500)
  const plan = [['A', 0], ['B', 1], ['A-again', 0]]
  const out = []
  for (const [name, idx] of plan) {
    const rb = nreq()
    await page.keyboard.press('KeyZ'); await mark(`${name}:Z-fight`)
    await page.waitForSelector('[data-pilot="move-0"]', { timeout: 10000 }); await sleep(400)
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
  for (const [name] of plan) seg(`${name}:Z-move(start)`, `${name}:menu-back`, `기술 ${name}`)
  console.log('\nmarks:'); for (const [t, s] of marks) console.log(`  ${rel(t, marks[0][0])}s ${s}`)
  console.log(`\nfx 요청: 등장 전~등장 ${rMenu - r0}, 기술별 ${JSON.stringify(out)}`)
  const st = reqs.slice(r0)
  console.log('fx 요청 목록(앞 30):'); for (const r of st.slice(0, 30)) console.log('  ', r.url)
  console.log(`
== 콘솔 오류/경고 ${errs.length}건`); const c = {}; for (const e of errs) c[e.slice(0, 120)] = (c[e.slice(0, 120)] ?? 0) + 1; for (const [k, v] of Object.entries(c).slice(0, 30)) console.log(`  ${v}× ${k}`)
} catch (e) { console.error('실패', e) } finally { await browser.close(); vite.child.kill() }
