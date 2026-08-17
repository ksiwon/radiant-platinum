// 처음 화면부터 엔딩까지 **실제 화면을 띄워** 훑는다
//
//     pnpm story                    셋 다 (시작 · 장면 67개 · 엔딩)
//     pnpm story --only=gym1,forest  그 장면만
//     pnpm story --from=gym4        거기서부터 끝까지
//     pnpm story --act=2            막 하나만 (1 시작 · 2 장면 · 3 엔딩)
//     pnpm story --fight            배틀 장면을 **끝까지** 치른다 (느리다)
//     pnpm story --chain            장면 사이에 화면을 안 새로 연다 (샘 찾기)
//     pnpm story --url=http://…     이미 떠 있는 개발 서버를 쓴다
//
// ⚠️ **왜 걸어서 안 하는가.** 원작을 처음부터 엔딩까지 걸으면 사람도 스무 시간이
// 넘고, 우리 하네스는 떡잎마을에서 202번도로까지 가는 데만 15분을 쓴다
// (`drive.mjs`). 그 방식으로 예순여덟 장면을 다 밟으려면 하루가 걸리고, 하루가
// 걸리는 검사는 **아무도 안 돌린다** — 안 돌리는 검사는 없는 검사다.
//
// 그래서 이야기의 **뼈대**를 확인 지점 표(`engine/dev/checkpoints.ts`)에서 받는다.
// 그 표는 이미 이야기 순서로 늘어놓은 예순여덟 자리이고, 순서가 곧 진행도다.
// 한 자리씩 뛰어들어 **그 장면을 실제로 그리고 실제로 몰아 본다.**
//
// ⚠️ **이 방법이 증명하는 것과 못 하는 것을 갈라 적는다.**
//
//   · 증명한다 — 장면 하나하나가 뜨고, 그려지고, 움직이고, 안 멈춘다
//   · 증명 못 한다 — 장면과 장면 **사이**를 걸어서 이을 수 있는가
//
// 사이를 잇는 것은 ①(새 게임 → 오프닝 → 오버월드)과 `run.mjs`의 ㉖(떡잎마을 →
// 201·202번도로 → 상점·배틀)이 걸어서 잰다. 여기서는 그 둘을 **안 겹쳐 센다.**
//
// ⚠️ **뒷문이 아니다.** 확인 지점은 개발 빌드에만 있고(`import.meta.env.DEV`로
// 감싼 동적 import), 프로덕션 번들에는 청크로도 안 나온다. 여기서 밖에서 읽는
// 것은 `<html>`의 읽기 전용 표식뿐이다 (`app/sceneMark.ts`).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { looksFlat, statsOf } from '../shot/png.mjs'
import { playOpening } from './drive.mjs'
import { missingData } from './route.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/story')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}
const list = (name) => (flag(name) ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const ONLY = list('only')
const FROM = flag('from')
const ACTS = new Set(list('act').length > 0 ? list('act') : ['1', '2', '3'])
const FIGHT = args.includes('--fight')
/** 장면마다 화면을 새로 여는가. 안 열면 앞 장면이 남긴 것이 다음 장면에 얹힌다 */
const FRESH = !args.includes('--chain')

/**
 * ⚠️ **ANGLE 백엔드를 못 박는다.** 안 그러면 헤드리스가 SwiftShader로 떨어져
 * 게임이 6FPS로 돈다 — 그러면 67개를 훑는 데 몇 시간이 걸리고, 프레임 시간은
 * 이 기계의 것이 아니라 소프트웨어 래스터라이저의 것이라 **뜻이 없다.**
 * 실제로 어느 쪽으로 떨어졌는지는 아래 `probeGpu`가 재서 표 머리에 적는다
 */
const GPU = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--enable-gpu', '--ignore-gpu-blocklist']

/** 찍고 재는 크기. 진짜 GPU를 못 잡으면 아래에서 줄인다 */
let VIEW = { width: 960, height: 640 }

/** 프레임 하나가 이보다 길면 눈에 보이는 끊김이다 (60FPS 기준 여섯 프레임) */
const HITCH_MS = 100
/** 고른 프레임 중 95%가 이 안에 들어와야 한다 (20FPS) */
const P95_MS = 50
/** 끊김이 이만큼 나오면 그 장면은 떨어진다 */
const HITCH_LIMIT = 3
/** 고요해지기를 기다리는 최대 시간 */
const SETTLE_MAX_MS = 15_000
/** 프레임을 재는 창 */
const FRAME_WINDOW_MS = 2_000

/** 무대가 실제로 어느 길로 그렸나 (`WebGPUBackend`인가 `WebGLBackend`인가) */
let backend = null

const rows = []
const add = (act, id, what, status, detail, extra = {}) => {
  rows.push({ act, id, what, status, detail, ...extra })
}

/**
 * 버튼 한 번.
 *
 * ⚠️ **`press`로는 안 눌린다.** 화면이 `keydown`/`keyup`으로 "누르고 있는가"를
 * 들고 매 프레임 그것을 보는데, 플레이라이트의 `press`는 두 사건 사이가 1ms도
 * 안 돼서 프레임 사이로 빠져나간다 (`drive.mjs`에서 실측했다)
 */
async function tap(page, key, hold = 70) {
  await page.keyboard.down(key)
  await page.waitForTimeout(hold)
  await page.keyboard.up(key)
  await page.waitForTimeout(50)
}

/** `<html>`에 적힌 것 — 우리가 밖에서 읽을 수 있는 전부다 */
const marks = (page) => page.evaluate(() => {
  const d = document.documentElement.dataset
  const [x, z] = (d.tile ?? '').split(',').map(Number)
  return {
    boot: d.boot ?? null, scene: d.scene ?? null, map: Number(d.map ?? -1),
    menu: d.menu ?? null, talk: d.talk === '1', script: d.script === '1',
    battle: d.battle ?? null, tile: d.tile ?? '', x, z,
    path: location.pathname,
  }
})

/**
 * **몸이 시뮬을 따라와 있는가, 그리고 팔이 제자리인가.**
 *
 * ⚠️ **`data-tile`은 이걸 못 잡는다.** 그 표식은 시뮬이 선 칸이라, 그림이 통째로
 * 뒤에 남아도 칸은 멀쩡히 바뀐다 — 실제로 「몸은 제자리에서 팔만 젓는데 카메라만
 * 따라간다」는 보고를 받고서야 알았고, 그때 이 막은 PASS였다. 그림이 붙는 자리는
 * `sceneRefs.player` 하나뿐이니 그것을 직접 읽는다.
 *
 * 자세도 같이 본다. 리그를 몸이 돌아 있는 채로 만들면 축이 그만큼 어긋나서
 * **팔이 머리 위로 올라간다** (`locomotion.createRig`). 손이 머리보다 위면 그것이다.
 */
const body = (page) => page.evaluate(async () => {
  const refs = (await import('/src/scene/sceneRefs.ts')).sceneRefs
  const ws = (await import('/src/state/worldState.ts')).worldState
  const p = refs.player
  if (!p) return { ref: null }
  const bones = {}
  for (const n of ['Head', 'LHand', 'RHand']) {
    let hit = null
    // ⚠️ **주인공 그룹 안에서만 찾는다** — 씬 전체를 훑으면 옆 NPC의 `Head`를 집는다
    p.traverse((o) => { if (!hit && o.name === n) hit = o })
    // 월드 행렬은 이번 프레임에 이미 갱신됐다. 그 넷째 열이 월드 위치고 [13]이 y다
    bones[n] = hit ? +hit.matrixWorld.elements[13].toFixed(3) : null
  }
  return {
    ref: p.children.some((c) => c.geometry?.type === 'CapsuleGeometry') ? '캡슐' : '모델',
    gap: +Math.hypot(p.position.x - ws.player.position.x, p.position.z - ws.player.position.z).toFixed(3),
    ...bones,
  }
})

/** 지금 무대가 무엇을 그리고 있나 (`scene/sceneRefs.ts`의 `perfSnapshot`) */
const perf = (page) => page.evaluate(async () => {
  try {
    const m = await import('/src/scene/sceneRefs.ts')
    return { ...m.perfSnapshot }
  } catch { return null }
})

// ── 프레임 자 ────────────────────────────────────────────────────────────────
//
// ⚠️ **게임이 세는 FPS를 그대로 믿지 않는다.** `perfSnapshot.fps`는 게임 루프가
// 자기를 센 것이라, 루프가 통째로 늦어도 "그 안에서는" 고르게 보인다. 밖에서
// `requestAnimationFrame` 간격을 직접 재야 **화면이 실제로 몇 번 갱신됐는지**가
// 나온다 — 끊김은 평균이 아니라 꼬리에 있다

const FRAME_PROBE = () => {
  globalThis.__fr = { at: [], on: false }
  const tick = (t) => {
    if (globalThis.__fr.on) globalThis.__fr.at.push(t)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function frameWindow(page, ms, during = null) {
  await page.evaluate(() => { globalThis.__fr.at = []; globalThis.__fr.on = true })
  const started = Date.now()
  if (during) await during()
  const left = ms - (Date.now() - started)
  if (left > 0) await page.waitForTimeout(left)
  const at = await page.evaluate(() => {
    globalThis.__fr.on = false
    return globalThis.__fr.at
  })
  const gaps = []
  for (let i = 1; i < at.length; i++) gaps.push(at[i] - at[i - 1])
  if (gaps.length < 8) return { frames: at.length, thin: true }
  const sorted = [...gaps].sort((a, b) => a - b)
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  return {
    frames: at.length,
    thin: false,
    fps: Math.round(1000 / (sorted.reduce((s, n) => s + n, 0) / sorted.length)),
    p50: Math.round(pick(0.5) * 10) / 10,
    p95: Math.round(pick(0.95) * 10) / 10,
    worst: Math.round(sorted[sorted.length - 1] * 10) / 10,
    hitches: gaps.filter((g) => g > HITCH_MS).length,
  }
}

/**
 * 진짜 GPU를 잡았는가.
 *
 * ⚠️ **여기서 갈리는 것이 크다.** 소프트웨어 래스터라이저면 프레임 시간은 이
 * 기계의 것이 아니므로 **끊김을 판정하면 안 된다.** 안 잰 것을 통과로도, 실패로도
 * 세지 않는다 — 표에 「못 잼」으로 적고 넘어간다
 */
async function probeGpu(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    if (!gl) return { renderer: '(WebGL 없음)', software: true, webgpu: 'gpu' in navigator }
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '(가려짐)'
    return {
      renderer,
      software: /swiftshader|llvmpipe|software|paint/i.test(renderer),
      webgpu: 'gpu' in navigator,
    }
  })
}

// ── 화면 열기 ────────────────────────────────────────────────────────────────

// ⚠️ **없는 자료를 브라우저 앞에서 만나지 않는다.** 이 하네스는 길을
// `route.mjs`가 계산한 대로 걷고, 그 재료는 `pnpm extract`가 굽는 개발
// 산출물이다. 없으면 크로미움을 띄우고 몇 분 걸은 뒤에야 죽으므로, 여기서
// 무엇이 없는지 적고 선다 — "돌렸는데 실패"와 "못 쟀다"는 다른 것이다
{
  const gone = missingData()
  if (gone.length > 0) {
    console.error(`길을 계산할 자료가 없다 — public/data/{${gone.join(' · ')}}`)
    console.error('`pnpm extract`로 구운 뒤에 다시 돌린다. 이야기는 안 쟀다.')
    process.exit(2)
  }
}

let vite = null
let url = flag('url')
if (!url) {
  vite = await startVite(await freePort())
  url = vite.url
}

const browser = await chromium.launch({ args: GPU })
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 })
await context.addInitScript(FRAME_PROBE)
const page = await context.newPage()

