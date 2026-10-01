// 방 · 무대 굽기 — 재질 색 · 층 그림 · TV 칸 (`arena.ts`)
//
// ⚠️ **굽는 쪽이 둘이다.** 개발 산출물(`public/models/room` · `arena`)은 노드 쪽 `tools/extract/bdspArena.py`가 굽고 설치본은 여기가
// 굽는다. 두 쪽의 대조는 `tools/spike/glbDiff.py`(기하 · 그림 픽셀)로 하고, 여기서는 이 쪽이 원작 값을 제대로 싣는지만 못 박는다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { exportArena, flipbookCell } from './arena'
import { openEnvironment } from './environment'
import { encodePng } from '../platinum/png'
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
  it('더하는 물은 색을 곱하지 않고 알파를 곱한 보통 섞기로 실린다', async () => {
    const env = openEnvironment([new Uint8Array(readFileSync(g027!))])
    const { glb } = await exportArena(env, encodePng, { name: 'g027' })
    const water = gltfOf(glb).materials.find((m) => m.name === 'M_B_027_Water_02')!
    expect(water.alphaMode).toBe('BLEND')
    expect(water.pbrMetallicRoughness.baseColorTexture).toBeDefined()
    expect(water.pbrMetallicRoughness.baseColorFactor).toBeUndefined()
  }, 120_000)
})
