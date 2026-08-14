// 배틀팩토리 한 라운드 (PARITY §9.3)
//
// ⚠️ **한 판의 도전이 곧 한 라운드다.** 일곱을 다 이기면 로비로 돌아가고, 다음
// 라운드는 **새 도전**으로 시작한다 — 그때 개체를 다시 빌린다. 연승이 이어지는
// 것은 세션이 이어져서가 아니라 리포트에 **연승 표식**이 서기 때문이다
// (`BattleFactoryStreakFlags`): 라운드를 마치면 1이 서고, 지면 0이 된다.
// 다음 도전은 표식이 서 있으면 저장된 연승을, 아니면 0을 들고 시작한다.
//
// 그래서 이 파일이 아는 것은 **일곱 판**뿐이고, 그 바깥은 리포트가 기억한다
import {
  bpForRound, ChallengeType, drawSets, drawTrainers, opponentPartySize, opponentTierIndex,
  opponentTiers, playerPartySize, rentalTierIndex, rentalTiers, roundOf, RENTAL_POOL_SIZE,
  addStreak, type DrawnSet, type Rng, type SetShape,
} from './factory'
import { BATTLES_PER_ROUND } from './factoryTables'

/** 표를 읽는 자리 하나 — 시험이 가짜 표를 끼울 수 있게 좁게 둔다 */
export type SetLookup = (id: number) => SetShape

export interface FactoryRound {
  readonly challenge: ChallengeType
  readonly openLevel: boolean
  /** 라운드에 들어올 때의 연승. 라운드 번호가 여기서 나온다 */
  readonly streak: number
  /** 여태 바꾼 횟수. 층을 올려 주는 근거다 */
  readonly tradeCount: number
  readonly round: number
  /** 일곱 판의 상대 트레이너 */
  readonly trainers: readonly number[]
  /** 빌린 여섯 */
  readonly rentals: readonly DrawnSet[]
  /** 고른 셋. 아직 안 골랐으면 빈 배열이다 */
  readonly party: readonly DrawnSet[]
  /** 이번 판 상대의 셋 */
  readonly opponents: readonly DrawnSet[]
  /** 이번 판 번호 0~6 */
  readonly battle: number
  /** 방금 이긴 상대의 셋. 여기서 하나를 골라 내 하나와 바꾼다 */
  readonly swapPool: readonly DrawnSet[]
}

export interface OpenOptions {
  readonly challenge: ChallengeType
  readonly openLevel: boolean
  readonly streak: number
  readonly tradeCount: number
  readonly rng: Rng
  readonly setOf: SetLookup
}

function shapesOf(sets: readonly DrawnSet[], setOf: SetLookup): { species: number[], items: number[] } {
  const species: number[] = []
  const items: number[] = []
  for (const s of sets) {
    const shape = setOf(s.set)
    species.push(shape.species)
    if (shape.item !== undefined) items.push(shape.item)
  }
  return { species, items }
}

/** 그 판 상대의 셋을 뽑는다. 피할 것은 **지금 판에 있는 것 전부**다 */
function drawOpponents(
  round: Pick<FactoryRound, 'challenge' | 'openLevel' | 'trainers'>,
  battle: number, exclude: readonly DrawnSet[], rng: Rng, setOf: SetLookup,
): DrawnSet[] {
  const tiers = opponentTiers(round.openLevel)
  const trainer = round.trainers[battle] ?? 0
  return drawSets({
    tiers,
    tierIndex: opponentTierIndex(tiers, trainer),
    count: opponentPartySize(round.challenge),
    exclude: shapesOf(exclude, setOf),
    rng,
    setOf,
  })
}

/**
 * 라운드를 연다 (`ov104_02233BAC`).
 *
 * 트레이너 일곱 → 빌릴 여섯 → 첫 상대. **첫 상대는 빌린 여섯을 다 피해서**
 * 뽑는다 — 아직 고르기 전이라 여섯이 다 내 것일 수 있기 때문이다
 */
