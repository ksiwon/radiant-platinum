// **빈틈 검사** — 벽이 다 메워졌는가, 서 있는 것 밑에 바닥이 있는가,
// 그리고 **실제로 보는 카메라에서 새는 데가 있는가.**
//
//     node tools/audit/holes.mjs                     확인 지점 전부, 세 검사 다
//     node tools/audit/holes.mjs --at=eterna,center  자리를 골라서
//     node tools/audit/holes.mjs --walls             벽만
//     node tools/audit/holes.mjs --floors            바닥만
//     node tools/audit/holes.mjs --eyes              시점만 (1인칭·3인칭)
//     node tools/audit/holes.mjs --eyes --shots      찍어서 `.audit/eyes/`에 둔다
//
// ⚠️ **「안 맞았다」를 빈틈이라 부르면 안 된다.** 원작 실내는 뚜껑이 없는 상자고
// (카메라가 한 각도로 고정이라 안 보이는 벽은 아예 안 만들었다), 소품에는 판
// 한 장짜리 간판·그림자가 섞여 있다. 그것들까지 세면 방 하나에 수백 건이 뜨는데
// 전부 원작 그대로다 — 실제로 첫 판이 그렇게 나왔다.
//
// 그래서 잣대를 **「그려지는가」**로 잡는다. 광선을 쏴서 맞은 삼각형을 앞에서부터
// 훑으며, 그 면이 **그 방향에서 실제로 칠해지는지**를 본다:
//
//   · 양면(`DoubleSide`) 재질 → 어느 쪽에서 봐도 칠해진다
//   · 단면(`FrontSide`) 재질 → 앞에서 볼 때만 칠해진다
//
// 판정은 셋이고 전부 화면에 그대로 보이는 고장이다:
//
//   ① **뚫린 벽** — 그 선 위에 삼각형이 **있는데** 칠해지는 것이 하나도 없다.
//      곧 벽이 거기 있는데 뒤집혀 있어서 **속이 훤히 보인다** (`shell.ts`가
//      메우는 「빠진 면」이 안 메워진 자리다).
//   ② **뚫린 바닥** — 나무·소품·울타리가 선 자리 밑에 바닥이 없거나, 있어도
//      그 자리 텍셀이 알파 컷 아래라 **비친다** (사용자가 「투명 타일」이라 한 것).
//   ③ **새는 시점** — ①②는 어디서 보든 참인 성질이라 **카메라를 안 본다.**
//      그런데 사용자가 보는 것은 카메라다. 그래서 실제 시점 그대로 —
//      3인칭은 원작처럼 남쪽 8m·높이 4m에 붙어 있고, 1인칭은 눈높이 1.38m에서
//      고개를 돌린다 (`engine/actor/camera.ts`) — **화면 격자마다 광선을 쏜다.**
//      실내에서 눈높이 아래로 아무것도 안 맞으면 그 픽셀은 **허공이 보이는
//      자리**다. 사용자가 「문 있는 벽 쪽은 그냥 검은색」이라 한 것이 이것이다.
//
// ⚠️ **③의 「위쪽 허공」은 고장이 아니다.** 원작 실내는 뚜껑이 없다 — 카메라가
// 비스듬히 내려다보게 고정이라 천장을 만들 이유가 없었다. 1인칭으로 고개를
// 들면 그 자리가 비는데 원작 그대로다. 그래서 수평 아래와 위를 **갈라 센다**.
//
// ⚠️ **성능은 여기서 안 잰다.** 헤드리스라 WebGL2 폴백이고 광선은 CPU에서 돈다 —
// 여기서 보는 것은 배치와 지오메트리뿐이다 (`tools/shot/look.mjs`와 같다).
//
// ⚠️ **밖으로 안 올린다.** 원본에서 나온 자료라 결과는 `.audit/`에만 쓴다.
//
// ⚠️ **브라우저 검사를 둘 같이 돌리지 않는다.** `startVite`가 쓰는 최적화 캐시
// (`node_modules/.vite-harness`)가 한 자리라, 둘이 붙으면 뒤에 뜬 쪽이 개발
// 서버 응답을 못 받고 멈춘다 (실측으로 그렇게 걸렸다). 차례로 돌린다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const glued = args.find((a) => a.startsWith(`--${name}=`))
  if (glued !== undefined) return glued.slice(name.length + 3)
  const at = args.indexOf(`--${name}`)
  const next = at < 0 ? undefined : args[at + 1]
  return next === undefined || next.startsWith('--') ? fallback : next
}
/** 고른 검사가 없으면 전부 돈다 */
const PICKED = ['walls', 'floors', 'eyes'].filter((n) => args.includes(`--${n}`))
const wants = (n) => PICKED.length === 0 || PICKED.includes(n)
const WANT_WALLS = wants('walls')
const WANT_FLOORS = wants('floors')
const WANT_EYES = wants('eyes')
const WANT_SHOTS = args.includes('--shots')
const JSON_OUT = flag('json', '.audit/holes.json')
const SETTLE_MS = Number(flag('settle', 7000))

/** 1인칭 눈높이 — 실제 값이다 (`actor/camera`의 `EYE_HEIGHT`) */
const EYE_HEIGHT = 1.38
/**
 * 화각을 **베껴 적지 않는다.**
 *
 * 여기 `55`가 박혀 있었는데 렌즈가 늘어났다 — 깨어진 세계는 8.09도이고
 * 실내는 거리·높이가 다르다. 베껴 둔 수는 렌즈가 하나일 때만 맞고, 늘어난
 * 뒤로는 **화면에 안 보이는 자리를 「보인다」고 세게** 된다. 그래서 살아 있는
 * `cameraSystem.fov`를 그 자리에서 읽는다 (자리·목표·위쪽은 진작 그렇게 한다)
 */
const VIEW = { width: 960, height: 640 }
/** 고개를 돌리는 각. 45도씩 여덟 방향 × 위아래 셋 */
const YAWS = [0, 45, 90, 135, 180, 225, 270, 315]
const PITCHES = [-20, 0, 20]

/**
 * 기본으로 도는 자리.
 *
 * 실외는 건물이 선 마을을 다 담고, 실내는 **갈래마다 하나씩** 담는다 — 방·문·
 * 상점·센터·박물관·체육관·굴이다. 실내 맵이 334개라 전부 도는 것은 `pnpm story`의
 * 몫이고 여기서는 갈래를 훑는다
 */
const DEFAULT_AT = [
  'twinleaf', 'sandgem', 'jubilife', 'oreburgh', 'eterna', 'hearthome', 'veilstone',
  'pastoria', 'canalave', 'snowpoint', 'sunyshore', 'valor', 'berry', 'forest', 'route217',
  'room', 'door', 'mart', 'center', 'museum', 'gym1', 'gym4', 'mine', 'library',
  'ironworks', 'coronet', 'distortion',
]
const AT = (flag('at', '') || DEFAULT_AT.join(',')).split(',').filter(Boolean)

const port = Number(process.env.PROBE_PORT ?? 0) || (await freePort()) + 40000
const vite = await startVite(port, 'node_modules/.vite-harness')
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
page.setDefaultTimeout(120_000)
page.setDefaultNavigationTimeout(180_000)
const url = `http://localhost:${port}/`

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
}

