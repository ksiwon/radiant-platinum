// 친밀도에 붙는 보정 셋 — 원작이 **두 군데에서 똑같이** 얹는다.
//
//   `Pokemon_UpdateFriendship`      레벨업·걸어다니기·기절 …
//   `BattleSystem_UseBagItem`       배틀에서 도구를 먹였을 때
//
// 셋 다 **올라갈 때만** 붙는다. 내려가는 값에는 아무것도 안 붙어서, 럭셔리볼에
// 든 아이라고 덜 미워하지는 않는다.
//
// 한 군데 모아 두는 이유는 두 경로가 조용히 갈리기 때문이다 — 실제로 세이브
// 쪽에는 럭셔리볼만 붙어 있고 나머지 둘이 빠져 있었다.
import type { Item } from '../../data/schema'

/** `constants/pokemon.h`의 `MAX_FRIENDSHIP_VALUE` */
export const MAX_FRIENDSHIP = 255

/** 럭셔리볼의 도구 번호 (`ITEM_LUXURY_BALL`) */
export const LUXURY_BALL = 11

/**
 * 평온의방울이 가진 홀드 효과 (`HOLD_EFFECT_FRIENDSHIP_UP`).
 *
 * 번호는 `generated/item_hold_effects.txt`의 줄 차례다. 468종 중 이 효과를
 * 가진 것은 평온의방울(#218) 하나다
 */
export const HOLD_EFFECT_FRIENDSHIP_UP = 53

/**
 * 알에서 안 나온 개체의 「알을 받은 자리」.
 *
 * ⚠️ **`PokemonInstance`에는 아직 이 칸이 없다.** 알도 육아방도 없어서 넣을
 * 값이 생기지 않는다 — 육아방이 붙는 날 개체에 칸이 하나 늘고 이 상수는 없어진다.
 *
 * 그때까지 0을 넘겨도 판이 안 달라진다는 것은 재 봤다: 이 보정은 자리 번호가
 * **지금 맵 번호와 같을 때** 붙는데, 0번 맵은 「수수께끼의 장소」라 못 간다
 */
export const NO_EGG_LOCATION = 0

/** 보정을 정하는 데 필요한 것 */
export interface FriendshipBonus {
  /** 잡힌 볼 (`MON_DATA_POKEBALL`) */
  ball: number
  /** 알을 받은 자리 (`MON_DATA_EGG_LOCATION`) */
  eggLocation: number
  /** 지금 맵 헤더 번호 */
  mapId: number
  /**
   * `HOLD_EFFECT_FRIENDSHIP_UP`짜리 도구가 걸려 있는가 — 1.5배.
   *
   * ⚠️ **무엇을 보는지가 두 루틴에서 다르다.** 부르는 쪽이 정해서 넘긴다:
   *
   *   `Pokemon_UpdateFriendship`  → **소지품**의 홀드 효과 (제대로다)
   *   `BattleSystem_UseBagItem`   → **방금 쓴 가방 도구**의 홀드 효과
   *
   * 뒤엣것은 원작의 실수로 보인다 — 소지품 번호를 읽어 놓고(`param = ...HELD_ITEM`)
   * 정작 검사는 `item`(쓴 도구)으로 한다. 그래서 배틀에서는 이 배수가 영영
   * 안 걸린다: 평온의방울은 배틀 주머니가 없어서 애초에 못 고른다.
   * 원작의 버그도 옮긴다 (PLAN §7.7.4)
   */
  soothing: boolean
}

/**
 * 증감 하나에 보정을 얹는다. 자르는 것은 부르는 쪽 일이다.
 *
 * 1.5배는 정수로 자른다 (`friendship * 150 / 100`) — +1이 +1로 남고 +2가 +3이 된다
 */
export function withFriendshipBonus(change: number, bonus: FriendshipBonus): number {
  if (change <= 0) return change
  let out = change
  if (bonus.ball === LUXURY_BALL) out++
  if (bonus.eggLocation === bonus.mapId) out++
  if (bonus.soothing) out = Math.trunc((out * 150) / 100)
  return out
}

/** 0 ~ 255로 자른다. 원작도 양쪽 끝에서 멈춘다 */
export function clampFriendship(value: number): number {
  return Math.max(0, Math.min(MAX_FRIENDSHIP, value))
}

/** 그 도구가 평온의방울 부류인가 */
export function isSoothing(item: Item | undefined): boolean {
  return item?.holdEffect === HOLD_EFFECT_FRIENDSHIP_UP
}
