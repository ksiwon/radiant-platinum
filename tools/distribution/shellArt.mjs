// 앱 셸이 내보내는 그림 (COPYRIGHT.md §11 · DEPLOY.md §7)
//
// ⚠️ **바이트 검사로는 이걸 절대 못 잡는다.** 셸의 그림은 전부 우리가 만든
// 것이다 — 롬에서 나온 것이 한 조각도 없고, 그래서 출처 검사도 매직바이트 검사도
// 히스토리 감사도 전부 통과한다. 그런데 한때 타이틀 배경에 **금속 질감의 워드마크**가
// 그려져 있었고 아이콘의 주인공은 **기라티나(오리진 폼)** 였다. 화면을 실제로
// 열어 보고서야(`tools/shot/title.mjs`) 보였다 — 지금은 `REMOVED_ART`에 있다.
//
// 원본 바이트를 안 싣는 것과, 공식처럼 보이지 않는 것은 **다른 문제다.**
// 앞은 BYOR가 줄여 주지만 뒤는 안 줄여 준다 — 상표와 2차적 저작물의 자리다.
//
// 그래서 그림마다 **무엇을 그렸는지 적는다.** 목록에 없으면 빌드가 서고,
// 워드마크나 캐릭터가 적혀 있으면 공개 배포가 막힌다. 지우는 것은 우리가 할
// 판단이 아니다 — 만든 사람이 정할 일이고, 정할 때까지 공개가 막히면 된다.

/**
 * 셸 그림 대장.
 *
 *   `drawnBy`   누가 그렸는가. 원작 에셋이면 애초에 셸에 있으면 안 된다
 *   `wordmark`  공식 로고를 닮은 글자가 **그림 안에** 있는가
 *   `depicts`   원작 캐릭터를 그렸는가. 없으면 null
 */
export const SHELL_ART = [
  {
    path: 'assets/mark.svg',
    what: '탭 아이콘 · PWA 아이콘',
    drawnBy: '이 프로젝트 — `tools/assets/shellMark.cjs`가 코드로 그린다',
    wordmark: false,
    depicts: null,
    note:
      '퍼져 나가는 고리 여섯. 생물 실루엣도 몬스터볼 모양도 공식 로고 형태도 없다. '
      + '코드가 곧 원본이라 무엇을 그렸는지 다툴 여지가 없다. 1.3KB.',
  },
  {
    path: 'assets/mark-180.png',
    what: 'apple-touch-icon',
    drawnBy: '이 프로젝트 — `tools/assets/shellMark.cjs`가 코드로 그린다',
    wordmark: false,
    depicts: null,
    note:
      'SVG와 같은 그림. Safari가 PNG만 받는 자리라 한 장만 굽는다. 색을 32단계로 '
      + '눌러 담아 15KB다 — 안 누르면 같은 그림이 173KB였다.',
  },
]

/**
 * 지운 그림과 그 이유.
 *
 * ⚠️ **"바꿨다"로 끝내지 않고 무엇을 왜 지웠는지 남긴다.** 셋 다 우리가 만든
 * PNG였고 그래서 출처 검사·매직바이트 검사·히스토리 감사를 전부 통과했다.
 * 화면을 실제로 열어 보고서야(`tools/shot/title.mjs`) 보였다
 */
export const REMOVED_ART = [
  {
    path: 'assets/radiant-platinum-intro.png',
    why: '금속 질감의 워드마크 + 기라티나(오리진 폼)로 보이는 형상 · 2.4MB',
    now: '`titleScreen.css.ts`의 그라디언트 넷. 배포물에서 2.4MB가 통째로 빠졌다',
  },
  {
    path: 'assets/radiant-platinum-icon.png',
    why: '기라티나(오리진 폼)의 머리로 보이는 형상 · 1.2MB',
    now: 'assets/mark.svg + assets/mark-180.png',
  },
  {
    path: 'assets/radiant-platinum-favicon.png',
    why: '위 아이콘의 축소판',
    now: 'assets/mark.svg',
  },
]

/** 그림인데 대장에 없는 것 */
export function unlistedArt(shellFiles) {
  const listed = new Set(SHELL_ART.map((a) => a.path))
  return shellFiles.filter((f) => /\.(png|jpe?g|webp|svg|avif)$/i.test(f) && !listed.has(f))
}

/** 대장에는 있는데 셸 목록에 없는 것. 이름이 갈리면 검사가 무의미해진다 */
export function missingArt(shellFiles) {
  const have = new Set(shellFiles)
  return SHELL_ART.filter((a) => !have.has(a.path)).map((a) => a.path)
}

/**
 * 공개 배포를 막는 그림.
 *
 * **"안 될 것 같다"가 아니라 대장에 적힌 사실로 판정한다.** 워드마크를 지우고
 * 캐릭터가 아닌 것으로 바꾸면 `depicts: null`·`wordmark: false`가 되고,
 * 그 순간 이 blocker는 스스로 풀린다
 */
export function brandRisks() {
  return SHELL_ART
    .filter((a) => a.wordmark || a.depicts !== null)
    .map((a) => ({
      path: a.path,
      why: [a.wordmark ? '워드마크' : null, a.depicts ? `캐릭터: ${a.depicts}` : null]
        .filter(Boolean).join(' · '),
    }))
}
