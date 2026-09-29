// 실내를 **BDSP 방**으로 세운다 (docs/orders/VISUAL_20260929.md §5)
//
// 원작 실내는 저폴리 상자에 작은 그림을 입힌 것이라 가까이서 보면 가구가 판때기다. BDSP는 같은 방을 입체로 다시 지었고
// (`Environments/prefab_map` — 225벌이 우리 맵 이름과 짝이 맞는다), 방 이름이 원작 내부 맵 이름과 같다(`C01R0101`).
//
// ⚠️ **좌표를 옮기지 않는다.** BDSP 방은 원작 칸 좌표 그대로 지어져 있다 — 방송국 1층(`c01r0101`)의 사람 셋과 워프 셋이
// 원작과 같은 칸에 서고(`PlaceData_C01R0101` · `MapWarp_C01R0101`), 바닥이 x 1~20 · z 3~13으로 우리 칸 경계와 같다.
// 그래서 행렬 원점에 그대로 놓는다. 충돌 · 높이 · 워프 · 사람은 여전히 원작 자료가 쥔다 — 이 층은 그림만이다.
//
// ⚠️ **천장은 1인칭에서만 보인다.** BDSP는 부감 게임이라 방에 천장이 덮여 있고(`Ceil*`), 3인칭 카메라는 그 위에 있다.
//
// ⚠️ **방이 없는 맵은 원작 그림 그대로다.** 짝은 이름이 먼저고, 없으면 같은 원작 방 모양(행렬)을 쓰는 다른 맵의 방을 빌린다 —
// 포켓몬센터 · 상점은 BDSP에 잔모래마을 것 한 벌씩뿐이고(`t02pc0101` · `t02fs0101`) 원작도 방 모양을 돌려쓴다
import { useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  AdditiveBlending, Box3, BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshStandardMaterial, Vector3,
  type Group, type Material, type Object3D,
} from 'three'
import { assets } from '../data/providers/assetProvider'
import { mapById, warpsOf, world } from '../engine/map/world'
import { DOOR_OPEN } from './roomWalls'
import { worldState } from '../state/worldState'

const loader = new GLTFLoader()

/** 빛 줄기의 세기 — 더해지는 빛이라 1이면 바닥이 하얗게 탄다 */
const LIGHT_SHAFT = 0.35

/** 구워 둔 방 이름들 (`models/room/index.json`). 없는 설치본이면 빈 목록 — 그때는 다들 원작 그림이다 */
let index: Promise<ReadonlySet<string>> | null = null
function roomIndex(): Promise<ReadonlySet<string>> {
  index ??= assets().text('models/room/index.json')
    .then((t) => new Set((JSON.parse(t) as { rooms?: string[] }).rooms ?? []))
    .catch(() => new Set<string>())
  return index
}

/** 이 맵이 쓸 방. 이름이 먼저 · 없으면 같은 행렬의 다른 맵 방 · 둘 다 없으면 `null` */
export function roomFor(mapId: number, rooms: ReadonlySet<string>): string | null {
  const here = mapById(mapId)
  if (!here || here.matrix === 0) return null
  const own = here.name.toLowerCase()
  if (rooms.has(own)) return own
  for (const m of world.maps ?? []) {
    if (m.matrix !== here.matrix) continue
    const name = m.name.toLowerCase()
    if (rooms.has(name)) return name
  }
  return null
}

/** 지금 맵의 방 이름 — 목차가 오기 전과 방이 없는 맵은 `null` */
export function useBdspRoom(mapId: number): string | null {
  const [rooms, setRooms] = useState<ReadonlySet<string> | null>(null)
  useEffect(() => {
    let alive = true
    void roomIndex().then((r) => { if (alive) setRooms(r) })
    return () => { alive = false }
  }, [])
  return rooms ? roomFor(mapId, rooms) : null
}

/** 천장 조각인가 — BDSP 재질 이름이 `…_Ceil_…`이다 */
const isCeiling = (m: Material): boolean => /_Ceil_/.test(m.name)

/**
 * 창으로 드는 빛 · 조명 줄기 — **더해지는 빛**이다(`…_WindowLight_…` · `…_Light_…`). 반투명 판으로 그리면 하얀 널빤지가 화면을
 * 가로지른다(3인칭에서 찍혔다). 빛은 뒤를 가리지 않으므로 깊이도 안 쓴다
 */
const isLightShaft = (m: Material): boolean => /_(Window)?Light_\d/.test(m.name) || /EntranceLight/.test(m.name)

