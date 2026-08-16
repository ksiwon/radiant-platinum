// **화면을 보고** 판단하기 위한 그림을 모은다.
//
//     node tools/shot/look.mjs                     숲 바닥 · 1인칭 (기본)
//     node tools/shot/look.mjs floor --at=forest,twinleaf
//     node tools/shot/look.mjs tree                나무 밑동 · 갈래마다 둘
//     node tools/shot/look.mjs eye                 1인칭 · 무엇이 사라지는가
//
// 나오는 것은 두 가지다:
//
//   `shots/look/…/*.png`     실제로 그린 화면
//   `shots/look/index.html`  그것들을 한 장에 늘어놓은 대지 — 이걸 열어서 본다
//
// ⚠️ **예쁜지·어색한지는 여기서 판정하지 않는다.** 아래 자들은 전부 숫자와
// 문턱이 있는 것뿐이다. 자연스러운지는 대지를 열어 사람이 볼 몫이고, 그래서
// 그림마다 그 자리의 수치를 같이 적어 둔다.
//
// ⚠️ **광선이 맞힌 것과 픽셀에 뜬 것은 다르다.** 광선은 알파 테스트를 안 보므로
// 통째로 잘려 안 그려진 판도 그대로 맞힌다 (`shot.mjs`의 `--hit`이 같은 경고를
// 단다). **그 어긋남이 곧 결함이다** — 여기서 재는 것은 거의 전부 그 모양이다.
// 그래서 고리 위의 점을 **월드에서 정하고 화면으로 투영해서**, 같은 픽셀에
// 광선을 쏘고 같은 픽셀의 색을 읽는다.
//
// ⚠️ **밖으로 올리지 않는다.** 원본에서 나온 화면이라 `shots/`는 gitignore고,
// 아티팩트로도 안 만든다. 대지는 `file://`로 그냥 열린다.
//
// ⚠️ **성능은 여기서 재면 안 된다.** 헤드리스에 WebGPU가 없어 WebGL2 폴백이다.
// 배치·모델·색은 그대로지만 속도는 딴것이다 (`shot.mjs` 머리말과 같다).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { decodePng, looksFlat, statsOf } from './png.mjs'
import { freePort, startVite } from '../devServer.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(ROOT, 'shots/look')

const args = process.argv.slice(2)
const MODE = ['tree', 'eye', 'floor'].includes(args[0]) ? args[0] : 'floor'
/** `--이름=값`과 `--이름 값`을 둘 다 받는다 — 띄어 써서 조용히 무시된 적이 있다 */
const flag = (name, fallback) => {
  const glued = args.find((a) => a.startsWith(`--${name}=`))
  if (glued !== undefined) return glued.slice(name.length + 3)
  const at = args.indexOf(`--${name}`)
  const next = at < 0 ? undefined : args[at + 1]
  return next === undefined || next.startsWith('--') ? fallback : next
}

/** 찍는 크기 */
const VIEW = { width: 960, height: 640 }
/**
 * 화각.
 *
 * ⚠️ **넓게 보려고 키우지 않는다.** 판단할 것은 「실제로 플레이할 때 어색한가」라
 * `Stage.tsx`가 정한 55를 그대로 쓴다. 넓게 보는 것은 화각이 아니라 **고개를
 * 여러 번 돌려서** 한다. 그래도 키우고 싶으면 `--fov=`.
 */
const FOV = Number(flag('fov', 55))
/** 1인칭 눈높이 · 앞으로 나온 만큼 (`engine/actor/camera.ts`) */
const EYE_HEIGHT = 1.38
const EYE_FORWARD = 0.12
/** 청크 한 변 (`import/platinum/maps.ts`) */
const CHUNK_TILES = 32
/** 그루터기 반지름(타일). 롬 텍셀에서 나온 값이다 (`Foliage`) */
const TRUNK_R = 0.60
/** 붙기를 기다리는 시간 */
const SETTLE_MS = 7000

/**
 * 숲 바닥을 볼 자리.
 *
 * 나무가 **실제로 몇 그루 모여 있는지는 씬에서 센다** — 이름으로 고르지 않는다.
 * 여기 적힌 것은 후보일 뿐이고, 빽빽한 칸은 도구가 찾는다.
 */
const FLOOR_MAPS = (flag('at') ?? 'forest,twinleaf,berry,eterna,valor,route217').split(',')
const EYE_SITES = (flag('at') ?? 'twinleaf,forest,grass,center,canalave').split(',')
const TREE_MAPS = (flag('at') ?? 'forest,twinleaf,berry').split(',')
/** 갈래마다 볼 나무 수 */
const PER_KIND = Math.max(1, Math.round(Number(flag('sites', 12)) / 6))

