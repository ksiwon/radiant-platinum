// 승강판을 실제로 태워 본다 (PARITY §7.12)
//
// 표는 `engine/world/platformLift`가 시험한다. 여기서는 **한 번 밟으면 정말
// 올라가고, 다 올라간 뒤에 발밑에 딛을 것이 생기는가**를 본다 — 이 한 줄이
// 안 되면 사천왕에게 못 올라가서 게임이 안 끝난다.
import { beforeEach, describe, expect, it } from 'vitest'
import { heightPlateAt, resolveDynamicHeight } from '../engine/map/dynamicHeight'
import { LIFT_MODEL } from '../engine/world/platformLift'
import { worldState } from '../state/worldState'
import {
  initPlatformLift, platformLiftBusy, platformLiftNotUsedWhenEnteredMap,
  platformLiftProp, platformLiftTick, resetPlatformLift, triggerPlatformLift,
} from './platformLift'
import { isFeaturePlacement } from './movingProps'

/** 아론의 방. 아래층 문이 z = 15고 판이 0 → 10칸을 간다 */
const AARON = 176
/** 강철섬 B1F 오른쪽 방. 아래층 문이 z = 26이고 1 ↔ 9칸을 오간다 */
const IRON_B1F = 291

/** 한 프레임씩 끝까지 태운다. 안 멈추면 시험이 선다 */
function rideOut(): number {
  let frames = 0
  while (platformLiftBusy()) {
    platformLiftTick(1 / 60)
    frames++
    if (frames > 1000) throw new Error('판이 안 멈춘다')
  }
  return frames
}

describe('리그 승강판', () => {
  beforeEach(() => { resetPlatformLift() })

  it('아래층 문으로 들어오면 판이 바닥에 있다', () => {
    expect(initPlatformLift(AARON, 15)).toBe(true)
    expect(platformLiftProp()).toEqual({ model: LIFT_MODEL.pokemonLeague, x: 4.5, y: 0, z: 11.5 })
    expect(platformLiftNotUsedWhenEnteredMap()).toBe(true)
  })

  it('밟으면 열 칸을 올라가고 발밑이 따라온다', () => {
    initPlatformLift(AARON, 15)
    worldState.player.position.set(4.5, 0, 11.5)
    expect(triggerPlatformLift()).toBe(true)
    const frames = rideOut()

    // 프레임당 2/16칸으로 10칸 — 80프레임이다
    expect(frames).toBeGreaterThanOrEqual(80)
    expect(platformLiftProp()?.y).toBe(10)
    expect(worldState.player.position.y).toBe(10)
    // ⚠️ **다 올라간 뒤에야 높이판이 목표로 간다.** 이게 없으면 판에서
    // 내려서는 순간 바닥까지 떨어진다
    expect(heightPlateAt(4, 11)?.height).toBe(10)
    expect(resolveDynamicHeight(0, 4, 11, 10)).toBe(10)
  })

  it('⚠️ 한 번 오르면 안 내려온다', () => {
    initPlatformLift(AARON, 15)
    triggerPlatformLift()
    rideOut()
    expect(triggerPlatformLift()).toBe(false)
    expect(platformLiftProp()?.y).toBe(10)
  })

  it('⚠️ 위층 문으로 들어오면 「아직 안 탔다」가 거짓이다', () => {
    // 스크립트가 이 값으로 판 칸의 좌표 트리거를 꺼 버린다 — 안 그러면
    // 내려서자마자 그 자리에서 다시 탄다
    initPlatformLift(AARON, 2)
    expect(platformLiftNotUsedWhenEnteredMap()).toBe(false)
    expect(platformLiftProp()?.y).toBe(10)
  })
})

describe('강철섬 승강판', () => {
  beforeEach(() => { resetPlatformLift() })

  it('오르내린다', () => {
    initPlatformLift(IRON_B1F, 26)
    expect(platformLiftProp()?.y).toBe(1)
    expect(triggerPlatformLift()).toBe(true)
    rideOut()
    expect(platformLiftProp()?.y).toBe(9)

    // 리그와 달리 다시 밟으면 내려온다
    expect(triggerPlatformLift()).toBe(true)
    rideOut()
    expect(platformLiftProp()?.y).toBe(1)
    expect(heightPlateAt(10, 23)?.height).toBe(1)
  })

  it('⚠️ 위로 들어와도 「아직 안 탔다」가 참이다', () => {
    // 강철섬 셋은 그 값을 안 쓴다 — 원작 코드의 `if`가 리그 여섯에만 붙어 있다
    initPlatformLift(IRON_B1F, 3)
    expect(platformLiftNotUsedWhenEnteredMap()).toBe(true)
  })
})

describe('청크가 그리는 소품에서 뺀다', () => {
  beforeEach(() => { resetPlatformLift() })

  it('그 자리의 그 모델만 뺀다', () => {
    initPlatformLift(AARON, 15)
    expect(isFeaturePlacement(LIFT_MODEL.pokemonLeague, 4.5, 11.5)).toBe(true)
    expect(isFeaturePlacement(LIFT_MODEL.pokemonLeague, 4.5, 12.5)).toBe(false)
    expect(isFeaturePlacement(107, 4.5, 11.5)).toBe(false)
  })

  it('판이 없는 맵에서는 아무것도 안 뺀다', () => {
    expect(isFeaturePlacement(LIFT_MODEL.pokemonLeague, 4.5, 11.5)).toBe(false)
  })
})
