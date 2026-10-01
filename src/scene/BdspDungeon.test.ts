import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Box3, BufferAttribute, BufferGeometry, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, Texture,
  Vector3,
} from 'three'
import { world, type MapHeader } from '../engine/map/world'
import type { MatrixMeta } from '../engine/map/grid'
import { roomFor } from './BdspRoom'
import {
  coverKind, dressDungeon, DUNGEON_LIFT, dungeonCover, dungeonOrigin, imageUris, isCeiling, isDecal, isLightShaft, openAir, paintFills,
} from './BdspDungeon'
import { dungeonBundles, roomBundles, textureKey } from '../import/bdsp/convert'
import { writeGlb } from '../import/bdsp/glb'
import { DATA, withData, withModels } from '../data/romData.testkit'

const was = world.maps
afterEach(() => { world.maps = was })

const header = (id: number, name: string, matrix: number): MapHeader => ({ id, name, matrix } as unknown as MapHeader)

describe('BDSP 던전 (docs/orders/VISUAL_20260930.md §1)', () => {
  it('던전 번들은 `prefab_map` 바로 아래의 `d…`다 — 방 목록과 겹치지 않는다', () => {
    const paths = [
      'Environments/prefab_map/d27r0101', 'Environments/prefab_map/D03R0101',
      'Environments/prefab_map/c01r0101', 'Environments/prefab_map/d27r0101/x',
    ]
    expect(dungeonBundles(paths)).toEqual(['d03r0101', 'd27r0101'])
    expect(roomBundles(paths)).toEqual(['c01r0101'])
  })

  it('호수 입구는 제 이름의 던전을 쓴다 — 방과 같은 짝짓기다', () => {
    world.maps = [header(0, 'D27R0101', 101), header(1, 'D27R0102', 102)]
    expect(roomFor(0, new Set(['d27r0101', 'd27r0102']))).toBe('d27r0101')
  })

  it('그림 이름은 픽셀과 크기로 정해진다 — 같은 픽셀은 한 장, 모양이 다르면 다른 장', async () => {
    const px = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    expect(await textureKey(px, 2, 1)).toBe(await textureKey(px.slice(), 2, 1))
    expect(await textureKey(px, 2, 1)).not.toBe(await textureKey(px, 1, 2))
    expect(await textureKey(px, 2, 1)).toMatch(/^[0-9a-f]{20}$/)
  })

  it('glb가 가리키는 바깥 그림 주소를 읽는다 — 풀기 전에 설치본 주소로 잇는 자리다', () => {
    const glb = writeGlb({
      asset: { version: '2.0' },
      images: [{ uri: 'tex/aa.png' }, { bufferView: 0, mimeType: 'image/png' }, { uri: 'tex/bb.png' }],
    } as never, new Uint8Array(4))
    expect(imageUris(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer))
      .toEqual(['tex/aa.png', 'tex/bb.png'])
  })

  it('하늘은 원작 배틀 배경이 풀밭 ~ 눈인 던전에만 선다 — 호숫가 · 숲은 트이고 동굴 · 실내는 닫힌다', () => {
    expect(openAir({ battleBg: 3 })).toBe(true) // 호수 입구 · 영원의 숲
    expect(openAir({ battleBg: 5 })).toBe(true) // 예지호수
    expect(openAir({ battleBg: 9 })).toBe(false) // 동굴
    expect(openAir({ battleBg: 7 })).toBe(false) // 실내
    expect(openAir(null)).toBe(false)
  })
})

