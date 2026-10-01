// 3인칭에서 **카메라와 주인공 사이에 든** BDSP 지역의 나무 · 건물을 비켜 준다 (docs/orders/VISUAL_20260929.md §2)
//
// 원작 그림에서는 나무가 카메라 가까이서 줄어들고(`Foliage`의 `nearScale`) 건물이 흐려진다(`PropFade`). BDSP 지역은 그 둘을 안
// 지나므로 같은 일을 여기서 한다 — 떡잎마을에서 3인칭으로 서면 카메라 앞 소나무 한 그루가 화면 아래 절반을 가렸다.
//
// · **여러 번 서는 것**(나무 · 바위 — `InstancedMesh`)은 원작 나무와 **같은 규칙**으로 줄인다(`Foliage`의 `nearScale` — 카메라에서
//   5.5칸 안이면 0, 그 뒤 2칸에 걸쳐 되살아난다). 밑동을 중심으로 줄어 땅에 붙은 채 작아진다. 카메라→주인공 선분이 그 그루의 구를
//   지나도 지운다. 풀 무더기처럼 낮은 것은 가릴 일이 없어 안 건드린다(`TALL`). 문짝은 나무가 아니다 — 안 줄인다(`isDoorLeaf`)
//   ⚠️ **계단은 나무가 아니다** — 던전 계단(`M_C_001_DungeonStair_01` 단 테두리 · `M_D_001_Stair_01` 디딤판 · 1.25칸)은 던전 스물아홉
//   벌에서 인스턴스로 서서 나무 규칙에 걸렸다. 밑동으로 줄면 계단이 파인 자리(밑에 바닥이 없다)가 드러나 무쇠게이트 B1F의 내려가는
//   계단 두 단 사이와 옆이 검게 뚫렸다(I-p04-8). 땅 이름(`isGround`)이면 인스턴스여도 안 줄인다
// · **한 번 서는 것**(건물 · 울타리 한 벌)은 흐린다: 상자가 선분에 걸리면 불투명도를 `GHOST`로
// · **바위 뚜껑**(`userData.cap` — 던전 벽 꼭대기의 평평한 면 · `BdspDungeon`의 `paintFills`가 높이마다 떼어 둔다)은 상자가 아니라 **그 면**으로 잰다:
//   카메라→주인공 선분이 뚜껑 높이를 지나는 자리가 뚜껑 삼각형 위면 흐린다. 뚜껑이 주인공보다 1.5칸 넘게 높을 때만이다(`CAP_CLEAR`)
//
// ⚠️ **땅 · 절벽인지는 재질 이름으로 가른다** (`isGround`). 크기 상한(예전 16칸)만으로 가르면 탄광 B1F의 석탄 더미
// (`d01r0102` 노드 3 · 20.3 × 3.0 × 9.1칸)가 「땅」으로 빠져서 3인칭 카메라가 그 속에 들어가 주인공이 안 보였다. 이름이 땅이 아니면
// 16칸보다 넓어도 흐린다 — 느슨한 상한(`LOOSE`)만 남긴다
//
// ⚠️ **목표와 따라가기를 가른다.** 선분 판정은 인스턴스가 지역 하나에 수천이라 세 프레임에 한 번 목표만 정하고(`aim`), 크기와
// 불투명도는 **매 프레임** 그 목표로 다가간다(`step` — `PropFade`의 `EASE`를 시간으로 늘인 것). 한 번에 바꾸면 집이 툭 반투명이
// 되고, 0.05 단위로 끊어 20Hz로 고치면 뛸 때(8칸/s) 나무가 다섯 번에 걸쳐 덜컥덜컥 작아졌다.
//
// ⚠️ **흐려지기 시작하면 그림자부터 뗀다** — `PropFade`와 같은 규칙이다. 25% 유령 집이 짙은 그림자를 주인공 위에 드리웠다.
// 다 돌아오면 원래 값으로 되돌린다(빛 줄기처럼 처음부터 안 지던 것은 그대로 안 진다).
//
// ⚠️ **1인칭은 안 건드린다.** 눈이 곧 주인공이라 가릴 사이가 없다 — 코앞의 벽이 사라지면 더 이상하다 (`PropFade`와 같은 규칙)
import {
  Box3, InstancedMesh, Matrix4, Mesh, Vector3, type Material, type Object3D,
} from 'three'
import { nearScale } from './Foliage'
import { EASE } from './PropFade'
import { markSeeThrough } from './fx/seeThrough'
import { isDoorLeaf } from './DoorAnimations'