/**
 * **남쪽 벽을 세운다 — 1인칭에서만.** BDSP는 카메라가 남쪽 위에 있어서 그쪽 벽을 무릎 높이 굽도리로만 두고 지붕도 안 덮었다
 * (주인공 방에서 남쪽을 보면 굽도리 위가 새까맣다). 원작 실내의 앞벽과 같은 사정이라 같은 원칙으로 메운다
 * (`roomWalls` 머리말): 바닥 남쪽 끝을 따라 천장 높이까지 세우고, **문간 칸에는 인방만** 남긴다(`DOOR_OPEN`).
 * 그림은 그 방의 벽 재질을 쓴다. 3인칭에서는 카메라와 방 사이에 서므로 안 그린다
 */
/** 남쪽 벽을 쪼개는 칸 (타일) */
const CELL = 0.125
/** 북쪽 벽 가장자리에서 봐주는 틈 (무게중심 좌표) — 삼각형 이음매 위의 점이 밖으로 새지 않게 */
const EDGE = 0.02

function southWall(scene: Object3D, mapId: number): Mesh | null {
  let floor: Box3 | null = null
  const all = new Box3()
  scene.updateMatrixWorld(true)
  const walls: Mesh[] = []
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const box = new Box3().setFromObject(o)
    if (mats.some((m: Material) => /_Floor_/.test(m.name))) floor = floor ? floor.union(box) : box.clone()
    if (!mats.some(isLightShaft) && !/RootShadow/.test(mats[0]?.name ?? '')) all.union(box)
    if (mats.some((m: Material) => /_Wall_/.test(m.name))) walls.push(o)
  })
  const f = floor as Box3 | null
  if (!f || walls.length === 0) return null
  const north = northFace(walls, f.min.z)
  if (!north) return null
  const x0 = Math.round(f.min.x), x1 = Math.round(f.max.x), z = f.max.z
  const top = Math.max(DOOR_OPEN + 0.5, Math.min(all.max.y, north.top))
  const doors = new Set(warpsOf(mapId).filter((w) => w.z + 1 >= Math.round(z) - 1).map((w) => w.x))
  const pos: number[] = [], uv: number[] = []
  const mirrorZ = (zz: number): number => z + (f.min.z - zz)
  // ① **북쪽 벽을 거울로 옮긴다** — 박공 지붕선 · 몰딩 · 굽도리가 그대로 따라온다. 문간 칸은 바닥에서 `DOOR_OPEN`까지 오려 낸다.
  // ⚠️ 북쪽 벽 그림에 구워진 가구 그림자도 같이 온다(주인공 방 TV 자리 둘레의 어두운 얼룩) — 원작에 없는 벽이라 베낄 것이 이것뿐이다
  const holes = [...doors].map((d) => ({ x0: d, x1: d + 1, y1: DOOR_OPEN }))
  for (const t of north.tris) {
    for (const poly of cutDoors([t.a, t.b, t.c], holes)) {
      for (let i = 1; i + 1 < poly.length; i++) {
        for (const q of [poly[0]!, poly[i]!, poly[i + 1]!]) { pos.push(q[0]!, q[1]!, mirrorZ(q[2]!)); uv.push(q[3]!, q[4]!) }
      }
    }
  }
  // ② **북쪽 벽의 구멍(TV · 창 자리)만** 칸으로 메운다 — 그 기둥에서 벽이 닿는 높이 아래인데 삼각형이 없는 칸이다.
  // 그림은 깨끗한 기둥의 무늬를 가로로 이은 것이다 (`north.fillAt`)
  const cols = Math.round(1 / CELL)
  for (let x = x0; x < x1; x++) {
    const ya = doors.has(x) ? DOOR_OPEN : 0
    for (let c = 0; c < cols; c++) {
      const xa = x + c / cols, xb = x + (c + 1) / cols, xm = (xa + xb) / 2
      const reach = north.reach(xm, top)
      for (let y0 = ya; y0 + CELL <= reach; y0 += CELL) {
        if (north.uvAt(xm, y0 + CELL / 2).inside) continue
        const q = [north.fillAt(xa, y0), north.fillAt(xb, y0), north.fillAt(xb, y0 + CELL), north.fillAt(xa, y0 + CELL)]
        const [p0, p1, p2, p3] = q as [number, number][]
        pos.push(xa, y0, z, xb, y0, z, xb, y0 + CELL, z, xa, y0, z, xb, y0 + CELL, z, xa, y0 + CELL, z)
        uv.push(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p0[0], p0[1], p2[0], p2[1], p3[0], p3[1])
      }
    }
  }
  if (pos.length === 0) return null
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  geometry.computeVertexNormals()
  const material = north.material.clone()
  material.side = DoubleSide
  const mesh = new Mesh(geometry, material)
  mesh.name = '방 남쪽 벽 (1인칭)'
  mesh.receiveShadow = true
  return mesh
}

