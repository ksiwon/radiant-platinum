// 기술 되살리기 (PARITY §5 `move_reminder`) — `src/move_reminder_data.c`
//
// 하트비늘을 주면 「예전에 배웠을 기술」을 다시 가르쳐 준다. 「예전에 배웠던」이
// 아니라 **지금 레벨까지의 레벨업 기술 중 지금 안 쓰는 것**이다 — 한 번도 안
// 배운 기술도 나온다.
//
// 기술가르침(`OpenMoveTutorMenu`)도 같은 화면을 쓴다. 그쪽은 목록이 한 줄뿐이다.

/** `MAX_NUMBER_REMINDER_MOVES` */
export const MAX_REMINDER_MOVES = 25

export interface LearnEntry { level: number; move: number }

/**
 * 되살릴 수 있는 기술 (`MoveReminderData_GetMoves`).
 *
 * 세 가지를 거른다:
 *
 *   ① 지금 레벨보다 높은 자리는 건너뛴다 — **멈추지 않고 건너뛴다.**
 *      레벨 표가 오름차순이 아닌 종이 있어서, 멈추면 뒤가 통째로 사라진다
 *   ② 지금 쓰고 있는 기술은 뺀다
 *   ③ 같은 기술이 두 레벨에 있으면 한 번만 (원작 표에 그런 자리가 있다)
 */
export function relearnableMoves(
  learnset: readonly LearnEntry[], level: number, known: readonly number[],
): number[] {
  const out: number[] = []
  for (const entry of learnset) {
    if (out.length >= MAX_REMINDER_MOVES) break
    if (entry.level > level) continue
    if (known.includes(entry.move)) continue
    if (out.includes(entry.move)) continue
    out.push(entry.move)
  }
  return out
}