/** 이보다 낮은 인스턴스(풀 · 꽃 · 낮은 돌)는 가릴 일이 없다 (타일) */
const TALL = 1.2
/** 흐린 건물의 불투명도 */
export const GHOST = 0.25
/** 선분에서 구까지 봐주는 몫 — 구를 조금 줄여 스치는 것은 그냥 둔다 */
const SHRINK = 0.75
/**
 * 흐릴 수 있는 한 벌짜리의 가로 · 세로 상한 (타일). 땅이 아닌 것도 이보다 넓으면 상자가 늘 선분에 걸려 내내 유령이 된다.
 *
 * 값의 근거 — 던전 138벌 · 지역 13벌에서 높이 1.2칸 넘고 16칸보다 넓은 한 벌짜리 중 땅 이름이 아닌 것을 쟀다(2026-10-01):
 * 석탄 더미 20.3 · 컨베이어 32.7 · 난간 24.6 · 지붕 31.9칸은 40칸 안이고, 그 밖은 하늘 구 · 구름 · 빛 판처럼 가릴 일이 없는 것이다
 */
const LOOSE = 40
/** 뚜껑이 주인공 겨눔점(발 + `AIM` 1.2)보다 이만큼 넘게 높아야 흐린다 — 발에서 1.5칸 */
const CAP_CLEAR = 0.3
/** 뚜껑 삼각형을 찾는 칸의 너비 (타일) */
const CAP_CELL = 2

/**
 * 땅 · 절벽 · 벽 · 천장인가 — 주인공이 서거나 주인공을 둘러싼 면이라 흐리면 발밑 · 방이 사라진다.
 *
 * 재질 이름의 갈래다(`M_C_001_Ground_05_01` · `M_D_001C_Cliff_01_01N` · `M_D_026_Floor_01` · `M_D_053_Ceil_01_C` · `M_D_028_Wall_01`).
 * 위 다섯에 더해 같은 노릇을 하는 갈래를 실측으로 넣었다 — 16칸 넘는 한 벌짜리를 다 훑어 이름을 보았다(`LOOSE`의 근거와 같은 판):
 * 굽도리 벽 `ComWall` · 바위 윗면 `RockTop` · 못가 흙 `Pond`(`PondSoil` · `PondGrass`) · 계단 `Stair` · `DungeonStair` · 눈 덮개 `SnowCover` ·
 * 길턱 `Curb` · 물 `Water` · `Sea` · 굴 벽화 `Mural`(돌아가는 동굴의 벽 전체가 한 벌이다) · 바닥 그늘 `RootShadow`
 */
export function isGround(materials: readonly Material[]): boolean {
  return materials.length > 0 && materials.every((m) => GROUND.test(m.name))
}
const GROUND = /_(Ground|Cliff|Floor|Ceil|Wall|ComWall|RockTop|Pond|Stair|OutStair|DungeonStair|SnowCover|Curb|Water|Sea|Mural|RootShadow)/
/** 목표에 이만큼 다가가면 붙인다 — 끝없이 반의반으로 다가가며 매 프레임 행렬을 고쳐 쓰지 않게 */
const SNAP = 0.002

/**
 * 한 프레임에 목표로 다가가는 몫. `PropFade`는 60Hz 한 프레임에 `EASE`(0.14)씩 간다 — 그 비율을 시간으로 늘인다.
 * 화면이 30Hz로 떨어져도 같은 시간에 같은 만큼 간다
 */
export function easeStep(dt: number): number {
  return 1 - (1 - EASE) ** Math.max(0, dt * 60)
}

interface Instances {
  mesh: InstancedMesh
  /** 원래 행렬 (16 × n) */
  original: Float32Array
  /** 인스턴스마다 구의 한가운데(월드)와 반지름 */
  centers: Float32Array
  radii: Float32Array
  /** 인스턴스마다 밑동(자리값 · 월드) */
  bases: Float32Array
  /** 지금 건 배율 (1이면 원래대로) */
  scale: Float32Array
  /** 다가갈 배율 */
  goal: Float32Array
  /** 배율이 목표와 다른 인스턴스 — 매 프레임 이것들만 고친다 */
  moving: Set<number>
}

