// BDSP 방의 **껍데기** — 부감 게임이 안 지은 자리를 메우고, 재질을 우리 두 렌즈에 맞춘다 (`BdspRoom`)
//
// BDSP는 카메라가 늘 남쪽 위에 있다. 그래서 남쪽 벽은 굽도리뿐이고, 문간 너머 · 천장이 안 덮는 칸 · 에스컬레이터 구덩이처럼
// 카메라가 못 보는 자리는 비어 있다. 우리는 1인칭으로 돌아보고(남쪽 · 문간 · 천장) 3인칭에서는 천장을 걷어 낸다(기둥 뚜껑).
// 둘 다 BDSP가 한 번도 안 보여 준 자리다 — 여기서 **그 방의 재질로** 메운다.
//
// ⚠️ **이 층은 그림만이다.** 충돌 · 높이 · 워프 · 사람은 원작 자료가 쥔다(`BdspRoom` 머리말). 메움 판은 걸을 자리를 안 바꾼다.
//
// ⚠️ **씬이 제자리(원점)에 놓인 채로 부른다.** 만든 판은 씬의 아이로 붙고 좌표는 씬 안 좌표다 — 방을 옮기는 보정
// (`placementOf`)은 다 지은 뒤에 씬 자리로 건다
import {
  AdditiveBlending, Box3, BufferAttribute, BufferGeometry, DoubleSide, Matrix3, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Vector3, type Material, type Object3D,
} from 'three'
import { DOOR_OPEN } from './roomWalls'

/** 빛 줄기의 세기 — 더해지는 빛이라 1이면 바닥이 하얗게 탄다. 0.35에서 낮 실내의 줄기가 사람 모양 흰 덩이로 읽혔다 */
export const LIGHT_SHAFT = 0.2
/**
 * 연기(`FieldSmoke`)의 진하기. 그림은 구름 무늬 회색이고 알파가 전부 255라(`c05gym0102` 실측) 그대로 그리면 회색 덩이가
 * 방 모서리를 막는다 — 그림의 밝기를 농도로 쓰고(`alphaMap`) 전체를 이만큼 옅게 한다
 */
export const SMOKE_OPACITY = 0.3
/**
 * 천장의 제 빛. 천장은 아래를 봐서 위에서 오는 해 · 채움 빛을 12%만 받는다 — 센터 천장(밝은 주황, 평균 RGB 254,190,60)이
 * 흙빛 단색이 됐다. 제 그림을 이만큼 스스로 낸다
 */
export const CEIL_GLOW = 0.6

/** 남쪽 벽 · 메움 판을 쪼개는 칸 (타일) */
const CELL = 0.125
/** 덮임 판정에서 봐주는 틈 (무게중심 좌표) — 삼각형 이음매 위의 점이 밖으로 새지 않게 */
const EDGE = 0.02
/** 북쪽 벽 평면 앞으로 이만큼까지가 그 벽의 몰딩 · 굽도리다 — 벽 두께(0.6)보다 조금 넓게 */
const BAND = 0.75
/** 북쪽 벽으로 치는 높이 — 이보다 낮은 세로 면은 굽도리 · 가구 판이다 */
const TALL = 2.4
/**
 * 북쪽 벽 구멍(TV · 창 · 통로) 둘레에서 **안 베끼는** 칸 수. 구멍 가장자리 삼각형에는 가구 그림자 · 창틀 그림자가 구워져
 * 있어서(주인공 방 TV 자리의 나비 무늬 · 시원의 방 ㄩ자 틀) 그대로 거울에 비추면 정체 모를 무늬가 남쪽 벽 한가운데 박혔다
 */
const HOLE_MARGIN = 2
/** 이보다 넓은(짧은 변이 이만큼 넘는) 검은 덮개만 뚜껑으로 친다 — 벽 꼭대기 띠는 0.5칸이다 */
const BIG_COVER = 0.9
/** 남쪽 문간 끝을 닫는 판의 색 — 바깥이 안 보이는 어두운 문간 */
const DOORWAY_DARK = 0x080808

// ── 재질 가르기 ───────────────────────────────────────────────────────────────

/** 천장 조각 — BDSP 재질 이름이 `…_Ceil_…`이다 */
export const isCeiling = (m: Material): boolean => /_Ceil_/.test(m.name)

/**
 * 창으로 드는 빛 · 조명 줄기 — **더해지는 빛**이다(`…_WindowLight_…` · `…_SpotLight_…` · `…_Light_…` · `EntranceLight`).
 * 반투명 판으로 그리면 하얀 널빤지가 화면을 가로지른다. 체육관 조명(`M_RO_045_SpotLight_01` — 영원 · `c03gym0101`)이 옛 정규식에
 * 안 걸려 흰 기둥으로 섰다. `HangingLight` · `GateLight` 같은 등 · 문틀은 줄기가 아니다(앞이 `_`가 아니다)
 */
export const isLightShaft = (m: Material): boolean =>
  /_(Window|Spot)?Light_\d/.test(m.name) || /EntranceLight/.test(m.name)

/** 바닥에 붙은 깔개 · 문 매트 · 마크(`…_Mat_01` · `…_Mark_01_B1F_01`). `TableMat`은 탁자보라 아니다 */
export const isFloorDecal = (m: Material): boolean => /_(Mat|Mark)_\d/.test(m.name)

/** 연고 체육관 안개 방의 연기 판 */
export const isSmoke = (m: Material): boolean => /FieldSmoke/.test(m.name)

/**
 * **그림 없는 새까만 덮개.** BDSP는 벽 꼭대기 · 기둥 머리 · 승강기 지붕을 그림 없는 검정(`baseColorFactor` 0,0,0)으로 덮었다
 * — 부감 카메라에는 천장 뒤라 안 보인다. 거의 모든 방에 `…_ComWall_0x`로 있다(실측 70여 방)
 */
export function isBlackCover(m: Material): boolean {
  if (!(m instanceof MeshStandardMaterial) || m.map) return false
  return m.color.r + m.color.g + m.color.b === 0
}

/**
 * 덮개로 보는 재질 — 그림 없는 검정, 또는 `…_ComWall_##`. 굽기가 층 그림(`_LayerTex`)을 입히기 시작한 뒤로 `ComWall_09 · 13`은
 * 검정이 아니라 회색 · 갈색 그림이다. 위를 보는 넓은 면은 둘 다 같은 덮개다
 */
const isCoverMat = (m: Material): boolean => isBlackCover(m) || /_ComWall_\d/.test(m.name)

const isWall = (m: Material): boolean => /_Wall_/.test(m.name) && !isBlackCover(m)
const isFloor = (m: Material): boolean => /_Floor_/.test(m.name)
const matsOf = (o: Mesh): Material[] => (Array.isArray(o.material) ? o.material : [o.material]) as Material[]

// ── 삼각형 ────────────────────────────────────────────────────────────────────

