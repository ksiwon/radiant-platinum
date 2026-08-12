// 진화 (PARITY §3.1) — `src/pokemon.c`의 `Pokemon_GetEvolutionTargetSpecies`.
//
// 자료는 처음부터 다 있었다: 507종 중 229종이 246갈래를 갖고 있고 방법은
// 스물여섯이다(`generated/evolution_methods.txt`). 없던 것은 **부르는 자**다.
//
// 옮기면서 지어낸 값이 하나도 없다는 것이 중요하다 — 문턱 220도, 변함없는돌의
// 홀드 효과 64도, 자력·이끼바위·얼음바위가 붙는 맵 스물하나도 전부 원작이
// 적어 둔 것이다. 특히 **맵 표는 짐작으로 못 만든다**: 천관산이 여덟 개 층이
// 아니라 열다섯 개 헤더로 갈려 있다.
import type { Evolution, Species } from '../../data/schema'
import { genderOf, statsOf, type PokemonInstance } from './instance'

/**
 * `enum EvolutionMethod`. 줄 번호가 곧 값이다
 * (`generated/evolution_methods.txt`).
 */
export const Evo = {
  NONE: 0,
  LEVEL_HAPPINESS: 1,
  LEVEL_HAPPINESS_DAY: 2,
  LEVEL_HAPPINESS_NIGHT: 3,
  LEVEL: 4,
  TRADE: 5,
  TRADE_WITH_HELD_ITEM: 6,
  USE_ITEM: 7,
  LEVEL_ATK_GT_DEF: 8,
  LEVEL_ATK_EQ_DEF: 9,
  LEVEL_ATK_LT_DEF: 10,
  LEVEL_PID_LOW: 11,
  LEVEL_PID_HIGH: 12,
  LEVEL_NINJASK: 13,
  LEVEL_SHEDINJA: 14,
  LEVEL_BEAUTY: 15,
  USE_ITEM_MALE: 16,
  USE_ITEM_FEMALE: 17,
  LEVEL_WITH_HELD_ITEM_DAY: 18,
  LEVEL_WITH_HELD_ITEM_NIGHT: 19,
  LEVEL_KNOW_MOVE: 20,
  LEVEL_SPECIES_IN_PARTY: 21,
  LEVEL_MALE: 22,
  LEVEL_FEMALE: 23,
  LEVEL_MAGNETIC_FIELD: 24,
  LEVEL_MOSS_ROCK: 25,
  LEVEL_ICE_ROCK: 26,
} as const
export type EvoMethod = (typeof Evo)[keyof typeof Evo]

/** 무엇이 진화를 걸었는가 (`enum EvolutionClass`) */
export const EvoClass = {
  /** 레벨이 올랐다 — 배틀 뒤·희귀사탕 */
  LEVEL: 0,
  /** 교환했다 */
  TRADE: 1,
  /** 도구를 썼다 */
  ITEM: 3,
} as const
export type EvoClassId = (typeof EvoClass)[keyof typeof EvoClass]

/** `EVOLVE_FRIENDSHIP_THRESHOLD` (`include/constants/pokemon.h`) */
export const FRIENDSHIP_THRESHOLD = 220

/** `HOLD_EFFECT_NO_EVOLVE` — 변함없는돌 (도구 229) */
export const HOLD_EFFECT_NO_EVOLVE = 64

/** 케이시의 진화형. **변함없는돌을 무시한다** — 원작이 이 종만 예외로 뒀다 */
const SPECIES_KADABRA = 64

/** `SPECIES_SHEDINJA`. 진화가 아니라 **덤으로 생기는** 마리다 */
export const SPECIES_SHEDINJA = 292

/** 껍질몬을 만들 때 드는 몬스터볼 (`ITEM_POKE_BALL`) */
export const ITEM_POKE_BALL = 4

/**
 * 맵이 거는 특수 진화 (`MapHeader_GetMapEvolutionMethod`).
 *
 * 맵 번호는 `generated/map_headers.txt`의 **줄 번호 − 1**이다. 그 규칙은
 * 세이브의 시작 자리(415 = 주인공 집 2층)로 이미 확인돼 있다.
 *
 * ⚠️ 천관산은 헤더가 열다섯 개다. "1층·2층…"으로 짐작하면 절반이 빠진다
 */
/** 자력이 걸리는 맵 — 천관산 열다섯 + 창 기둥 둘 + 시작의 언덕 둘 */
const MAGNETIC_MAPS = [
  207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221,
  510, 511, 584, 585,
]

export const MAP_EVOLUTION: ReadonlyMap<number, EvoMethod> = new Map<number, EvoMethod>([
  // 217번도로 — 얼음바위
  [385, Evo.LEVEL_ICE_ROCK],
  // 영원의 숲 — 이끼바위
  [203, Evo.LEVEL_MOSS_ROCK],
  ...MAGNETIC_MAPS.map((m): [number, EvoMethod] => [m, Evo.LEVEL_MAGNETIC_FIELD]),
])