interface Rest { transparent: boolean, opacity: number, depthWrite: boolean }

interface Solid {
  mesh: Mesh
  box: Box3
  materials: Material[]
  /** 지금 불투명도 계수 (1이면 원래대로) */
  cur: number
  /** 다가갈 계수 — 1 또는 `GHOST` */
  goal: number
  /** 원래 그림자를 졌는가 */
  castShadow: boolean
  /** 흐리느라 그림자를 뗐는가 */
  shadowOff: boolean
  /** 바위 뚜껑이면 그 면 — 상자 대신 이것으로 잰다 */
  cap: Cap | null
}

/** 평평한 뚜껑 한 벌 — 높이 하나에 삼각형들(월드 x · z) */
interface Cap {
  y: number
  /** 삼각형마다 x0 z0 x1 z1 x2 z2 */
  tris: Float32Array
  /** `CAP_CELL` 칸 → 그 칸에 걸친 삼각형 번호 */
  cells: Map<number, number[]>
}

const cellKey = (cx: number, cz: number): number => (cx + 4096) * 8192 + (cz + 4096)

/** 뚜껑 메시를 월드 삼각형으로 편다. 높이는 꼭짓점 월드 높이의 평균이다 — 던전을 들어 올린 뒤(`DUNGEON_LIFT`)에 잰다 */
function capOf(mesh: Mesh): Cap {
  const g = mesh.geometry
  const pos = g.getAttribute('position')
  const index = g.getIndex()
  const n = index ? index.count : pos.count
  const tris = new Float32Array((n / 3 | 0) * 6)
  const cells = new Map<number, number[]>()
  const v = new Vector3()
  let sum = 0
  for (let t = 0; t * 3 + 2 < n; t++) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (let k = 0; k < 3; k++) {
      const i = index ? index.getX(t * 3 + k) : t * 3 + k
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
      sum += v.y
      tris[t * 6 + k * 2] = v.x
      tris[t * 6 + k * 2 + 1] = v.z
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z)
    }
    for (let cx = Math.floor(x0 / CAP_CELL); cx <= Math.floor(x1 / CAP_CELL); cx++) {
      for (let cz = Math.floor(z0 / CAP_CELL); cz <= Math.floor(z1 / CAP_CELL); cz++) {
        const key = cellKey(cx, cz)
        const list = cells.get(key)
        if (list) list.push(t)
        else cells.set(key, [t])
      }
    }
  }
  return { y: n > 0 ? sum / n : 0, tris, cells }
}

/** 그 점(월드 x · z)이 뚜껑 삼각형 위인가 */
function onCap(cap: Cap, x: number, z: number): boolean {
  const list = cap.cells.get(cellKey(Math.floor(x / CAP_CELL), Math.floor(z / CAP_CELL)))
  if (!list) return false
  const t = cap.tris
  for (const i of list) {
    const ax = t[i * 6]!, az = t[i * 6 + 1]!, bx = t[i * 6 + 2]!, bz = t[i * 6 + 3]!, cx = t[i * 6 + 4]!, cz = t[i * 6 + 5]!
    const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz)
    const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz)
    const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az)
    const neg = d1 < 0 || d2 < 0 || d3 < 0
    const pos = d1 > 0 || d2 > 0 || d3 > 0
    if (!(neg && pos)) return true
  }
  return false
}

/** 선분 a→b가 뚜껑을 지나는가 — 뚜껑이 b(겨눔점)보다 `CAP_CLEAR` 넘게 높고, 선분이 그 높이를 넘는 자리가 뚜껑 위다 */
function crossesCap(cap: Cap, a: Vector3, b: Vector3): boolean {
  if (cap.y <= b.y + CAP_CLEAR) return false
  if ((a.y - cap.y) * (b.y - cap.y) >= 0) return false
  const t = (cap.y - a.y) / (b.y - a.y)
  return onCap(cap, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)
}

