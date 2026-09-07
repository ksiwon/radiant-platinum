// §41 **최소 재현 사다리** — 진단용이다. 게임을 안 띄우고, 어느 단에서 처음
// 화면이 안 나오는지만 찾는다.
//
//     node tools/e2e/_ladder41.mjs [--only=raw] [--gpu=default] [--channel=chrome] [--headed]
//
// ⚠️ **한 단마다 새 맥락이다.** 앞 단에서 크기를 흔들어 살아난 상태가 다음 단의
// 판정에 새어 들면 안 된다. 그리고 **각 단은 조건 하나만 다르다.**
//
// ⚠️ **화면 전체의 차이로 판정하지 않는다.** 하늘색으로 지우기만 해도 검은 페이지
// 배경과는 100% 다르다 — 그 자로는 **도형이 하나도 없어도 통과한다.** 그래서
// 여기서 보는 것은 셋이다:
//
//   ① 도형 자리(ROI 안)와 배경 자리(ROI 밖)의 색이 갈리는가
//   ② 도형을 **옮긴 뒤** 같은 ROI가 달라지는가
//   ③ 프레임 수가 느는가 — 함수가 불리는 것까지만 말한다. 이것만으로는 통과가 아니다
//
// 음성 대조군 둘을 같은 판에 둔다: **도형을 안 그린 판**과 **한 프레임에 멎은
// 판**. 둘이 거절되지 않으면 자가 고장 난 것이고, 그때는 사다리 전체가 무효다.
//
// ⚠️ **vite도 앱 코드도 안 쓴다** (R3F 단만 예외). 앱의 부모 CSS·라우터·상태가
// 안 섞여야 경계가 어디인지 말할 수 있다. `http`로 내주는 이유는 보안 컨텍스트가
// 아니면 `navigator.gpu` 자체가 안 뜨기 때문이다 (`tools/gpuFlags.mjs`).
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { SHAPE_GAP, roiGap, roiMean, shootCanvas } from './canvasShot.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (n, d = null) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`))
  return hit === undefined ? d : hit.slice(n.length + 3)
}
const VIEW = { width: 960, height: 640 }
const CHANNEL = flag('channel')
const HEADED = args.includes('--headed')
const PROFILE = flag('gpu', CHANNEL === null ? 'webgpu' : 'default')
const ARGS = gpuArgs(PROFILE)

/** 도형이 서는 자리와, 도형이 절대 안 닿는 배경 자리 */
const ROI = { x: 420, y: 250, w: 120, h: 140 }
const BG = { x: 20, y: 20, w: 120, h: 120 }

/** 실행 하나마다 제 자리를 판다 — **부분 실행이 전체 기록을 덮지 않는다** */
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT = resolve(ROOT, `shots/ladder41/${STAMP}`)

/** 게임과 **같은 모양의 자리**에 캔버스를 둔다 — `scene/Stage`의 `#stage-wrap` */
const SHELL = (script) => `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#000}#stage-wrap{position:fixed;inset:0}
#stage-wrap>div{position:relative;width:100%;height:100%}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three.webgpu.js","three/webgpu":"/three.webgpu.js",
"three/tsl":"/three.tsl.js","three/addons/":"/addons/"}}</script>
<div id="stage-wrap"><div></div></div>
<script type="module">${script}</script>`

/**
 * 맨 WebGPU 하나. **지움색은 고정**이고 움직이는 것은 도형뿐이다.
 *
 * ⚠️ **지움색을 시간에 따라 흔들면 안 된다.** 한때 그랬는데, 그러면 화면 전체가
 * 프레임마다 달라져서 **도형이 하나도 없어도 「움직였다」로 읽힌다**
 */
