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

/**
 * 쓰러진 상대 하나가 내놓는 경험치를 두 몫으로 가른 것 (`BtlCmd_CalcExpGain`).
 *
 * ⚠️ **학습장치를 든 마리가 하나라도 있으면 절반이 통째로 그쪽으로 간다.**
 * 나간 마리들이 나머지 절반을 나눠 갖는 것이지, 학습장치가 따로 얹히는 게 아니다
 */
interface ExpPool {
  /** 배틀에 나갔던 마리 하나가 받는 몫 */
  gained: number
  /** 학습장치를 든 마리 하나가 받는 몫. 든 마리가 없으면 0 */
  shared: number
}

/**
 * ARM의 정수 나눗셈. **0으로 나누면 0이다** (`__divsi3`).
 *
 * 이 자리가 실제로 생긴다: 나갔던 마리가 전부 쓰러졌는데 벤치에 학습장치를 든
 * 마리가 있으면 나눌 인원이 0이 된다. 그때도 학습장치 몫은 살아 있어야 한다
 */
function divide(a: number, b: number): number {
  return b === 0 ? 0 : Math.floor(a / b)
}

/**
 * 쓰러진 상대 하나가 내놓는 경험치 (`BtlCmd_CalcExpGain`).
 *
 * `기초경험치 × 레벨 / 7`이 전부다. 4세대는 5세대와 달리 **이긴 쪽 레벨을
 * 안 본다** — 낮은 레벨로 강한 상대를 잡아도 보정이 없다.
 *
 * ⚠️ **배수는 여기서 안 곱한다.** 럭키에그도 트레이너전도 교환 보정도 **받는
 * 마리마다** 갈리므로 `expFor`가 곱한다 — 여기서 곱하면 학습장치를 든 마리가
 * 남의 럭키에그로 불어난 경험치를 받는다
 *
 * @param participants 나갔고 아직 안 쓰러진 마리 수. 레벨 100도 여기 센다
 * @param shareHolders 학습장치를 들고 안 쓰러진 마리 수
 */
export function expPool(
  baseExp: number, level: number, participants: number, shareHolders: number,
): ExpPool {
  const exp = Math.floor((baseExp * level) / 7)
  const share = Math.max(0, Math.floor(shareHolders))
  const many = Math.max(0, Math.floor(participants))
  if (share === 0) return { gained: Math.max(1, divide(exp, many)), shared: 0 }
  const half = Math.floor(exp / 2)
  return {
    gained: Math.max(1, divide(half, many)),
    shared: Math.max(1, divide(half, share)),
  }
}

/** 한 마리가 경험치를 받을 때 걸리는 것들 */
interface ExpBonus {
  /** 배틀에 나갔는가 — 나갔어야 `gained` 몫을 받는다 */
  participant: boolean
  /** 학습장치를 들었는가 — 들었어야 `shared` 몫을 받는다 */
  expShare?: boolean
  /** 럭키에그(`HOLD_EFFECT_EXP_UP`)를 들었으면 1.5배 */
  luckyEgg?: boolean
  /** 트레이너전이면 1.5배 */
  trainerBattle?: boolean
  /** 원래 트레이너가 내가 아니면 1.5배 (`BattleSystem_PokemonIsOT`) */
  traded?: boolean
}

/**
 * 그 한 마리가 실제로 받는 경험치 (`BattleScript_GetExpTask`).
 *
 * ⚠️ **곱하는 차례가 정해져 있다.** 몫을 먼저 더하고 → 럭키에그 → 트레이너전 →
 * 교환. 매번 버림이라 차례를 바꾸면 값이 1씩 달라진다.
 *
 * ⚠️ **다른 나라 말로 된 개체의 1.7배는 없다.** 원작은 `MON_DATA_LANGUAGE`가
 * 내 판과 다를 때만 그 배수를 쓰는데, 통신이 없는 우리 판에는 다른 말로 된
 * 개체가 들어올 길이 없다 — 자리만 만들어 두면 영영 안 서는 가지가 된다
 */