export function openRound(
  { challenge, openLevel, streak, tradeCount, rng, setOf }: OpenOptions,
): FactoryRound {
  const round = roundOf(streak)
  const trainers = drawTrainers(challenge, round, rng)
  const tiers = rentalTiers(openLevel)
  const rentals = drawSets({
    tiers,
    tierIndex: rentalTierIndex(round),
    count: RENTAL_POOL_SIZE,
    tradeCount,
    rng,
    setOf,
  })
  const base = { challenge, openLevel, trainers }
  return {
    challenge,
    openLevel,
    streak,
    tradeCount,
    round,
    trainers,
    rentals,
    party: [],
    opponents: drawOpponents(base, 0, rentals, rng, setOf),
    battle: 0,
    swapPool: [],
  }
}

/** 빌린 여섯 중 셋을 고른다 (`ov104_0223449C`) */
export function chooseParty(round: FactoryRound, picks: readonly number[]): FactoryRound {
  const want = playerPartySize(round.challenge)
  if (picks.length !== want) throw new Error(`${String(want)}마리를 골라야 한다 — ${String(picks.length)}마리다`)
  if (new Set(picks).size !== picks.length) throw new Error('같은 자리를 두 번 골랐다')
  const party = picks.map((i) => {
    const pick = round.rentals[i]
    if (pick === undefined) throw new Error(`빌린 것에 ${String(i)}번 자리가 없다`)
    return pick
  })
  return { ...round, party }
}

/** 라운드를 다 이겼는가 */
export function isRoundDone(round: FactoryRound): boolean {
  return round.battle >= BATTLES_PER_ROUND
}

/**
 * 한 판을 이겼다 (`ov104_02234570`).
 *
 * 연승이 하나 오르고, **방금 이긴 상대가 바꿀 수 있는 것이 되고**, 다음 상대를
 * 뽑는다.
 *
 * ⚠️ **다음 상대를 바꾸기 *전에* 뽑는다.** 원작의 차례가 그렇다 — 피할 목록이
 * 「내 셋 + 방금 이긴 셋」이라, 바꾼 뒤에 뽑아도 결과가 같아지도록 짜여 있다.
 * 차례를 뒤집으면 바꿔 온 마리와 다음 상대가 같은 도구를 들 수 있다
 */
export function winBattle(round: FactoryRound, rng: Rng, setOf: SetLookup): FactoryRound {
  const battle = round.battle + 1
  const streak = addStreak(round.streak)
  const swapPool = round.opponents
  if (battle >= BATTLES_PER_ROUND) {
    return { ...round, battle, streak, swapPool: [], opponents: [] }
  }
  const opponents = drawOpponents(round, battle, [...round.party, ...round.opponents], rng, setOf)
  return { ...round, battle, streak, swapPool, opponents }
}

/**
 * 내 한 마리를 방금 이긴 상대의 한 마리와 바꾼다 (`ov104_022346A4`).
 *
 * ⚠️ **바꾼 수가 다음 도전의 개체값을 올린다** (`FACTORY_ELITE_STEPS`).
 * 그래서 이 수를 리포트가 연승과 나란히 기억한다
 */
export function applySwap(round: FactoryRound, mySlot: number, theirSlot: number): FactoryRound {
  const taken = round.swapPool[theirSlot]
  if (taken === undefined) throw new Error(`바꿀 것에 ${String(theirSlot)}번 자리가 없다`)
  if (mySlot < 0 || mySlot >= round.party.length) throw new Error(`내 ${String(mySlot)}번 자리가 없다`)
  const party = [...round.party]
  party[mySlot] = taken
  return { ...round, party, tradeCount: Math.min(round.tradeCount + 1, 9999), swapPool: [] }
}

/** 안 바꾸고 넘어간다 */
export function skipSwap(round: FactoryRound): FactoryRound {
  return { ...round, swapPool: [] }
}

/**
 * 라운드를 마치고 받는 BP.
 *
 * ⚠️ **마친 라운드 수로 센다 — 들어올 때의 라운드 번호가 아니다.** 원작이
 * `unk_0E`를 **먼저 올리고** 값을 읽기 때문이다 (`ov104_02234480` → `_022347F8`).
 * 들어올 때의 번호로 세면 첫 라운드가 0 BP가 되어 아무도 못 번다
 */
export function roundReward(round: FactoryRound): number {
  return bpForRound(round.challenge, roundOf(round.streak), round.streak)
}

/** 이번 판 상대 트레이너의 번호 */
export function currentTrainer(round: FactoryRound): number {
  return round.trainers[Math.min(round.battle, round.trainers.length - 1)] ?? 0
}
