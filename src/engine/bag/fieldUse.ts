// 필드에서 도구를 쓴다 (PARITY §4.1) — `src/item_use_functions.c`.
//
// **그동안 쓸 수 있는 것이 자전거 하나였다.** 상처약을 골라도, 진화의돌을
// 골라도 아무 일도 안 일어났다.
//
// 원작은 도구마다 `fieldUseFunc` 번호를 달아 두고 표에서 함수를 고른다
// (`sItemUseFuncs`). 그 번호가 우리 도구표에도 이미 들어와 있어서
// (`items.json`의 `fieldUseFunc`) **무엇이 무엇인지는 짐작할 것이 없다** —
// 468종이 스물다섯 갈래로 갈려 있고, 그 분포까지 실측했다:
//
//   0 없음 214 · 1 회복 38 · 6 기술머신 100 · 8 나무열매 64 · 19 알림 9 ·
//   20 진화의돌 10 · 13 비료 4 · 7 편지 12 · 나머지는 하나씩
import type { Item } from '../../data/schema'
import type { Rod } from '../battle/encounter'
import type { ItemPlan, ItemTarget } from '../battle/meta/bagItem'
import type { MoveSlot, PokemonInstance } from '../pokemon/instance'

/** `constants/items.h`의 `ITEM_USE_FUNC_*`. 번호가 곧 표의 자리다 */
export const FieldUse = {
  NONE: 0,
  HEALING: 1,
  TOWN_MAP: 2,
  EXPLORER_KIT: 3,
  BICYCLE: 4,
  JOURNAL: 5,
  TM_HM: 6,
  MAIL: 7,
  BERRY: 8,
  POFFIN_CASE: 9,
  PAL_PAD: 10,
  POKE_RADAR: 11,
  SPRAYDUCK: 12,
  MULCH: 13,
  HONEY: 14,
  VS_SEEKER: 15,
  OLD_ROD: 16,
  GOOD_ROD: 17,
  SUPER_ROD: 18,
  BAG_MESSAGE: 19,
  EVO_STONE: 20,
  ESCAPE_ROPE: 21,
  AZURE_FLUTE: 22,
  VS_RECORDER: 23,
  GRACIDEA: 24,
} as const

/** `MAP_TYPE_CAVE` (`enum MapType`) */
export const MAP_TYPE_CAVE = 3

export type { Rod }

/**
 * 낚시를 막는 맵 열하나 (`CanUseFishingRod`) — 파멸의세계 전부다.
 *
 * 헤더 번호는 `generated/map_headers.txt`의 줄 번호 − 1이고, 573~583이
 * `DISTORTION_WORLD_1F`부터 `DISTORTION_WORLD_TURNBACK_CAVE_ROOM`까지
 * 끊김 없이 이어진다. 저기 물처럼 보이는 것은 물이 아니다
 */
const NO_FISHING_FIRST = 573
const NO_FISHING_LAST = 583

/**
 * 이 도구를 지금 쓰면 무슨 일이 일어나는가.
 *
 * `blocked`는 **원작이 막는 자리**고, `missing`은 **우리에게 그 계통이 아직
 * 없는 자리**다. 둘을 안 가르면 "이 게임은 원래 안 되는 것"과 "우리가 아직
 * 못 만든 것"이 화면에서 같은 말로 보인다.
 */
export type FieldItemAction =
  /** 누구에게 쓸지 골라야 한다. 파티 화면이 열린다 */
  | { kind: 'party'; use: 'heal' | 'tmhm' | 'evoStone' }
  /** 리펠 부류. `steps`걸음 동안 약한 야생이 안 나온다 */
  | { kind: 'repel'; steps: number }
  /** 검은·하얀 피리. 이 맵을 벗어날 때까지 출현률이 바뀐다 */
  | { kind: 'flute'; factor: number }
  /** 동굴탈출로프 */
  | { kind: 'escapeRope' }
  /** 자전거를 타거나 내린다 */
  | { kind: 'bike' }
  /** 낚싯대를 던진다 */
  | { kind: 'fish'; rod: Rod }
  /** 원작도 여기서는 못 쓴다. `why`가 그 이유다 */
  | { kind: 'blocked'; why: string }
  /** 그 계통이 아직 없다 */
  | { kind: 'missing'; what: string }

/** 지금 어디에 서 있는가. 쓸 수 있는지가 여기서 갈린다 */
export interface FieldContext {
  /** 지금 맵 헤더 번호 */
  mapId: number
  /** 그 맵의 `mapType` */
  mapType: number
  /** 그 맵이 탈출로프를 허락하는가 (`isEscapeRopeAllowed`) */
  escapeRopeAllowed: boolean
  /** 남은 리펠 걸음. 남아 있으면 새로 못 쓴다 */
  repelSteps: number
  /** 앞 칸이 물인가 — 낚싯대는 물을 봐야 던진다 */
  waterAhead: boolean
}

