// 패치노트 — 무엇이 언제 바뀌었나.
//
// ★ **이 파일이 정본이다.** 따로 변경 이력 문서를 두지 않는다 — 이 저장소는
//   `docs/*.md`에 버전별 이력을 안 쓴다(문서는 「지금 무엇이 참인가」만 담고,
//   이력은 git이 갖고 있다). 한때 `docs/CHANGELOG.md`를 만들었다가 바로 그
//   규칙에 걸려 지웠다.
//
//   그래서 새 판을 낼 때 할 일은 **하나**다: 화면에 보일 것이 있으면 `NOTES`
//   맨 앞에 한 판을 더한다. 없으면 아무것도 안 한다 — 안쪽 정리만 있는 판은
//   여기 넣지 않는다(빈 칸으로 보인다). 무엇이 바뀌었는지의 전부는 `git log`다.
//
// ⚠️ **여기는 홍보문이 아니라 알림이다.** 판마다 한두 줄이면 된다. 길게 적고
//   싶어지면 그것은 커밋 메시지가 할 일이다.
//
// ⚠️ **맨 앞이 최신이다.** `NOTES[0]`의 판을 「마지막으로 본 판」과 견주어 점을
// 띄우므로, 새 판을 뒤에 붙이면 아무에게도 점이 안 뜬다.
//
// ⚠️ **여기는 앱 껍데기의 말이라 롬 글을 안 쓴다.** 타이틀 차림표가 이미 같은
// 이유로 「이어하기」를 손으로 적고 있다 (`TitleScreen`) — 하나만 롬에서 오면
// 일본어 롬으로 설치한 사람의 화면에 그 칸만 일본어로 선다.

type PatchKind = 'add' | 'change' | 'fix'

/** 갈래 이름 — 딱지에 그대로 찍힌다 */
export const KIND_NAME: Record<PatchKind, string> = {
  add: '추가',
  change: '변경',
  fix: '수정',
}

interface PatchNote {
  /** 화면에 보이는 판 이름. `SEEN`에 적히는 값이기도 하다 */
  v: string
  /** ISO(YYYY-MM-DD) */
  date: string
  lead?: string
  items: { kind: PatchKind; text: string }[]
}

export const NOTES: PatchNote[] = [
  {
    v: 'v0.1',
    date: '2026-09-04',
    items: [
      { kind: 'add', text: '첫 데모를 열었습니다. 떡잎마을에서 명예의 전당까지 돕니다.' },
    ],
  },
]

/** 지금 판 */
export const VERSION = NOTES[0].v

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
