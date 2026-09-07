// 진단 — **앱 안에서 실제로 보이고 움직이는 도형**을 잡는다 (REPAIR §41 · 지시 §3).
//
//     node tools/e2e/_appshape41.mjs --variant=fixed --gpu=webgpu
//     node tools/e2e/_appshape41.mjs --variant=all --gpu=gl
//
// ⚠️ **판정기가 아니다.** 관문은 `pnpm render:first`고 이 파일은 원인을 가른다.
//
// ⚠️ **소스를 잠깐 갈아 끼운다.** `src/scene/Stage.tsx`와 `EngineDriver.tsx`를
// 뜬 자리에 두고(`shots/appshape41/<때>/원본/`) 끝나면 **반드시 되돌린다** —
// 터져도 되돌린다(`finally`). 되돌린 뒤 내용이 같은지도 확인한다.
// 진단 부품(`src/scene/Diag41.tsx`)도 끝나면 지운다. **제품에 안 남는다.**
//
// 세 변형:
//   fixed — 고정 카메라 + 밝은 색 상자 (조명·텍스처·안개 없음)
//   app   — 같은 상자, 카메라만 실제 앱 카메라
//   clip  — 클립 좌표를 직접 내는 삼각형 (카메라 변환을 통째로 건너뛴다)
//
// 판정은 **도형 ROI와 배경 ROI의 대비**, 그리고 **알려진 방향으로 옮긴 뒤의
// 변화**다. 단색 배경 하나로는 절대 통과 안 준다 — 그것이 지난 회차의
// 「기본 도형으로 바꾸면 정상」이 틀렸던 자리다.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs, wantBackend } from '../gpuFlags.mjs'
import { playOpening } from './drive.mjs'
import { SHAPE_GAP, WATCH_INIT, measureFrame, roiGap, roiMean, sameFrame, shootCanvas } from './canvasShot.mjs'
import { statsOf } from '../shot/png.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}
const WANT = flag('variant', 'all')
const VARIANTS = WANT === 'all' ? ['real', 'fixed', 'app', 'clip'] : WANT.split(',')
const PROFILE = flag('gpu', 'webgpu')
const HEADED = args.includes('--headed')
const VIEW = { width: 960, height: 640 }

const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/appshape41/${STAMP}`)
mkdirSync(`${OUT}/원본`, { recursive: true })

const STAGE = resolve(ROOT, 'src/scene/Stage.tsx')
const DRIVER = resolve(ROOT, 'src/scene/EngineDriver.tsx')
const DIAG = resolve(ROOT, 'src/scene/Diag41.tsx')
const HELD = [[STAGE, `${OUT}/원본/Stage.tsx`], [DRIVER, `${OUT}/원본/EngineDriver.tsx`]]
for (const [from, to] of HELD) copyFileSync(from, to)

/** 진단 부품 하나. **변형 이름만 다르다** */
const diagSource = (mode) => `// ⚠️ **진단용 임시 부품이다** — \`tools/e2e/_appshape41.mjs\`가 쓰고 지운다.
// 이 파일이 저장소에 남아 있으면 그것은 하네스가 안 지운 것이고, 제품이 아니다.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Mesh } from 'three'
import { PerspectiveCamera, Vector2, Vector3 } from 'three'
import { worldState } from '../state/worldState'

const MODE = '${mode}'

/**
 * 진단 — **투영을 다시 내는 카메라를 다 적는다.**
 *
 * 이 모듈은 \`Stage\`가 정적으로 들여오므로 \`<Canvas>\`가 서기 **전에** 돈다.
 * R3F도 우리도 같은 three 모듈 하나를 쓰므로(vite dedupe) 이 한 줄이 R3F가
 * 제 안에서 만든 카메라까지 잡는다
 */
const spy: { uuid: string; aspect: number; fov: number; at: number; from: string }[] = []
;(window as unknown as Record<string, unknown>).__camSpy = spy
const wasUpdate = PerspectiveCamera.prototype.updateProjectionMatrix
PerspectiveCamera.prototype.updateProjectionMatrix = function patched(this: PerspectiveCamera) {
  spy.push({
    uuid: this.uuid, aspect: this.aspect, fov: this.fov,
    at: Math.round(performance.now()),
    from: String(new Error().stack ?? '').split('\\n').slice(2, 4).join(' | ').slice(0, 240),
  })
  if (spy.length > 40) spy.shift()
  return wasUpdate.call(this)
}
/** 눈에 확 띄는 색. 조명·텍스처·안개에 안 기댄다 */
const SHAPE = '#ff2fbf'

