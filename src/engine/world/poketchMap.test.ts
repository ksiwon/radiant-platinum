import { describe, expect, it } from 'vitest'
import {
  POKETCH_BERRY_SPOTS, POKETCH_HIDDEN_SPOTS, POKETCH_MAX_BERRY_DOTS,
  VAR_HIDDEN_LOCATION_FIRST, hiddenSpots, mapCell, mapPoint, readyBerrySpots,
} from './poketchMap'
import { POKETCH_MAP_X, POKETCH_MAP_Y, POKETCH_MAP_Y_FIRST } from './poketchMapTable'
import { BERRY_STAGE, type BerryPatch } from './berryPatches'

const patch = (over: Partial<BerryPatch> = {}): BerryPatch => ({
  berryID: 1, growthStage: BERRY_STAGE.fruit, stageMinutesRemaining: 0,
  moistureMinutesRemaining: 0, replantCount: 0, yield: 3, moistureRating: 50,
  yieldRating: 3, mulchType: 0, isGrowing: true, ...over,
})

describe('격자와 픽셀', () => {
  it('한 칸이 여섯 픽셀이다', () => {
    for (let i = 1; i < POKETCH_MAP_X.length; i++) {
      expect(POKETCH_MAP_X[i]! - POKETCH_MAP_X[i - 1]!).toBe(6)
    }
  })

  it('⚠️ 세로 앞 다섯 칸은 자리가 아니다 — 0을 좌표로 믿으면 북쪽이 다 겹친다', () => {
    for (let y = 0; y < POKETCH_MAP_Y_FIRST; y++) {
      expect(POKETCH_MAP_Y[y]).toBe(0)
      expect(mapPoint(3, y)).toBeNull()
    }
    expect(mapPoint(3, POKETCH_MAP_Y_FIRST)).toEqual({ x: 44, y: 24 })
  })

  it('격자 밖은 null이다', () => {
    expect(mapPoint(POKETCH_MAP_X.length, 10)).toBeNull()
    expect(mapPoint(3, POKETCH_MAP_Y.length)).toBeNull()
  })

  it('타일 좌표를 32로 나눈 것이 칸이다 — 마을 안에서는 점이 안 움직인다', () => {
    // 209번도로 VS시커 확인 지점의 자리다 (547, 717)
    expect(mapCell(547, 717)).toEqual({ x: 17, y: 22 })
    expect(mapCell(544, 704)).toEqual({ x: 17, y: 22 })
    expect(mapCell(575, 735)).toEqual({ x: 17, y: 22 })
    expect(mapCell(576, 736)).toEqual({ x: 18, y: 23 })
  })
})

describe('열매가 열린 밭', () => {
  it('밭 표가 118곳이고 자리는 36곳이다', () => {
    expect(POKETCH_BERRY_SPOTS).toHaveLength(118)
    expect(new Set(POKETCH_BERRY_SPOTS.map((s) => s.join(','))).size).toBe(36)
  })

  it('아무것도 안 열렸으면 비어 있다', () => {
    const patches = POKETCH_BERRY_SPOTS.map(() => patch({ growthStage: BERRY_STAGE.growing }))
    expect(readyBerrySpots(patches)).toHaveLength(0)
  })

  it('⚠️ 본 적 없는 밭은 안 뜬다 — 그 밭은 시간이 안 흐른다', () => {
    const patches = POKETCH_BERRY_SPOTS.map(() => patch({ isGrowing: false }))
    expect(readyBerrySpots(patches)).toHaveLength(0)
  })

  it('⚠️ 붙어 있는 같은 자리 넷이 점 하나로 뭉친다', () => {
    // 표 0~1번이 같은 자리 {5,20}, 2~3번이 {6,20}이다
    const first = POKETCH_BERRY_SPOTS[0]!
    const same = POKETCH_BERRY_SPOTS.findIndex((s) => s[0] !== first[0] || s[1] !== first[1])
    expect(same).toBeGreaterThan(1)
    const patches = POKETCH_BERRY_SPOTS.map((_, i) =>
      patch({ growthStage: i < same ? BERRY_STAGE.fruit : BERRY_STAGE.growing }))
    expect(readyBerrySpots(patches)).toHaveLength(1)
  })

  it('다 열리면 자리 수만큼 뜬다 — 118이 아니다', () => {
    const patches = POKETCH_BERRY_SPOTS.map(() => patch())
    const dots = readyBerrySpots(patches)
    expect(dots.length).toBeLessThanOrEqual(POKETCH_MAX_BERRY_DOTS)
    expect(dots).toHaveLength(36)
  })

  it('밭이 없어도 안 터진다', () => {
    expect(readyBerrySpots([])).toHaveLength(0)
  })
})

describe('숨은 자리 넷', () => {
  it('변수가 정해진 값일 때만 뜬다 — 0이 아니면 된다가 아니다', () => {
    expect(POKETCH_HIDDEN_SPOTS).toHaveLength(4)
    expect(hiddenSpots(() => 0)).toHaveLength(0)
    expect(hiddenSpots(() => 1)).toHaveLength(0)
    const magic = POKETCH_HIDDEN_SPOTS[2]!.magic
    const hit = hiddenSpots((id) => (id === VAR_HIDDEN_LOCATION_FIRST + 2 ? magic : 0))
    expect(hit).toHaveLength(1)
    expect(hit[0]!.name).toBe(POKETCH_HIDDEN_SPOTS[2]!.name)
  })

  it('확인 값 넷이 서로 다르다 — 같으면 한 변수로 넷이 다 뜬다', () => {
    expect(new Set(POKETCH_HIDDEN_SPOTS.map((s) => s.magic)).size).toBe(4)
  })
})
