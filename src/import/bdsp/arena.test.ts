// 방 · 무대 굽기 — 재질 색 · 층 그림 · TV 칸 (`arena.ts`)
//
// ⚠️ **굽는 쪽이 둘이다.** 개발 산출물(`public/models/room` · `arena`)은 노드 쪽 `tools/extract/bdspArena.py`가 굽고 설치본은 여기가
// 굽는다. 두 쪽의 대조는 `tools/spike/glbDiff.py`(기하 · 그림 픽셀)로 하고, 여기서는 이 쪽이 원작 값을 제대로 싣는지만 못 박는다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cascadeExtras, exportArena, flipbookCell, plainFactor, texturePid } from './arena'
import { openEnvironment } from './environment'
import { decodePng, encodePng } from '../platinum/png'
import { bdspDir, withLocal } from '../../data/romData.testkit'

describe('플립북 첫 칸 (`flipbookCell`)', () => {
  it('TV 화면 8×8의 45번은 아래 줄부터 세어 위에서 셋째 줄 · 여섯째 칸이다', () => {
    // 그림에 찬 칸은 위에서부터 42칸이다 — 위에서 세면 45번은 빈 검은 칸(여섯째 줄 여섯째 칸)이다
    expect(flipbookCell(8, 8, 45)).toEqual({ offset: [0.625, 0.25], scale: [0.125, 0.125] })
  })
  it('0번은 왼쪽 아래 칸이다 (glTF UV는 위가 0)', () => {
    expect(flipbookCell(8, 8, 0)).toEqual({ offset: [0, 0.875], scale: [0.125, 0.125] })
  })
  it('칸 수를 넘는 번호는 돌아 든다', () => {
    expect(flipbookCell(8, 8, 64 + 45)).toEqual(flipbookCell(8, 8, 45))
  })
  it('한 칸짜리(`M_RO_005_Video_01` 1×1)와 칸 값이 없는 재질은 자르지 않는다', () => {
    expect(flipbookCell(1, 1, 0)).toBeNull()
    expect(flipbookCell(0, 0, 0)).toBeNull()
  })
})

interface Material {
  name: string
  alphaMode?: string
  pbrMetallicRoughness: { baseColorFactor?: number[], baseColorTexture?: { index: number, extensions?: Record<string, unknown> } }
}

/** glb의 JSON 덩이 */
function gltfOf(glb: Uint8Array): { materials: Material[], extensionsUsed?: string[] } {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  const size = view.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + size))) as { materials: Material[], extensionsUsed?: string[] }
}

const ENV = bdspDir('environments')
const ARENAS = bdspDir('arenas')
const room = (name: string): string | null => (ENV ? join(ENV, 'prefab_map', name) : null)

async function bakeRoom(name: string): Promise<Map<string, Material> & { extensionsUsed?: string[] }> {
  const env = openEnvironment([new Uint8Array(readFileSync(room(name)!))])
  // 그림 크기는 재질 값과 상관없다 — 시험은 작게 굽는다
  const { glb, stat } = await exportArena(env, encodePng, { name, maxSize: 32 })
  expect(stat.problems).toEqual([])
  const g = gltfOf(glb)
  const out = new Map(g.materials.map((m) => [m.name, m])) as Map<string, Material> & { extensionsUsed?: string[] }
  out.extensionsUsed = g.extensionsUsed
  return out
}

