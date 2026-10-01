// 타운맵 (PARITY §5)
//
// **재는 것 다섯:**
//
//   ① 날 수 있는 곳 스물이 `spawns.json`의 자리와 하나씩 맞는다 — 안 맞으면
//      엉뚱한 마을로 내린다
//   ② 도시 안 아무 칸에서나 날 수 있다. 표식이 한 칸에만 적혀 있어도 그렇다
//   ③ 칸을 못 박아 둔 셋(팔파크·챔피언로드·리그)은 그 한 칸에서만
//   ④ 격자 → 픽셀 셈이 원작 매크로와 같다
//   ⑤ 커서 범위가 원작 입력 조건과 같고, 맨 아래 칸이 이름 띠에 안 들어간다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withData } from '../../data/romData.testkit'
import { townMapSchema } from '../../data/schema'
import {
  cellAt, FLY_SPOTS, flySpotAt, GRID, GRID_MAX_X, GRID_MAX_Z, GRID_MIN_X, GRID_MIN_Z, gridX, gridY,
  NO_LANDMARK,
} from './townMap'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('townMap.json', 'spawns.json')

describe('격자 셈', () => {
  it('`TOWN_MAP_GRID_X(x)` · `TOWN_MAP_GRID_Y(y)` 그대로다', () => {
    expect(GRID).toBe(7)
    expect(gridX(0)).toBe(25)
    expect(gridY(0)).toBe(-34)
    // 떡잎마을 표식이 서는 자리
    expect(gridX(3)).toBe(46)
    expect(gridY(27)).toBe(155)
  })

  it('⚠️ 위쪽 칸은 y가 음수다 — 원점이 −34라 z 4는 지도 위로 삐져나온다', () => {
    expect(gridY(4)).toBe(-6)
    expect(gridY(5)).toBe(1)
  })
})

describe('커서 범위', () => {
  it('원작 입력 조건 그대로 z 6..28 · x 1..28이다 (`town_map/graphics.c`)', () => {
    // ↑ `cursorZ >= 7` → 6에서 선다 · ↓ `cursorZ <= 27` → 28에서 선다
    // → `cursorX <= 27` → 28 · ← `cursorX >= 2` → 1
    expect([GRID_MIN_Z, GRID_MAX_Z]).toEqual([6, 28])
    expect([GRID_MIN_X, GRID_MAX_X]).toEqual([1, 28])
  })

  it('⚠️ 맨 아래 칸이 지도 아래 이름 띠(y 168~)에 안 들어간다', () => {
    // 띠는 192px 그림의 아래 24px이다. z 29부터 칸이 그 안에서 시작한다
    const band = 192 - 24
    expect(gridY(GRID_MAX_Z)).toBe(162)
    expect(gridY(GRID_MAX_Z)).toBeLessThan(band)
    expect(gridY(GRID_MAX_Z + 1)).toBeGreaterThanOrEqual(band)
    expect(gridY(GRID_MIN_Z)).toBeGreaterThanOrEqual(0)
  })

  it('날 수 있는 곳 스물이 전부 커서가 닿는 칸에 있다', () => {
    for (const s of FLY_SPOTS) {
      expect(s.x, `자리 ${String(s.spawn)}`).toBeGreaterThanOrEqual(GRID_MIN_X)
      expect(s.x, `자리 ${String(s.spawn)}`).toBeLessThanOrEqual(GRID_MAX_X)
      expect(s.z, `자리 ${String(s.spawn)}`).toBeGreaterThanOrEqual(GRID_MIN_Z)
      expect(s.z, `자리 ${String(s.spawn)}`).toBeLessThanOrEqual(GRID_MAX_Z)
    }
  })
})

