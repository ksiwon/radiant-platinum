// 조우 시스템 — 풀숲을 밟을 때마다 판정 (DATA.md §2.8)
//
// 판정은 "타일이 바뀔 때"만 한다. 프레임마다 굴리면 같은 칸에 서 있어도 계속
// 판정이 돌아 60fps에서 초당 60번이 된다 — 원작의 걸음 단위와 전혀 다르다.
import { worldState } from '../../state/worldState'
import { world } from '../map/world'
import {
  encounterKind, newEncounterState, rollLand, rollWater, shouldEncounter,
  type EncounterTable, type Rng, type WildEncounter,
} from './encounter'
import { Behavior } from '../map/zone'
import { timeOfDayForHour } from '../map/timeOfDay'

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
/** 조우 직후·맵 이동 직후의 유예 구간을 세는 곳 */
let state = newEncounterState()

/** 현재 맵의 인카운터 표. 없으면 null */
export function tableForCurrentMap(): EncounterTable | null {
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

    const behavior = grid.behavior(tx, tz)
    const kind = encounterKind(behavior)
    if (kind === null) return
    const table = tableForCurrentMap()
    if (!table) return
    // 물 위에서는 파도타기 표와 그 출현률을 본다. 걷는 표와 출현률이 따로라
    // `landRate`만 보면 육상 조우가 없는 호수 위에서는 아무것도 안 나온다
    const rate = kind === 'surf' ? table.surf.rate : table.landRate
    // 긴 풀 위에서는 관문이 40에서 70으로 올라간다 — 원작이 그렇게 만든 자리라
    // 210번도로가 다른 도로보다 훨씬 자주 나온다
    const where = {
      veryTallGrass: behavior === Behavior.VERY_TALL_GRASS,
      cycling: worldState.player.cycling,
    }
    if (!shouldEncounter(rate, state, encounters.rng, where)) return
    // 나왔으면 유예 구간을 다시 연다. 배틀을 끝내고 나오자마자 또 튀어나오면
    // 풀숲을 건널 수가 없다 — 원작도 여기서 카운터를 0으로 되돌린다
    state = newEncounterState()
    encounters.pending = kind === 'surf'
      ? rollWater(table.surf, encounters.rng)
      : rollLand(table, encounters.rng, timeOfDayForHour(worldState.time.gameHour))
  },
}

/**
 * 맵이 바뀌면 "같은 칸" 판정을 초기화한다 — 안 그러면 도착 칸을 밟은 것으로 안 친다.
 *
 * 유예 구간도 같이 연다. 원작도 맵 이동 직후 몇 걸음은 조우를 억누른다
 */
export function resetEncounterTile() {
  lastTile = -1
  state = newEncounterState()
}