withLocal('BDSP 방', room('c02r0101'), room('c05r1101'), room('t01r0101'), room('c08gym0101'))('방 재질 (원본 번들)', () => {
  it('뿌리 그림자는 `_Color` × 세기 · 알파를 싣는다 — 흰 후광이 아니다', async () => {
    const mats = await bakeRoom('c02r0101')
    const shadow = mats.get('M_C_001_RootShadow_01')!
    expect(shadow.alphaMode).toBe('BLEND')
    expect(shadow.pbrMetallicRoughness.baseColorTexture).toBeDefined()
    // (0.113, 0.102, 0.102) 감마 → 선형 × 0.5, 알파 0.325 — 야외 `area010`과 같은 값
    const f = shadow.pbrMetallicRoughness.baseColorFactor!
    expect(f[0]).toBeCloseTo(0.0061, 4)
    expect(f[1]).toBeCloseTo(0.0052, 4)
    expect(f[2]).toBeCloseTo(0.0052, 4)
    expect(f[3]).toBeCloseTo(0.3255, 3)
  }, 120_000)

  it('더하는 빛 재질(창빛 · 문빛)에는 색을 안 곱한다 — 실행 쪽이 더하기로 편다', async () => {
    const mats = await bakeRoom('c02r0101')
    const lights = [...mats.values()].filter((m) => /WindowLight|EntranceLight/.test(m.name) && m.pbrMetallicRoughness.baseColorTexture)
    expect(lights.length).toBeGreaterThan(0)
    for (const m of lights) expect(m.pbrMetallicRoughness.baseColorFactor, m.name).toBeUndefined()
  }, 120_000)

  it('층 그림 굽도리 벽은 `_LayerTex` × `_LayerColor`로 선다 — 검은 판이 아니다', async () => {
    const mats = await bakeRoom('c05r1101')
    const wall = mats.get('M_C_001_ComWall_06')!
    expect(wall.pbrMetallicRoughness.baseColorTexture).toBeDefined()
    // `_LayerColor` (0.906, 0.645, 0.787) 감마 → 선형
    const f = wall.pbrMetallicRoughness.baseColorFactor!
    expect(f[0]).toBeCloseTo(0.7987, 3)
    expect(f[1]).toBeCloseTo(0.3737, 3)
    expect(f[2]).toBeCloseTo(0.5824, 3)
    expect(mats.get('M_C_001_ComWall_09')!.pbrMetallicRoughness.baseColorTexture).toBeDefined()
  }, 120_000)

  it('물가 체육관의 `…_02` 바닥 · 벽에 그림이 붙는다 — 흰 판이 아니다', async () => {
    const mats = await bakeRoom('c08gym0101')
    expect(mats.get('M_RO_116_Floor_01_1F_02')!.pbrMetallicRoughness.baseColorTexture).toBeDefined()
    expect(mats.get('M_RO_116_Wall_01_1F_02')!.pbrMetallicRoughness.baseColorTexture).toBeDefined()
  }, 120_000)

  it('TV 화면은 아틀라스의 한 칸만 비친다 (`KHR_texture_transform`)', async () => {
    const mats = await bakeRoom('t01r0101')
    const tv = mats.get('M_C_001_Video_03')!
    expect(tv.pbrMetallicRoughness.baseColorTexture!.extensions).toEqual({
      KHR_texture_transform: { offset: [0.625, 0.25], scale: [0.125, 0.125] },
    })
    // 적어 두지 않으면 로더가 변환을 안 읽는다
    expect(mats.extensionsUsed).toEqual(['KHR_texture_transform'])
  }, 120_000)
})

