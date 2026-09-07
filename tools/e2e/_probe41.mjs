// §41 **진단 탐침** — 정식 검사가 아니다. 게임 소스는 한 줄도 안 건드리고,
// 브라우저의 WebGPU 호출을 가로채 「부모 CSS 크기가 바뀌기 전에 무엇이 다른가」만
// 잰다. 판정은 안 한다 — 판정하는 자는 `canvasShot.mjs` 하나다.
//
//     node tools/e2e/_probe41.mjs [--url=…] [--channel=chrome] [--headed]
//
// ⚠️ **여기서 monkey patch를 한다.** 그래서 이 파일의 관측은 **계측이 낀 값**이다.
// 같은 결과가 계측 없이도 나오는지는 `pnpm render:first`로 따로 확인한다
// (프로토타입을 건드리면 브라우저가 다른 길로 갈 수 있다).
//
// ⚠️ 탐침이 `probeGpu`로 **장치를 하나 더 만든다.** 장치 수를 셀 때 게임 것과
// 갈라서 센다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs, probeGpu } from '../gpuFlags.mjs'
import { playOpening } from './drive.mjs'
import { WATCH_INIT, diffRatio, hideDom, looksDrawn, shootCanvas } from './canvasShot.mjs'
import { decodePng, statsOf } from '../shot/png.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/probe41')
const args = process.argv.slice(2)
const flag = (n, d = null) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`))
  return hit === undefined ? d : hit.slice(n.length + 3)
}
const VIEW = { width: 960, height: 640 }

const INIT = () => {
  const P = {
    adapters: 0, devices: 0, submits: 0, configure: [], notes: [],
    // `getCurrentTexture()`가 **같은 객체를 계속 돌려주는가.**
    // 스왑체인이 돌면 프레임마다 새 텍스처다 — 안 돌면 화면에 안 나간 것이다
    curCalls: 0, curNew: 0, curSame: 0,
    passes: [], dom: [],
  }
  window.__probe = P

  // **캔버스가 붙었다 떨어졌다 하는가.** 캔버스나 그 조상이 지워졌다 다시
  // 붙거나 `display:none`을 한 번이라도 쓰면, 브라우저는 그 요소의 합성 레이어를
  // 버린다 — 그때 스왑체인이 같이 떨어져 나가면 그리는 것은 멀쩡한데 화면에는
  // 아무것도 안 나간다. 여기서 그 순간을 시간과 함께 적는다
  const isCanvasish = (n) => n.nodeType === 1
    && (n.tagName === 'CANVAS' || (n.querySelector && n.querySelector('canvas') !== null))
  const note = (t) => { P.dom.push(`${t} @${String(Math.round(performance.now()))}`); if (P.dom.length > 60) P.dom.shift() }
  new MutationObserver((recs) => {
    const cv = document.querySelector('canvas')
    for (const r of recs) {
      for (const n of r.removedNodes) if (isCanvasish(n)) note(`제거 ${n.tagName}${n.id ? `#${n.id}` : ''}`)
      for (const n of r.addedNodes) if (isCanvasish(n)) note(`추가 ${n.tagName}${n.id ? `#${n.id}` : ''}`)
      if (r.type === 'attributes' && cv !== null && r.target.nodeType === 1
        && (r.target === cv || r.target.contains(cv))) {
        const el = r.target
        note(`${String(r.attributeName)} ${el.tagName}${el.id ? `#${el.id}` : ''}`
          + ` = ${String(el.getAttribute(r.attributeName)).slice(0, 90)}`)
      }
    }
  // ⚠️ **`document.documentElement`가 아니라 `document`다.** 이 스크립트는
  // 페이지 스크립트보다 먼저 도는데 그때 `documentElement`는 아직 **null**이다 —
  // 거기에 걸면 `observe`가 터지고, **그 아래 계측이 통째로 안 걸린다.**
  // 실측으로 한 판을 그렇게 날렸다 (어댑터·장치·configure가 전부 0으로 찍혔다)
  }).observe(document,
    { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'hidden', 'class'] })
  document.addEventListener('visibilitychange', () => { note(`보임 ${document.visibilityState}`) })
  if (typeof GPUTexture === 'undefined') { P.notes.push('WebGPU 없음'); return }

  const oRA = GPU.prototype.requestAdapter
  GPU.prototype.requestAdapter = function (...a) { P.adapters += 1; return oRA.apply(this, a) }
  const oRD = GPUAdapter.prototype.requestDevice
  GPUAdapter.prototype.requestDevice = function (...a) { P.devices += 1; return oRD.apply(this, a) }
  const oSub = GPUQueue.prototype.submit
  GPUQueue.prototype.submit = function (...a) { P.submits += 1; return oSub.apply(this, a) }

  const oCV = GPUTexture.prototype.createView
  GPUTexture.prototype.createView = function (d) {
    const v = oCV.call(this, d)
    try { v.__t = { w: this.width, h: this.height, s: this.sampleCount, f: this.format } } catch { /**/ }
    return v
  }

  let last = null
  const oGCT = GPUCanvasContext.prototype.getCurrentTexture
  GPUCanvasContext.prototype.getCurrentTexture = function () {
    const t = oGCT.call(this)
    P.curCalls += 1
    if (t === last) P.curSame += 1
    else { P.curNew += 1; last = t }
    return t
  }

  const oConf = GPUCanvasContext.prototype.configure
  GPUCanvasContext.prototype.configure = function (d) {
    P.configure.push({
      alphaMode: d.alphaMode ?? '(기본)', format: d.format,
      usage: d.usage, tone: d.toneMapping ? JSON.stringify(d.toneMapping) : null,
      canvas: `${String(this.canvas.width)}x${String(this.canvas.height)}`,
      at: Math.round(performance.now()),
    })
    return oConf.call(this, d)
  }

  const oBRP = GPUCommandEncoder.prototype.beginRenderPass
  GPUCommandEncoder.prototype.beginRenderPass = function (d) {
    const pass = oBRP.call(this, d)
    const a = d.colorAttachments?.[0]
    const rec = {
      view: a?.view?.__t ?? null, resolve: a?.resolveTarget?.__t ?? null,
      // ⚠️ **깊이 첨부도 같이 적는다.** 크기가 갈리면 WebGPU가 막지만, 갈리지
      // 않는데 안 보이는 판에서는 이것이 있어야 「깊이가 아니다」를 말할 수 있다
      depth: d.depthStencilAttachment?.view?.__t ?? null,
      depthLoad: d.depthStencilAttachment
        ? `${String(d.depthStencilAttachment.depthLoadOp)}/${String(d.depthStencilAttachment.depthClearValue)}` : null,
      load: a?.loadOp ?? null, store: a?.storeOp ?? null, draws: 0,
      // ⚠️ **그린 것이 어디로 갔는가.** 드로우 콜이 나가는데 화면이 지움색
      // 그대로면 다음으로 볼 것은 **뷰포트와 가위**다 — 둘 중 하나가 0이면
      // 명령은 다 나가고 픽셀은 하나도 안 남는다
      viewport: null, scissor: null,
    }
    P.passes.push(rec)
    if (P.passes.length > 40) P.passes.shift()
    pass.__rec = rec
    return pass
  }
  const oVP = GPURenderPassEncoder.prototype.setViewport
  GPURenderPassEncoder.prototype.setViewport = function (...a) {
    if (this.__rec) this.__rec.viewport = a.slice(0, 4).map((v) => Math.round(v * 10) / 10)
    return oVP.apply(this, a)
  }
  const oSC = GPURenderPassEncoder.prototype.setScissorRect
  GPURenderPassEncoder.prototype.setScissorRect = function (...a) {
    if (this.__rec) this.__rec.scissor = a.slice(0, 4)
    return oSC.apply(this, a)
  }
  for (const m of ['draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect']) {
    const o = GPURenderPassEncoder.prototype[m]
    GPURenderPassEncoder.prototype[m] = function (...a) {
      if (this.__rec) this.__rec.draws += 1
      return o.apply(this, a)
    }
  }
}

/** 캔버스와 그 조상의 **레이아웃 상태**. 1px 흔들기 앞뒤로 무엇이 달라지는지 본다 */
const LAYOUT = () => {
  const cv = document.querySelector('#stage-wrap canvas')
  const chain = []
  for (let e = cv; e !== null && e !== document.documentElement; e = e.parentElement) {
    const r = e.getBoundingClientRect()
    const s = getComputedStyle(e)
    chain.push({
      tag: `${e.tagName}${e.id ? `#${e.id}` : ''}`,
      rect: `${r.width.toFixed(1)}x${r.height.toFixed(1)}@${r.x.toFixed(1)},${r.y.toFixed(1)}`,
      style: `${s.width}x${s.height}`,
      pos: s.position, z: s.zIndex, op: s.opacity, tr: s.transform,
      contain: s.contain, vis: s.contentVisibility, will: s.willChange,
      filter: s.filter, mix: s.mixBlendMode, iso: s.isolation,
    })
  }
  const P = window.__probe
  return {
    chain,
    buffer: `${String(cv.width)}x${String(cv.height)}`,
    counters: {
      adapters: P.adapters, devices: P.devices, submits: P.submits,
      curCalls: P.curCalls, curNew: P.curNew, curSame: P.curSame,
      configure: P.configure.length,
    },
    configure: P.configure,
    dom: P.dom,
    // ⚠️ **작은 패스가 창을 다 먹는다.** 블룸 피라미드가 프레임마다 여덟 장을
    // 밀어 넣어서, 마지막 여덟만 보면 **씬 패스도 화면 패스도 한 번을 못 본다.**
    // 큰 것만 골라 본다
    passes: P.passes.filter((p) => p.view !== null && p.view.w > 700).slice(-4).map((p) => `${p.view ? `${p.view.w}x${p.view.h}x${p.view.s} ${p.view.f}` : '?'}`
      + `${p.resolve ? ` →${p.resolve.w}x${p.resolve.h}` : ''} ${String(p.load)}/${String(p.store)}`
      + ` draws ${String(p.draws)}`
      + ` 깊이 ${p.depth ? `${p.depth.w}x${p.depth.h}x${p.depth.s} ${p.depth.f} ${String(p.depthLoad)}` : '없다'}`),
    resizes: window.__watch?.resizes ?? -1,
    boxes: window.__watch?.boxes ?? [],
  }
}

const out = []
const say = (t) => { console.log(t); out.push(t) }

/**
 * 우리가 띄운 개발 서버. ⚠️ **죽으면서 데려간다** — 안 죽이면 vite가 주인 없이
 * 남아 1코어를 먹는다. 실측으로 탐침 다섯 판이 vite 다섯을 남겼고, 그 부하에
 * 다음 판의 vite가 첫 요청에 못 답해 **멀쩡한 검사 둘이 통째로 무효가 됐다**
 */
let vite = null
const url = flag('url') ?? await (async () => {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-first')
  return vite.url
})()

const channel = flag('channel')
const browser = await chromium.launch({
  args: gpuArgs(flag('gpu', 'webgpu')),
  headless: !args.includes('--headed'),
  ...(channel === null ? {} : { channel }),
})
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 })
await page.addInitScript(INIT)
await page.addInitScript(WATCH_INIT)

const marks = () => page.evaluate(() => ({ ...document.documentElement.dataset }))
const tap = async (k, hold = 70) => {
  await page.keyboard.down(k); await page.waitForTimeout(hold)
  await page.keyboard.up(k); await page.waitForTimeout(60)
}

/**
 * 합성기가 실제로 내보내는 화면 한 장 (CDP 화면 중계).
 *
 * ⚠️ **`page.screenshot()`과 다른 길이다.** 스크린샷은 요청을 받고 한 장을
 * 뜨지만 중계는 합성기가 **평소에 내보내는 것**을 그대로 준다. 둘이 갈리면
 * 「화면에 안 나간다」가 아니라 「찍는 길이 못 뜬다」다
 */
async function screencast(name) {
  const cdp = await page.context().newCDPSession(page)
  const got = []
  cdp.on('Page.screencastFrame', (f) => {
    got.push(f.data)
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await hideDom(page, true)
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
  await page.waitForTimeout(1500)
  await cdp.send('Page.stopScreencast').catch(() => {})
  await hideDom(page, false)
  await cdp.detach().catch(() => {})
  if (got.length === 0) { say(`  [${name}] 중계 프레임 0장`); return null }
  const png = Buffer.from(got.at(-1), 'base64')
  writeFileSync(resolve(OUT, `${name}-screencast.png`), png)
  const s = statsOf(png)
  say(`  [${name}] 중계 ${String(got.length)}장 · 색 ${String(s.colors)} · 흩어짐 ${s.stdev.toFixed(1)}`
    + ` → ${looksDrawn(s) ? '그려졌다' : '비었다'}`)
  return png
}

/** 캔버스 위에 무엇이 얹혀 있는가. **합성 레이어를 만드는 성질**까지 같이 적는다 */
async function overlays() {
  const list = await page.evaluate(() => {
    const cv = document.querySelector('#stage-wrap canvas')
    const box = cv.getBoundingClientRect()
    const keep = new Set()
    for (let e = cv; e !== null; e = e.parentElement) keep.add(e)
    return [...document.querySelectorAll('body *')].filter((el) => {
      if (keep.has(el)) return false
      const r = el.getBoundingClientRect()
      if (r.width * r.height === 0) return false
      if (r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom) return false
      const s = getComputedStyle(el)
      return s.position !== 'static' || s.transform !== 'none' || s.filter !== 'none'
        || s.backdropFilter !== 'none' || s.mixBlendMode !== 'normal' || s.willChange !== 'auto'
        || s.opacity !== '1' || s.zIndex !== 'auto'
    }).slice(0, 14).map((el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return `${el.tagName}${el.id ? `#${el.id}` : ''}.${String(el.className).slice(0, 24)}`
        + ` ${r.width.toFixed(0)}x${r.height.toFixed(0)}@${r.x.toFixed(0)},${r.y.toFixed(0)}`
        + ` pos ${s.position} z ${s.zIndex} op ${s.opacity} bg ${s.backgroundColor}`
        + ` tr ${s.transform === 'none' ? '-' : 'yes'} bf ${s.backdropFilter} will ${s.willChange}`
    })
  })
  say(`  캔버스와 겹치는 것 ${String(list.length)}개`)
  for (const one of list) say(`    ${one}`)
}

async function look(name) {
  const shot = await shootCanvas(page, { path: resolve(OUT, `${name}.png`) })
  const l = await page.evaluate(LAYOUT)
  const m = await marks()
  const pt = await page.evaluate(() => (window.pt ? window.pt.probe() : null)).catch(() => null)
  say(`\n[${name}] scene=${String(m.scene)} map=${String(m.map)} renderer=${String(m.renderer)}`)
  say(`  캔버스만 찍은 컷 — 색 ${String(shot.stats.colors)} · 흩어짐 ${shot.stats.stdev.toFixed(1)}`
    + ` → ${looksDrawn(shot.stats) ? '그려졌다' : '**비었다**'} (흔들림 없음 ${String(shot.steady)})`)
  say(`  backing ${l.buffer} · 부모 크기 변화 ${String(l.resizes)}회 ${JSON.stringify(l.boxes.slice(-3))}`)
  say(`  카운터 ${JSON.stringify(l.counters)}`)
  say(`  게임이 보는 것 ${JSON.stringify(pt)}`)
  for (const c of l.chain) say(`    ${c.tag} rect ${c.rect} style ${c.style} pos ${c.pos} z ${c.z} op ${c.op} tr ${c.tr} contain ${c.contain} will ${c.will}`)
  for (const p of l.passes) say(`    pass ${p}`)
  say(`  configure ${JSON.stringify(l.configure)}`)
  if (name === '01-untouched') {
    say(`  DOM이 캔버스 둘레에서 한 일 ${String(l.dom.length)}건`)
    for (const one of l.dom) say(`    ${one}`)
  }
  return { shot, layout: l }
}

try {
  mkdirSync(OUT, { recursive: true })
  await page.goto(url, { waitUntil: 'load', timeout: 180_000 })
  const gpu = await probeGpu(page)
  say(`GPU ${String(gpu.renderer)} · 어댑터 ${String(gpu.adapter)} · 장치 ${String(gpu.device)}`)
  say(`브라우저 ${browser.version()}${channel === null ? ' (번들 크로미움)' : ` (${channel})`}`)

  const start = page.getByRole('button', { name: '시작', exact: true })
  await start.waitFor({ timeout: 120_000 })
  await start.click({ timeout: 60_000 })
  await playOpening(page)
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
    null, { timeout: 180_000 })
  await page.waitForFunction(() => (document.documentElement.dataset.map ?? '') !== '',
    null, { timeout: 60_000 }).catch(() => {})
  // 대사가 **조용해질 때까지** 넘긴다 — 한 번 사라진 것으로 끝이 아니다
  for (let i = 0, quiet = 0; i < 400 && quiet < 8; i++) {
    if ((await marks()).talk === undefined) { quiet += 1; await page.waitForTimeout(150); continue }
    quiet = 0
    await tap('Space')
  }
  await page.waitForTimeout(2000)

  // **찌르기 사다리** — 덜 건드리는 것부터 하나씩. 한 번 살아나면 그 뒤 단은
  // 뜻이 없으므로 살아난 자리에서 멈춘다. 무엇이 살려 내는지가 답이다
  const POKE = [
    ['01-untouched', () => {}],
    // ⚠️ **「안 나갔다」와 「검게 나갔다」는 색으로 구별이 안 된다.** 페이지
    // 배경이 검은데 `alphaMode`가 `opaque`라, 캔버스가 합성되든 안 되든 그 자리는
    // 검다. 그래서 **배경만 자홍으로 칠하고** 다시 본다 — 칠하기만 바뀌고
    // 레이아웃은 그대로다.
    //   자홍이 보이면 캔버스가 **합성이 안 된 것**이고,
    //   검은 채면 캔버스는 나갔는데 **그린 것이 검은 것**이다
    ['01b-magenta-bg', () => {
      document.documentElement.style.background = '#ff00ff'
      document.body.style.background = '#ff00ff'
    }],
    // 계기판을 **지운다**(가리는 것이 아니라). 캔버스 위의 DOM 레이어가
    // 합성을 막고 있는가
    // ⚠️ **시간을 먼저 통제한다.** 찌르기 사다리에서 `05-host-css`는 늘 마지막이라,
    // 「크기를 바꿔서 살아났다」와 「그냥 20초 더 지나서 살아났다」가 같은 모양이다.
    // 아무것도 안 하고 기다리는 단을 둘 끼워 그 둘을 가른다
    ['01c-wait-20s', async () => {}],
    ['01d-wait-40s', async () => {}],
    ['02-no-dom', () => {
      const cv = document.querySelector('#stage-wrap canvas')
      const keep = new Set()
      for (let e = cv; e !== null; e = e.parentElement) keep.add(e)
      for (const el of [...document.querySelectorAll('body *')]) {
        if (!keep.has(el) && el.parentElement !== null && !keep.has(el.parentElement)) continue
        if (!keep.has(el)) el.remove()
      }
    }],
    // **CSS 상자만** 1px. backing store는 그대로다
    ['03-canvas-css', () => {
      const cv = document.querySelector('#stage-wrap canvas')
      cv.style.width = `${cv.clientWidth - 1}px`
    }],
    // **backing store만** 1px. three는 모르고 지나간다
    ['04-canvas-backing', () => {
      const cv = document.querySelector('#stage-wrap canvas')
      cv.style.width = ''
      cv.width -= 1
    }],
    // 감싼 자리의 CSS 너비 — 여기서는 살아나는 것을 이미 안다
    ['05-host-css', () => {
      const cv = document.querySelector('#stage-wrap canvas')
      cv.width += 1
      document.querySelector('#stage-wrap').style.width = 'calc(100% - 1px)'
    }],
  ]

  let first = null
  for (const [name, poke] of POKE) {
    await page.evaluate(poke)
    await page.waitForTimeout(name.startsWith('01c') || name.startsWith('01d') ? 20_000 : 2500)
    const one = await look(name)
    if (name === '01-untouched') {
      first = one
      await screencast('01-untouched')
      await overlays()
      const c0 = one.layout.counters
      await page.waitForTimeout(2000)
      const c1 = (await page.evaluate(LAYOUT)).counters
      say(`
