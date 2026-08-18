// 조우 시스템 — 풀숲을 밟을 때마다 판정 (DATA.md §2.8)
//
// 판정은 "타일이 바뀔 때"만 한다. 프레임마다 굴리면 같은 칸에 서 있어도 계속
// 판정이 돌아 60fps에서 초당 60번이 된다 — 원작의 걸음 단위와 전혀 다르다.
import { worldState } from '../../state/worldState'
import { StepTrace } from '../actor/stepTrace'
import { world } from '../map/world'
import {
  encounterKind, newEncounterState, rollLand, rollWater, shouldEncounter, wildForm,
  type EncounterTable, type EncountersEx, type Rng, type WildEncounter,
} from './encounter'
import { Behavior } from '../map/zone'
import type { Status } from '../pokemon/instance'
import { timeOfDayForHour } from '../map/timeOfDay'
import { MAP_TROPHY_GARDEN } from '../world/daily'
import { dateGate } from '../world/specialDates'
import type { PatchStep as RadarStep } from '../world/pokeRadar'
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
  /**
   * 지금 이 맵에 배회가 나오는가 (PARITY §6.3). 씬이 세이브를 보고 답한다.
   *
   * ⚠️ **여기서 세이브를 못 읽는다** — `src/engine`은 스토어에 안 기댄다
   * (PLAN §3.2). 빈 채로 두면 배회가 없는 게임이 되고, 그래도 풀숲은 돈다
   */
  roamerHere: null as ((mapId: number, rng: Rng) => WildEncounter | null) | null,
  /**
   * 지금 선 칸이 레이더 무더기인가 (PARITY §6.5). 씬이 사슬을 보고 답한다.
   *
   * 답이 오면 그 걸음은 **관문을 안 보고** 반드시 조우가 되고, 배회도 안 나온다
   */
  radarStep: null as ((x: number, z: number) => RadarStep | null) | null,
  /**
   * 뽑은 조우를 사슬이 손본다 (`CreateWildMon_FromRadar*`).
   *
   * 이을 판이면 묶어 둔 종·레벨을 그대로 내고, 아니면 뽑은 것으로 사슬을
   * 다시 묶는다. 색이 다른 개체도 여기서 정해진다
   */
  radarEncounter: null as
    ((step: RadarStep, got: WildEncounter | null) => WildEncounter | null) | null,
  /** 야생전이 끝났다. 사슬이 살았으면 무더기를 다시 뿌린다 */
  radarAfterBattle: null as ((result: 'win' | 'captured' | 'other') => void) | null,
  /**
   * 야생전이 끝났다. 배회의 남은 체력을 적고 자리를 흩는다 (PARITY §6.3).
   *
   * 조우와 같은 자리에 두는 이유는 원작이 그렇기 때문이다 — 배회는 무리·꿀나무·
   * 리펠 걸음과 **같은 구조체**(`SpecialEncounter`)에 산다
   */
  roamerAfterBattle: null as ((got: {
    /** 방금 상대한 배회 자리. 배회가 아니었으면 null */
    met: number | null
    mapId: number
    hp: number
    status: Status
    outcome: 'win' | 'caught' | 'other'
  }) => void) | null,
  /**
   * 사파리 판에서 **마지막 볼을 헛던졌다** (PARITY §2.19).
   *
   * 원작은 배틀이 끝나면서 곧바로 특별 자리로 돌려보내는데, 그 「밖으로
   * 나가는 글과 워프」는 롬의 안내원 스크립트가 갖고 있다 — 씬이 그것을 돌린다
   */
  safariOutOfBalls: null as (() => void) | null,
  /** 씬이 처리해야 할 조우. 처리 후 null로 되돌린다 */
  pending: null as WildEncounter | null,
  /** 판정을 멈추는 스위치 — 전투 중이거나 워프 전이 중일 때 */
  suspended: false,
  rng: Math.random as Rng,
}

/**
 * 지나온 칸을 세는 자 (PARITY §1.1).
 *
 * ⚠️ **「그 틱의 칸 하나」만 보면 안 된다.** 달리면 한 틱에 축마다 0.094칸을
 * 가므로 x와 z 경계를 같은 틱에 넘으면 가운데 칸은 판정 자체가 안 돈다 —
 * 대각선으로 풀숲 모서리를 스치면 그 칸의 조우가 통째로 빠졌다
 */
