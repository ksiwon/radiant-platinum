// 게임 기록과 트레이너 스코어의 표 (PARITY §7.5)
//
// ⚠️ **손으로 고치지 않는다** — `pnpm gen:records`가 디컴프에서 다시 만든다
// (`tools/extract/gameRecordsModule.cjs`).

/** 기록 칸 수 (`MAX_RECORDS`) */
export const MAX_RECORDS = 148

/**
 * 앞 71칸이 u32고 나머지가 u16이다 (`NUM_U32_RECORDS`).
 *
 * ⚠️ **상한이 그 폭에서 갈린다** — u32는 999,999이나
 * 999,999,999, u16은 9,999이나 65535이다
 */
export const NUM_U32_RECORDS = 71

export const LOW_LIMIT_U32 = 999999
export const HIGH_LIMIT_U32 = 999999999
export const LOW_LIMIT_U16 = 9999
export const HIGH_LIMIT_U16 = 65535

/**
 * 기록마다 높은 상한을 쓰는가 (`sUsesHighLimit`).
 *
 * 자리가 곧 기록 번호다. ⚠️ **폭과 따로다** — u16 칸인데 높은 상한(0xFFFF)을
 * 쓰는 것도, u32 칸인데 낮은 상한(999,999)을 쓰는 것도 있다
 */
export const USES_HIGH_LIMIT: readonly boolean[] = [
  true, true, true, false, true, true, true, true,
  true, false, false, false, true, true, true, true,
  true, true, true, true, true, true, true, true,
  true, true, true, true, true, true, true, true,
  true, true, true, true, true, true, true, true,
  true, false, false, false, false, false, false, false,
  false, false, false, false, false, false, false, false,
  false, true, true, true, true, true, true, true,
  true, true, true, true, true, true, false, true,
  true, false, true, true, false, false, false, false,
  false, false, false, false, false, false, false, false,
  false, false, false, false, false, false, true, false,
  false, false, false, false, false, false, false, false,
  false, false, false, false, false, false, false, false,
  true, false, false, false, false, false, false, false,
  false, false, false, false, false, false, false, false,
  false, false, false, false, false, false, false, false,
  false, false, false, false, false, false, false, false,
  false, false, false, false,
]

/** 트레이너 스코어 사건 수 (`MAX_TRAINER_SCORE_EVENTS`) */
export const MAX_TRAINER_SCORE_EVENTS = 51

/**
 * 그 일이 스코어를 몇 올리는가 (`sTrainerScoreIncrements`).
 *
 * 자리가 곧 사건 번호다. 1(나무열매 수확)부터 10,000(전국도감 상장)까지 있다
 */
export const TRAINER_SCORE_INCREMENT: readonly number[] = [
  1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3,
  3, 7, 7, 7, 10, 10, 11, 11, 11, 11, 20, 30,
  35, 40, 500, 10000, 30, 30, 2, 5, 1, 1, 5, 3,
  1, 1, 7, 7, 7, 7, 1000, 11, 20, 10, 15, 11,
  11, 10, 10,
]
