// 나무열매 나무 — 단계에 맞는 BDSP 모델 · BDSP 형상에 덮인 밭은 안 그린다 (I-p18-3)
//
// 잡는 것 셋: ① 성장 단계가 모델 묶음에 맞게 이어진다 ② 덮인 칸은 그 지역이 **서서 그려질 때만**
// 빠진다 ③ 실측 — 밭 118곳에 BDSP 지역 glb를 위에서 쏘아 보면 114곳은 BDSP 흙이 원작 땅 높이에 있고, 흙이 없는 넷이 덮인
// 칸 표와 같다(리조트 별장 터)
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { BDSP_COVERED, bdspCovers, berryPlantFor, showStage } from './BerryPatchProps'
import { BERRY_STAGE } from '../engine/world/berryPatches'
import { MapGrid, type MatrixMeta } from '../engine/map/grid'
import { heightField } from '../engine/map/height'
import { DATA, FIELD, ROOT, fieldMeshes, loadHeight, read } from './fieldGlb.testkit'

describe('성장 단계 ↔ 나무 모델 (`berryPlantFor`)', () => {
  it('싹은 열매와 상관없이 `kinoseeding` 한 벌 통째로다', () => {
    expect(berryPlantFor(1, BERRY_STAGE.sprouted)).toEqual({ file: 'kinoseeding', node: null })
    expect(berryPlantFor(64, BERRY_STAGE.sprouted)).toEqual({ file: 'kinoseeding', node: null })
  })

  it('자람 · 꽃 · 열림은 그 열매 모델의 `Miki` · `Hana` · `Mi`다', () => {
    expect(berryPlantFor(1, BERRY_STAGE.growing)).toEqual({ file: 'kino001', node: 'Miki' })
    expect(berryPlantFor(10, BERRY_STAGE.blooming)).toEqual({ file: 'kino010', node: 'Hana' })
    expect(berryPlantFor(64, BERRY_STAGE.fruit)).toEqual({ file: 'kino064', node: 'Mi' })
  })

  it('빈 흙 · 심은 직후 · 표 밖 열매는 아무것도 안 선다', () => {
    expect(berryPlantFor(0, BERRY_STAGE.fruit)).toBeNull()
    expect(berryPlantFor(5, BERRY_STAGE.none)).toBeNull()
    expect(berryPlantFor(5, BERRY_STAGE.planted)).toBeNull()
    expect(berryPlantFor(65, BERRY_STAGE.fruit)).toBeNull()
  })
})

describe('묶음 켜기 (`showStage`)', () => {
  it('고른 노드만 켜고 나머지는 숨긴다. null이면 다 켠다', () => {
    const root = new Group()
    for (const name of ['Hana', 'Mi', 'Miki']) { const g = new Group(); g.name = name; root.add(g) }
    showStage(root, 'Mi')
    expect(root.children.map((c) => c.visible)).toEqual([false, true, false])
    showStage(root, null)
    expect(root.children.every((c) => c.visible)).toBe(true)
  })
})

describe('BDSP에 덮인 밭 (`bdspCovers`)', () => {
  it('덮는 지역이 섰을 때만 덮였다고 한다 — 받는 중 · 실패면 원작 그림이 서므로 판도 선다', () => {
    const asked: string[] = []
    expect(bdspCovers(816, 469, (k) => { asked.push(k); return true })).toBe(true)
    expect(asked).toEqual(['area014'])
    expect(bdspCovers(816, 469, () => false)).toBe(false)
    // 다른 지역이 서도 안 덮인다
    expect(bdspCovers(828, 469, (k) => k === 'area008')).toBe(false)
  })

  it('표에 없는 칸은 지역이 서도 안 덮인다', () => {
    expect(bdspCovers(818, 469, () => true)).toBe(false)
    expect(bdspCovers(816, 470, () => true)).toBe(false)
  })
})

// ── 실측 — 구운 지역 glb와 밭 배치를 맞댄다 ─────────────────────────────────────────────────────────────────────────

const baked = ['models/field/index.json', 'data/maps.json', 'data/events.json', 'data/matrices/0.bin', 'data/bdhc.bin']
  .every((p) => existsSync(resolve(ROOT, 'public', p)))

/** 밭 객체(`OBJ_EVENT_GFX_BERRY_SOIL` 100)의 자리 — 바깥 맵(행렬 0)뿐이다 */
function patchPlaces(): { map: number, x: number, z: number }[] {
  const maps = (read('maps.json') as { maps: ({ matrix: number, events: number } | null)[] }).maps
  const events = (read('events.json') as {
    events: Record<string, { npcs: { sprite: number, x: number, z: number }[] } | undefined>
  }).events
  const out: { map: number, x: number, z: number }[] = []
  maps.forEach((h, map) => {
    if (h === null) return
    for (const n of events[String(h.events)]?.npcs ?? []) if (n.sprite === 100) out.push({ map, x: n.x, z: n.z })
  })
  return out
}

interface Hit { name: string, y: number, field: string }

