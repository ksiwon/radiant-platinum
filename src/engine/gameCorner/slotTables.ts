// 슬롯머신의 표 (PARITY §7.6 · `overlay101/ov101_021D94D8.c`)
//
// ⚠️ **아카이브에 없는 표다** — 오버레이 101의 상수라 사용자 롬 하나로는 못 꺼낸다. 디컴프에서 옮겼고
// `slotMachine.test.ts`가 디컴프 소스와 한 칸씩 맞댄다. 이름은 원작에 없어서 뜻으로 붙였다.
//
// 설정(0~5)이 높을수록 잘 나온다. 기계 열두 대의 설정은 `slotSettings`가 섞는다

/** 기호 — 0 세븐(빨강) · 1 세븐(파랑) · 2 리플레이 · 3 체리(2개) · 4 10개 · 5 15개 */
export const enum SlotSymbol { SEVEN_A = 0, SEVEN_B = 1, REPLAY = 2, CHERRY = 3, TEN = 4, FIFTEEN = 5, NONE = 6 }

/** 릴 셋 × 21칸 (`Unk_ov101_021D9688`) — 왼쪽 · 가운데 · 오른쪽 */
export const REELS: readonly (readonly SlotSymbol[])[] = [
  [5, 3, 1, 0, 2, 4, 5, 3, 1, 2, 4, 5, 3, 1, 2, 4, 5, 2, 0, 2, 4],
  [3, 0, 1, 5, 4, 2, 3, 0, 5, 4, 2, 3, 0, 5, 4, 2, 3, 1, 5, 4, 2],
  [4, 2, 1, 0, 2, 5, 4, 2, 1, 3, 5, 4, 2, 1, 3, 5, 4, 2, 0, 3, 5],
]
export const REEL_LENGTH = 21
/** 칸 하나의 높이(픽셀) */
export const SYMBOL_PX = 32

/** 줄 하나마다 받는 코인 (`Unk_ov101_021D9550`) */
export const PAYOUT: readonly number[] = [100, 100, 0, 2, 10, 15]
/** 삐삐 보너스에서 받는 코인 (`Unk_ov101_021D94F0`) — 리플레이가 15다 */
export const BONUS_PAYOUT: readonly number[] = [100, 100, 15, 2, 10, 15]

/** 무엇이든 맞을 확률(%) (`Unk_ov101_021D9520`) */
export const HIT_CHANCE = [25, 25, 30, 30, 35, 35] as const

/**
 * 맞았을 때 무엇이 맞나 — 누적으로 뺀다 (`Unk_ov101_021D95C8`). 차례가 원작 그대로다:
 * 체리+보너스 · 체리 · 15+보너스 · 15 · 10+보너스 · 10 · 리플레이+보너스 · (나머지) 리플레이
 */
export const HIT_TABLE: readonly (readonly number[])[] = [
  [1, 4, 2, 13, 1, 39, 1],
  [1, 4, 2, 13, 1, 39, 1],
  [2, 3, 4, 11, 2, 38, 2],
  [3, 2, 4, 11, 2, 38, 2],
  [4, 1, 6, 9, 3, 37, 3],
  [4, 1, 6, 9, 3, 37, 3],
]
/** 위 표의 자리 → 표식 비트 (`ov101_021D40A8`). 마지막 「나머지」는 비트 0 */
export const HIT_BITS = [3, 2, 7, 6, 5, 4, 1] as const

/** 맞은 판에서 「예고」를 띄울 확률(%) (`Unk_ov101_021D94D8`) */
export const NOTICE_CHANCE = [80, 80, 80, 80, 80, 70] as const

/**
 * 보너스 종류와 연출 갈래 (`Unk_ov101_021D9934`) — [무게, 종류, 갈래]. 종류 0~2는 빨강 세븐, 3~5는 파랑 세븐이다
 */
