// 사물별 형상 생성 — 순수 함수 (FIRST_PERSON §6)
//
// React도 프레임도 모른다. 단위는 **타일**이고 원점은 **지면에 닿는 밑면 한가운데**다
// (`anchor: 'ground-contact'`). 배치 변환은 부르는 쪽이 마지막에 한 번 건다.
//
// ⚠️ **여기 적힌 치수는 원작 복원값이 아니다.** 원본은 45°로 눕힌 그림 한 장이라
// 깊이·뒷면이 없다. 명세 §6이 정한 **시제품 초기값**이고, 화면 비교로 확정한다.
import { BufferAttribute, BufferGeometry } from 'three'

/** 형상 하나. 재질 칸 이름이 곧 그룹 차례다 */
export interface BuiltShape {
  geometry: BufferGeometry
  slots: readonly string[]
  /** 로컬 상자 [x0, y0, z0, x1, y1, z1] */
  bounds: readonly [number, number, number, number, number, number]
}

/** 옆모습 한 점 — 가운데서의 반폭 `r`, 높이 `y`, 그 점부터 다음 점까지의 재질 칸 */
interface ProfilePoint { r: number, y: number, slot: number }

/**
 * 옆모습을 **n각으로 돌려** 닫힌 입체를 만든다.
 *
 * 옆모습은 축 위(r=0)에서 시작해 축 위에서 끝나야 한다 — 그래야 밑과 위가 막힌다.
 * 면마다 정점을 따로 둬서 **모서리가 날카롭다**(바위·용기의 hard edge, §5.4).
 * `square`면 네 변이 x·z축과 나란하고 `r`이 반폭이다.
 */
function lathe(
  profile: readonly ProfilePoint[], sides: number, slots: number, square: boolean,
): { position: number[], uv: number[], byGroup: number[][] } {
  const position: number[] = []
  const uv: number[] = []
  const byGroup: number[][] = Array.from({ length: slots }, () => [])
  const turn = square ? Math.PI / 4 : 0
  const scale = square ? Math.SQRT2 : 1
  const at = (p: ProfilePoint, k: number): [number, number, number] => {
    const a = turn + (k / sides) * Math.PI * 2
    return [Math.cos(a) * p.r * scale, p.y, Math.sin(a) * p.r * scale]
  }
  // 옆모습을 따라 잰 거리 — 세로 UV
  const arc: number[] = [0]
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]!, b = profile[i]!
    arc.push(arc[i - 1]! + Math.hypot(b.r - a.r, b.y - a.y))
  }
  const tri = (group: number, p: [number, number, number][], t: [number, number][]) => {
    // 넓이 0이면 안 넣는다 — 축 위에서 모이는 자리
    const ux = p[1]![0] - p[0]![0], uy = p[1]![1] - p[0]![1], uz = p[1]![2] - p[0]![2]
    const vx = p[2]![0] - p[0]![0], vy = p[2]![1] - p[0]![1], vz = p[2]![2] - p[0]![2]
    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-10) return
    const base = position.length / 3
    for (let k = 0; k < 3; k++) { position.push(...p[k]!); uv.push(...t[k]!) }
    byGroup[group]!.push(base, base + 1, base + 2)
  }
  for (let i = 0; i + 1 < profile.length; i++) {
    const a = profile[i]!, b = profile[i + 1]!
    for (let k = 0; k < sides; k++) {
      const a0 = at(a, k), a1 = at(a, k + 1), b0 = at(b, k), b1 = at(b, k + 1)
      const side = Math.hypot(a1[0] - a0[0], a1[2] - a0[2])
      const sideB = Math.hypot(b1[0] - b0[0], b1[2] - b0[2])
      const w = Math.max(side, sideB)
      // 바깥을 보게 감는다: 옆모습이 안→밖→위→안으로 가므로 (a0, b0, b1)이 바깥이다
      tri(a.slot, [a0, b0, b1], [[0, arc[i]!], [0, arc[i + 1]!], [w, arc[i + 1]!]])
      tri(a.slot, [a0, b1, a1], [[0, arc[i]!], [w, arc[i + 1]!], [w, arc[i]!]])
    }
  }
  return { position, uv, byGroup }
}