export function expFor(pool: ExpPool, bonus: ExpBonus): number {
  let exp = 0
  if (bonus.participant) exp += pool.gained
  if (bonus.expShare) exp += pool.shared
  if (exp === 0) return 0
  if (bonus.luckyEgg) exp = Math.floor((exp * 150) / 100)
  if (bonus.trainerBattle) exp = Math.floor((exp * 150) / 100)
  if (bonus.traded) exp = Math.floor((exp * 150) / 100)
  return exp
}

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'

/**
 * 노력치가 차는 차례 (`STAT_HP` … `STAT_SPECIAL_DEFENSE`).
 *
 * ⚠️ **스피드가 특수공격보다 앞이다.** 4세대의 능력치 열거가 그 순서고,
 * 합계 510에 닿는 순간 **누가 마지막 몇 점을 가져가느냐**가 여기서 갈린다.
 * 흔한 `hp atk def spa spd spe` 차례로 두면 그 자리에서 값이 어긋난다
 */
const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spe', 'spa', 'spd']

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

interface LevelUp {
  level: number
  /** 그 레벨에서 배우는 기술 번호 */
  moves: number[]
}

interface RewardResult {
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
 *
 * ⚠️ **레벨 100은 노력치도 안 먹는다.** 원작이 경험치와 노력치를 같은
 * `if (HP && level != MAX_POKEMON_LEVEL)` 안에 넣어 둔다 — 경험치만 막으면
 * 다 큰 마리의 노력치가 배틀마다 조용히 차오른다
 */
export function applyReward(
  mon: PokemonInstance,
  species: Species,
  gainedExp: number,
  evYield: Record<StatKey, number>,
): RewardResult {
  if (mon.level >= MAX_LEVEL) return { mon, gainedExp: 0, levelUps: [] }
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

interface LearnResult {
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

// ── 노력치를 불리는 것들 (`generated/item_hold_effects.txt`의 줄 번호 −1) ──────

/** 마초브레이스 — 노력치 두 배, 스피드 절반 */
export const HOLD_EFFECT_EV_UP = 50
/** 학습장치 */
export const HOLD_EFFECT_EXP_SHARE = 51
/** 럭키에그 */
export const HOLD_EFFECT_EXP_UP = 66

/**
 * 파워 아이템 여섯. 홀드 효과 → 그 도구가 밀어 주는 능력치.
 *
 * ⚠️ **차례가 능력치 열거와 다르다.** 공격·방어·특공·특방·스피드·HP 순으로
 * 붙어 있다 — 능력치 순으로 짐작해 매기면 파워앵클이 HP를 올린다
 */
const POWER_ITEM_STAT: Readonly<Record<number, StatKey>> = {
  117: 'atk', 118: 'def', 119: 'spa', 120: 'spd', 121: 'spe', 122: 'hp',
}

/** 노력치가 얼마나 들어가는지를 바꾸는 것들 */
interface EvBonus {
  /** 든 도구의 홀드 효과 (`ItemData.holdEffect`) */
  holdEffect?: number
  /** 그 도구의 `effectParam`. 파워 아이템이 더해 주는 값(4)이다 */
  itemPower?: number
  /** 포켓루스에 걸린 적이 있는가 (`pokerus.doublesEvs`) — 두 배 */
  pokerus?: boolean
}

/**
 * 이 마리가 실제로 먹는 노력치 (`BattleScript_CalcEffortValues`).
 *
 * ⚠️ **차례가 값을 바꾼다.** 파워 아이템을 먼저 더하고 그 합에 포켓루스와
 * 마초브레이스를 곱한다 — 곱한 뒤에 더하면 파워앵클 4가 8이 안 된다.
 * 둘 다 걸리면 네 배다 (원작이 `*= 2`를 따로 두 번 한다)
 */
export function evYieldOf(species: Species, bonus: EvBonus = {}): Record<StatKey, number> {
  const power = bonus.holdEffect === undefined ? undefined : POWER_ITEM_STAT[bonus.holdEffect]
  const out = { ...species.ev }
  for (const k of STAT_KEYS) {
    let n = out[k]
    if (power === k) n += bonus.itemPower ?? 0
    if (bonus.pokerus) n *= 2
    if (bonus.holdEffect === HOLD_EFFECT_EV_UP) n *= 2
    out[k] = n
  }
  return out
}