/** 꼭짓점 하나 — [x, y, z, u, v, nx, ny, nz] (씬 안 좌표) */
type Vert = number[]
interface Tri {
  v: [Vert, Vert, Vert]
  mat: Material
  /** 면 법선 (단위) — 정점 법선이 있으면 그 평균, 없으면 감김 */
  n: Vector3
}

/** 그 재질을 쓰는 보이는 메시들의 삼각형 (씬 안 좌표) */
function trisOf(root: Object3D, pick: (m: Material) => boolean): Tri[] {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const rel = new Matrix4(), nm = new Matrix3()
  const p = new Vector3(), n = new Vector3()
  const out: Tri[] = []
  root.traverse((o) => {
    if (!(o instanceof Mesh) || !o.visible) return
    const mats = matsOf(o)
    if (!mats.some(pick)) return
    const g = o.geometry as BufferGeometry
    const pos = g.getAttribute('position')
    if (!pos) return
    const uv = g.getAttribute('uv'), nrm = g.getAttribute('normal'), idx = g.getIndex()
    const count = idx ? idx.count : pos.count
    const groups = Array.isArray(o.material) && g.groups.length > 0
      ? g.groups : [{ start: 0, count, materialIndex: 0 }]
    rel.multiplyMatrices(inv, o.matrixWorld)
    nm.getNormalMatrix(rel)
    const vert = (i: number): Vert => {
      const k = idx ? idx.getX(i) : i
      p.fromBufferAttribute(pos, k).applyMatrix4(rel)
      if (nrm) n.fromBufferAttribute(nrm, k).applyMatrix3(nm).normalize()
      else n.set(0, 0, 0)
      return [p.x, p.y, p.z, uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0, n.x, n.y, n.z]
    }
    for (const gr of groups) {
      const mat = mats[gr.materialIndex ?? 0] ?? mats[0]!
      if (!pick(mat)) continue
      const end = Math.min(count, gr.start + gr.count)
      for (let i = gr.start; i + 2 < end; i += 3) {
        const a = vert(i), b = vert(i + 1), c = vert(i + 2)
        const face = new Vector3(a[5]! + b[5]! + c[5]!, a[6]! + b[6]! + c[6]!, a[7]! + b[7]! + c[7]!)
        if (face.lengthSq() < 1e-6) {
          face.set(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!)
            .cross(new Vector3(c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!))
        }
        out.push({ v: [a, b, c], mat, n: face.normalize() })
      }
    }
  })
  return out
}

/** 2D 무게중심 좌표 (축 `i` · `j`) — 넓이가 없으면 `null` */
function bary(t: Tri, i: number, j: number, x: number, y: number): [number, number, number] | null {
  const [a, b, c] = t.v
  const d = (b[j]! - c[j]!) * (a[i]! - c[i]!) + (c[i]! - b[i]!) * (a[j]! - c[j]!)
  if (Math.abs(d) < 1e-9) return null
  const l1 = ((b[j]! - c[j]!) * (x - c[i]!) + (c[i]! - b[i]!) * (y - c[j]!)) / d
  const l2 = ((c[j]! - a[j]!) * (x - c[i]!) + (a[i]! - c[i]!) * (y - c[j]!)) / d
  return [l1, l2, 1 - l1 - l2]
}

/** 그 점이 삼각형 안인가 (축 `i` · `j` 평면에 비춘 것) */
function covers(t: Tri, i: number, j: number, x: number, y: number, edge = EDGE): boolean {
  const l = bary(t, i, j, x, y)
  return l !== null && l[0] >= -edge && l[1] >= -edge && l[2] >= -edge
}

/** 그 자리의 UV (축 `i` · `j` 평면에서 무게중심으로) */
function uvOn(t: Tri, i: number, j: number, x: number, y: number): [number, number] {
  const l = bary(t, i, j, x, y) ?? [1 / 3, 1 / 3, 1 / 3]
  const [a, b, c] = t.v
  return [a[3]! * l[0] + b[3]! * l[1] + c[3]! * l[2], a[4]! * l[0] + b[4]! * l[1] + c[4]! * l[2]]
}

/**
 * 삼각형 면 위에서 x로 한 칸 갈 때 UV가 얼마나 가는가 — 옆 기둥을 옮겨 붙일 때 무늬를 잇는 기울기다. 벽 그림은 가로로
 * 되풀이되므로(반복 감기) 이 기울기로 이어 가면 무늬가 안 끊긴다. x에 수직인 면(기둥 옆면)은 0이다
 */
function uvPerX(t: Tri): [number, number] {
  const [a, b, c] = t.v
  const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]
  const d11 = e1[0]! ** 2 + e1[1]! ** 2 + e1[2]! ** 2, d22 = e2[0]! ** 2 + e2[1]! ** 2 + e2[2]! ** 2
  const d12 = e1[0]! * e2[0]! + e1[1]! * e2[1]! + e1[2]! * e2[2]!
  const det = d11 * d22 - d12 * d12
  if (Math.abs(det) < 1e-12) return [0, 0]
  const along = (k: 3 | 4): number => {
    const q1 = b[k]! - a[k]!, q2 = c[k]! - a[k]!
    const al = (q1 * d22 - q2 * d12) / det, be = (q2 * d11 - q1 * d12) / det
    return al * e1[0]! + be * e2[0]!
  }
  return [along(3), along(4)]
}