/** 조각들을 한 지오메트리로. 그룹 차례 = 재질 칸 차례 */
function assemble(parts: ReturnType<typeof lathe>[], slots: readonly string[]): BuiltShape {
  const position: number[] = []
  const uv: number[] = []
  const index: number[] = []
  const groups: [number, number][] = []
  // 조각마다 정점 시작 자리가 다르다
  const offsets: number[] = []
  for (const part of parts) {
    offsets.push(position.length / 3)
    position.push(...part.position)
    uv.push(...part.uv)
  }
  for (let g = 0; g < slots.length; g++) {
    const start = index.length
    parts.forEach((part, p) => {
      for (const i of part.byGroup[g] ?? []) index.push(i + offsets[p]!)
    })
    groups.push([start, index.length - start])
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  geometry.setIndex(index)
  groups.forEach(([start, count], g) => { if (count > 0) geometry.addGroup(start, count, g) })
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const b = geometry.boundingBox!
  return {
    geometry, slots,
    bounds: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z],
  }
}

/** 화분 치수 — 폭 W의 배수 (§6.1 초기값) */
export const PLANTER = {
  bottom: 0.80,
  top: 0.94,
  body: 0.42,
  rimThick: 0.06,
  rimHeight: 0.05,
  soilDrop: 0.04,
  plantWidth: 0.72,
  plantHeight: 0.40,
} as const

/** 화분의 재질 칸 */
export const PLANTER_SLOTS = ['container', 'rim', 'soil', 'plant'] as const

/**
 * **사각 화분** — 용기·림·흙은 닫힌 입체 하나, 식물은 흙 위의 닫힌 덩이 하나.
 *
 * 용기 옆모습(반폭): 밑 0.40W → 몸통 위 0.47W → 림 바깥 0.50W → 림 위 →
 * 림 안쪽 0.44W → 흙 높이까지 내려가 → 가운데. 네모로 돌리면 밑·옆·림·흙이
 * **빈틈없이** 닫힌다. 식물은 여덟모 덩이라 네모 용기와 윤곽이 갈린다
 */
export function planterGeometry(width: number): BuiltShape {
  const W = width
  const P = PLANTER
  const rimTop = (P.body + P.rimHeight) * W
  const soil = rimTop - P.soilDrop * W
  const inner = (1 - 2 * P.rimThick) / 2 * W
  const pot = lathe([
    { r: 0, y: 0, slot: 0 },
    { r: (P.bottom / 2) * W, y: 0, slot: 0 },
    { r: (P.top / 2) * W, y: P.body * W, slot: 1 },
    { r: W / 2, y: P.body * W, slot: 1 },
    { r: W / 2, y: rimTop, slot: 1 },
    { r: inner, y: rimTop, slot: 1 },
    { r: inner, y: soil, slot: 2 },
    { r: 0, y: soil, slot: 2 },
  ], 4, PLANTER_SLOTS.length, true)
  const half = (P.plantWidth / 2) * W
  const h = P.plantHeight * W
  // 흙 속에 조금 묻어 떠 보이지 않게 한다
  const plant = lathe([
    { r: 0, y: soil - 0.01 * W, slot: 3 },
    { r: half * 0.70, y: soil - 0.01 * W, slot: 3 },
    { r: half, y: soil + h * 0.35, slot: 3 },
    { r: half * 0.80, y: soil + h * 0.75, slot: 3 },
    { r: half * 0.30, y: soil + h * 0.97, slot: 3 },
    { r: 0, y: soil + h, slot: 3 },
  ], 8, PLANTER_SLOTS.length, false)
  return assemble([pot, plant], PLANTER_SLOTS)
}

/** 둥근 덤불 재질 칸 */
export const SHRUB_SLOTS = ['leaf', 'shade'] as const

