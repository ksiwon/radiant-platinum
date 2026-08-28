// 벽 안에 서 버렸을 때 어디로 갈 수 있는가 (`actor/player`의 `standableSpot` 갈래)
//
// ⚠️ **여기가 맵뚫의 실제 출구였다.** 벽 안에 서면 판정을 통째로 끄고 있었는데,
// 판 밖은 전부 막힌 칸이라 한 번 나가면 그 상태가 영영 풀리지 않는다 — 검은
// 공간을 끝까지 걸어 다니게 된다. 실측(용식이 집 412번 맵): 딴 맵의 장면이
// 주인공을 6,11에 세웠고 그 칸이 벽이라, 거기서부터 사방으로 걸어 나갔다.
//
// 고친 뒤에 재는 것은 둘이다:
//  ① 나가는 쪽으로만 간다 — 더 깊이 들어가는 걸음은 거절한다
//  ② 나갈 자리가 아예 없으면 옛 안전망대로 다 연다 (갇히는 것이 더 나쁘다)
import { describe, it, expect } from 'vitest'
import { playerSystem } from './player'
import { activeZone } from '../map/zone'
import { worldState } from '../../state/worldState'

/** `x >= 3`이 벽인 판. 그 서쪽은 걸을 수 있다 */
const room = {
  isBlockedAtWorld: (x: number) => x >= 3,
  behaviorAtWorld: () => 0,
  heightAtWorld: () => 0,
  bakedHeightAtWorld: () => 0,
  behavior: () => 0,
  isBlocked: (tx: number) => tx >= 3,
}

/** 사방이 벽인 판 — 설 자리가 없다 */
const solid = { ...room, isBlockedAtWorld: () => true, isBlocked: () => true }

/** 벽 속 5.5,0.5에 세우고 한 방향으로 1초 민다. 간 거리를 준다 */
function shove(grid: typeof room, mx: number, mz: number): { x: number; z: number } {
  activeZone.grid = grid
  const p = worldState.player
  p.position.set(5.5, 0, 0.5)
  p.prevPosition.copy(p.position)
  p.velocity.set(0, 0, 0)
  p.hop.active = false
  p.surfing = false
  worldState.camera.mode = 'third'
  worldState.input.move.set(mx, mz)
  for (let i = 0; i < 60; i++) playerSystem.fixedUpdate(1 / 60)
  worldState.input.move.set(0, 0)
  activeZone.grid = null
  return { x: p.position.x, z: p.position.z }
}

describe('벽 안에서는 나오는 쪽으로만 걷는다', () => {
  it('더 깊이는 못 간다', () => {
    // 동(벽 안쪽)·남·북 — 설 자리(x<3)에서 멀어지는 걸음이라 전부 거절이다
    expect(shove(room, 1, 0).x).toBe(5.5)
    expect(shove(room, 0, 1).z).toBe(0.5)
    expect(shove(room, 0, -1).z).toBe(0.5)
  })

  it('나가는 쪽으로는 걸어 나온다', () => {
    // 서쪽이 설 자리다. 벗어난 뒤로는 평범한 걸음이라 그대로 서쪽으로 간다
    const out = shove(room, -1, 0)
    expect(out.x).toBeLessThan(3)
    expect(out.z).toBe(0.5)
  })

  it('나갈 자리가 아예 없으면 다 연다 — 갇히는 것이 맵뚫보다 나쁘다', () => {
    expect(shove(solid, 1, 0).x).toBeGreaterThan(5.5)
    expect(shove(solid, -1, 0).x).toBeLessThan(5.5)
  })
})
