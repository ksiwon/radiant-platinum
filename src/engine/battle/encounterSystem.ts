// 조우 시스템 — 풀숲을 밟을 때마다 판정 (DATA.md §2.8)
//
// 판정은 "타일이 바뀔 때"만 한다. 프레임마다 굴리면 같은 칸에 서 있어도 계속
// 판정이 돌아 60fps에서 초당 60번이 된다 — 원작의 걸음 단위와 전혀 다르다.
import { worldState } from '../../state/worldState'
import { world } from '../map/world'
import {
  encounterKind, newEncounterState, rollLand, rollWater, shouldEncounter,
  type EncounterTable, type EncountersEx, type Rng, type WildEncounter,
} from './encounter'
import { Behavior } from '../map/zone'
import { timeOfDayForHour } from '../map/timeOfDay'
import { MAP_TROPHY_GARDEN } from '../world/daily'
import { dateGate } from '../world/specialDates'
import {
  Flute, NO_LEAD, forcedSlot, higherLevelSlot, leadScaresOff, repelBlocks,
  speciesOf, walkRate, waterLevel, waterSpeciesOf, type FieldMods,
} from './encounterLead'

/** 아직 종족표가 없을 때. 타입을 모르면 자력·정전기가 안 걸린다 */
const NO_TYPES: readonly [number, number] = [-1, -1]

export const encounters = {
  /** 인카운터 표 183개. 씬이 로드해 넣는다 */
  tables: null as EncounterTable[] | null,
  /** 날마다 바뀌는 것들 (PARITY §6.11) — 빈티나·꿀나무·트로피가든·대습초원 */
  ex: null as EncountersEx | null,
  /**
   * 날마다 바뀌는 것 중 **조우표를 갈아 끼우는 값**. 씬이 넣어 준다
   * (`scene/stepSystem`).
   *
   * ⚠️ 여기서 세이브를 직접 못 읽는다 — `src/engine`은 스토어에 안 기댄다
   * (PLAN §3.2). 그래서 씬이 날짜를 넘길 때 이 칸도 같이 맞춘다
   */
  swarmAt: null as number | null,
  trophy: null as readonly (number | null)[] | null,
  /**
   * 선두 포켓몬·피리·리펠·오늘 날짜 (PARITY §1.22). 씬이 걸음마다 맞춘다.
   *
   * ⚠️ 기본값은 **아무 보정도 없는** 상태다. 씬이 안 넣어 줘도 조우는 그대로
   * 돌아야 한다 — 파티를 못 읽는다고 풀숲이 멈추면 안 된다
   */
  mods: {
    lead: NO_LEAD, weather: 0, flute: Flute.NONE, repelLevel: 0,
    month: 1, day: 1,
  } as FieldMods,
  /** 종족 번호 → 타입 둘. 자력·정전기가 본다. 씬이 종족표에서 넣어 준다 */
  typeOf: (() => NO_TYPES) as (species: number) => readonly [number, number],
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
    const raw = kind === 'surf' ? table.surf.rate : table.landRate
    // 선두 특성·피리·클리어부적이 출현률을 여기서 바꾼다 (PARITY §1.22)
    const mods = encounters.mods
    const rate = walkRate(raw, mods)
    // 긴 풀 위에서는 관문이 40에서 70으로 올라간다 — 원작이 그렇게 만든 자리라
    // 210번도로가 다른 도로보다 훨씬 자주 나온다
    const where = {
      veryTallGrass: behavior === Behavior.VERY_TALL_GRASS,
      cycling: worldState.player.cycling,
      date: (gate: number) => dateGate(gate, mods.month, mods.day),
    }
    if (!shouldEncounter(rate, state, encounters.rng, where)) return
    // ⚠️ **관문을 지난 순간 유예 구간이 다시 열린다.** 뒤에서 리펠이나 특성이
    // 막아도 마찬가지다 — 원작도 `encounterAttempts = 0`을 막힌 길에서까지
    // 지나간다. 안 그러면 리펠을 뿌린 동안 유예가 안 닫혀서, 리펠이 끝나는
    // 순간 다음 걸음에 곧바로 튀어나온다
    state = newEncounterState()

    const rng = encounters.rng
    const lead = mods.lead
    const typeOf = encounters.typeOf
    const got = kind === 'surf'
      ? rollWater(table.surf, rng, undefined, {
        pick: (t) => forcedSlot(waterSpeciesOf(t), lead, typeOf, rng),
        level: (min, max) => waterLevel(min, max, lead, rng),
      })
      : rollLand(table, rng, timeOfDayForHour(worldState.time.gameHour), {
        swarming: encounters.swarmAt === world.mapId,
        trophy: world.mapId === MAP_TROPHY_GARDEN ? encounters.trophy ?? undefined : undefined,
        pick: (land) => forcedSlot(speciesOf(land), lead, typeOf, rng),
        bump: (land, slot) => higherLevelSlot(land, lead, slot, rng),
      })

    // ⚠️ **레벨을 뽑은 다음에 막는다.** 날카로운눈·위협도 리펠도 야생의 레벨을
    // 봐야 판정이 된다 — 원작도 `TryGenerateWildMon` 안, 칸과 레벨을 정한
    // 뒤에서 둘을 부른다 (`wild_encounters.c` 1136·1140)
    if (got && (leadScaresOff(lead, got.level, rng) || repelBlocks(mods.repelLevel, got.level))) {
      return
    }
    encounters.pending = got
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
