import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { carveMesh, decompose, exportField, flipped, holeOf, HoleIndex, subtractTriangle, type Hole } from './field'
import { fieldBundles } from './convert'
import { openEnvironment } from './environment'
import { encodePng } from '../platinum/png'
import { bdspDir, withLocal } from '../../data/romData.testkit'

/** 행 우선 4×4 — 이동 · y축 회전 · 배율 */
function trs(tx: number, ty: number, tz: number, yaw: number, s: [number, number, number]): Float64Array {
  const c = Math.cos(yaw), n = Math.sin(yaw)
  return Float64Array.from([
    c * s[0], 0, n * s[2], tx,
    0, s[1], 0, ty,
    -n * s[0], 0, c * s[2], tz,
    0, 0, 0, 1,
  ])
}

describe('야외 지역 — 세울 자리 (`field.ts`)', () => {
  it('x를 뒤집은 행렬은 원작 좌표로 옮긴 점과 같은 점을 준다 (F·W·F)', () => {
    const w = trs(-110, 1, 880, 0.7, [1.2, 0.9, 1.1])
    const f = flipped(w)
    // Unity 제 좌표의 점 p → 월드 W·p → x 뒤집기. 우리는 F·p를 F·W·F로 옮긴다
    const p = [0.3, 0.5, -0.2]
    const wx = w[0]! * p[0]! + w[1]! * p[1]! + w[2]! * p[2]! + w[3]!
    const fx = f[0]! * -p[0]! + f[1]! * p[1]! + f[2]! * p[2]! + f[3]!
    expect(fx).toBeCloseTo(-wx, 9)
    expect(f[3]).toBeCloseTo(110, 9)
  })

  it('이동 · 회전 · 배율로 도로 푼다', () => {
    const m = trs(5, 2, -3, 1.1, [2, 3, 0.5])
    const d = decompose(m)
    expect(d.t).toEqual([5, 2, -3])
    d.s.forEach((v, i) => { expect(v).toBeCloseTo([2, 3, 0.5][i]!, 9) })
    // y축 회전 사원수
    expect(Math.abs(d.r[1]!)).toBeCloseTo(Math.sin(0.55), 9)
    expect(Math.abs(d.r[3]!)).toBeCloseTo(Math.cos(0.55), 9)
  })

  it('지역 번들 목록은 `area###`과 대습지만 — 배틀 배경은 뺀다', () => {
    expect(fieldBundles([
      'Environments/fields/area001', 'Environments/fields/battle001', 'Environments/fields/safari',
      'Environments/fields/area014', 'Environments/prefab_map/c01r0101',
    ])).toEqual(['area001', 'area014', 'safari'])
  })
})