/** 볼록 다각형을 반평면 `sign·(q[axis] − at) ≥ 0`으로 자른다. 꼭짓점의 UV도 같이 잇는다 */
function clipPoly(poly: number[][], axis: 0 | 1, at: number, sign: 1 | -1): number[][] {
  const out: number[][] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!
    const dp = sign * (p[axis]! - at), dq = sign * (q[axis]! - at)
    if (dp >= 0) out.push(p)
    if ((dp >= 0) !== (dq >= 0)) {
      const t = dp / (dp - dq)
      out.push(p.map((v, k) => v + (q[k]! - v) * t))
    }
  }
  return out
}

/**
 * 삼각형에서 문간 구멍(x0 ≤ x ≤ x1 · y ≤ y1)을 오려 낸 조각들. 구멍 밖은 세 조각이다 — 왼쪽 · 오른쪽 · 가운데 위
 */
function cutDoors(tri: number[][], holes: readonly { x0: number, x1: number, y1: number }[]): number[][][] {
  let pieces = [tri]
  for (const h of holes) {
    const next: number[][][] = []
    for (const p of pieces) {
      const left = clipPoly(p, 0, h.x0, -1)
      const right = clipPoly(p, 0, h.x1, 1)
      const mid = clipPoly(clipPoly(clipPoly(p, 0, h.x0, 1), 0, h.x1, -1), 1, h.y1, 1)
      for (const q of [left, right, mid]) if (q.length >= 3) next.push(q)
    }
    pieces = next
  }
  return pieces
}

/**
 * 북쪽 벽(바닥 북쪽 끝에 선 벽 조각의 삼각형들) — 그 (x, 높이)의 UV를 되묻는다. 남쪽 벽은 북쪽 벽과 같은 몰딩 · 굽도리라
 * 같은 자리의 UV를 베끼면 그림이 이어진다. 그 자리에 삼각형이 없으면 가장 가까운 삼각형의 무게중심 UV
 */