describe('BDSP 던전 — 재질 갈래', () => {
  const m = (name: string): MeshStandardMaterial => new MeshStandardMaterial({ name })

  it('천장은 `_Ceil_`이다 — 양옥집 · 배틀타워 로비. 천장 등은 아니다', () => {
    expect(isCeiling(m('M_D_053_Ceil_01_C'))).toBe(true) // d25r0102 (I-p05-1)
    expect(isCeiling(m('M_RO_018_Ceil_01'))).toBe(true) // d31r0201 (I-p18-0)
    expect(isCeiling(m('M_C_001_CeilLight_01'))).toBe(false)
    expect(isCeiling(m('M_D_028_Wall_01'))).toBe(false)
  })

  it('바닥 무늬는 잔디 이음 · 매트 · 마크다', () => {
    expect(isDecal(m('M_C_001_GrassSeam_01'))).toBe(true) // d31 (I-p18-10)
    expect(isDecal(m('M_C_001_Mat_01'))).toBe(true) // d31r0201 (I-p18-15)
    expect(isDecal(m('M_D_048_Mark_01'))).toBe(true)
    expect(isDecal(m('M_C_001_Ground_01_05'))).toBe(false)
    expect(isDecal(m('M_C_001_Mat_01_b'))).toBe(false)
  })

  it('빛줄기는 창빛 · 스포트라이트 · 입구 빛이다 — 포켓몬센터 빛 웅덩이(`PokeCenLight`)는 굽는 쪽이 적어 준다', () => {
    expect(isLightShaft(m('M_D_011_SpotLight_01'))).toBe(true)
    expect(isLightShaft(m('M_D_025_WindowLight_01'))).toBe(true)
    expect(isLightShaft(m('M_C_001_EntranceLight_01'))).toBe(true)
    expect(isLightShaft(m('M_C_001_PokeCenLight_01'))).toBe(false)
    expect(isLightShaft(m('M_D_053_CeilLight_03'))).toBe(false)
  })
})

/** 이름 붙은 판 하나 — `PlaneGeometry`를 눕혀 높이 `y`에 */
function slab(name: string, w: number, d: number, y: number, at = new Vector3()): Mesh {
  const g = new PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(at.x, y, at.z)
  return new Mesh(g, new MeshStandardMaterial({ name, alphaTest: 0.5 }))
}

describe('BDSP 던전 — 깃발 (`dressDungeon`)', () => {
  it('천장은 그림자를 안 드리우고 1인칭 목록으로 간다 · 바위는 드리운다', () => {
    const root = new Group()
    const ceil = slab('M_D_053_Ceil_01_C', 10, 10, 3.1)
    const rock = new Mesh(new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(1, 2, 0), new Vector3(0, 2, 1)]),
      new MeshStandardMaterial({ name: 'M_C_001_Rock_05', alphaTest: 0.5 }))
    root.add(ceil, rock)
    expect(dressDungeon(root)).toEqual([ceil])
    expect(ceil.castShadow).toBe(false)
    expect(rock.castShadow).toBe(true)
  })

  it('바닥 무늬는 깊이를 당기고 그림자를 안 주고받는다 — 바닥 위에 그린다', () => {
    const root = new Group()
    const mat = slab('M_C_001_Mat_01', 1.6, 1, 0)
    root.add(mat)
    dressDungeon(root)
    const paint = mat.material as MeshStandardMaterial
    expect([paint.polygonOffset, paint.polygonOffsetFactor, paint.polygonOffsetUnits]).toEqual([true, -1, -1])
    expect([mat.castShadow, mat.receiveShadow, mat.renderOrder]).toEqual([false, false, 1])
  })

  it('빛줄기는 더하는 빛이다 — 흐림이 가리는 것으로 안 센다', () => {
    const root = new Group()
    const shaft = slab('M_D_011_SpotLight_01', 2, 2, 1)
    root.add(shaft)
    dressDungeon(root)
    const paint = shaft.material as MeshStandardMaterial
    expect(paint.userData.add).toBe(true)
    expect([paint.transparent, paint.depthWrite, paint.opacity]).toEqual([true, false, 0.35])
    expect([shaft.castShadow, shaft.receiveShadow]).toEqual([false, false])
  })

  it('평평한 컷아웃 판은 그림자를 안 드리운다 — 받기는 한다', () => {
    const root = new Group()
    const ground = slab('M_C_001_Ground_01_05', 8, 8, 0)
    root.add(ground)
    dressDungeon(root)
    expect([ground.castShadow, ground.receiveShadow]).toEqual([false, true])
  })
})

