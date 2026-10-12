// EXPERT 루틴이 같이 쓰는 작은 도구 (`trainer_ai/script.s` 1623~)
import type { AiMon, AiMove, AiTurn } from './context'
import { boosted, hpPercent, knownMoves } from './context'
import { isDamageScored } from './damage'
import { effectivenessOf } from './typeChart'

/** `IfRandomLessThan n`이 분기하는가 (= 점수를 **안** 주는가) */
export function skip(random: () => number, threshold: number): boolean {
  return Math.floor(random() * 256) < threshold
}

/** 랭크를 먹인 스피드로 비교한다. 같으면 "느리다" 쪽이 아니다 */
export function isSlower(turn: AiTurn): boolean {
  const mine = boosted(turn.self.stats.spe, turn.self.boosts.spe)
  const theirs = boosted(turn.foe.stats.spe, turn.foe.boosts.spe)
  return mine < theirs
}

export function eff(move: AiMove, foe: AiMon): number {
  return effectivenessOf(move.type, foe.types)
}

/** 상대가 반감하거나 아예 안 맞는가. EXPERT 루틴 다수가 이걸로 시작한다 */
export function resisted(move: AiMove, foe: AiMon): boolean {
  return eff(move, foe) < 1
}

/** 내 기술칸에 이 효과를 가진 게 있는가 */
export function knowsEffect(turn: AiTurn, effect: number): boolean {
  return knownMoves(turn).some((m) => m.effect === effect)
}

/** 내 기술칸에 상대에게 효과가 굉장한 게 있는가 */
export function hasSuperEffective(turn: AiTurn): boolean {
  return knownMoves(turn).some((m) => isDamageScored(m) && eff(m, turn.foe) >= 2)
}


/** 내가 더 빠른가 (`COMPARE_SPEED_FASTER`). 같으면 아니다 */
export function isFaster(turn: AiTurn): boolean {
  return boosted(turn.self.stats.spe, turn.self.boosts.spe)
    > boosted(turn.foe.stats.spe, turn.foe.boosts.spe)
}

/**
 * 상대가 직전에 쓴 기술의 분류 (`LoadDefenderLastUsedMoveClass`).
 *
 * ⚠️ **쓴 적이 없어도 값이 있다** — 기술 0번의 분류가 `CLASS_PHYSICAL`(0)이라 물리로 읽힌다.
 * 위력은 따로 묻는 갈래가 있어서(`foeLastPower`) 그쪽이 먼저 걸러 낸다
 */
export function lastClass(turn: AiTurn): 'physical' | 'special' | 'status' {
  return turn.foeLast?.category ?? turn.foeLastMoveCategory ?? 'physical'
}

/** 상대가 직전에 쓴 기술의 위력. 쓴 적이 없거나 변화기면 0 (`LoadPowerOfLoadedMove`) */
export function foeLastPower(turn: AiTurn): number {
  if (turn.foeLast !== undefined) return turn.foeLast?.power ?? 0
  const c = turn.foeLastMoveCategory
  return c === null || c === 'status' ? 0 : 1
}

/** 상대가 그 효과의 기술을 써 보였는가 (`IfMoveEffectKnown AI_BATTLER_DEFENDER`) */
export function foeKnowsEffect(turn: AiTurn, effect: number): boolean {
  return turn.foeKnownEffects?.has(effect) === true
}

/** 원작이 한 판 내내 세는 턴 수 (`LoadTurnCount` — `totalTurns`). 안 주면 개체 턴으로 읽는다 */
export function turnCount(turn: AiTurn): number {
  return turn.turnCount ?? turn.turn
}

/** 그 능력들 중 하나가 +3 이상인가 (`IfStatStageGreaterThan … 8`) */
export function anyHigh(mon: AiMon, stats: readonly (keyof AiMon['boosts'])[]): boolean {
  return stats.some((s) => mon.boosts[s] >= 3)
}

/** 그 능력들 중 하나가 −3 이하인가 (`IfStatStageLessThan … 4`) */
export function anyLow(mon: AiMon, stats: readonly (keyof AiMon['boosts'])[]): boolean {
  return stats.some((s) => mon.boosts[s] <= -3)
}

/** 혼란시키기 (`Expert_StatusConfuse` 2858). 상대 체력이 적을수록 굳이 걸 이유가 줄어든다 */
export function statusConfuse(turn: AiTurn): number {
  const hp = hpPercent(turn.foe)
  if (hp > 70) return 0
  let delta = 0
  if (!skip(turn.random, 128)) delta -= 1
  if (hp > 50) return delta
  delta -= 1
  if (hp > 30) return delta
  return delta - 1
}