// ── 화면 열기 ────────────────────────────────────────────────────────────────

const port = await freePort()
const vite = await startVite(port, 'node_modules/.vite-harness')
const browser = await chromium.launch({
  // ⚠️ `shot.mjs`는 소프트웨어 래스터라이저를 쓰지만 여기서는 진짜 GPU를 쓴다 —
  // 한 자리에 열여섯 장을 찍어서 소프트웨어로는 몇 시간이 된다. 둘 다 WebGL2라
  // **그리는 결과는 같고** 속도만 다르다
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 })
const noise = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') noise.push(`${m.type()}: ${m.text()}`)
})
page.on('pageerror', (e) => { noise.push(`pageerror: ${e.message}`) })

const url = `http://localhost:${port}/`

/** 확인 지점으로 뛰어들고 청크가 붙기를 기다린다 (`shot.mjs`와 같은 길) */
async function jump(id) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
  await page.keyboard.press('Backquote')
  await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
  const row = page.locator(`[data-checkpoint="${id}"]`).first()
  await row.hover()
  await page.waitForTimeout(200)
  await row.click()
  await page.waitForURL('**/play', { timeout: 60_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
  await page.waitForTimeout(SETTLE_MS)
  // ⚠️ **추적 카메라를 루프에서 뺀다.** 값만 밀어 넣으면 다음 프레임에 도로
  // 끌고 간다 — 크리티컬 댐프드라 조용히, 몇 프레임에 걸쳐 (`shot.mjs --eye`)
  await page.evaluate(async () => {
    const loop = (await import('/src/engine/loop/GameLoop.ts')).gameLoop
    const cams = (await import('/src/engine/actor/camera.ts')).cameraSystem
    loop.systems = loop.systems.filter((s) => s !== cams)
  })
}

/** 카메라를 놓고 한 프레임 기다린다 */
async function look(eye, gaze, waitMs = 300) {
  await page.evaluate(async ([e, g]) => {
    const w = await import('/src/state/worldState.ts')
    w.worldState.camera.position.set(e[0], e[1], e[2])
    w.worldState.camera.target.set(g[0], g[1], g[2])
  }, [eye, gaze])
  await page.waitForTimeout(waitMs)
}

/** 눈에서 yaw·pitch로 본다. 1인칭 눈높이·앞으로 나온 만큼을 그대로 쓴다 */
async function lookFrom(at, yaw, pitch, waitMs) {
  const a = (yaw * Math.PI) / 180
  const t = (pitch * Math.PI) / 180
  const f = [Math.sin(a) * Math.cos(t), Math.sin(t), Math.cos(a) * Math.cos(t)]
  await look(
    [at[0] + f[0] * EYE_FORWARD, at[1], at[2] + f[2] * EYE_FORWARD],
    [at[0] + f[0] * 6, at[1] + f[1] * 6, at[2] + f[2] * 6], waitMs)
}

/** 화면의 여러 픽셀에 한꺼번에 광선을 쏜다 */
const rays = (pixels) => page.evaluate(async ([pxs, w, h, fov]) => {
  const THREE = await import('/node_modules/three/build/three.webgpu.js')
  const refs = await import('/src/scene/sceneRefs.ts')
  const ws = await import('/src/state/worldState.ts')
  let root = refs.sceneRefs.player
  while (root?.parent) root = root.parent
  if (!root) return null
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.1, 400)
  cam.position.copy(ws.worldState.camera.position)
  cam.lookAt(ws.worldState.camera.target)
  cam.updateMatrixWorld()
  const ray = new THREE.Raycaster()
  return pxs.map(([sx, sy]) => {
    ray.setFromCamera(new THREE.Vector2((sx / w) * 2 - 1, -((sy / h) * 2 - 1)), cam)
    const hit = ray.intersectObject(root, true)[0]
    return hit ? { mesh: hit.object.name || hit.object.type, d: +hit.distance.toFixed(3) } : null
  })
}, [pixels, VIEW.width, VIEW.height, FOV])