/** 볼록 다각형을 반평면 `sign·(q[axis] − at) ≥ 0`으로 자른다. 꼭짓점의 UV · 법선도 같이 잇는다 */
function clipPoly(poly: Vert[], axis: number, at: number, sign: 1 | -1): Vert[] {
  const out: Vert[] = []
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

/** 삼각형을 x · y 상자로 자른 다각형 (없으면 빈 것) */
function clipBox(t: Tri, x0: number, x1: number, y0: number, y1: number): Vert[] {
  let poly: Vert[] = t.v.map((q) => q.slice())
  poly = clipPoly(poly, 0, x0, 1)
  if (poly.length >= 3) poly = clipPoly(poly, 0, x1, -1)
  if (poly.length >= 3 && y0 > -Infinity) poly = clipPoly(poly, 1, y0, 1)
  if (poly.length >= 3 && y1 < Infinity) poly = clipPoly(poly, 1, y1, -1)
  return poly.length >= 3 ? poly : []
}

// ── 판 모으기 ─────────────────────────────────────────────────────────────────

/** 재질별로 삼각형을 모아 메시 하나로 — 재질마다 그룹이 하나다 */
class Batch {
  private readonly parts = new Map<Material, { pos: number[], uv: number[], nrm: number[] }>()

  private of(mat: Material): { pos: number[], uv: number[], nrm: number[] } {
    let p = this.parts.get(mat)
    if (!p) { p = { pos: [], uv: [], nrm: [] }; this.parts.set(mat, p) }
    return p
  }

  /** 다각형 하나 (부채꼴로 쪼갠다). 꼭짓점은 `Vert` */
  poly(mat: Material, poly: readonly Vert[]): void {
    const p = this.of(mat)
    for (let i = 1; i + 1 < poly.length; i++) {
      for (const q of [poly[0]!, poly[i]!, poly[i + 1]!]) {
        p.pos.push(q[0]!, q[1]!, q[2]!)
        p.uv.push(q[3]!, q[4]!)
        p.nrm.push(q[5]!, q[6]!, q[7]!)
      }
    }
  }

  /** 네모 하나 — 꼭짓점 넷은 앞면에서 볼 때 반시계 */
  quad(mat: Material, q: readonly Vert[]): void {
    this.poly(mat, q)
  }

  get empty(): boolean {
    return [...this.parts.values()].every((p) => p.pos.length === 0)
  }

  mesh(name: string): Mesh | null {
    if (this.empty) return null
    const pos: number[] = [], uv: number[] = [], nrm: number[] = []
    const g = new BufferGeometry()
    const mats: Material[] = []
    for (const [mat, p] of this.parts) {
      if (p.pos.length === 0) continue
      g.addGroup(pos.length / 3, p.pos.length / 3, mats.length)
      mats.push(mat)
      for (const v of p.pos) pos.push(v)
      for (const v of p.uv) uv.push(v)
      for (const v of p.nrm) nrm.push(v)
    }
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
    const mesh = new Mesh(g, mats)
    mesh.name = name
    mesh.receiveShadow = true
    return mesh
  }
}

// ── 재질 손보기 ───────────────────────────────────────────────────────────────

/**
 * 바닥 데칼을 바닥 위로 띄우는 높이(월드 단위 · 5mm).
 *
 * ⚠️ **깊이 밀기만으로는 못 이긴다.** `polygonOffset` −2/−2를 걸어도 센터 마크 · 출구 매트 · 상점 매트가 바닥과 한 줄씩 번갈아
 * 그려졌다(가로 줄무늬 — 포켓몬센터 3인칭 한가운데). 데칼과 바닥은 꼭짓점이 달라 같은 높이여도 깊이 값이 몇 단계씩 갈린다.
 * 그래서 몸을 띄운다 — 3인칭 거리(10칸)에서 깊이 결은 0.06mm, 1인칭 near 0.05에서 발밑까지도 0.1mm 안이라 5mm면 늘 이기고,
 * 눈높이 1.38에서 5mm 틈은 안 보인다. 깊이 밀기는 그대로 둔다(스치는 각의 덤이다)
 */
export const DECAL_LIFT = 0.005

const parentScale = new Vector3()
/** 데칼 메시를 월드 위쪽으로 `DECAL_LIFT`만큼 띄운다 — 부모 배율을 되돌려 월드 높이로 맞춘다 */
export function liftDecal(o: Object3D): void {
  // 한 번만 — 다시 손보는 일이 있어도 쌓이지 않게
  if (o.userData.decalLift === true) return
  o.userData.decalLift = true
  if (o.parent) o.parent.getWorldScale(parentScale)
  else parentScale.set(1, 1, 1)
  o.position.y += DECAL_LIFT / (parentScale.y || 1)
  o.updateMatrix()
}

/** 메시가 납작한가 (바닥에 붙은 데칼) — `RO_080_Mat_01`처럼 이름만 `Mat`인 세운 판은 거른다 */
function flat(o: Mesh): boolean {
  const box = new Box3().setFromObject(o)
  return box.max.y - box.min.y < 0.05
}

/**
 * 재질을 우리 렌즈에 맞춘다. 줄기 · 천장 메시를 돌려준다 — 렌즈마다 켜고 끌 몫이다.
 *
 * · 빛 줄기 — 더하는 빛 · 깊이 안 씀 · `LIGHT_SHAFT`
 * · 바닥 데칼 — 바닥과 높이가 같아 깊이를 다툰다(센터 마크 · 깔개, 상점 출구 매트, GTS 워프 판 — `t02pc0101` · `t02fs0101`
 *   실측 y 0.000). 몸을 5mm 띄운다(`DECAL_LIFT`) — `polygonOffset`만으로는 줄무늬가 남았다
 * · 연기 — 그림 밝기를 농도로 쓰는 옅은 안개
 * · 천장 — 제 그림을 스스로 낸다(`CEIL_GLOW`). 천장 재질은 이름이 `_Ceil_`이라 바닥 · 벽과 나눠 쓰지 않는다
 */
function dressMaterials(root: Object3D): { shafts: Mesh[], ceilings: Mesh[] } {
  const shafts: Mesh[] = [], ceilings: Mesh[] = []
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    o.receiveShadow = true
    const mats = matsOf(o)
    if (mats.some(isLightShaft)) {
      for (const m of mats) {
        m.blending = AdditiveBlending
        m.transparent = true
        m.depthWrite = false
        m.opacity = LIGHT_SHAFT
      }
      o.castShadow = false; o.receiveShadow = false; o.renderOrder = 10
      shafts.push(o)
      return
    }
    if (mats.some(isSmoke)) {
      for (const m of mats) {
        if (!(m instanceof MeshStandardMaterial)) continue
        m.transparent = true
        m.depthWrite = false
        m.alphaMap = m.map
        m.alphaTest = 0
        m.opacity = SMOKE_OPACITY
        m.side = DoubleSide
        m.needsUpdate = true
      }
      o.castShadow = false; o.receiveShadow = false; o.renderOrder = 9
      return
    }
    if (mats.some(isFloorDecal) && flat(o)) {
      for (const m of mats) {
        m.polygonOffset = true
        m.polygonOffsetFactor = -2
        m.polygonOffsetUnits = -2
        m.needsUpdate = true
      }
      liftDecal(o)
      o.castShadow = false; o.renderOrder = 1
    }
    if (mats.some(isCeiling)) {
      ceilings.push(o)
      for (const m of mats) {
        if (!(m instanceof MeshStandardMaterial)) continue
        if (m.map) { m.emissive.set(0xffffff); m.emissiveMap = m.map } else m.emissive.copy(m.color)
        m.emissiveIntensity = CEIL_GLOW
        m.needsUpdate = true
      }
    }
  })
  return { shafts, ceilings }
}

// ── 북쪽 벽 ───────────────────────────────────────────────────────────────────

/** 북쪽 벽 평면 하나 — 그 평면 앞 띠(`BAND`) 안의 벽 삼각형들 */
interface WallPlane {
  /** 평면 z (가장 깊은 면) — 거울축이다 */
  z: number
  top: number
  /** 띠 안 벽 삼각형 — 옮겨 세울 것 */
  band: Tri[]
  /** 그중 남쪽(방 안)을 보는 세로 면 — 덮임 판정 */
  face: Tri[]
}

/**
 * 북쪽 벽 평면들. **바닥 상자 북쪽 끝이 아니라 벽에서 찾는다** — 바닥은 벽 너머까지 깔린 방이 많다(백화점 바닥 z −0.5 ↔ 벽 3 ·
 * 물가 체육관 톱니 구덩이 바닥 −1 ↔ 벽 3 · 리그 로비 −1 ↔ 2.5). 방 안(+z)을 보는 세로 면을 z별로 모아 `TALL` 넘게 올라가는
 * 것만 벽으로 친다. 벽이 계단식이면(GTS `c01r0601`: x 5~16은 z 1, 나머지는 z 6) 평면이 여럿이다 — 기둥마다 가장 북쪽 것을 쓴다
 */