/** 지금 재고 있는 장면이 낸 소리. 장면마다 비운다 */
let noise = []
/** 우리 것이 아니라 못 고치는 소리. **안 세는 것이 아니라 따로 센다** */
const known = new Map()
const NOISE_OK = [
  /ResizeObserver/,
  /Download the React DevTools/,
  /\[vite\]/,
  /Failed to load resource: net::ERR_ABORTED/,
  // `@react-three/fiber`가 자기 안에서 `new Clock()`을 쓴다. 우리 코드에는
  // `Clock`이 한 군데도 없다 — 고치려면 그쪽 판을 올려야 한다
  /THREE\.Clock: This module has been deprecated/,
  // 크로미움이 윈도우에서 `requestAdapter({powerPreference})`를 무시한다고
  // 알리는 것이다 (crbug 369219127). 브라우저 쪽 알림이라 우리가 못 없앤다
  /powerPreference option is currently ignored/,
  // ⚠️ **이 둘은 거르되 잊으면 안 된다.** 헤드리스 크로미움은 WebGPU 어댑터를
  // 못 만들어(`Device failed at creation`) 우리 렌더러가 WebGL2로 내려앉는다 —
  // 즉 여기서 재는 프레임은 **사용자가 쓸 길이 아니라 폴백 길**의 것이다.
  // 어느 백엔드에서 쟀는지는 표 아래에 적는다
  /WebGPU is not available, running under WebGL2 backend/,
  /Device failed at creation/,
]
page.on('console', (m) => {
  if (m.type() !== 'error' && m.type() !== 'warning') return
  const text = m.text()
  if (NOISE_OK.some((re) => re.test(text))) {
    const key = text.slice(0, 80)
    known.set(key, (known.get(key) ?? 0) + 1)
    return
  }
  noise.push(`${m.type()}: ${text.slice(0, 200)}`)
})
page.on('pageerror', (e) => { noise.push(`pageerror: ${String(e.message).slice(0, 200)}`) })

/**
 * 지금 무슨 스크립트가 도는가.
 *
 * ⚠️ **「스크립트가 안 끝난다」만 적으면 고칠 데를 못 찾는다.** 어느 번호가
 * 물려 있는지, 원작 스크립트인지 우리 글인지까지 나와야 그 자리를 열어 본다
 */
const scriptInfo = () => page.evaluate(async () => {
  try {
    const f = await import('/src/engine/script/field.ts')
    const w = f.fieldScripts.world
    return {
      ctx: f.fieldScripts.ctx !== null,
      id: w?.scriptID ?? null,
      error: f.fieldScripts.lastError ?? null,
    }
  } catch { return null }
})