const RAW = (poke = '') => `
const q = new URL(location.href).searchParams
const cv = document.createElement('canvas')
cv.width = ${String(VIEW.width)}; cv.height = ${String(VIEW.height)}
cv.style.width = '${String(VIEW.width)}px'; cv.style.height = '${String(VIEW.height)}px'
document.querySelector('#stage-wrap > div').append(cv)
const adapter = await navigator.gpu.requestAdapter()
const device = await adapter.requestDevice()
const ctx = cv.getContext('webgpu')
const format = navigator.gpu.getPreferredCanvasFormat()
const conf = () => ctx.configure({ device, format,
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC, alphaMode: 'opaque' })
conf()
const buf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
const mod = device.createShaderModule({ code: \`
@group(0) @binding(0) var<uniform> shift: vec4f;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array(vec2f(-0.25,-0.25), vec2f(0.25,-0.25), vec2f(-0.25,0.25),
                vec2f(-0.25,0.25), vec2f(0.25,-0.25), vec2f(0.25,0.25));
  return vec4f(p[i] + vec2f(shift.x, 0.0), 0, 1);
}
@fragment fn fs() -> @location(0) vec4f { return vec4f(0.88, 0.38, 0.19, 1.0); }\` })
const pipe = device.createRenderPipeline({ layout: 'auto',
  vertex: { module: mod, entryPoint: 'vs' },
  fragment: { module: mod, entryPoint: 'fs', targets: [{ format }] } })
const bind = device.createBindGroup({ layout: pipe.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: buf } }] })
let n = 0, shift = 0, frozen = false
const drawShape = q.get('shape') !== '0'
const draw = () => {
  n += 1
  device.queue.writeBuffer(buf, 0, new Float32Array([shift, 0, 0, 0]))
  const enc = device.createCommandEncoder()
  const pass = enc.beginRenderPass({ colorAttachments: [{
    view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store',
    clearValue: { r: 0.49, g: 0.70, b: 0.85, a: 1 } }] })
  if (drawShape) { pass.setPipeline(pipe); pass.setBindGroup(0, bind); pass.draw(6) }
  pass.end()
  device.queue.submit([enc.finish()])
  document.documentElement.dataset.frames = String(n)
}
const frame = () => { if (!frozen) draw(); requestAnimationFrame(frame) }
requestAnimationFrame(frame)
// ⚠️ **프레임 관문을 지난 뒤에 멎어야 뜻이 있다.** 700ms에 멎게 했더니 60프레임에
// 못 닿아 하네스가 **시간 초과로 터졌고**, 그 터짐이 「제대로 거절」로 세어졌다 —
// 자를 시험하려던 판이 자를 안 거친 것이다
if (q.get('freeze') === '1') setTimeout(() => { frozen = true }, 2500)
window.__rung = { move: () => { shift = 0.55 } }
${poke}
`

/** three의 렌더러만 얹는다 — R3F도 앱도 없다 */
const THREE = (opts, post) => `
import * as T from '/three.webgpu.js'
import { pass } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
const host = document.querySelector('#stage-wrap > div')
const renderer = new T.WebGPURenderer(${opts})
await renderer.init()
host.append(renderer.domElement)
renderer.setPixelRatio(1)
renderer.setSize(${String(VIEW.width)}, ${String(VIEW.height)})
const scene = new T.Scene()
scene.background = new T.Color('#7eb2d8')
const cam = new T.PerspectiveCamera(55, ${String(VIEW.width / VIEW.height)}, 0.1, 100)
cam.position.set(0, 0, 5)
cam.lookAt(0, 0, 0)
const cube = new T.Mesh(new T.BoxGeometry(2, 2, 2),
  new T.MeshStandardMaterial({ color: '#e06030' }))
scene.add(cube, new T.DirectionalLight(0xffffff, 3), new T.AmbientLight(0xffffff, 1))
const chain = ${post
  ? `(() => {
  const p = new T.RenderPipeline(renderer)
  const color = pass(scene, cam).getTextureNode('output')
  p.outputNode = color.add(bloom(color, 0.3, 0.4, 0.9))
  return p
})()`
  : 'null'}
let n = 0
renderer.setAnimationLoop(() => {
  n += 1
  if (chain === null) renderer.render(scene, cam)
  else chain.render()
  document.documentElement.dataset.frames = String(n)
})
window.__rung = { move: () => { cube.position.x = 3 } }
`

/**
 * 단 하나.
 *
 * `touchesSize`가 참이면 그 단은 **스스로 크기나 자원 수명을 건드린다** —
 * 「아무것도 안 흔들고 나온다」의 증거로 세면 안 된다.
 * `expect`가 있으면 **음성 대조군**이고, 거절되어야 통과다
 */