export function Diag41() {
  const box = useRef<Mesh>(null)
  const shift = useRef(0)
  const { camera, scene, gl, size, viewport } = useThree()

  useEffect(() => {
    const w = window as unknown as { __diag41?: unknown }
    w.__diag41 = {
      move: (by = 2) => { shift.current += by; return shift.current },
      probe: () => ({
        ...probe(camera as PerspectiveCamera, box.current, shift.current),
        // R3F가 잰 크기와 렌더러가 그리는 크기. 카메라 aspect의 재료다
        r3fSize: { ...size }, dpr: viewport.dpr,
        drawing: (() => {
          const v = new Vector2()
          ;(gl as unknown as { getDrawingBufferSize: (t: Vector2) => Vector2 })
            .getDrawingBufferSize(v)
          return [v.x, v.y]
        })(),
      }),
      scene: () => ({ children: scene.children.length, fog: scene.fog !== null }),
    }
    return () => { delete (window as unknown as Record<string, unknown>).__diag41 }
  }, [camera, scene, gl, size, viewport])

  // ⚠️ **priority 2다** — 렌더를 가진 EngineDriver(1)보다 뒤다. 고정 카메라
  // 변형에서는 EngineDriver가 카메라를 안 쓰도록 진단 플래그를 같이 켠다
  useFrame(() => {
    // real — **아무것도 안 바꾼다.** 제품 그대로 두고 카메라만 들여다본다
    if (MODE === 'real') return
    const at = MODE === 'app'
      ? new Vector3(worldState.player.position.x + shift.current,
        worldState.player.position.y + 1.5, worldState.player.position.z)
      : new Vector3(shift.current, 0, 0)
    box.current?.position.copy(at)
    if (MODE === 'fixed') {
      camera.position.set(0, 0, 6)
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
    }
  }, 2)

  if (MODE === 'real') return null
  if (MODE === 'clip') return <ClipTriangle shift={shift} />
  return (
    <mesh ref={box} frustumCulled={false}>
      <boxGeometry args={[2, 2, 2]} />
      <meshBasicMaterial color={SHAPE} toneMapped={false} fog={false} />
    </mesh>
  )
}

/**
 * 카메라 변환을 통째로 건너뛴다 — 정점을 **클립 좌표 그대로** 낸다.
 * 이것마저 안 보이면 남은 것은 타깃·파이프라인·뷰포트·깊이/색 쓰기다
 */
function ClipTriangle({ shift }: { shift: { current: number } }) {
  const mesh = useRef<Mesh>(null)
  useFrame(() => {
    const g = mesh.current?.geometry
    if (g === undefined || g === null) return
    const p = g.getAttribute('position')
    const dx = shift.current * 0.25
    p.setXYZ(0, -0.6 + dx, -0.6, 0)
    p.setXYZ(1, 0.6 + dx, -0.6, 0)
    p.setXYZ(2, 0 + dx, 0.6, 0)
    p.needsUpdate = true
  }, 2)
  return (
    <mesh ref={mesh} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array([-0.6, -0.6, 0, 0.6, -0.6, 0, 0, 0.6, 0]), 3]}
        />
      </bufferGeometry>
      <meshBasicMaterial color={SHAPE} toneMapped={false} fog={false} depthTest={false} />
    </mesh>
  )
}