maybe('날 수 있는 곳', () => {
  const file = townMapSchema.parse(
    JSON.parse(readFileSync(resolve(DATA, 'townMap.json'), 'utf8')),
  )
  const spawns = (JSON.parse(readFileSync(resolve(DATA, 'spawns.json'), 'utf8')) as {
    spawns: { fly: { map: number }; flyName: string }[]
  }).spawns

  it('스물이고, 저마다 `spawns.json`의 같은 맵을 가리킨다', () => {
    expect(FLY_SPOTS).toHaveLength(20)
    for (const s of FLY_SPOTS) {
      const spawn = spawns[s.spawn]
      expect(spawn, `자리 ${String(s.spawn)}이 없다`).toBeDefined()
      expect(spawn!.fly.map, `${spawn!.flyName}`).toBe(s.map)
    }
  })

  it('스무 자리를 하나도 안 겹치게 쓴다 — 겹치면 한 곳으로 못 난다', () => {
    expect(new Set(FLY_SPOTS.map((s) => s.spawn)).size).toBe(20)
  })

  it('⚠️ 도시 안 네 칸 어디서나 날 수 있다', () => {
    // 표식은 (4,23) 한 칸에만 있는데 축복시티는 격자 넷을 차지한다.
    // 칸으로 견주면 나머지 셋에서 못 난다 (`TownMap_GetFlyLocationAtPos`)
    for (const [x, z] of [[4, 23], [5, 23], [4, 24], [5, 24]] as const) {
      const cell = cellAt(file.cells, x, z)
      expect(cell, `(${String(x)},${String(z)})에 칸이 없다`).not.toBeNull()
      expect(flySpotAt(cell!.map, x, z)?.map, `(${String(x)},${String(z)})`).toBe(3)
    }
  })

  it('칸을 못 박아 둔 셋은 그 한 칸에서만', () => {
    // 포켓몬리그(172)는 챔피언로드 앞(26,18)과 정문(26,17)이 따로다.
    // 맵만 보고 고르면 늘 앞엣것으로 내린다
    expect(flySpotAt(172, 26, 18)?.spawn).toBe(14)
    expect(flySpotAt(172, 26, 17)?.spawn).toBe(19)
    // 그 맵의 다른 칸에서는 아무 데도 못 난다
    expect(flySpotAt(172, 25, 19)).toBeNull()
    // 221번도로는 길이 긴데 팔파크 자리가 (9,28) 하나뿐이다
    expect(flySpotAt(392, 9, 28)?.spawn).toBe(18)
    expect(flySpotAt(392, 8, 28)).toBeNull()
  })

  it('표식이 선 칸에는 그 맵의 칸이 실제로 있다', () => {
    for (const s of FLY_SPOTS) {
      const cell = cellAt(file.cells, s.x, s.z)
      expect(cell, `${String(s.map)} (${String(s.x)},${String(s.z)})`).not.toBeNull()
      expect(cell!.map, `${String(s.map)}의 표식 칸`).toBe(s.map)
    }
  })
})

maybe('격자 칸 표', () => {
  const file = townMapSchema.parse(
    JSON.parse(readFileSync(resolve(DATA, 'townMap.json'), 'utf8')),
  )

  it('지도 칸이 전부 커서 범위 안이다 — 범위를 좁혀도 못 가는 자리가 안 생긴다', () => {
    // 롬의 칸 표가 x 1..28 · z 6..28이다. 원작 커서 범위와 꼭 같다
    for (const c of file.cells) {
      expect(c.x, `(${String(c.x)},${String(c.z)})`).toBeGreaterThanOrEqual(GRID_MIN_X)
      expect(c.x, `(${String(c.x)},${String(c.z)})`).toBeLessThanOrEqual(GRID_MAX_X)
      expect(c.z, `(${String(c.x)},${String(c.z)})`).toBeGreaterThanOrEqual(GRID_MIN_Z)
      expect(c.z, `(${String(c.x)},${String(c.z)})`).toBeLessThanOrEqual(GRID_MAX_Z)
    }
  })

  it('한 칸이 두 번 안 나온다 — 나오면 앞엣것만 늘 이긴다', () => {
    const keys = file.cells.map((c) => `${String(c.x)},${String(c.z)}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('⚠️ 이름난 자리가 없으면 65535다 — 0이 아니다', () => {
    // 0으로 견주면 뱅크의 첫 글이 온 지도에 붙는다
    expect(file.cells.some((c) => c.landmark === NO_LANDMARK)).toBe(true)
    expect(file.cells.every((c) => c.landmark === NO_LANDMARK || c.landmark < 130)).toBe(true)
  })

  it('칸마다 지역명이 붙어 있다 — 몇 칸은 지도에만 있고 이름이 없다', () => {
    const named = file.cells.filter((c) => c.label !== 0)
    expect(named.length).toBeGreaterThan(160)
    expect(named.length).toBeLessThanOrEqual(file.cells.length)
  })
})
