// 한 칸 틈 앞에서 비껴 서 있어도 들어가는가 (`actor/player`의 모서리 보정)
//
// ⚠️ **사람이 못 드는 입구가 있었다.** 반지름 0.3의 네 모서리로 판정하므로 한 칸
// 틈은 칸 가운데 ±0.2 안에서만 지난다. 실측(2026-09-23 대표 구간 1·5판):
// 험한 샛길 입구(204번도로 남 (171,705)) 바로 아래에서 오른쪽으로 비껴 서서
// 북쪽을 3분 밀었는데 한 칸도 못 들었다. 원작은 칸 단위로 걸어 늘 가운데에 선다.
import { describe, it, expect } from 'vitest'
import { playerSystem } from './player'
import { activeZone } from '../map/zone'
import { worldState } from '../../state/worldState'

/** z 4번 줄이 벽이고 x 5번 칸만 뚫렸다. `gap`이 거짓이면 뚫린 데가 없다 */
const wallRow = (gap: boolean) => {
  const shut = (tx: number, tz: number) => tz === 4 && !(gap && tx === 5)
  return {
    isBlockedAtWorld: (x: number, z: number) => shut(Math.floor(x), Math.floor(z)),
    behaviorAtWorld: () => 0,
    heightAtWorld: () => 0,
    bakedHeightAtWorld: () => 0,
    behavior: () => 0,
    isBlocked: shut,
  }
}

function walk(x: number, mx: number, mz: number, gap = true, frames = 60) {
  activeZone.grid = wallRow(gap)
  const p = worldState.player
  p.position.set(x, 0, 5.5)
  p.prevPosition.copy(p.position)
  p.velocity.set(0, 0, 0)
  p.facing = Math.PI
  p.hop.active = false
  p.surfing = false
  p.cycling = false
  p.riding = false
  p.flying = false
  worldState.camera.mode = 'third'
  worldState.camera.yaw = 0
  worldState.input.move.set(mx, mz)
  for (let i = 0; i < frames; i++) playerSystem.fixedUpdate(1 / 60)
  worldState.input.move.set(0, 0)
  activeZone.grid = null
  return { x: p.position.x, z: p.position.z }
}

describe('한 칸 틈 — 모서리 보정', () => {
  it('가운데에서 0.3 비껴 서도 북쪽을 밀면 틈으로 들어간다', () => {
    const got = walk(5.8, 0, -1)
    expect(got.z).toBeLessThan(5) // z 4번 칸(틈)에 들었다
    expect(Math.abs(got.x - 5.5)).toBeLessThan(0.2)
  })

  it('왼쪽으로 비껴 서도 마찬가지다', () => {
    const got = walk(5.22, 0, -1)
    expect(got.z).toBeLessThan(5)
  })

  it('가운데에 섰으면 예전 그대로 곧장 들어간다', () => {
    expect(walk(5.5, 0, -1).z).toBeLessThan(5)
  })

  it('틈이 없으면(진짜 벽) 옆으로도 안 끌린다', () => {
    const got = walk(5.8, 0, -1, false)
    expect(got.x).toBeCloseTo(5.8, 5)
    expect(got.z).toBeGreaterThan(4.9)
  })

  it('0.35보다 멀리 비껴 섰으면 안 끌린다 — 몸 절반 넘게 옆 벽 앞이다', () => {
    const got = walk(5.9, 0, -1)
    expect(got.x).toBeCloseTo(5.9, 5)
    expect(got.z).toBeGreaterThan(4.9)
  })

  it('대각선으로 밀 때는 안 끌린다 — 벽을 따라 미끄러지는 것은 그대로다', () => {
    const got = walk(5.8, 1, -1, false, 20)
    expect(got.x).toBeGreaterThan(5.8) // 동쪽으로 미끄러졌다
    expect(got.z).toBeGreaterThan(4.9)
  })
})