/** 아직 계통이 없는 갈래의 이름. 화면이 그대로 보여 준다 */
const MISSING: Partial<Record<number, string>> = {
  [FieldUse.TOWN_MAP]: '타운맵',
  [FieldUse.EXPLORER_KIT]: '지하통로',
  [FieldUse.JOURNAL]: '모험노트',
  [FieldUse.MAIL]: '편지',
  [FieldUse.BERRY]: '나무열매 밭',
  [FieldUse.POFFIN_CASE]: '포핀',
  [FieldUse.PAL_PAD]: '친구수첩',
  [FieldUse.POKE_RADAR]: '포켓몬레이더',
  [FieldUse.SPRAYDUCK]: '나무열매 밭',
  [FieldUse.MULCH]: '나무열매 밭',
  [FieldUse.HONEY]: '꿀나무',
  [FieldUse.VS_SEEKER]: '배틀서처',
  [FieldUse.AZURE_FLUTE]: '천계의피리',
  [FieldUse.VS_RECORDER]: '배틀레코더',
  [FieldUse.GRACIDEA]: '폼 체인지',
}

/**
 * 도구 하나가 지금 하는 일.
 *
 * ⚠️ **`fieldUseFunc`만 본다.** 도구 번호를 손으로 적어 두지 않는다 — 회복
 * 도구가 서른여덟인데 그걸 목록으로 만들면 하나 빠뜨려도 아무도 모른다
 */
export function fieldAction(item: Item, ctx: FieldContext): FieldItemAction {
  switch (item.fieldUseFunc) {
    case FieldUse.HEALING:
      return { kind: 'party', use: 'heal' }
    case FieldUse.TM_HM:
      return { kind: 'party', use: 'tmhm' }
    case FieldUse.EVO_STONE:
      return { kind: 'party', use: 'evoStone' }
    case FieldUse.BICYCLE:
      return { kind: 'bike' }

    case FieldUse.OLD_ROD:
    case FieldUse.GOOD_ROD:
    case FieldUse.SUPER_ROD:
      if (ctx.mapId >= NO_FISHING_FIRST && ctx.mapId <= NO_FISHING_LAST) {
        return { kind: 'blocked', why: '여기서는 낚시를 할 수 없다.' }
      }
      if (!ctx.waterAhead) return { kind: 'blocked', why: '지금은 쓸 수 없다.' }
      return {
        kind: 'fish',
        rod: item.fieldUseFunc === FieldUse.OLD_ROD ? 'old'
          : item.fieldUseFunc === FieldUse.GOOD_ROD ? 'good' : 'super',
      }

    case FieldUse.ESCAPE_ROPE:
      // `CanUseEscapeRope` — 동굴이고 그 맵이 허락해야 한다
      if (ctx.mapType !== MAP_TYPE_CAVE || !ctx.escapeRopeAllowed) {
        return { kind: 'blocked', why: '지금은 쓸 수 없다.' }
      }
      return { kind: 'escapeRope' }

    case FieldUse.BAG_MESSAGE: {
      // 이 갈래에 리펠 셋과 비드로 둘, 그리고 그냥 열리는 물건 넷이 섞여 있다.
      // 가르는 것은 이름이 아니라 **효과값**이다 — 리펠은 걸음 수를 들고 있다
      const factor = fluteFactorOf(item)
      if (factor !== null) return { kind: 'flute', factor }
      const steps = repelStepsOf(item)
      if (steps === null) return { kind: 'missing', what: '그 화면' }
      // `TryUseRepel` — 남아 있으면 새로 안 쓴다. 개수도 안 깎는다
      if (ctx.repelSteps > 0) return { kind: 'blocked', why: '아직 효과가 남아 있다.' }
      return { kind: 'repel', steps }
    }

    default: {
      const what = MISSING[item.fieldUseFunc ?? FieldUse.NONE]
      if (what !== undefined) return { kind: 'missing', what }
      return { kind: 'blocked', why: '지금은 쓸 수 없다.' }
    }
  }
}

/**
 * 리펠 부류가 도는 걸음 수 (`ITEM_PARAM_EFFECT_PARAM`).
 *
 * 리펠 100 · 실버 200 · 골드 250이다. 비드로 둘도 같은 갈래에 있지만
 * 그쪽은 **출현률을 바꾸는 것**이라 걸음 수가 아니다 — 이름(`constant`)으로
 * 가른다. 이름은 롬이 준 것이지 우리가 붙인 것이 아니다
 */