const trace = new StepTrace()
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
    // ⚠️ **칸마다 한 번씩이다.** 지나온 칸이 여럿이면 여럿을 묻되, 하나가
    // 나오면 거기서 멈춘다 — 한 틱에 조우를 두 번 굴리면 원작과 어긋난다
    for (const tile of trace.advance(p.x, p.z).tiles) {
      rollAt(grid, tile.x, tile.z)
      if (encounters.pending) return
    }
  },
}

/** 그 칸을 밟았다. 조우가 났으면 `encounters.pending`에 담긴다 */
function rollAt(grid: NonNullable<typeof world.grid>, tx: number, tz: number): void {
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
  // ⚠️ **무더기를 밟으면 관문을 안 본다** (PARITY §6.5). 원작이
  // `gettingEncounter = TRUE`로 덮어쓴다 — 흔들리는 풀은 반드시 나온다.
  // 그리고 그 판에서는 배회도 안 물어본다
  const radar = kind === 'land' ? encounters.radarStep?.(tx, tz) ?? null : null
  if (radar === null && !shouldEncounter(rate, state, encounters.rng, where)) return
  // ⚠️ **관문을 지난 순간 유예 구간이 다시 열린다.** 뒤에서 리펠이나 특성이
  // 막아도 마찬가지다 — 원작도 `encounterAttempts = 0`을 막힌 길에서까지
  // 지나간다. 안 그러면 리펠을 뿌린 동안 유예가 안 닫혀서, 리펠이 끝나는
  // 순간 다음 걸음에 곧바로 튀어나온다
  state = newEncounterState()

  const rng = encounters.rng
  // ⚠️ **배회가 야생보다 먼저다.** 원작도 칸을 뽑기 전에 물어본다
  // (`TryEncounterRoamer`) — 여기 있으면 절반은 배회가 나오고, 그 판에서는
  // 표의 칸을 아예 안 굴린다. 뒤에 두면 배회는 「가끔 야생 대신」이 아니라
  // 「야생을 다 뽑고 나서 덮어쓰는 것」이 되어 확률이 달라진다
  const roam = radar === null ? encounters.roamerHere?.(world.mapId, rng) ?? null : null
  if (roam) {
    // 리펠은 배회에도 걸린다. 막히면 그 걸음은 아무 일도 없다 —
    // 뒤의 야생으로 넘어가지 않는다
    if (!repelBlocks(mods.repelLevel, roam.level)) encounters.pending = roam
    return
  }
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
      radarHard: radar?.shake === 1,
    })

  // 레이더 판은 사슬이 뒤를 맡는다 — 같은 종이면 이어 내고, 다른 종이면
  // 사슬이 끊긴다. **리펠도 특성도 이 판은 못 막는다**(원작이 레이더 갈래에서
  // 그 둘을 안 부른다)
  if (radar !== null) {
    encounters.pending = encounters.radarEncounter?.(radar, got) ?? got
    return
  }

  // ⚠️ **레벨을 뽑은 다음에 막는다.** 날카로운눈·위협도 리펠도 야생의 레벨을
  // 봐야 판정이 된다 — 원작도 `TryGenerateWildMon` 안, 칸과 레벨을 정한
  // 뒤에서 둘을 부른다 (`wild_encounters.c` 1136·1140)
  if (got && (leadScaresOff(lead, got.level, rng) || repelBlocks(mods.repelLevel, got.level))) {
    return
  }
  // 모습은 맨 마지막에 정한다 — 원작도 개체를 다 만든 뒤 파티에 넣기 직전이다
  if (got) got.form = wildForm(table, got.species, rng)
  encounters.pending = got
}

/**
 * 맵이 바뀌면 "같은 칸" 판정을 초기화한다 — 안 그러면 도착 칸을 밟은 것으로 안 친다.
 *
 * 유예 구간도 같이 연다. 원작도 맵 이동 직후 몇 걸음은 조우를 억누른다
 */
export function resetEncounterTile() {
  const p = worldState.player.position
  trace.reset(p.x, p.z)
  state = newEncounterState()
}