const inspect = (want) => page.evaluate(async ([doWalls, doFloors]) => {
  const THREE = await import('/node_modules/three/build/three.webgpu.js')
  const refs = await import('/src/scene/sceneRefs.ts')
  const ws = await import('/src/state/worldState.ts')
  const worldMod = await import('/src/engine/map/world.ts')
  const zoneMod = await import('/src/engine/map/zone.ts')
  let root = refs.sceneRefs.player
  while (root?.parent) root = root.parent
  if (!root) return { err: '무대가 없다' }
  const mapId = worldMod.world.mapId ?? -1
  const header = worldMod.mapById(mapId)
  const outdoor = header?.mapType === 1 || header?.mapType === 2
  const grid = zoneMod.activeZone.grid

  const normalOf = (hit) => hit.face
    ? hit.face.normal.clone()
      .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
    : null
  const matOf = (hit) => {
    const mats = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material]
    return mats[hit.face?.materialIndex ?? 0] ?? null
  }
  /** 그 방향에서 이 면이 실제로 칠해지는가. 양면이면 늘, 단면이면 앞에서만 */
  const paintedFrom = (hit, dir) => {
    const m = matOf(hit)
    if (!m) return false
    if (m.side === THREE.DoubleSide) return true
    const n = normalOf(hit)
    if (!n) return true
    return m.side === THREE.BackSide ? n.dot(dir) > 0 : n.dot(dir) < 0
  }
  /**
   * 광선 한 발의 판정.
   *
   * `'없다'` 아무것도 안 맞았다 (원작 실내의 열린 쪽이라 고장이 아니다) ·
   * `'그려짐'` 제대로 칠해진다 · `'뚫림'` **삼각형은 있는데 하나도 안 칠해진다**
   */
  const verdictOf = (hits, dir) => {
    if (hits.length === 0) return '없다'
    for (const h of hits) if (paintedFrom(h, dir)) return '그려짐'
    return '뚫림'
  }

  const out = { mapId, outdoor, walls: null, floors: null }

  // ── ① 벽 ────────────────────────────────────────────────────────────────
  if (doWalls) {
    const ray = new THREE.Raycaster()
    ray.far = 500
    const holes = []

    // 바깥벽 — 건물 소품마다 스물여섯 방향에서 평행 광선 격자
    const buildings = []
    root.traverse((o) => {
      if (o.isMesh !== true || o.name !== '소품') return
      const group = o.parent?.parent ?? o.parent
      if (!group) return
      group.updateWorldMatrix(true, true)
      const parts = []
      group.traverse((m) => { if (m.isMesh === true) parts.push(m) })
      const box = new THREE.Box3()
      for (const m of parts) box.expandByObject(m)
      if (!isFinite(box.min.x)) return
      const size = box.getSize(new THREE.Vector3())
      // 판 한 장짜리(간판·그림자)는 애초에 속이 없다 — 벽 검사 대상이 아니다
      if (Math.min(size.x, size.y, size.z) < 0.5) return
      buildings.push({ parts, box, size })
    })

    const dirs = []
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0 && dz === 0) continue
          dirs.push(new THREE.Vector3(dx, dy, dz).normalize())
        }
      }
    }
    const GRID = 9
    let shot = 0, pierced = 0, holed = 0
    for (const b of buildings) {
      const centre = b.box.getCenter(new THREE.Vector3())
      const reach = b.size.length()
      let bad = 0
      for (const dir of dirs) {
        const up = Math.abs(dir.y) > 0.9
          ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
        const ax = new THREE.Vector3().crossVectors(dir, up).normalize()
        const az = new THREE.Vector3().crossVectors(dir, ax).normalize()
        const back = dir.clone().negate()
        for (let i = 0; i < GRID; i++) {
          for (let j = 0; j < GRID; j++) {
            const from = centre.clone().addScaledVector(dir, reach)
              .addScaledVector(ax, ((i + 0.5) / GRID - 0.5) * reach)
              .addScaledVector(az, ((j + 0.5) / GRID - 0.5) * reach)
            ray.set(from, back)
            shot++
            if (verdictOf(ray.intersectObjects(b.parts, false), back) !== '뚫림') continue
            bad++
            pierced++
            if (holes.length < 12) {
              holes.push(`바깥 ${centre.x.toFixed(1)},${centre.z.toFixed(1)}`
                + ` ← ${dir.x.toFixed(1)},${dir.y.toFixed(1)},${dir.z.toFixed(1)}`)
            }
          }
        }
      }
      if (bad > 0) holed++
    }

    // 안쪽벽 — 실내·굴에서는 눈높이에서 사방으로. 여기서도 **「안 맞았다」는
    // 안 센다** (원작 방은 뚜껑도 뒷벽도 없다). 세는 것은 뚫린 것뿐이다
    let insideShot = 0, insidePierced = 0
    if (!outdoor) {
      const solid = []
      root.traverse((o) => {
        if (o.isMesh !== true) return
        if (['지형', '메운 바닥', '판 옆면', '방 벽', '소품', '소품 채운 면'].includes(o.name)) solid.push(o)
      })
      const eye = new THREE.Vector3(
        ws.worldState.player.position.x,
        ws.worldState.player.position.y + 1.38,
        ws.worldState.player.position.z)
      for (let a = 0; a < 180; a++) {
        for (const pitch of [-55, -30, -12, 0, 12, 28]) {
          const th = (a / 180) * Math.PI * 2
          const ph = (pitch * Math.PI) / 180
          const dir = new THREE.Vector3(
            Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph))
          ray.set(eye, dir)
          insideShot++
          if (verdictOf(ray.intersectObjects(solid, false), dir) !== '뚫림') continue
          insidePierced++
          if (holes.length < 12) {
            holes.push(`안쪽 ${String(Math.round((th * 180) / Math.PI))}도 ${String(pitch)}°`)
          }
        }
      }
    }
    // 방 둘레 — **바닥이 끝나는 자리에 벽이 서 있는가.**
    //
    // ⚠️ 원작 실내는 카메라가 한 각도로 고정이라 **안 보이는 쪽 벽을 아예 안
    // 만들었다.** 문이 있는 앞벽이 그렇다 — 자유 카메라로 돌아보면 그 자리가
    // 통째로 검다. 광선으로 「안 맞았다」를 세면 뚜껑 열린 것까지 걸리므로,
    // 바닥 칸의 **가장자리마다** 옆으로 짧게 쏴서 벽이 있는지만 본다
    let edges = 0, open = 0, doorway = 0, ledge = 0
    const openAt = []
    if (!outdoor) {
      const floors = []
      const solid = []
      root.traverse((o) => {
        if (o.isMesh !== true) return
        if (o.name === '지형' || o.name === '메운 바닥') floors.push(o)
        if (['지형', '메운 바닥', '판 옆면', '방 벽', '소품', '소품 채운 면'].includes(o.name)) solid.push(o)
      })
      const p = ws.worldState.player.position
      const down = new THREE.Vector3(0, -1, 0)
      const floorY = new Map()
      const R = 40
      for (let tz = Math.floor(p.z) - R; tz <= Math.floor(p.z) + R; tz++) {
        for (let tx = Math.floor(p.x) - R; tx <= Math.floor(p.x) + R; tx++) {
          ray.set(new THREE.Vector3(tx + 0.5, p.y + 12, tz + 0.5), down)
          const hit = ray.intersectObjects(floors, false)[0]
          if (hit) floorY.set(`${String(tx)},${String(tz)}`, hit.point.y)
        }
      }
      // 어느 모서리를 세로 면이 **어느 높이까지** 덮는가. 광선으로 묻지 않고
      // 삼각형을 직접 센다 — 광선은 벽이 칸 한가운데에 그려졌는지 경계에
      // 그려졌는지에 따라 답이 갈린다.
      //
      // ⚠️ **「있다·없다」로는 모자란다.** 무릎 높이 굽도리 한 장만 있어도 그
      // 모서리가 막힌 것으로 세어져, `roomWalls`가 벽을 안 세우고 눈높이 광선이
      // 그 위로 넘어간다. 실측으로 주인공 방 북쪽이 그랬다 — 덮는 높이가
      // `-0.1~4.3`이라 넉넉해 보였지만, 낮은 굽도리와 높은 지붕의 **최소·최대**를
      // 붙여 놓은 것이라 가운데 2.3~2.9m가 비어 있었다
      const walled = new Map()
      const mark = (key, y0, y1) => {
        const had = walled.get(key)
        if (had) had.push([y0, y1])
        else walled.set(key, [[y0, y1]])
      }
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
      const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nn = new THREE.Vector3()
      for (const o of solid) {
        o.updateWorldMatrix(true, false)
        const pos = o.geometry.getAttribute('position')
        const idx = o.geometry.getIndex()
        const count = idx ? idx.count : pos.count
        for (let i = 0; i + 3 <= count; i += 3) {
          const [i0, i1, i2] = idx
            ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]
            : [i, i + 1, i + 2]
          a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld)
          b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld)
          c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld)
          nn.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a))
          const len = nn.length()
          if (len < 1e-9) continue
          if (Math.abs(nn.y / len) >= 0.7) continue // 바닥·천장은 벽이 아니다
          // ⚠️ **칸이 아니라 모서리로 적는다.** 「이 칸에 벽이 있다」로 두면 북쪽
          // 벽 하나가 그 칸의 서·동·남까지 막힌 것으로 세어, 진짜 구멍을 놓친다
          // (`src/scene/roomWalls.ts`가 같은 잣대를 쓴다)
          const bx0 = Math.min(a.x, b.x, c.x), bx1 = Math.max(a.x, b.x, c.x)
          const bz0 = Math.min(a.z, b.z, c.z), bz1 = Math.max(a.z, b.z, c.z)
          const ty0 = Math.min(a.y, b.y, c.y), ty1 = Math.max(a.y, b.y, c.y)
          const thinX = bx1 - bx0 < 0.35, thinZ = bz1 - bz0 < 0.35
          if (thinX && !thinZ) {
            const line = Math.round((bx0 + bx1) / 2)
            for (let tz = Math.floor(bz0); tz <= Math.floor(bz1 - 1e-6); tz++) {
              mark(`x${String(line)}:${String(tz)}`, ty0, ty1)
            }
          } else if (thinZ && !thinX) {
            const line = Math.round((bz0 + bz1) / 2)
            for (let tx = Math.floor(bx0); tx <= Math.floor(bx1 - 1e-6); tx++) {
              mark(`z${String(line)}:${String(tx)}`, ty0, ty1)
            }
          } else {
            for (let tz = Math.floor(bz0); tz <= Math.floor(bz1); tz++) {
              for (let tx = Math.floor(bx0); tx <= Math.floor(bx1); tx++) {
                mark(`x${String(tx)}:${String(tz)}`, ty0, ty1)
                mark(`x${String(tx + 1)}:${String(tz)}`, ty0, ty1)
                mark(`z${String(tz)}:${String(tx)}`, ty0, ty1)
                mark(`z${String(tz + 1)}:${String(tx)}`, ty0, ty1)
              }
            }
          }
        }
      }
      // 출입구는 비어 있는 것이 맞다 — 막으면 못 나가고 문이 벽으로 덮인다.
      // `roomWalls`가 비우는 것과 **같은 범위**(워프 칸 ±1)를 본다
      const doors = new Set()
      for (const w of worldMod.warpsOf(mapId)) {
        for (let dx = -1; dx <= 1; dx++) doors.add(`${String(w.x + dx)},${String(w.z)}`)
      }
      const SIDES = [[1, 0, '동'], [-1, 0, '서'], [0, 1, '남'], [0, -1, '북']]
      /**
       * 그 모서리에서 **안 덮인 높이**의 합. `roomWalls.gapsOn`과 같은 잣대다.
       *
       * 봐야 할 띠는 바닥에서 `BAND`(= `MIN_HEIGHT`)까지고, **제 벽이 그보다
       * 높으면 그 꼭대기까지**다 — 굽도리와 지붕만 있고 가운데가 빈 모서리를
       * 잡으려면 지붕 높이까지 봐야 한다. 틈이 `SEAM`보다 얇으면 판이 맞닿은
       * 자리의 부동소수 오차다
       */
      const BAND = 3, SEAM = 0.1
      const gapOf = (bands, base) => {
        if (!bands) return BAND
        const merged = []
        for (const b of [...bands].sort((p, q) => p[0] - q[0])) {
          const last = merged[merged.length - 1]
          if (last && b[0] <= last[1] + SEAM) last[1] = Math.max(last[1], b[1])
          else merged.push([b[0], b[1]])
        }
        const hi = Math.max(base + BAND, merged[merged.length - 1][1])
        let at = base, gap = 0
        for (const [b0, b1] of merged) {
          if (b1 <= at) continue
          if (b0 >= hi) break
          if (b0 > at) gap += Math.min(b0, hi) - at
          at = Math.max(at, b1)
          if (at >= hi) break
        }
        return gap + Math.max(0, hi - at)
      }
      /**
       * ⚠️ **맵 밖으로 나가는 모서리는 벽을 붙일 데가 아니다.**
       *
       * 행렬 밖에는 청크가 없어 바닥도 없다 — 거기 벽을 세우면 세계가 상자에
       * 갇힌다(`roomWalls`가 실외에 안 거는 것과 같은 까닭). 광선 검사는 이미
       * 그쪽을 `맵 밖`으로 갈라 세는데 둘레 검사만 안 그랬다: 실측으로
       * 무쇠탄갱 118자리 중 107, 천관산 128 중 125가 **전부 맵 가장자리**였고
       * 같은 자리의 눈높이 광선 5,616발은 하나도 안 샜다
       */
      const offMap = (tx, tz) => grid?.chunkIndexAt
        ? grid.chunkIndexAt(tx, tz) < 0
        : tx < 0 || tz < 0
      /**
       * ⚠️ **위에서 쏜 광선이 맞은 것이 「걷는 바닥」이 아닐 수 있다.**
       *
       * 굴에는 바위가, 방에는 선반이 바닥보다 위에 있다 — 광선은 그 위를 먼저
       * 맞는다. 실측으로 무쇠탄갱 동쪽 (24,z)의 「바닥」이 10.5로 잡혔는데 걷는
       * 격자는 9였다(1.5 차이). 그 칸의 모서리는 **방이 끝난 자리가 아니라
       * 바위 옆구리**라, 거기 벽을 세우면 굴 한가운데를 막는다.
       *
       * ⚠️ **저쪽에 격자가 있다는 것만으로는 못 뺀다.** BDHC는 그려진 데보다
       * 넓어서, 그걸로 빼면 주인공 방 북쪽처럼 **진짜 뚫린 자리까지** 조용해진다
       * (그 자리로 눈높이 광선 아홉 발이 샌다). 그래서 묻는 것은 저쪽이 아니라
       * **이쪽 칸의 「바닥」이 걷는 높이와 맞는가**다
       */
      const trusted = (tx, tz) => {
        const g = grid?.heightAtWorld?.(tx + 0.5, tz + 0.5, p.y)
        if (g == null) return true
        return Math.abs(g - floorY.get(`${String(tx)},${String(tz)}`)) <= 0.6
      }
      /**
       * ⚠️ **단은 벽이 빠진 것이 아니다.** 세로 면이 발치에만 있고 **옆도** 그런
       * 모서리는 바닥이 층으로 끝나는 자리다 — 깨어진 세계의 뜬 발판이 그렇다
       * (274자리 중 229). `roomWalls`가 일부러 안 세우는 자리와 같은 잣대로
       * 갈라서, 구멍이 아니라 **단**으로 따로 센다. 거기가 정말 뚫려 보이는지는
       * 시점 검사가 판정한다
       */
      const kindOf = (bands, base) => {
        if (!bands || bands.length === 0) return 'none'
        return bands.some((b) => b[1] > base + SEAM && b[0] < base + BAND) ? 'crossing' : 'foot'
      }
      const edgeOf = (tx, tz, dx, dz) => dx !== 0
        ? `x${String(tx + (dx > 0 ? 1 : 0))}:${String(tz)}`
        : `z${String(tz + (dz > 0 ? 1 : 0))}:${String(tx)}`
      const besides = (edge) => {
        const at = edge.indexOf(':')
        const head = edge.slice(0, at)
        const n = Number(edge.slice(at + 1))
        return [`${head}:${String(n - 1)}`, `${head}:${String(n + 1)}`]
      }
      const kinds = new Map()
      for (const key of floorY.keys()) {
        const [tx, tz] = key.split(',').map(Number)
        if (doors.has(key)) continue
        for (const [dx, dz] of SIDES) {
          if (floorY.has(`${String(tx + dx)},${String(tz + dz)}`)) continue
          const edge = edgeOf(tx, tz, dx, dz)
          kinds.set(edge, kindOf(walled.get(edge), floorY.get(key)))
        }
      }
      const stands = (e) => kinds.get(e) === 'none' || kinds.get(e) === 'crossing'
      for (const key of floorY.keys()) {
        const [tx, tz] = key.split(',').map(Number)
        for (const [dx, dz, name] of SIDES) {
          const out2 = `${String(tx + dx)},${String(tz + dz)}`
          if (floorY.has(out2)) continue
          if (offMap(tx + dx, tz + dz)) continue
          if (!trusted(tx, tz)) continue
          edges++
          // 그 경계를 세로 면이 **눈높이 띠까지** 덮는가. 벽은 안쪽 칸에
          // 그려질 수도 바깥 칸에 그려질 수도 있으므로 모서리로 본다
          const edge = edgeOf(tx, tz, dx, dz)
          const gap = gapOf(walled.get(edge), floorY.get(key))
          if (gap <= SEAM) continue
          /**
           * ⚠️ **벽이 이 모서리에 서 있어야만 닫히는 것은 아니다.** 계단이
           * 그렇다 — 주인공 방(415)은 `(9,4)·(10,4)`가 계단이라 바닥 삼각형이
           * 없고, 방 벽은 그 **너머** `z=4`에 선다. 여기만 보면 `(9,5)` 북쪽이
           * 뚫린 것으로 찍히는데, 실제 광선은 한 발도 안 샌다(시점 검사 9발은
           * 이 자리와 무관한 북서쪽이다). `roomWalls.closedBeyond`와 같은
           * 잣대로 한 칸 너머까지 본다
           */
          if (gapOf(walled.get(edgeOf(tx + dx, tz + dz, dx, dz)), floorY.get(key)) <= SEAM) continue
          if (doors.has(key)) { doorway++; continue }
          if (kinds.get(edge) === 'foot' && !besides(edge).some(stands)) { ledge++; continue }
          open++
          if (openAt.length < 10) {
            openAt.push(`${String(tx)},${String(tz)} ${name} — 빈 높이 ${gap.toFixed(2)}`)
          }
        }
      }
    }

    out.walls = {
      buildings: buildings.length, shot, pierced, holed, insideShot, insidePierced, holes,
      edges, open, doorway, ledge, openAt,
      // `roomWalls`가 이 맵에서 한 장이라도 세웠는가. 안 세웠으면 베낄 벽이
      // 없었던 것이다 — 그 방의 열린 모서리는 우리가 만든 구멍이 아니다
      built: root.children.length > 0 && (() => {
        let any = false
        root.traverse((o) => { if (o.name === '방 벽') any = true })
        return any
      })(),
    }
  }

  // ── ② 서 있는 것 밑의 바닥 ──────────────────────────────────────────────
  if (doFloors) {
    const floors = []
    root.traverse((o) => {
      if (o.isMesh === true && (o.name === '지형' || o.name === '메운 바닥')) floors.push(o)
    })
    const paints = (hit) => {
      const m = matOf(hit)
      if (!m) return '없음'
      if (m.name === '(못 찾은 그림)') return '못찾음'
      const img = m.map?.image
      if (!img?.data || !hit.uv) return (m.opacity ?? 1) < 0.9 ? '비침' : 'ok'
      const px = Math.min(img.width - 1, Math.max(0,
        Math.round((((hit.uv.x % 1) + 1) % 1) * img.width)))
      const py = Math.min(img.height - 1, Math.max(0,
        Math.round((1 - (((hit.uv.y % 1) + 1) % 1)) * img.height)))
      const a = img.data[(py * img.width + px) * 4 + 3]
      const cut = (m.alphaTest ?? 0) * 255
      if (cut > 0 && a < cut) return '비침'
      if (a < 8) return '비침'
      return 'ok'
    }

    const feet = []
    const m4 = new THREE.Matrix4()
    const v3 = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const s3 = new THREE.Vector3()
    root.traverse((o) => {
      if (o.isInstancedMesh === true && o.name.startsWith('줄기')) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m4)
          m4.decompose(v3, q, s3)
          feet.push({ kind: '나무', x: v3.x, z: v3.z, y: v3.y })
        }
        return
      }
      if (o.isMesh !== true) return
      // ⚠️ **상자 전체가 아니라 「땅에 닿는 자리」를 잰다.** 처마가 넓은 집은
      // 상자 귀퉁이가 건물 밖 허공이라, 그걸로 재면 멀쩡한 집이 다 걸린다
      if (o.name === '소품' || o.name === '판 옆면') {
        o.updateWorldMatrix(true, false)
        const pos = o.geometry.getAttribute('position')
        let low = Infinity
        for (let i = 0; i < pos.count; i++) {
          v3.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
          if (v3.y < low) low = v3.y
        }
        const seen = new Set()
        for (let i = 0; i < pos.count; i++) {
          v3.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
          if (v3.y > low + 0.35) continue
          const key = `${String(Math.floor(v3.x))},${String(Math.floor(v3.z))}`
          if (seen.has(key)) continue
          seen.add(key)
          feet.push({
            kind: o.name === '소품' ? '소품' : '판',
            x: Math.floor(v3.x) + 0.5, z: Math.floor(v3.z) + 0.5, y: v3.y,
          })
        }
      }
    })

    const ray = new THREE.Raycaster()
    ray.far = 80
    const down = new THREE.Vector3(0, -1, 0)
    const tally = {
      나무: { n: 0, 비어: 0, 비침: 0, 못찾음: 0 },
      소품: { n: 0, 비어: 0, 비침: 0, 못찾음: 0 },
      판: { n: 0, 비어: 0, 비침: 0, 못찾음: 0 },
    }
    const spots = []
    for (const f of feet) {
      // 맵 밖은 애초에 바닥이 없다 — 걷는 격자가 모르는 칸은 안 센다
      if (grid?.heightAtWorld?.(f.x, f.z, f.y) == null) continue
      const t = tally[f.kind]
      t.n++
      ray.set(new THREE.Vector3(f.x, f.y + 1.2, f.z), down)
      const hit = ray.intersectObjects(floors, false)[0]
      if (!hit) {
        t.비어++
        if (spots.length < 16) spots.push(`${f.kind} ${f.x.toFixed(1)},${f.z.toFixed(1)} 비어`)
        continue
      }
      const verdict = paints(hit)
      if (verdict === 'ok') continue
      if (verdict === '못찾음') t.못찾음++
      else t.비침++
      if (spots.length < 16) {
        spots.push(`${f.kind} ${f.x.toFixed(1)},${f.z.toFixed(1)} ${verdict}`)
      }
    }
    out.floors = { tally, spots }
  }

  return out
}, want)

