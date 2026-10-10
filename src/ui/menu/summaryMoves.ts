// 요약 화면 기술 쪽의 줄 모델 (순수 함수).
//
// 원작은 기술 칸을 **넷 다 그린다.** 빈 칸은 이름 자리에 「—」, 숫자 자리에 「--」(뱅크 455의 153)이고 커서는 거기에
// 서지 않는다 (`TryChangeSelectedMove`). 「가르침」 모드는 다섯째 줄이 새 기술이고 가는 선 아래에 뗀다.
//
// ⚠️ 커서 번호(`cursor`)는 **하네스 계약**이다 — 기술 삭제사가 ↓를 n번 누르고 Space로 n번째 칸을 답한다
// (`badgesLeague.mjs:339`). 그래서 `rows = moves.length`(+새 기술)이고 빈 칸은 커서 번호가 없다.
import { accuracyText, powerText } from '../common/MoveFacts'

/** 화면에 서는 줄 하나. `cursor`는 이 줄이 가리키는 칸 번호이고 빈 칸이면 null이다 */
export interface MoveRowView {
  kind: 'move' | 'empty' | 'teach'
  cursor: number | null
}

/** 기술 칸 수 (`LEARNED_MOVES_MAX`) */
export const MOVE_SLOTS = 4

/**
 * 줄 모델. 아는 기술 `known`개 → 앞에서부터 채우고 나머지는 빈 칸으로 넷을 맞춘다. `teach`이면 그 뒤에 새 기술
 * 줄이 붙는다 — 칸 번호는 `known`이다 (`MOVE_TO_LEARN_SLOT`이 네 칸 다음이다)
 */
export function moveRows(known: number, teach: boolean): MoveRowView[] {
  const rows: MoveRowView[] = []
  for (let i = 0; i < MOVE_SLOTS; i++) {
    rows.push(i < known ? { kind: 'move', cursor: i } : { kind: 'empty', cursor: null })
  }
  if (teach) rows.push({ kind: 'teach', cursor: known })
  return rows
}

/** 위력 글. 위력 ≤ 1이면 롬의 「---」(`none`)다 (원작 `PrintBattleMoveAttributes`) */
export function powerOf(power: number | undefined, none: string): string {
  return power === undefined ? none : powerText(power) ?? none
}

/** 명중 글. 0이면 「---」다 */
export function accuracyOf(accuracy: number | undefined, none: string): string {
  return accuracy === undefined ? none : accuracyText(accuracy) ?? none
}