const RUNGS = [
  {
    id: '0a-neg-clear-only',
    what: '**음성 대조군** — 지움색만, 도형 없음',
    page: SHELL(RAW()), query: '?shape=0', expect: 'reject',
  },
  {
    id: '0b-neg-frozen',
    what: '**음성 대조군** — 한 프레임 그리고 멎는다',
    page: SHELL(RAW()), query: '?freeze=1', expect: 'frozen',
  },
  { id: '1-raw', what: '맨 WebGPU 캔버스 하나', page: SHELL(RAW()) },
  {
    id: '2-raw-reconfigure',
    what: '맨 캔버스 + 첫 프레임 뒤 같은 크기로 `configure` 한 번 더',
    page: SHELL(RAW('setTimeout(() => { conf() }, 500)')),
    touchesSize: true,
  },
  {
    id: '3-raw-backing',
    what: '맨 캔버스 + backing을 1px 줄였다 **되돌린다**',
    page: SHELL(RAW('setTimeout(() => { cv.width -= 1; conf() }, 500)\n'
      + 'setTimeout(() => { cv.width += 1; conf() }, 900)')),
    touchesSize: true,
  },
  { id: '4-three', what: 'three 렌더러만 (MSAA 없음)', page: SHELL(THREE('{ alpha: false }', false)) },
  {
    id: '5-three-msaa',
    what: 'three + `antialias` (게임과 같은 설정)',
    page: SHELL(THREE('{ alpha: false, antialias: true }', false)),
  },
  {
    id: '6-three-alpha',
    what: 'three + `antialias` + `alpha` (R3F 기본값)',
    page: SHELL(THREE('{ alpha: true, antialias: true }', false)),
  },
  {
    id: '7-three-post',
    what: 'three + `antialias` + **TSL 후처리** (`bloomOnly`와 같은 그래프)',
    page: SHELL(THREE('{ alpha: false, antialias: true }', true)),
  },
  // ⚠️ 아래 단들은 **vite가 필요하다** — React와 R3F를 실제로 묶어야 한다.
  // 페이지는 `tools/e2e/rungs/`에 있다. `vite build`의 진입점은 `index.html`
  // 하나뿐이라 배포물에는 한 바이트도 안 들어간다
  { id: '8-r3f', what: 'R3F + 비동기 gl 팩토리 (R3F가 스스로 그린다)', vite: '/tools/e2e/rungs/r3f.html?drive=auto' },
  { id: '9-r3f-useframe', what: 'R3F + `useFrame(…, 1)`에서 우리가 그린다', vite: '/tools/e2e/rungs/r3f.html?drive=useframe' },
  { id: '10-r3f-post', what: 'R3F + `useFrame(…, 1)` + TSL 후처리 (게임과 같은 한 벌)', vite: '/tools/e2e/rungs/r3f.html?drive=useframe&post=1' },
]

const only = flag('only')
const list = only === null ? RUNGS : RUNGS.filter((r) => r.id.includes(only))
if (list.length === 0) { console.error(`--only=${String(only)}에 맞는 단이 없다`); process.exit(2) }

let vite = null
if (list.some((r) => r.vite !== undefined)) {
  vite = await startVite(await freePort(), 'node_modules/.vite-first')
}
const port = await freePort()
const pages = new Map(list.filter((r) => r.vite === undefined).map((r) => [`/${r.id}`, r.page]))
const server = createServer((req, res) => {
  const path = req.url.split('?')[0]
  // ⚠️ `three.webgpu.js`는 **혼자 안 온다** — 옆의 `three.core.js`를 상대 경로로 끌어온다
  if (/^\/three[.\w]*\.js$/.test(path)) {
    res.writeHead(200, { 'content-type': 'text/javascript' })
    createReadStream(resolve(ROOT, `node_modules/three/build${path}`)).pipe(res)
    return
  }
  if (path.startsWith('/addons/')) {
    res.writeHead(200, { 'content-type': 'text/javascript' })
    createReadStream(resolve(ROOT, `node_modules/three/examples/jsm/${path.slice(8)}`)).pipe(res)
    return
  }
  const body = pages.get(path)
  if (body === undefined) { res.writeHead(404); res.end('없다'); return }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(body)
})
await new Promise((ok) => { server.listen(port, '127.0.0.1', ok) })

const browser = await chromium.launch({
  args: ARGS, headless: !HEADED, ...(CHANNEL === null ? {} : { channel: CHANNEL }),
})
const browserVersion = browser.version()
mkdirSync(OUT, { recursive: true })
const out = []
const say = (t) => { console.log(t); out.push(t) }
say(`브라우저 ${browserVersion}${CHANNEL === null ? ' (번들 크로미움)' : ` (${CHANNEL})`}`
  + ` · ${HEADED ? 'headed' : 'headless'} · 프로필 ${PROFILE}`
  + ` · 우리가 준 깃발 ${ARGS.length === 0 ? '없음' : ARGS.join(' ')}`)
say(`고른 단 ${String(list.length)}/${String(RUNGS.length)} — ${list.map((r) => r.id).join(' · ')}`)

