// 자전거 검증 (DATA.md §4.2)
//
// 여기서 지키는 것 둘: **속도 배수가 원작 실측 그대로**인 것과, **탈 수 있는
// 자리의 차례가 원작과 같은** 것. 차례가 중요하다 — 자전거 다리 위에서는
// 내리지 못하는데, 그 검사를 나중에 두면 다리 위에서 내려 아래로 떨어진다.
import { describe, it, expect } from 'vitest'
import {
  BIKE_GEAR, BIKE_SPEEDS, THIRD_GEAR_LEVEL, TOP_LEVEL,
  bikeBlock, bikeSpeedAt, bikeSpeedLevel,
} from './bike'
import { BRIDGE_START, resetBridge, trackBridge } from './bridge'
import type { MapHeader } from '../map/world'

const map = (bike: number): MapHeader => ({ bike } as MapHeader)

describe('자전거 속도', () => {
  it('원작이 적어 둔 배수 **네 단** 그대로다', () => {
    // 한 칸(16px)에 걸리는 프레임 수에서 그대로 나온다. 보통 걸음이 8프레임이고
    // 넷이 6 · 4 · 3 · 2프레임이다 — 고른 걸음 둘(`InitWalk`)과 걸음마다 폭이
    // 다른 표 둘(`sStepSizes_WalkSlightlyFast` 2+3+3+2+3+3 ·
    // `sStepSizes_WalkSlightlyFaster` 5+6+5)이 다 한 칸으로 떨어진다
    expect(BIKE_SPEEDS).toEqual([8 / 6, 8 / 4, 8 / 3, 8 / 2])
  })

  it('4단은 지나온 칸마다 한 단씩 오른다', () => {
    // ⚠️ **첫 걸음은 0단이다** — 원작이 속도를 읽어 동작을 고르고 **그 다음에**
    // 올린다 (`GetMovementActionFromSpeed` → `AccelerateBike`)
    const g = BIKE_GEAR.fourth
    expect(bikeSpeedAt(0, g)).toBeCloseTo(4 / 3, 10)
    expect(bikeSpeedAt(1, g)).toBe(2)
    expect(bikeSpeedAt(2, g)).toBeCloseTo(8 / 3, 10)
    expect(bikeSpeedAt(3, g)).toBe(4)
    // 한 칸 안에서는 안 오른다
    expect(bikeSpeedAt(0.99, g)).toBeCloseTo(4 / 3, 10)
  })

  it('전속력이 끝이다 — 계속 밟아도 더는 안 빨라진다', () => {
    // 원작 `AccelerateBike`가 `AVATAR_MOVE_SPEED_3`에서 멈춘다
    expect(bikeSpeedAt(20, BIKE_GEAR.fourth)).toBe(4)
    expect(bikeSpeedLevel(20, BIKE_GEAR.fourth)).toBe(TOP_LEVEL)
  })

  it('3단은 얼마를 가도 **전속력이 안 된다**', () => {
    // 원작이 걸음마다 `SetSpeed(AVATAR_MOVE_SPEED_2)`로 못박는다.
    // 진흙 비탈이 전속력을 묻기 때문에 이것이 곧 「3단으로는 못 오른다」다
    for (const tiles of [0, 1, 5, 100]) {
      expect(bikeSpeedLevel(tiles, BIKE_GEAR.third)).toBe(THIRD_GEAR_LEVEL)
      expect(bikeSpeedAt(tiles, BIKE_GEAR.third)).toBeCloseTo(8 / 3, 10)
    }
    expect(THIRD_GEAR_LEVEL).toBeLessThan(TOP_LEVEL)
  })

  it('어느 단이든 걷기보다는 빠르다', () => {
    // 우리 걷기 4.5 · 달리기 8 (`actor/player`)
    for (const s of BIKE_SPEEDS) expect(s).toBeGreaterThan(1)
  })
})

describe('여기서 탈 수 있는가', () => {
  it('맵이 금지하면 못 탄다', () => {
    // `MapHeader_IsBikeAllowed`. 593개 맵 중 367개가 0이다
    expect(bikeBlock(map(0), 0x00, false, false)).toBe('map')
    expect(bikeBlock(map(1), 0x00, false, false)).toBeNull()
  })

  it('긴 풀과 진흙에서는 못 탄다', () => {
    for (const b of [0x03, 0xa4, 0xa5, 0xa6, 0xa7]) {
      expect(bikeBlock(map(1), b, false, false), `0x${b.toString(16)}`).toBe('grass')
    }
    // 보통 풀숲(0x02)은 탈 수 있다 — 원작이 **긴** 풀만 막는다
    expect(bikeBlock(map(1), 0x02, false, false)).toBeNull()
  })

  it('물 위에서는 못 탄다', () => {
    expect(bikeBlock(map(1), 0x00, true, false)).toBe('surf')
    expect(bikeBlock(map(1), 0x15, false, false)).toBe('surf')
  })

  it('⚠️ 자전거 다리 **위**에서는 내리지도 못한다', () => {
    // 원작이 이 검사를 **제일 먼저** 한다. 내리면 다리 아래로 떨어진다.
    // 자전거 다리는 0x76~0x7d다 — 남북 넷, 동서 넷
    trackBridge(BRIDGE_START)
    for (const b of [0x76, 0x79, 0x7a, 0x7d]) {
      expect(bikeBlock(map(1), b, false, true), `0x${b.toString(16)}`).toBe('stuck')
      // 아직 안 타고 있으면 다리 위에서도 탈 수 있다
      expect(bikeBlock(map(1), b, false, false)).toBeNull()
    }
  })

  it('⚠️ 다리 **밑**을 지나갈 때는 자유롭게 내린다 (PARITY §1.16)', () => {
    // 어귀를 안 밟았으므로 같은 칸이어도 「위」가 아니다. 이 구분이 없으면
    // 다리 밑에서 자전거가 통째로 잠긴다
    resetBridge()
    expect(bikeBlock(map(1), 0x76, false, true)).toBeNull()
  })

  it('⚠️ 모래·눈 위의 보통 다리는 자전거 다리가 아니다', () => {
    // 0x74·0x75는 `BRIDGE_OVER_SAND`·`BRIDGE_OVER_SNOW`다. 자전거 다리로
    // 묶어 두면 사막과 설원의 다리에서 자전거가 안 내려진다
    trackBridge(BRIDGE_START)
    expect(bikeBlock(map(1), 0x74, false, true)).toBeNull()
    expect(bikeBlock(map(1), 0x75, false, true)).toBeNull()
  })

  it('이미 타고 있으면 어디서든 내릴 수 있다 — 다리만 빼고', () => {
    expect(bikeBlock(map(0), 0x03, false, true)).toBeNull()
  })
})