describe('BDSP 던전 — 1인칭 덮개 (`dungeonCover`)', () => {
  it('하늘이 안 서는 던전만 덮는다 — 굴(9~11) · 실내(6~8)', () => {
    expect(coverKind({ battleBg: 11 })).toBe('cave') // 미혹의 동굴 d21r0101
    expect(coverKind({ battleBg: 10 })).toBe('cave') // 챔피언로드 · 천관산
    expect(coverKind({ battleBg: 8 })).toBe('indoor') // 숲의 양옥집
    expect(coverKind({ battleBg: 6 })).toBe('indoor')
    expect(coverKind({ battleBg: 3 })).toBeNull()
    expect(coverKind(null)).toBeNull()
  })

  /** 벽 하나(북쪽) · 바닥 하나 · 천장 하나인 실내 — 양옥집 2층(`d25r0102`)의 결을 흉내 낸다 */
  function room(withCeiling: boolean): Group {
    const root = new Group()
    root.add(slab('M_D_028_Floor_01', 10, 6, 0, new Vector3(5, 0, 5)))
    // 북쪽 벽 z 2 · x 0~10 · y 0~3, UV는 (0.25 x, 0.75 − 0.25 y)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 2, 10, 0, 2, 10, 3, 2, 0, 0, 2, 10, 3, 2, 0, 3, 2]), 3))
    g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0.75, 2.5, 0.75, 2.5, 0, 0, 0.75, 2.5, 0, 0, 0]), 2))
    root.add(new Mesh(g, new MeshStandardMaterial({ name: 'M_D_028_Wall_01' })))
    if (withCeiling) root.add(slab('M_D_053_Ceil_01_C', 10, 6, 3.1, new Vector3(5, 0, 5)))
    return root
  }

  it('실내 — 둘레 띠는 지형 상자 밖에 BDSP 천장 높이까지 서고, 처음엔 숨어 있다', () => {
    const [band, lid] = dungeonCover(room(true), 'indoor')
    const box = new Box3().setFromObject(band!)
    expect(box.min.x).toBeCloseTo(-0.1, 5)
    expect(box.max.x).toBeCloseTo(10.1, 5)
    expect(box.min.z).toBeCloseTo(1.9, 5)
    expect(box.max.z).toBeCloseTo(8.1, 5)
    expect(box.min.y).toBeCloseTo(-0.5, 5)
    expect(box.max.y).toBeCloseTo(3.12, 5)
    expect(new Box3().setFromObject(lid!).min.y).toBeCloseTo(3.12, 5)
    for (const m of [band!, lid!]) {
      expect(m.visible).toBe(false)
      expect([m.castShadow, m.receiveShadow]).toEqual([false, false])
      expect((m.material as MeshStandardMaterial).side).toBe(DoubleSide)
    }
  })

  it('띠의 UV는 그 벽이 깔린 결을 따른다 — 바닥 높이에서 굽도리가 맞는다', () => {
    const [band] = dungeonCover(room(true), 'indoor')
    const pos = band!.geometry.getAttribute('position'), uv = band!.geometry.getAttribute('uv')
    for (let i = 0; i < pos.count; i++) expect(uv.getY(i)).toBeCloseTo(0.75 - 0.25 * pos.getY(i), 5)
    expect((band!.material as MeshStandardMaterial).name).toBe('M_D_028_Wall_01 덮개')
  })

  it('BDSP 천장이 없는 실내는 벽 꼭대기 바로 위를 덮는다', () => {
    const [, lid] = dungeonCover(room(false), 'indoor')
    expect(new Box3().setFromObject(lid!).min.y).toBeCloseTo(3.02, 5)
  })

  it('굴 — 천장은 지형 꼭대기에서 2.5칸 위다 (미혹의 동굴 꼭대기 y 2.2 · 눈 BDHC 1 + 1.38)', () => {
    const root = new Group()
    root.add(slab('M_C_001_Ground_05_01', 40, 30, 0, new Vector3(20, 0, 15)))
    root.add(slab('M_C_001_Ground_05_01', 4, 4, 2.2, new Vector3(5, 0, 5)))
    const [band, lid] = dungeonCover(root, 'cave')
    expect(new Box3().setFromObject(band!).max.y).toBeCloseTo(4.7, 5)
    expect(new Box3().setFromObject(lid!).min.y).toBeCloseTo(4.7, 5)
    // 바닥 흙을 어둡게 — 재질이 흰색이면 0.45
    expect((lid!.material as MeshStandardMaterial).color.r).toBeCloseTo(0.45, 5)
  })

  it('지형이 없으면 아무것도 안 세운다', () => {
    const root = new Group()
    root.add(slab('M_C_001_Tree_05', 4, 4, 0))
    expect(dungeonCover(root, 'cave')).toEqual([])
  })
})