/** xz 다각형 넓이 (부호 없음) */
function areaOf(poly: readonly (readonly [number, number])[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!
    s += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(s) / 2
}

/** 원작 좌표 수평 사각형 → 구멍 삼각형 둘 */
function floorHoles(x0: number, z0: number, x1: number, z1: number, y: number): Hole[] {
  return [
    holeOf([x0, y, z0], [x1, y, z0], [x1, y, z1]),
    holeOf([x0, y, z0], [x1, y, z1], [x0, y, z1]),
  ].filter((h): h is Hole => h !== null)
}

/** y = 0에 누운 4×4칸 땅 — 삼각형 둘, UV는 x/4 · z/4 */
function groundQuad(): { pos: Float32Array, nrm: Float32Array, uv: Float32Array, tri: Uint32Array } {
  return {
    pos: Float32Array.from([0, 0, 0, 4, 0, 0, 4, 0, 4, 0, 0, 4]),
    nrm: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uv: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
    tri: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  }
}

/** 잘린 메시의 삼각형들 (제 좌표 = 원작 좌표로 둔 시험) */
function trianglesOf(pos: Float32Array, tri: Uint32Array): [number, number, number][][] {
  const out: [number, number, number][][] = []
  for (let t = 0; t + 2 < tri.length; t += 3) {
    out.push([0, 1, 2].map((k) => {
      const i = tri[t + k]!
      return [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!] as [number, number, number]
    }))
  }
  return out
}

describe('가짜 실내 바닥 밑 도려내기 (`field.ts`의 ROOM_INNER)', () => {
  it('볼록 다각형에서 삼각형을 빼면 겹친 넓이만큼 줄고, 남은 조각은 그 삼각형 밖에 있다', () => {
    const square: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const pieces = subtractTriangle(square, [[0, 0], [1, 0], [0, 1]])
    expect(pieces.reduce((a, p) => a + areaOf(p), 0)).toBeCloseTo(0.5, 9)
    for (const p of pieces) for (const [x, z] of p) expect(x + z).toBeGreaterThanOrEqual(1 - 1e-9)
    // 다 덮으면 아무것도 안 남고, 안 겹치면 그대로다
    expect(subtractTriangle(square, [[-1, -1], [3, -1], [-1, 3]])).toEqual([])
    const apart = subtractTriangle(square, [[5, 5], [6, 5], [5, 6]])
    expect(apart).toHaveLength(1)
    expect(areaOf(apart[0]!)).toBeCloseTo(1, 9)
  })

  it('구멍은 수평 삼각형만 — 선 벽은 안 되고, 감기는 반시계로 맞춘다', () => {
    expect(holeOf([0, 0, 0], [1, 0, 0], [1, 1, 0])).toBeNull()
    const h = holeOf([0, 2, 0], [0, 2, 1], [1, 2, 0])!
    expect(areaOf(h.xz)).toBeCloseTo(0.5, 9)
    const [a, b, c] = h.xz
    expect((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])).toBeGreaterThan(0)
    expect(h.box).toEqual([0, 0, 1, 1])
  })

  it('같은 높이 실내 바닥 발자국 안에는 땅 삼각형이 하나도 안 남고, 밖은 그대로 덮인다', () => {
    const g = groundQuad()
    const holes = new HoleIndex(floorHoles(1, 1, 2.5, 3, 0))
    const at = (i: number): [number, number, number] => [g.pos[i * 3]!, g.pos[i * 3 + 1]!, g.pos[i * 3 + 2]!]
    const cut = carveMesh(g.pos, g.nrm, g.uv, 4, [g.tri], [false], at, holes)!
    expect(cut).not.toBeNull()
    expect(cut.touched).toBe(2)
    const tris = trianglesOf(cut.pos, cut.subs[0]!)
    // 넓이: 16 − 1.5×2
    expect(tris.reduce((a, t) => a + areaOf(t.map((p) => [p[0], p[2]] as [number, number])), 0)).toBeCloseTo(13, 6)
    for (const t of tris) {
      const cx = (t[0]![0] + t[1]![0] + t[2]![0]) / 3, cz = (t[0]![2] + t[1]![2] + t[2]![2]) / 3
      expect(cx > 1 && cx < 2.5 && cz > 1 && cz < 3).toBe(false)
      for (const p of t) expect(p[1]).toBe(0)
    }
    // 새 정점의 UV · 법선은 원래 삼각형에서 고루 섞인 값이다 (여기서는 uv = x/4 · z/4)
    for (let i = 4; i < cut.count; i++) {
      expect(cut.uv[i * 2]).toBeCloseTo(cut.pos[i * 3]! / 4, 6)
      expect(cut.uv[i * 2 + 1]).toBeCloseTo(cut.pos[i * 3 + 2]! / 4, 6)
      expect(cut.nrm[i * 3 + 1]).toBeCloseTo(1, 9)
    }
  })

  it('높이가 다른 바닥 · 건드리지 말라는 부분 메시는 안 자른다', () => {
    const g = groundQuad()
    const at = (i: number): [number, number, number] => [g.pos[i * 3]!, g.pos[i * 3 + 1]!, g.pos[i * 3 + 2]!]
    expect(carveMesh(g.pos, g.nrm, g.uv, 4, [g.tri], [false], at, new HoleIndex(floorHoles(1, 1, 2, 2, 0.3)))).toBeNull()
    expect(carveMesh(g.pos, g.nrm, g.uv, 4, [g.tri], [true], at, new HoleIndex(floorHoles(1, 1, 2, 2, 0)))).toBeNull()
  })
})

