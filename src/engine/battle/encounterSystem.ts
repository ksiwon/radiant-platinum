// 조우 시스템 — 풀숲을 밟을 때마다 판정 (DATA.md §2.8)
//
// 판정은 "타일이 바뀔 때"만 한다. 프레임마다 굴리면 같은 칸에 서 있어도 계속
// 판정이 돌아 60fps에서 초당 60번이 된다 — 원작의 걸음 단위와 전혀 다르다.
import { worldState } from '../../state/worldState'
import { world } from '../map/world'
import {
  isEncounterTile, rollLand, shouldEncounter,
  type EncounterTable, type Rng, type WildEncounter,
} from './encounter'

export const encounters = {
  /** 인카운터 표 183개. 씬이 로드해 넣는다 */
  tables: null as EncounterTable[] | null,
  /** 씬이 처리해야 할 조우. 처리 후 null로 되돌린다 */
  pending: null as WildEncounter | null,
  /** 판정을 멈추는 스위치 — 전투 중이거나 워프 전이 중일 때 */
  suspended: false,
  rng: Math.random as Rng,
}

let lastTile = -1

/** 현재 맵의 인카운터 표. 없으면 null */
function tableForCurrentMap(): EncounterTable | null {
  if (!encounters.tables || !world.maps || world.mapId < 0) return null
  const idx = world.maps[world.mapId]?.encounters
  return idx == null ? null : (encounters.tables[idx] ?? null)
}

export const encounterSystem = {
  fixedUpdate() {
    const grid = world.grid
    if (!grid || encounters.suspended || encounters.pending || world.pending) return

    const p = worldState.player.position
    const tx = Math.floor(p.x), tz = Math.floor(p.z)
    const key = tz * grid.tileWidth + tx
    if (key === lastTile) return
    lastTile = key

    if (!isEncounterTile(grid.behavior(tx, tz))) return
    const table = tableForCurrentMap()
    if (!table || !shouldEncounter(table.landRate, encounters.rng)) return
    encounters.pending = rollLand(table, encounters.rng)
  },
}

/** 맵이 바뀌면 "같은 칸" 판정을 초기화한다 — 안 그러면 도착 칸을 밟은 것으로 안 친다 */
export function resetEncounterTile() {
  lastTile = -1
}