/** 월드 점을 지금 카메라로 화면 좌표에 옮긴다 */
const project = (points) => page.evaluate(async ([pts, w, h, fov]) => {
  const THREE = await import('/node_modules/three/build/three.webgpu.js')
  const ws = await import('/src/state/worldState.ts')
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.1, 400)
  cam.position.copy(ws.worldState.camera.position)
  cam.lookAt(ws.worldState.camera.target)
  cam.updateMatrixWorld()
  const v = new THREE.Vector3()
  return pts.map(([x, y, z]) => {
    v.set(x, y, z).project(cam)
    // 절두체 밖이면 null — 밖의 점을 픽셀로 읽으면 엉뚱한 색이 섞인다
    if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null
    return [Math.round((v.x + 1) / 2 * w), Math.round((1 - v.y) / 2 * h)]
  })
}, [points, VIEW.width, VIEW.height, FOV])

/**
 * `trunkNudge`가 옮긴 나무를 **그 맵 스스로의 기준으로** 가른다.
 *
 * ⚠️ 옮기는 폭은 ±0.5타일이고(`plates.ts`), 안 옮긴 나무가 어느 소수 자리에
 * 서는지는 맵마다 정하는 것이 아니라 **그 맵의 다수**가 정한다. 다수를 기준으로
 * 잡으면 「옮겨졌다」가 실제로 옮겨진 것만 가리킨다
 */
function nudgedOf(rows) {
  const mode = (key) => {
    const by = new Map()
    for (const r of rows) by.set(r[key], (by.get(r[key]) ?? 0) + 1)
    return [...by].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  }
  const mx = mode('fx')
  const mz = mode('fz')
  return rows.map((r) => ({
    ...r,
    nudged: Math.abs(r.fx - mx) > 0.2 || Math.abs(r.fz - mz) > 0.2,
  }))
}

/** ⚠️ `decodePng`가 주는 것은 `{w,h,bpp,pixels}`다 — 알파가 없는 판도 있어 `bpp`를 봐야 한다 */
const px = (shot, x, y) => {
  if (x < 0 || y < 0 || x >= shot.w || y >= shot.h) return null
  const i = (y * shot.w + x) * shot.bpp
  return [shot.pixels[i], shot.pixels[i + 1], shot.pixels[i + 2]]
}
const lum = (c) => (c === null ? -1 : 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])
const dist = (a, b) => (a === null || b === null ? 1e9
  : Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)

// ── 씬에서 나무를 꺼낸다 ─────────────────────────────────────────────────────

/**
 * 실제로 선 줄기·밑동 그림자를 꺼내고, **설 수 있는 칸 중 제일 빽빽한 곳**을
 * 같이 고른다.
 *
 * ⚠️ **`먼 것` LOD는 같은 나무를 한 번 더 센다.** 안 거르면 밀도가 두 배로
 * 나오고, 그러면 「제일 빽빽한 칸」이 실제로 빽빽한 곳이 아니게 된다.
 */