/** 카메라를 **자리 세 값으로** 안 본다 — 행렬과 클립 좌표까지 통째로 뜬다 */
function probe(camera: PerspectiveCamera, box: Mesh | null, shift: number) {
  const el = (m: { elements: number[] }) => [...m.elements].map((v) => Number(v.toFixed(5)))
  const corners: number[][] = []
  if (box !== null) {
    box.updateMatrixWorld()
    const mv = camera.matrixWorldInverse.clone().multiply(box.matrixWorld)
    for (const s of [[0, 0, 0], [1, 1, 1], [-1, -1, -1]]) {
      const v = new Vector3(s[0]!, s[1]!, s[2]!).applyMatrix4(mv)
      const e = camera.projectionMatrix.elements
      const clip = [
        e[0]! * v.x + e[4]! * v.y + e[8]! * v.z + e[12]!,
        e[1]! * v.x + e[5]! * v.y + e[9]! * v.z + e[13]!,
        e[2]! * v.x + e[6]! * v.y + e[10]! * v.z + e[14]!,
        e[3]! * v.x + e[7]! * v.y + e[11]! * v.z + e[15]!,
      ]
      corners.push([...clip.map((n) => Number(n.toFixed(5))),
        ...[clip[0]! / clip[3]!, clip[1]! / clip[3]!, clip[2]! / clip[3]!]
          .map((n) => Number(n.toFixed(5)))])
    }
  }
  const any = camera as unknown as Record<string, unknown>
  return {
    mode: MODE, shift,
    uuid: camera.uuid,
    // ⚠️ 참이면 R3F의 \`updateCamera\`가 곧바로 되돌아간다 — 크기가 바뀌어도 안 고친다
    manual: (camera as unknown as { manual?: boolean }).manual ?? false,
    camSpy: [...spy],
    position: camera.position.toArray().map((n) => Number(n.toFixed(4))),
    quaternion: camera.quaternion.toArray().map((n) => Number(Number(n).toFixed(4))),
    up: camera.up.toArray(),
    fov: camera.fov, near: camera.near, far: camera.far,
    aspect: Number(camera.aspect.toFixed(5)), zoom: camera.zoom,
    view: camera.view === null ? null : { ...camera.view },
    coordinateSystem: any.coordinateSystem ?? null,
    reversedDepth: any.reversedDepth ?? null,
    layersCamera: camera.layers.mask, layersBox: box?.layers.mask ?? null,
    projection: el(camera.projectionMatrix),
    projectionInverse: el(camera.projectionMatrixInverse),
    matrixWorld: el(camera.matrixWorld),
    matrixWorldInverse: el(camera.matrixWorldInverse),
    boxWorld: box === null ? null : el(box.matrixWorld),
    boxVisible: box?.visible ?? null,
    finite: [...camera.projectionMatrix.elements, ...camera.matrixWorld.elements]
      .every((n) => Number.isFinite(n)),
    // 상자 중심·모서리 둘의 clip x/y/z/w와 NDC
    corners,
  }
}
`

/** 갈아 끼운 `Stage.tsx` — **월드 시각 나무만** 바꾼다 */
function stageFor(mode) {
  let s = readFileSync(`${OUT}/원본/Stage.tsx`, 'utf8')
  s = s.replace("import { EngineDriver } from './EngineDriver'",
    "import { EngineDriver } from './EngineDriver'\nimport { Diag41 } from './Diag41'")
  const open = s.indexOf('<SceneBoundary where="씬">')
  const close = s.indexOf('</SceneBoundary>')
  if (open < 0 || close < 0) throw new Error('Stage의 씬 경계를 못 찾았다')
  if (mode === 'real') {
    // **월드를 그대로 둔다** — 카메라만 들여다보는 변형이다
    return `${s.slice(0, close)}  <Diag41 />\n        ${s.slice(close)}`
  }
  s = `${s.slice(0, open)}<SceneBoundary where="씬">\n          <Diag41 />\n        ${s.slice(close)}`
  // 안개를 뺀다 — 도형이 안 보이는 것이 안개 탓일 여지를 없앤다
  s = s.replace(/\n *<fog attach="fog"[^/]*\/>/, '')
  if (mode === 'fixed' || mode === 'clip') {
    s = s.replace('<EngineDriver />', '<EngineDriver diagFixedCam />')
  }
  return s
}

/** 갈아 끼운 `EngineDriver.tsx` — 카메라 자세 쓰기만 끌 수 있게 한다 */
function driverFor() {
  let s = readFileSync(`${OUT}/원본/EngineDriver.tsx`, 'utf8')
  s = s.replace(
    'export function EngineDriver({ bloom: useBloom = true }: { bloom?: boolean }) {',
    'export function EngineDriver({ bloom: useBloom = true, diagFixedCam = false }:'
    + ' { bloom?: boolean; diagFixedCam?: boolean }) {')
  const open = s.indexOf('    const shot = cinematicStage.active ? cinematicStage')
  const mark = '      lens.updateProjectionMatrix()\n    }\n'
  const close = s.indexOf(mark, open)
  if (open < 0 || close < 0) throw new Error('EngineDriver의 카메라 구간을 못 찾았다')
  const block = s.slice(open, close + mark.length)
  const wrapped = `    if (!diagFixedCam) {\n${block.replace(/^/gm, '  ').replace(/^ +$/gm, '')}    }\n`
  return s.slice(0, open) + wrapped + s.slice(close + mark.length)
}

function putVariant(mode) {
  writeFileSync(DIAG, diagSource(mode))
  writeFileSync(STAGE, stageFor(mode))
  writeFileSync(DRIVER, driverFor())
}

function restore() {
  for (const [to, from] of HELD) {
    writeFileSync(to, readFileSync(from, 'utf8'))
    if (readFileSync(to, 'utf8') !== readFileSync(from, 'utf8')) {
      console.error(`  ⚠️ ${to}를 못 되돌렸다 — ${from}에서 손으로 되돌린다`)
    }
  }
  rmSync(DIAG, { force: true })
}

/** NDC 한 점을 캔버스 픽셀 ROI로. 화면 밖이면 `null` */
function roiAt(ndc, w, h, size = 60) {
  if (ndc === null || !Number.isFinite(ndc[0]) || !Number.isFinite(ndc[1])) return null
  const x = Math.round((ndc[0] * 0.5 + 0.5) * w)
  const y = Math.round((-ndc[1] * 0.5 + 0.5) * h)
  if (x < 0 || y < 0 || x > w || y > h) return null
  return {
    x: Math.max(0, Math.min(w - size, x - size / 2)),
    y: Math.max(0, Math.min(h - size, y - size / 2)),
    w: size, h: size,
  }
}

const marks = (page) => page.evaluate(() => ({ ...document.documentElement.dataset }))
async function tap(page, key, hold = 70) {
  await page.keyboard.down(key)
  await page.waitForTimeout(hold)
  await page.keyboard.up(key)
  await page.waitForTimeout(60)
}
async function clearTalk(page, limit = 400) {
  let quiet = 0
  let i = 0
  for (; i < limit && quiet < 8; i++) {
    if ((await marks(page)).talk === undefined) { quiet += 1; await page.waitForTimeout(150); continue }
    quiet = 0
    await tap(page, 'Space')
  }
  return { hitLimit: i >= limit, taps: i }
}

/** 한 변형 한 판 */
async function once(browser, url, mode, dir) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 })
  mkdirSync(dir, { recursive: true })
  const out = { mode, notes: [] }
  const noise = []
  page.on('pageerror', (e) => { noise.push(String(e.message).slice(0, 300)) })
  page.on('console', (m) => {
    if (m.type() === 'error') noise.push(`console: ${m.text().slice(0, 200)}`)
  })
  let base = null
  const span = { ok: true, why: null }
  const watch = (where, m) => {
    if (base === null) { base = m; return }
    if (!span.ok) return
    const same = sameFrame(base, m)
    if (!same.ok) { span.ok = false; span.why = `${where}에서 ${String(same.why)}` }
  }
  try {
    await page.addInitScript(WATCH_INIT)
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 })
    const start = page.getByRole('button', { name: '시작', exact: true })
    await start.waitFor({ timeout: 120_000 })
    await start.click({ timeout: 60_000 })
    await playOpening(page)
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
      null, { timeout: 180_000 })
    const talk = await clearTalk(page)
    if (talk.hitLimit) out.notes.push(`대사를 ${String(talk.taps)}번 넘겨도 안 끝났다`)
    await page.waitForTimeout(2500)
    out.marks = await marks(page)
    out.backend = out.marks.backend ?? null

    out.probeBefore = await page.evaluate(() => window.__diag41?.probe() ?? null)
    const a = await shootCanvas(page, { path: `${dir}/1-before.png` })
    watch('첫 컷 앞', a.before); watch('첫 컷 뒤', a.after)

    // 알려진 방향으로 옮긴다 — 같은 ROI가 달라져야 도형이 진짜다
    out.movedBy = await page.evaluate(() => window.__diag41?.move(2) ?? null)
    await page.waitForTimeout(900)
    out.probeAfter = await page.evaluate(() => window.__diag41?.probe() ?? null)
    const b = await shootCanvas(page, { path: `${dir}/2-moved.png` })
    watch('옮긴 컷 뒤', b.after)

    // ⚠️ **`real`에서만** 알려진 회복(감싼 자리 CSS 폭 1px)을 걸어 앞뒤를 견준다.
    //    이것은 진단이지 고침이 아니다 — 무엇이 갈리는지 보려는 것뿐이다
    if (mode === 'real') {
      await page.evaluate(() => {
        const host = document.getElementById('stage-wrap')
        if (host === null) return
        host.style.width = 'calc(100% - 1px)'
      })
      await page.waitForTimeout(1200)
      out.probeHealed = await page.evaluate(() => window.__diag41?.probe() ?? null)
      const c = await shootCanvas(page, { path: `${dir}/3-healed.png` })
      out.statsHealed = statsOf(c.png)
      console.log(`  회복 뒤 색 ${String(out.statsHealed.colors)}`)
    }

    const [w, h] = a.before.buffer.split('x').map(Number)
    const inRoi = roiAt(out.probeBefore?.corners?.[0]?.slice(4) ?? null, w, h)
      ?? { x: Math.round(w / 2 - 30), y: Math.round(h / 2 - 30), w: 60, h: 60 }
    const outRoi = { x: 8, y: 8, w: 60, h: 60 }
    out.roi = { in: inRoi, out: outRoi }
    out.stats = { before: statsOf(a.png), after: statsOf(b.png) }
    out.gapInOut = roiGap(roiMean(a.png, inRoi), roiMean(a.png, outRoi))
    out.gapMoved = roiGap(roiMean(a.png, inRoi), roiMean(b.png, inRoi))
    out.meanIn = roiMean(a.png, inRoi)
    out.meanOut = roiMean(a.png, outRoi)
    out.span = span
    // **도형이 실제로 보이고 실제로 움직였는가.** 배경 하나로는 안 준다
    out.shapeSeen = out.gapInOut > SHAPE_GAP
    out.shapeMoved = out.gapMoved > SHAPE_GAP
    out.verdict = out.shapeSeen && out.shapeMoved ? 'SHAPE' : out.shapeSeen ? 'STILL' : 'NONE'
  } catch (e) {
    out.crash = String(e?.message ?? e).slice(0, 400)
    out.verdict = 'CRASH'
  } finally {
    out.noise = noise.slice(0, 8)
    out.span ??= span
    await page.close()
  }
  return out
}

const results = []
try {
  for (const mode of VARIANTS) {
    console.log(`\n=== ${mode} · ${PROFILE} ===`)
    putVariant(mode)
    let vite = null
    let browser = null
    try {
      const port = await freePort()
      vite = await startVite(port, `node_modules/.vite-diag-${mode}`)
      browser = await chromium.launch({ args: gpuArgs(PROFILE), headless: !HEADED })
      const r = await once(browser, vite.url, mode, `${OUT}/${mode}`)
      r.browser = browser.version()
      r.wantBackend = wantBackend(PROFILE)
      results.push(r)
      console.log(`  backend ${String(r.backend)} · 판정 ${String(r.verdict)}`)
      console.log(`  도형 대비 ${String(r.gapInOut)} · 옮긴 뒤 ${String(r.gapMoved)}`
        + ` · 색 ${String(r.stats?.before?.colors)} → ${String(r.stats?.after?.colors)}`)
      console.log(`  ROI ${JSON.stringify(r.roi)} · 흔들림 ${JSON.stringify(r.span)}`)
      if (r.probeBefore) {
        console.log(`  카메라 ${JSON.stringify(r.probeBefore.position)} fov ${String(r.probeBefore.fov)}`
          + ` aspect ${String(r.probeBefore.aspect)} 유한 ${String(r.probeBefore.finite)}`)
        console.log(`  상자 중심 clip/NDC ${JSON.stringify(r.probeBefore.corners?.[0])}`)
      }
      if (r.crash) console.log(`  터졌다: ${r.crash}`)
      if (r.noise.length > 0) console.log(`  잡음 ${JSON.stringify(r.noise)}`)
    } finally {
      await browser?.close()
      vite?.child.kill()
    }
  }
} finally {
  restore()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify({
  stamp: STAMP, profile: PROFILE, args, view: VIEW, results,
}, null, 1)}\n`)
console.log(`\n${OUT}`)
for (const r of results) console.log(`  ${r.mode.padEnd(6)} ${String(r.verdict)}`)
process.exit(results.every((r) => r.verdict === 'SHAPE') ? 0 : 1)
