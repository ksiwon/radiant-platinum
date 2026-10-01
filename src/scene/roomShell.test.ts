// BDSP 방 껍데기 (`roomShell`) — 구운 방 glb를 그대로 펴서 잰다
//
// 방은 `public/models/room/*.glb`이고 리포에 안 들어간다(없으면 건너뛴다). 로더는 `GLTFLoader`가 하는 대로 편다 —
// 노드 하나 · 메시 하나 · 원시 도형마다 메시 하나와 재질 하나(같은 재질 번호면 같은 재질 객체), 그림이 있으면 텍스처 자리만.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Texture,
  type Material,
} from 'three'
import {
  CEIL_GLOW, isBlackCover, isCeiling, isFloorDecal, isLightShaft, isSmoke, LIGHT_SHAFT, shellRoom, SMOKE_OPACITY,
} from './roomShell'
import { withModels } from '../data/romData.testkit'
import { splitEliteFourDoors } from './BdspRoom'
import { DOOR_OPEN } from './roomWalls'

interface Gltf {
  accessors: { bufferView: number, byteOffset?: number, componentType: number, count: number, type: string }[]
  bufferViews: { byteOffset?: number, byteLength: number }[]
  meshes: { name: string, primitives: { attributes: Record<string, number>, indices: number, material?: number }[] }[]
  materials: {
    name: string, alphaMode?: string, doubleSided?: boolean
    pbrMetallicRoughness?: { baseColorTexture?: unknown, baseColorFactor?: number[] }
  }[]
}

/** glb 한 벌을 three 씬으로 — 그림 자리는 빈 `Texture`다 */
function loadRoom(name: string): Group {
  const buf = readFileSync(resolve(__dirname, '../../public/models/room', `${name}.glb`))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const view = new DataView(ab)
  const jsonLen = view.getUint32(12, true)
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, jsonLen))) as Gltf
  const binAt = 20 + jsonLen + 8
  const attr = (index: number): BufferAttribute => {
    const acc = gltf.accessors[index]!
    const bv = gltf.bufferViews[acc.bufferView]!
    const lanes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type] ?? 1
    const at = binAt + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
    const n = acc.count * lanes
    const arr = acc.componentType === 5126 ? new Float32Array(ab.slice(at, at + n * 4))
      : acc.componentType === 5125 ? new Uint32Array(ab.slice(at, at + n * 4))
        : new Uint16Array(ab.slice(at, at + n * 2))
    return new BufferAttribute(arr, lanes)
  }
  const mats = new Map<number, Material>()
  const material = (i: number | undefined): Material => {
    const key = i ?? -1
    let m = mats.get(key)
    if (m) return m
    const d = i === undefined ? { name: '' } : gltf.materials[i]!
    const f = 'pbrMetallicRoughness' in d ? d.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1] : [1, 1, 1, 1]
    const tex = 'pbrMetallicRoughness' in d && d.pbrMetallicRoughness?.baseColorTexture ? new Texture() : null
    m = new MeshStandardMaterial({ name: d.name, color: new Color(f[0], f[1], f[2]), map: tex })
    if ('doubleSided' in d && d.doubleSided) m.side = DoubleSide
    if ('alphaMode' in d && d.alphaMode === 'BLEND') m.transparent = true
    mats.set(key, m)
    return m
  }
  const root = new Group()
  const group = new Group()
  group.name = name
  root.add(group)
  for (const [i, p] of gltf.meshes[0]!.primitives.entries()) {
    const g = new BufferGeometry()
    g.setAttribute('position', attr(p.attributes.POSITION!))
    if (p.attributes.NORMAL !== undefined) g.setAttribute('normal', attr(p.attributes.NORMAL))
    if (p.attributes.TEXCOORD_0 !== undefined) g.setAttribute('uv', attr(p.attributes.TEXCOORD_0))
    g.setIndex(attr(p.indices))
    const mesh = new Mesh(g, material(p.material))
    mesh.name = `${name}_${String(i)}`
    group.add(mesh)
  }
  return root
}

