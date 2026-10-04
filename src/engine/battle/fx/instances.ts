// 살아 있는 입자를 GPU 인스턴스 값으로 편다 — 렌더러 모드·정렬·피벗·크기 상한.
//
// 인스턴스 하나 = 가운데 + 축 셋(3×3) + 색 + 사용자 자료 둘 + 그림 칸 UV. 셰이더는
// `가운데 + 축X·x + 축Y·y + 축Z·z`만 한다 — 판(사각형)이든 메시든 같은 길이다.
//
// ⚠️ **여기서 유니티 → 우리 좌표로 넘어간다.** 모든 셈은 유니티 좌표(카메라도
// 유니티 쪽으로 옮겨서)에서 하고, 적을 때만 `S = diag(−1, 1, 1)`을 씌운다:
//   가운데 `c' = S·c`, 축 `A' = S·A·S`, 메시·판 꼭짓점 `v' = S·v`(삼각형 차례 뒤집기)
// 그러면 `A'·v' = S·A·v`라 그림 전체가 X로 뒤집힌 유니티 장면이 된다. 카메라를
// 유니티 쪽으로 옮길 때도 같은 S를 쓰므로, 화면에 맺히는 그림은 그 유니티
// 카메라가 본 것과 똑같다 — 판의 글자가 거울상이 되지 않는다.
//
// ⚠️ **판의 2D 회전은 화면에서 시계 방향이다** (유니티 입자의 관례로 기억하는 것 —
// 트랜스폼 Z 회전과 반대다). 3D 회전 판도 Z 성분은 같은 방향으로 맞춘다.
import type { FxSlot } from './effect'
import { eulerM3, m3, rotationOnly } from './xform'
import { sheetRect } from './sheet'

/** 인스턴스 값 배열. 길이는 시스템 위끝(`cap`)에 맞춰 미리 잡는다 */
export interface FxInstances {
  center: Float32Array // ×3
  axisX: Float32Array // ×3
  axisY: Float32Array // ×3
  axisZ: Float32Array // ×3
  color: Float32Array // ×4 (정점색)
  c0: Float32Array // ×4
  c1: Float32Array // ×4
  rect: Float32Array // ×4 그림 칸 [u0, v0, du, dv]
  count: number
}

export function makeInstances(cap: number): FxInstances {
  return {
    center: new Float32Array(cap * 3),
    axisX: new Float32Array(cap * 3),
    axisY: new Float32Array(cap * 3),
    axisZ: new Float32Array(cap * 3),
    color: new Float32Array(cap * 4),
    c0: new Float32Array(cap * 4),
    c1: new Float32Array(cap * 4),
    rect: new Float32Array(cap * 4),
    count: 0,
  }
}

/** 우리 좌표의 카메라 */
export interface FxCamera {
  pos: readonly [number, number, number]
  right: readonly [number, number, number]
  up: readonly [number, number, number]
  /** 보는 쪽 (three 카메라의 −Z) */
  forward: readonly [number, number, number]
  /** 세로 반화각의 tan */
  tanHalfFov: number
}

/** 렌더러 모드 번호 */
export const enum RenderMode { Billboard = 0, Stretch = 1, Horizontal = 2, Vertical = 3, Mesh = 4, None = 5 }

export function renderModeOf(name: string | undefined): RenderMode {
  switch (name) {
    case 'Stretch': return RenderMode.Stretch
    case 'HorizontalBillboard': return RenderMode.Horizontal
    case 'VerticalBillboard': return RenderMode.Vertical
    case 'Mesh': return RenderMode.Mesh
    case 'None': return RenderMode.None
    default: return RenderMode.Billboard
  }
}

// 유니티 쪽 카메라 (걸음마다 채운다)
const camP = new Float64Array(3)
const camR = new Float64Array(3)
const camU = new Float64Array(3)
const camF = new Float64Array(3)

const A = m3()
const B = m3()
const E = m3()
const SYSROT = m3()
const tmpC = new Float64Array(3)
const tmpS = new Float64Array(3)
const col = [1, 1, 1, 1]
const keys: number[] = []

/**
 * 시스템 하나를 인스턴스 배열에 적는다.
 *
 * @param order 정렬에 쓰는 자리 (길이 ≥ cap)
 */