function northPlanes(walls: readonly Tri[], floor: Box3): WallPlane[] {
  const byZ = new Map<number, Tri[]>()
  for (const t of walls) {
    if (Math.abs(t.n.y) > 0.3 || t.n.z < 0.7) continue
    const zs = t.v.map((q) => q[2]!)
    if (Math.max(...zs) - Math.min(...zs) > 0.01) continue
    const k = Math.round(zs[0]! / 0.05)
    const list = byZ.get(k) ?? []
    list.push(t)
    byZ.set(k, list)
  }
  const mid = (floor.min.z + floor.max.z) / 2
  const out: WallPlane[] = []
  for (const list of byZ.values()) {
    const z = Math.min(...list.map((t) => t.v[0][2]!))
    const top = Math.max(...list.flatMap((t) => t.v.map((q) => q[1]!)))
    if (top < TALL || z > mid || z < floor.min.z - BAND) continue
    const band = walls.filter((t) => t.v.every((q) => q[2]! >= z - 0.05 && q[2]! <= z + BAND)
      && Math.max(...t.v.map((q) => q[1]!)) - Math.min(...t.v.map((q) => q[1]!)) > 1e-3 && t.n.z > -0.7)
    const face = band.filter((t) => Math.abs(t.n.y) <= 0.3 && t.n.z >= 0.7)
    out.push({ z, top: Math.max(...band.flatMap((t) => t.v.map((q) => q[1]!))), band, face })
  }
  return out.sort((a, b) => a.z - b.z)
}

/** 그 평면이 (x, y)를 덮는가 */
const planeCovers = (p: WallPlane, x: number, y: number): boolean => p.face.some((t) => covers(t, 0, 1, x, y))

/** 그 x에서 벽이 닿는 가장 높은 자리 (없으면 0) */
function reachOf(p: WallPlane, x: number): number {
  for (let y = p.top; y > 0; y -= CELL / 2) if (planeCovers(p, x, y)) return y
  return 0
}

/** 그 x를 가진 평면인가 — 남쪽을 보는 세로 면의 가로 폭 안 */
const planeHas = (p: WallPlane, x: number): boolean => p.face.some((t) => {
  const xs = t.v.map((q) => q[0]!)
  return x >= Math.min(...xs) && x <= Math.max(...xs)
})

/** 한 기둥(칸 폭) — 주인 평면 · 벽이 닿는 높이 · 구멍 칸 */
interface Column {
  x: number
  plane: WallPlane | null
  reach: number
  /** 구멍 칸 번호들 (`k` → y `k·CELL` ~ `(k+1)·CELL`) */
  holes: Set<number>
  /** 구멍 둘레까지 넓힌 안 베낄 칸 */
  bad: Set<number>
  clean: boolean
}

function columnsOf(planes: readonly WallPlane[], x0: number, x1: number): Column[] {
  const cols: Column[] = []
  for (let x = x0; x < x1 - 1e-6; x += CELL) {
    const xm = x + CELL / 2
    const plane = planes.find((p) => planeHas(p, xm)) ?? null
    const reach = plane ? reachOf(plane, xm) : 0
    const holes = new Set<number>()
    if (plane) {
      for (let k = 0; (k + 0.5) * CELL < reach; k++) if (!planeCovers(plane, xm, (k + 0.5) * CELL)) holes.add(k)
    }
    cols.push({ x, plane, reach, holes, bad: new Set(), clean: false })
  }
  // 평면이 없는 기둥은 가까운 기둥의 평면을 빌린다 — 벽 끝이 바닥보다 짧은 방
  for (const c of cols) {
    if (c.plane) continue
    let best: Column | null = null
    for (const o of cols) if (o.plane && (!best || Math.abs(o.x - c.x) < Math.abs(best.x - c.x))) best = o
    if (best) { c.plane = best.plane; c.reach = best.reach; for (let k = 0; (k + 0.5) * CELL < c.reach; k++) c.holes.add(k) }
  }
  // 구멍 둘레를 넓힌다
  for (const [i, c] of cols.entries()) {
    for (const k of c.holes) {
      for (let di = -HOLE_MARGIN; di <= HOLE_MARGIN; di++) {
        const o = cols[i + di]
        if (!o || o.plane !== c.plane) continue
        for (let dk = -HOLE_MARGIN; dk <= HOLE_MARGIN; dk++) if (k + dk >= 0) o.bad.add(k + dk)
      }
    }
  }
  for (const c of cols) c.clean = c.plane !== null && c.reach > 0 && c.bad.size === 0
  return cols
}

// ── 남쪽 벽 ───────────────────────────────────────────────────────────────────

/** 바닥 상자 · 방 전체 상자 */
interface Frame { floor: Box3, all: Box3 }

function frameOf(root: Object3D): Frame | null {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  let floor: Box3 | null = null
  const all = new Box3()
  root.traverse((o) => {
    if (!(o instanceof Mesh) || !o.visible) return
    const mats = matsOf(o)
    const box = new Box3().setFromObject(o).applyMatrix4(inv)
    if (mats.some(isFloor)) floor = floor ? floor.union(box) : box.clone()
    if (!mats.some(isLightShaft) && !mats.some(isSmoke) && !/RootShadow/.test(mats[0]?.name ?? '')) all.union(box)
  })
  const f = floor as Box3 | null
  return f ? { floor: f, all } : null
}

/**
 * **남쪽 벽 — 1인칭에서만.** BDSP는 카메라가 남쪽 위에 있어서 그쪽 벽을 무릎 높이 굽도리로만 두었다. 원작 실내의 앞벽과 같은
 * 사정이라 같은 원칙으로 메운다(`roomWalls` 머리말): 바닥 남쪽 끝에 **북쪽 벽을 거울로** 세우고 문간 칸에는 인방만 남긴다.
 *
 * 기둥(`CELL` 폭)마다 그 기둥을 가진 가장 북쪽 평면을 그 평면 축으로 비춘다 — 박공 지붕선 · 몰딩 · 굽도리가 따라오고 재질도
 * 삼각형마다 제 것이다(등대의 창틀 · 난간이 한 재질로 칠해져 지그재그가 됐다). 구멍과 그 둘레(`HOLE_MARGIN`)는 **가장 가까운
 * 깨끗한 기둥**의 삼각형을 옆으로 옮겨 붙이고 UV를 그 면의 기울기로 이어 간다(`uvPerX`).
 *
 * 법선은 원래 면의 것을 비춰(z만 뒤집어) 방 안을 보게 하고 감김도 그에 맞춘다 — 뒷면을 그려 법선이 뒤집히는 데 기대지 않는다
 */