const matsOf = (m: Mesh): Material[] => (Array.isArray(m.material) ? m.material : [m.material]) as Material[]

/** 지은 판의 삼각형 — [x, y, z]×3 */
function trianglesOf(mesh: Mesh): number[][][] {
  const p = mesh.geometry.getAttribute('position')
  const out: number[][][] = []
  for (let i = 0; i + 2 < p.count; i += 3) {
    out.push([0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)]))
  }
  return out
}

/** (x, y)가 판(남쪽 벽 평면에 비춘 것) 안인가 */
function wallCovers(tris: readonly number[][][], x: number, y: number): boolean {
  return tris.some(([a, b, c]) => {
    const d = (b![1]! - c![1]!) * (a![0]! - c![0]!) + (c![0]! - b![0]!) * (a![1]! - c![1]!)
    if (Math.abs(d) < 1e-9) return false
    const l1 = ((b![1]! - c![1]!) * (x - c![0]!) + (c![0]! - b![0]!) * (y - c![1]!)) / d
    const l2 = ((c![1]! - a![1]!) * (x - c![0]!) + (a![0]! - c![0]!) * (y - c![1]!)) / d
    return l1 >= -1e-4 && l2 >= -1e-4 && 1 - l1 - l2 >= -1e-4
  })
}

describe('재질 가르기', () => {
  const m = (name: string): Material => new MeshStandardMaterial({ name })

  it('빛 줄기 — 창빛 · 조명 · 문빛은 줄기고 등 · 문틀은 아니다', () => {
    for (const n of ['M_C_001_WindowLight_01', 'M_RO_045_SpotLight_01', 'M_C_001_SpotLight_01', 'M_C_001_WindowLight_00_1',
      'M_C_001_EntranceLight_01']) expect(isLightShaft(m(n)), n).toBe(true)
    for (const n of ['M_C_001_HangingLight_01', 'M_C_001_GateLight_01', 'M_RO_202_Floorlight_01', 'M_C_001_Wall_01']) {
      expect(isLightShaft(m(n)), n).toBe(false)
    }
  })

  it('바닥 데칼 — 깔개 · 문 매트 · 마크는 데칼이고 탁자보는 아니다', () => {
    for (const n of ['M_C_001_Mat_01', 'M_C_001_Mat_12', 'M_RO_005_Mark_01', 'M_RO_005_Mark_01_B1F_01']) {
      expect(isFloorDecal(m(n)), n).toBe(true)
    }
    expect(isFloorDecal(m('M_C_001_TableMat_01'))).toBe(false)
  })

  it('연기 · 천장', () => {
    expect(isSmoke(m('M_C_001_FieldSmoke_01'))).toBe(true)
    expect(isCeiling(m('M_RO_005_Ceil_01'))).toBe(true)
    expect(isCeiling(m('M_C_001_ComWall_02'))).toBe(false)
  })

  it('검은 덮개 — 그림 없고 순검정인 것만', () => {
    expect(isBlackCover(new MeshStandardMaterial({ name: 'M_C_001_ComWall_02', color: 0x000000 }))).toBe(true)
    expect(isBlackCover(new MeshStandardMaterial({ name: 'M_C_001_ComWall_05', color: 0x000000, map: new Texture() })))
      .toBe(false)
    expect(isBlackCover(new MeshStandardMaterial({ name: 'M_RO_201_Ceil_01', color: 0xffffff }))).toBe(false)
    expect(isBlackCover(new MeshBasicMaterial({ color: 0x000000 }))).toBe(false)
  })
})