export const BONUS_TABLE: readonly (readonly (readonly [number, number, number])[])[] = [
  [[5, 3, 0], [10, 1, 1], [10, 5, 2], [10, 2, 2], [15, 4, 1], [50, 0, 0]],
  [[5, 3, 0], [10, 1, 1], [10, 5, 2], [10, 2, 2], [15, 4, 1], [50, 0, 0]],
  [[5, 3, 0], [15, 1, 1], [10, 5, 2], [15, 2, 2], [15, 4, 1], [40, 0, 0]],
  [[5, 3, 0], [15, 1, 1], [15, 5, 2], [15, 2, 2], [10, 4, 1], [40, 0, 0]],
  [[5, 3, 0], [20, 1, 1], [15, 5, 2], [20, 2, 2], [10, 4, 1], [30, 0, 0]],
  [[5, 3, 0], [20, 1, 1], [15, 5, 2], [20, 2, 2], [10, 4, 1], [30, 0, 0]],
]
/** 종류마다 삐삐 보너스를 이어 갈 확률(%) (`Unk_ov101_021D9568`) */
export const CONTINUE_CHANCE = [50, 70, 90, 50, 70, 90] as const

/**
 * 보너스 들어가기 연출 — 갈래마다 [무게, 연출] 셋 (`Unk_ov101_021D9784`). 설정 여섯이 다 같다
 */
export const ENTRY_SHOW: readonly (readonly (readonly [number, number])[])[] = [
  [[5, 2], [20, 0], [75, 1]],
  [[20, 2], [60, 0], [20, 1]],
  [[75, 2], [20, 0], [5, 1]],
]

/** 「세븐을 맞춰라」 판에서 작은 것이 나올 확률(%) (`Unk_ov101_021D9538`) */
export const PRE_BONUS_SMALL_CHANCE = [25, 25, 30, 30, 35, 35] as const
/**
 * 그 작은 것의 무게 — 체리 · 15 · 10 (`Unk_ov101_021D9628`, 여섯 설정이 같다).
 *
 * ⚠️ **원작은 둘째 칸을 두 번 읽는다** (`ov101_021D4394`의 `v1[1]` 두 번) — 셋째 칸(30)과 넷째(50)는 안 쓰인다.
 * 그대로 옮긴다
 */
export const PRE_BONUS_SMALL = [5, 15, 30, 50] as const

/** 삐삐 보너스 한 판 안의 「빨간 달」(%) (`Unk_ov101_021D9508`) */
export const RED_MOON_CHANCE = [3, 3, 5, 5, 7, 7] as const
/** 「이어 가기 확정」(%) (`Unk_ov101_021D9580`) */
export const SURE_CONTINUE_CHANCE = [1, 1, 3, 3, 5, 5] as const
/** 판이 끝날 때 이어 갈 확률을 깎는다 — [10 깎을 확률, 5 깎을 확률] (`Unk_ov101_021D9598`) */
export const CONTINUE_DECAY: readonly (readonly [number, number])[] = [
  [25, 20], [20, 15], [15, 15], [15, 15], [10, 15], [5, 10],
]
/**
 * 이어 갈 때의 연출 — [문턱, 연출 1, 연출 0] (`Unk_ov101_021D9AE4`, 여섯 설정이 같다). 이어 갈 확률이 문턱 이상인
 * 첫 줄을 쓰고, 둘 다 안 걸리면 연출 2다
 */
export const CONTINUE_SHOW: readonly (readonly [number, number, number])[] = [
  [75, 10, 10], [65, 10, 30], [55, 10, 40], [45, 20, 50], [35, 30, 50],
  [25, 50, 40], [15, 60, 30], [5, 80, 10], [0, 90, 5],
]

/** 삐삐가 가리키는 누름 차례 여섯 — 0 왼쪽 · 1 가운데 · 2 오른쪽 (`Unk_ov101_021D87A8`) */
export const BONUS_ORDERS: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
]

/** 기계 열두 대의 기본 설정 (`sub_0203E484`) */
export const MACHINE_SETTINGS = [0, 5, 1, 1, 4, 4, 2, 2, 2, 3, 3, 3] as const

/** 코인 상한 (`MAX_COINS`) */
export const MAX_COINS = 50000
/** 연속 보너스 판 상한 */
export const MAX_STREAK = 999
