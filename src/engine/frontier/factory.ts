// 배틀팩토리의 규칙 (PARITY §9.3)
//
// 빌린 여섯에서 셋을 골라 일곱 판을 이어 싸우고, **이길 때마다 쓰러뜨린 상대의
// 한 마리와 내 한 마리를 바꿀 수 있다**. 일곱을 다 이기면 라운드가 끝나고 BP를
// 받는다. 스물한 판째와 마흔아홉 판째에는 시설장 소튼이 나온다.
//
// ⚠️ **난수열까지 원작과 맞추지 않는다.** 이 리포의 다른 뽑기와 같은 규칙이다
// (`engine/battle/encounter`) — `rng()`가 0 이상 1 미만을 준다. 맞추는 것은
// **어느 표의 어느 구간에서 몇 개를, 무엇을 피해서 뽑는가**다.
//
// ⚠️ **멀티는 여기 없다.** 상대와 짝이 있어야 성립하므로 §9다. 자리는
// `challengeType`에 남겨 두었고 BP 표도 남겼다
import {
  BATTLES_PER_ROUND, BP_BY_ROUND_MULTI, BP_BY_ROUND_SOLO, BP_PRINT_ROUND,
  FACTORY_ELITE_STEPS, MAX_STREAK, STREAK_GOLD, STREAK_SILVER,
  TIERS_LV50, TIERS_OPEN_OPPONENT, TIERS_OPEN_RENTAL,
  TRAINER_RANGES, TRAINER_THORTON_GOLD, TRAINER_THORTON_SILVER,
  type SetTier,
} from './factoryTables'

export type Rng = () => number

/** `FRONTIER_CHALLENGE_*`. 멀티 둘은 §9라 값만 있다 */
export const enum ChallengeType {
  SINGLE = 0,
  DOUBLE = 1,
  MULTI = 2,
  MULTI_WFC = 3,
}

/** 빌리는 자리 여섯. 그중 셋을 고른다 */
export const RENTAL_POOL_SIZE = 6

/** 표에서 뽑은 개체 하나 — 어느 형인지와 개체값 몇인지 */
export interface DrawnSet {
  /** `frontier.json`의 자리 번호 */
  readonly set: number
  /** 여섯 능력에 똑같이 들어가는 값 */
  readonly ivs: number
}

/** 뽑기가 봐야 하는 형의 최소한 — 종족과 도구뿐이다 */
export interface SetShape {
  readonly species: number
  readonly item?: number
}

/** 뽑을 때 피해야 하는 것 (이미 판에 있는 종족·도구) */
export interface Exclusion {
  readonly species: readonly number[]
  readonly items: readonly number[]
}

const NO_EXCLUSION: Exclusion = { species: [], items: [] }

/**
 * 뽑기가 못 끝날 때 멈추는 자리.
 *
 * ⚠️ **원작에는 상한이 없다** (`while (v1 != param3)`). 층마다 백 개 넘는
 * 후보에서 최대 열 개를 피하는 것이라 원작에서는 못 끝날 수가 없지만,
 * 표를 잘못 옮기면 여기서 영영 돈다. 조용히 모자란 채로 내보내는 대신
 * **소리 내어 선다**
 */
const DRAW_TRIES = 10000

function randMod(rng: Rng, n: number): number {
  return Math.floor(rng() * n)
}

/** 라운드 번호. 일곱 판이 한 라운드다 */
export function roundOf(streak: number): number {
  return Math.floor(streak / BATTLES_PER_ROUND)
}

/** 레벨50이면 50, 오픈레벨이면 100 (`BattleFactory_GetPokemonLevel`) */
export function factoryLevel(openLevel: boolean): number {
  return openLevel ? 100 : 50
}

/** 내가 데리고 들어가는 수 (`BattleFactory_GetPlayerPartySize`) */
export function playerPartySize(challenge: ChallengeType): number {
  return challenge === ChallengeType.SINGLE || challenge === ChallengeType.DOUBLE ? 3 : 2
}

/**
 * 상대가 데리고 나오는 수 (`BattleFactory_GetOpponentPartySize`).
 *
 * 멀티는 **뽑을 때 넷이고 싸울 때 둘**이다 — 둘이 나눠 낸다
 */
export function opponentPartySize(challenge: ChallengeType, drawing = true): number {
  if (challenge === ChallengeType.SINGLE || challenge === ChallengeType.DOUBLE) return 3
  return drawing ? 4 : 2
}