describe('BDSP 던전 — 메움 면 (`paintFills` · I-p14-5 · I-p13-1)', () => {
  /** 같은 그림을 쓰는 바닥(칸당 UV 0.157)과 뚜껑(UV가 한 점) — 동굴 `Ground_05_01` · `Ground_05_02`의 결이다 */
  function cave(): { root: Group, floor: Mesh, cap: Mesh } {
    const root = new Group()
    const map = new Texture()
    const floor = slab('M_C_001_Ground_05_01', 10, 10, 0, new Vector3(5, 0, 5))
    const fu = floor.geometry.getAttribute('uv')
    const fp = floor.geometry.getAttribute('position')
    for (let i = 0; i < fu.count; i++) fu.setXY(i, fp.getX(i) * 0.157, fp.getZ(i) * 0.157)
    ;(floor.material as MeshStandardMaterial).map = map
    const cap = slab('M_C_001_Ground_05_02', 6, 6, 10, new Vector3(20, 0, 5))
    const cu = cap.geometry.getAttribute('uv')
    for (let i = 0; i < cu.count; i++) cu.setXY(i, 0.5 + i * 0.001, 0.5)
    ;(cap.material as MeshStandardMaterial).map = map
    root.add(floor, cap)
    return { root, floor, cap }
  }

  it('한 점으로 뭉친 뚜껑을 떼어 바닥의 촘촘함으로 다시 펴고, 뚜껑으로 적는다', () => {
    const { root, cap } = cave()
    const made = paintFills(root)
    expect(made).toHaveLength(1)
    const fill = made[0]!
    expect(fill.userData.cap).toBe(true)
    expect(fill.material).toBe(cap.material)
    // 원래 메시는 다 떼어져 숨는다
    expect(cap.geometry.getIndex()!.count).toBe(0)
    expect(cap.visible).toBe(false)
    // UV가 x · z에 0.157을 곱한 것이다
    const pos = fill.geometry.getAttribute('position'), uv = fill.geometry.getAttribute('uv')
    for (let i = 0; i < pos.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(pos.getX(i) * 0.157, 4)
      expect(uv.getY(i)).toBeCloseTo(pos.getZ(i) * 0.157, 4)
    }
  })

  it('무늬가 제대로 깔린 바닥은 안 건드린다', () => {
    const { root, floor } = cave()
    const before = floor.geometry.getIndex()?.count ?? floor.geometry.getAttribute('position').count
    paintFills(root)
    expect(floor.geometry.getIndex()?.count ?? floor.geometry.getAttribute('position').count).toBe(before)
    expect(floor.visible).toBe(true)
  })

  it('촘촘한 작은 조각 하나가 기준이 되지 않는다 — 넓이로 가운데 값이다 (미혹의 동굴 `Ground_05_01` 열두 삼각형 · 칸당 1.67)', () => {
    const { root, floor } = cave()
    const chip = slab('M_C_001_Ground_05_01', 1, 1, 0, new Vector3(30, 0, 30))
    const u = chip.geometry.getAttribute('uv')
    const p = chip.geometry.getAttribute('position')
    for (let i = 0; i < u.count; i++) u.setXY(i, p.getX(i) * 1.67, p.getZ(i) * 1.67)
    ;(chip.material as MeshStandardMaterial).map = (floor.material as MeshStandardMaterial).map
    root.add(chip)
    const made = paintFills(root)
    // 뚜껑만 떼어진다 — 바닥(칸당 0.157)은 그대로다
    expect(made.map((m) => m.name)).toEqual([' 메움 y10'])
    expect(floor.visible).toBe(true)
    expect(floor.geometry.getIndex()!.count).toBe(6)
  })

  it('같은 그림을 쓰는 더 촘촘한 재질이 없으면 성겨도 제 모습이다 — 넓은 바깥 땅', () => {
    const { root, floor } = cave()
    root.remove(floor)
    expect(paintFills(root)).toEqual([])
  })
})

