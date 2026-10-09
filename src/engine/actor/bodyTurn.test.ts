// 몸이 목표 자세로 도는 법 — 일정한 빠르기와 맵 갈이 · 이어하기의 앉힘 (D5)
import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { PLATFORM_CEILING, PLATFORM_FLOOR, PLATFORM_WEST_WALL } from '../world/distortion'
import { surfaceQuaternion } from './distortionSurface'
import { PLAYER_TURN_RATE, snapPlayerPose, stepBodyRotation, takePlayerPoseSnap } from './bodyTurn'

const frameOf = (kind: number) => ({ kind, lock: 0, lockAxis: 'y' as const })

describe('stepBodyRotation', () => {
  it('일정한 빠르기로 돈다 — 한 프레임에 PLAYER_TURN_RATE / 60', () => {
    const cur = new Quaternion()
    const target = surfaceQuaternion(frameOf(PLATFORM_WEST_WALL), 0, new Quaternion())
    stepBodyRotation(cur, target, 1 / 60, false)
    expect(cur.angleTo(new Quaternion())).toBeCloseTo(PLAYER_TURN_RATE / 60, 6)
    // 쭉 돌면 목표에 닿고 넘치지 않는다
    for (let i = 0; i < 60; i++) stepBodyRotation(cur, target, 1 / 60, false)
    expect(cur.angleTo(target)).toBeLessThan(1e-4)
  })

  it('앉히면 돌리지 않고 곧바로 목표다 — 벽 · 천장에서 이어하거나 벽에서 나설 때', () => {
    for (const kind of [PLATFORM_WEST_WALL, PLATFORM_CEILING, PLATFORM_FLOOR]) {
      const cur = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 2)
      const target = surfaceQuaternion(frameOf(kind), 0.7, new Quaternion())
      stepBodyRotation(cur, target, 1 / 60, true)
      expect(cur.angleTo(target), `kind ${kind}`).toBeLessThan(1e-6)
    }
  })
})

describe('snapPlayerPose', () => {
  it('부탁은 한 번 읽으면 풀린다', () => {
    expect(takePlayerPoseSnap()).toBe(false)
    snapPlayerPose()
    expect(takePlayerPoseSnap()).toBe(true)
    expect(takePlayerPoseSnap()).toBe(false)
  })
})