export function writeInstances(slot: FxSlot, cam: FxCamera, out: FxInstances, order: Uint16Array): number {
  const sys = slot.system
  const rend = slot.renderer
  const env = sys.env
  out.count = 0
  if (!rend || !env || sys.count === 0) return 0
  const mode = renderModeOf(rend.renderMode)
  if (mode === RenderMode.None) return 0

  // 카메라를 유니티 쪽으로 (S를 씌운다)
  camP[0] = -cam.pos[0]; camP[1] = cam.pos[1]; camP[2] = cam.pos[2]
  camR[0] = -cam.right[0]; camR[1] = cam.right[1]; camR[2] = cam.right[2]
  camU[0] = -cam.up[0]; camU[1] = cam.up[1]; camU[2] = cam.up[2]
  camF[0] = -cam.forward[0]; camF[1] = cam.forward[1]; camF[2] = cam.forward[2]

  const n = sys.count
  // 정렬: 0 없음 · 1 먼 것부터 · 2 오래된 것부터 · 3 어린 것부터
  for (let i = 0; i < n; i++) order[i] = i
  const sort = rend.sortMode ?? 0
  if (sort !== 0 && n > 1) {
    keys.length = n
    for (let i = 0; i < n; i++) {
      if (sort === 1) {
        sys.worldPos(i, tmpC)
        keys[i] = -((tmpC[0]! - camP[0]!) ** 2 + (tmpC[1]! - camP[1]!) ** 2 + (tmpC[2]! - camP[2]!) ** 2)
      } else keys[i] = sort === 2 ? -sys.age[i]! : sys.age[i]!
    }
    const sub = order.subarray(0, n)
    sub.sort((a, b) => keys[a]! - keys[b]!)
  }

  const align = rend.alignment ?? 0
  const scale = env.scale
  const w = env.world.r
  rotationOnly(w, SYSROT)
  const rot3 = !!sys.data.InitialModule?.rotation3D
  const pivot = rend.pivot
  const flip = rend.flip
  const uv = sys.data.UVModule
  const maxSize = mode === RenderMode.Mesh ? Infinity : rend.maxParticleSize ?? 0.5
  const lengthScale = rend.lengthScale ?? 2
  const velocityScale = rend.velocityScale ?? 0

  for (let k = 0; k < n; k++) {
    const i = order[k]!
    sys.worldPos(i, tmpC)
    let cx = tmpC[0]!, cy = tmpC[1]!, cz = tmpC[2]!
    // 속도 (월드)
    let vx = sys.tvx[i]!, vy = sys.tvy[i]!, vz = sys.tvz[i]!
    if (sys.local) {
      const a = vx, b = vy, c = vz
      vx = w[0]! * a + w[1]! * b + w[2]! * c
      vy = w[3]! * a + w[4]! * b + w[5]! * c
      vz = w[6]! * a + w[7]! * b + w[8]! * c
    }
    const speed = Math.hypot(vx, vy, vz)
    sys.size(i, tmpS)
    let sx = tmpS[0]! * scale, sy = tmpS[1]! * scale
    const sz = tmpS[2]! * scale

    // 크기 상한 — 화면 높이에 대한 비율 (판 종류만)
    if (maxSize < 1e3) {
      const depth = (cx - camP[0]!) * camF[0]! + (cy - camP[1]!) * camF[1]! + (cz - camP[2]!) * camF[2]!
      const lim = maxSize * 2 * Math.max(1e-4, depth) * cam.tanHalfFov
      const big = Math.max(sx, sy)
      if (big > lim && big > 0) { const k2 = lim / big; sx *= k2; sy *= k2 }
    }

    if (mode === RenderMode.Stretch) {
      // 늘인 판: 텍스처 가로(U)가 속도 방향, 길이 = 크기×lengthScale + 속력×velocityScale
      let dx = vx, dy = vy, dz = vz
      if (speed < 1e-6) { dx = camR[0]!; dy = camR[1]!; dz = camR[2]! } else { dx /= speed; dy /= speed; dz /= speed }
      let tx = camP[0]! - cx, ty = camP[1]! - cy, tz = camP[2]! - cz
      const tl = Math.hypot(tx, ty, tz) || 1
      tx /= tl; ty /= tl; tz /= tl
      // 폭 방향 = 속도 × 카메라 쪽 (화면에서 속도에 수직)
      let wx = dy * tz - dz * ty, wy = dz * tx - dx * tz, wz = dx * ty - dy * tx
      const wl = Math.hypot(wx, wy, wz)
      if (wl < 1e-6) { wx = camU[0]!; wy = camU[1]!; wz = camU[2]! } else { wx /= wl; wy /= wl; wz /= wl }
      const len = sy * lengthScale + speed * velocityScale
      A[0] = dx * len; A[3] = dy * len; A[6] = dz * len
      A[1] = wx * sx; A[4] = wy * sx; A[7] = wz * sx
      A[2] = -tx * sz; A[5] = -ty * sz; A[8] = -tz * sz
    } else {
      basis(mode, align, cx, cy, cz, vx, vy, vz, speed)
      if (mode === RenderMode.Mesh) {
        if (rot3) eulerM3(sys.rx[i]!, sys.ry[i]!, sys.rz[i]!, E)
        else eulerM3(0, 0, sys.rz[i]!, E)
      } else if (rot3) {
        eulerM3(sys.rx[i]!, sys.ry[i]!, -sys.rz[i]!, E)
      } else {
        eulerM3(0, 0, -sys.rz[i]!, E)
      }
      mulInto(B, E, A)
      for (let r = 0; r < 3; r++) { A[r * 3]! *= sx; A[r * 3 + 1]! *= sy; A[r * 3 + 2]! *= sz }
    }

    // 뒤집기 — 렌더러 `flip`과 그림 칸 `flipU/V` (메시는 렌더러 flip을 안 받는다)
    const bits = sys.flips(i, mode === RenderMode.Mesh ? 0 : flip?.[0] ?? 0, mode === RenderMode.Mesh ? 0 : flip?.[1] ?? 0)

    // 피벗 — 입자 크기 단위
    if (pivot && (pivot[0] !== 0 || pivot[1] !== 0 || pivot[2] !== 0)) {
      const p0 = pivot[0], p1 = pivot[1], p2 = pivot[2]
      cx += A[0]! * p0 + A[1]! * p1 + A[2]! * p2
      cy += A[3]! * p0 + A[4]! * p1 + A[5]! * p2
      cz += A[6]! * p0 + A[7]! * p1 + A[8]! * p2
    }

    // 적기 — S를 씌운다
    const o3 = k * 3
    out.center[o3] = -cx; out.center[o3 + 1] = cy; out.center[o3 + 2] = cz
    out.axisX[o3] = A[0]!; out.axisX[o3 + 1] = -A[3]!; out.axisX[o3 + 2] = -A[6]!
    out.axisY[o3] = -A[1]!; out.axisY[o3 + 1] = A[4]!; out.axisY[o3 + 2] = A[7]!
    out.axisZ[o3] = -A[2]!; out.axisZ[o3 + 1] = A[5]!; out.axisZ[o3 + 2] = A[8]!
    const o4 = k * 4
    sys.color(i, col)
    out.color.set(col, o4)
    sys.custom(i, 0, col)
    out.c0.set(col, o4)
    sys.custom(i, 1, col)
    out.c1.set(col, o4)
    if (uv) {
      const [frame, row] = sys.frame(i)
      sheetRect(uv, frame, row, out.rect, o4)
    } else {
      out.rect[o4] = 0; out.rect[o4 + 1] = 0; out.rect[o4 + 2] = 1; out.rect[o4 + 3] = 1
    }
    if (bits & 1) { out.rect[o4]! += out.rect[o4 + 2]!; out.rect[o4 + 2] = -out.rect[o4 + 2]! }
    if (bits & 2) { out.rect[o4 + 1]! += out.rect[o4 + 3]!; out.rect[o4 + 3] = -out.rect[o4 + 3]! }
  }
  out.count = n
  return n
}

