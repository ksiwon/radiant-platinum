// 알이 깬 걸음의 야생 판정 (`Field_ProcessStep`이 참을 돌려준 걸음 — `field_control.c` 201·228)
//
// 원작은 그 걸음에서 돌아와 야생을 안 굴린다. 우리는 부화 장면이 떠 있는 동안 지나간 칸을 **소비만** 한다 —
// 멈춰만 두면(`suspended`) 장면이 닫힌 뒤 그 칸을 늦게 굴린다. 실측(연쇄 `446138a3` 칸 4): 깬 걸음 다음 틱에
// 배틀이 열려 「토게피의 이름은?」 창이 배틀 위에 떠서 섰다
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encounters, encounterSystem, resetEncounterTile } from './encounterSystem'
import type { EncounterTable } from './encounter'
import { Behavior } from '../map/zone'
import { world, type MapHeader } from '../map/world'
import type { MapGrid } from '../map/grid'
import { worldState } from '../../state/worldState'

function fakeTable(): EncounterTable {
  const land = Array.from({ length: 12 }, (_, i) => ({ level: 10 + i, species: 100 + i }))
  return {
    landRate: 255, land, swarm: [0, 0], day: [0, 0], night: [0, 0], radar: [0, 0, 0, 0],
    forms: [0, 0], unownTable: 0,
    surf: { rate: 0, slots: [] }, oldRod: { rate: 0, slots: [] }, goodRod: { rate: 0, slots: [] }, superRod: { rate: 0, slots: [] },
  }
}

describe('알이 깬 걸음은 야생을 안 굴린다', () => {
  const saved = {
    maps: world.maps, mapId: world.mapId, grid: world.grid, pending: world.pending,
    tables: encounters.tables, rng: encounters.rng, skip: encounters.skip, partner: encounters.partner,
  }
  let rolls = 0

  beforeEach(() => {
    world.maps = [{ encounters: 0 } as unknown as MapHeader]
    world.mapId = 0
    world.grid = { behavior: () => Behavior.TALL_GRASS } as unknown as MapGrid
    world.pending = null
    encounters.tables = [fakeTable()]
    encounters.pending = null
    encounters.suspended = false
    encounters.partner = 0
    rolls = 0
    encounters.rng = () => { rolls++; return 0.99 }
    worldState.player.cycling = false
    worldState.player.position.set(5.5, 0, 5.5)
    resetEncounterTile()
    encounterSystem.fixedUpdate()
  })

  afterEach(() => {
    Object.assign(world, { maps: saved.maps, mapId: saved.mapId, grid: saved.grid, pending: saved.pending })
    Object.assign(encounters, {
      tables: saved.tables, rng: saved.rng, skip: saved.skip, partner: saved.partner, pending: null, suspended: false,
    })
  })

  it('장면이 떠 있는 동안 지나간 칸은 굴리지 않고, 닫힌 뒤에도 늦게 굴리지 않는다', () => {
    encounters.skip = () => true
    worldState.player.position.set(6.5, 0, 5.5)
    encounterSystem.fixedUpdate()
    expect(rolls).toBe(0)
    encounters.skip = () => false
    encounterSystem.fixedUpdate()
    expect(rolls).toBe(0)
  })

  it('장면이 없으면 그 칸을 굴린다', () => {
    encounters.skip = () => false
    worldState.player.position.set(6.5, 0, 5.5)
    encounterSystem.fixedUpdate()
    expect(rolls).toBeGreaterThan(0)
  })
})