/**
 * **둥근 덤불** — 화분과 다른 계열이다 (§3: 사각 화분으로 단정 금지).
 *
 * 링 다섯의 닫힌 덩이. 밑 링은 그늘 칸이라 원본 그림의 어두운 밑부분을 거기에
 * 준다. 높이는 폭의 0.62배 — 초기값이다
 */
export function shrubGeometry(width: number): BuiltShape {
  const W = width
  const h = 0.62 * W
  const body = lathe([
    { r: 0, y: 0, slot: 1 },
    { r: 0.36 * W, y: 0, slot: 1 },
    { r: 0.48 * W, y: 0.22 * h, slot: 0 },
    { r: 0.50 * W, y: 0.50 * h, slot: 0 },
    { r: 0.38 * W, y: 0.82 * h, slot: 0 },
    { r: 0.14 * W, y: 0.98 * h, slot: 0 },
    { r: 0, y: h, slot: 0 },
  ], 10, SHRUB_SLOTS.length, false)
  return assemble([body], SHRUB_SLOTS)
}

/** 말뚝 울타리 재질 칸 */
export const FENCE_SLOTS = ['postFront', 'postTop', 'postEdge', 'railTop', 'railFront'] as const

/**
 * 말뚝 울타리 치수 — **텍셀**(16텍셀 = 1칸). 높이는 칸 행을 그대로 옮겼다:
 * 행 14(밑 그늘)의 아래 가장자리가 땅이고, 행 r은 높이 (14−r)/16 … (15−r)/16이다.
 * 깊이는 원본에 없다 — §6.2 초기값(기둥 폭의 0.6배)이다
 */
const FENCE = {
  pitch: 8,
  postFrom: 2,
  postTo: 6,
  /** 기둥 몸통 위 = 행 2의 위 가장자리 */
  bodyTop: 13,
  /** 뾰족한 끝 = 행 1 · 열 3–4 */
  tipTop: 14,
  tipFrom: 3,
  tipTo: 5,
  /** 위 가로대 앞면 = 행 8–9 · 아래 가로대 = 행 12–13 */
  rails: [[5, 7], [1, 3]] as readonly (readonly [number, number])[],
  postDepth: 0.6 * 4,
  tipDepth: 0.6 * 2,
  railDepth: 2,
} as const

/** 네모 상자 하나 — 앞뒤(±z)·옆(±x)·위·밑 면마다 칸을 따로 준다 */
function box(
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
  slot: { front: number, side: number, top: number }, slots: number,
): ReturnType<typeof lathe> {
  const position: number[] = []
  const uv: number[] = []
  const byGroup: number[][] = Array.from({ length: slots }, () => [])
  const quad = (g: number, a: number[], b: number[], c: number[], d: number[]) => {
    const base = position.length / 3
    position.push(...a, ...b, ...c, ...d)
    uv.push(0, 0, 1, 0, 1, 1, 0, 1)
    byGroup[g]!.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  // 바깥에서 보아 반시계로 감는다
  quad(slot.front, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1])
  quad(slot.front, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0])
  quad(slot.side, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1])
  quad(slot.side, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0])
  quad(slot.top, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0])
  quad(slot.front, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1])
  return { position, uv, byGroup }
}

/**
 * **말뚝 울타리** 한 토막 (§6.2). 원점은 원본 판 밑변의 가운데, +x가 판의 가로축.
 *
 * `u0`·`u1`은 로컬 x = −length/2 · +length/2 자리의 **칸 텍셀 u**다(반복 UV면 칸 밖
 * 값 그대로, 거꾸로면 u0 > u1). 기둥은 u가 `pitch`의 배수에서 `postFrom`…`postTo`인
 * 자리에만 선다 — 판 끝에서 잘린 기둥은 잘린 폭 그대로다. 가로대는 끝에서 끝까지
 */
