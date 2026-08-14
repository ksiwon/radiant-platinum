// 상호교류광장 (PARITY §7.8) — `scrcmd_amity_square.c`
//
// 연고시티 옆의 작은 공원. 파티에서 **한 마리만** 데리고 들어가 함께 걷고,
// 그 마리가 걷다가 장식을 주워 온다.
//
// ⚠️ **무엇을 주워 오는지는 데려간 마리가 정한다.** 여섯 무리로 갈리고
// 표에 없는 종은 0번 무리(불꽃원숭이 쪽)를 쓴다 — 원작의 `default`가 그렇다.
//
// ⚠️ **걸음은 스크립트 변수 하나에 쌓인다** (`VAR_AMITY_SQUARE_STEP_COUNT`).
// 만에서 멈추고, 들어갈 때 0으로 지운다.
import {
  AMITY_FIND, AMITY_FIND_WEIGHTS, AMITY_FIRST_ACCESSORY_GIFT, AMITY_GIFTS, AMITY_POOL_OF,
} from './amityTables'

/** `VAR_AMITY_SQUARE_STEP_COUNT`. 절대 번호다 (`VARS_START` + 58) */
export const VAR_AMITY_STEPS = 16442

/** 걸음이 여기서 멈춘다 (`SystemVars_IncrementAmitySquareStepCount`) */
export const AMITY_STEP_MAX = 10000

/** 한 걸음. 만에서 더 안 는다 */
export function amityStep(steps: number): number {
  return steps < AMITY_STEP_MAX ? steps + 1 : AMITY_STEP_MAX
}

const POOL = new Map(AMITY_POOL_OF)

/** 그 마리가 어느 무리인가. 표에 없으면 0이다 */
export function amityPool(species: number): number {
  return POOL.get(species) ?? 0
}

/**
 * 굴린 값이 어느 자리인가 (`ScrCmd_CalcAmitySquareFoundAccessory`).
 *
 * ⚠️ **누적 확률이라 자리마다 폭이 다르다** — 앞의 넷이 15%씩, 다음 둘이 10%,
 * 그다음 8%·5%·5%·2%다. 합이 딱 100이다
 *
 * @param roll 0~99 (`LCRNG_Next() % 100`)
 */
export function amityFindIndex(roll: number): number {
  let at = 0
  for (let i = 0; i < AMITY_FIND_WEIGHTS.length; i++) {
    at += AMITY_FIND_WEIGHTS[i]!
    if (roll < at) return i
  }
  return AMITY_FIND_WEIGHTS.length - 1
}

/** 그 마리가 주워 온 장식 (`ScrCmd_CalcAmitySquareFoundAccessory`) */
export function amityFound(species: number, roll: number): number {
  const pool = AMITY_FIND[amityPool(species)] ?? AMITY_FIND[0]!
  return pool[amityFindIndex(roll)] ?? 0
}

/** 아저씨의 선물 번호 (`ScrCmd_CalcAmitySquareBerryAndAccessoryManOptionID`) */
export const AMITY_GIFT_COUNT = AMITY_GIFTS.length

/**
 * 그 선물이 장식인가 (`ScrCmd_CheckAmitySquareManGiftIsAccessory`).
 *
 * ⚠️ **번호로만 가른다.** 앞의 아홉이 열매고 뒤가 장식이다 — 표 차례가 곧 갈래다
 */
export function amityGiftIsAccessory(option: number): boolean {
  return option >= AMITY_FIRST_ACCESSORY_GIFT
}

/** 그 선물의 도구·장식 번호 (`ScrCmd_GetAmitySquareBerryOrAccessoryIDFromMan`) */
export function amityGiftId(option: number): number {
  return AMITY_GIFTS[option] ?? 0
}