describe('BDSP 던전 — 자리 (`dungeonOrigin`)', () => {
  const meta = (zones: number[]): Pick<MatrixMeta, 'id' | 'width' | 'tileWidth' | 'chunks'> => ({
    id: 240, width: 2, tileWidth: 64,
    chunks: zones.map((zone, i) => ({ i, mx: i % 2, my: Math.floor(i / 2), land: 0, zone })),
  })

  it('맵 표가 없는 행렬은 원점이다', () => {
    world.maps = [header(0, 'D21R0101', 240)]
    expect(dungeonOrigin('d21r0101', meta([-1, -1]))).toEqual({ x: 0, z: 0 })
  })

  it('행렬을 나눠 쓰면 그 glb 이름의 맵 청크다', () => {
    world.maps = [header(0, 'D06R0201', 240), header(1, 'D06R0202', 240)]
    expect(dungeonOrigin('d06r0202', meta([0, 0, 0, 1]))).toEqual({ x: 32, z: 32 })
  })

  it('다른 행렬이면 원점이다 — 그 행렬의 청크가 아니다', () => {
    world.maps = [header(1, 'D06R0202', 999)]
    expect(dungeonOrigin('d06r0202', meta([0, 1]))).toEqual({ x: 0, z: 0 })
  })
})

const read = (rel: string): unknown => JSON.parse(readFileSync(resolve(DATA, rel), 'utf8'))
const MODELS = resolve(DATA, '../models')

withData('maps.json', 'matrices/interiors.json')('BDSP 던전 — 대습초원 여섯이 발밑에 선다 (I-p11-0)', () => {
  withModels('dungeon/index.json')('실제 행렬 240', () => {
    it('504~509의 원작 정류장 소품이 그 glb 상자 안에 든다 — 청크 원점을 더하면', () => {
      const maps = (read('maps.json') as { maps: MapHeader[] }).maps
      const matrix = (read('matrices/interiors.json') as { matrices: Record<string, MatrixMeta> }).matrices['240']!
      const boxes = new Map((JSON.parse(readFileSync(resolve(MODELS, 'dungeon/index.json'), 'utf8')) as
        { dungeons: { name: string, box: [number, number, number, number] }[] }).dungeons.map((d) => [d.name, d.box]))
      world.maps = maps
      const want: Record<number, [number, number]> = { 504: [32, 32], 505: [64, 32], 506: [32, 64], 507: [64, 64], 508: [32, 96], 509: [64, 96] }
      for (const [id, [x, z]] of Object.entries(want)) {
        const map = maps[Number(id)]!
        const name = map.name.toLowerCase()
        const o = dungeonOrigin(name, matrix)
        expect(o, name).toEqual({ x, z })
        // 그 맵 청크의 정류장(모델 473)이 glb 상자 [x0, z0, x1, z1] 안이다
        const chunk = matrix.chunks.find((c) => c.zone === map.id)!
        const station = matrix.buildings[String(chunk.i)]!.find((b) => b.model === 473)!
        const [x0, z0, x1, z1] = boxes.get(name)!
        expect(station.x - o.x, name).toBeGreaterThanOrEqual(x0)
        expect(station.x - o.x, name).toBeLessThanOrEqual(x1)
        expect(station.z - o.z, name).toBeGreaterThanOrEqual(z0)
        expect(station.z - o.z, name).toBeLessThanOrEqual(z1)
      }
    })
  })
})

// ── 높이 맞춤 실측 ────────────────────────────────────────────────────────────────────────────────────────

