// 기술 되살리기 · 기술가르침의 물음 차례와 글 자리 (PARITY §5 `move_reminder`, 뱅크 645).
//
// 두 화면이 한 뱅크를 나눠 쓴다 — 0~10이 가르침(`Tutor_*`), 11~21이 되살리기(`Reminder_*`)이고 **같은 차례로
// 같은 일**을 한다. 그래서 줄 번호만 갈리고 흐름은 하나다. 줄 번호는 뱅크가 굽는 대로(`move_reminder`
// 34줄)이다 — 한 줄도 손으로 지어 쓰지 않는다.
//
//   pick      누구에게 어느 기술을?                    Z → 칸이 비면 ask · 넷이면 four · X·「그만둔다」 → giveUp
//   giveUp    …을 포기하겠습니까?  예/아니오              예 → 닫는다 · 아니오 → pick
//   ask       {기술} 배우게 하겠습니까? 예/아니오         예 → learned · 아니오 → pick
//   four      기술을 4개 알고 있으므로… 잊게 하겠습니까?  (쪽 셋) 예 → forget · 아니오 → wellThen
//   forget    어느 기술을 잊게? (잊을 넷 + 새 기술)       Z → confirm · X·새 기술 칸 → wellThen
//   confirm   {잊을 기술} 잊게 해도 괜찮겠습니까?        예 → forgot · 아니오 → forget
//   wellThen  그럼… {기술} 포기하겠습니까?               예 → 닫는다 · 아니오 → four
//   forgot    1, 2… 짠! 깨끗이 잊었다! 그리고…! → learnedAfter   (쪽을 Z로 넘기고 끝나면 닫는다)
//   learned   {기술} 떠올렸다!                          (쪽을 Z로 넘기고 끝나면 닫는다)
import { fillMenuText } from '../../data/uiText'

/** 이 화면이 쓰는 뱅크 줄 번호 (가르침과 되살리기가 같은 뜻의 줄을 하나씩 가진다) */
interface ReminderLines {
  /** 「{마리}에게 어느 기술을 …하게 하겠습니까?」 — 목록 위 물음 */
  pick: number
  /** 「{기술} …하게 하겠습니까?」 — 빈 칸이 있을 때 */
  ask: number
  /** 「{마리}에게 기술을 …하는 것을 포기하겠습니까?」 — 목록에서 X */
  giveUp: number
  /** 「{마리} 새로 {기술} …」 — 빈 칸에 넣은 뒤 */
  learned: number
  /** 「…더 이상 …할 수 없다! {기술} 대신 다른 기술을 잊게 하겠습니까?」 — 쪽 셋 */
  four: number
  /** 「1, 2… 짠! … 깨끗이 잊었다! 그리고…!」 — 잊은 기술이 칸 1 */
  forgot: number
  /** 「{마리} 새로 {기술} …」 — 잊은 자리에 넣은 뒤 */
  learnedAfter: number
  /** 「그럼… {기술} …하는 것을 포기하겠습니까?」 */
  wellThen: number
  /** 「{잊을 기술} 잊게 해도 괜찮겠습니까?」 — 잊을 기술이 칸 0 */
  confirm: number
}

const TUTOR: ReminderLines = {
  pick: 0, ask: 1, giveUp: 2, learned: 3, four: 4, forgot: 5, learnedAfter: 6, wellThen: 7, confirm: 10,
}
const REMINDER: ReminderLines = {
  pick: 11, ask: 12, giveUp: 13, learned: 14, four: 15, forgot: 16, learnedAfter: 17, wellThen: 18, confirm: 21,
}

/** 이름표 자리 — 분류 22 · 위력 23 · 명중 24 · PP 25 · 「그만둔다」 32 · 값 없음 33 */
export const REMINDER_LABEL = { category: 22, power: 23, accuracy: 24, pp: 25, cancel: 32, none: 33 } as const

export function reminderLines(tutor: boolean): ReminderLines {
  return tutor ? TUTOR : REMINDER
}

/**
 * 한 줄을 쪽으로 가른다. 롬 글의 `\r`가 「단추를 기다린다」 자리다. 칸(0 마리 · 1 기술)을 채우고, 끝의 `\r`가
 * 만드는 빈 쪽은 버린다. 뱅크가 아직 안 왔으면(`raw`가 undefined) 쪽이 없다 — 손 글로 떨어지지 않는다
 */
export function pagesOf(raw: string | undefined, values: readonly string[]): string[] {
  if (raw === undefined) return []
  return fillMenuText(raw, values)
    .split('\r')
    .map((page) => page.replace(/^\n+|\n+$/g, ''))
    .filter((page) => page !== '')
}

/** 칸이 `MOVES_MAX`개 다 찼나 */
export const MOVES_MAX = 4

interface KnownMove { move: number, pp: number, ppUps: number }

/**
 * 새 기술을 넣은 칸 목록. `slot`이 기존 칸이면 갈아 끼우고, 끝(`moves.length`)이면 덧붙인다.
 * 최대 PP는 PP 올리기 0 기준이다 — 되살리기는 기술을 새로 배우는 것이다
 */
export function placeMove(
  moves: readonly KnownMove[], slot: number, move: number, pp: number,
): KnownMove[] {
  const next = moves.map((m) => ({ ...m }))
  const fresh = { move, pp, ppUps: 0 }
  if (slot < next.length) next[slot] = fresh
  else next.push(fresh)
  return next
}

/**
 * 목록의 첫 보이는 줄. 커서가 창 안에 있으면 그대로 두고, 밖으로 나가면 **딱 끝에 닿게만** 민다 —
 * 키를 누르고 있어도 줄이 한 번씩만 움직인다 (`scrollIntoView`와 겹쳐 두 번 움직이지 않게)
 */
export function windowTop(top: number, cursor: number, visible: number, total: number): number {
  const last = Math.max(0, total - visible)
  if (cursor < top) return Math.min(cursor, last)
  if (cursor >= top + visible) return Math.min(cursor - visible + 1, last)
  return Math.min(top, last)
}

/**
 * 기술의 최대 PP. 기술표가 아직 안 왔거나 그 기술이 없으면 **null**이다.
 *
 * ⚠️ **0으로 접지 않는다.** 표가 오기 전에 결정하면 PP 0짜리 기술이 저장에 들어가 못 쓰는 기술이 된다 —
 * 부르는 쪽은 null이면 결정을 막는다
 */
export function maxPpIn(
  table: { byId: ReadonlyMap<number, { pp: number }> } | null, id: number,
): number | null {
  return table?.byId.get(id)?.pp ?? null
}