// ── ③ 시점 — 실제 카메라에서 새는 데가 있는가 ──────────────────────────────

/**
 * 방의 **바닥 칸·출입구**를 한 번 적어 둔다. 시점마다 다시 재지 않는다.
 *
 * ⚠️ **이것이 없으면 「안 맞았다」를 죄다 구멍으로 센다.** 첫 판이 그랬다:
 * 주인공 방에서 3인칭 광선 351발 중 185발이 「바닥 구멍·눈높이 허공」으로
 * 찍혔는데, 3인칭 카메라는 주인공 남쪽 8m라 **작은 방에서는 방 밖에 선다** —
 * 그 광선들은 애초에 방에 들어오지도 않았다. 1인칭도 마찬가지로 **출입구로
 * 나가는 광선**과 **뚜껑 없는 위로 빠지는 광선**이 섞였다.
 *
 * 그래서 광선이 방을 **어디로 벗어나는지**를 보고 가른다 (`classify`)
 */
const surveyRoom = () => page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.webgpu.js')
  const refs = await import('/src/scene/sceneRefs.ts')
  const ws = await import('/src/state/worldState.ts')
  const worldMod = await import('/src/engine/map/world.ts')
  const zoneMod = await import('/src/engine/map/zone.ts')
  let root = refs.sceneRefs.player
  while (root?.parent) root = root.parent
  if (!root) return { err: '무대가 없다' }
  const mapId = worldMod.world.mapId ?? -1
  const header = worldMod.mapById(mapId)
  const outdoor = header?.mapType === 1 || header?.mapType === 2

  const floors = []
  root.traverse((o) => {
    if (o.isMesh === true && (o.name === '지형' || o.name === '메운 바닥')) floors.push(o)
  })
  const floor = new Map()
  if (!outdoor) {
    const ray = new THREE.Raycaster()
    ray.far = 60
    const down = new THREE.Vector3(0, -1, 0)
    const p = ws.worldState.player.position
    const R = 40
    for (let tz = Math.floor(p.z) - R; tz <= Math.floor(p.z) + R; tz += 1) {
      for (let tx = Math.floor(p.x) - R; tx <= Math.floor(p.x) + R; tx += 1) {
        ray.set(new THREE.Vector3(tx + 0.5, p.y + 14, tz + 0.5), down)
        const hit = ray.intersectObjects(floors, false)[0]
        if (hit) floor.set(`${String(tx)},${String(tz)}`, hit.point.y)
      }
    }
  }
  // 출입구 — 워프 칸 둘레 한 칸까지 봐준다. 문은 두 칸이고 광선은 비스듬히 나간다
  const doors = new Set()
  for (const w of worldMod.warpsOf(mapId)) {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) doors.add(`${String(w.x + dx)},${String(w.z + dz)}`)
    }
  }
  globalThis.__room = { mapId, outdoor, floor, doors, grid: zoneMod.activeZone.grid }
  return { mapId, outdoor, cells: floor.size, doors: doors.size }
})