const treeScene = () => page.evaluate(async ([chunk, trunkR]) => {
  const THREE = await import('/node_modules/three/build/three.webgpu.js')
  const refs = await import('/src/scene/sceneRefs.ts')
  const zone = await import('/src/engine/map/zone.ts')
  const ws = await import('/src/state/worldState.ts')
  let root = refs.sceneRefs.player
  while (root?.parent) root = root.parent
  const grid = zone.activeZone.grid
  if (!root || !grid) return { err: '무대나 격자가 없다' }

  const m = new THREE.Matrix4()
  const v = new THREE.Vector3()
  const trunks = []
  const shades = []
  /** 딛는 높이를 물어볼 바닥 메시 (`dropTo`) */
  const floors = []
  root.traverse((o) => {
    if (o.isMesh === true && (o.name === '지형' || o.name === '메운 바닥')) floors.push(o)
    if (o.isInstancedMesh !== true) return
    const stem = o.name.startsWith('줄기')
    const shade = o.name === '밑동 그림자'
    if (!stem && !shade) return
    if (o.name.includes('먼 것')) return
    o.updateWorldMatrix(true, false)
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m)
      m.premultiply(o.matrixWorld)
      v.setFromMatrixPosition(m)
      ;(stem ? trunks : shades).push({ x: v.x, y: v.y, z: v.z })
    }
  })

  const rows = trunks.map((t) => {
    let gap = Infinity
    for (const s of shades) {
      const d = Math.hypot(s.x - t.x, s.z - t.z)
      if (d < gap) gap = d
    }
    const hs = [[-trunkR, -trunkR], [trunkR, -trunkR], [-trunkR, trunkR], [trunkR, trunkR]]
      .map(([dx, dz]) => grid.heightAtWorld(t.x + dx, t.z + dz, t.y))
      .filter((h) => h !== null)
    const ground = grid.heightAtWorld(t.x, t.z, t.y)
    const crowd = trunks.filter((o) => o !== t
      && Math.abs(o.x - t.x) < 3 && Math.abs(o.z - t.z) < 3).length
    const tx = Math.floor(t.x)
    const tz = Math.floor(t.z)
    return {
      x: +t.x.toFixed(3), y: +t.y.toFixed(3), z: +t.z.toFixed(3),
      ground: ground === null ? null : +ground.toFixed(3),
      slope: hs.length ? +(Math.max(...hs) - Math.min(...hs)).toFixed(3) : null,
      shadowGap: gap === Infinity ? null : +gap.toFixed(3),
      crowd,
      // ⚠️ **「칸 가운데에서 벗어났으면 옮긴 것」이라고 가정하면 안 된다.**
      // 그렇게 재 봤더니 여섯 맵에서 나무가 **하나도 빠짐없이** 옮겨진 것으로
      // 나왔다 — 안 옮긴 나무가 서는 자리가 칸 가운데가 아니었던 것이다.
      // 그래서 기준을 밖에서 정하지 않고 **그 맵의 다수 좌표**로 잡는다
      // (`nudgedOf`). 여기서는 소수 자리만 적어 둔다
      fx: +(t.x - tx).toFixed(3),
      fz: +(t.z - tz).toFixed(3),
      border: Math.min(tx % chunk, chunk - 1 - (tx % chunk),
        tz % chunk, chunk - 1 - (tz % chunk)) <= 1,
      water: [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]
        .some(([dx, dz]) => zone.isWater(grid.behaviorAtWorld(t.x + dx, t.z + dz))),
    }
  })

  // 설 자리. 반경 5타일 안에 줄기가 제일 많은 칸을 고르되 **트인 곳이라야 한다**.
  //
  // ⚠️ **빽빽함만 보면 나무 벽 사이 골목에 선다.** 영원의숲에서 그렇게 골랐더니
  // 코앞이 벽이라 바닥이 한 뼘도 안 보였다 — 「바닥을 넓게」가 목적이므로
  // 반경 2타일 스물다섯 칸 중 절반 이상이 걸어 다닐 수 있어야 후보로 친다.
  // 그런 칸이 아예 없으면(진짜 골목뿐인 맵) 그 사실을 적고 물러선다
  const p = ws.worldState.player.position
  const openAround = (tx, tz) => {
    let open = 0
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) if (!grid.isBlocked(tx + dx, tz + dz)) open++
    }
    return open
  }
  /**
   * 그 칸에서 **실제로 딛는 바닥의 높이.**
   *
   * ⚠️ **이걸 어림으로 두면 눈이 바닥 밑으로 들어간다.** 원작 지형은 뒷면을
   * 안 만들어서(법선 123,733개 중 123,531개가 위) 밑에서 보면 바닥이 통째로
   * **사라지고** 그 위에 선 나무만 남는다 — 화면 절반이 하늘색으로 뜨고
   * 지형이 직선으로 끊긴 것처럼 보였던 것이 그것이다. 어림 높이보다 조금 위에서
   * 아래로 광선을 쏘아 **맞은 자리**를 쓴다
   */
  function dropTo(x, z, guess) {
    const down = new THREE.Raycaster(
      new THREE.Vector3(x, guess + 6, z), new THREE.Vector3(0, -1, 0), 0, 14)
    const hit = down.intersectObjects(floors, false)[0]
    return hit ? hit.point.y : null
  }

  let best = null
  let bestTight = null
  for (let dz = -14; dz <= 14; dz++) {
    for (let dx = -14; dx <= 14; dx++) {
      const tx = Math.floor(p.x) + dx
      const tz = Math.floor(p.z) + dz
      if (grid.isBlocked(tx, tz)) continue
      const cx = tx + 0.5
      const cz = tz + 0.5
      const near = trunks.filter((t) => Math.abs(t.x - cx) < 5 && Math.abs(t.z - cz) < 5)
      const n = near.length
      const open = openAround(tx, tz)
      // ⚠️ **높이를 주인공 y로 물으면 딴 층을 집는다.** 영원의숲처럼 층이 겹친
      // 맵에서 먼 칸의 높이를 주인공 기준으로 물었더니 **아래층 바닥**이 나왔고,
      // 눈이 지면 밑으로 들어가 판 옆면만 찍혔다. 그래서 가까운 줄기의 중앙값을
      // 어림으로 쓰고, **진짜 높이는 바닥에 광선을 쏘아 받는다** (`dropTo`)
      const ys = near.map((t) => t.y).sort((a, b) => a - b)
      const guess = ys.length > 0 ? ys[Math.floor(ys.length / 2)] : grid.heightAtWorld(cx, cz, p.y)
      if (guess === null || guess === undefined) continue
      const gy = dropTo(cx, cz, guess)
      if (gy === null) continue
      const spot = { x: cx, z: cz, y: gy, n, open }
      if (open >= 13) { if (best === null || n > best.n) best = spot }
      else if (bestTight === null || n > bestTight.n) bestTight = spot
    }
  }
  return {
    trunks: trunks.length,
    shades: shades.length,
    rows,
    stand: best ?? bestTight,
    tight: best === null,
  }
}, [CHUNK_TILES, TRUNK_R])

