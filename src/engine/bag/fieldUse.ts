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
import { mailTypeOfConstant } from '../world/mail'
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
/** 파티 화면이 무엇을 하러 열리는가. `menuStore`의 `usingItem.use`와 같은 값이다 */
export type PartyItemUse = 'heal' | 'tmhm' | 'evoStone' | 'mail' | 'gracidea'

/**
 * `SCRIPT_ID(COMMON_SCRIPTS, 39)` — `CommonScript_TryUseAzureFlute`.
 *
 * ⚠️ **천계의피리는 우리가 판정할 것이 하나도 없다.** 원작의 공용 스크립트가
 * 자리(창기둥 셋)·칸(31,52)·전당등록·전국도감·배포 표식·이미 잡았는가를 다
 * 물어보고, 안 맞으면 제 대사(「써 봐도 뜻이 없을 것 같다」)로 닫는다.
 * 맞으면 곡을 틀고 화면을 하얗게 지운 뒤 시작의 방으로 워프한다 —
 * **그 계단은 롬이 놓는다.** 우리가 하는 일은 이 번호를 거는 것뿐이다
 */
export const COMMON_SCRIPT_AZURE_FLUTE = 2039

export type FieldItemAction =
  /** 누구에게 쓸지 골라야 한다. 파티 화면이 열린다 */
  | { kind: 'party'; use: PartyItemUse }
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
  /** 화면 하나를 연다. 모험노트처럼 **여는 것이 전부인** 도구다 */
  | { kind: 'screen'; screen: 'journal' }
  /** 포켓몬레이더를 켠다 (PARITY §6.5) */
  | { kind: 'radar' }
  /** VS시커로 둘레를 훑는다 (PARITY §7.9) */
  | { kind: 'vsSeeker' }
  /**
   * 공용 스크립트 하나를 건다.
   *
   * ⚠️ **쓸 수 있는지도 그 스크립트가 묻는다.** 여기서 미리 걸러내면 못 쓰는
   * 자리에서 원작의 대사 대신 우리 말이 나간다 — VS시커와 같은 길이다
   */
  | { kind: 'commonScript'; id: number }
  /** 편지를 쓴다 (PARITY §4.8). `type`이 편지지 번호다 */
  | { kind: 'mail'; type: number }
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
  /**
   * 지금 **선** 칸이 큰 풀인가. 레이더는 풀 위에서만 켜진다
   * (`CanUsePokeRadar`의 `TileBehavior_IsTallGrass`) — 낚싯대가 **앞** 칸을 보는
   * 것과 다르다
   */
  inTallGrass?: boolean
  /** 누가 따라다니는가. 동행이 있으면 레이더를 못 쓴다 */
  hasPartner?: boolean
  /** 자전거를 탔는가 (`PlayerAvatar_GetPlayerState == 0x1`). 타고는 못 쓴다 */
  onBike?: boolean
  /**
   * 이 맵이 신오 본판 위인가 (`MapHeader_IsOnMainMatrix` — 행렬 번호가 0).
   *
   * VS시커가 이것 하나로 막힌다. 건물 안·굴·지하는 행렬이 따로라 못 쓴다 —
   * 훑는 네모(가로 15 · 세로 14칸)가 실내에서는 벽 너머까지 닿기 때문이다
   */
  mainMatrix?: boolean
  /**
   * 지금 다리 **위**에 서 있는가 (`MapObject_IsStatusOnElevatedBridge`).
   *
   * 다리 위에서는 밑의 물에 낚싯대를 못 던진다 — 원작이 그 한 줄로 막는다
   * (`CanUseFishingRod`). 밑을 지나갈 때는 같은 칸에서도 던질 수 있다
   */
  onBridge?: boolean
  /**
   * 지닌 채 교환해야 하던 도구들 (PARITY §12.2).
   *
   * ⚠️ **`fieldUseFunc`로는 못 찾는다.** 금속코트도 왕의징표석도 원작에서는
   * 0(밖에서 못 쓴다)이다 — 교환이 걸어 주던 것이라 밖에서 쓸 일이 없었다.
   * 교환이 없어졌으므로 이 열하나는 진화의돌과 같은 자리를 받는다. 목록은
   * 종족표에서 뽑는다 (`pokemon/evolution`의 `tradeEvolutionItems`).
   *
   * ⚠️ 담기는 것은 **롬이 준 이름표**(`ITEM_METAL_COAT`)다. 도구표의 `dataID`는
   * 아카이브 자리지 도구 번호가 아니라서(금속코트가 233번인데 211이다) 여기로
   * 못 넘어온다 — 리펠·피리를 이름으로 가르는 것과 같은 이유다
   */
  evoItems?: ReadonlySet<string>
}

/** 아직 계통이 없는 갈래의 이름. 화면이 그대로 보여 준다 */
const MISSING: Partial<Record<number, string>> = {
  [FieldUse.TOWN_MAP]: '타운맵',
  [FieldUse.EXPLORER_KIT]: '지하통로',
  [FieldUse.BERRY]: '나무열매 밭',
  [FieldUse.POFFIN_CASE]: '포핀',
  [FieldUse.PAL_PAD]: '친구수첩',
  [FieldUse.SPRAYDUCK]: '나무열매 밭',
  [FieldUse.MULCH]: '나무열매 밭',
  [FieldUse.HONEY]: '꿀나무',
  [FieldUse.VS_RECORDER]: '배틀레코더',
}

