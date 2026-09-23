// 막힌 쪽으로도 도는가 (`actor/player`의 제자리 돌기 갈래)
//
// ⚠️ **사람이 못 깨는 자리가 있었다.** 통행 판정이 거절한 축은 속도를 0으로
// 지우는데(`refusedX`·`refusedZ`), 3인칭 얼굴 갱신이 **속도만** 보고 있었다.
// 그래서 밟을 수 없는 것 쪽으로는 방향키를 아무리 눌러도 얼굴이 안 돌았다 —
// 실측(2026-09-22 배지4 탐침 9판, 장막시티 체육관): (2,14)에 서서 남쪽을 본 채
// 오른쪽을 다섯 번 눌러도 `facing`이 남쪽이라 동쪽 샌드백을 영영 못 찼다.
//
// 원작은 묻지도 않고 돈다 — `PlayerAvatar_UpdateMoveState`가 `curDir != nextDir`
// 이고 걷는 중이 아니면 `AVATAR_MOVE_STATE_TURNING`으로 보내고, 그 갈래는
// 막혔는지를 안 본다 (`player_move.c`).
import { describe, it, expect } from 'vitest'
import { playerSystem } from './player'
import { activeZone } from '../map/zone'
import { worldState } from '../../state/worldState'

/** `x >= 3`이 벽인 판. 그 서쪽은 다 걸을 수 있다 */
const room = {
  isBlockedAtWorld: (x: number) => x >= 3,
  behaviorAtWorld: () => 0,
  heightAtWorld: () => 0,
  bakedHeightAtWorld: () => 0,
  behavior: () => 0,
  isBlocked: (tx: number) => tx >= 3,
}

/**
 * 원작 방향 번호로 접는다 — 남 0 · 동 1 · 북 2 · 서 3.
 *
 * `facing`은 라디안이고 `atan2(vx, vz)`라 0이 남쪽이다 (`player.ts`의
 * `FACING_STEP`). 라디안을 그대로 비교하면 −π와 π가 갈려서 북쪽이 두 값이 된다
 */
const quarter = (facing: number): number =>
  ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4

/**
 * 벽 **코앞**에 세우고 한 방향으로 민다. 선 자리와 얼굴을 준다.
 *
 * x를 2.69에 두는 것이 요점이다 — 반지름 0.3이라 지금 자리의 동쪽 모서리는
 * 2.99라 안 막혔고(그래서 `stuck` 갈래로 안 빠진다), 동쪽으로 한 뼘만 가도
 * 3.0을 넘어 거절당한다. 「설 자리에 서 있는데 앞이 막혔다」가 이 모양이다
 */
function shove(mx: number, mz: number, facing = 0, mode: 'first' | 'third' = 'third') {
  activeZone.grid = room
  const p = worldState.player
  p.position.set(2.69, 0, 0.5)
  p.prevPosition.copy(p.position)
  p.velocity.set(0, 0, 0)
  p.facing = facing
  p.hop.active = false
  p.surfing = false
  p.cycling = false
  p.riding = false
  p.flying = false
  worldState.camera.mode = mode
  worldState.camera.yaw = 0
  worldState.input.move.set(mx, mz)
  for (let i = 0; i < 30; i++) playerSystem.fixedUpdate(1 / 60)
  worldState.input.move.set(0, 0)
  activeZone.grid = null
  worldState.camera.mode = 'third'
  return { x: p.position.x, z: p.position.z, dir: quarter(p.facing) }
}

describe('막힌 쪽으로도 돈다', () => {
  it('남쪽을 보고 서서 동쪽 벽을 밀면 동쪽을 본다', () => {
    const got = shove(1, 0)
    expect(got.dir).toBe(1) // 동
    expect(got.x).toBeCloseTo(2.69, 5) // 한 칸도 안 갔다
  })

  it('북쪽을 보고 서 있어도 마찬가지다 — 어느 얼굴에서 와도 돈다', () => {
    expect(shove(1, 0, Math.PI).dir).toBe(1)
  })

  it('걸을 수 있는 쪽은 예전 그대로 — 간 쪽을 본다', () => {
    const got = shove(-1, 0)
    expect(got.dir).toBe(3) // 서
    expect(got.x).toBeLessThan(2.69)
  })

  it('안 밀면 얼굴이 그대로다 — 서 있는 사람이 혼자 돌지 않는다', () => {
    expect(shove(0, 0, Math.PI / 2).dir).toBe(1)
    expect(shove(0, 0, 0).dir).toBe(0)
  })

  it('1인칭은 카메라가 곧 얼굴이라 해당 없다', () => {
    // yaw 0이면 북쪽을 본다 (`input/mouse`의 `facingFromYaw`). 동쪽 벽을 밀어도
    // 얼굴은 시선이 정한다 — 3인칭이었다면 위 시험대로 동쪽이 됐을 자리다
    expect(shove(1, 0, 0, 'first').dir).toBe(2)
  })
})
