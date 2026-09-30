// 3인칭에서 **카메라와 주인공 사이에 든** BDSP 지역의 나무 · 건물을 비켜 준다 (docs/orders/VISUAL_20260929.md §2)
//
// 원작 그림에서는 나무가 카메라 가까이서 줄어들고(`Foliage`의 `nearScale`) 건물이 흐려진다(`PropFade`). BDSP 지역은 그 둘을 안
// 지나므로 같은 일을 여기서 한다 — 떡잎마을에서 3인칭으로 서면 카메라 앞 소나무 한 그루가 화면 아래 절반을 가렸다.
//
// · **여러 번 서는 것**(나무 · 바위 — `InstancedMesh`)은 원작 나무와 **같은 규칙**으로 줄인다(`Foliage`의 `nearScale` — 카메라에서
//   5.5칸 안이면 0, 그 뒤 2칸에 걸쳐 되살아난다). 밑동을 중심으로 줄어 땅에 붙은 채 작아진다. 카메라→주인공 선분이 그 그루의 구를
//   지나도 지운다. 풀 무더기처럼 낮은 것은 가릴 일이 없어 안 건드린다(`TALL`)
// · **한 번 서는 것**(건물 · 울타리 한 벌)은 흐린다: 상자가 선분에 걸리면 불투명도를 `GHOST`로
//
// ⚠️ **1인칭은 안 건드린다.** 눈이 곧 주인공이라 가릴 사이가 없다 — 코앞의 벽이 사라지면 더 이상하다 (`PropFade`와 같은 규칙)
import {
  Box3, InstancedMesh, Matrix4, Mesh, Vector3, type Material, type Object3D,
} from 'three'
import { nearScale } from './Foliage'

/** 이보다 낮은 인스턴스(풀 · 꽃 · 낮은 돌)는 가릴 일이 없다 (타일) */
const TALL = 1.2
/** 흐린 건물의 불투명도 */
const GHOST = 0.25
/** 선분에서 구까지 봐주는 몫 — 구를 조금 줄여 스치는 것은 그냥 둔다 */
const SHRINK = 0.75
/** 흐릴 수 있는 한 벌짜리의 가로 · 세로 상한 (타일) — 그보다 넓은 것은 땅 · 절벽이다 */
const WIDE = 16

interface Instances {
  mesh: InstancedMesh
  /** 원래 행렬 (16 × n) */
  original: Float32Array
  /** 인스턴스마다 구의 한가운데(월드)와 반지름 */
  centers: Float32Array
  radii: Float32Array
  /** 인스턴스마다 밑동(자리값 · 월드) */
  bases: Float32Array
  /** 지금 건 배율 (1이면 원래대로) — 0.05 단위로 끊어 같은 값이면 안 고쳐 쓴다 */
  scale: Float32Array
}

interface Solid {
  mesh: Mesh
  box: Box3
  materials: Material[]
  faded: boolean
}

export interface FieldFade {
  update(camera: Vector3, target: Vector3, third: boolean): void
}

/** 선분 a→b에서 점 p까지의 거리와 매개변수 */
function segment(a: Vector3, b: Vector3, px: number, py: number, pz: number): { d: number, t: number } {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
  const len2 = dx * dx + dy * dy + dz * dz || 1
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy + (pz - a.z) * dz) / len2))
  const qx = a.x + dx * t - px, qy = a.y + dy * t - py, qz = a.z + dz * t - pz
  return { d: Math.hypot(qx, qy, qz), t }
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
        mesh: o, original: Float32Array.from(o.instanceMatrix.array), centers, radii, bases, scale: new Float32Array(n).fill(1),
      })
      return
    }
    if (o instanceof Mesh) {
      const box = new Box3().setFromObject(o)
      if (box.max.y - box.min.y < TALL) return
      // 땅 · 절벽처럼 넓게 깔린 것은 늘 선분에 걸린다 — 흐리면 발밑이 사라진다. 건물 한 채만 한 것까지만 (`WIDE`)
      if (box.max.x - box.min.x > WIDE || box.max.z - box.min.z > WIDE) return
      const own = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
      // 더해서 그리는 빛(`bdspLights`)은 가리는 것이 아니다 — 입구 빛 웅덩이가 카메라 앞에 와도 흐릴 까닭이 없다
      if (own.every((x) => x.userData.add === true)) return
      const mats = own.map((x: Material) => {
        const c = x.clone()
        // ⚠️ **원래 값으로 되돌린다.** 1 · 켬으로 되돌리면 원래 반투명한 유리가 흐림을 한 번 겪은 뒤 불투명하게 굳는다
        c.userData.rest = { transparent: x.transparent, opacity: x.opacity, depthWrite: x.depthWrite }
        return c
      })
      o.material = Array.isArray(o.material) ? mats : mats[0]!
      solids.push({ mesh: o, box, materials: mats, faded: false })
    }
  })

  const scaled = new Matrix4()
  const shrink = new Matrix4()
  return {
    update(camera, target, third) {
      for (const l of lists) {
        let dirty = false
        for (let i = 0; i < l.radii.length; i++) {
          let k = 1
          if (third) {
            const bx = l.bases[i * 3]!, by = l.bases[i * 3 + 1]!, bz = l.bases[i * 3 + 2]!
            k = nearScale(Math.hypot(camera.x - bx, camera.y - by, camera.z - bz), true)
            const { d, t } = segment(camera, target, l.centers[i * 3]!, l.centers[i * 3 + 1]!, l.centers[i * 3 + 2]!)
            if (t > 0.02 && t < 0.98 && d < l.radii[i]!) k = 0
            k = Math.round(k * 20) / 20
          }
          if (k === l.scale[i]) continue
          l.scale[i] = k
          if (k === 1) l.mesh.instanceMatrix.array.set(l.original.subarray(i * 16, i * 16 + 16), i * 16)
          else {
            // 제 자리값(밑동)을 중심으로 줄인다 — 원래 행렬 뒤에 배율을 곱한다
            scaled.fromArray(l.original, i * 16).multiply(shrink.makeScale(k, k, k))
            l.mesh.setMatrixAt(i, scaled)
          }
          dirty = true
        }
        if (dirty) l.mesh.instanceMatrix.needsUpdate = true
      }
      const ray = new Vector3().subVectors(target, camera)
      const far = ray.length()
      ray.normalize()
      for (const sol of solids) {
        let fade = false
        if (third) {
          const hit = sol.box.containsPoint(camera) ? camera : rayBox(camera, ray, sol.box)
          fade = hit !== null && camera.distanceTo(hit) < far - 0.5
        }
        if (fade === sol.faded) continue
        sol.faded = fade
        for (const mat of sol.materials) {
          const rest = mat.userData.rest as { transparent: boolean, opacity: number, depthWrite: boolean }
          mat.transparent = fade || rest.transparent
          mat.opacity = fade ? Math.min(GHOST, rest.opacity) : rest.opacity
          mat.depthWrite = fade ? false : rest.depthWrite
          mat.needsUpdate = true
        }
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
