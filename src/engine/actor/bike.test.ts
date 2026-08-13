// 자전거 검증 (DATA.md §4.2)
//
// 여기서 지키는 것 둘: **속도 배수가 원작 실측 그대로**인 것과, **탈 수 있는
// 자리의 차례가 원작과 같은** 것. 차례가 중요하다 — 자전거 다리 위에서는
// 내리지 못하는데, 그 검사를 나중에 두면 다리 위에서 내려 아래로 떨어진다.
import { describe, it, expect } from 'vitest'
import { BIKE_GEARS, GEAR_TIME, bikeBlock, bikeSpeedAt } from './bike'
import { BRIDGE_START, resetBridge, trackBridge } from './bridge'
import type { MapHeader } from '../map/world'

const map = (bike: number): MapHeader => ({ bike } as MapHeader)

describe('자전거 속도', () => {
  it('원작이 적어 둔 배수 그대로 오른다', () => {
    // `InitWalk(방향, 프레임당 픽셀, 프레임 수)`에서 나온 값이다:
    // 걷기 2×8 · 1단 4×4 · 2단 16/3×3 · 3단 8×2 (한 칸이 16px)
    expect(BIKE_GEARS).toEqual([2, 8 / 3, 4])
    expect(bikeSpeedAt(0)).toBe(2)
    expect(bikeSpeedAt(GEAR_TIME)).toBeCloseTo(8 / 3, 5)
    expect(bikeSpeedAt(GEAR_TIME * 2)).toBe(4)
  })

  it('3단이 끝이다 — 계속 밟아도 더는 안 빨라진다', () => {
    // 원작 `PlayerAvatar_AccelerateBike`가 `AVATAR_MOVE_SPEED_3`에서 멈춘다
    expect(bikeSpeedAt(GEAR_TIME * 20)).toBe(4)
  })

  it('걷기보다 빠르고, 3단은 달리기의 두 배다', () => {
    // 우리 걷기 4.5 · 달리기 8. 원작 기준으로 달리기는 걷기의 2배(= 1단)다
    expect(bikeSpeedAt(0)).toBeGreaterThan(1)
    expect(bikeSpeedAt(GEAR_TIME * 2)).toBe(BIKE_GEARS[0]! * 2)
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
