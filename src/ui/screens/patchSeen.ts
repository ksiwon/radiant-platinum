// 패치노트 점 — 타이틀이 첫 화면에서 읽는 것은 이것뿐이다.
//
// ⚠️ **노트 본문(`patchLog.ts`)을 여기서 부르지 않는다.** 부르면 판마다 쌓이는
// 글이 다시 첫 화면으로 들어온다. 그래서 지금 판은 손으로 한 번 더 적고,
// `NOTES[0]`과 같은지는 `patchLog.test`가 지킨다

/** 지금 판 — `NOTES[0]`의 판 이름과 날짜 */
export const LATEST = { v: 'v1.3.5', date: '2026-10-18' } as const

export const VERSION: string = LATEST.v

const SEEN = 'radiant.patch.seen'

/**
 * 안 본 판이 있나 — 차림표 칸에 점을 띄울지 정한다.
 *
 * ⚠️ 사생활 보호 모드에서는 `localStorage`를 **읽는 것만으로도** 던진다. 점 하나
 * 띄우자고 타이틀을 죽일 수는 없다
 */
export function unreadPatch(): boolean {
  try { return localStorage.getItem(SEEN) !== VERSION } catch { return false }
}

/** 봤다고 적어 둔다 */
export function markPatchSeen(): void {
  try { localStorage.setItem(SEEN, VERSION) } catch { /* 사생활 보호 모드 — 넘어간다 */ }
}