/** 진화를 판단할 때 개체 밖에서 오는 것들 */
export interface EvoContext {
  /** 파티 전원의 종족 번호 (`EVO_LEVEL_SPECIES_IN_PARTY`) */
  party?: readonly number[]
  /** 밤인가 (`IsNight` — 밤·심야 둘 다 참) */
  night?: boolean
  /** 지금 서 있는 맵 헤더 번호. 자력·이끼바위·얼음바위가 이걸 본다 */
  mapId?: number
  /**
   * 아름다움 (`MON_DATA_BEAUTY`) — 빈티나 하나가 쓴다.
   *
   * ⚠️ 우리에게 콘테스트 능력치가 없어서 늘 0이다 (PARITY §3.11). 포핀이
   * 붙으면 그 값이 여기로 들어온다. 문턱을 낮추거나 없애지 않는다 —
   * **못 하는 것을 되는 척하지 않는다**
   */
  beauty?: number
  /** 지닌 도구의 홀드 효과. 변함없는돌 판정에 쓴다 */
  holdEffect?: number
  /** 도구로 거는 진화면 그 도구 번호 */
  item?: number
}

export interface EvoResult {
  /** 진화 뒤 종족 */
  to: number
  /** 어느 방법으로 걸렸는가. 껍질몬 판정이 이 값을 본다 */
  method: EvoMethod
}

/** `Pokemon_GetValue(MON_DATA_LEVEL)` 위쪽 절반 — PID 상위 16비트의 1의 자리 */
function pidUpperDigit(pid: number): number {
  return Math.floor(pid / 0x10000) % 10
}

/**
 * 이 개체가 지금 진화하는가. 안 하면 null.
 *
 * 원작과 같이 **첫 번째로 걸리는 갈래**를 쓴다 — 표의 순서가 우선순위다.
 * 이브이처럼 일곱 갈래를 가진 종에서 그 순서가 실제로 갈라 준다.
 */
export function evolutionTarget(
  cls: EvoClassId,
  mon: PokemonInstance,
  species: Species,
  ctx: EvoContext = {},
): EvoResult | null {
  // 변함없는돌. 도구로 거는 진화는 못 막고, 케이시만 예외다
  if (mon.species !== SPECIES_KADABRA
    && ctx.holdEffect === HOLD_EFFECT_NO_EVOLVE
    && cls !== EvoClass.ITEM) return null

  const list = species.evolutions
  return cls === EvoClass.LEVEL ? byLevel(list, mon, species, ctx)
    : cls === EvoClass.TRADE ? byTrade(list, mon)
      : byItem(list, mon, species, ctx)
}

function byLevel(
  list: readonly Evolution[], mon: PokemonInstance, species: Species, ctx: EvoContext,
): EvoResult | null {
  const night = ctx.night ?? false
  const mapMethod = ctx.mapId === undefined ? Evo.NONE : MAP_EVOLUTION.get(ctx.mapId) ?? Evo.NONE
  const enough = (e: Evolution): boolean => e.param <= mon.level
  let stats: { atk: number; def: number } | null = null
  const compare = (): { atk: number; def: number } => (stats ??= statsOf(mon, species))
  const gender = (): string => genderOf(mon.pid, species.genderRatio)

  for (const e of list) {
    const hit = (): EvoResult => ({ to: e.to, method: e.method as EvoMethod })
    switch (e.method) {
      case Evo.LEVEL_HAPPINESS:
        if (mon.friendship >= FRIENDSHIP_THRESHOLD) return hit()
        break
      case Evo.LEVEL_HAPPINESS_DAY:
        if (!night && mon.friendship >= FRIENDSHIP_THRESHOLD) return hit()
        break
      case Evo.LEVEL_HAPPINESS_NIGHT:
        if (night && mon.friendship >= FRIENDSHIP_THRESHOLD) return hit()
        break
      case Evo.LEVEL:
        if (enough(e)) return hit()
        break
      case Evo.LEVEL_ATK_GT_DEF:
        if (enough(e) && compare().atk > compare().def) return hit()
        break
      case Evo.LEVEL_ATK_EQ_DEF:
        if (enough(e) && compare().atk === compare().def) return hit()
        break
      case Evo.LEVEL_ATK_LT_DEF:
        if (enough(e) && compare().atk < compare().def) return hit()
        break
      case Evo.LEVEL_PID_LOW:
        if (enough(e) && pidUpperDigit(mon.pid) < 5) return hit()
        break
      case Evo.LEVEL_PID_HIGH:
        if (enough(e) && pidUpperDigit(mon.pid) >= 5) return hit()
        break
      case Evo.LEVEL_NINJASK:
        if (enough(e)) return hit()
        break
      case Evo.LEVEL_SHEDINJA:
        // 원작도 여기서는 아무 종족도 안 돌려준다. 껍질몬은 아둥지의 진화가
        // 끝난 **뒤에** 덤으로 생긴다 (`Evolution_ProcessEvolutionEffects`)
        break
      case Evo.LEVEL_BEAUTY:
        if ((ctx.beauty ?? 0) >= e.param) return hit()
        break
      case Evo.LEVEL_WITH_HELD_ITEM_DAY:
        if (!night && e.param === mon.heldItem) return hit()
        break
      case Evo.LEVEL_WITH_HELD_ITEM_NIGHT:
        if (night && e.param === mon.heldItem) return hit()
        break
      case Evo.LEVEL_KNOW_MOVE:
        if (mon.moves.some((s) => s.move === e.param)) return hit()
        break
      case Evo.LEVEL_SPECIES_IN_PARTY:
        if (ctx.party?.includes(e.param)) return hit()
        break
      case Evo.LEVEL_MALE:
        if (enough(e) && gender() === 'male') return hit()
        break
      case Evo.LEVEL_FEMALE:
        if (enough(e) && gender() === 'female') return hit()
        break
      // ⚠️ 이 셋은 **레벨을 안 본다.** 원작이 `param`을 조건이 아니라 표식으로
      // 쓰고, 맞춰 보는 것은 "지금 맵이 이 방법을 걸고 있는가" 하나다
      case Evo.LEVEL_MAGNETIC_FIELD:
      case Evo.LEVEL_MOSS_ROCK:
      case Evo.LEVEL_ICE_ROCK:
        if (e.method === mapMethod) return hit()
        break
      default:
        break
    }
  }
  return null
}