export interface FieldFade {
  /** 목표를 정한다 — 선분 판정. 무거워서 몇 프레임에 한 번 부른다 */
  aim(camera: Vector3, target: Vector3, third: boolean): void
  /** 목표로 `dt`초만큼 다가간다. 매 프레임 부른다 */
  step(dt: number): void
}

/** 선분 a→b에서 점 p까지의 거리와 매개변수 */
function segment(a: Vector3, b: Vector3, px: number, py: number, pz: number): { d: number, t: number } {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
  const len2 = dx * dx + dy * dy + dz * dz || 1
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy + (pz - a.z) * dz) / len2))
  const qx = a.x + dx * t - px, qy = a.y + dy * t - py, qz = a.z + dz * t - pz
  return { d: Math.hypot(qx, qy, qz), t }
}

/** 흐린 정도 `cur`를 재질 하나에 건다. 깃발(`transparent` · `depthWrite`)이 실제로 뒤집힐 때만 파이프라인을 다시 세운다 */
function applyFade(mat: Material, cur: number): void {
  const rest = mat.userData.rest as Rest
  const solid = cur >= 1
  mat.opacity = Math.min(rest.opacity, cur)
  const transparent = !solid || rest.transparent
  const depthWrite = solid ? rest.depthWrite : false
  if (mat.transparent !== transparent || mat.depthWrite !== depthWrite) {
    mat.transparent = transparent
    mat.depthWrite = depthWrite
    mat.needsUpdate = true
  }
  // 깊이를 안 쓰는 동안 윤곽이 집을 투과하지 않게 후처리에 알린다 (`PropFade`와 같은 사정)
  markSeeThrough(mat, !depthWrite)
}

