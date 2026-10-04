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
//   싶어지면 그것은 커밋 메시지가 할 일이다. 정식판(v1.0.0)만 예외로 게임에
//   무엇이 들어 있는지를 갈래(`group`)로 묶어 적었다 — 처음 온 사람이 읽는 판이다.
//
// ⚠️ **판 이름은 `package.json`의 `version`을 앞지르지 않는다** (`patchLog.test`).
//   타이틀 구석의 판 표시는 `package.json`에서 오고(`APP_VERSION`), 여기 맨 앞
//   판과 어긋나면 표시를 눌러 연 창이 다른 판을 말한다. 안쪽 정리만 있는 판은
//   `package.json`만 올리고 여기는 그대로 둬도 된다.
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
  /**
   * `group`은 갈래 머리글이다. 같은 갈래는 붙여 적는다 — 머리글은 갈래가
   * 바뀌는 자리에만 선다 (`PatchNotes`)
   */
  items: { kind: PatchKind; text: string; group?: string }[]
}

export const NOTES: PatchNote[] = [
  {
    v: 'v1.0.0',
    date: '2026-10-05',
    lead: '정식판입니다. 떡잎마을에서 엔딩까지, 처음부터 끝까지 플레이할 수 있습니다.',
    items: [
      { group: '이야기', kind: 'add', text: '여덟 체육관, 갤럭시단, 사천왕과 챔피언을 지나 명예의 전당과 엔딩 크레딧까지 이어집니다.' },
      { group: '이야기', kind: 'add', text: '창기둥의 사건을 지나 깨어진 세계를 걷고, 그 끝에서 기라티나와 맞섭니다.' },
      { group: '세계', kind: 'add', text: '마을과 길, 건물 안, 호수·숲·동굴이 BDSP 3D로 섭니다. 1인칭 시점으로 둘러볼 수도 있습니다.' },
      { group: '세계', kind: 'add', text: '비와 눈이 내리고, 하늘과 안개가 날씨를 따라 바뀝니다.' },
      { group: '세계', kind: 'add', text: '포켓치를 BDSP처럼 화면 한쪽에 띄워 씁니다.' },
      { group: '배틀', kind: 'add', text: '더블 배틀과, 동료와 함께 싸우는 태그 배틀이 있습니다.' },
      { group: '배틀', kind: 'add', text: '기술을 쓸 때, 포켓몬을 내보낼 때, 몬스터볼을 던질 때 BDSP의 배틀 이펙트가 나옵니다.' },
      { group: '배틀', kind: 'add', text: '트레이너, 관장, 사천왕과 챔피언, 전설의 포켓몬을 만나면 원작의 컷인이 나옵니다.' },
      { group: '즐길 거리', kind: 'add', text: '배틀프런티어의 배틀팩토리를 할 수 있습니다. 배틀타워·스테이지·캐슬·룰렛은 차후 업데이트에서 엽니다.' },
      { group: '즐길 거리', kind: 'add', text: '게임코너의 슬롯머신과 리조트에리어의 별장이 있습니다.' },
      { group: '즐길 거리', kind: 'change', text: '콘테스트, 지하통로, 통신 기능은 이 게임에 들어 있지 않습니다.' },
      { group: '편의', kind: 'add', text: '리포트를 세이브 파일로 내보내고 불러와 다른 브라우저로 모험을 옮길 수 있습니다.' },
      { group: '편의', kind: 'add', text: '타이틀 화면 오른쪽 아래에 지금 버전이 적혀 있습니다. 누르면 이 패치노트가 열립니다.' },
    ],
  },
  {
    v: 'v0.2',
    date: '2026-10-01',
    items: [
      { kind: 'change', text: '건물 안, 바깥 길과 마을, 호수·숲·동굴이 BDSP 3D로 섭니다. 1인칭으로 보면 건물의 천장과 남쪽 벽까지 있습니다.' },
      { kind: 'add', text: '트레이너, 관장, 갤럭시단 보스, 사천왕과 챔피언, 전설의 포켓몬을 만나면 컷인이 나옵니다.' },
      { kind: 'add', text: '배틀팩토리를 할 수 있습니다. 배틀프런티어의 나머지 시설은 차후 업데이트에서 엽니다.' },
    ],
  },
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
