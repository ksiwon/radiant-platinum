// 달콤한향기의 조우 (`WildEncounters_TrySweetScentEncounter`) — 관문이 없고 리펠이 못 막는다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { encounters, sweetScentEncounter, tileHasEncounterRate } from './encounterSystem'
import type { EncounterTable } from './encounter'
import { Behavior } from '../map/zone'
import { world, type MapHeader } from '../map/world'
import type { MapGrid } from '../map/grid'
import { worldState } from '../../state/worldState'
import { DATA, withData } from '../../data/romData.testkit'

const maybe = withData('encounters.json')

maybe('달콤한향기의 조우', () => {
  const tables = (JSON.parse(readFileSync(resolve(DATA, 'encounters.json'), 'utf8')) as { tables: EncounterTable[] }).tables
  const table = tables.find((t) => t.landRate > 0)!
  const saved = { maps: world.maps, mapId: world.mapId, grid: world.grid, tables: encounters.tables, mods: encounters.mods }

  function stand(behavior: number): void {
    world.maps = [{ encounters: 0 } as unknown as MapHeader]
    world.mapId = 0
    world.grid = { behavior: () => behavior } as unknown as MapGrid
    encounters.tables = [table]
    encounters.pending = null
    worldState.player.position.set(3.5, 0, 4.5)
  }

  afterEach(() => {
    world.maps = saved.maps; world.mapId = saved.mapId; world.grid = saved.grid
    encounters.tables = saved.tables; encounters.mods = saved.mods; encounters.pending = null
  })

  it('풀숲이면 반드시 나온다 — 리펠이 레벨 100이어도', () => {
    stand(Behavior.TALL_GRASS)
    encounters.mods = { ...encounters.mods, repelLevel: 100 }
    expect(tileHasEncounterRate()).toBe(true)
    for (let i = 0; i < 20; i++) {
      encounters.pending = null
      expect(sweetScentEncounter()).toBe(true)
      expect(encounters.pending).not.toBeNull()
    }
  })

  it('출현률이 없는 칸이면 안 건다', () => {
    stand(Behavior.NORMAL)
    expect(tileHasEncounterRate()).toBe(false)
    expect(sweetScentEncounter()).toBe(false)
    expect(encounters.pending).toBeNull()
  })
})
