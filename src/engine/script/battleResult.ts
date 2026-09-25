// 배틀이 어떻게 끝났는가 — 원작의 결과 마스크와 그것을 읽는 세 물음
// (`constants/battle.h` · `field_battle_data_transfer.c` 512–542)
//
// ⚠️ **「이겼나」는 「지지 않았나」다.** 원작의 `CheckPlayerWonBattle`은 **진 판과
// 비긴 판만** 거짓이고 나머지는 전부 참이다 — 잡은 판도, 내가 달아난 판도,
// 상대가 달아난 판도 「이겼다」로 읽힌다. 전설 스크립트가 전부 이 모양이다:
//
//   StartLegendaryBattle …
//   CheckWonBattle VAR_RESULT
//   GoToIfEq VAR_RESULT, FALSE, …_BlackOut      ← 여기로 가는 것은 전멸뿐이다
//   CheckDidNotCapture VAR_RESULT               ← 잡았나 못 잡았나는 여기서 가른다
//
// 「이긴 판(1)만 참」으로 읽으면 귀혼동굴에서 기라티나를 **잡아도 전멸로** 빠진다 —
// 잡은 플래그(289)가 안 서고 기라티나가 되살아난다 (REPAIR §89).
//
// 값은 비트가 겹친다. 도망 = 포획|승, 상대 도망 = 포획|패, 비김 = 승|패라서
// 비트로 보면 안 되고 **수 전체**를 견준다 — 원작도 `switch`로 수를 본다.

/** `BATTLE_RESULT_WIN` */
export const BATTLE_RESULT_WIN = 1
/** `BATTLE_RESULT_LOSE` */
export const BATTLE_RESULT_LOSE = 2
/** `BATTLE_RESULT_CAPTURED_MON` */
export const BATTLE_RESULT_CAPTURED = 4
/** `BATTLE_RESULT_DRAW` = 승|패 */
export const BATTLE_RESULT_DRAW = BATTLE_RESULT_WIN | BATTLE_RESULT_LOSE
/** `BATTLE_RESULT_PLAYER_FLED` = 포획|승 */
export const BATTLE_RESULT_PLAYER_FLED = BATTLE_RESULT_CAPTURED | BATTLE_RESULT_WIN
/** `BATTLE_RESULT_ENEMY_FLED` = 포획|패 */
export const BATTLE_RESULT_ENEMY_FLED = BATTLE_RESULT_CAPTURED | BATTLE_RESULT_LOSE

/** 배틀 가게의 끝맺음 다섯 (`state/battleStore`의 `outcome`) */
export type BattleOutcome = 'win' | 'loss' | 'caught' | 'fled' | 'foeFled'

/** 끝맺음 → 원작 마스크. 우리 배틀에는 비기는 판이 없다 */
export const BATTLE_RESULT_OF: Readonly<Record<BattleOutcome, number>> = {
  win: BATTLE_RESULT_WIN,
  loss: BATTLE_RESULT_LOSE,
  caught: BATTLE_RESULT_CAPTURED,
  fled: BATTLE_RESULT_PLAYER_FLED,
  foeFled: BATTLE_RESULT_ENEMY_FLED,
}

/** `CheckPlayerWonBattle` — 진 판과 비긴 판만 거짓 */
export function playerWonBattle(mask: number): boolean {
  return mask !== BATTLE_RESULT_LOSE && mask !== BATTLE_RESULT_DRAW
}

/** `CheckPlayerLostBattle` — 이긴 판과 잡은 판만 거짓. 달아난 판은 **참**이다 */
export function playerLostBattle(mask: number): boolean {
  return mask !== BATTLE_RESULT_WIN && mask !== BATTLE_RESULT_CAPTURED
}

/** `CheckPlayerDidNotCaptureWildMon` — 잡은 판 하나만 거짓 */
export function playerDidNotCapture(mask: number): boolean {
  return mask !== BATTLE_RESULT_CAPTURED
}