/**
 * 도구 하나가 지금 하는 일.
 *
 * ⚠️ **`fieldUseFunc`만 본다.** 도구 번호를 손으로 적어 두지 않는다 — 회복
 * 도구가 서른여덟인데 그걸 목록으로 만들면 하나 빠뜨려도 아무도 모른다
 */
export function fieldAction(item: Item, ctx: FieldContext): FieldItemAction {
  // ⚠️ 표보다 **먼저** 본다. 이 열하나는 원작의 갈래가 0이라 표를 거치면
  // "지금은 쓸 수 없다"로 떨어진다 (PARITY §12.2)
  if (ctx.evoItems?.has(item.constant) === true) return { kind: 'party', use: 'evoStone' }
  switch (item.fieldUseFunc) {
    case FieldUse.HEALING:
      return { kind: 'party', use: 'heal' }
    case FieldUse.TM_HM:
      return { kind: 'party', use: 'tmhm' }
    case FieldUse.EVO_STONE:
      return { kind: 'party', use: 'evoStone' }
    case FieldUse.BICYCLE:
      return { kind: 'bike' }

    // 모험노트는 여는 것이 전부다 (`ItemUseFunc_Journal`). 어디서든 열린다 —
    // 원작도 막는 자리가 없다
    case FieldUse.JOURNAL:
      return { kind: 'screen', screen: 'journal' }

    case FieldUse.OLD_ROD:
    case FieldUse.GOOD_ROD:
    case FieldUse.SUPER_ROD:
      if (ctx.mapId >= NO_FISHING_FIRST && ctx.mapId <= NO_FISHING_LAST) {
        return { kind: 'blocked', why: '여기서는 낚시를 할 수 없다.' }
      }
      if (!ctx.waterAhead) return { kind: 'blocked', why: '지금은 쓸 수 없다.' }
      // ⚠️ **다리 위에서는 못 던진다** (PARITY §1.16). 밑을 지나갈 때는
      // 같은 칸에서도 던진다 — 「위인가 밑인가」가 여기서도 갈린다
      if (ctx.onBridge === true) return { kind: 'blocked', why: '지금은 쓸 수 없다.' }
      return {
        kind: 'fish',
        rod: item.fieldUseFunc === FieldUse.OLD_ROD ? 'old'
          : item.fieldUseFunc === FieldUse.GOOD_ROD ? 'good' : 'super',
      }

    // `CanUsePokeRadar` — 동행이 없고, 자전거를 안 탔고, **선 칸이 큰 풀**이어야
    // 한다. 배터리가 덜 찼는지는 여기서 안 본다 — 원작도 켠 다음에 대사로 말한다
    case FieldUse.POKE_RADAR:
      if (ctx.hasPartner === true) return { kind: 'blocked', why: '지금은 쓸 수 없다.' }
      if (ctx.onBike === true) return { kind: 'blocked', why: '지금은 쓸 수 없다.' }
      if (ctx.inTallGrass !== true) return { kind: 'blocked', why: '지금은 쓸 수 없다.' }
      return { kind: 'radar' }

    // `CanUseVsSeeker` — **신오 본판 위에서만** 쓴다. 배터리가 덜 찼는지는
    // 여기서 안 본다 (레이더와 같다) — 원작도 켠 다음에 롬의 대사로 말한다
    case FieldUse.VS_SEEKER:
      if (ctx.mainMatrix !== true) return { kind: 'blocked', why: '지금은 쓸 수 없다.' }
      return { kind: 'vsSeeker' }

    // 천계의피리 (`UseAzureFluteInField`). 조건 여섯을 롬이 다 묻는다 — 위의
    // 상수 설명 참고. **여기서 아무것도 안 막는다**
    case FieldUse.AZURE_FLUTE:
      return { kind: 'commonScript', id: COMMON_SCRIPT_AZURE_FLUTE }

    // 그라시데아꽃 (`UseGracideaInField`). 누구에게 쓸지부터 고른다 —
    // 스카이가 될 수 있는지(운명적인 만남·낮·안 얼었음)는 파티 화면이
    // `canShayminSky`로 본다 (PARITY §3.4)
    case FieldUse.GRACIDEA:
      return { kind: 'party', use: 'gracidea' }

    // `ItemUseFunc_Mail` — 편지지를 고르면 **누구에게 지니게 할지**부터 묻는다.
    // 글을 다 쓴 뒤가 아니라 앞에서 고르는 것이 원작이고, 그래야 편지에 새길
    // 아이콘 셋(그 자리부터 파티 끝까지)이 정해진다
    case FieldUse.MAIL: {
      const type = mailTypeOfConstant(item.constant)
      if (type === null) return { kind: 'blocked', why: '지금은 쓸 수 없다.' }
      return { kind: 'mail', type }
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
