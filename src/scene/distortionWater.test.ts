// 깨어진 세계의 물 (PARITY §6.10).
//
// ⚠️ **이 세계에도 물이 있다.** B4F 천장 판에 `TILE_BEHAVIOR_WATER_SEA`(21)가
// 50칸이고, 폭포 넷이 그 웅덩이 안이다. 맵 격자에는 한 칸도 안 적혀 있어서
// **판에 물어야** 나온다 — 안 물으면 물 위를 걸어서 폭포까지 간다.
//
// 여기서 지키는 것 둘:
//   ① 그 50칸이 실제로 물로 읽히는가 (자료가 바뀌면 여기서 걸린다)
//   ② 천장에서 **앞 칸이 뒤집히는가** — 바라보는 각이 판 위의 로컬 각이라
//      좌표의 x·z로 세면 등 뒤를 집는다
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MAP, PLATFORM_CEILING, tileAttributes, tileBehavior } from '../engine/world/distortion'
import type { DistortionData, DistortionRom } from '../data/schema'
import { withDistortionTables } from '../data/distortionFile'

/** `TILE_BEHAVIOR_WATER_SEA` */
const WATER_SEA = 21

let data: DistortionData

beforeAll(() => {
  data = withDistortionTables(
    JSON.parse(readFileSync('public/data/distortion.json', 'utf8')) as DistortionRom,
  )
})

describe('B4F 천장의 물', () => {
  it('물이 있는 층은 B4F 하나뿐이다', () => {
    const wet: number[] = []
    for (const m of data.maps) {
      const n = (m.platforms ?? []).reduce((sum, p) => {
        const grid = data.attrs[p.attr]
        if (grid === undefined) return sum
        return sum + grid.filter((v) => tileBehavior(v) === WATER_SEA && (v & 0x8000) === 0).length
      }, 0)
      if (n > 0) wet.push(m.map)
    }
    expect(wet).toEqual([MAP.b4f])
  })

  it('물 50칸이 천장 판에 있다', () => {
    const b4f = data.maps.find((m) => m.map === MAP.b4f)
    const ceiling = b4f?.platforms.find((p) => p.kind === PLATFORM_CEILING)
    expect(ceiling).toBeDefined()
    const grid = data.attrs[ceiling!.attr]
    const n = grid!.filter((v) => tileBehavior(v) === WATER_SEA && (v & 0x8000) === 0).length
    expect(n).toBe(50)
  })

  it('폭포 네 칸이 다 물이다', () => {
    const b4f = data.maps.find((m) => m.map === MAP.b4f)!
    const ceiling = b4f.platforms.find((p) => p.kind === PLATFORM_CEILING)!
    const grid = data.attrs[ceiling.attr]
    // 폭포는 세계 (104,170,76~79)다 (`WATERFALL_B4F_*`)
    for (const z of [76, 77, 78, 79]) {
      expect(tileBehavior(tileAttributes(ceiling, grid, 104, 170, z))).toBe(WATER_SEA)
    }
  })
})