/**
 * 지금 카메라 그대로 **화면 격자마다** 광선을 쏜다.
 *
 * 카메라는 `EngineDriver`가 프레임마다 만드는 것과 같게 짓는다 —
 * `worldState.camera`의 자리·목표·위쪽에 `cameraSystem.fov`의 화각이다. 그래야 「화면 이 픽셀에
 * 무엇이 있나」를 묻는 것이 된다
 */
const shoot = () => page.evaluate(async ([vw, vh]) => {
  const THREE = await import('/node_modules/three/build/three.webgpu.js')
  const refs = await import('/src/scene/sceneRefs.ts')
  const ws = await import('/src/state/worldState.ts')
  const worldMod = await import('/src/engine/map/world.ts')
  let root = refs.sceneRefs.player
  while (root?.parent) root = root.parent
  if (!root) return { err: '무대가 없다' }
  const header = worldMod.mapById(worldMod.world.mapId ?? -1)
  const outdoor = header?.mapType === 1 || header?.mapType === 2

  const c = ws.worldState.camera
  // 살아 있는 화각. 렌즈가 셋이라(들·실내·깨어진 세계) 여기서 읽어야 맞는다
  const camMod = await import('/src/engine/actor/camera.ts')
  const cam = new THREE.PerspectiveCamera(camMod.cameraSystem.fov, vw / vh, 0.1, 200)
  cam.position.copy(c.position)
  cam.up.copy(c.up)
  cam.lookAt(c.target)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()

  // **보이는 것을 전부 넣는다.** 나무도 풀도 간판도 화면을 메운다 — 벽만
  // 넣으면 나무에 가린 자리가 「허공」으로 세어진다
  const drawn = []
  root.traverse((o) => {
    if (o.isMesh !== true && o.isInstancedMesh !== true) return
    for (let n = o; n; n = n.parent) if (!n.visible) return
    drawn.push(o)
  })

  const matOf = (hit) => {
    const mats = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material]
    return mats[hit.face?.materialIndex ?? 0] ?? null
  }
  /**
   * 이 픽셀에 이 면이 **실제로 칠해지는가.** 셋을 다 본다:
   * 뒷면이라 안 그려지는가 · 재질이 통째로 투명한가 · **그 자리 텍셀이
   * 알파 컷 아래인가**. 셋째를 빼면 풀잎 사이 빈 곳이 「벽이 있다」가 된다
   */
  const painted = (hit, dir) => {
    const m = matOf(hit)
    if (!m || m.visible === false) return false
    if (m.side !== THREE.DoubleSide && hit.face) {
      const n = hit.face.normal.clone()
        .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
      if (m.side === THREE.BackSide ? n.dot(dir) <= 0 : n.dot(dir) >= 0) return false
    }
    if ((m.opacity ?? 1) < 0.05) return false
    const img = m.map?.image
    if (!img?.data || !hit.uv) return true
    const px = Math.min(img.width - 1, Math.max(0,
      Math.round((((hit.uv.x % 1) + 1) % 1) * img.width)))
    const py = Math.min(img.height - 1, Math.max(0,
      Math.round((1 - (((hit.uv.y % 1) + 1) % 1)) * img.height)))
    const a = img.data[(py * img.width + px) * 4 + 3]
    const cut = (m.alphaTest ?? 0) * 255
    return a >= Math.max(8, cut)
  }

  /**
   * 안 칠해진 광선이 **어디로 빠졌는가.**
   *
   *   `벽`   방 안을 지나다 옆으로 샜는데 그 자리가 출입구가 아니다 — **결함**
   *   `바닥` 방 안에서 바닥 아래로 내려갔다 — **결함**
   *   `문`   출입구로 나갔다. 그 너머는 아직 안 실린 맵이라 비는 것이 맞다
   *   `위`   바닥에서 세 타일 위로 빠졌다 — 원작이 뚜껑을 안 만들었다
   *   `밖`   방에 들어온 적이 없다 — 3인칭 카메라가 방 밖에 선 것이다
   */
  const room = globalThis.__room
  const WALL_H = 3
  /** 샌 자리 — 어느 칸 어느 높이로 빠졌는가 */
  const out = []
  const classify = (o, d) => {
    if (room.outdoor) {
      // 실외는 하늘이 보이는 것이 맞다. 걷는 격자가 **아는 자리의 지면 아래로**
      // 빠지는 것만 구멍이다 — 스트리밍 밖은 격자도 모른다
      if (d.y >= -0.25) return '하늘'
      for (let t = 0.5; t <= 60; t += 0.5) {
        const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t
        const g = room.grid?.heightAtWorld?.(x, z, y)
        if (g != null && y < g - 0.05) return '바닥'
      }
      return '하늘'
    }
    let inside = false
    let last = null
    // ⚠️ **맵 밖으로 나간 광선은 벽 구멍이 아니다.** 존 맵의 칸 좌표는 0에서
    // 시작하므로 음수 칸은 맵에 없는 자리다 — 거기는 바닥도 없어서 벽을 붙일
    // 데가 없다. 실측으로 무쇠탄갱·천관산에서 새는 것으로 찍힌 광선이 전부
    // `z-1`·`x-1`이었다. 원작이 뚜껑을 안 만든 것(`위`)과 같은 갈래로 센다
    const offMap = (x, z) => x < 0 || z < 0
    // ⚠️ **성기게 걸으면 모서리를 못 가른다.** 0.2m로 걸었더니 칸이 대각선으로
    // 건너뛰어서, 두 벽이 만나는 귀퉁이를 스치는 광선이 「샜다」로 찍혔다
    for (let t = 0; t <= 60; t += 0.05) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t
      const tx = Math.floor(x), tz = Math.floor(z)
      const key = `${String(tx)},${String(tz)}`
      const fy = room.floor.get(key)
      if (fy === undefined) {
        if (!inside) continue
        if (offMap(tx, tz)) return '맵 밖'
        if (last !== null && room.doors.has(last)) return '문'
        // 어디로 샜는지 적어 둔다 — **나간 칸까지** 적어야 어느 모서리인지 안다
        out.push(`${last ?? '?'}→${key} y${(y).toFixed(1)}`)
        return '벽'
      }
      // ⚠️ **바닥 밑을 지나는 것은 방에 들어온 것이 아니다.** 3인칭 카메라는
      // 방 밖 높은 데 있어서, 비스듬히 내려가는 광선이 방 **아래로** 지나간다.
      // 그것을 「바닥 구멍」으로 세면 실내마다 수십 건이 뜬다
      if (!inside && y < fy - 0.05) continue
      inside = true
      // ⚠️ 세 타일 위는 「뚜껑 없는 쪽」으로 본다 — `roomWalls`가 세우는 높이가
      // 그만큼이다(`MIN_HEIGHT`). 더 높은 벽이 있는 방에서는 이쪽이 덜 잡는데,
      // 둘레가 다 막혔는지는 **방 둘레 검사**가 모서리 단위로 따로 본다
      if (y > fy + WALL_H) return '위'
      if (y < fy - 0.05) return '바닥'
      last = key
    }
    return inside ? '멀리' : '밖'
  }

  // 실내는 촘촘히, 실외는 성기게 — 실외는 삼각형이 열 배라 같은 격자면 분 단위다
  const GX = outdoor ? 9 : 13
  const GY = outdoor ? 7 : 9
  const ray = new THREE.Raycaster()
  ray.far = outdoor ? 90 : 60
  const ndc = new THREE.Vector2()
  const tally = { 벽: 0, 바닥: 0, 문: 0, 위: 0, 밖: 0, 멀리: 0, 하늘: 0, '맵 밖': 0 }
  let rays = 0, hit = 0, pierced = 0
  const at = []
  for (let j = 0; j < GY; j++) {
    for (let i = 0; i < GX; i++) {
      ndc.set(((i + 0.5) / GX) * 2 - 1, 1 - ((j + 0.5) / GY) * 2)
      ray.setFromCamera(ndc, cam)
      rays++
      const dir = ray.ray.direction
      const hits = ray.intersectObjects(drawn, false)
      let ok = false
      for (const h of hits) if (painted(h, dir)) { ok = true; break }
      if (ok) { hit++; continue }
      // 삼각형은 있는데 하나도 안 칠해진 것도 **보이는 것은 같다** — 같은 잣대로 가른다
      if (hits.length > 0) pierced++
      const kind = classify(ray.ray.origin, dir)
      tally[kind]++
      if (at.length < 8 && (kind === '벽' || kind === '바닥')) {
        at.push(`${String(Math.round(((i + 0.5) / GX) * 100))}%,`
          + `${String(Math.round(((j + 0.5) / GY) * 100))}% ${kind}`
          + (hits.length > 0 ? ' (뒤집힌 면)' : ''))
      }
    }
  }
  // 같은 자리로 여러 발이 새므로 칸별로 묶는다
  const spots = {}
  for (const o of out) spots[o] = (spots[o] ?? 0) + 1
  const worst = Object.entries(spots).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, n]) => `${k}×${String(n)}`)
  return { mapId: worldMod.world.mapId ?? -1, outdoor, rays, hit, pierced, ...tally, at, worst }
}, [VIEW.width, VIEW.height])