/**
 * 컷신이 **한 눈금이라도 나아갔는가**를 나타내는 지문.
 *
 * ⚠️ **화면 글자로 세지 않는다.** 두 가지 이유가 있다. 하나는 롬에서 온 글이
 * 로그에 남으면 안 되는 것이고 (COPYRIGHT.md §6), 다른 하나는 화면에 FPS 표시가
 * 같이 떠 있어서 **매 프레임 달라지는 지문**이 되기 때문이다 — 그러면 얼어붙은
 * 것도 "움직이고 있다"로 읽힌다.
 *
 * 대신 스크립트의 **읽기 위치**를 본다. 거기서 안 움직이는 동안에도 `WaitMovement`
 * 는 사람을 옮기고 `Message`는 글자를 찍으므로, 사람 좌표와 「다 찍었나」를 같이
 * 센다. 넷이 다 그대로면 그때가 진짜 멎은 것이다
 */
const beat = () => page.evaluate(async () => {
  try {
    const f = await import('/src/engine/script/field.ts')
    const n = await import('/src/engine/actor/npcs.ts')
    const w = f.fieldScripts.world
    let sum = 0
    for (const a of n.npcActors.list) sum += Math.round((a.x + a.z) * 64)
    return [
      f.fieldScripts.ctx?.pointer ?? -1,
      f.fieldScripts.ctx?.state ?? '-',
      w?.printed === true ? 1 : 0,
      document.documentElement.dataset.tile ?? '',
      sum,
    ].join('|')
  } catch { return '?' }
})

/**
 * 타이틀이 뜰 때까지. 타이틀에는 캔버스가 없어서 **글**로 기다린다.
 *
 * ⚠️ **안 뜨면 왜 안 뜨는지를 같이 던진다.** 그냥 `TimeoutError`만 나오면
 * 「느린 것」과 「부팅에서 터진 것」이 밖에서 똑같이 보인다 — 실제로 빈 화면
 * 앞에서 한참을 서버 탓으로 봤다
 */
async function openTitle() {
  noise = []
  await page.goto(url, { waitUntil: 'load' })
  try {
    await page.waitForFunction(() => document.body.innerText.trim().length > 0,
      null, { timeout: 120_000 })
  } catch {
    const boot = await page.evaluate(() => document.documentElement.dataset.boot ?? '(없다)')
    throw new Error(`타이틀이 2분 안에 안 떴다 — 갈래 ${boot}`
      + (noise.length > 0 ? ` · 콘솔: ${noise.slice(0, 2).join(' / ')}` : ' · 콘솔 조용함'))
  }
}

await openTitle()
const gpu = await probeGpu(page)
if (gpu.software) {
  // 소프트웨어 래스터라이저에서 960×640은 4~7FPS다. 픽셀 수가 곧 속도라
  // 9분의 1로 줄여야 67개를 사람이 기다릴 수 있는 시간에 훑는다
  VIEW = { width: 320, height: 214 }
  await page.setViewportSize(VIEW)
}
console.log(`화면 ${VIEW.width}×${VIEW.height} · 렌더러 ${gpu.renderer}`
  + ` · WebGPU ${gpu.webgpu ? '있다' : '없다'}`
  + (gpu.software ? ' — ⚠️ 소프트웨어라 프레임 시간은 안 잰다' : ''))

/** 확인 지점 표를 **화면이 쓰는 그것에서** 받는다 (여기 또 적으면 조용히 갈린다) */
const CHECKPOINTS = await page.evaluate(async () => {
  const m = await import('/src/engine/dev/checkpoints.ts')
  return m.CHECKPOINTS.map((c) => ({
    id: c.id, label: c.label, map: c.map,
    battle: c.battle?.kind ?? null, postGame: c.postGame === true,
  }))
})

// ── ① 처음 화면 → 새 게임 → 오프닝 → 오버월드 ────────────────────────────────
//
// ⚠️ **여기서는 손잡이를 안 쓴다.** ②가 확인 지점으로 뛰는 것과 달리, 이 막은
// 사람이 하는 그대로다 — 버튼 하나와 키보드뿐이다. 게임에 **들어가는 길**이
// 살아 있는지는 이 막만 증명한다

if (ACTS.has('1')) {
  const t0 = Date.now()
  try {
    noise = []
    const start = page.getByRole('button', { name: '시작', exact: true })
    // 롬 글이라 판마다 다르다. 못 찾으면 타이틀의 첫 버튼을 누른다
    const button = await start.count() > 0 ? start : page.getByRole('button').first()
    await button.click({ timeout: 60_000 })
    await page.waitForFunction(() => location.pathname === '/intro', null, { timeout: 60_000 })
    const intro = Date.now()
    const after = await playOpening(page, 'TESTER')
    if (after !== '/play') throw new Error(`오프닝이 안 끝났다 — ${after}`)
    await page.waitForSelector('canvas', { timeout: 120_000 })
    // 오버월드가 실제로 서고, 걸을 수 있는가
    let at = await marks(page)
    for (let i = 0; i < 120 && (at.scene !== 'overworld' || at.talk || at.script); i++) {
      await tap(page, 'Space')
      at = await marks(page)
    }
    if (at.scene !== 'overworld') throw new Error(`오버월드에 못 섰다 — ${JSON.stringify(at)}`)
    const before = at.tile
    let moved = false
    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
      await page.keyboard.down(key)
      await page.waitForTimeout(420)
      await page.keyboard.up(key)
      await page.waitForTimeout(120)
      if ((await marks(page)).tile !== before) { moved = true; break }
    }
    if (!moved) throw new Error(`네 방향 다 못 걸었다 — 칸 ${before}`)
    // ⚠️ **칸이 바뀐 것만으로 「걸었다」고 하지 않는다.** 칸은 시뮬이고, 몸이
    // 뒤에 남아도 그건 바뀐다. 성별을 고르면 모델을 다시 읽는데 그때 자리를
    // 놓치면 **몸은 제자리에서 팔만 젓는다** (`PlayerModel`·`GreyBox`)
    const b = await body(page)
    if (b.ref === null) throw new Error('몸이 씬에 안 붙어 있다 — sceneRefs.player가 null이다')
    if (b.ref === '캡슐') throw new Error('폴백 캡슐이 주인공 자리에 남아 있다')
    // 보간 지연은 한 프레임어치다. 실측 0.04m — 반 칸이면 안 따라온 것이다
    if (b.gap > 0.5) throw new Error(`몸이 시뮬에서 ${b.gap}m 떨어져 있다`)
    if (b.Head !== null && b.LHand !== null && (b.LHand > b.Head || b.RHand > b.Head)) {
      throw new Error(`손이 머리 위로 올라갔다 — 머리 ${b.Head} 왼손 ${b.LHand} 오른손 ${b.RHand}`)
    }
    const bad = noise.slice(0, 3)
    if (bad.length > 0) throw new Error(`콘솔: ${bad.join(' / ')}`)
    add('①', 'open', '새 게임 → 오프닝 → 오버월드 → 걷기', 'PASS',
      `오프닝 ${((Date.now() - intro) / 1000).toFixed(0)}초 · 맵 ${at.map} 칸 ${at.tile} · `
      + `몸이 시뮬에서 ${b.gap}m · 손 ${b.LHand}/머리 ${b.Head} · `
      + `모두 ${((Date.now() - t0) / 1000).toFixed(0)}초 · 콘솔 0건`)
  } catch (e) {
    add('①', 'open', '새 게임 → 오프닝 → 오버월드 → 걷기', 'FAIL',
      String(e.message ?? e).slice(0, 300))
  }
} else add('①', 'open', '새 게임 → 오프닝 → 오버월드 → 걷기', 'NOT RUN', '--act로 걸렀다')

// ── ② 장면 예순여덟 ──────────────────────────────────────────────────────────