function southWall(root: Object3D, frame: Frame, doors: readonly number[]): Mesh | null {
  const f = frame.floor
  const walls = trisOf(root, isWall)
  const planes = northPlanes(walls, f)
  const x0 = Math.round(f.min.x), x1 = Math.round(f.max.x), zS = f.max.z
  const doorCols = new Set(doors)
  const inDoor = (x: number): boolean => doorCols.has(Math.floor(x + 1e-6))
  const batch = new Batch()
  const put = (mat: Material, poly: Vert[], axis: number): void => {
    // 거울로 비추고 감김을 뒤집는다 — 법선(z 뒤집음)과 감김이 같은 쪽을 보게
    const m = poly.map((q) => [q[0]!, q[1]!, zS + (axis - q[2]!), q[3]!, q[4]!, q[5]!, q[6]!, -q[7]!])
    batch.poly(mat, m.reverse())
  }
  if (planes.length === 0) return fallbackWall(walls, frame, doors)
  const cols = columnsOf(planes, x0, x1)
  const cleanCols = cols.filter((c) => c.clean)
  /** y 구간 목록에서 문간(바닥 ~ `DOOR_OPEN`)을 뺀다 */
  const minusDoor = (x: number, spans: [number, number][]): [number, number][] =>
    inDoor(x) ? spans.flatMap(([a, b]) => (b <= DOOR_OPEN ? [] : [[Math.max(a, DOOR_OPEN), b] as [number, number]])) : spans
  for (const c of cols) {
    const plane = c.plane
    if (!plane) continue
    const xa = c.x, xb = c.x + CELL
    // 안 베낄 칸을 구간으로 — 나머지가 제 삼각형으로 세울 구간이다
    const bad: [number, number][] = []
    for (const k of [...c.bad].sort((a, b) => a - b)) {
      if (k * CELL >= c.reach) continue
      const last = bad[bad.length - 1]
      if (last && Math.abs(last[1] - k * CELL) < 1e-6) last[1] = (k + 1) * CELL
      else bad.push([k * CELL, (k + 1) * CELL])
    }
    const good: [number, number][] = []
    let from = -Infinity
    for (const [a, b] of bad) { good.push([from, a]); from = b }
    good.push([from, Infinity])
    // ① 제 삼각형
    for (const [a, b] of minusDoor(xa, good)) {
      for (const t of plane.band) {
        const poly = clipBox(t, xa, xb, a, b)
        if (poly.length) put(t.mat, poly, plane.z)
      }
    }
    // ② 구멍 둘레 — 가장 가까운 깨끗한 기둥을 옮겨 붙인다
    const src = nearest(cleanCols.filter((o) => o.plane === plane), c.x) ?? nearest(cleanCols, c.x)
    for (const [a, b] of minusDoor(xa, bad)) {
      if (!src?.plane) { fillCells(plane, cols, xa, a, b, put); continue }
      const dx = xa - src.x
      const top = Math.min(b, src.reach)
      for (const t of src.plane.band) {
        const poly = clipBox(t, src.x, src.x + CELL, a, top)
        if (!poly.length) continue
        const [du, dv] = uvPerX(t)
        put(t.mat, poly.map((q) => {
          const r = q.slice()
          r[0] = q[0]! + dx; r[2] = q[2]! - src.plane!.z + plane.z; r[3] = q[3]! + du * dx; r[4] = q[4]! + dv * dx
          return r
        }), plane.z)
      }
      if (top < b - 1e-6) fillCells(plane, cols, xa, top, b, put)
    }
  }
  return batch.mesh('방 남쪽 벽 (1인칭)')
}

/** 가장 가까운 기둥 */
function nearest(cols: readonly Column[], x: number): Column | null {
  let best: Column | null = null
  for (const c of cols) if (!best || Math.abs(c.x - x) < Math.abs(best.x - x)) best = c
  return best
}

/**
 * 마지막 메움 — 옮겨 붙일 깨끗한 기둥이 없거나 모자라면 칸마다 판을 세운다. 그림은 같은 높이에서 옆으로 가장 가까운 벽 자리의
 * UV를 그 면의 기울기로 이어 간다
 */
function fillCells(
  plane: WallPlane, cols: readonly Column[], xa: number, ya: number, yb: number,
  put: (mat: Material, poly: Vert[], axis: number) => void,
): void {
  const xb = xa + CELL
  for (let y0 = ya; y0 < yb - 1e-6; y0 += CELL) {
    const y1 = Math.min(yb, y0 + CELL), ym = (y0 + y1) / 2
    // 같은 높이에서 덮인 가장 가까운 기둥
    let best: { t: Tri, x: number } | null = null
    for (const c of cols) {
      if (c.plane !== plane) continue
      const xm = c.x + CELL / 2
      if (best && Math.abs(xm - xa) >= Math.abs(best.x - xa)) continue
      const t = plane.face.find((q) => covers(q, 0, 1, xm, ym))
      if (t) best = { t, x: xm }
    }
    if (!best) continue
    const [u0, v0] = uvOn(best.t, 0, 1, best.x, ym)
    const [du, dv] = uvPerX(best.t)
    const [, dvdy] = uvPerY(best.t)
    const at = (x: number, y: number): Vert =>
      [x, y, plane.z, u0 + du * (x - best!.x), v0 + dv * (x - best!.x) + dvdy * (y - ym), 0, 0, 1]
    put(best.t.mat, [at(xa, y0), at(xb, y0), at(xb, y1), at(xa, y1)], plane.z)
  }
}

/** 삼각형 면 위에서 y로 한 칸 갈 때의 UV — 세로 면이면 v만 간다 */
function uvPerY(t: Tri): [number, number] {
  const [a, b, c] = t.v
  // x · y 평면에서 푼다 — 북쪽 벽은 그 평면에 서 있다
  const x1 = b[0]! - a[0]!, y1 = b[1]! - a[1]!, x2 = c[0]! - a[0]!, y2 = c[1]! - a[1]!
  const d = x1 * y2 - x2 * y1
  if (Math.abs(d) < 1e-12) return [0, 0]
  const q = (k: 3 | 4): number => (x1 * (c[k]! - a[k]!) - x2 * (b[k]! - a[k]!)) / d
  return [q(3), q(4)]
}

/**
 * 북쪽 벽을 못 찾은 방 — 바닥 남쪽 끝에 그 방 벽 재질로 판 하나를 세운다(문간은 오려 낸다). UV는 BDSP 벽의 흔한
 * 축척(가로 · 세로 0.25/칸, `c01r0101` · `c07r0201` 실측)으로 편다
 */
function fallbackWall(walls: readonly Tri[], frame: Frame, doors: readonly number[]): Mesh | null {
  const mat = walls[0]?.mat
  if (!mat) return null
  const f = frame.floor
  const x0 = Math.round(f.min.x), x1 = Math.round(f.max.x), zS = f.max.z
  const top = Math.max(DOOR_OPEN + 0.5, Math.min(frame.all.max.y, 3))
  const batch = new Batch()
  const at = (x: number, y: number): Vert => [x, y, zS, x * 0.25, 1 - y * 0.25, 0, 0, -1]
  const doorCols = new Set(doors)
  for (let x = x0; x < x1; x++) {
    const y0 = doorCols.has(x) ? DOOR_OPEN : 0
    batch.quad(mat, [at(x + 1, y0), at(x, y0), at(x, top), at(x + 1, top)])
  }
  return batch.mesh('방 남쪽 벽 (1인칭)')
}