describe.skipIf(!baked)('밭 118곳과 구운 지역 (실측)', () => {
  const places = patchPlaces()
  const fields = (JSON.parse(readFileSync(resolve(FIELD, 'index.json'), 'utf8')) as {
    fields: { name: string, box: [number, number, number, number] }[]
  }).fields.filter((f) => /^area\d+$/.test(f.name))
  /** 밭 칸마다 그 칸을 상자에 담는 지역들의 조각 (`BdspField`가 세우는 지역만 — 대습지는 안 세운다) */
  const roots = fields.map((f) => {
    // 상자는 놓인 자리(뿌리)로 잰 것이라 메시가 1칸쯤 삐져나온다 — 세우는 쪽은 상자에서 수십 칸 안이면 세우므로(`pickFields`) 2칸 넉넉히 본다
    const mine = places.filter((p) => f.box[0] - 2 <= p.x && p.x <= f.box[2] + 2 && f.box[1] - 2 <= p.z && p.z <= f.box[3] + 2)
    const root = mine.length === 0 ? new Group() : fieldMeshes(resolve(FIELD, `${f.name}.glb`),
      (b) => mine.some((p) => b.min.x <= p.x + 1 && b.max.x >= p.x && b.min.z <= p.z + 1 && b.max.z >= p.z))
    return { name: f.name, root }
  })
  const rays = new Raycaster()
  /** 그 자리에 위에서 쏘아 맨 먼저 맞는 면 — 지역마다 쏘고 가장 높은 것 */
  const topAt = (x: number, z: number): Hit | null => {
    let best: Hit | null = null
    for (const { name, root } of roots) {
      rays.set(new Vector3(x, 100, z), new Vector3(0, -1, 0))
      const h = rays.intersectObject(root, true)[0]
      if (h === undefined) continue
      if (best === null || h.point.y > best.y) {
        best = { name: ((h.object as Mesh).material as MeshBasicMaterial).name, y: h.point.y, field: name }
      }
    }
    return best
  }
  heightField.data = loadHeight()
  const meta = read('matrices/0.json') as MatrixMeta
  const bin = readFileSync(resolve(DATA, 'matrices/0.bin'))
  const grid = new MapGrid(meta, new Uint16Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer))
  const ground = (x: number, z: number): number => grid.heightAtWorld(x + 0.5, z + 0.5) ?? Number.NaN

  it('밭은 118곳이고 다 BDSP 지역 상자 안이다', () => {
    expect(places).toHaveLength(118)
    for (const p of places) expect(topAt(p.x + 0.5, p.z + 0.5), `${String(p.x)},${String(p.z)}`).not.toBeNull()
  })

  it('114곳은 BDSP가 같은 칸에 흙을 원작 땅 높이 위에 구워 두었다 — 판이 그 위에 선다', () => {
    const soil = places.filter((p) => /SeedSoil/.test(topAt(p.x + 0.5, p.z + 0.5)?.name ?? ''))
    expect(soil).toHaveLength(114)
    for (const p of soil) {
      const lift = topAt(p.x + 0.5, p.z + 0.5)!.y - ground(p.x, p.z)
      expect(lift, `${String(p.x)},${String(p.z)}`).toBeGreaterThan(0.05)
      expect(lift, `${String(p.x)},${String(p.z)}`).toBeLessThan(0.2)
    }
    // 그 114곳은 지역이 서도 안 빠진다
    for (const p of soil) expect(bdspCovers(p.x, p.z, () => true)).toBe(false)
  })

  it('흙이 없는 넷이 덮인 칸 표와 같고, 다 리조트(457)다 — 그 넷만 빠진다', () => {
    const bare = places.filter((p) => !/SeedSoil/.test(topAt(p.x + 0.5, p.z + 0.5)?.name ?? ''))
    const key = (c: { x: number, z: number }): string => `${String(c.x)},${String(c.z)}`
    expect(bare.map(key).sort()).toEqual(BDSP_COVERED.map(key).sort())
    expect(new Set(bare.map((p) => p.map))).toEqual(new Set([457]))
    expect(places.filter((p) => bdspCovers(p.x, p.z, () => true)).map(key).sort()).toEqual(BDSP_COVERED.map(key).sort())
    // 표가 적은 지역이 그 칸을 그리는 지역이다
    for (const c of BDSP_COVERED) expect(topAt(c.x + 0.5, c.z + 0.5)?.field).toBe(c.field)
  })

  it('넷은 별장 터(원작 땅 3)에 있는데 BDSP는 터 없이 땅 1이라 집 · 못 둑 · 나무 속이다', () => {
    for (const c of BDSP_COVERED) expect(ground(c.x, c.z), `${String(c.x)},${String(c.z)}`).toBe(3)
    for (const x of [816, 817]) {
      const top = topAt(x + 0.5, 469.5)!
      expect(top.name).toMatch(/House_01/)
      expect(top.y).toBeGreaterThan(ground(x, 469))
    }
    // 못 둑: 칸을 5×5로 쏘면 서쪽 두 줄(10곳)이 못 물(Unity 기본 Plane, y 0.5)이고 나머지가 둑의 풀(BDSP 땅 y 1)이다
    const at = (x: number, i: number): Hit => topAt(x + 0.1 + (i % 5) * 0.2, 469.1 + Math.floor(i / 5) * 0.2)!
    const bank = Array.from({ length: 25 }, (_, i) => at(827, i))
    expect(bank.filter((h) => Math.abs(h.y - 0.5) < 0.01 && /Water/.test(h.name))).toHaveLength(10)
    expect(bank.filter((h) => Math.abs(h.y - (ground(827, 469) - 2)) < 0.01 && /PondGrass/.test(h.name))).toHaveLength(15)
    // 나무: 25곳 중 21곳이 잎에 걸리고 원작 땅 높이가 그 잎 속이다. 나머지는 BDSP 땅(원작보다 두 칸 아래)이다
    const tree = Array.from({ length: 25 }, (_, i) => at(828, i))
    const leaves = tree.filter((h) => /Tree_05/.test(h.name))
    expect(leaves).toHaveLength(21)
    expect(Math.min(...leaves.map((h) => h.y))).toBeLessThan(ground(828, 469))
    expect(Math.max(...leaves.map((h) => h.y))).toBeGreaterThan(ground(828, 469))
    for (const h of tree.filter((t) => !/Tree_05/.test(t.name))) expect(h.y).toBeCloseTo(ground(828, 469) - 2, 2)
  })
})