/** 확인 지점 하나로 뛰어든다. 표가 뜨고, 그 줄을 눌러, 그 맵에 설 때까지 */
async function warpTo(cp) {
  await page.keyboard.press('Backquote')
  await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
  // ⚠️ **↓를 세어서 고르지 않는다.** 목록이 뜬 직후에는 키가 몇 개 흘러서 엉뚱한
  // 줄에서 뛰어드는데, 그래도 화면은 멀쩡히 나오므로 다른 맵을 찍어 놓고 맞다고
  // 하기 십상이다 (`shot.mjs`에서 두 번 헛돌았다). 줄을 직접 누른다
  const row = page.locator(`[data-checkpoint="${cp.id}"]`).first()
  await row.hover()
  await page.waitForTimeout(150)
  await row.click()
  await page.waitForURL('**/play', { timeout: 60_000 })
  await page.waitForFunction(async (want) => {
    const m = await import('/src/engine/map/world.ts')
    return m.world.mapId === want
  }, cp.map, { timeout: 90_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
}

/**
 * 고요해질 때까지 기다린다 — 삼각형 수가 멎고, 대사도 스크립트도 없을 때까지.
 *
 * ⚠️ **고정 시간으로 기다리지 않는다.** 6초를 못 박으면 다 붙은 장면에서도 6초를
 * 버리고, 느린 장면에서는 **덜 붙은 채로** 재서 삼각형이 뚝 떨어진 것을 결함으로
 * 읽는다. 붙기를 멈춘 것을 보고 넘어간다
 */
async function settle() {
  const till = Date.now() + SETTLE_MAX_MS
  let last = -1
  let same = 0
  while (Date.now() < till) {
    const p = await perf(page)
    const tri = p?.triangles ?? 0
    same = tri === last ? same + 1 : 0
    last = tri
    if (same >= 3 && tri > 0) return { tri, draws: p?.drawCalls ?? 0, backend: p?.backend ?? '?' }
    await page.waitForTimeout(250)
  }
  const p = await perf(page)
  return { tri: p?.triangles ?? 0, draws: p?.drawCalls ?? 0, backend: p?.backend ?? '?', slow: true }
}

/**
 * 도는 컷신을 **끝까지** 민다.
 *
 * ⚠️ **길다고 고장이 아니다.** 처음에 15초로 끊었더니 주인공 방의 첫 장면
 * (라이벌이 뛰어드는 그것, 스크립트 10)이 「스크립트가 안 끝난다」로 떨어졌다 —
 * 원작 그대로 대사 여섯에 걸음 여덟이 든 장면이라 15초로는 원래 안 끝난다.
 * 그래서 **시간이 아니라 멈춤으로 판정한다**: 지문이 안 바뀐 채로 `FREEZE_MS`가
 * 지나야 얼었다고 적는다
 *
 * ⚠️ **컷신이 배틀을 연다. 그동안 `beat()`는 못 움직인다.** 스크립트는
 * `StartTrainerBattle`·`StartLegendaryBattle`에서 「끝날 때까지」 서 있으므로
 * 포인터도 칸도 사람 좌표도 다 그대로다 — 곧 **멀쩡히 도는 배틀이 20초마다
 * 「얼었다」로 적힌다.** 실측으로 리그 로비가 93번, 시작의 방이 162번에서
 * 그렇게 떨어졌는데, 역어셈블로 보니 둘 다 배틀 명령 **바로 다음**에 선
 * 정상이었다 (맵 175 스크립트 4 포인터 509 · 맵 510 스크립트 2 포인터 141).
 * 그래서 배틀이 열리면 **배틀을 미는 쪽으로 넘긴다** — 사람이 하는 그대로다
 */
const CUTSCENE_MS = 180_000
const FREEZE_MS = 20_000
async function runScripts(budgetMs = CUTSCENE_MS) {
  const till = Date.now() + budgetMs
  let seen = await beat()
  let changed = Date.now()
  let taps = 0
  /** 컷신 안에서 치른 배틀. 몇 판이든 마지막 것을 남긴다 */
  let fought = null
  while (Date.now() < till) {
    const at = await marks(page)
    if (at.scene === 'battle') {
      fought = await pushBattle(till - Date.now())
      taps += fought.taps
      if (fought.frozen) return { done: false, frozen: true, taps, at: fought.at, fought }
      // 배틀이 끝나면 스크립트가 이어 달린다. 지문을 새로 잡고 다시 민다
      seen = await beat()
      changed = Date.now()
      continue
    }
    if (!at.talk && !at.script) return { done: true, taps, fought }
    await tap(page, 'Space', 50)
    taps++
    const now = await beat()
    if (now !== seen) { seen = now; changed = Date.now() }
    else if (Date.now() - changed > FREEZE_MS) {
      return { done: false, frozen: true, taps, at: seen, fought }
    }
  }
  return { done: false, taps, at: seen, fought }
}

/**
 * 지금 키를 누가 들고 있나.
 *
 * ⚠️ **포켓치를 크게 펼치면 걸을 수 없다** — 원작의 아래 화면을 한 화면에 얹은
 * 것이라 그동안은 포켓치가 키를 가져간다 (`PoketchWidget`의 `setUiCapture`).
 * 그걸 모르고 209번도로 지점을 「네 방향 다 못 걸었다」로 적었는데, 사람이라면
 * R을 한 번 톡 눌러 접었을 자리다
 */
const grabbed = () => page.evaluate(async () => {
  try {
    const k = await import('/src/engine/input/keys.ts')
    const p = await import('/src/state/poketchStore.ts')
    return { ui: k.isUiCaptured(), poketch: p.usePoketchStore.getState().view }
  } catch { return { ui: false, poketch: 'hidden' } }
})

/**
 * 못 걸었을 때 **왜인지**를 그 자리에서 받아 적는다.
 *
 * ⚠️ 「네 방향 다 못 걸었다」 한 줄만 남으면 발이 묶인 것인지 사방이 막힌 것인지
 * 키를 누가 들고 있는 것인지가 표에서 안 갈린다 — 주인공 방이 한 번은 떨어지고
 * 한 번은 통과해서, 다시 돌려 보는 것 말고는 알 길이 없었다
 */
const whyStuck = () => page.evaluate(async () => {
  try {
    const f = await import('/src/engine/script/field.ts')
    const k = await import('/src/engine/input/keys.ts')
    const z = await import('/src/engine/map/zone.ts')
    const o = await import('/src/engine/actor/obstacles.ts')
    const w = await import('/src/state/worldState.ts')
    const p = w.worldState.player
    const grid = z.activeZone.grid
    const at = (dx, dz) => {
      if (!grid) return '격자없음'
      const x = Math.floor(p.position.x) + dx
      const zz = Math.floor(p.position.z) + dz
      return (grid.isBlocked(x, zz) ? '막힘' : '열림')
        + (o.obstacleAt(x, zz) === null ? '' : '+객체')
    }
    return {
      busy: f.scriptBusy(), id: f.fieldScripts.world?.scriptID ?? null,
      at: f.fieldScripts.ctx?.pointer ?? null, ui: k.isUiCaptured(),
      pos: `${p.position.x.toFixed(2)},${p.position.z.toFixed(2)}`,
      N: at(0, -1), S: at(0, 1), W: at(-1, 0), E: at(1, 0),
    }
  } catch (e) { return { why: String(e).slice(0, 120) } }
})

/** 네 방향 중 하나로라도 걸어지는가 */
async function canWalk() {
  // 포켓치가 펼쳐져 있으면 접는다. ⚠️ **아무 때나 R을 누르면 안 된다** — 안
  // 펼쳐진 자리에서 누르면 그것이 포켓치를 **여는** 키다 (`toggleSize`)
  const who = await grabbed()
  if (who.ui && who.poketch === 'large') {
    await tap(page, 'KeyR', 60)
    const after = await grabbed()
    if (after.ui) return { moved: null, why: `UI가 키를 들고 있다 (포켓치 ${after.poketch})` }
  }
  const before = (await marks(page)).tile
  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
    await page.keyboard.down(key)
    // ⚠️ **누르기 전후만 견주면 안 된다.** 걸음이 장면을 열고, 그 장면이
    // 주인공을 **원래 자리로 되돌리는** 데가 있다 — 리그 로비가 그렇다
    // (두 칸 걸어 내려가면 배지를 보는 스크립트가 붙잡는다). 그러면 앞뒤가
    // 같아서 「네 방향 다 못 걸었다」로 적히는데, 실제로는 걸었다.
    // 누르고 있는 **동안**을 본다
    // ⚠️ **야생이 나오면 거기서 손을 뗀다.** 조우는 걸음이 끝나야 굴러가므로
    // 배틀이 떴다는 것 자체가 「걸었다」의 증거다. 그런데 그때 `data-tile`이
    // 멎어서 여기가 「못 걸었다」로 읽고 **남은 세 방향을 배틀 화면에다** 눌렀다 —
    // 명령 창의 커서가 「도구」로 가고 거기서 A가 가방을 열어, 진실호수의 야생전이
    // 144번을 눌러도 `running|4|1`에서 안 움직였다 (실측)
    // ⚠️ **성기게 보면 놓친다.** 한 걸음은 ~250ms인데 그사이 밟은 장면이 사람을
    // 제자리로 되돌리면 `data-tile`이 잠깐만 달랐다가 돌아온다. 110ms로 넷만
    // 보다가 주인공 방을 「못 걸었다」로 떨어뜨린 적이 있다 — 촘촘히, 좀 더 길게
    let saw = null
    let met = false
    for (let i = 0; i < 9; i++) {
      await page.waitForTimeout(70)
      const now = await marks(page)
      if (now.scene === 'battle') { met = true; break }
      if (now.tile !== before && now.tile !== '') { saw = now.tile; break }
    }
    await page.keyboard.up(key)
    await page.waitForTimeout(100)
    if (met) return { moved: true, from: before, to: before, encounter: true }
    if (saw !== null) return { moved: true, from: before, to: saw }
  }
  return { moved: false, from: before, to: before, stuck: await whyStuck() }
}

/** X로 시작 메뉴가 열리고 X로 닫히는가 */
async function menuOpensAndCloses() {
  await tap(page, 'KeyX', 90)
  const open = (await marks(page)).menu
  if (open === null) return { ok: false, why: '안 열렸다' }
  await tap(page, 'KeyX', 90)
  const shut = (await marks(page)).menu
  return shut === null ? { ok: true } : { ok: false, why: `안 닫혔다 (${shut})` }
}

/**
 * 배틀을 민다.
 *
 * ⚠️ **끝까지 치르는 것을 기본으로 안 둔다.** 사천왕과 챔피언은 6대6이라 한 판에
 * 몇 분이고, 그걸 다섯 판 하면 이 훑기가 한 시간을 넘는다. 기본은 **얼지 않는가**를
 * 재고 (`--fight`를 주면 끝까지 간다), 끝났는지 안 끝났는지를 표에 그대로 적는다
 */
/**
 * 배틀이 **한 눈금이라도 나아갔는가**.
 *
 * ⚠️ **`data-talk`·`data-menu`로는 못 센다.** 배틀 화면은 자기 안에서 목록을
 * 그리므로 그 표식이 배틀 내내 그대로다 — 처음에 그걸로 셌더니 멀쩡히 돌아가는
 * 체육관 배틀이 「얼었다」로 적혔다. 사건 수와 턴, 그리고 남은 체력을 본다
 */
const battleBeat = () => page.evaluate(async () => {
  try {
    const m = await import('/src/state/battleStore.ts')
    const s = m.useBattleStore.getState()
    // ⚠️ **`truth`가 아니라 `view`를 본다.** `truth`는 그 턴의 **최종** 상태라
    // 재생기가 박자를 하나씩 흘리는 동안 값이 그대로다 — 능력만 깎는 턴처럼
    // 체력이 안 변하는 박자가 이어지면 **멀쩡히 넘어가는 배틀이 「얼었다」로 적힌다**
    // (실측: 들판 체육관에서 「공격이 떨어졌다!」를 넘기는 중에 걸렸다).
    // `view`는 화면에 지금 보이는 것이라 박자마다 움직인다
    const v = s.view ?? s.truth
    let hp = 0
    for (const mon of Object.values(v?.active ?? {})) {
      hp += (mon?.hp ?? 0) + Object.values(mon?.boosts ?? {}).reduce((a, b) => a + b, 0) * 1000
    }
    // 「누구를 내보낼까」가 떠 있는가 — `BattleScreen`의 `forced`와 같은 식이다
    const moves = s.actions.filter((a) => a.type === 'move').length
    const swaps = s.actions.filter((a) => a.type === 'switch').length
    return {
      fp: `${s.phase}|${String(s.events.length)}|${String(v?.turn ?? -1)}|${String(hp)}|${String(s.outcome)}`,
      forced: moves === 0 && swaps > 0,
    }
  } catch { return { fp: '?', forced: false } }
})

/** 파티 최대 칸. 교체 화면에서 커서를 맨 위로 올릴 때 이만큼 누른다 */
const MAX_PARTY = 6

async function pushBattle(budgetMs) {
  const till = Date.now() + budgetMs
  /** 이번에 내보낼 자리. 고를 때마다 다음 칸으로 옮겨 간다 */
  let pick = 1
  let seen = (await battleBeat()).fp
  let changed = Date.now()
  let taps = 0
  while (Date.now() < till) {
    const at = await marks(page)
    if (at.scene !== 'battle') return { ended: true, taps }
    const now = await battleBeat()
    // ⚠️ **선두가 쓰러지면 A만으로는 못 지나간다.** 교체 화면이 뜨는데 커서가
    // **그 쓰러진 마리**에 서 있고, 거기서 A는 (원작처럼) 아무 일도 안 한다 —
    // 화면에는 「싸울 수 없다」가 떠 있다. 사람이라면 아래를 눌러 성한 마리로
    // 옮길 자리다. 처음엔 이걸 「배틀이 얼었다」로 적었다.
    //
    // ⚠️ **그렇다고 아무 때나 아래를 누르면 안 된다.** 명령 창에서 아래는
    // 커서를 「도구」로 옮기고, 거기서 A는 가방을 연다 — A만 누르면 62번에
    // 끝나던 야생전이 아래를 섞자 96번에도 안 끝났다. 그래서 **「내보낼 마리를
    // 고르는 중」일 때만** 누른다 (`BattleScreen`의 `forced`와 같은 식이다)
    if (now.forced) {
      // ⚠️ **A를 사이에 끼우면서 커서를 옮기면 안 된다.** 아래 한 번 · A 한 번을
      // 되풀이하면 커서가 쓰러진 마리에 붙은 채로 안 움직이고, 배틀이 127번을
      // 눌러도 그대로였다. 아래만 여섯 번 눌러 커서를 옮긴 **뒤에** A를 한 번
      // 누르니 그 자리에서 교체가 됐다 (턴 7 → 8). 그래서 **자리를 먼저 정하고
      // 한 번만 고른다** — 맨 위로 올린 뒤 원하는 칸까지 내려간다
      for (let i = 0; i < MAX_PARTY; i++) await tap(page, 'ArrowUp', 40)
      for (let i = 0; i < pick; i++) await tap(page, 'ArrowDown', 40)
      pick = (pick % (MAX_PARTY - 1)) + 1
      await page.waitForTimeout(250)
    }
    await tap(page, 'Space', 60)
    taps++
    const after = (await battleBeat()).fp
    if (after !== seen) { seen = after; changed = Date.now() } else if (
      Date.now() - changed > FREEZE_MS
    ) return { ended: false, frozen: true, taps, at: seen }
  }
  return { ended: false, taps, at: seen }
}

const targets = CHECKPOINTS
  .filter((c) => ONLY.length === 0 || ONLY.includes(c.id))
  .filter((c, i, all) => {
    if (!FROM) return true
    const at = all.findIndex((x) => x.id === FROM)
    return at < 0 || i >= at
  })

if (ACTS.has('2')) {
  // ⚠️ **앞 실행의 그림을 남겨 두지 않는다.** 이름이 「순번-이름」이라 `--only`로
  // 셋만 돌리면 순번이 겹쳐서, 폴더에 이번 것과 지난 것이 섞인 채로 남는다 —
  // 그걸 보고 「이번 실행에서 찍은 것」이라고 읽게 된다
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  console.log(`\n장면 ${targets.length}개를 훑는다 — ${FRESH ? '장면마다 새 화면' : '이어서 (--chain)'}\n`)
  for (const [n, cp] of targets.entries()) {
    const t0 = Date.now()
    noise = []
    const trouble = []
    let detail = ''
    let extra = {}
    try {
      if (FRESH || n === 0) await openTitle()
      await warpTo(cp)
      const arrived = Date.now() - t0

      // 붙는 동안의 프레임도 잰다 — 여기 끊김은 스트리밍이라 판정에 안 쓴다
      const load = await frameWindow(page, 0, () => settle().then((s) => { extra = s }))
      const shape = extra
      backend ??= shape.backend
      const settled = Date.now() - t0

      // ⚠️ **닿았다가 밀려나는 실행이 있다.** 확인 지점 모듈이 `MapStreamer`보다
      // 늦게 도착하면 씬이 「세이브 자리」로 알고 주인공 방으로 되돌린다.
      // 씬 쪽을 고쳤지만 남은 틈이 있으면 여기서 한 번 더 뛴다 — **조용히
      // 넘기지 않는다.** 다시 뛰었다는 것이 줄에 남아야 잦아지면 보인다
      if ((await marks(page)).map !== cp.map) {
        extra.rewarped = (await marks(page)).map
        await warpTo(cp)
        await settle()
      }

      // ⚠️ **배틀은 「떴다」와 「돌기 시작했다」가 다르다.** 무대와 마리를 받는
      // 동안에도 화면은 이미 배틀이라, 그 사이에 프레임을 재면 **모델 받는
      // 비용이 그 장면의 끊김으로 적힌다** — 실측으로 같은 체육관이 한 번은
      // p95 50ms로 통과하고 한 번은 183ms 끊김 셋으로 떨어졌다. 돌기 시작한
      // 뒤에 잰다
      if (cp.battle !== null) {
        await page.waitForFunction(async () => {
          const m = await import('/src/state/battleStore.ts')
          return m.useBattleStore.getState().phase !== 'loading'
        }, null, { timeout: 60_000 }).catch(() => { /* 안 열리면 아래에서 떨어진다 */ })
        await page.waitForTimeout(1_500)
      }

      // 뛰어든 자리에서 곧바로 컷신이 도는 장면이 있다. 끝까지 밀어 준다 —
      // 안 밀면 아래 「못 걸었다」가 장면 탓이 아니라 컷신 탓으로 뜬다
      const onArrive = cp.battle === null ? await runScripts() : { done: true, taps: 0 }
      if (onArrive.frozen) trouble.push(`뛰어들자마자 도는 컷신이 얼었다 (${onArrive.taps}번 눌렀다)`)

      // 고요해진 **뒤에** 재는 창이 판정 대상이다. 걸으면서 잰다 — 서 있는
      // 장면은 안 끊긴다. 끊김은 청크가 붙고 사람이 뜨는 동안 나온다
      const stood = await marks(page)
      let walk = { moved: null }
      const steady = await frameWindow(page, FRAME_WINDOW_MS, async () => {
        if (cp.battle === null) walk = await canWalk()
      })

      // ⚠️ **걸음이 장면을 연다.** 밟아서 걸리는 컷신이 여기서 시작하는데
      // (주인공 방의 라이벌이 그것이다), 그 자리에서 판정하면 **원작대로 도는
      // 장면**이 「스크립트가 안 끝난다」로 적힌다. 밀어서 끝내고 나서 본다
      // ⚠️ **걸음이 야생을 부르기도 한다.** 파이트에리어처럼 풀 위를 걷는 지점은
      // 걷다가 배틀이 열리는 것이 **맞는 동작**인데, 그 자리에서 판정하면
      // 「오버월드가 아니다」로 떨어진다. 배틀이면 끝까지 밀고 나서 본다
      // ⚠️ **얼었으면 얼었다고 적는다.** 한동안 이 값을 받아만 두고 안 봤더니
      // 진실호수의 야생전이 「오버월드가 아니다」 한 줄로만 떨어져서, 임자가
      // 장면인지 배틀인지가 표에서 안 보였다.
      // 그리고 **끝나면 걷기를 다시 잰다** — 안 그러면 풀 위 지점에서만 걷기
      // 확인이 조용히 빠진다. 다시 걷다 또 만나는 것도 풀 위에서는 정상이다
      for (let round = 0; round < 3 && cp.battle === null; round++) {
        if ((await marks(page)).scene !== 'battle') break
        const wild = await pushBattle(120_000)
        extra.wildOnWalk = { ...wild, round: round + 1 }
        if (wild.frozen) {
          trouble.push(`걸어서 열린 야생전이 얼었다 (${wild.taps}번 눌렀다 · ${wild.at})`)
          break
        }
        if (!wild.ended || walk.encounter !== true) break
        walk = await canWalk()
      }
      const afterWalk = cp.battle === null ? await runScripts() : { done: true, taps: 0 }
      if (afterWalk.frozen) {
        trouble.push(afterWalk.fought?.frozen === true
          ? `컷신이 연 배틀이 얼었다 (${afterWalk.taps}번 눌렀다 · ${afterWalk.at})`
          : `걸음이 연 컷신이 얼었다 (${afterWalk.taps}번 눌렀다)`)
      }
      extra.cutscene = { onArrive, afterWalk }

      const at = await marks(page)
      const png = await page.screenshot()
      const pix = statsOf(png)
      writeFileSync(resolve(OUT, `${String(n).padStart(2, '0')}-${cp.id}.png`), png)

      // ── 판정 ──
      //
      // ⚠️ **문 앞에 세우는 지점에서는 한 걸음이 곧 다른 맵이다.** `atWarp`으로
      // 세운 자리에서 아래로 한 칸 걸으면 문이 열려 밖으로 나간다 — 그것은
      // 장면의 결함이 아니라 그 자리에 세운 결과다. 실측으로 `door`가 411로
      // 나갔고, 그 창에 맵 전환이 통째로 들어가서 프레임이 2,716ms로 찍혔다.
      // **나간 것은 적되 떨어뜨리지 않고, 그 창의 프레임은 판정에서 뺀다**
      const warped = at.map !== stood.map
      if (warped) extra.warpedTo = at.map
      else if (at.map !== cp.map) trouble.push(`맵이 ${at.map}다 (${cp.map}을 노렸다)`)
      if (shape.tri === 0) trouble.push('삼각형 0 — 아무것도 안 올라갔다')
      if (looksFlat(pix)) {
        trouble.push(`거의 한 색이다 (색 ${pix.colors} · 흩어짐 ${pix.stdev.toFixed(1)})`)
      }
      if (cp.battle !== null) {
        if (at.scene !== 'battle') trouble.push(`배틀이 안 열렸다 (${at.scene})`)
        else {
          const fought = await pushBattle(FIGHT ? 600_000 : 45_000)
          extra.battle = fought
          if (fought.frozen) trouble.push(`배틀이 얼었다 (${fought.taps}번 눌렀다)`)
        }
      } else {
        if (at.scene !== 'overworld') trouble.push(`오버월드가 아니다 (${at.scene})`)
        if (walk.moved === false) {
          extra.walkStuck = walk.stuck
          const s = walk.stuck ?? {}
          trouble.push(`네 방향 다 못 걸었다 (칸 ${walk.from}`
            + ` · ${s.busy === true ? `스크립트 ${String(s.id)}가 잡고 있다` : '스크립트 없다'}`
            + `${s.ui === true ? ' · UI가 키를 들었다' : ''}`
            + ` · 북${String(s.N)} 남${String(s.S)} 서${String(s.W)} 동${String(s.E)})`)
        }
        // UI가 키를 들고 있는 자리는 **걷는 것을 안 잰다.** 못 잰 것을 실패로
        // 세지 않는다 — 대신 무엇이 들고 있었는지를 줄에 적는다
        if (walk.why) extra.grabbed = walk.why
        if (at.script || at.talk) {
          const info = await scriptInfo()
          extra.stuck = info
          trouble.push(`스크립트가 안 끝난다 (${info?.ctx === false ? '우리 글' : `번호 ${info?.id}`})`)
        }
        // ⚠️ **스크립트가 물려 있으면 시작 메뉴는 원래 안 열린다** — 원인이
        // 하나인데 실패가 둘로 적히면 고칠 데가 둘로 보인다 (`MenuLayer`가
        // `fieldScripts.ctx !== null`이면 X를 안 받는다)
        if (!at.script) {
          const menu = await menuOpensAndCloses()
          if (!menu.ok) trouble.push(`시작 메뉴가 ${menu.why}`)
        }
      }
      const err = (await scriptInfo())?.error
      if (err) trouble.push(`스크립트가 터졌다: ${String(err).slice(0, 120)}`)
      if (!gpu.software && !steady.thin && !warped) {
        if (steady.hitches >= HITCH_LIMIT) {
          trouble.push(`끊김 ${steady.hitches}번 (제일 긴 프레임 ${steady.worst}ms)`)
        } else if (steady.p95 > P95_MS) trouble.push(`프레임 95%가 ${steady.p95}ms`)
      }
      if (noise.length > 0) trouble.push(`콘솔 ${noise.length}건: ${noise[0]}`)

      const fps = gpu.software ? '못 잼'
        : steady.thin ? `프레임 ${steady.frames}개뿐`
          : `${steady.fps}fps p95 ${steady.p95}ms 끊김 ${steady.hitches}`
            + (warped ? ` (맵 ${at.map}으로 나가는 동안이라 판정 안 함)` : '')
      detail = `맵 ${at.map} · 삼각형 ${(shape.tri / 1000).toFixed(1)}k/${shape.draws}콜 · `
        + `뜨기 ${(arrived / 1000).toFixed(1)}초 붙기 ${((settled - arrived) / 1000).toFixed(1)}초 · `
        + `${fps} · 색 ${pix.colors}`
        + (cp.battle !== null
          ? ` · 배틀 ${extra.battle?.ended ? '끝났다' : `${extra.battle?.taps ?? 0}번 눌렀다`}`
          : ` · ${walk.why ?? (walk.encounter === true ? `걷다 야생을 만났다 (칸 ${walk.from})`
            : walk.moved ? `걷기 ${walk.from}→${walk.to}` : '못 걸었다')}`)
        + (onArrive.taps + afterWalk.taps > 0
          ? ` · 컷신 ${String(onArrive.taps + afterWalk.taps)}번 눌러 끝냈다` : '')
        + ((afterWalk.fought ?? onArrive.fought)
          ? ` · 컷신이 연 배틀 ${(afterWalk.fought ?? onArrive.fought).ended ? '끝냈다' : '안 끝났다'}` : '')
        + (extra.rewarped === undefined ? '' : ` · ⚠️ 맵 ${extra.rewarped}으로 밀려나 다시 뛰었다`)
      extra = { ...extra, load, steady, pix, seconds: Math.round((Date.now() - t0) / 1000) }
    } catch (e) {
      trouble.push(String(e.message ?? e).slice(0, 200))
    }
    const status = trouble.length === 0 ? 'PASS' : 'FAIL'
    add('②', cp.id, cp.label, status,
      trouble.length === 0 ? detail : `${trouble.join(' | ')}${detail ? ` — ${detail}` : ''}`, extra)
    const mark = status === 'PASS' ? '✓' : '✗'
    // ⚠️ **떨어진 줄에도 잰 값을 같이 찍는다.** 「끊김 5번」만 보이면 그 장면이
    // 몇 초 만에 붙었는지, 삼각형이 몇이었는지를 다시 돌려야 알 수 있다
    console.log(`  ${mark} ${String(n + 1).padStart(2)}/${String(targets.length)} `
      + `${cp.id.padEnd(14)} ${status === 'PASS' ? detail : `${trouble.join(' | ')} — ${detail}`}`)
  }
} else add('②', 'scenes', `장면 ${CHECKPOINTS.length}개`, 'NOT RUN', '--act로 걸렀다')

// ── ③ 엔딩 — 명예의 전당 → 크레딧 → 타이틀 ──────────────────────────────────
//
// ⚠️ **여기만 손잡이를 하나 당긴다.** 챔피언을 6대6으로 이겨야 열리는 자리라
// 걸어서 닿으려면 몇 분이 아니라 몇 십 분이다. 당기는 것은 스크립트가 당기는
// **바로 그 손잡이**다 — `ScrCmd_ClearGame`이 부르는
// `world.services.hallOfFame.clear()` 하나이고, 그 뒤는 전부 진짜 화면과 진짜
// 키다. 스크립트 바이트가 이 손잡이를 당긴다는 것 자체는 노드 시험이 잰다
// (`engine/script/commands.ts`의 `ClearGame`).

if (ACTS.has('3')) {
  const t0 = Date.now()
  noise = []
  try {
    // 파티가 있어야 전당 장면이 볼 것이 있다. 확인 지점 하나로 꾸린다.
    //
    // ⚠️ **챔피언 지점으로 뛰면 안 된다.** 거기는 뛰어들자마자 6대6 배틀이
    // 열리는데 트레이너전은 도망칠 수 없어서, 물러나려고 X를 눌러 봐야 배틀 안
    // 메뉴만 오간다. 전당은 필드에서 열리므로 **배틀 없는 배지 8개 자리**로 간다
    const stage = CHECKPOINTS.find((c) => c.id === 'league')
      ?? CHECKPOINTS.filter((c) => c.battle === null).at(-1)
    await openTitle()
    await warpTo(stage)

    const party = await page.evaluate(async () => {
      const m = await import('/src/state/saveStore.ts')
      return m.useSaveStore.getState().party.length
    })
    if (party === 0) throw new Error('파티가 비어 전당에 올릴 것이 없다')

    // ⚠️ **바깥 세계는 씬이 늦게 붙인다.** 맵이 떴다고 `fieldScripts.services`가
    // 다 차 있는 것이 아니다 — `installFieldServices`가 effect에서 돌고, 그
    // effect는 공용 스크립트 뱅크를 받은 **뒤에** 한 번 더 돈다. 실측으로 맵이
    // 뜨고 몇 초 뒤에야 79칸이 찼다. 붙을 때까지 기다린다
    const svc = () => page.evaluate(async () => {
      const f = await import('/src/engine/script/field.ts')
      return Object.keys(f.fieldScripts.services).length
    })
    let keys = 0
    for (let i = 0; i < 120 && keys === 0; i++) {
      keys = await svc()
      if (keys === 0) await page.waitForTimeout(500)
    }
    if (keys === 0) throw new Error('바깥 세계가 60초 안에 안 붙었다')
    // `ScrCmd_ClearGame`이 부르는 그 함수
    const opened = await page.evaluate(async () => {
      const f = await import('/src/engine/script/field.ts')
      const hof = f.fieldScripts.services.hallOfFame
      if (hof === undefined) {
        return `전당 손잡이가 없다 (바깥 세계 ${Object.keys(f.fieldScripts.services).length}칸)`
      }
      hof.clear()
      return null
    })
    if (opened !== null) throw new Error(opened)
    await page.waitForFunction(() => document.documentElement.dataset.menu === 'hallOfFame',
      null, { timeout: 30_000 })
    const hof = Date.now() - t0

    // 전당 장면을 끝까지 민다. Z·X·Enter가 다음 장으로 넘긴다
    let cameCredits = false
    for (let i = 0; i < 400; i++) {
      const at = await marks(page)
      if (at.menu === 'credits') { cameCredits = true; break }
      await tap(page, 'KeyZ', 60)
    }
    if (!cameCredits) throw new Error('전당에서 크레딧으로 안 넘어간다')
    const credits = Date.now() - t0
    const png = await page.screenshot()
    const cpix = statsOf(png)
    mkdirSync(OUT, { recursive: true })
    writeFileSync(resolve(OUT, '99-credits.png'), png)
    // ⚠️ **크레딧에는 `looksFlat`을 안 쓴다.** 검은 바탕에 글이 흐르는 화면이라
    // 색 수가 원래 적다 — 장면용 자를 들이대면 **맞는 화면이 떨어진다**.
    // 여기서 가릴 것은 「아무것도 안 그렸는가」 하나다
    if (cpix.colors < 4) throw new Error(`크레딧이 통째로 비었다 (색 ${cpix.colors})`)

    // 크레딧이 끝나면 타이틀로 되돌아간다 (PARITY §8.12)
    let backToTitle = false
    for (let i = 0; i < 900; i++) {
      const at = await marks(page)
      if (at.path === '/' || at.scene === 'title') { backToTitle = true; break }
      await tap(page, 'KeyZ', 40)
    }
    if (!backToTitle) throw new Error('크레딧이 끝나도 타이틀로 안 간다')
    const bad = noise.slice(0, 3)
    if (bad.length > 0) throw new Error(`콘솔: ${bad.join(' / ')}`)
    add('③', 'ending', '명예의 전당 → 크레딧 → 타이틀', 'PASS',
      `전당 ${(hof / 1000).toFixed(1)}초 · 크레딧까지 ${(credits / 1000).toFixed(1)}초 · `
      + `크레딧 색 ${cpix.colors} · 타이틀 복귀 ${((Date.now() - t0) / 1000).toFixed(0)}초 · 콘솔 0건`)
  } catch (e) {
    add('③', 'ending', '명예의 전당 → 크레딧 → 타이틀', 'FAIL', String(e.message ?? e).slice(0, 300))
  }
} else add('③', 'ending', '명예의 전당 → 크레딧 → 타이틀', 'NOT RUN', '--act로 걸렀다')

await browser.close()
vite?.child.kill()

// ── 결과 ─────────────────────────────────────────────────────────────────────
const width = (s) => [...s].reduce((a, c) => a + (c.charCodeAt(0) > 0x1100 ? 2 : 1), 0)
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)))