export function fenceGeometry(length: number, u0: number, u1: number): BuiltShape {
  const T = 1 / 16
  const F = FENCE
  const slots = FENCE_SLOTS.length
  const [P_FRONT, P_TOP, P_EDGE, R_TOP, R_FRONT] = [0, 1, 2, 3, 4]
  const xOf = (u: number) => ((u - u0) / (u1 - u0) - 0.5) * length
  const lo = Math.min(u0, u1), hi = Math.max(u0, u1)
  const parts: ReturnType<typeof lathe>[] = []
  for (let k = Math.floor((lo - F.postTo) / F.pitch); k * F.pitch + F.postFrom < hi; k++) {
    const post = (from: number, to: number, top: number, bottom: number, depth: number) => {
      const a = Math.max(lo, k * F.pitch + from), b = Math.min(hi, k * F.pitch + to)
      if (b - a < 0.25) return
      const xa = xOf(a), xb = xOf(b)
      const d = (depth * T) / 2
      parts.push(box(Math.min(xa, xb), Math.max(xa, xb), bottom * T, top * T, -d, d,
        { front: P_FRONT, side: P_EDGE, top: P_TOP }, slots))
    }
    post(F.postFrom, F.postTo, F.bodyTop, 0, F.postDepth)
    post(F.tipFrom, F.tipTo, F.tipTop, F.bodyTop, F.tipDepth)
  }
  const d = (F.railDepth * T) / 2
  for (const [y0, y1] of F.rails) {
    parts.push(box(-length / 2, length / 2, y0 * T, y1 * T, -d, d,
      { front: R_FRONT, side: R_FRONT, top: R_TOP }, slots))
  }
  return assemble(parts, FENCE_SLOTS)
}

/**
 * 닫힌 메시인가 — 모든 모서리를 정확히 두 삼각형이 나누는가.
 * 면마다 정점을 따로 두므로 **자리**로 모서리를 잇는다. 시험과 보고서가 쓴다
 */
export function openEdges(geometry: BufferGeometry, groups?: readonly number[]): number {
  const pos = geometry.getAttribute('position').array
  const index = geometry.getIndex()!.array
  const key = (i: number) => `${Math.round(pos[i * 3]! * 1e5)},${Math.round(pos[i * 3 + 1]! * 1e5)},${Math.round(pos[i * 3 + 2]! * 1e5)}`
  const count = new Map<string, number>()
  const want = groups === undefined ? null : new Set(groups)
  for (const g of geometry.groups) {
    if (want !== null && !want.has(g.materialIndex ?? 0)) continue
    for (let t = g.start; t < g.start + g.count; t += 3) {
      const k = [key(index[t]!), key(index[t + 1]!), key(index[t + 2]!)]
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
        const e = k[a]! < k[b]! ? `${k[a]!}|${k[b]!}` : `${k[b]!}|${k[a]!}`
        count.set(e, (count.get(e) ?? 0) + 1)
      }
    }
  }
  let open = 0
  for (const n of count.values()) if (n !== 2) open += 1
  return open
}

/** 부호 있는 부피 — 바깥을 보게 감겼으면 양수다 */
export function signedVolume(geometry: BufferGeometry, groups?: readonly number[]): number {
  const pos = geometry.getAttribute('position').array
  const index = geometry.getIndex()!.array
  const want = groups === undefined ? null : new Set(groups)
  let v = 0
  for (const g of geometry.groups) {
    if (want !== null && !want.has(g.materialIndex ?? 0)) continue
    for (let t = g.start; t < g.start + g.count; t += 3) {
      const a = index[t]! * 3, b = index[t + 1]! * 3, c = index[t + 2]! * 3
      v += (pos[a]! * (pos[b + 1]! * pos[c + 2]! - pos[b + 2]! * pos[c + 1]!)
        - pos[a + 1]! * (pos[b]! * pos[c + 2]! - pos[b + 2]! * pos[c]!)
        + pos[a + 2]! * (pos[b]! * pos[c + 1]! - pos[b + 1]! * pos[c]!)) / 6
    }
  }
  return v
}