const results = []
for (const rung of list) {
  const one = { id: rung.id, what: rung.what, touchesSize: rung.touchesSize === true, bad: [] }
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => { one.bad.push(String(e.message).slice(0, 160)) })
  page.on('console', (m) => { if (m.type() === 'error') one.bad.push(m.text().slice(0, 160)) })
  try {
    const at = rung.vite === undefined
      ? `http://127.0.0.1:${String(port)}/${rung.id}${rung.query ?? ''}`
      : `${vite.url}${rung.vite}`
    await page.goto(at, { timeout: 180_000 })
    await page.waitForFunction(() => Number(document.documentElement.dataset.frames ?? 0) > 60,
      null, { timeout: 60_000 })
    await page.waitForTimeout(1200)

    const before = await shootCanvas(page, { path: resolve(OUT, `${rung.id}-1.png`) })
    one.frames = Number(await page.evaluate(() => document.documentElement.dataset.frames))
    one.shape = Number(roiGap(roiMean(before.png, ROI), roiMean(before.png, BG)).toFixed(1))

    // 도형을 옮긴다 — **같은 ROI가 달라져야** 화면이 살아 있는 것이다
    await page.evaluate(() => { window.__rung?.move() })
    await page.waitForTimeout(1200)
    const after = await shootCanvas(page, { path: resolve(OUT, `${rung.id}-2.png`) })
    one.frames2 = Number(await page.evaluate(() => document.documentElement.dataset.frames))
    one.moved = Number(roiGap(roiMean(before.png, ROI), roiMean(after.png, ROI)).toFixed(1))
    one.steady = before.steady && after.steady
    one.drew = one.shape > SHAPE_GAP
    one.updates = one.moved > SHAPE_GAP
    one.ok = one.drew && one.updates && one.steady
  } catch (e) {
    one.crash = String(e?.message ?? e).slice(0, 200)
    one.ok = false
  } finally {
    await page.close()
  }

  // 음성 대조군은 **거절되어야** 통과다
  const want = rung.expect ?? 'draw'
  one.verdict = want === 'reject' ? (one.drew ? '거짓 통과' : '제대로 거절')
    : want === 'frozen' ? (one.updates ? '거짓 통과' : '제대로 거절')
      : one.ok ? '나온다' : '안 나온다'
  one.pass = want === 'draw' ? one.ok === true : one.verdict === '제대로 거절'
  results.push(one)
  say(`  ${one.pass ? '✓' : '✗'} ${rung.id}  ${rung.what}`
    + `${one.touchesSize ? '  〈크기·자원을 스스로 건드리는 단〉' : ''}`)
  say(`        ${one.verdict} · 도형 대비 ${String(one.shape ?? '-')} · 옮긴 뒤 차이 ${String(one.moved ?? '-')}`
    + ` · 프레임 ${String(one.frames ?? '-')}→${String(one.frames2 ?? '-')} · 흔들림 없음 ${String(one.steady)}`
    + `${one.crash ? ` · 터졌다 ${one.crash}` : ''}`
    + `${one.bad.length > 0 ? ` · 오류 ${JSON.stringify(one.bad.slice(0, 2))}` : ''}`)
}

await browser.close()
server.close()
vite?.child.kill()

// ⚠️ **음성 대조군이 안 걸리면 사다리 전체가 무효다** — 자가 아무것도 안 잡는 것이다
const negatives = results.filter((r) => RUNGS.find((x) => x.id === r.id)?.expect !== undefined)
const yardstickOk = negatives.length > 0 && negatives.every((r) => r.pass)
const failed = results.filter((r) => !r.pass)
say('')
say(negatives.length === 0
  ? '⚠️ 음성 대조군을 안 돌렸다 — 이 판으로 「자가 멀쩡하다」를 말할 수 없다'
  : yardstickOk
    ? '자는 멀쩡하다 (음성 대조군 둘 다 제대로 거절)'
    : '⚠️ **자가 고장 났다** — 음성 대조군이 통과했다')
say(failed.length === 0
  ? '고른 단 전부 통과'
  : `${String(failed.length)}단이 떨어졌다: ${failed.map((r) => r.id).join(' · ')}`)

const record = {
  at: new Date().toISOString(),
  browser: browserVersion, channel: CHANNEL, headed: HEADED,
  profile: PROFILE, argsWeGave: ARGS, view: VIEW,
  selected: list.map((r) => r.id), ofTotal: RUNGS.map((r) => r.id),
  roi: { shape: ROI, background: BG, gap: SHAPE_GAP },
  yardstickOk, results,
}
writeFileSync(resolve(OUT, '실행.json'), `${JSON.stringify(record, null, 1)}\n`)
writeFileSync(resolve(OUT, '실행.txt'), `${out.join('\n')}\n`)
console.log(`\n→ ${OUT}`)
// ⚠️ **진단 명령의 종료 0을 전체 성공의 대용으로 쓰지 않는다**
process.exit(failed.length === 0 && yardstickOk ? 0 : 1)