// ── ① 숲 바닥 — 1인칭으로 넓게 ───────────────────────────────────────────────

/** 바닥이 화면을 채우는 각. 눈높이 1.38에서 −18°면 1.4타일 앞부터 지평선까지다 */
const FLOOR_VIEWS = [
  ...Array.from({ length: 8 }, (_, i) => ({ yaw: i * 45, pitch: -18 })),
  ...Array.from({ length: 4 }, (_, i) => ({ yaw: i * 90 + 45, pitch: -35 })),
  ...Array.from({ length: 4 }, (_, i) => ({ yaw: i * 90, pitch: 0 })),
]

async function floorSweep(id) {
  await jump(id)
  const scene = await treeScene()
  if (scene.err) return { id, err: scene.err }
  if (!scene.stand) return { id, err: '설 자리를 못 찾았다' }
  scene.rows = nudgedOf(scene.rows)
  const dir = resolve(OUT, `숲바닥-${id}`)
  mkdirSync(dir, { recursive: true })

  // ⚠️ **주인공도 그 칸으로 옮긴다.** 카메라만 옮기면 주인공은 원래 자리에
  // 서 있고, 그 몸이 화면 구석에 걸려 들어온다 — 「1인칭에서 어떻게 보이나」를
  // 판단하는 그림에 남의 팔이 떠 있으면 안 된다 (`shot.mjs --at`과 같은 방식)
  await page.evaluate(async ([x, y, z]) => {
    const w = await import('/src/state/worldState.ts')
    const p = w.worldState.player
    p.position.set(x, y, z)
    p.prevPosition.copy(p.position)
  }, [scene.stand.x, scene.stand.y, scene.stand.z])
  await page.waitForTimeout(600)

  const eye = [scene.stand.x, scene.stand.y + EYE_HEIGHT, scene.stand.z]
  const shots = []
  for (const { yaw, pitch } of FLOOR_VIEWS) {
    await lookFrom(eye, yaw, pitch, 320)
    const png = await page.screenshot()
    const name = `${String(yaw).padStart(3, '0')}도-${pitch < 0 ? `아래${-pitch}` : '수평'}.png`
    writeFileSync(resolve(dir, name), png)
    const stats = statsOf(png)
    shots.push({
      file: relative(OUT, resolve(dir, name)).split('\\').join('/'),
      yaw, pitch, colors: stats.colors, flat: looksFlat(stats),
    })
  }

  // 이 자리에서 보이는 나무들의 수치. 그림 밑에 같이 적어 준다
  const near = scene.rows.filter((r) =>
    Math.abs(r.x - scene.stand.x) < 6 && Math.abs(r.z - scene.stand.z) < 6)
  const floats = near.map((r) => (r.ground === null ? null : r.y - r.ground)).filter((v) => v !== null)
  const gaps = near.map((r) => r.shadowGap).filter((v) => v !== null)
  return {
    id,
    stand: [+scene.stand.x.toFixed(1), +scene.stand.z.toFixed(1)],
    줄기: scene.trunks,
    밑동그림자: scene.shades,
    '반경5': scene.stand.n,
    '트인 칸': `${String(scene.stand.open)}/25${scene.tight ? ' (트인 자리가 없어 골목에 섰다)' : ''}`,
    '가까운 나무': near.length,
    뜬것: floats.filter((v) => Math.abs(v) > 0.05).length,
    '제일 뜬 값': floats.length ? +Math.max(...floats.map(Math.abs)).toFixed(3) : null,
    '그림자 어긋남 최대': gaps.length ? +Math.max(...gaps).toFixed(3) : null,
    옮겨진것: near.filter((r) => r.nudged).length,
    shots,
  }
}