/**
 * 교환을 많이 한 사람에게 **마지막 몇 자리를 한 층 위에서** 뽑아 준다.
 *
 * ⚠️ **여섯 번까지는 하나도 안 올라간다** — 문턱 이하인 첫 자리의 **번호**가
 * 곧 개수라, 첫 문턱(6)에 걸리면 0이다. 34를 넘어야 다섯이다
 */
export function eliteSlots(tradeCount: number): number {
  if (tradeCount === 0) return 0
  for (let i = 0; i < FACTORY_ELITE_STEPS.length; i++) {
    if (tradeCount <= FACTORY_ELITE_STEPS[i]!) return i
  }
  return FACTORY_ELITE_STEPS.length
}

/** 빌릴 것을 뽑는 층. 라운드 번호로 **바로 집는다** (`ov104_0223A8F4`) */
export function rentalTiers(openLevel: boolean): readonly SetTier[] {
  return openLevel ? TIERS_OPEN_RENTAL : TIERS_LV50
}

export function rentalTierIndex(round: number): number {
  return Math.min(round, TRAINER_RANGES.length - 1)
}

/** 상대 것을 뽑는 층. **트레이너 번호의 문턱**으로 찾는다 (`ov104_0223A8A8`) */
export function opponentTiers(openLevel: boolean): readonly SetTier[] {
  return openLevel ? TIERS_OPEN_OPPONENT : TIERS_LV50
}

export function opponentTierIndex(tiers: readonly SetTier[], trainerID: number): number {
  const at = tiers.findIndex((t) => trainerID < t.upTo)
  return at < 0 ? tiers.length - 1 : at
}

export interface DrawOptions {
  readonly tiers: readonly SetTier[]
  readonly tierIndex: number
  readonly count: number
  /** 층을 올려 주는 근거. 상대 것을 뽑을 때는 0이다 */
  readonly tradeCount?: number
  readonly exclude?: Exclusion
  readonly rng: Rng
  /** 자리 번호로 형을 준다 */
  readonly setOf: (id: number) => SetShape
}

/**
 * 개체 여러 마리를 뽑는다 (`ov104_0223A918`).
 *
 * ⚠️ **종족도 도구도 겹치면 안 된다.** 이미 뽑은 것과도, 피할 목록과도 겹치면
 * 버리고 다시 뽑는다 — 그래서 여섯 마리가 도구 여섯 가지를 나눠 든다.
 *
 * ⚠️ **구간의 위쪽에서 아래로 뽑는다** (`to - rand(to - from + 1)`). 양끝이 다
 * 들어간다 — `from + rand(...)`로 바꿔 쓰면 폭은 같지만 원작과 다른 자리다
 */
export function drawSets(
  { tiers, tierIndex, count, tradeCount = 0, exclude = NO_EXCLUSION, rng, setOf }: DrawOptions,
): DrawnSet[] {
  const tier = tiers[tierIndex]
  if (tier === undefined) throw new Error(`층 ${String(tierIndex)}가 없다`)
  const next = tiers[tierIndex + 1]
  const elite = eliteSlots(tradeCount)

  const out: DrawnSet[] = []
  const taken: SetShape[] = []
  for (let tries = 0; out.length < count; tries++) {
    if (tries >= DRAW_TRIES) {
      throw new Error(`개체를 ${String(count)}마리 못 뽑았다 — 층 ${String(tierIndex)}에서 ${String(out.length)}마리에서 막혔다`)
    }
    const stepUp = out.length >= count - elite && tier.canStepUp && next !== undefined
    const from = stepUp ? next.from : tier.from
    const to = stepUp ? next.to : tier.to
    const id = to - randMod(rng, to - from + 1)
    const mon = setOf(id)

    if (taken.some((t) => t.species === mon.species || t.item === mon.item)) continue
    if (exclude.species.includes(mon.species)) continue
    if (mon.item !== undefined && exclude.items.includes(mon.item)) continue

    taken.push(mon)
    out.push({ set: id, ivs: stepUp ? next.ivs : tier.ivs })
  }
  return out
}

/**
 * 그 판의 상대 트레이너 (`ov104_0223A7F4`).
 *
 * ⚠️ **라운드의 마지막 판은 구간이 다르다** — 앞 여섯은 `normal`에서, 일곱
 * 번째는 `last`에서 뽑는다. 그리고 싱글의 스물한·마흔아홉 판째는 뽑지 않고
 * **시설장 소튼이 나온다**
 */
