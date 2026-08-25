import { afterEach, describe, expect, it } from 'vitest'
import type { PendingWarp } from '../engine/map/world'
import { world } from '../engine/map/world'
import { worldState } from '../state/worldState'
import {
  beginFlyTransition,
  flyTransitionPhase,
  flyTransitionPose,
  resetFlyTransition,
  tickFlyTransition,
} from './flyTransition'
import { FLY_MOUNT } from './pcParts'
import { BDSP_TO_WORLD } from '../engine/model/normalize'

const TARGET: PendingWarp = { to: 411, matrix: 0, x: 10, z: 12, viaDoor: false }

describe('3D fly transition', () => {
  afterEach(() => {
    world.pending = null
    resetFlyTransition()
  })

  it('새가 뒤에서 와 사람을 채고 앞으로 빠진다 — 원작 길이다', () => {
    expect(flyTransitionPose('off', 0).visible).toBe(false)

    // 채기 전(0.2초): 새는 벌써 보이고 **뒤에** 있는데 사람은 땅에 서 있다
    const before = flyTransitionPose('takeoff', 0.2)
    expect(before.visible).toBe(true)
    expect(before.bird.z).toBeLessThan(0)
    expect(before.rider.y).toBeCloseTo(0, 3)

    // 채고 난 뒤(0.45초): 사람이 뜨고 둘 다 앞으로 간다
    const after = flyTransitionPose('takeoff', 0.45)
    expect(after.rider.y).toBeGreaterThan(before.rider.y + 1)
    expect(after.bird.z).toBeGreaterThan(before.bird.z)
    expect(after.rider.z).toBeGreaterThan(0)

    // ⚠️ **사람이 새를 벗어나면 안 된다.** 앉는 자리는 새 원점 위 `seat`다
    const seat = after.bird.y + FLY_MOUNT.seat.y * BDSP_TO_WORLD
    expect(Math.abs(after.rider.y - seat)).toBeLessThan(0.5)
    expect(Math.abs(after.rider.z - after.bird.z)).toBeLessThan(0.5)

    // 내릴 때는 앞에서 온다
    expect(flyTransitionPose('landing', 0.05).bird.z).toBeGreaterThan(0)
  })

  it('queues the warp after takeoff and lands after the map consumes it', () => {
    expect(beginFlyTransition(TARGET)).toBe(true)
    expect(worldState.player.flying).toBe(true)
    tickFlyTransition(FLY_MOUNT.clip + 0.01)
    expect(flyTransitionPhase()).toBe('transit')
    expect(world.pending).toMatchObject({ to: 411, silent: true })
    world.pending = null
    tickFlyTransition(0.01)
    expect(flyTransitionPhase()).toBe('landing')
    tickFlyTransition(FLY_MOUNT.clip + 0.01)
    expect(flyTransitionPhase()).toBe('off')
    expect(worldState.player.flying).toBe(false)
  })
})
