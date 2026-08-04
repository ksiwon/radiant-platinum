// 전투 후 보상 (PLAN §7.6) — 경험치·노력치·레벨업·기술 습득.
//
// @pkmn/sim은 대전 시뮬레이터라 레벨이 오르지 않는다. 이 계층이 없으면 아무리
// 싸워도 아무 일도 안 일어난다.
import type { Species } from '../../../data/schema'
import { expForLevel, MAX_LEVEL } from '../../pokemon/exp'
import type { PokemonInstance } from '../../pokemon/instance'
import { levelForExp } from '../../pokemon/exp'

/** 노력치 한 능력치 상한 */
export const EV_PER_STAT = 255
/** 노력치 총합 상한 */
export const EV_TOTAL = 510

export interface ExpInput {
  /** 쓰러진 쪽 종족의 기초 경험치 */
  baseExp: number
  /** 쓰러진 쪽의 레벨 */
  level: number
  /** 경험치를 나눠 가질 인원. 최소 1 */
  participants: number
  /** 트레이너전이면 1.5배 */
  trainerBattle?: boolean
  /** 교환으로 받은 개체면 1.5배 */
  traded?: boolean
  /** 럭키에그를 들었으면 1.5배 */
  luckyEgg?: boolean
}

/**
 * 이 전투로 얻는 경험치.
 *
 * `기초경험치 × 레벨 / 7 / 인원`이 뼈대고 배수는 그 뒤에 곱한다. 4세대는 5세대와
 * 달리 **이긴 쪽 레벨을 안 본다** — 낮은 레벨로 강한 상대를 잡아도 보정이 없다
 */
export function expGain(input: ExpInput): number {
  const participants = Math.max(1, Math.floor(input.participants))
  let exp = Math.floor((input.baseExp * input.level) / 7 / participants)
  if (input.trainerBattle) exp = Math.floor((exp * 3) / 2)
  if (input.traded) exp = Math.floor((exp * 3) / 2)
  if (input.luckyEgg) exp = Math.floor((exp * 3) / 2)
  return Math.max(1, exp)
}

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']

/**
 * 노력치를 더한다. 능력치당 255, 합계 510에서 멈춘다.
 *
 * 합계 한도에 걸리면 **넘치는 만큼만 잘라서** 넣는다 — 통째로 버리면 마지막
 * 몇 점이 영영 안 들어간다
 */
export function addEvs(
  evs: Record<StatKey, number>,
  yields: Record<StatKey, number>,
): Record<StatKey, number> {
  const next = { ...evs }
  let total = STAT_KEYS.reduce((n, k) => n + next[k], 0)
  for (const k of STAT_KEYS) {
    if (total >= EV_TOTAL) break
    const room = Math.min(EV_PER_STAT - next[k], EV_TOTAL - total, yields[k])
    if (room <= 0) continue
    next[k] += room
    total += room
  }
  return next
}

export interface LevelUp {
  level: number
  /** 그 레벨에서 배우는 기술 번호 */
  moves: number[]
}

export interface RewardResult {
  mon: PokemonInstance
  gainedExp: number
  /** 오른 레벨마다 하나씩. 안 올랐으면 빈 배열 */
  levelUps: LevelUp[]
}

/**
 * 경험치와 노력치를 넣고 레벨을 맞춘다. 새 개체를 돌려준다 — 세이브는 불변이다.
 *
 * 배우는 기술을 **넣지는 않는다.** 4칸이 차 있으면 무엇을 지울지 물어야 하고,
 * 그건 화면이 할 일이다. 여기서는 "무엇을 배울 수 있게 됐는지"만 알려 준다
 */
export function applyReward(
  mon: PokemonInstance,
  species: Species,
  gainedExp: number,
  evYield: Record<StatKey, number>,
): RewardResult {
  const before = mon.level
  const cap = expForLevel(species.growthRate, MAX_LEVEL)
  const exp = Math.min(cap, mon.exp + Math.max(0, Math.floor(gainedExp)))
  const level = levelForExp(species.growthRate, exp)

  const levelUps: LevelUp[] = []
  for (let l = before + 1; l <= level; l++) {
    levelUps.push({ level: l, moves: species.learnset.filter((e) => e.level === l).map((e) => e.move) })
  }

  return {
    mon: { ...mon, exp, level, evs: addEvs(mon.evs, evYield) },
    gainedExp: exp - mon.exp,
    levelUps,
  }
}

/** 기술 네 칸 */
export const MOVE_SLOTS = 4

export interface LearnResult {
  mon: PokemonInstance
  /** 실제로 들어간 기술 */
  learned: number[]
  /** 칸이 없어서 못 넣은 기술. 무엇을 지울지 물어야 한다 */
  pending: number[]
}

/**
 * 레벨업으로 배우는 기술을 실제로 넣는다.
 *
 * **빈 칸이 있을 때만 넣는다.** 네 칸이 차 있으면 무엇을 지울지는 플레이어가
 * 정해야 하므로 `pending`으로 넘긴다 — 여기서 마음대로 지우면 마지막에 배운
 * 기술이 조용히 첫 칸을 덮어쓴다.
 *
 * 이미 아는 기술은 건너뛴다. 같은 기술을 두 번 배우는 종이 있다
 */
export function learnMoves(
  mon: PokemonInstance,
  moves: readonly number[],
  pp: (move: number) => number,
): LearnResult {
  const slots = [...mon.moves]
  const learned: number[] = []
  const pending: number[] = []
  for (const move of moves) {
    if (slots.some((s) => s.move === move)) continue
    if (slots.length >= MOVE_SLOTS) {
      if (!pending.includes(move)) pending.push(move)
      continue
    }
    slots.push({ move, pp: pp(move), ppUps: 0 })
    learned.push(move)
  }
  return { mon: learned.length ? { ...mon, moves: slots } : mon, learned, pending }
}

/** 종족의 노력치 산출값. 롬은 능력치당 0~3으로 담고 있다 */
export function evYieldOf(species: Species): Record<StatKey, number> {
  return { ...species.ev }
}