/**
 * 카메라를 그 시점에 두고 추적이 붙기를 기다린다.
 *
 * ⚠️ **`camera.mode`를 직접 안 쓴다.** 시점은 설정 항목이고 `MapStreamer`가
 * 그 값을 프레임 상태로 옮긴다 — 직접 쓰면 설정이 다시 흐를 때 되돌아간다.
 * V를 누르는 것과 같은 길로 간다. 나무 컬링(`Foliage`)과 소품 흐려짐
 * (`PropFade`)이 시점마다 다르게 도는데, 그것까지 그대로 재려면 이 길이어야 한다
 */
async function pose(mode, yaw, pitch, waitMs) {
  await page.evaluate(async ([m, y, p]) => {
    const o = await import('/src/state/optionsStore.ts')
    o.useOptionsStore.getState().set('view', m === 'first' ? 1 : 0)
    const w = await import('/src/state/worldState.ts')
    w.worldState.camera.yaw = (y * Math.PI) / 180
    w.worldState.camera.pitch = (p * Math.PI) / 180
  }, [mode, yaw, pitch])
  await page.waitForTimeout(waitMs)
}

/**
 * 그 시점에서 **새는** 광선은 몇 발인가.
 *
 * 시점이 달라도 잣대는 하나다 — `classify`가 이미 「방 밖에서 본 것」과
 * 「출입구·뚜껑」을 갈라 놓았으므로, 남은 `벽`과 `바닥`이 곧 결함이다
 */
