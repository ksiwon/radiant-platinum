// 게임코너 경품과 축복시티 복권 (PARITY §4.10 · §7.6)
//
// 둘 다 **코드 안의 표와 셈**이다 — 아카이브에 없다
// (`scrcmd_game_corner_prize.c` · `scrcmd_jubilife_lottery.c`).

/** 경품 하나 — 무엇을 코인 몇에 주는가 */
interface GameCornerPrize {
  readonly item: number
  readonly coins: number
}

/**
 * 경품 열아홉 (`sGameCornerPrizeData`).
 *
 * ⚠️ **차례가 곧 번호다.** 스크립트가 목록의 줄 번호를 그대로 넘기므로
 * 값싼 순으로 다시 정렬하면 엉뚱한 물건이 나간다.
 *
 * 앞 넷이 지닌 도구 1,000코인이고 나머지 열다섯이 기술머신이다 —
 * 2,000에서 20,000까지 오른다
 */
export const GAME_CORNER_PRIZES: readonly GameCornerPrize[] = [
  { item: 251, coins: 1000 }, // ITEM_SILK_SCARF
  { item: 265, coins: 1000 }, // ITEM_WIDE_LENS
  { item: 276, coins: 1000 }, // ITEM_ZOOM_LENS
  { item: 277, coins: 1000 }, // ITEM_METRONOME
  { item: 417, coins: 2000 }, // ITEM_TM90
  { item: 385, coins: 2000 }, // ITEM_TM58
  { item: 402, coins: 4000 }, // ITEM_TM75
  { item: 359, coins: 4000 }, // ITEM_TM32
  { item: 371, coins: 6000 }, // ITEM_TM44
  { item: 416, coins: 6000 }, // ITEM_TM89
  { item: 337, coins: 6000 }, // ITEM_TM10
  { item: 354, coins: 8000 }, // ITEM_TM27
  { item: 348, coins: 8000 }, // ITEM_TM21
  { item: 362, coins: 10000 },// ITEM_TM35
  { item: 351, coins: 10000 },// ITEM_TM24
  { item: 340, coins: 10000 },// ITEM_TM13
  { item: 356, coins: 10000 },// ITEM_TM29
  { item: 401, coins: 15000 },// ITEM_TM74
  { item: 395, coins: 20000 },// ITEM_TM68
]

export function gameCornerPrize(index: number): GameCornerPrize | null {
  return GAME_CORNER_PRIZES[index] ?? null
}

/**
 * 당첨 번호와 트레이너 번호가 **뒤에서부터 몇 자리** 맞는가
 * (`CheckTrainerIdForMatch`).
 *
 * ⚠️ **끝자리부터 세고 한 자리라도 틀리면 그 자리에서 멈춘다.** 가운데가
 * 맞아도 소용없다 — 12345와 92345는 넉 자리, 12345와 12340은 **0자리**다.
 *
 * ⚠️ **다섯 자리까지만 센다** (`TRAINER_ID_MAX_LENGTH`). 트레이너 번호가
 * 65,535까지 가므로 여섯 자리가 나올 수 있는데 원작이 거기서 끊는다
 */
export const LOTTERY_DIGITS = 5

export function lotteryMatch(winning: number, otId: number): number {
  let a = winning
  let b = otId
  let matched = 0
  for (let i = 0; i < LOTTERY_DIGITS; i++) {
    if (a % 10 !== b % 10) break
    a = Math.floor(a / 10)
    b = Math.floor(b / 10)
    matched++
  }
  return matched
}

/** 복권을 맞춰 볼 한 마리 */
export interface LotteryEntry {
  readonly otId: number
  readonly isEgg: boolean
}

interface LotteryResult {
  /** 파티 자리 번호, 또는 박스 전체를 한 줄로 센 자리 */
  readonly index: number
  readonly digits: number
  readonly inBox: boolean
}

/**
 * 파티와 박스를 다 뒤져 **제일 많이 맞은 한 마리**를 찾는다
 * (`ScrCmd_CheckForJubilifeLotteryWinner`).
 *
 * ⚠️ **알은 안 센다.** 알에도 원트레이너 번호가 있지만 원작이 건너뛴다.
 *
 * ⚠️ **같은 자릿수면 파티가 이긴다** (`highestPartyMatchedDigits >= highestBox…`).
 * 박스를 먼저 보면 같은 값에서 답이 달라진다
 */
export function lotteryWinner(
  winning: number, party: readonly LotteryEntry[], boxes: readonly (LotteryEntry | null)[],
): LotteryResult {
  let partyBest = 0
  let partyAt = 0
  for (const [i, mon] of party.entries()) {
    if (mon.isEgg) continue
    const digits = lotteryMatch(winning, mon.otId & 0xffff)
    if (digits > 0 && partyBest < digits) { partyBest = digits; partyAt = i }
  }

  let boxBest = 0
  let boxAt = 0
  for (const [i, mon] of boxes.entries()) {
    if (!mon || mon.isEgg) continue
    const digits = lotteryMatch(winning, mon.otId & 0xffff)
    if (digits > 0 && boxBest < digits) { boxBest = digits; boxAt = i }
  }

  if (partyBest === 0 && boxBest === 0) return { index: 0, digits: 0, inBox: false }
  if (partyBest >= boxBest) return { index: partyAt, digits: partyBest, inBox: false }
  return { index: boxAt, digits: boxBest, inBox: true }
}

/** `VAR_LOTTERY_TRAINER_ID_LOW_HALF` — 당첨 번호의 아래 16비트 */
export const VAR_LOTTERY_ID_LOW = 16444
/** `VAR_LOTTERY_TRAINER_ID_HIGH_HALF` */
export const VAR_LOTTERY_ID_HIGH = 16445