function byTrade(list: readonly Evolution[], mon: PokemonInstance): EvoResult | null {
  for (const e of list) {
    if (e.method === Evo.TRADE) return { to: e.to, method: Evo.TRADE }
    if (e.method === Evo.TRADE_WITH_HELD_ITEM && e.param === mon.heldItem) {
      return { to: e.to, method: Evo.TRADE_WITH_HELD_ITEM }
    }
  }
  return null
}

function byItem(
  list: readonly Evolution[], mon: PokemonInstance, species: Species, ctx: EvoContext,
): EvoResult | null {
  const item = ctx.item
  if (item === undefined) return null
  const gender = genderOf(mon.pid, species.genderRatio)
  for (const e of list) {
    if (e.param !== item) continue
    if (e.method === Evo.USE_ITEM) return { to: e.to, method: Evo.USE_ITEM }
    if (e.method === Evo.USE_ITEM_MALE && gender === 'male') {
      return { to: e.to, method: Evo.USE_ITEM_MALE }
    }
    if (e.method === Evo.USE_ITEM_FEMALE && gender === 'female') {
      return { to: e.to, method: Evo.USE_ITEM_FEMALE }
    }
  }
  return null
}

/**
 * 진화한 몸. **개체를 갈아 끼우지 않고 종족만 바꾼다** — 개체값도 성격도
 * 경험치도 그대로다.
 *
 * ⚠️ 레벨은 다시 안 센다. 4세대는 종족이 바뀌어도 누적 경험치가 정본이고
 * 성장 곡선이 다른 종으로 진화하는 경우가 없다.
 *
 * ⚠️ **폼도 그대로 넘어간다** (PARITY §3.4). 도롱충이가 입고 있던 옷감이
 * 그대로 도롱마담의 옷감이 된다 — 원작도 폼 칸을 안 건드린다. 수컷이
 * 나메일로 진화하면 그쪽은 폼이 하나뿐이라 읽는 자리에서 0으로 접힌다
 * (`sanitizeForm`)
 */
export function evolve(mon: PokemonInstance, to: number): PokemonInstance {
  return { ...mon, species: to }
}

/**
 * 진화한 뒤 **그 자리에서 배우는 기술** (`Pokemon_LevelUpMove`).
 *
 * 새 종족의 습득표에서 **지금 레벨**에 걸린 기술을 찾는다. 이게 있어야
 * "진화하자마자 배운다"가 성립한다 — 예컨대 모부기 계열이 그렇다.
 */
export function movesOnEvolve(after: Species, level: number): number[] {
  return after.learnset.filter((e) => e.level === level).map((e) => e.move)
}

/**
 * 껍질몬이 딸려 오는가 (`Evolution_ProcessEvolutionEffects`).
 *
 * 조건 셋을 **다** 만족해야 한다: 아둥지 계열의 진화이고, 가방에 몬스터볼이
 * 있고, 파티에 빈자리가 있다. 볼은 한 개 든다
 */
export function spawnsShedinja(method: EvoMethod): boolean {
  return method === Evo.LEVEL_NINJASK || method === Evo.LEVEL_SHEDINJA
}