console.log(`\n처음부터 엔딩까지 — 실제 화면 (${gpu.renderer})\n`)
for (const r of rows) {
  const mark = { PASS: '✓', FAIL: '✗', 'NOT RUN': '·' }[r.status]
  console.log(`  ${mark} ${r.act} ${pad(r.id, 15)} ${pad(r.what, 34)} ${r.status}`)
  if (r.detail) console.log(`        ${r.detail}`)
}
const counts = ['PASS', 'FAIL', 'NOT RUN']
  .map((s) => `${s} ${String(rows.filter((r) => r.status === s).length)}`).join(' · ')
console.log(`\n  ${counts}`)
// ⚠️ **거른 소리를 안 보이게 두지 않는다.** 「우리 것이 아니라 못 고친다」와
// 「없다」는 다르다 — 판마다 다시 볼 수 있게 몇 건이었는지를 적는다
if (known.size > 0) {
  console.log(`  거른 소리 (우리 것이 아니다): ${[...known]
    .map(([k, n]) => `${k.slice(0, 60)}×${String(n)}`).join(' · ')}`)
}
if (gpu.software) console.log('  ⚠️ 소프트웨어 래스터라이저라 프레임 시간은 안 쟀다')
else {
  console.log(`  프레임 시간은 이 기계의 GPU에서 잰 것이다 — 무대 백엔드 ${backend ?? '?'}`)
  // ⚠️ **폴백 길에서 잰 것을 사용자 길의 수치로 읽으면 안 된다.** 헤드리스
  // 크로미움에 WebGPU가 없어서 우리 렌더러가 WebGL2로 내려앉는다
  if (backend !== null && !/WebGPU/i.test(backend)) {
    console.log('  ⚠️ WebGPU가 아니라 WebGL2 폴백에서 잰 값이다 — 사용자 브라우저의 수치가 아니다')
  }
}

mkdirSync(resolve(ROOT, '.audit'), { recursive: true })
// ⚠️ **무엇을 걸렀는지를 같이 적는다.** `--only`로 셋만 돌린 기록이 파일에서는
// 「다 돌렸다」와 똑같이 보이면, 나중에 그것을 근거로 「전부 통과」라고 쓰게 된다
writeFileSync(resolve(ROOT, '.audit/story.json'), `${JSON.stringify({
  gpu, view: VIEW, backend, known: [...known],
  ran: { acts: [...ACTS], only: ONLY, from: FROM ?? null, fight: FIGHT, fresh: FRESH },
  scenes: { all: CHECKPOINTS.length, ran: targets.length },
  rows,
}, null, 1)}\n`)
rmSync(resolve(ROOT, '.audit/story.tmp'), { recursive: true, force: true })

process.exit(rows.some((r) => r.status === 'FAIL') ? 1 : 0)