const g027 = ARENAS ? join(ARENAS, 'ground', 'g027') : null
withLocal('BDSP 무대 g027', g027)('물 체육관 무대 (원본 번들)', () => {
  interface Full {
    materials: (Material & { extras?: Record<string, unknown>, occlusionTexture?: Record<string, number>, emissiveTexture?: { index: number }, emissiveFactor?: number[] })[]
    nodes: { name: string, mesh?: number, extras?: Record<string, unknown> }[]
    meshes: { name: string, primitives: { attributes: Record<string, number>, material?: number }[] }[]
  }
  let g: Full | null = null
  const baked = async (): Promise<Full> => {
    if (g) return g
    const env = openEnvironment([new Uint8Array(readFileSync(g027!))])
    // 무대는 `arena`를 켠다 (`convert.ts`의 `convertArenas`) — 그림 크기는 재질 값과 상관없어 작게 굽는다
    const { glb, stat } = await exportArena(env, encodePng, { name: 'g027', maxSize: 32, arena: true })
    expect(stat.problems).toEqual([])
    return (g = gltfOf(glb) as unknown as Full)
  }
  const mat = (all: Full, name: string): Full['materials'][number] => all.materials.find((m) => m.name === name)!

  it('더하는 물은 색을 곱하지 않고 알파를 곱한 보통 섞기로 실린다', async () => {
    const water = mat(await baked(), 'M_B_027_Water_02')
    expect(water.alphaMode).toBe('BLEND')
    expect(water.pbrMetallicRoughness.baseColorTexture).toBeDefined()
    expect(water.pbrMetallicRoughness.baseColorFactor).toBeUndefined()
  }, 120_000)
  // DEFECTS_20261017 §4 — 바닥이 회색 격자뿐 · 덮개가 흰 판 · 천장 링이 검었다
  it('바닥은 그림 셋을 싣는다 — 층은 발광 칸, 마스크는 가림 칸(둘째 UV · 세기 0), 섞는 값은 `extras.cascade`', async () => {
    const all = await baked()
    const floor = mat(all, 'M_CB_027_Floor_01')
    expect(floor.emissiveTexture).toBeDefined()
    expect(floor.emissiveFactor).toBeUndefined()
    expect(floor.occlusionTexture).toMatchObject({ texCoord: 1, strength: 0 })
    const c = floor.extras!.cascade as { color: number[], layer: number[], layerUv: number[] }
    // `_Color` (0.3, 0.765, 1) × 세기 1.5를 선형으로 — 파랑이 1을 넘는다
    expect(c.color[2]).toBeCloseTo(1.5, 5)
    expect(c.layerUv).toEqual([1, 1, 0, 0])
    // 그 재질 조각에만 마스크 UV가 실린다
    const slot = all.materials.indexOf(floor)
    const prim = all.meshes.flatMap((m) => m.primitives).find((p) => p.material === slot)!
    expect(prim.attributes.TEXCOORD_1).toBeDefined()
    const plain = all.meshes.flatMap((m) => m.primitives).find((p) => p.material === all.materials.findIndex((m) => m.name === 'M_CB_027_Wall_01'))!
    expect(plain.attributes.TEXCOORD_1).toBeUndefined()
  }, 120_000)
  it('바닥 덮개는 물빛을 곱해 섞어 그린다 — 흰 판으로 오리지 않는다', async () => {
    const cover = mat(await baked(), 'M_CB_027_Cover_01')
    expect(cover.alphaMode).toBe('BLEND')
    const [r, gg, b, a] = cover.pbrMetallicRoughness.baseColorFactor!
    expect(b!).toBeGreaterThan(gg!)
    expect(gg!).toBeGreaterThan(r!)
    expect(a!).toBeCloseTo(0.961, 3)
  }, 120_000)
  it('천장 링은 발광 그림 × 선형 발광색 · 세기 5를 싣는다', async () => {
    const ring = mat(await baked(), 'M_CB_027_Facility_04')
    expect(ring.emissiveTexture).toBeDefined()
    // `_EmissionColor` (0.765, 0.574, 0.382)는 감마다 — 선형으로 내리면 주황이 짙어진다
    expect(ring.emissiveFactor![0]).toBeCloseTo(0.546, 2)
    expect(ring.emissiveFactor![2]).toBeCloseTo(0.12, 2)
    expect(ring.extras).toMatchObject({ glow: 5 })
  }, 120_000)
  it('바닥 덮개 여섯 장은 노드를 따로 두고 적힌 배틀 목록을 싣는다', async () => {
    const listed = Object.fromEntries((await baked()).nodes.filter((n) => n.extras?.listedIn).map((n) => [n.name, n.extras!.listedIn]))
    expect(listed).toEqual({
      Cover_E_001: ['single'], Cover_P_001: ['single'],
      Cover_E_002: ['double'], Cover_P_002: ['double'],
      Cover_P_003: ['tag'], Cover_P_004: ['tag'],
    })
  }, 120_000)
  it('`arena`를 안 켜면(방 · 나무열매 · 기믹) 전과 같다 — 섞기 · 목록이 없다', async () => {
    const env = openEnvironment([new Uint8Array(readFileSync(g027!))])
    const { glb } = await exportArena(env, encodePng, { name: 'g027', maxSize: 32 })
    const plain = gltfOf(glb) as unknown as Full
    expect(plain.materials.some((m) => m.extras?.cascade)).toBe(false)
    expect(plain.nodes.some((n) => n.extras?.listedIn)).toBe(false)
    expect(mat(plain, 'M_CB_027_Cover_01').alphaMode).toBe('MASK')
  }, 120_000)
})