const leakOf = (r) => (r['벽'] ?? 0) + (r['바닥'] ?? 0)

async function eyeSweep(id) {
  const survey = await surveyRoom()
  if (survey.err) return { err: survey.err }
  const base = await page.evaluate(async () => {
    const w = await import('/src/state/worldState.ts')
    const z = await import('/src/engine/map/zone.ts')
    const worldMod = await import('/src/engine/map/world.ts')
    const p = w.worldState.player.position
    // ⚠️ **워프 칸에는 내려놓지 않는다.** 자리를 옮기는 것은 좌표를 직접 쓰는
    // 것이라, 문 앞에 떨어지면 엔진이 그대로 **건물 안으로 데려간다** — 실측으로
    // 벨스톤에서 다섯 자리 중 셋이 실내였고, 실외 맵을 실내 잣대로 재는 바람에
    // 광선 728발이 「바닥 구멍」으로 찍혔다
    const warps = new Set()
    for (const wp of worldMod.warpsOf(w.worldState.mapId ?? worldMod.world.mapId ?? -1)) {
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dx = -2; dx <= 2; dx += 1) warps.add(`${String(wp.x + dx)},${String(wp.z + dz)}`)
      }
    }
    const free = (x, tz) => !warps.has(`${String(Math.floor(x))},${String(Math.floor(tz))}`)
    const spots = [[p.x, p.z]]
    const g = z.activeZone.grid
    for (const [dx, dz] of [[7, 0], [-7, 0], [0, 7], [0, -7], [5, 5], [-5, -5], [5, -5], [-5, 5]]) {
      const x = Math.floor(p.x) + dx + 0.5, tz = Math.floor(p.z) + dz + 0.5
      const gy = g?.heightAtWorld?.(x, tz, p.y)
      if (gy == null) continue
      // ⚠️ **못 걷는 칸과 딴 층에는 안 선다.** 걷는 격자는 층이 겹친 자리에서
      // 지금 높이와 가까운 층을 주는데, 무쇠시티처럼 마을 밑에 굴이 있으면
      // 아래층 높이가 나온다 — 거기 세우면 카메라가 **세계 밑**에 서서 지형
      // 뒷면 너머로 하늘이 보이고, 광선 32발이 「바닥 구멍」으로 찍힌다
      if (Math.abs(gy - p.y) > 2) continue
      if (g?.isBlockedAtWorld?.(x, tz) === true) continue
      if (!free(x, tz)) continue
      spots.push([x, tz])
      if (spots.length >= 5) break
    }
    return { home: [p.x, p.y, p.z], spots }
  })

  const dir = resolve('.audit/eyes', id)
  if (WANT_SHOTS) mkdirSync(dir, { recursive: true })
  const KEYS = ['rays', 'hit', 'pierced', '벽', '바닥', '문', '위', '밖', '멀리', '하늘', '맵 밖']
  const box = () => {
    const b = { views: 0 }
    for (const k of KEYS) b[k] = 0
    return b
  }
  const sum = {
    third: box(), first: box(), strayed: 0,
    worst: null, atThird: [], atFirst: [], outdoor: survey.outdoor, spots: base.spots.length,
  }
  /**
   * 한 시점을 담는다. **맵이 바뀌었으면 버린다** — 잣대(`__room`)는 처음 잰
   * 맵의 것이라, 다른 맵을 그 잣대로 세면 그냥 거짓말이 된다
   */
  const add = (into, r, label) => {
    if (r.mapId !== survey.mapId) { sum.strayed++; return false }
    into.views++
    for (const k of KEYS) into[k] += r[k] ?? 0
    const leak = leakOf(r)
    if (leak > 0 && (sum.worst === null || leak > sum.worst.leak)) sum.worst = { label, leak }
    // 시점마다 따로 담는다 — 한 통에 담으면 3인칭이 다 채워서 1인칭이 안 보인다
    const bin = into === sum.first ? sum.atFirst : sum.atThird
    // `worst`는 실내에서 나간 칸, `at`은 화면 어디인지다. 실외는 뒤쪽만 남는다
    for (const a of [...(r.worst ?? []), ...(r.at ?? [])]) {
      if (bin.length < 8) bin.push(`${label} ${a}`)
    }
    return true
  }
  /**
   * 맵이 바뀌었으면 확인 지점으로 되돌린다.
   *
   * ⚠️ **되돌린 뒤 방을 다시 재야 한다.** `jump`은 페이지를 새로 여는 것이라
   * `globalThis.__room`(잣대)이 통째로 날아간다 — 안 다시 재면 다음 `shoot`이
   * 잣대 없이 도는다
   */
  const home = async () => {
    const now = await page.evaluate(async () => {
      const w = await import('/src/engine/map/world.ts')
      return w.world.mapId ?? -1
    })
    if (now === survey.mapId) return true
    await jump(id)
    await surveyRoom()
    await pose('third', 0, 0, 600)
    return false
  }

  // 3인칭 — 자리를 옮기며. 카메라는 크리티컬 댐프드라 붙기를 기다린다
  for (const [i, [x, z]] of base.spots.entries()) {
    await page.evaluate(async ([tx, tz]) => {
      const w = await import('/src/state/worldState.ts')
      const z2 = await import('/src/engine/map/zone.ts')
      const p = w.worldState.player.position
      // ⚠️ **땅에 세우고 봐야 한다.** x·z만 옮기면 높이가 옛 자리 그대로라,
      // 단이 진 데로 옮기면 주인공이 지형 **속으로** 들어가고 3인칭 카메라는
      // 그 밑에 선다 — 화면 절반이 하늘이 되고 「바닥 구멍」으로 찍힌다.
      // 무쇠시티에서 그렇게 32발이 잘못 세어졌다
      const y = z2.activeZone.grid?.heightAtWorld?.(tx, tz, p.y)
      p.x = tx
      p.z = tz
      if (y != null) p.y = y
      w.worldState.player.prevPosition.copy(p)
    }, [x, z])
    await pose('third', 0, 0, 900)
    const r = await shoot()
    if (r.err) return { err: r.err }
    const kept = add(sum.third, r, `3인칭 ${x.toFixed(0)},${z.toFixed(0)}`)
    if (!kept) { await home(); continue }
    // 자리마다 찍는다 — 새는 자리는 첫 자리가 아닐 때가 많다
    if (WANT_SHOTS) {
      writeFileSync(
        resolve(dir, `3인칭-${String(i)}-${x.toFixed(0)},${z.toFixed(0)}.png`),
        await page.screenshot())
    }
  }
  // 1인칭 — 처음 자리로 돌려놓고 고개만 돌린다
  await page.evaluate(async ([hx, hy, hz]) => {
    const w = await import('/src/state/worldState.ts')
    const p = w.worldState.player.position
    p.x = hx
    p.y = hy
    p.z = hz
    w.worldState.player.prevPosition.copy(p)
  }, base.home)
  await page.waitForTimeout(600)
  await home()
  for (const pitch of PITCHES) {
    for (const yaw of YAWS) {
      await pose('first', yaw, pitch, 320)
      const r = await shoot()
      if (r.err) return { err: r.err }
      if (!add(sum.first, r, `1인칭 ${String(yaw)}도${pitch === 0 ? '' : ` ${String(pitch)}°`}`)) {
        await home()
        continue
      }
      if (WANT_SHOTS && pitch === 0 && yaw % 90 === 0) {
        writeFileSync(resolve(dir, `1인칭-${String(yaw).padStart(3, '0')}도.png`), await page.screenshot())
      }
    }
  }
  await pose('third', 0, 0, 200)
  return sum
}

