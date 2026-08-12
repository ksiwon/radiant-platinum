// 타운맵 (PARITY §5)
//
// **재는 것 넷:**
//
//   ① 날 수 있는 곳 스물이 `spawns.json`의 자리와 하나씩 맞는다 — 안 맞으면
//      엉뚱한 마을로 내린다
//   ② 도시 안 아무 칸에서나 날 수 있다. 표식이 한 칸에만 적혀 있어도 그렇다
//   ③ 칸을 못 박아 둔 셋(팔파크·챔피언로드·리그)은 그 한 칸에서만
//   ④ 격자 → 픽셀 셈이 원작 매크로와 같다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withData } from '../../data/romData.testkit'
import { townMapSchema } from '../../data/schema'
import {
  cellAt, FLY_SPOTS, flySpotAt, GRID, gridX, gridY, NO_LANDMARK,
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

  it('⚠️ 위쪽 칸은 y가 음수다 — 자르면 눈이 화면 밖으로 나간다', () => {
    // 원점이 −34라 z가 4보다 작으면 지도 위로 삐져나온다. 커서 범위가
    // `GRID_MIN_Z = 4`인 까닭이다
    expect(gridY(4)).toBe(-6)
    expect(gridY(5)).toBe(1)
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