export function fieldFade(root: Object3D): FieldFade {
  root.updateMatrixWorld(true)
  const lists: Instances[] = []
  const solids: Solid[] = []
  const m = new Matrix4()
  const v = new Vector3()
  const s = new Vector3()
  root.traverse((o) => {
    if (o instanceof InstancedMesh) {
      const own = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
      // 문짝 · 계단처럼 밟는 것은 나무가 아니다 — 줄면 그 자리가 뚫린다
      if (own.some(isDoorLeaf) || isGround(own)) return
      const g = o.geometry
      g.computeBoundingSphere()
      g.computeBoundingBox()
      const sphere = g.boundingSphere
      const height = g.boundingBox ? g.boundingBox.max.y - g.boundingBox.min.y : 0
      if (!sphere) return
      const n = o.count
      const centers = new Float32Array(n * 3)
      const radii = new Float32Array(n)
      const bases = new Float32Array(n * 3)
      let tall = false
      for (let i = 0; i < n; i++) {
        o.getMatrixAt(i, m)
        m.premultiply(o.matrixWorld)
        s.setFromMatrixScale(m)
        if (height * s.y >= TALL) tall = true
        v.copy(sphere.center).applyMatrix4(m)
        centers.set([v.x, v.y, v.z], i * 3)
        v.setFromMatrixPosition(m)
        bases.set([v.x, v.y, v.z], i * 3)
        radii[i] = sphere.radius * Math.max(s.x, s.y, s.z) * SHRINK
      }
      if (!tall) return
      lists.push({
        mesh: o, original: Float32Array.from(o.instanceMatrix.array), centers, radii, bases,
        scale: new Float32Array(n).fill(1), goal: new Float32Array(n).fill(1), moving: new Set(),
      })
      return
    }
    if (o instanceof Mesh) {
      const box = new Box3().setFromObject(o)
      const own = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
      const cap = o.userData.cap === true ? capOf(o) : null
      if (!cap) {
        if (box.max.y - box.min.y < TALL) return
        // 땅 · 절벽처럼 깔린 것은 늘 선분에 걸린다 — 흐리면 발밑이 사라진다. 이름으로 가른다 (`isGround`)
        if (isGround(own)) return
        if (box.max.x - box.min.x > LOOSE || box.max.z - box.min.z > LOOSE) return
      }
      // 더해서 그리는 빛(`bdspLights`)은 가리는 것이 아니다 — 입구 빛 웅덩이가 카메라 앞에 와도 흐릴 까닭이 없다
      if (own.every((x) => x.userData.add === true)) return
      const mats = own.map((x: Material) => {
        const c = x.clone()
        // ⚠️ **원래 값으로 되돌린다.** 1 · 켬으로 되돌리면 원래 반투명한 유리가 흐림을 한 번 겪은 뒤 불투명하게 굳는다
        c.userData.rest = { transparent: x.transparent, opacity: x.opacity, depthWrite: x.depthWrite } satisfies Rest
        return c
      })
      o.material = Array.isArray(o.material) ? mats : mats[0]!
      solids.push({ mesh: o, box, materials: mats, cur: 1, goal: 1, castShadow: o.castShadow, shadowOff: false, cap })
    }
  })

  const scaled = new Matrix4()
  const shrink = new Matrix4()
  const ray = new Vector3()
  return {
    aim(camera, target, third) {
      for (const l of lists) {
        for (let i = 0; i < l.radii.length; i++) {
          let k = 1
          if (third) {
            const bx = l.bases[i * 3]!, by = l.bases[i * 3 + 1]!, bz = l.bases[i * 3 + 2]!
            k = nearScale(Math.hypot(camera.x - bx, camera.y - by, camera.z - bz), true)
            const { d, t } = segment(camera, target, l.centers[i * 3]!, l.centers[i * 3 + 1]!, l.centers[i * 3 + 2]!)
            if (t > 0.02 && t < 0.98 && d < l.radii[i]!) k = 0
          }
          if (k === l.goal[i]) continue
          l.goal[i] = k
          if (k !== l.scale[i]) l.moving.add(i)
        }
      }
      ray.subVectors(target, camera)
      const far = ray.length()
      ray.normalize()
      for (const sol of solids) {
        let fade = false
        if (third && sol.cap) fade = crossesCap(sol.cap, camera, target)
        else if (third) {
          const hit = sol.box.containsPoint(camera) ? camera : rayBox(camera, ray, sol.box)
          fade = hit !== null && camera.distanceTo(hit) < far - 0.5
        }
        sol.goal = fade ? GHOST : 1
      }
    },
    step(dt) {
      const f = easeStep(dt)
      for (const l of lists) {
        if (l.moving.size === 0) continue
        for (const i of l.moving) {
          const goal = l.goal[i]!
          let k = l.scale[i]! + (goal - l.scale[i]!) * f
          if (Math.abs(goal - k) < SNAP) { k = goal; l.moving.delete(i) }
          l.scale[i] = k
          if (k === 1) l.mesh.instanceMatrix.array.set(l.original.subarray(i * 16, i * 16 + 16), i * 16)
          else {
            // 제 자리값(밑동)을 중심으로 줄인다 — 원래 행렬 뒤에 배율을 곱한다
            scaled.fromArray(l.original, i * 16).multiply(shrink.makeScale(k, k, k))
            l.mesh.setMatrixAt(i, scaled)
          }
        }
        l.mesh.instanceMatrix.needsUpdate = true
      }
      for (const sol of solids) {
        if (sol.cur === sol.goal) continue
        // 흐려지기 시작하면 그림자부터 뗀다 — 없는 집의 그림자가 땅에 남는다
        if (sol.goal < 1 && !sol.shadowOff) { sol.mesh.castShadow = false; sol.shadowOff = true }
        let cur = sol.cur + (sol.goal - sol.cur) * f
        if (Math.abs(sol.goal - cur) < SNAP) cur = sol.goal
        sol.cur = cur
        for (const mat of sol.materials) applyFade(mat, cur)
        // 다 돌아와야 그림자를 되돌린다 — 원래 안 지던 것은 그대로 안 진다
        if (cur >= 1 && sol.shadowOff) { sol.mesh.castShadow = sol.castShadow; sol.shadowOff = false }
      }
    },
  }
}

/** 반직선이 상자에 처음 닿는 점 — 안 닿으면 `null` */
function rayBox(origin: Vector3, dir: Vector3, box: Box3): Vector3 | null {
  let t0 = 0, t1 = Infinity
  for (const k of ['x', 'y', 'z'] as const) {
    const o = origin[k], d = dir[k], lo = box.min[k], hi = box.max[k]
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue }
    let a = (lo - o) / d, b = (hi - o) / d
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a); t1 = Math.min(t1, b)
    if (t0 > t1) return null
  }
  return origin.clone().addScaledVector(dir, t0)
}