const report = []
let bad = 0
for (const id of AT) {
  try {
    await jump(id)
    const r = await inspect([WANT_WALLS, WANT_FLOORS])
    if (r.err) { console.log(`${id}: ${r.err}`); bad++; continue }
    report.push({ id, ...r })
    console.log(`\n${id} (맵 ${String(r.mapId)} · ${r.outdoor ? '실외' : '실내'})`)
    if (r.walls) {
      const w = r.walls
      const ok = w.pierced === 0 && w.insidePierced === 0
      if (!ok) bad++
      console.log(`  벽 — 건물 ${String(w.buildings)} · 바깥 광선 ${String(w.shot)}`
        + ` 뚫림 ${String(w.pierced)} (건물 ${String(w.holed)}곳)`
        + (w.insideShot > 0 ? ` · 안쪽 광선 ${String(w.insideShot)} 뚫림 ${String(w.insidePierced)}` : '')
        + (ok ? '  ✅' : '  ❌'))
      for (const h of w.holes.slice(0, 5)) console.log(`      ${h}`)
      if (w.edges > 0) {
        // ⚠️ **벽 그림이 없는 맵은 못 세우는 것이 맞다.** 이수 숲·호수처럼
        // 「실내」로 분류되지만 원작에 방 벽이 아예 없는 열린 맵이 있다 —
        // `roomWalls`는 베낄 세로 삼각형이 없으면 지어내지 않는다. 그 자리를
        // 구멍으로 세면 못 고칠 것을 고치라는 말이 되므로 갈라서 적는다.
        // 거기서 정말 뚫려 보이는지는 **시점 검사**가 따로 판정한다
        const barren = !w.built
        const clean = w.open === 0
        if (!clean && !barren) bad++
        console.log(`  방 둘레 ${String(w.edges)}자리 — 벽이 없는 쪽 ${String(w.open)}`
          + ` (출입구 ${String(w.doorway ?? 0)}·단 ${String(w.ledge ?? 0)}은 뺀 수다)`
          + (clean ? '  ✅' : barren ? '  ⚠ 원작에 벽 그림이 없는 열린 맵 — 안 지어낸다' : '  ❌'))
        for (const s of (w.openAt ?? []).slice(0, 6)) console.log(`      ${s}`)
      }
    }
    if (r.floors) {
      let wrong = 0
      for (const [kind, t] of Object.entries(r.floors.tally)) {
        if (t.n === 0) continue
        const n = t.비어 + t.비침 + t.못찾음
        wrong += n
        console.log(`  ${kind} 밑 ${String(t.n)}자리 — 비어 ${String(t.비어)}`
          + ` · 비침 ${String(t.비침)} · 못 찾음 ${String(t.못찾음)}${n === 0 ? '  ✅' : '  ❌'}`)
      }
      if (wrong > 0) bad++
      for (const s of r.floors.spots.slice(0, 6)) console.log(`      ${s}`)
    }
    if (WANT_EYES) {
      // ⚠️ **벽·바닥 검사 뒤에 돈다.** 여기서 주인공을 옮기는데, 앞의 두 검사는
      // 서 있는 자리를 기준으로 방을 훑는다 — 먼저 돌리면 딴 데를 재게 된다
      const e = await eyeSweep(id)
      if (e.err) { console.log(`  시점 — ${e.err}  ❌`); bad++ } else {
        report[report.length - 1].eyes = e
        const leak = leakOf(e.third) + leakOf(e.first)
        if (leak > 0) bad++
        const line = (name, b) => `  ${name} ${String(b.views)}시점 · 광선 ${String(b.rays)}`
          + ` — 샌 데 ${String(leakOf(b))} (벽 ${String(b['벽'])} · 바닥 ${String(b['바닥'])})`
          + (e.outdoor
            ? ` · 하늘 ${String(b['하늘'])}`
            : ` · 출입구 ${String(b['문'])} · 뚜껑 없는 위 ${String(b['위'])}`
              + ` · 맵 밖 ${String(b['맵 밖'])} · 방 밖에서 본 것 ${String(b['밖'])}`)
        console.log(line(`3인칭(자리 ${String(e.spots)})`, e.third)
          + (e.strayed > 0 ? ` · 딴 맵으로 새서 버린 시점 ${String(e.strayed)}` : ''))
        console.log(line('1인칭(24방향)', e.first) + (leak === 0 ? '  ✅' : '  ❌'))
        for (const a of [...e.atThird.slice(0, 4), ...e.atFirst.slice(0, 6)]) console.log(`      ${a}`)
      }
    }
  } catch (e) {
    console.log(`${id}: ${String(e).slice(0, 200)}`)
    bad++
  }
}

if (JSON_OUT) {
  mkdirSync(dirname(resolve(JSON_OUT)), { recursive: true })
  writeFileSync(resolve(JSON_OUT), JSON.stringify(report, null, 1))
  console.log(`\n적어 둔 것: ${JSON_OUT}`)
}
console.log(bad === 0 ? '\n빈틈 없음 ✅' : `\n빈틈이 있는 자리 ${String(bad)}건 ❌`)
await browser.close()
vite.child.kill()
process.exit(bad === 0 ? 0 : 1)