// ── ② 나무 밑동 가까이 ───────────────────────────────────────────────────────

const RING_R = [0.30, 0.45, 0.58, 0.66, 0.74, 0.90]
const RING_A = Array.from({ length: 24 }, (_, i) => (i * Math.PI * 2) / 24)

/** 갈래마다 `PER_KIND`그루씩. 없는 갈래는 **없다고 적는다** */
function pickTrees(rows) {
  const kinds = {
    옮겨진것: rows.filter((r) => r.nudged),
    비탈: rows.filter((r) => (r.slope ?? 0) > 0.25),
    청크경계: rows.filter((r) => r.border),
    숲속: rows.filter((r) => r.crowd >= 6),
    홀로: rows.filter((r) => r.crowd === 0),
    물가: rows.filter((r) => r.water),
  }
  const picked = []
  const missing = []
  for (const [kind, list] of Object.entries(kinds)) {
    if (list.length === 0) { missing.push(kind); continue }
    for (const r of list.slice(0, PER_KIND)) picked.push({ kind, ...r })
  }
  return { picked, missing }
}

async function treeShot(site, n, dir) {
  const gy = site.ground ?? site.y
  // 비스듬히 위에서 — 바로 위에서 보면 줄기가 제 그림자를 가린다
  const eye = [site.x + 1.6, gy + 3.0, site.z + 2.2]
  await look(eye, [site.x, gy + 0.1, site.z], 420)
  const png = await page.screenshot()
  const shot = decodePng(png)
  const file = `${String(n).padStart(2, '0')}-${site.kind}.png`
  writeFileSync(resolve(dir, file), png)

  const world = []
  for (const r of RING_R) {
    for (const a of RING_A) world.push([site.x + Math.cos(a) * r, gy + 0.02, site.z + Math.sin(a) * r])
  }
  // ⚠️ **줄기 색을 재질이 아니라 화면에서 뽑는다.** 톤매핑까지 지난 값이라야
  // 땅에 그려진 갈색과 같은 자 위에 놓인다
  const pxs = await project([...world, [site.x, gy + 0.35, site.z]])
  const hits = await rays(pxs.map((p) => p ?? [0, 0]))
  const stemPx = pxs[pxs.length - 1]
  const stemRgb = stemPx ? px(shot, stemPx[0], stemPx[1]) : null

  let collar = 0
  let onRing = 0
  const patch = []
  const land = []
  for (let i = 0; i < world.length; i++) {
    const p = pxs[i]
    const hit = hits[i]
    if (!p || !hit) continue
    const rgb = px(shot, p[0], p[1])
    if (!rgb) continue
    const r = RING_R[Math.floor(i / RING_A.length)]
    const onTrunk = hit.mesh.startsWith('줄기')
    if (r >= 0.62) {
      onRing++
      // 줄기 밖인데 **화면 색이 줄기와 같으면** 땅에 그려진 나이테다
      if (!onTrunk && stemRgb && dist(rgb, stemRgb) < 42) collar++
    }
    if (hit.mesh === '메운 바닥') patch.push(lum(rgb))
    else if (hit.mesh === '지형') land.push(lum(rgb))
  }

  // Z-파이팅 — 눈을 0.01타일 흔들어 같은 자리를 두 번 찍는다
  await look([eye[0] + 0.01, eye[1], eye[2]], [site.x, gy + 0.1, site.z], 280)
  const shot2 = decodePng(await page.screenshot())
  let moved = 0
  let seen = 0
  for (let i = 0; i < world.length; i++) {
    const p = pxs[i]
    if (!p) continue
    seen++
    if (dist(px(shot, p[0], p[1]), px(shot2, p[0], p[1])) > 30) moved++
  }

  return {
    kind: site.kind,
    at: [+site.x.toFixed(1), +site.z.toFixed(1)],
    나이테목걸이: onRing ? +(collar / onRing * 100).toFixed(1) : null,
    그림자어긋남: site.shadowGap,
    줄기뜸: site.ground === null ? null : +(site.y - site.ground).toFixed(3),
    비탈: site.slope,
    이음매: (mean(patch) !== null && mean(land) !== null)
      ? +Math.abs(mean(patch) - mean(land)).toFixed(1) : null,
    깜빡임: seen ? +(moved / seen * 100).toFixed(1) : null,
    shots: [{ file: relative(OUT, resolve(dir, file)).split('\\').join('/'), yaw: 0, pitch: -40 }],
  }
}