export function trainerFor(
  challenge: ChallengeType, round: number, battle: number, rng: Rng,
): number {
  const at = Math.min(round, TRAINER_RANGES.length - 1)
  const range = TRAINER_RANGES[at]!

  if (challenge === ChallengeType.SINGLE) {
    const overall = at * BATTLES_PER_ROUND + battle + 1
    if (overall === STREAK_SILVER) return TRAINER_THORTON_SILVER
    if (overall === STREAK_GOLD) return TRAINER_THORTON_GOLD
  }

  const isLast = battle === BATTLES_PER_ROUND - 1 || battle === BATTLES_PER_ROUND * 2 - 1
  const start = isLast ? range.last : range.normal
  const end = isLast ? range.lastEnd : range.normalEnd
  return start + randMod(rng, end - start)
}

/**
 * 라운드 하나에 나올 트레이너들 (`ov104_0223A860`). **서로 다르게** 뽑는다.
 *
 * 원작은 멀티를 위해 늘 열넷을 뽑고 뒤 일곱을 짝의 상대로 쓴다. 멀티가
 * §9라 일곱만 뽑는다 — 뽑는 자리가 같으므로 수만 다르다
 */
export function drawTrainers(
  challenge: ChallengeType, round: number, rng: Rng, count = BATTLES_PER_ROUND,
): number[] {
  const out: number[] = []
  for (let tries = 0; out.length < count; tries++) {
    if (tries >= DRAW_TRIES) {
      throw new Error(`트레이너를 ${String(count)}명 못 뽑았다 — ${String(out.length)}명에서 막혔다`)
    }
    const id = trainerFor(challenge, round, out.length, rng)
    if (out.includes(id)) continue
    out.push(id)
  }
  return out
}

/**
 * 라운드를 끝내고 받는 BP (`ov104_022347F8`).
 *
 * ⚠️ **인쇄가 붙는 판은 값이 통째로 바뀐다** — 싱글에서 연승이 21이나 49면
 * 라운드 표를 안 보고 20 BP다
 */
export function bpForRound(challenge: ChallengeType, round: number, streak: number): number {
  const solo = challenge === ChallengeType.SINGLE || challenge === ChallengeType.DOUBLE
  const table = solo ? BP_BY_ROUND_SOLO : BP_BY_ROUND_MULTI
  const at = Math.min(round, table.length - 1)
  if (challenge === ChallengeType.SINGLE && (streak === STREAK_SILVER || streak === STREAK_GOLD)) {
    return BP_PRINT_ROUND
  }
  return table[at]!
}

/** 다음 판이 인쇄가 걸린 판인가 (`BF_FUNC_UNK_37`) — 0 아님 · 1 은 · 2 금 */
export function printAtNext(challenge: ChallengeType, streak: number): 0 | 1 | 2 {
  if (challenge !== ChallengeType.SINGLE) return 0
  if (streak + 1 === STREAK_SILVER) return 1
  if (streak + 1 === STREAK_GOLD) return 2
  return 0
}

/** 연승을 하나 더한다. 9999에서 멈춘다 */
export function addStreak(streak: number): number {
  return Math.min(streak + 1, MAX_STREAK)
}

/**
 * 상대 파티에서 제일 많은 타입 (`BF_FUNC_UNK_18`).
 *
 * 배틀룸의 직원이 이걸로 귀띔한다. **둘 이상 겹칠 때만** 답하고, 아니면
 * `null`이다 — 셋이 다 다른 타입이면 알려 줄 것이 없다.
 *
 * ⚠️ **같은 수면 번호가 작은 타입이 이긴다.** 원작이 열여덟 칸을 차례로 훑어
 * `v0[v9] < v0[i]`일 때만 바꾸기 때문이다 — Map을 넣은 차례로 훑으면 답이 달라진다
 */
export const TYPE_COUNT = 18

export function commonType(types: readonly (readonly [number, number])[]): number | null {
  const count = new Array<number>(TYPE_COUNT).fill(0)
  for (const [t1, t2] of types) {
    if (t1 < TYPE_COUNT) count[t1]!++
    if (t2 !== t1 && t2 < TYPE_COUNT) count[t2]!++
  }
  let best = 0
  for (let i = 0; i < TYPE_COUNT; i++) if (count[best]! < count[i]!) best = i
  return count[best]! > 1 ? best : null
}
