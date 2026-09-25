// 턱은 **미는 쪽**으로만 뛴다 — 남은 속도로 뛰지 않는다 (REPAIR §110 · `actor/player`)
//
// ⚠️ 턱 바로 앞 칸에 들어서며 손을 떼도 뛰어내렸다. 칸 한가운데까지 미끄러져 가는
// 속도가 남아 있고, 그 부호만 보고 뛰었기 때문이다. 실측(탐침 p4·p5): 천관산 1F 남
// (22,10)에서 아래로 걸어와 멈추려 해도 (22,11) 턱을 넘어 되돌아올 수 없는 못가로
// 떨어져, 파도타기 세 번짜리 한 바퀴를 되풀이했다.
import { describe, it, expect } from 'vitest'
import { playerSystem } from './player'
import { MapGrid } from '../map/grid'
import { activeZone, Behavior } from '../map/zone'
import { worldState } from '../../state/worldState'

/** z 6번 줄이 남쪽으로 뛰는 턱이다. 나머지는 모두 트인 바닥 */
function ledgeRow(): MapGrid {
  const behavior = (_tx: number, tz: number) => (tz === 6 ? Behavior.LEDGE_SOUTH : 0)
  const shut = (_tx: number, tz: number) => tz === 6
  const fake = {
    isBlockedAtWorld: (x: number, z: number) => shut(Math.floor(x), Math.floor(z)),
    behaviorAtWorld: (x: number, z: number) => behavior(Math.floor(x), Math.floor(z)),
    heightAtWorld: () => 0,
    bakedHeightAtWorld: () => 0,
    behavior,
    isBlocked: shut,
    zoneAt: () => -1,
  }
  // 턱 판정은 `MapGrid`일 때만 한다 — 자료 없이 그 갈래를 타려고 원형만 빌린다
  return Object.assign(Object.create(MapGrid.prototype) as MapGrid, fake)
}

function reset(z: number) {
  const p = worldState.player
  p.position.set(5.5, 0, z)
  p.prevPosition.copy(p.position)
  p.velocity.set(0, 0, 0)
  p.facing = 0
  p.hop.active = false
  p.surfing = false
  p.cycling = false
  p.riding = false
  p.flying = false
  worldState.camera.mode = 'third'
  worldState.camera.yaw = 0
}

const run = (frames: number) => {
  for (let i = 0; i < frames; i++) playerSystem.fixedUpdate(1 / 60)
}

describe('턱 — 미는 쪽으로만 뛴다', () => {
  it('턱 앞 칸에 들어서며 손을 떼면 그 칸에 선다', () => {
    activeZone.grid = ledgeRow()
    reset(4.5)
    const p = worldState.player
    worldState.input.move.set(0, 1)
    // 턱 앞 칸(z 5)에 막 들어설 때까지 민다
    for (let i = 0; i < 120 && Math.floor(p.position.z) < 5; i++) run(1)
    expect(Math.floor(p.position.z)).toBe(5)
    worldState.input.move.set(0, 0)
    run(90)
    activeZone.grid = null
    expect(p.hop.active).toBe(false)
    expect(p.position.z).toBeLessThan(6)
  })

  it('턱 앞 칸에서 턱 쪽을 밀면 뛰어넘는다', () => {
    activeZone.grid = ledgeRow()
    reset(5.5)
    const p = worldState.player
    worldState.input.move.set(0, 1)
    run(60)
    worldState.input.move.set(0, 0)
    run(30)
    activeZone.grid = null
    expect(p.position.z).toBeGreaterThan(7)
  })
})

describe('턱 — 앞 칸 가운데에 닿고서야 뛴다', () => {
  it('턱 앞 칸에 들어서고 몇 프레임 더 쥐었다 떼도 뛰지 않는다', () => {
    activeZone.grid = ledgeRow()
    reset(4.5)
    const p = worldState.player
    worldState.input.move.set(0, 1)
    for (let i = 0; i < 120 && Math.floor(p.position.z) < 5; i++) run(1)
    // 칸 가운데(5.5)에 닿기 전까지 더 쥔다 — 원작에서는 아직 그 칸으로 드는 걸음 중이다
    while (p.position.z < 5.4) run(1)
    worldState.input.move.set(0, 0)
    run(90)
    activeZone.grid = null
    expect(p.hop.active).toBe(false)
    expect(p.position.z).toBeLessThan(6)
  })

  it('계속 쥐고 있으면 가운데를 지나며 뛴다', () => {
    activeZone.grid = ledgeRow()
    reset(4.5)
    const p = worldState.player
    worldState.input.move.set(0, 1)
    run(90)
    worldState.input.move.set(0, 0)
    run(30)
    activeZone.grid = null
    expect(p.position.z).toBeGreaterThan(7)
  })
})