/** glb의 노드마다 원작 좌표 삼각형 (사본 노드는 `instanced`) */
function readPlaced(glb: Uint8Array): { material: string, instanced: boolean, tris: number[][][] }[] {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  const jsonLength = view.getUint32(12, true)
  const gltf = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as {
    nodes: { mesh: number, matrix?: number[], extensions?: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: number, ROTATION: number, SCALE: number } } } }[]
    meshes: { primitives: { attributes: { POSITION: number }, indices: number, material?: number }[] }[]
    materials: { name: string }[]
    accessors: { bufferView: number, byteOffset?: number, count: number, componentType: number, type: string }[]
    bufferViews: { byteOffset?: number }[]
  }
  const bin = 20 + jsonLength + 8
  const read = (i: number): Float32Array | Uint16Array | Uint32Array => {
    const a = gltf.accessors[i]!
    const at = glb.byteOffset + bin + (gltf.bufferViews[a.bufferView]!.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const k = a.type === 'VEC4' ? 4 : a.type === 'VEC3' ? 3 : a.type === 'VEC2' ? 2 : 1
    const copy = glb.buffer.slice(at, at + a.count * k * (a.componentType === 5123 ? 2 : 4))
    return a.componentType === 5126 ? new Float32Array(copy) : a.componentType === 5123 ? new Uint16Array(copy) : new Uint32Array(copy)
  }
  const out: { material: string, instanced: boolean, tris: number[][][] }[] = []
  for (const node of gltf.nodes) {
    // 열 우선 행렬들 — 사본 노드는 자리마다 이동 · 회전(사원수) · 배율로 짓는다
    const mats: number[][] = []
    const inst = node.extensions?.EXT_mesh_gpu_instancing.attributes
    if (inst) {
      const T = read(inst.TRANSLATION), R = read(inst.ROTATION), S = read(inst.SCALE)
      for (let i = 0; i < T.length / 3; i++) {
        const [x, y, z, w] = [R[i * 4]!, R[i * 4 + 1]!, R[i * 4 + 2]!, R[i * 4 + 3]!]
        const sx = S[i * 3]!, sy = S[i * 3 + 1]!, sz = S[i * 3 + 2]!
        mats.push([
          (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
          2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
          2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
          T[i * 3]!, T[i * 3 + 1]!, T[i * 3 + 2]!, 1,
        ])
      }
    } else mats.push(node.matrix ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    for (const prim of gltf.meshes[node.mesh]!.primitives) {
      const pos = read(prim.attributes.POSITION), idx = read(prim.indices)
      const tris: number[][][] = []
      for (const m of mats) {
        const place = (i: number): number[] => {
          const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!
          return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!]
        }
        for (let t = 0; t + 2 < idx.length; t += 3) tris.push([place(idx[t]!), place(idx[t + 1]!), place(idx[t + 2]!)])
      }
      out.push({ material: prim.material === undefined ? '' : gltf.materials[prim.material]!.name, instanced: inst !== undefined, tris })
    }
  }
  return out
}

/** 점 (x, z)를 덮는 삼각형의 그 자리 높이들 */
function heightsAt(tris: readonly number[][][], x: number, z: number): number[] {
  const ys: number[] = []
  for (const [a, b, c] of tris) {
    const det = (b![2]! - c![2]!) * (a![0]! - c![0]!) + (c![0]! - b![0]!) * (a![2]! - c![2]!)
    if (Math.abs(det) < 1e-9) continue
    const l1 = ((b![2]! - c![2]!) * (x - c![0]!) + (c![0]! - b![0]!) * (z - c![2]!)) / det
    const l2 = ((c![2]! - a![2]!) * (x - c![0]!) + (a![0]! - c![0]!) * (z - c![2]!)) / det
    const l3 = 1 - l1 - l2
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue
    ys.push(l1 * a![1]! + l2 * b![1]! + l3 * c![1]!)
  }
  return ys
}

const AREA = bdspDir('environments')
const area001 = AREA ? join(AREA, 'fields', 'area001') : null
withLocal('BDSP 야외', area001)('야외 지역 — 원본 자료', () => {
  it('area001을 인스턴싱으로 굽고, 떡잎마을이 원작 좌표 안에 든다', async () => {
    const env = openEnvironment([new Uint8Array(readFileSync(area001!))])
    const { stat } = await exportField(env, encodePng, { name: 'area001', maxSize: 64 })
    expect(stat.problems).toEqual([])
    // 같은 메시의 사본(낮은 나무 2,312 · 나무 954 · 풀 무더기 1,350)은 한 벌로 — 세운 삼각형이 고유 삼각형의 다섯 배쯤이다
    expect(stat.placedTriangles).toBeGreaterThan(stat.triangles * 4)
    expect(stat.instanced).toBeGreaterThan(20)
    // 떡잎마을 집 (원작 x 104~115 · z 876~886)
    const [x0, z0, x1, z1] = stat.box
    expect(x0).toBeLessThanOrEqual(104)
    expect(x1).toBeGreaterThanOrEqual(115)
    expect(z0).toBeLessThanOrEqual(876)
    expect(z1).toBeGreaterThanOrEqual(886)
  }, 300_000)

  // 연고시티 관문(`P_C_001_BarrierGate_01`) 넷과 집 문 뒤 가짜 실내가 든 지역
  const area004 = AREA ? join(AREA, 'fields', 'area004') : null
  it('area004 — 가짜 실내 바닥 발자국 안에 같은 높이 땅 삼각형이 0이다 (관문 체크 바닥이 풀과 안 싸운다)', async () => {
    const env = openEnvironment([new Uint8Array(readFileSync(area004!))])
    const { glb, stat } = await exportField(env, encodePng, { name: 'area004', maxSize: 64 })
    expect(stat.problems).toEqual([])
    expect(stat.carved).toBeGreaterThan(0)
    const placed = readPlaced(glb)
    const floors = placed.filter((p) => /RoomInner/.test(p.material)).flatMap((p) => p.tris)
      .filter(([a, b, c]) => Math.abs(a![1]! - b![1]!) < 1e-4 && Math.abs(a![1]! - c![1]!) < 1e-4)
    // 자르는 것(한 자리에 선 메시)만 본다 — 사본(문턱 · 빛 웅덩이)은 일부러 안 자른다
    const cells = new Set<string>()
    const cellsOf = (t: number[][]): string[] => {
      const out: string[] = []
      const xs = t.map((p) => Math.floor(p[0]! / 4)), zs = t.map((p) => Math.floor(p[2]! / 4))
      for (let i = Math.min(...xs); i <= Math.max(...xs); i++) for (let k = Math.min(...zs); k <= Math.max(...zs); k++) out.push(`${String(i)},${String(k)}`)
      return out
    }
    for (const f of floors) for (const c of cellsOf(f)) cells.add(c)
    const ground = placed.filter((p) => !/RoomInner/.test(p.material) && !p.instanced).flatMap((p) => p.tris)
      .filter((t) => cellsOf(t).some((c) => cells.has(c)))
    let samples = 0, fought = 0
    for (const f of floors) {
      const y = f[0]![1]!
      // 바닥 삼각형마다 무게중심과 꼭짓점 쪽 세 점
      for (const w of [[1 / 3, 1 / 3, 1 / 3], [0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7]]) {
        const x = w[0]! * f[0]![0]! + w[1]! * f[1]![0]! + w[2]! * f[2]![0]!
        const z = w[0]! * f[0]![2]! + w[1]! * f[1]![2]! + w[2]! * f[2]![2]!
        samples++
        if (heightsAt(ground, x, z).some((h) => Math.abs(h - y) < 0.01)) fought++
      }
    }
    expect(floors.length).toBeGreaterThan(100)
    expect(samples).toBeGreaterThan(400)
    expect(fought).toBe(0)
  }, 300_000)

  // area002는 영원시티 · 206번도로 사본을 한 칸 남쪽에 품는다 — 안 굽고, 207번도로와의 이음매 한 줄만 빌린다
  const area002 = AREA ? join(AREA, 'fields', 'area002') : null
  it('area002 — 어긋난 영원시티 사본이 없고, 206번도로 끝 한 줄만 남는다', async () => {
    const env = openEnvironment([new Uint8Array(readFileSync(area002!))])
    const { glb, stat } = await exportField(env, encodePng, { name: 'area002', maxSize: 64 })
    expect(stat.problems).toEqual([])
    const placed = readPlaced(glb)
    const inEterna = (t: number[][]) => t.some((p) => p[0]! > 280 && p[0]! < 340 && p[2]! > 505 && p[2]! < 580)
    // 영원시티 센터 문짝 · 땅 — 한 조각도 없다
    expect(placed.filter((p) => p.tris.some(inEterna)).length).toBe(0)
    // 206번도로 몫(z 577~703)에 든 삼각형도 없다. 이음매(703~704)는 남는다
    const route = placed.flatMap((p) => p.tris).filter((t) => t.every((q) => q[2]! > 600 && q[2]! < 702.9))
    expect(route.length).toBe(0)
    const seam = placed.flatMap((p) => p.tris).filter((t) => t.every((q) => q[2]! >= 702.99 && q[2]! <= 704.01)
      && t.every((q) => q[0]! > 278 && q[0]! < 330))
    expect(seam.length).toBeGreaterThan(80)
    // 지역 상자는 이음매 뿌리(z 577)까지 늘지 않는다 — 207번도로부터다
    expect(stat.box[1]).toBeGreaterThanOrEqual(700)
  }, 300_000)
})