/** 남쪽 벽이 바닥 x 전체를 벽 꼭대기 근처까지 덮는가 — 문간 칸은 `DOOR_OPEN` 아래가 비어야 한다 */
function expectSouthCovers(name: string, warps: { x: number, z: number }[], up: number): void {
  const root = loadRoom(name)
  const shell = shellRoom(root, warps)
  const south = shell.parts.south
  expect(south, `${name} 남쪽 벽`).not.toBeNull()
  const tris = trianglesOf(south!)
  const xs = tris.flatMap((t) => t.map((q) => q[0]!))
  const x0 = Math.round(Math.min(...xs)), x1 = Math.round(Math.max(...xs))
  const doorCols = new Set(warps.map((w) => w.x))
  const missing: string[] = []
  for (let x = x0 + 0.0625; x < x1; x += 0.125) {
    for (let y = 0.0625; y < up; y += 0.125) {
      const door = doorCols.has(Math.floor(x)) && y < DOOR_OPEN
      if (wallCovers(tris, x, y) === door) missing.push(`${x.toFixed(2)},${y.toFixed(2)}${door ? '(문)' : ''}`)
    }
  }
  expect(missing.slice(0, 12), `${name} 빈 자리 ${String(missing.length)}`).toEqual([])
}

/** 남쪽 벽이 그 방 북쪽 벽 평면에서 왔다고 본 방들 — 옛 판정(바닥 상자 북쪽 끝)에서는 벽을 못 찾아 남쪽이 비었다 */
const SOUTH_WALL_ROOMS = ['c05r0101', 'c05r0801', 'c05r1101', 'c07r0201', 'c07r0202', 'c07r0203', 'c07r0204', 'c07r0205',
  'c08gym0101', 'c08gym0102', 'c08gym0103', 'c10r0101', 'c10r0111', 'r212ar0101', 't04r0101', 't07r0101', 't07r0102']
/** `_Ceil_`이 없는 방 — 1인칭 천장을 통째로 덮는다 (운하 체육관 `c02gym0101`은 원작 그림이 선다 · `MISFIT_ROOMS`) */
const LIDLESS_ROOMS = ['c03gym0101', 'c05r1101', 'c05r1102', 'c08gym0103', 'l02r0101', 'r206r0101',
  'r209r0101', 'r210ar0101', 'r213r0301', 't05r0501']