/** glb 안 위 보는 삼각형(월드) — 노드 행렬 · 인스턴스를 다 먹인다. 물 · 풀 · 그늘 · 빛은 뺀다 */
function upFaces(path: string): Float32Array[] {
  const buf = readFileSync(path)
  const jsonLength = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8')) as {
    nodes: { mesh?: number, matrix?: number[], translation?: number[], rotation?: number[], scale?: number[], children?: number[],
      extensions?: { EXT_mesh_gpu_instancing?: { attributes: Record<string, number> } } }[]
    meshes: { primitives: { attributes: Record<string, number>, indices?: number, material: number }[] }[]
    materials: { name: string }[]
    accessors: { bufferView: number, byteOffset?: number, count: number, type: string, componentType: number }[]
    bufferViews: { byteOffset?: number, byteStride?: number }[]
    scenes: { nodes: number[] }[]
  }
  const bin = buf.subarray(20 + jsonLength + 8)
  const acc = (i: number): number[][] => {
    const a = json.accessors[i]!, view = json.bufferViews[a.bufferView]!
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]!
    const bytes = a.componentType === 5126 || a.componentType === 5125 ? 4 : 2
    const stride = view.byteStride ?? size * bytes
    const out: number[][] = []
    for (let k = 0; k < a.count; k++) {
      const row: number[] = []
      for (let c = 0; c < size; c++) {
        const at = (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + k * stride + c * bytes
        row.push(a.componentType === 5126 ? bin.readFloatLE(at) : a.componentType === 5125 ? bin.readUInt32LE(at) : bin.readUInt16LE(at))
      }
      out.push(row)
    }
    return out
  }
  const trs = (t?: number[], r?: number[], s?: number[]): Matrix4 => new Matrix4().compose(
    new Vector3(...(t ?? [0, 0, 0])), new Quaternion(...(r ?? [0, 0, 0, 1])), new Vector3(...(s ?? [1, 1, 1])))
  const out: Float32Array[] = []
  const skip = /RootShadow|Light|Grass|Flower|Tree|Water|Sea|Puddle|Fog|Shadow/
  const walk = (i: number, parent: Matrix4): void => {
    const n = json.nodes[i]!
    const w = parent.clone().multiply(n.matrix ? new Matrix4().fromArray(n.matrix) : trs(n.translation, n.rotation, n.scale))
    if (n.mesh !== undefined) {
      const inst = n.extensions?.EXT_mesh_gpu_instancing?.attributes
      let mats = [w]
      if (inst) {
        const t = inst.TRANSLATION === undefined ? null : acc(inst.TRANSLATION)
        const r = inst.ROTATION === undefined ? null : acc(inst.ROTATION)
        const s = inst.SCALE === undefined ? null : acc(inst.SCALE)
        mats = (t ?? r ?? s ?? []).map((_, k) => w.clone().multiply(trs(t?.[k], r?.[k], s?.[k])))
      }
      for (const p of json.meshes[n.mesh]!.primitives) {
        if (skip.test(json.materials[p.material]!.name)) continue
        const pos = acc(p.attributes.POSITION!)
        const ind = p.indices === undefined ? pos.map((_, k) => k) : acc(p.indices).map((r) => r[0]!)
        for (const m of mats) {
          const v = pos.map((q) => new Vector3(q[0], q[1], q[2]).applyMatrix4(m))
          for (let t = 0; t + 2 < ind.length; t += 3) {
            const a = v[ind[t]!]!, b = v[ind[t + 1]!]!, c = v[ind[t + 2]!]!
            const ny = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize().y
            if (Math.abs(ny) >= 0.5) out.push(Float32Array.of(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z))
          }
        }
      }
    }
    for (const c of n.children ?? []) walk(c, w)
  }
  for (const r of json.scenes[0]!.nodes) walk(r, new Matrix4())
  return out
}

