// §41 **한 프레임 추적** — 진단용이다. 판정은 안 한다.
//
//     node tools/e2e/_trace41.mjs [--url=…] [--channel=chrome] [--headed]
//
// 묻는 것은 「드로우가 몇 번인가」가 아니라 **「세계 패스가 쓴 타깃이 최종 캔버스로
// 이어지는가, 그 뒤 누가 같은 타깃을 지우거나 resolve하는가」**다. 그래서 한
// 프레임을 통째로 순서대로 적는다 — encoder·pass·submit 차례, 첨부의 ID와
// 포맷·크기·sampleCount, load/store와 clearValue, resolveTarget, 깊이의
// load/store와 readOnly, 그리고 자원이 언제 생기고 언제 죽는지.
//
// ⚠️ **GPU 객체에 필드를 붙이지 않는다.** `WeakMap`으로 번호를 준다 — 객체에
// 쓰면 브라우저가 다른 길로 갈 수 있고, 죽은 객체를 붙잡아 두게 된다.
//
// ⚠️ **서술자는 그 자리에서 베낀다.** three는 같은 서술자 객체를 프레임마다
// 다시 쓰므로, 나중에 콘솔에서 펼치면 **그때 값이 아니라 지금 값**을 읽는다.
//
// ⚠️ **감싸는 것은 원래 `this`와 반환값을 그대로 넘긴다.** 비동기 차례도 안 바꾼다.
//
// ⚠️ **여기 관측은 계측이 낀 값이다.** 계측 없는 재현은 `pnpm render:first`가 맡는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { playOpening } from './drive.mjs'
import { looksDrawn, shootCanvas } from './canvasShot.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/trace41')
const args = process.argv.slice(2)
const flag = (n, d = null) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`))
  return hit === undefined ? d : hit.slice(n.length + 3)
}
const VIEW = { width: 960, height: 640 }
const CHANNEL = flag('channel')
const HEADED = args.includes('--headed')
const PROFILE = flag('gpu', CHANNEL === null ? 'webgpu' : 'default')

const INIT = () => {
  const T = { frames: [], live: [], armed: false, cur: null, frame: 0, device: null, readTex: null }
  window.__trace = T
  if (typeof GPUTexture === 'undefined') return

  // ── 번호표 (객체에 안 쓴다) ──────────────────────────────────────────────
  const book = new WeakMap()
  const seq = {}
  const idOf = (o, kind) => {
    if (o === null || o === undefined) return null
    let got = book.get(o)
    if (got === undefined) {
      seq[kind] = (seq[kind] ?? 0) + 1
      got = `${kind}${String(seq[kind])}`
      book.set(o, got)
    }
    return got
  }
  const put = (row) => {
    if (T.cur !== null) T.cur.rows.push(row)
  }
  const note = (row) => { T.live.push({ ...row, at: Math.round(performance.now()) }); if (T.live.length > 400) T.live.shift() }

  // 텍스처의 생김새는 **만들 때** 적어 둔다 (죽은 뒤에는 못 읽는다)
  const shape = new WeakMap()
  const remember = (t) => {
    try {
      shape.set(t, { w: t.width, h: t.height, s: t.sampleCount, f: t.format, m: t.mipLevelCount })
    } catch { /* 못 읽으면 비운다 */ }
    return t
  }
  const viewOf = new WeakMap()

  const wrap = (proto, name, make) => {
    const orig = proto[name]
    proto[name] = make(orig)
  }

  wrap(GPUAdapter.prototype, 'requestDevice', (o) => function (...a) {
    return o.apply(this, a).then((dev) => { T.device ??= dev; return dev })
  })

  wrap(GPUDevice.prototype, 'createTexture', (o) => function (d) {
    // ⚠️ **진단용으로 `COPY_SRC`를 더한다.** 블릿이 읽는 타깃을 되읽으려면 필요하다.
    // 이것은 앱의 GPU 자원을 바꾸는 것이므로 **제품에 남기지 않는다** — 이 파일
    // 안에서만이고, 계측 없는 재현은 `pnpm render:first`가 따로 맡는다
    const t = o.call(this, { ...d, usage: (d.usage | GPUTextureUsage.COPY_SRC) })
    remember(t)
    note({ what: '텍스처 생성', id: idOf(t, 'tex'), size: `${String(d.size?.width ?? d.size?.[0] ?? '?')}x${String(d.size?.height ?? d.size?.[1] ?? '?')}`, format: d.format, samples: d.sampleCount ?? 1 })
    return t
  })
  wrap(GPUTexture.prototype, 'destroy', (o) => function (...a) {
    note({ what: '텍스처 파괴', id: idOf(this, 'tex') })
    return o.apply(this, a)
  })
  wrap(GPUTexture.prototype, 'createView', (o) => function (d) {
    const v = o.call(this, d)
    if (!shape.has(this)) remember(this)
    viewOf.set(v, { tex: idOf(this, 'tex'), shape: shape.get(this) ?? null, obj: this })
    idOf(v, 'view')
    return v
  })
  wrap(GPUCanvasContext.prototype, 'getCurrentTexture', (o) => function () {
    const t = o.call(this)
    remember(t)
    const id = idOf(t, 'swap')
    put({ what: 'getCurrentTexture', id })
    return t
  })
  wrap(GPUCanvasContext.prototype, 'configure', (o) => function (d) {
    note({
      what: 'configure', alphaMode: d.alphaMode ?? '(기본)', format: d.format, usage: d.usage,
      canvas: `${String(this.canvas.width)}x${String(this.canvas.height)}`,
    })
    return o.call(this, d)
  })
  wrap(GPUDevice.prototype, 'createCommandEncoder', (o) => function (...a) {
    const e = o.apply(this, a)
    put({ what: 'encoder', id: idOf(e, 'enc') })
    return e
  })

  const tell = (v) => {
    if (v === null || v === undefined) return null
    const got = viewOf.get(v)
    const s = got?.shape
    return {
      view: idOf(v, 'view'), tex: got?.tex ?? '?',
      size: s ? `${String(s.w)}x${String(s.h)}x${String(s.s)} ${String(s.f)}` : '?',
    }
  }

  // **그 패스가 무엇을 읽는가.** 「어디에 썼는가」만으로는 모자란다 — 마지막
  // 사각형이 **어느 텍스처를 샘플하는지**가 화면의 출처다
  const bgViews = new WeakMap()
  wrap(GPUDevice.prototype, 'createBindGroup', (o) => function (d) {
    const bg = o.call(this, d)
    const list = []
    for (const e of d.entries ?? []) {
      const r = e.resource
      if (r !== null && r !== undefined && viewOf.has(r)) {
        const got = viewOf.get(r)
        const sh = got.shape
        list.push(`${String(idOf(r, 'view'))}←${String(got.tex)}`
          + `${sh ? ` ${String(sh.w)}x${String(sh.h)}x${String(sh.s)} ${String(sh.f)}` : ''}`)
      }
    }
    bgViews.set(bg, list)
    return bg
  })

  wrap(GPUCommandEncoder.prototype, 'beginRenderPass', (o) => function (d) {
    const p = o.call(this, d)
    const a = d.colorAttachments?.[0]
    const z = d.depthStencilAttachment
    // ⚠️ **여기서 베낀다** — three가 같은 서술자를 다시 쓰기 때문이다
    const row = {
      what: 'pass', id: idOf(p, 'pass'), enc: idOf(this, 'enc'),
      color: tell(a?.view), resolve: tell(a?.resolveTarget),
      load: a?.loadOp ?? null, store: a?.storeOp ?? null,
      clear: a?.clearValue ? { ...a.clearValue } : null,
      depth: tell(z?.view),
      depthOps: z ? `${String(z.depthLoadOp)}/${String(z.depthStoreOp)} clear ${String(z.depthClearValue)} ro ${String(z.depthReadOnly)}` : null,
      draws: 0, verts: 0, viewport: null, scissor: null, reads: [],
    }
    put(row)
    lastRow.set(p, row)
    // 화면 사각형이 **읽을** 타깃 — 큰 resolve 대상 하나를 붙잡아 둔다
    const rt = a?.resolveTarget === undefined ? null : viewOf.get(a.resolveTarget)
    if (rt && rt.shape && rt.shape.w > 700) T.readTex = rt.obj
    return p
  })
  const lastRow = new WeakMap()
  for (const m of ['draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect']) {
    wrap(GPURenderPassEncoder.prototype, m, (o) => function (...a) {
      const row = lastRow.get(this)
      if (row) { row.draws += 1; row.verts += Number(a[0] ?? 0) }
      return o.apply(this, a)
    })
  }
  wrap(GPURenderPassEncoder.prototype, 'setBindGroup', (o) => function (...a) {
    const row = lastRow.get(this)
    const got = bgViews.get(a[1])
    if (row && got !== undefined) for (const one of got) if (!row.reads.includes(one)) row.reads.push(one)
    return o.apply(this, a)
  })
  wrap(GPURenderPassEncoder.prototype, 'setViewport', (o) => function (...a) {
    const row = lastRow.get(this)
    if (row) row.viewport = a.slice(0, 4)
    return o.apply(this, a)
  })
  wrap(GPURenderPassEncoder.prototype, 'setScissorRect', (o) => function (...a) {
    const row = lastRow.get(this)
    if (row) row.scissor = a.slice(0, 4)
    return o.apply(this, a)
  })
  wrap(GPUQueue.prototype, 'submit', (o) => function (list) {
    put({ what: 'submit', n: list?.length ?? 0 })
    return o.call(this, list)
  })

  // ── 한 프레임만 잡는다 ──────────────────────────────────────────────────
  // rAF의 맨 앞에 걸어 두고, 다음 rAF가 올 때 닫는다
  const tick = () => {
    if (T.armed) {
      if (T.cur !== null) { T.frames.push(T.cur); T.cur = null; T.armed = false }
      else { T.frame += 1; T.cur = { frame: T.frame, rows: [] } }
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__traceOne = () => { T.armed = true }

  /** 반정밀 실수 하나를 편다 */
  const half = (h) => {
    const s = (h & 0x8000) ? -1 : 1
    const e = (h >> 10) & 0x1f
    const m = h & 0x3ff
    if (e === 0) return s * m * 2 ** -24
    if (e === 31) return m === 0 ? s * Infinity : NaN
    return s * (m + 1024) * 2 ** (e - 25)
  }

  /**
   * **블릿이 읽는 타깃의 픽셀을 GPU에서 되읽는다.**
   *
   * 이것이 「씬이 안 실렸다」와 「블릿이 잘못 읽는다」를 가른다 — 여기에 세계가
   * 들어 있으면 잘못은 읽는 쪽이고, 지움색만 있으면 쓰는 쪽이다
   */
  window.__readBack = async () => {
    const t = T.readTex
    const dev = T.device
    if (t === null || dev === null) return { ok: false, why: '타깃이나 장치를 못 잡았다' }
    const W = 8, H = 8, ROW = 256
    try {
      dev.pushErrorScope('validation')
      const buf = dev.createBuffer({ size: ROW * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
      const enc = dev.createCommandEncoder()
      enc.copyTextureToBuffer(
        { texture: t, origin: { x: Math.floor(t.width / 2), y: Math.floor(t.height / 2) } },
        { buffer: buf, bytesPerRow: ROW }, { width: W, height: H })
      dev.queue.submit([enc.finish()])
      const bad = await dev.popErrorScope()
      if (bad !== null) return { ok: false, why: String(bad.message).slice(0, 200) }
      await buf.mapAsync(GPUMapMode.READ)
      const px = new Uint16Array(buf.getMappedRange())
      const out = []
      for (let i = 0; i < 4; i++) {
        const o = i * 4
        out.push([half(px[o]), half(px[o + 1]), half(px[o + 2]), half(px[o + 3])]
          .map((v) => Number(v.toFixed(5))))
      }
      buf.unmap()
      return { ok: true, size: `${String(t.width)}x${String(t.height)}`, format: t.format, px: out }
    } catch (e) {
      return { ok: false, why: String(e && e.message).slice(0, 200) }
    }
  }
}

const out = []
const say = (t) => { console.log(t); out.push(t) }

let vite = null
const url = flag('url') ?? await (async () => {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-first')
  return vite.url
})()

const browser = await chromium.launch({
  args: gpuArgs(PROFILE), headless: !HEADED,
  ...(CHANNEL === null ? {} : { channel: CHANNEL }),
})
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 })
await page.addInitScript(INIT)

const marks = () => page.evaluate(() => ({ ...document.documentElement.dataset }))
const tap = async (k, hold = 70) => {
  await page.keyboard.down(k); await page.waitForTimeout(hold)
  await page.keyboard.up(k); await page.waitForTimeout(60)
}

/** 한 프레임을 잡아서 줄로 편다 */
async function traceOne(name) {
  await page.evaluate(() => { window.__traceOne() })
  await page.waitForFunction(() => window.__trace.frames.length > 0
    && window.__trace.armed === false, null, { timeout: 10_000 })
  const frame = await page.evaluate(() => window.__trace.frames.pop())
  const live = await page.evaluate(() => window.__trace.live.splice(0))
  say(`\n[${name}] 한 프레임 ${String(frame.rows.length)}줄`)
  for (const r of frame.rows) {
    if (r.what === 'pass') {
      say(`  pass ${r.id}(${String(r.enc)})`
        + ` 색 ${r.color ? `${r.color.view}←${r.color.tex} ${r.color.size}` : '없다'}`
        + ` ${String(r.load)}/${String(r.store)}`
        + `${r.clear ? ` clear ${JSON.stringify(r.clear)}` : ''}`
        + ` resolve ${r.resolve ? `${r.resolve.view}←${r.resolve.tex} ${r.resolve.size}` : '없다'}`
        + ` 깊이 ${r.depth ? `${r.depth.view}←${r.depth.tex} ${r.depth.size} ${String(r.depthOps)}` : '없다'}`
        + ` draws ${String(r.draws)}/${String(r.verts)}정점`
        + ` viewport ${JSON.stringify(r.viewport)}`
        + `
        읽는 것 ${r.reads.length === 0 ? '없다' : r.reads.join(' · ')}`)
    } else if (r.what === 'submit') say(`  submit ${String(r.n)}`)
    else if (r.what === 'getCurrentTexture') say(`  swap ${String(r.id)}`)
  }
  if (live.length > 0) {
    say(`  그 사이 자원 ${String(live.length)}건`)
    for (const r of live.slice(-12)) say(`    ${JSON.stringify(r)}`)
  }
  return frame
}

try {
  mkdirSync(OUT, { recursive: true })
  await page.goto(url, { waitUntil: 'load', timeout: 180_000 })
  const start = page.getByRole('button', { name: '시작', exact: true })
  await start.waitFor({ timeout: 120_000 })
  await start.click({ timeout: 60_000 })
  await playOpening(page)
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
    null, { timeout: 180_000 })
  await page.waitForFunction(() => (document.documentElement.dataset.map ?? '') !== '',
    null, { timeout: 60_000 }).catch(() => {})
  for (let i = 0, quiet = 0; i < 400 && quiet < 8; i++) {
    if ((await marks()).talk === undefined) { quiet += 1; await page.waitForTimeout(150); continue }
    quiet = 0
    await tap('Space')
  }
  await page.waitForTimeout(2000)

  const before = await shootCanvas(page, { path: resolve(OUT, '01-안-나온-판.png') })
  say(`안 나온 판 — 색 ${String(before.stats.colors)} → ${looksDrawn(before.stats) ? '나온다' : '**비었다**'}`)
  const a = await traceOne('안 나온 판')
  say(`  블릿이 읽는 타깃을 되읽었다 ${JSON.stringify(await page.evaluate(() => window.__readBack()))}`)

  // 살려 내는 것으로 알려진 한 수 — 감싼 자리의 CSS 너비 1px
  await page.evaluate(() => {
    document.querySelector('#stage-wrap').style.width = 'calc(100% - 1px)'
  })
  await page.waitForTimeout(2500)
  const after = await shootCanvas(page, { path: resolve(OUT, '02-나온-판.png') })
  say(`\n나온 판 — 색 ${String(after.stats.colors)} → ${looksDrawn(after.stats) ? '나온다' : '**비었다**'}`)
  const b = await traceOne('나온 판')
  say(`  블릿이 읽는 타깃을 되읽었다 ${JSON.stringify(await page.evaluate(() => window.__readBack()))}`)

  writeFileSync(resolve(OUT, '추적.json'), `${JSON.stringify({ before: a, after: b }, null, 1)}\n`)
} catch (e) {
  say(`터졌다: ${String(e?.message ?? e)}`)
} finally {
  await browser.close()
  vite?.child.kill()
  writeFileSync(resolve(ROOT, '.audit/trace41.txt'), `${out.join('\n')}\n`)
  console.log(`\n→ .audit/trace41.txt · ${OUT}`)
}