withModels(...[...new Set(['c01r0101', 'c07r0201', 'c08gym0101', 'c10r0101', 'c01r0601', 't01r0102', 'c08r0801', 't02pc0101',
  't02fs0101', 'c07r0202', 'c05gym0102', 'c05r1101', 'c10r0103', ...SOUTH_WALL_ROOMS, ...LIDLESS_ROOMS])]
  .map((n) => `room/${n}.glb`))('구운 방', () => {
  it('남쪽 벽 — 바닥 상자가 아니라 벽에서 북쪽 평면을 찾아 바닥 폭 전체를 덮는다', () => {
    // 방송국 1층 — 문 둘 (3, 12) · (16, 12)
    expectSouthCovers('c01r0101', [{ x: 3, z: 12 }, { x: 16, z: 12 }], 2.9)
    // 백화점 — 바닥은 z −0.5부터인데 벽은 3이다
    expectSouthCovers('c07r0201', [{ x: 10, z: 12 }], 2.9)
    // 물가 체육관 — 톱니 구덩이 바닥이 z −1까지 간다. 벽은 3
    expectSouthCovers('c08gym0101', [{ x: 8, z: 14 }], 2.9)
    // 리그 로비 — 벽 2.5 · 바닥 −1
    expectSouthCovers('c10r0101', [{ x: 11, z: 11 }], 2.9)
    // 콘테스트 홀 — 31칸 폭
    expectSouthCovers('c05r1101', [{ x: 16, z: 13 }], 2.9)
  })

  it('남쪽 벽 — 계단식 북벽(GTS: x 5~16은 z 1, 나머지는 z 6)도 x 1~20을 다 덮는다', () => {
    expectSouthCovers('c01r0601', [{ x: 10, z: 15 }], 4.9)
  })

  it('남쪽 벽 — 북벽 구멍(TV · 창) 둘레는 깨끗한 기둥을 옮겨 붙여 메운다', () => {
    // 주인공 집 2층 — 박공 지붕 아래 TV 구멍
    expectSouthCovers('t01r0102', [], 1.5)
    // 등대 — 북벽 큰 전망창(x 2.4~10.6 · y 0.85~2.67)
    expectSouthCovers('c08r0801', [{ x: 6, z: 11 }], 2.9)
  })

  it('남쪽 벽 — 북벽 삼각형마다 제 재질을 쓴다 (한 재질로 칠하지 않는다)', () => {
    const root = loadRoom('c08r0801')
    const south = shellRoom(root, []).parts.south!
    for (const m of matsOf(south)) expect(/_Wall_/.test(m.name), m.name).toBe(true)
  })

  it('남쪽 벽 — 문은 남쪽 가장자리 행의 워프만이다 (위 행 계단 워프는 벽을 뚫지 않는다)', () => {
    const root = loadRoom('c01r0101')
    // 바닥 z 3~13 — 가장자리 행은 12. 11행 워프는 문이 아니다
    const south = shellRoom(root, [{ x: 5, z: 11 }]).parts.south!
    expect(wallCovers(trianglesOf(south), 5.5, 1)).toBe(true)
  })

  it('남쪽 벽 — 법선이 방 안(북쪽)을 보고 감김도 같은 쪽이다', () => {
    const south = shellRoom(loadRoom('c01r0101'), []).parts.south!
    const n = south.geometry.getAttribute('normal')
    const p = south.geometry.getAttribute('position')
    let ok = 0, all = 0
    for (let i = 0; i + 2 < p.count; i += 3) {
      const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i)
      const e1 = [p.getX(i + 1) - ax, p.getY(i + 1) - ay, p.getZ(i + 1) - az]
      const e2 = [p.getX(i + 2) - ax, p.getY(i + 2) - ay, p.getZ(i + 2) - az]
      const wz = e1[0]! * e2[1]! - e1[1]! * e2[0]!
      if (Math.abs(wz) < 1e-6) continue
      all++
      if (wz < 0 && n.getZ(i) < 0) ok++
    }
    // 세로 면은 전부 북쪽(−z)을 본다
    expect(ok / all).toBeGreaterThan(0.95)
  })

  it('1인칭 천장 — 천장 없는 방(콘테스트 홀)은 바닥 전체에 판을 덮는다', () => {
    const root = loadRoom('c05r1101')
    const shell = shellRoom(root, [])
    const lid = shell.parts.lid
    expect(lid).not.toBeNull()
    lid!.geometry.computeBoundingBox()
    const b = lid!.geometry.boundingBox!
    expect(b.min.x).toBeLessThan(1.5)
    expect(b.max.x).toBeGreaterThan(30.5)
    expect(b.min.y).toBeGreaterThan(2.5)
    expect(shell.first).toContain(lid)
  })

  it('1인칭 천장 — 천장이 다 덮는 방(센터)에는 메움 판이 거의 없다', () => {
    const shell = shellRoom(loadRoom('t02pc0101'), [{ x: 8, z: 12 }])
    const n = shell.parts.lid ? shell.parts.lid.geometry.getAttribute('position').count / 6 : 0
    // 0.25칸 칸 수 — 바닥 11×15칸(2640칸)의 5% 아래
    expect(n).toBeLessThan(132)
  })

  it('남쪽 문간 — 문 칸 바닥 남쪽 너머에 바닥 · 천장 · 좌우 벽 · 어두운 끝을 세운다', () => {
    const shell = shellRoom(loadRoom('t02pc0101'), [{ x: 8, z: 12 }])
    const d = shell.parts.doorways
    expect(d).not.toBeNull()
    d!.geometry.computeBoundingBox()
    const b = d!.geometry.boundingBox!
    expect([b.min.x, b.max.x, b.min.z, b.max.z]).toEqual([8, 9, 13, 14])
    expect(b.max.y).toBeCloseTo(DOOR_OPEN)
    expect(shell.first).toContain(d)
  })

  it('바닥 구멍 — 센터 에스컬레이터 자리(x 14~16 · z 9.5~11.5)를 바닥으로 덮는다', () => {
    const shell = shellRoom(loadRoom('t02pc0101'), [])
    const p = shell.parts.patches
    expect(p).not.toBeNull()
    p!.geometry.computeBoundingBox()
    const b = p!.geometry.boundingBox!
    expect(b.min.x).toBeCloseTo(14, 1)
    expect(b.max.x).toBeCloseTo(16, 1)
    expect(b.min.z).toBeCloseTo(9.5, 1)
    expect(b.max.z).toBeCloseTo(11.5, 1)
    expect(matsOf(p!).every((m) => /_Floor_/.test(m.name))).toBe(true)
  })

  it('기둥 뚜껑 — 백화점 가운데 기둥 머리를 벽 재질로 덮고, 벽 꼭대기 띠는 둔다', () => {
    const shell = shellRoom(loadRoom('c07r0202'), [])
    const lids = shell.parts.lids
    expect(lids).not.toBeNull()
    expect(matsOf(lids!).every((m) => /_Wall_/.test(m.name))).toBe(true)
    // x · z 평면에 비춘 삼각형으로 덮임을 잰다
    const tris = trianglesOf(lids!).map((t) => t.map((q) => [q[0]!, q[2]!]))
    // 가운데 기둥(x 9~11.2 · z 6~10) 머리는 덮는다
    expect(wallCovers(tris, 10, 8)).toBe(true)
    // 방 둘레 벽 꼭대기 띠(서벽 x 0.5~1 · 동벽 x 21~21.5)는 부감 단면의 검은 선으로 둔다
    expect(wallCovers(tris, 0.75, 8)).toBe(false)
    expect(wallCovers(tris, 21.25, 8)).toBe(false)
    expect(trianglesOf(lids!).every((t) => t.every((q) => q[1]! > 2.9))).toBe(true)
    expect(shell.first).not.toContain(lids)
  })

  it('바닥 데칼 · 빛 줄기 · 연기 · 천장 재질', () => {
    const center = loadRoom('t02pc0101')
    const shell = shellRoom(center, [])
    const meshes: Mesh[] = []
    center.traverse((o) => { if (o instanceof Mesh) meshes.push(o) })
    const mark = meshes.find((o) => matsOf(o).some((m) => m.name === 'M_RO_005_Mark_01'))!
    const mm = matsOf(mark)[0]!
    expect([mm.polygonOffset, mm.polygonOffsetFactor, mm.polygonOffsetUnits]).toEqual([true, -2, -2])
    expect(mark.castShadow).toBe(false)
    expect(mark.renderOrder).toBe(1)
    for (const s of shell.shafts) {
      const m = matsOf(s as Mesh)[0]!
      expect(m.opacity).toBe(LIGHT_SHAFT)
      expect(m.depthWrite).toBe(false)
    }
    expect(shell.shafts.length).toBeGreaterThan(0)
    // 천장 재질은 천장 메시만 쓴다 — 바닥 · 벽에 빛이 번지지 않는다
    const ceilMats = new Set(meshes.filter((o) => matsOf(o).some(isCeiling)).flatMap(matsOf))
    for (const o of meshes) {
      if (matsOf(o).some(isCeiling)) continue
      for (const m of matsOf(o)) expect(ceilMats.has(m), m.name).toBe(false)
    }
    for (const m of ceilMats) {
      const s = m as MeshStandardMaterial
      expect(s.emissiveIntensity).toBe(CEIL_GLOW)
      expect(s.emissiveMap).toBe(s.map)
    }
    // 연기 — 연고 체육관 문 방
    const gym = loadRoom('c05gym0102')
    shellRoom(gym, [])
    let smoke: MeshStandardMaterial | null = null
    gym.traverse((o) => {
      if (o instanceof Mesh && matsOf(o).some(isSmoke)) {
        smoke = matsOf(o)[0] as MeshStandardMaterial
        expect(o.renderOrder).toBe(9)
        expect(o.castShadow).toBe(false)
      }
    })
    const sm = smoke as MeshStandardMaterial | null
    expect(sm).not.toBeNull()
    expect([sm!.transparent, sm!.depthWrite, sm!.opacity, sm!.side]).toEqual([true, false, SMOKE_OPACITY, DoubleSide])
    expect(sm!.alphaMap).toBe(sm!.map)
  })

  it('3인칭 — 바닥 남쪽 끝 너머 문빛 · 문턱은 숨길 목록에 든다', () => {
    const shell = shellRoom(loadRoom('t02fs0101'), [{ x: 3, z: 11 }])
    const names = shell.hanging.flatMap((o) => matsOf(o as Mesh).map((m) => m.name))
    expect(names).toContain('M_C_001_EntranceLight_01')
    expect(names).toContain('M_C_001_ComWall_09')
    // 방 바닥 · 벽은 안 든다
    expect(names.some((n) => /_Floor_|_Wall_/.test(n))).toBe(false)
  })

  it('남쪽 벽 — 북쪽 벽을 못 찾던 방들도 북벽 평면에서 세운다', () => {
    const none: string[] = []
    for (const name of SOUTH_WALL_ROOMS) {
      const root = loadRoom(name)
      const south = shellRoom(root, []).parts.south
      if (!south) { none.push(name); continue }
      south.geometry.computeBoundingBox()
      const b = south.geometry.boundingBox!
      // 높이가 사람 키를 넘는다
      if (b.max.y < 2) none.push(`${name} 높이 ${b.max.y.toFixed(2)}`)
    }
    expect(none).toEqual([])
  })

  it('1인칭 천장 — `_Ceil_`이 없는 방은 다 메움 판이 선다', () => {
    const none: string[] = []
    for (const name of LIDLESS_ROOMS) {
      const root = loadRoom(name)
      const shell = shellRoom(root, [])
      const lid = shell.parts.lid
      if (!lid) { none.push(name); continue }
      expect(shell.first).toContain(lid)
      // 판은 그 방에서 가장 높은 바닥보다 위다 — 단 위에 선 사람 머리를 안 자른다
      lid.geometry.computeBoundingBox()
      let floorTop = 0
      root.traverse((o) => {
        if (!(o instanceof Mesh) || !matsOf(o).some((m) => /_Floor_/.test(m.name))) return
        const n = o.geometry.getAttribute('normal'), p = o.geometry.getAttribute('position')
        for (let i = 0; i < p.count; i++) if (n.getY(i) > 0.7) floorTop = Math.max(floorTop, p.getY(i))
      })
      if (lid.geometry.boundingBox!.min.y < Math.min(floorTop + 1.5, 2.5)) none.push(`${name} 높이 ${lid.geometry.boundingBox!.min.y.toFixed(2)}`)
    }
    expect(none).toEqual([])
  })

  it('사천왕 방문 — 닫힌 채 한 조각으로 구운 두 문짝을 (8, 2) · (8, 12) 둘로 가른다', () => {
    const root = loadRoom('c10r0103')
    const doors = splitEliteFourDoors(root, 'c10r0103')
    expect(doors.map((d) => [d.x, d.z]).sort((a, b) => a[1]! - b[1]!)).toEqual([[8, 2], [8, 12]])
    // 원래 조각은 빠지고 두 조각만 남는다 — 정점 88개가 반씩
    const inner: Mesh[] = []
    root.traverse((o) => { if (o instanceof Mesh && matsOf(o).some((m) => /_DoorInner_/.test(m.name))) inner.push(o) })
    expect(inner).toHaveLength(2)
    expect(inner.map((m) => m.geometry.getAttribute('position').count).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
    // 다른 방은 안 건드린다
    expect(splitEliteFourDoors(loadRoom('c01r0101'), 'c01r0101')).toEqual([])
  })
})