// ── 덮개 ──────────────────────────────────────────────────────────────────────

/** 바닥 · 천장 같은 가로 면의 UV를 x · z로 이어 가는 그림 — 가까운 삼각형의 기울기로 편다 */
function planarPaint(tris: readonly Tri[]): ((x: number, z: number) => [number, number]) | null {
  const big = [...tris].sort((a, b) => area(b) - area(a))[0]
  if (!big) return null
  const [a, b, c] = big.v
  const x1 = b[0]! - a[0]!, z1 = b[2]! - a[2]!, x2 = c[0]! - a[0]!, z2 = c[2]! - a[2]!
  const d = x1 * z2 - x2 * z1
  if (Math.abs(d) < 1e-12) return null
  const g = (k: 3 | 4): [number, number] => {
    const q1 = b[k]! - a[k]!, q2 = c[k]! - a[k]!
    return [(q1 * z2 - q2 * z1) / d, (x1 * q2 - x2 * q1) / d]
  }
  const gu = g(3), gv = g(4)
  return (x, z) => [a[3]! + gu[0] * (x - a[0]!) + gu[1] * (z - a[2]!), a[4]! + gv[0] * (x - a[0]!) + gv[1] * (z - a[2]!)]
}

const area = (t: Tri): number => {
  const [a, b, c] = t.v
  return new Vector3(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!)
    .cross(new Vector3(c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!)).length() / 2
}

/**
 * 벽 꼭대기 띠의 UV 한 점 — 뚜껑 · 덮개를 그 방 벽의 윗단 색으로 칠한다. 북쪽 벽 평면의 깨끗한 기둥이 먼저고, 평면이 없는
 * 방(`t05r0501` — 남을 보는 세로 벽 면이 없다)은 가장 높이 닿는 세로 벽 면의 한가운데다
 */
function topBandPaint(walls: readonly Tri[], floor: Box3): { mat: Material, uv: [number, number] } | null {
  for (const p of northPlanes(walls, floor)) {
    const cols = columnsOf([p], Math.round(floor.min.x), Math.round(floor.max.x))
    // 제 평면을 가진 기둥만 — 빌려 온 기둥은 그 x에 면이 없다
    const own = cols.filter((q) => planeHas(p, q.x + CELL / 2) && q.reach > 0)
    for (const c of [...own.filter((q) => q.clean), ...own]) {
      const xm = c.x + CELL / 2
      for (let y = c.reach - CELL / 2; y > c.reach - 1; y -= CELL / 2) {
        const t = p.face.find((q) => covers(q, 0, 1, xm, y))
        if (t) return { mat: t.mat, uv: uvOn(t, 0, 1, xm, y) }
      }
    }
  }
  // ⚠️ 정점 법선을 안 본다 — 그 방 벽은 법선이 다 위를 보게 구워져 있다(빛 받기용, `M_D_004_Wall_01_1F_01` 실측 n.y 0.5~1).
  // 높이로 서 있는 면을 고른다
  const top = (t: Tri): number => Math.max(...t.v.map((q) => q[1]!))
  const span = (t: Tri): number => top(t) - Math.min(...t.v.map((q) => q[1]!))
  const tall = walls.filter((t) => span(t) > 0.3).sort((a, b) => top(b) - top(a))[0]
  if (!tall) return null
  const [a, b, c] = tall.v
  return { mat: tall.mat, uv: [(a[3]! + b[3]! + c[3]!) / 3, (a[4]! + b[4]! + c[4]!) / 3] }
}

/**
 * 천장 없는 방의 덮개 높이. 북쪽 벽 꼭대기가 먼저다 — 그 벽이 가장 높은 바닥보다 사람 키(`TALL`)만큼 안 높으면(무쇠 체육관
 * `c03gym0101`: 북벽 4 · 단 바닥 4) 그 평면은 단의 옆벽이라 방에서 가장 높은 세로 벽 끝을 쓴다
 */
function lidHeight(walls: readonly Tri[], floors: readonly Tri[], frame: Frame): number {
  const f = frame.floor
  const planes = northPlanes(walls, f)
  const floorTop = Math.max(0, ...floors.map((t) => Math.max(...t.v.map((q) => q[1]!))))
  const planeTop = planes.length > 0 ? Math.max(...planes.map((p) => p.top)) : -Infinity
  if (planeTop >= floorTop + TALL) return planeTop
  const inside = (q: Vert): boolean => q[0]! >= f.min.x && q[0]! <= f.max.x && q[2]! >= f.min.z && q[2]! <= f.max.z
  const wallTop = Math.max(-Infinity, ...walls
    .filter((t) => Math.abs(t.n.y) <= 0.3 && t.v.every(inside)).flatMap((t) => t.v.map((q) => q[1]!)))
  return wallTop > floorTop ? wallTop : frame.all.max.y
}

/** 가로 면들을 x · z 격자(`step`)로 덮이는지 — 한 칸 가운데가 어느 면 안인가 */
function coverGrid(tris: readonly Tri[], box: Box3, step: number): (i: number, j: number) => boolean {
  const nx = Math.ceil((box.max.x - box.min.x) / step), nz = Math.ceil((box.max.z - box.min.z) / step)
  const grid = new Uint8Array(nx * nz)
  for (const t of tris) {
    const xs = t.v.map((q) => q[0]!), zs = t.v.map((q) => q[2]!)
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - box.min.x) / step))
    const i1 = Math.min(nx - 1, Math.floor((Math.max(...xs) - box.min.x) / step))
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - box.min.z) / step))
    const j1 = Math.min(nz - 1, Math.floor((Math.max(...zs) - box.min.z) / step))
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        if (grid[j * nx + i]) continue
        if (covers(t, 0, 2, box.min.x + (i + 0.5) * step, box.min.z + (j + 0.5) * step, 1e-4)) grid[j * nx + i] = 1
      }
    }
  }
  return (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && grid[j * nx + i] === 1
}

/**
 * **1인칭 천장 메우기.** 천장(`_Ceil_`)이 없는 방(BDSP가 부감용으로 안 덮은 홀 · 체육관 — 실측 19곳)은 바닥 전체에, 있는 방은
 * 천장이 안 덮는 칸(움푹 들어간 벽 칸 · 벽 꼭대기와의 틈)에만 판을 덮는다. 높이는 천장 높이, 없으면 북쪽 벽 꼭대기다.
 * 그림은 천장이 있으면 천장 그림을 x · z로 이어 가고, 없으면 그 방 벽의 윗단 색이다
 */
