// 배틀팩토리의 기록 (PARITY §9.3)
//
// `BattleFactorySave` + `BattleFrontierStats` + `BattleFactoryStreakFlags` 셋이
// 하는 일을 한 자리에 모았다. 원작이 셋으로 나눈 것은 통신 대전 기록과 자리를
// 나눠 쓰기 때문인데(§9), 우리는 팩토리만 쓰므로 나눌 이유가 없다.
//
// ⚠️ **`active`가 연승을 잇는 유일한 고리다.** 라운드를 마치면 서고 지면 꺼진다 —
// 도전을 열 때 이 비트가 서 있으면 저장된 연승을 이어받고, 아니면 0부터다
import type { PokemonInstance } from '../pokemon/instance'
import { MAX_STREAK } from './factoryTables'
import { ChallengeType, type DrawnSet } from './factory'

interface FactoryRecord {
  /** 지금 이어 가는 연승 */
  readonly streak: number
  /** 그 연승 동안 바꾼 횟수 */
  readonly trades: number
  /** 여태 최고 연승 */
  readonly best: number
  /** 그 최고를 냈을 때의 교환 횟수 */
  readonly bestTrades: number
  /** 라운드를 마치고 나온 상태인가 */
  readonly active: boolean
}

/**
 * 「쉰다」로 끈 도전 (`BattleFactorySave` · `ov104_02234148(…, 2)`).
 *
 * 원작이 적는 것은 트레이너 열넷 · 판 번호 · 내 셋 · **방금 이긴** 셋이다 — 다음 상대는
 * 다시 켠 뒤 「계속한다」에서 뽑는다. 개체는 PID까지 통째로 둔다(원작도 PID와 개체값을 적는다).
 * 연승과 교환 수는 기록 줄(`streak` · `trades`)에 같이 적힌다
 */
export interface FactorySuspended {
  readonly challenge: ChallengeType
  readonly openLevel: boolean
  /** 다음에 치를 판 번호 1~6 */
  readonly battle: number
  readonly trainers: readonly number[]
  readonly party: readonly PokemonInstance[]
  readonly partySets: readonly DrawnSet[]
  readonly defeated: readonly PokemonInstance[]
  readonly defeatedSets: readonly DrawnSet[]
}

export interface FactoryRecords {
  readonly records: readonly FactoryRecord[]
  /** 「쉰다」로 끈 도전. 없으면 null */
  readonly suspended: FactorySuspended | null
}

/** 넉 줄 — 레벨50·오픈레벨 × 싱글·더블. 멀티 넷은 §9라 안 둔다 */
export const FACTORY_SLOTS = 4

const EMPTY: FactoryRecord = { streak: 0, trades: 0, best: 0, bestTrades: 0, active: false }

export function newFactoryRecords(): FactoryRecords {
  return { records: Array.from({ length: FACTORY_SLOTS }, () => EMPTY), suspended: null }
}

/** `(isOpenLevel * 4) + challengeType`에서 멀티를 뺀 것 */
export function factorySlot(openLevel: boolean, challenge: ChallengeType): number {
  const type = challenge === ChallengeType.DOUBLE ? 1 : 0
  return (openLevel ? 2 : 0) + type
}

export function recordAt(all: FactoryRecords, slot: number): FactoryRecord {
  return all.records[slot] ?? EMPTY
}

function withSlot(all: FactoryRecords, slot: number, next: FactoryRecord): FactoryRecords {
  const records = all.records.map((r, i) => (i === slot ? next : r))
  return { ...all, records }
}

/**
 * 도전을 열 때 이어받는 값 (`ov104_022339B4`의 `param1 == 0` 갈래).
 *
 * ⚠️ **표식이 안 서 있으면 저장된 연승이 있어도 0부터다.** 진 뒤에도 연승
 * 값 자체는 남아 있어서(기록 화면이 보여 준다) 그것을 그냥 읽으면 진 사람이
 * 이어서 도전하게 된다
 */
export function beginChallenge(all: FactoryRecords, slot: number): { streak: number, trades: number } {
  const at = recordAt(all, slot)
  return at.active ? { streak: at.streak, trades: at.trades } : { streak: 0, trades: 0 }
}

/**
 * 도전이 끝났다 (`ov104_02234148`).
 *
 * @param active 라운드를 마쳤으면 참, 졌으면 거짓
 *
 * ⚠️ **최고 기록의 교환 횟수는 두 갈래로 갱신된다.** 연승이 최고와 **같으면**
 * 교환이 더 많은 쪽을 남기고(`SetIfBetter`), 최고를 **넘었으면** 그냥 덮어쓴다.
 * 하나로 합치면 기록을 깬 판의 교환 수가 옛 기록에 가려진다
 */
export function finishChallenge(
  all: FactoryRecords, slot: number, streak: number, trades: number, active: boolean,
): FactoryRecords {
  const at = recordAt(all, slot)
  const best = Math.max(at.best, streak)
  const bestTrades = streak === at.best ? Math.max(at.bestTrades, trades)
    : best > at.best ? trades : at.bestTrades
  return withSlot(all, slot, {
    streak: Math.min(streak, MAX_STREAK),
    trades: Math.min(trades, MAX_STREAK),
    best,
    bestTrades,
    active,
  })
}

/**
 * 「쉰다」 — 지금 연승과 교환 수만 적고 도전을 접어 둔다 (`ov104_02234148(…, 2)`).
 *
 * ⚠️ **표식도 최고 기록도 안 건드린다.** 원작의 `param1 != 2` 갈래가 통째로 빠진다 —
 * 쉬는 것은 끝난 것이 아니다
 */
export function suspendChallenge(
  all: FactoryRecords, slot: number, streak: number, trades: number, suspended: FactorySuspended,
): FactoryRecords {
  const at = recordAt(all, slot)
  const next = withSlot(all, slot, {
    ...at, streak: Math.min(streak, MAX_STREAK), trades: Math.min(trades, MAX_STREAK),
  })
  return { ...next, suspended }
}

/** 접어 둔 도전을 꺼냈다 — 한 번 이으면 지운다 */
export function clearSuspended(all: FactoryRecords): FactoryRecords {
  return all.suspended === null ? all : { ...all, suspended: null }
}

/**
 * 저장 안 하고 끈 도전 (`ScrCmd_2C5`) — 표식 · 최근 연승 · 최근 교환 수를 0으로.
 *
 * 로비가 다시 열릴 때 `LOAD_ACTION`이 아직 0xFF(도전 중)면 이 줄로 온다. 최고 기록은 남는다
 */
export function dropStreak(all: FactoryRecords, slot: number): FactoryRecords {
  const at = recordAt(all, slot)
  return withSlot(all, slot, { ...at, streak: 0, trades: 0, active: false })
}