describe('섞기 값 (`cascadeExtras`)', () => {
  const pairs = (o: Record<string, unknown>): Map<string, never> => new Map(Object.entries(o)) as Map<string, never>
  it('층 UV는 바탕 배율이 먹은 UV에서 다시 잰다 — 바탕 (100, 100) · 층 (25, 25)이면 4분의 1', () => {
    const c = cascadeExtras(pairs({}), pairs({}), [100, 100, 0, 0], [25, 25, 0, 0], true)
    expect(c.layerUv).toEqual([0.25, 0.25, 0, 0.75])
  })
  it('색은 감마 → 선형 × 세기, 세기가 없으면 1', () => {
    const c = cascadeExtras(pairs({ _Color: { r: 1, g: 0.5, b: 0 } }), pairs({ _ColorIntensity: 2 }), [1, 1, 0, 0], [1, 1, 0, 0], false)
    expect(c.color[0]).toBe(2)
    expect(c.color[1]).toBeCloseTo(0.214 * 2, 2)
    expect(c.layer).toEqual([1, 1, 1])
    expect(c.layerMap).toBe(false)
  })
})

describe('그림 없는 재질의 색 (`plainFactor`)', () => {
  const base = { r: 0.5, g: 0.25, b: 1, a: 0.8 }
  it('보통은 `_Color` 그대로, 빛 재질은 세기를 곱한다', () => {
    expect(plainFactor(base, 2, false, false)).toEqual([0.5, 0.25, 1, 0.8])
    expect(plainFactor(base, 2, true, false)).toEqual([1, 0.5, 2, 0.8])
  })
  // ⚠️ 섞은 그림(`cascadeMix`)에는 `_Color` × `_ColorIntensity`가 이미 구워져 있다 — 빛 재질 쪽이 다시 곱하면 제곱이 된다
  it('섞은 그림이 있으면 빛 재질도 RGB를 1로 둔다 — 세기를 두 번 곱하지 않는다', () => {
    expect(plainFactor(base, 1.7, true, true)).toEqual([1, 1, 1, 0.8])
    expect(plainFactor(base, 1.7, false, true)).toEqual([1, 1, 1, 1])
  })
  it('칸이 빈 재질의 그림 번호는 0이다 (`texturePid`)', () => {
    const te = new Map<string, unknown>([
      ['_MainTex', { m_Texture: { m_PathID: 42 } }],
      ['_LayerTex', { m_Texture: { m_PathID: 0 } }],
    ]) as Parameters<typeof texturePid>[0]
    expect(texturePid(te, '_MainTex')).toBe(42)
    expect(texturePid(te, '_LayerTex')).toBe(0)
    expect(texturePid(te, '_BlendTex')).toBe(0)
  })
})

const g038 = ARENAS ? join(ARENAS, 'ground', 'g038') : null
withLocal('BDSP 무대 g038', g038)('충호 방 무대 (원본 번들)', () => {
  it('마스크로 섞은 바닥은 흰 판이 아니다 — 섞은 색이 그림에 있고 색 배율은 1이다', async () => {
    const env = openEnvironment([new Uint8Array(readFileSync(g038!))])
    const { glb } = await exportArena(env, encodePng, { name: 'g038', maxSize: 64 })
    const g = gltfOf(glb) as unknown as {
      materials: Material[], textures: { source: number }[], images: { bufferView: number }[],
      bufferViews: { byteOffset?: number, byteLength: number }[]
    }
    const floor = g.materials.find((m) => m.name === 'M_B_038_Floor_24')!
    expect(floor.pbrMetallicRoughness.baseColorFactor).toEqual([1, 1, 1, 1])
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    const bin = 20 + view.getUint32(12, true) + 8
    const bv = g.bufferViews[g.images[g.textures[floor.pbrMetallicRoughness.baseColorTexture!.index]!.source]!.bufferView]!
    const png = glb.subarray(bin + (bv.byteOffset ?? 0), bin + (bv.byteOffset ?? 0) + bv.byteLength)
    const { pixels: rgba } = await decodePng(png)
    let sum = 0
    for (let i = 0; i < rgba.length; i += 4) sum += rgba[i]! + rgba[i + 1]! + rgba[i + 2]!
    // 흰색이면 765 · 남청 쪽으로 넘어가는 판이라 평균이 훨씬 낮다
    expect(sum / (rgba.length / 4)).toBeLessThan(600)
  }, 120_000)
})