/** 판·메시의 바탕 축을 `B`에 (열 = 오른쪽 · 위 · 앞) */
function basis(
  mode: RenderMode, align: number, cx: number, cy: number, cz: number,
  vx: number, vy: number, vz: number, speed: number,
): void {
  if (mode === RenderMode.Horizontal) {
    // 바닥에 눕는다 — 판 x → 월드 X, 판 y → 월드 Z, 앞 → 아래
    setCols(1, 0, 0, 0, 0, 1, 0, -1, 0)
    return
  }
  if (mode === RenderMode.Vertical) {
    // 서 있되 카메라 쪽으로 돈다 — 앞을 수평으로 눕힌다
    let fx = camF[0]!, fz = camF[2]!
    const l = Math.hypot(fx, fz) || 1
    fx /= l; fz /= l
    // 오른쪽 = 위 × 앞
    setCols(fz, 0, -fx, 0, 1, 0, fx, 0, fz)
    return
  }
  switch (align) {
    case 1: // 월드
      setCols(1, 0, 0, 0, 1, 0, 0, 0, 1)
      return
    case 2: // 로컬 — 시스템 노드 방향
      B.set(SYSROT)
      return
    case 3: { // 카메라 자리 쪽
      let fx = cx - camP[0]!, fy = cy - camP[1]!, fz = cz - camP[2]!
      const l = Math.hypot(fx, fy, fz)
      if (l < 1e-6) break
      fx /= l; fy /= l; fz /= l
      lookBasis(fx, fy, fz, camU[0]!, camU[1]!, camU[2]!)
      return
    }
    case 4: { // 속도 쪽
      if (speed < 1e-6) break
      lookBasis(vx / speed, vy / speed, vz / speed, 0, 1, 0)
      return
    }
    default:
      break
  }
  // 화면 (0) — 카메라 축 그대로
  setCols(camR[0]!, camR[1]!, camR[2]!, camU[0]!, camU[1]!, camU[2]!, camF[0]!, camF[1]!, camF[2]!)
}

/** 앞(f)과 대략의 위(u)로 축 셋. 유니티 `LookRotation`과 같은 손잡이: 오른쪽 = 위 × 앞 */
function lookBasis(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void {
  let rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx
  let l = Math.hypot(rx, ry, rz)
  if (l < 1e-6) {
    // 위와 앞이 겹친다 — 위 대신 +Z를 쓴다: (0,0,1) × f
    rx = -fy; ry = fx; rz = 0
    l = Math.hypot(rx, ry, rz) || 1
  }
  rx /= l; ry /= l; rz /= l
  const upx = fy * rz - fz * ry, upy = fz * rx - fx * rz, upz = fx * ry - fy * rx
  setCols(rx, ry, rz, upx, upy, upz, fx, fy, fz)
}

function setCols(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): void {
  B[0] = ax; B[3] = ay; B[6] = az
  B[1] = bx; B[4] = by; B[7] = bz
  B[2] = cx; B[5] = cy; B[8] = cz
}

function mulInto(a: Float64Array, b: Float64Array, out: Float64Array): void {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!
    }
  }
}
