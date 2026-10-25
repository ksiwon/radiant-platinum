// PP 도구 — 포인트업 · 포인트맥스 (`item_use_pokemon.c`의 `IncreaseMovePPUps`)
//
// 에테르·잎새열매의 PP 회복은 배틀 가방과 같은 계산기(`planItemUse`)가 하고,
// 여기는 **기술 칸을 골라야 하는 도구**와 포인트업만 맡는다.
import type { Item } from '../../data/schema'
import type { PokemonInstance } from '../pokemon/instance'
import { maxPpOf } from '../pokemon/instance'

/** `PP_UP_REQUIREMENT` — 기본 PP가 5 미만인 기술은 못 늘린다 (예: 스케치) */
const PP_UP_REQUIREMENT = 5
/** `MAX_PP_UP_BONUSES` */
const MAX_PP_UPS = 3

function num(item: Item, key: string): number {
  return item.param?.[key] ?? 0
}

/** 포인트업·포인트맥스인가 */
export function isPpUpItem(item: Item): boolean {
  return num(item, 'ppUp') !== 0 || num(item, 'ppMax') !== 0
}

/** 한 번에 올리는 횟수. 포인트업 1 · 포인트맥스 3 (`ppUp`이 먼저고 `ppMax`는 else) */
export function ppUpsGiven(item: Item): number {
  return num(item, 'ppUp') !== 0 ? 1 : num(item, 'ppMax') !== 0 ? MAX_PP_UPS : 0
}

/**
 * 이 도구는 기술 칸 **하나**를 골라야 하는가 (`ApplyItemEffectOnPokemon`).
 *
 * 포인트업·맥스는 늘 묻고, PP 회복은 **한 칸짜리**(에테르 · 맥스에테르 · 잎새열매)만 묻는다.
 * 네 칸을 다 채우는 엘릭서는 안 묻는다
 */
export function needsMoveChoice(item: Item): boolean {
  return isPpUpItem(item) || (num(item, 'ppRestore') !== 0 && num(item, 'ppRestoreAll') === 0)
}

/**
 * 포인트업을 올린다. 못 올리면 null (도구는 그대로).
 *
 * - 이미 3번 올렸으면 안 된다
 * - 기본 PP가 5 미만이면 안 된다
 * - 현재 PP는 **늘어난 최대만큼 같이 는다** (`currPP += 새 최대 − 옛 최대`) — 다 쓴 기술이 가득 차지 않는다
 *
 * 기술이 없는 칸은 원작이 기술 0번(PP 0)으로 읽어 `PP_UP_REQUIREMENT`에서 걸린다
 */
export function raisePpUps(
  mon: PokemonInstance, slot: number, basePp: number, amount: number,
): PokemonInstance | null {
  const one = mon.moves[slot]
  if (!one) return null
  if (one.ppUps >= MAX_PP_UPS) return null
  if (basePp < PP_UP_REQUIREMENT) return null
  const ppUps = Math.min(MAX_PP_UPS, one.ppUps + amount)
  const grown = maxPpOf({ ...one, ppUps }, basePp) - maxPpOf(one, basePp)
  const moves = mon.moves.map((s, i) => (i === slot ? { ...s, ppUps, pp: s.pp + grown } : s))
  return { ...mon, moves }
}