export function repelStepsOf(item: Item): number | null {
  if (!/^ITEM_(SUPER_|MAX_)?REPEL$/.test(item.constant)) return null
  const steps = item.effectParam ?? 0
  return steps > 0 ? steps : null
}

/**
 * 검은·하얀 피리인가. 맞으면 `FLUTE_FACTOR_*`(1·2), 아니면 null.
 *
 * ⚠️ **효과값으로는 못 가른다.** 검은피리의 `effectParam`이 50인데 그 50은
 * 「출현률 50% 감소」라는 뜻이라 걸음 수가 아니다 — 리펠의 100·200·250과
 * 같은 칸에 다른 단위로 들어 있다. 원작도 가방에서 **도구 번호로** 가른다
 * (`UseItemInBag`의 `item == ITEM_BLACK_FLUTE`). 여기서는 롬이 준 이름표를 본다
 */
export function fluteFactorOf(item: Item): number | null {
  if (item.constant === 'ITEM_BLACK_FLUTE') return 1
  if (item.constant === 'ITEM_WHITE_FLUTE') return 2
  return null
}

/** 기술머신·비전머신이 가르치는 기술 번호. 아니면 null */
export function tmMove(item: Item, tmMoves: readonly number[]): number | null {
  const at = tmIndex(item)
  return at === null ? null : tmMoves[at] ?? null
}

/**
 * 기술머신 번호(0부터). `ITEM_TM01`~`ITEM_TM92`·`ITEM_HM01`~`ITEM_HM08`.
 *
 * 비전머신은 기술머신 92개 **뒤에** 이어 붙는다 — 원작의 `tmhm.narc`가 한 줄로
 * 100개다
 */
export const TM_COUNT = 92

export function tmIndex(item: Item): number | null {
  const tm = /^ITEM_TM(\d\d)$/.exec(item.constant)
  if (tm) return Number(tm[1]) - 1
  const hm = /^ITEM_HM(\d\d)$/.exec(item.constant)
  if (hm) return TM_COUNT + Number(hm[1]) - 1
  return null
}

/**
 * 그 종족이 이 기술머신을 배울 수 있는가 — 종족표의 128비트 필드.
 *
 * `species.json`의 `tm`은 롬 바이트 28~43을 **그 차례대로** 16진수로 적은
 * 32글자다. 그래서 i번 비트는 `i >> 3`번째 바이트의 `i & 7`번째 비트다
 */
export function canLearnTm(tmBits: string, index: number): boolean {
  if (index < 0 || index >= TM_COUNT + 8) return false
  const at = (index >> 3) * 2
  const byte = Number.parseInt(tmBits.slice(at, at + 2), 16)
  return Number.isNaN(byte) ? false : ((byte >> (index & 7)) & 1) === 1
}

// ── 밖에서 먹인다 ────────────────────────────────────────────────────────────
//
// 배틀 가방과 **같은 계산기를 쓴다** (`battle/meta/bagItem`의 `planItemUse`).
// 밖에서 먹이는 것은 벤치에 먹이는 것과 같은 자리라, 여기서 다시 적으면
// 상처약이 배틀 안팎에서 다른 값으로 찬다.

/** 밖에 서 있는 한 마리를 배틀 가방이 아는 모양으로 옮긴다 */
export function fieldTarget(
  mon: PokemonInstance, maxHp: number, ppOf: (slot: MoveSlot) => number,
): ItemTarget {
  return {
    hp: mon.hp,
    maxHp,
    status: mon.status,
    fainted: mon.hp <= 0,
    // 밖에서는 아무도 "나와 있지" 않다. 랭크·급소·혼란은 배틀 개체의 값이다
    active: false,
    confused: false,
    attracted: false,
    boosts: {},
    focusEnergy: false,
    embargo: false,
    mist: false,
    moves: mon.moves.map((s) => ({ pp: s.pp, maxPp: ppOf(s) })),
  }
}

/** 세운 계획을 개체에 실제로 반영한다. 새 개체를 돌려준다 */
export function applyFieldPlan(
  mon: PokemonInstance, plan: ItemPlan, maxHp: number, ppOf: (slot: MoveSlot) => number,
): PokemonInstance {
  const moves = mon.moves.map((slot, i) => {
    const fill = plan.pp.find((p) => p.slot === i)
    if (!fill) return slot
    return { ...slot, pp: Math.min(ppOf(slot), slot.pp + fill.amount) }
  })
  const hp = plan.heal > 0 || plan.revive
    ? Math.min(maxHp, Math.max(mon.hp, 0) + plan.heal)
    : mon.hp
  const cured = plan.cure.includes(mon.status)
  return {
    ...mon,
    hp,
    moves,
    status: cured ? 'ok' : mon.status,
    statusTurns: cured ? 0 : mon.statusTurns,
  }
}