/** 지나갈 수 있는 칸 한가운데마다 (glb 바닥 − BDHC)를 0.25 단위로 센다 — 가장 많은 차와 그 몫 */
function liftOf(name: string): { diff: number, share: number, n: number } {
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const map = maps.find((m) => m.name.toLowerCase() === name)!
  const meta = (read('matrices/interiors.json') as { matrices: Record<string, MatrixMeta & { byteOffset: number }> }).matrices[String(map.matrix)]!
  const tiles = readFileSync(resolve(DATA, 'matrices/interiors.bin'))
  const bdhc = read('bdhc.json') as { plateCount: number, fixedPerTile: number, planes: number[][], chunks: [number, number][] }
  const bb = readFileSync(resolve(DATA, 'bdhc.bin'))
  const heights = (land: number, x: number, z: number): number[] => {
    const span = bdhc.chunks[land]
    if (!span) return []
    const out: number[] = []
    for (let i = 0; i < span[1]; i++) {
      const o = (span[0] + i) * 16, s = bdhc.fixedPerTile
      const ax = bb.readInt32LE(o) / s, az = bb.readInt32LE(o + 4) / s, bx = bb.readInt32LE(o + 8) / s, bz = bb.readInt32LE(o + 12) / s
      if (x < Math.min(ax, bx) || x > Math.max(ax, bx) || z < Math.min(az, bz) || z > Math.max(az, bz)) continue
      const p = bdhc.planes[bb.readUInt16LE(bdhc.plateCount * 16 + (span[0] + i) * 2)]!
      if (p[1] !== 0) out.push(-(p[0]! * x + p[2]! * z + p[3]!) / p[1]!)
    }
    return out
  }
  const faces = upFaces(resolve(MODELS, `dungeon/${name}.glb`))
  const cells = new Map<string, Float32Array[]>()
  for (const f of faces) {
    for (let x = Math.floor(Math.min(f[0]!, f[3]!, f[6]!)); x <= Math.floor(Math.max(f[0]!, f[3]!, f[6]!)); x++) {
      for (let z = Math.floor(Math.min(f[2]!, f[5]!, f[8]!)); z <= Math.floor(Math.max(f[2]!, f[5]!, f[8]!)); z++) {
        const k = `${x},${z}`
        const list = cells.get(k)
        if (list) list.push(f)
        else cells.set(k, [f])
      }
    }
  }
  const glbAt = (x: number, z: number): number[] => (cells.get(`${Math.floor(x)},${Math.floor(z)}`) ?? []).flatMap((f) => {
    const d = (f[5]! - f[8]!) * (f[0]! - f[6]!) + (f[6]! - f[3]!) * (f[2]! - f[8]!)
    if (Math.abs(d) < 1e-12) return []
    const l1 = ((f[5]! - f[8]!) * (x - f[6]!) + (f[6]! - f[3]!) * (z - f[8]!)) / d
    const l2 = ((f[8]! - f[2]!) * (x - f[6]!) + (f[0]! - f[6]!) * (z - f[8]!)) / d
    const l3 = 1 - l1 - l2
    return l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6 ? [] : [l1 * f[1]! + l2 * f[4]! + l3 * f[7]!]
  })
  const votes = new Map<number, number>()
  let n = 0
  for (const c of meta.chunks) {
    if (c.zone >= 0 && c.zone !== map.id) continue
    for (let z = 0; z < 32; z++) {
      for (let x = 0; x < 32; x++) {
        const wx = c.mx * 32 + x, wz = c.my * 32 + z
        if (tiles.readUInt16LE(meta.byteOffset + (wz * meta.tileWidth + wx) * 2) & 0x8000) continue
        const rom = heights(c.land, x + 0.5, z + 0.5)
        if (rom.length !== 1) continue
        const glb = glbAt(wx + 0.5, wz + 0.5)
        if (glb.length === 0) continue
        const near = glb.reduce((p, q) => (Math.abs(q - rom[0]!) < Math.abs(p - rom[0]!) ? q : p))
        const d = Math.round((near - rom[0]!) * 4) / 4
        votes.set(d, (votes.get(d) ?? 0) + 1)
        n++
      }
    }
  }
  const [diff, count] = [...votes].sort((a, b) => b[1] - a[1])[0]!
  return { diff, share: count / n, n }
}

withData('maps.json', 'matrices/interiors.json', 'matrices/interiors.bin', 'bdhc.json', 'bdhc.bin')('BDSP 던전 — 높이 맞춤 (I-p15-4)', () => {
  const lifted = Object.keys(DUNGEON_LIFT)
  withModels(...lifted.map((n) => `dungeon/${n}.glb`), 'dungeon/d25r0102.glb', 'dungeon/d05r0104.glb')('glb 바닥 ↔ BDHC', () => {
    it.each(lifted)('%s는 glb 바닥이 BDHC보다 통째로 어긋나 있고 표가 그만큼 든다', (name) => {
      const { diff, share } = liftOf(name)
      expect(diff).toBe(-DUNGEON_LIFT[name]!)
      expect(share).toBeGreaterThan(0.85)
    })

    it.each(['d25r0102', 'd05r0104'])('%s는 어긋나지 않는다 — 표에 없다', (name) => {
      expect(liftOf(name).diff).toBe(0)
      expect(DUNGEON_LIFT[name]).toBeUndefined()
    })
  })
})
