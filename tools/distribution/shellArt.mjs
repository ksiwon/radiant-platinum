// 앱 셸이 내보내는 그림 (COPYRIGHT.md §11 · DEPLOY.md §7)
//
// ⚠️ **바이트 검사로는 이걸 절대 못 잡는다.** 셸의 그림 셋은 전부 우리가 만든
// PNG다 — 롬에서 나온 것이 한 조각도 없고, 그래서 출처 검사도 매직바이트 검사도
// 히스토리 감사도 전부 통과한다. 그런데 화면을 실제로 열어 보면(`tools/shot/title.mjs`)
// 타이틀 배경에 **금속 질감의 `POKEMON` 워드마크**가 그려져 있고, 아이콘과
// 배경의 주인공은 **기라티나(오리진 폼)** 다.
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
    path: 'assets/radiant-platinum-intro.png',
    what: '타이틀 배경',
    drawnBy: '이 프로젝트 (원작 에셋 아님)',
    wordmark: true,
    depicts: '기라티나(오리진 폼)로 보이는 형상',
    note:
      '⚠️ 금속 질감의 `POKEMON RADIANT PLATINUM` 로고가 그림 안에 그려져 있다. '
      + 'DOM에서 워드마크를 빼도 이 그림이 그대로 같은 자리에 같은 글자를 낸다 — '
      + '공식 로고가 놓이는 자리와 같은 배치이고, 그건 trade dress를 흉내 낸 것이다. '
      + '2.4MB로 배포물에서 가장 큰 파일이기도 하다.',
  },
  {
    path: 'assets/radiant-platinum-icon.png',
    what: 'PWA·홈 화면 아이콘',
    drawnBy: '이 프로젝트 (원작 에셋 아님)',
    wordmark: false,
    depicts: '기라티나(오리진 폼)의 머리로 보이는 형상',
    note: '홈 화면과 설치 배너에 그대로 뜬다. 1.2MB.',
  },
  {
    path: 'assets/radiant-platinum-favicon.png',
    what: '탭 아이콘',
    drawnBy: '이 프로젝트 (원작 에셋 아님)',
    wordmark: false,
    depicts: '위 아이콘의 축소판',
    note: '64×64.',
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