function roomLid(root: Object3D, frame: Frame): Mesh | null {
  const f = frame.floor
  const ceils = trisOf(root, isCeiling).filter((t) => t.n.y < -0.7 || t.n.y > 0.7)
  const floors = trisOf(root, isFloor).filter((t) => t.n.y > 0.7)
  const walls = trisOf(root, isWall)
  let y: number
  let paint: (x: number, z: number) => [number, number]
  let mat: Material
  if (ceils.length > 0) {
    const ys = ceils.map((t) => t.v[0][1]!).sort((a, b) => a - b)
    y = ys[Math.floor(ys.length / 2)]!
    const level = ceils.filter((t) => t.v.every((q) => Math.abs(q[1]! - y) < 0.05))
    const pp = planarPaint(level)
    if (!pp) return null
    paint = pp; mat = level[0]!.mat
  } else {
    const band = topBandPaint(walls, f)
    if (!band) return null
    y = lidHeight(walls, floors, frame)
    paint = () => band.uv; mat = band.mat
  }
  const step = 0.25
  const box = f.clone()
  const hasFloor = coverGrid(floors.filter((t) => t.v.every((q) => q[1]! < y - 0.5)), box, step)
  const hasCeil = coverGrid(ceils.filter((t) => t.v.every((q) => Math.abs(q[1]! - y) < 0.3)), box, step)
  const nx = Math.ceil((box.max.x - box.min.x) / step), nz = Math.ceil((box.max.z - box.min.z) / step)
  const batch = new Batch()
  for (let j = 0; j < nz; j++) {
    let run = -1
    for (let i = 0; i <= nx; i++) {
      const need = i < nx && hasFloor(i, j) && !hasCeil(i, j)
      if (need && run < 0) run = i
      if (!need && run >= 0) {
        const xa = box.min.x + run * step, xb = box.min.x + i * step
        const za = box.min.z + j * step, zb = za + step
        const v = (x: number, z: number): Vert => [x, y, z, ...paint(x, z), 0, -1, 0]
        // 아래에서 볼 때 반시계
        batch.quad(mat, [v(xa, za), v(xb, za), v(xb, zb), v(xa, zb)])
        run = -1
      }
    }
  }
  return batch.mesh('방 천장 메움 (1인칭)')
}

/**
 * **남쪽 문간.** 문 칸은 바닥 상자 남쪽 끝 너머(z `f.max.z` ~ +1)라 1인칭으로 문간에 서면 옆 · 위 · 아래가 허공이었다(박물관 ·
 * 도서관). 이어진 문 칸마다 바닥 · 인방 높이 천장 · 좌우 벽을 세우고 남쪽 끝은 어두운 판으로 닫는다 — 바깥 그림은 원작에도
 * 이 자리에 없다(문을 밟으면 바로 넘어간다)
 */
function doorways(root: Object3D, frame: Frame, doors: readonly number[]): Mesh | null {
  if (doors.length === 0) return null
  const f = frame.floor, zS = f.max.z, zE = zS + 1
  const floors = trisOf(root, isFloor).filter((t) => t.n.y > 0.7 && t.v.every((q) => Math.abs(q[1]!) < 0.05))
  const walls = trisOf(root, isWall)
  const band = topBandPaint(walls, f)
  const floorPaint = planarPaint(floors.filter((t) => t.v.some((q) => q[2]! > zS - 2))) ?? planarPaint(floors)
  const batch = new Batch()
  const dark = new MeshBasicMaterial({ color: DOORWAY_DARK, name: '문간 끝' })
  const runs: [number, number][] = []
  for (const d of [...new Set(doors)].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1]
    if (last && last[1] === d) last[1] = d + 1
    else runs.push([d, d + 1])
  }
  const floorMat = floors[0]?.mat
  for (const [a, b] of runs) {
    if (floorMat && floorPaint) {
      // BDSP 문턱 판(`ComWall_09`, y 0 · 검정)과 같은 높이라 살짝 띄운다 — 바닥 재질은 방 바닥과 같이 써서 깊이 치우침을 못 건다
      const v = (x: number, z: number): Vert => [x, 0.002, z, ...floorPaint(x, z), 0, 1, 0]
      batch.quad(floorMat, [v(a, zE), v(b, zE), v(b, zS), v(a, zS)])
    }
    if (band) {
      const c = (x: number, z: number): Vert => [x, DOOR_OPEN, z, ...band.uv, 0, -1, 0]
      batch.quad(band.mat, [c(a, zS), c(b, zS), c(b, zE), c(a, zE)])
      // 좌우 벽 — 방 안쪽(문간 가운데)을 본다
      const sw = (x: number, nx: number) => (z: number, y: number): Vert => [x, y, z, ...band.uv, nx, 0, 0]
      const l = sw(a, 1), r = sw(b, -1)
      batch.quad(band.mat, [l(zE, 0), l(zS, 0), l(zS, DOOR_OPEN), l(zE, DOOR_OPEN)])
      batch.quad(band.mat, [r(zS, 0), r(zE, 0), r(zE, DOOR_OPEN), r(zS, DOOR_OPEN)])
    }
    const e = (x: number, y: number): Vert => [x, y, zE, 0, 0, 0, 0, -1]
    batch.quad(dark, [e(b, 0), e(a, 0), e(a, DOOR_OPEN), e(b, DOOR_OPEN)])
  }
  return batch.mesh('방 남쪽 문간 (1인칭)')
}

/**
 * **바닥 구멍 메우기.** 에스컬레이터 자리(통신 지하로 내려가던 곳 — 통신은 범위 밖)는 굽는 쪽에 메시가 없고 바닥만 2×2칸
 * 뚫려 있다(`t02pc0101` x 14~16 · z 9.5~11.5, `c10r0101` x 19~21). 같은 기둥의 북 · 남이 다 바닥인데 비어 있는 칸만 메운다 —
 * 방 모서리(기둥 자리)와 체육관 구덩이(낮은 바닥이 있다)는 안 건드린다
 */
function floorPatches(root: Object3D, frame: Frame): Mesh | null {
  const f = frame.floor
  const all = trisOf(root, isFloor).filter((t) => t.n.y > 0.3)
  const level = all.filter((t) => t.v.every((q) => Math.abs(q[1]!) < 0.05))
  if (level.length === 0) return null
  const step = 0.25
  const any = coverGrid(all, f, step), main = coverGrid(level, f, step)
  const nx = Math.ceil((f.max.x - f.min.x) / step), nz = Math.ceil((f.max.z - f.min.z) / step)
  const paint = planarPaint(level)
  if (!paint) return null
  const batch = new Batch()
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (any(i, j)) continue
      let north = false, south = false
      for (let k = j - 1; k >= 0 && !north; k--) north = main(i, k)
      for (let k = j + 1; k < nz && !south; k++) south = main(i, k)
      if (!north || !south) continue
      const xa = f.min.x + i * step, za = f.min.z + j * step
      const v = (x: number, z: number): Vert => [x, 0, z, ...paint(x, z), 0, 1, 0]
      batch.quad(level[0]!.mat, [v(xa, za + step), v(xa + step, za + step), v(xa + step, za), v(xa, za)])
    }
  }
  return batch.mesh('방 바닥 메움')
}