function northFace(walls: readonly Mesh[], minZ: number): {
  material: MeshStandardMaterial, top: number
  /** 북쪽 벽 삼각형 — 꼭짓점마다 [x, y, z, u, v] */
  tris: readonly { a: number[], b: number[], c: number[] }[]
  uvAt: (x: number, y: number) => { uv: [number, number], inside: boolean }
  /**
   * 벽 밖(구멍) 자리를 메울 UV — 같은 높이에서 **옆으로 가장 가까운 벽 자리**의 UV를 그 자리의 기울기로 이어 간다. 벽 그림은
   * 가로로 되풀이되므로(반복 감기) 무늬가 끊기지 않는다. 가장 가까운 한 점의 UV를 늘려 쓰면 잿빛으로 번졌다
   */
  fillAt: (x: number, y: number) => [number, number]
  /** 그 x에서 벽이 닿는 가장 높은 자리 (`top` 아래에서 훑는다). 벽이 없으면 0 */
  reach: (x: number, top: number) => number
} | null {
  const tris: { a: number[], b: number[], c: number[] }[] = []
  let material: MeshStandardMaterial | null = null
  let top = 0
  const v = new Vector3()
  for (const mesh of walls) {
    const g = mesh.geometry as BufferGeometry
    const p = g.getAttribute('position'), t = g.getAttribute('uv')
    if (!p || !t) continue
    const idx = g.getIndex()
    const n = idx ? idx.count : p.count
    const vert = (i: number): number[] => {
      const k = idx ? idx.getX(i) : i
      v.fromBufferAttribute(p, k).applyMatrix4(mesh.matrixWorld)
      return [v.x, v.y, v.z, t.getX(k), t.getY(k)]
    }
    for (let i = 0; i + 2 < n; i += 3) {
      const a = vert(i), b = vert(i + 1), c = vert(i + 2)
      // 북쪽 끝에 붙어 선 세로 삼각형만
      if ([a, b, c].some((q) => Math.abs(q[2]! - minZ) > 0.6)) continue
      if (Math.abs(a[1]! - b[1]!) + Math.abs(b[1]! - c[1]!) + Math.abs(a[1]! - c[1]!) < 1e-3) continue
      tris.push({ a, b, c })
      top = Math.max(top, a[1]!, b[1]!, c[1]!)
      const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      if (!material && m instanceof MeshStandardMaterial) material = m
    }
  }
  const paint = material as MeshStandardMaterial | null
  if (!paint || tris.length === 0) return null
  /** 그 자리의 UV와 벽 안인가 — 가장자리 칸이 걸치는 것은 봐준다(`EDGE`). 밖이면 가장 가까운 삼각형의 UV */
  const uvAt = (x: number, y: number): { uv: [number, number], inside: boolean } => {
    let best: [number, number] = [0, 0], far = Infinity
    for (const { a, b, c } of tris) {
      // x · y 평면에서 무게중심 좌표
      const d = (b[1]! - c[1]!) * (a[0]! - c[0]!) + (c[0]! - b[0]!) * (a[1]! - c[1]!)
      if (Math.abs(d) < 1e-9) continue
      const l1 = ((b[1]! - c[1]!) * (x - c[0]!) + (c[0]! - b[0]!) * (y - c[1]!)) / d
      const l2 = ((c[1]! - a[1]!) * (x - c[0]!) + (a[0]! - c[0]!) * (y - c[1]!)) / d
      const l3 = 1 - l1 - l2
      const outside = Math.max(0, -l1) + Math.max(0, -l2) + Math.max(0, -l3)
      if (outside < far) {
        far = outside
        const w = [Math.max(0, l1), Math.max(0, l2), Math.max(0, l3)]
        const sum = w[0]! + w[1]! + w[2]! || 1
        best = [
          (a[3]! * w[0]! + b[3]! * w[1]! + c[3]! * w[2]!) / sum,
          (a[4]! * w[0]! + b[4]! * w[1]! + c[4]! * w[2]!) / sum,
        ]
        if (outside === 0) break
      }
    }
    return { uv: best, inside: far <= EDGE }
  }
  const reach = (x: number, ceiling: number): number => {
    for (let y = ceiling; y > 0; y -= CELL / 2) if (uvAt(x, y).inside) return y
    return 0
  }
  const reachOf = (x: number): number => reach(x, top)
  /**
   * 깨끗한 기둥 — 바닥에서 벽 꼭대기까지 **빈틈없이** 벽인 x들. 구멍 가장자리는 가구 그림자가 그림에 구워져 있어서
   * (주인공 방 TV 자리) 거기서 이어 붙이면 어두운 나비 모양이 찍혔다. 구멍과 **한 칸 넘게** 떨어진 기둥만 기준으로 쓴다
   */
  const clean: number[] = []
  {
    const xs = tris.flatMap((t) => [t.a[0]!, t.b[0]!, t.c[0]!])
    const lo = Math.min(...xs), hi = Math.max(...xs)
    const holeX: number[] = []
    for (let x = lo + CELL / 2; x < hi; x += CELL) {
      const r = reachOf(x)
      let full = r > 0
      for (let y = CELL / 2; y < r && full; y += CELL) if (!uvAt(x, y).inside) full = false
      if (full) clean.push(x); else holeX.push(x)
    }
    for (let i = clean.length - 1; i >= 0; i--) {
      if (holeX.some((h) => Math.abs(h - clean[i]!) < 1)) clean.splice(i, 1)
    }
  }
  const fillAt = (x: number, y: number): [number, number] => {
    const here = uvAt(x, y)
    if (here.inside || clean.length === 0) return here.uv
    const xc = clean.reduce((b, c) => (Math.abs(c - x) < Math.abs(b - x) ? c : b), clean[0]!)
    const at = uvAt(xc, y), step = uvAt(xc + CELL, y)
    if (!at.inside || !step.inside) return here.uv
    // 그 기둥의 가로 기울기로 이어 간다 — 벽 그림은 가로로 되풀이된다(반복 감기)
    const du = (step.uv[0] - at.uv[0]) / CELL, dv = (step.uv[1] - at.uv[1]) / CELL
    return [at.uv[0] + du * (x - xc), at.uv[1] + dv * (x - xc)]
  }
  return { material: paint, top, tris, uvAt, fillAt, reach }
}

export function BdspRoom({ name, mapId }: { name: string, mapId: number }) {
  const [scene, setScene] = useState<Group | null>(null)
  const [ceilings, setCeilings] = useState<readonly Object3D[]>([])

  useEffect(() => {
    let alive = true
    const path = `models/room/${name}.glb`
    const provider = assets()
    provider.objectUrl(path)
      .then((url) => loader.loadAsync(url).finally(() => { provider.releaseObjectUrl(path) }))
      .then((gltf) => {
        if (!alive) return
        const top: Object3D[] = []
        gltf.scene.traverse((o) => {
          if (!(o instanceof Mesh)) return
          o.receiveShadow = true
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          if (mats.some(isCeiling)) top.push(o)
          for (const m of mats) {
            if (!isLightShaft(m)) continue
            m.blending = AdditiveBlending
            m.transparent = true
            m.depthWrite = false
            m.opacity = LIGHT_SHAFT
          }
          if (mats.some(isLightShaft)) { o.castShadow = false; o.receiveShadow = false; o.renderOrder = 10 }
        })
        const south = southWall(gltf.scene, mapId)
        if (south) { gltf.scene.add(south); top.push(south) }
        setCeilings(top)
        setScene(gltf.scene)
      })
      .catch((e: unknown) => { console.error(`방 ${name}을 못 세웠다`, e) })
    return () => { alive = false }
  }, [name, mapId])

  useFrame(() => {
    const first = worldState.camera.mode === 'first'
    for (const c of ceilings) c.visible = first
  })

  return scene ? <primitive object={scene} /> : null
}