[2초 동안] submit +${String(c1.submits - c0.submits)}`
        + ` · getCurrentTexture +${String(c1.curCalls - c0.curCalls)}`
        + ` (새 텍스처 +${String(c1.curNew - c0.curNew)} · 같은 것 +${String(c1.curSame - c0.curSame)})`)
      continue
    }
    if (name === '01b-magenta-bg') {
      const px = decodePng(one.shot.png)
      const mid = ((px.h >> 1) * px.w + (px.w >> 1)) * px.bpp
      say(`  **한가운데 픽셀 rgb(${String(px.pixels[mid])}, ${String(px.pixels[mid + 1])}, `
        + `${String(px.pixels[mid + 2])})** — 자홍이면 캔버스가 합성 안 된 것이고,`
        + ' 검으면 캔버스는 나갔는데 그린 것이 검은 것이다')
      await page.evaluate(() => {
        document.documentElement.style.background = ''
        document.body.style.background = ''
      })
      continue
    }
    if (looksDrawn(one.shot.stats)) {
      say(`
**${name}에서 살아났다.** 앞 컷과의 차이 ${diffRatio(first.shot.png, one.shot.png).toFixed(4)}`)
      await screencast(name)
      break
    }
  }
} catch (e) {
  say(`터졌다: ${String(e?.message ?? e)}`)
} finally {
  await browser.close()
  vite?.child.kill()
  writeFileSync(resolve(ROOT, '.audit/canvas-probe.txt'), `${out.join('\n')}\n`)
  console.log('\n→ .audit/canvas-probe.txt · shots/probe41/')
}