/**
 * 덮개 조각 가운데 **넓은 자리**의 삼각형 — 가로 · 세로 모두 `BIG_COVER` 넘게 덮인 칸(속)과 그 둘레다. 벽 꼭대기 띠는 기둥
 * 머리와 이어져 한 조각이어도 폭이 0.5칸이라 속이 없다
 */
function wideParts(list: readonly Tri[]): Tri[] {
  const step = 0.125, k = Math.ceil(BIG_COVER / step / 2)
  const box = new Box3()
  for (const t of list) for (const q of t.v) box.expandByPoint(new Vector3(q[0]!, q[1]!, q[2]!))
  const on = coverGrid(list, box, step)
  const nx = Math.ceil((box.max.x - box.min.x) / step), nz = Math.ceil((box.max.z - box.min.z) / step)
  const core = new Uint8Array(nx * nz)
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      let full = true
      for (let di = -k; di <= k && full; di++) for (let dj = -k; dj <= k && full; dj++) full = on(i + di, j + dj)
      if (full) core[j * nx + i] = 1
    }
  }
  const near = (x: number, z: number): boolean => {
    const i = Math.floor((x - box.min.x) / step), j = Math.floor((z - box.min.z) / step)
    for (let di = -k; di <= k; di++) {
      for (let dj = -k; dj <= k; dj++) {
        const a = i + di, b = j + dj
        if (a >= 0 && b >= 0 && a < nx && b < nz && core[b * nx + a]) return true
      }
    }
    return false
  }
  return list.filter((t) => near((t.v[0][0]! + t.v[1][0]! + t.v[2][0]!) / 3, (t.v[0][2]! + t.v[1][2]! + t.v[2][2]!) / 3))
}

/**
 * **넓은 검은 덮개를 뚜껑으로.** 3인칭에서 천장을 걷으면 천장에 닿던 기둥 머리 · 승강기 지붕이 그림 없는 검은 판으로
 * 드러난다(백화점 `c07r0202` 가운데 기둥 · 등대 `c08r0801` 승강기). 벽 꼭대기 띠(0.5칸 폭)는 부감 단면의 검은 선으로 두고,
 * 짧은 변이 `BIG_COVER` 넘는 덮개만 그 방 벽의 윗단 색으로 한 겹 덮는다
 */
function coverLids(root: Object3D, frame: Frame): Mesh | null {
  const ups = trisOf(root, isCoverMat).filter((t) => t.n.y > 0.7)
  if (ups.length === 0) return null
  const band = topBandPaint(trisOf(root, isWall), frame.floor)
  if (!band) return null
  // 꼭짓점을 나눠 쓰는 삼각형끼리 묶는다
  const key = (q: Vert): string => `${q[0]!.toFixed(3)},${q[1]!.toFixed(3)},${q[2]!.toFixed(3)}`
  const parent = ups.map((_, i) => i)
  const find = (i: number): number => { while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!; return i }
  const seen = new Map<string, number>()
  for (const [i, t] of ups.entries()) {
    for (const q of t.v) {
      const k = key(q), j = seen.get(k)
      if (j === undefined) seen.set(k, i)
      else parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, Tri[]>()
  for (const [i, t] of ups.entries()) {
    const r = find(i)
    const list = groups.get(r) ?? []
    list.push(t)
    groups.set(r, list)
  }
  const batch = new Batch()
  for (const list of groups.values()) {
    for (const t of wideParts(list)) {
      // 위를 보게 감는다 — 덮개 삼각형은 감김이 제각각이다
      const poly = t.v.map((q) => [q[0]!, q[1]! + 0.002, q[2]!, ...band.uv, 0, 1, 0])
      const [a, b, c] = poly as [Vert, Vert, Vert]
      const up = (b[2]! - a[2]!) * (c[0]! - a[0]!) - (b[0]! - a[0]!) * (c[2]! - a[2]!)
      batch.poly(band.mat, up >= 0 ? poly : poly.reverse())
    }
  }
  return batch.mesh('방 기둥 뚜껑')
}

/** 바닥 남쪽 끝 너머에 매달린 메시 — 3인칭에서는 방 앞 허공에 뜬 문 · 문턱 · 문빛이다 */
function hangingSouth(root: Object3D, frame: Frame): Mesh[] {
  const out: Mesh[] = []
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  root.traverse((o) => {
    if (!(o instanceof Mesh) || !o.visible) return
    const box = new Box3().setFromObject(o).applyMatrix4(inv)
    if ((box.min.z + box.max.z) / 2 >= frame.floor.max.z - 0.05) out.push(o)
  })
  return out
}

// ── 한데 모아 ─────────────────────────────────────────────────────────────────

/** 렌즈마다 켜고 끌 것 */
interface RoomShell {
  /** 1인칭에서만 — 천장 · 남쪽 벽 · 천장 메움 · 문간 */
  first: Object3D[]
  /** 3인칭에서 숨길 것 — 바닥 남쪽 끝 너머에 매달린 문 · 문턱 · 문빛 */
  hanging: Object3D[]
  /** 1인칭에서 숨길 빛 줄기 — 눈높이에서 사람 모양 흰 덩이로 읽혔다 */
  shafts: Object3D[]
  /** 지은 판들 (시험이 잰다) */
  parts: {
    south: Mesh | null
    lid: Mesh | null
    doorways: Mesh | null
    patches: Mesh | null
    lids: Mesh | null
  }
}

/**
 * 방 하나의 껍데기를 짓는다. 지은 판은 `root`에 붙는다.
 *
 * @param doors 남쪽 문 칸의 x — **바닥 남쪽 가장자리 행**(`w.z ≥ round(f.max.z) − 1`)의 워프만. 그 위 행의 계단 · 승강기
 *   워프까지 문으로 치면 남쪽 벽이 필요 없이 뚫린다
 */
export function shellRoom(root: Object3D, warps: readonly { x: number, z: number }[]): RoomShell {
  const { shafts, ceilings } = dressMaterials(root)
  const frame = frameOf(root)
  const empty: RoomShell['parts'] = { south: null, lid: null, doorways: null, patches: null, lids: null }
  if (!frame) return { first: ceilings, hanging: [], shafts, parts: empty }
  const edge = Math.round(frame.floor.max.z) - 1
  const doors = warps.filter((w) => w.z >= edge).map((w) => w.x)
  const hanging = hangingSouth(root, frame)
  const parts = {
    south: southWall(root, frame, doors),
    lid: roomLid(root, frame),
    doorways: doorways(root, frame, doors),
    patches: floorPatches(root, frame),
    lids: coverLids(root, frame),
  }
  const first: Object3D[] = [...ceilings]
  for (const m of [parts.south, parts.lid, parts.doorways]) if (m) { root.add(m); first.push(m) }
  for (const m of [parts.patches, parts.lids]) if (m) root.add(m)
  return { first, hanging, shafts, parts }
}