// ── ③ 1인칭 — 무엇이 사라지는가 ─────────────────────────────────────────────

const YAWS = Array.from({ length: 24 }, (_, i) => i * 15)
const PITCHES = [-25, 0, 15]

async function eyeSweep(id) {
  await jump(id)
  const dir = resolve(OUT, `1인칭-${id}`)
  mkdirSync(dir, { recursive: true })
  const at = await page.evaluate(async () => {
    const w = await import('/src/state/worldState.ts')
    const p = w.worldState.player.position
    return [p.x, p.y, p.z]
  })
  const eye = [at[0], at[1] + EYE_HEIGHT, at[2]]
  const rows = []
  const shots = []
  let flat = 0

  // 가운데 5×3 격자로 쏜다 — 사라지는 판은 정면 가까이에서 사라져야 눈에 띈다
  const grid = []
  for (let gy = 1; gy <= 3; gy++) {
    for (let gx = 1; gx <= 5; gx++) {
      grid.push([Math.round(VIEW.width * gx / 6), Math.round(VIEW.height * gy / 4)])
    }
  }

  for (const pitch of PITCHES) {
    for (const yaw of YAWS) {
      await lookFrom(eye, yaw, pitch, 240)
      const png = await page.screenshot()
      const shot = decodePng(png)
      if (looksFlat(statsOf(png))) flat++
      const got = await rays(grid)
      for (const [i, r] of (got ?? []).entries()) {
        rows.push({ pitch, yaw, spot: i, hit: r, rgb: px(shot, grid[i][0], grid[i][1]) })
      }
      if (pitch === 0 && yaw % 90 === 0) {
        const file = `${String(yaw).padStart(3, '0')}도.png`
        writeFileSync(resolve(dir, file), png)
        shots.push({ file: relative(OUT, resolve(dir, file)).split('\\').join('/'), yaw, pitch })
      }
    }
  }

  const near = (r) => r.hit !== null && r.hit.d < 4
  const vanish = []
  for (const pitch of PITCHES) {
    for (let s = 0; s < grid.length; s++) {
      const line = YAWS.map((y) => rows.find((r) => r.pitch === pitch && r.yaw === y && r.spot === s))
      for (let i = 0; i < line.length; i++) {
        const a = line[i]
        const b = line[(i + 1) % line.length]
        if (a && b && near(a) && b.hit === null) vanish.push(a.hit.mesh)
      }
    }
  }
  return {
    id,
    잰것: rows.length,
    사라짐: vanish.length,
    사라진것: [...new Set(vanish)].slice(0, 6),
    몸속: rows.filter((r) => r.hit !== null && r.hit.d < 0.5).length,
    바닥구멍: rows.filter((r) => r.pitch === -25 && r.hit === null).length,
    '광선≠픽셀': rows.filter((r) => r.hit !== null && r.hit.d < 8 && r.rgb !== null
      && r.rgb[2] > 150 && r.rgb[2] > r.rgb[0] + 25).length,
    한색화면: flat,
    shots,
  }
}

// ── 대지 ─────────────────────────────────────────────────────────────────────

/**
 * 그림을 한 장에 늘어놓는다.
 *
 * ⚠️ **수치를 그림 밑에 같이 적는다.** 「어색한가」는 사람이 볼 몫이지만, 그
 * 판단이 「무엇을 보고 있는지」를 알고 이뤄져야 한다 — 뜬 나무 셋이 섞인 화면과
 * 다 붙어 있는 화면은 눈에는 비슷해 보여도 고칠 자리가 다르다.
 */
function sheet(mode, rows) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
  const cards = rows.map((r) => {
    const nums = Object.entries(r)
      .filter(([k, v]) => k !== 'shots' && k !== 'id' && k !== 'file' && v !== null && v !== undefined)
      .map(([k, v]) => `<b>${esc(k)}</b> ${esc(Array.isArray(v) ? v.join(',') : v)}`)
      .join(' · ')
    const imgs = (r.shots ?? []).map((s) => `<figure>
      <img src="${esc(s.file)}" loading="lazy">
      <figcaption>${esc(s.yaw)}° ${s.pitch < 0 ? `아래 ${-s.pitch}°` : '수평'}</figcaption>
    </figure>`).join('')
    return `<section><h2>${esc(r.id ?? r.map ?? r.kind)}</h2>
      <p class="nums">${nums}</p><div class="grid">${imgs}</div></section>`
  }).join('\n')
  return `<title>${esc(mode)} — 화면으로 보는 자리</title>
<style>
  :root { color-scheme: light dark; --bg:#faf9f7; --fg:#1b1a18; --dim:#6b6862; --line:#e2ded7 }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#16151a; --fg:#eceaf2; --dim:#9a96a6; --line:#2c2a33 }
  }
  body { margin:0; padding:24px; background:var(--bg); color:var(--fg);
    font:15px/1.6 ui-sans-serif,-apple-system,"Segoe UI",sans-serif }
  h1 { font-size:20px; margin:0 0 4px }
  .lead { color:var(--dim); margin:0 0 24px; max-width:60ch }
  section { border-top:1px solid var(--line); padding:18px 0 }
  h2 { font-size:17px; margin:0 0 6px }
  .nums { color:var(--dim); font-size:13px; margin:0 0 12px }
  .nums b { color:var(--fg); font-weight:600 }
  .grid { display:grid; gap:12px; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)) }
  figure { margin:0 }
  img { width:100%; height:auto; display:block; border:1px solid var(--line); border-radius:6px }
  figcaption { color:var(--dim); font-size:12px; padding-top:4px }
</style>
<h1>${esc(mode)} — 화면으로 보는 자리</h1>
<p class="lead">수치는 기계가 잰 것이고, <b>어색한지 자연스러운지는 눈으로 볼 몫이다.</b>
헤드리스라 WebGL2 폴백에서 그린 화면이다 — 배치·모델·색은 실제와 같고 속도만 다르다.</p>
${cards}
`
}

// ── 몰기 ─────────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true })
const rows = []

if (MODE === 'floor') {
  for (const id of FLOOR_MAPS) {
    process.stdout.write(`  ${id} …`)
    const r = await floorSweep(id)
    rows.push(r)
    console.log(r.err ? ` ${r.err}`
      : ` 줄기 ${r.줄기} · 선 자리 반경5에 ${r['반경5']}그루`
        + ` · 가까운 나무 ${r['가까운 나무']} (뜬 것 ${r.뜬것} · 옮겨진 것 ${r.옮겨진것})`)
  }
} else if (MODE === 'tree') {
  for (const id of TREE_MAPS) {
    await jump(id)
    const dir = resolve(OUT, `밑동-${id}`)
    mkdirSync(dir, { recursive: true })
    const scene = await treeScene()
    if (scene.err) { console.log(`  ${id}: ${scene.err}`); continue }
    const { picked, missing } = pickTrees(nudgedOf(scene.rows))
    console.log(`\n  ${id} — 줄기 ${scene.trunks} · 밑동 그림자 ${scene.shades}`
      + ` · 고른 것 ${picked.length}`
      + (missing.length ? ` · **없는 갈래: ${missing.join(' · ')}**` : ''))
    for (const [n, site] of picked.entries()) {
      const r = await treeShot(site, n, dir)
      rows.push({ id: `${id} · ${r.kind}`, ...r })
      console.log(`   ${r.kind.padEnd(6)} 나이테 ${String(r.나이테목걸이 ?? '?').padStart(5)}%`
        + ` · 그림자 ${String(r.그림자어긋남 ?? '?').padStart(5)}`
        + ` · 뜸 ${String(r.줄기뜸 ?? '?').padStart(6)}`
        + ` · 이음매 ${String(r.이음매 ?? '?').padStart(5)}`
        + ` · 깜빡임 ${String(r.깜빡임 ?? '?').padStart(5)}%`)
    }
  }
} else {
  for (const id of EYE_SITES) {
    process.stdout.write(`  ${id} …`)
    const r = await eyeSweep(id)
    rows.push(r)
    console.log(` 잰 점 ${r.잰것} · 사라짐 ${r.사라짐} · 몸속 ${r.몸속}`
      + ` · 바닥구멍 ${r.바닥구멍} · 광선≠픽셀 ${r['광선≠픽셀']} · 한색 ${r.한색화면}`)
  }
}

writeFileSync(resolve(OUT, `${MODE}.json`), `${JSON.stringify({ mode: MODE, rows }, null, 1)}\n`)
writeFileSync(resolve(OUT, `${MODE}.html`), sheet(MODE, rows))
console.log(`\n대지: shots/look/${MODE}.html · 값: shots/look/${MODE}.json`)
if (noise.length) console.log(`콘솔 ${noise.length}건: ${[...new Set(noise)].slice(0, 3).join(' | ')}`)

await browser.close()
vite.child.kill()
