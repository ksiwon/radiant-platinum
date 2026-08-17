// 앱 셸이 내보내는 그림 (COPYRIGHT.md §11 · DEPLOY.md §7)
//
// ⚠️ **바이트 검사로는 이걸 절대 못 잡는다.** 셸의 그림은 전부 우리가 만든
// 것이다 — 롬에서 나온 것이 한 조각도 없고, 그래서 출처 검사도 매직바이트 검사도
// 히스토리 감사도 전부 통과한다. 그런데 타이틀 배경에는 **금속 질감의 워드마크**가
// 그려져 있고 아이콘의 주인공은 **기라티나(오리진 폼)로 보이는 형상**이다.
// 화면을 실제로 열어 보고서야(`tools/shot/title.mjs`) 보였다.
//
// 원본 바이트를 안 싣는 것과, 공식처럼 보이지 않는 것은 **다른 문제다.**
// 앞은 BYOR가 줄여 주지만 뒤는 안 줄여 준다 — 상표와 2차적 저작물의 자리다.
//
// 그래서 그림마다 **무엇을 그렸는지 적는다.** 목록에 없으면 빌드가 선다.
//
// ⚠️ **여기는 사실만 적는다.** 무엇이 그려져 있는지는 우리가 정할 수 있는 것이
// 아니라 화면에 있는 그대로다 — 그림을 안 바꾸고 통과시키려면 대장이 거짓말을
// 해야 하는데, 그 길은 없다. 감수할지 말지는 **판단**이라 아래 `ACCEPTED_BRAND_RISK`에
// 따로 적는다. 층을 가르는 이유가 이것이다: 판단이 바뀌어도 사실은 안 바뀐다.

/**
 * 셸 그림 대장.
 *
 *   `drawnBy`   누가 그렸는가. 원작 에셋이면 애초에 셸에 있으면 안 된다
 *   `wordmark`  공식 로고를 닮은 글자가 **그림 안에** 있는가
 *   `depicts`   원작 캐릭터를 그렸는가. 없으면 null
 */
export const SHELL_ART = [
  {
    path: 'assets/radiant-platinum-intro.webp',
    what: '타이틀 배경 · 설치 화면 배경',
    drawnBy: '이 프로젝트 — 만든 사람이 그린 그림. 롬에서 나온 바이트가 없다',
    wordmark: true,
    depicts: '기라티나(오리진 폼)로 보이는 형상',
    note:
      '1672×941 · 403KB. 금속 질감의 `POKEMON RADIANT PLATINUM` 로고가 화면 '
      + '가운데에 있고 그 뒤에 뿔 달린 형상이 선다. 마스터는 `art/`의 PNG(2.3MB)이고 '
      + '`pnpm assets:art`가 q=95로 굽는다 — 평균 오차 0.97/255 · p99 5/255. '
      + '첫 화면 예산(gzip 150KB)에는 안 들어간다 — js·css만 세고 이 그림은 CSS가 '
      + '나중에 받는다.',
  },
  {
    path: 'assets/radiant-platinum-icon.png',
    what: '앱 아이콘 · apple-touch-icon · 파비콘의 원본',
    drawnBy: '이 프로젝트 — 만든 사람이 그린 그림',
    wordmark: false,
    depicts: '기라티나(오리진 폼)의 머리로 보이는 형상',
    note:
      '512×512 · 254KB. 배경 그림의 그 형상을 머리만 크게 그린 것. 마스터는 '
      + '`art/`의 1254px PNG(1.2MB)이고 여기 있는 것은 그것을 줄인 무손실 PNG다 — '
      + '설치 아이콘이 실제로 읽는 제일 큰 자리가 512다. **손실 압축을 안 쓴다**: '
      + '알파가 있어서 WebP 손실로 구우면 투명한 자리가 최대 238/255 어긋난다(실측).',
  },
  {
    path: 'assets/radiant-platinum-favicon.svg',
    what: '탭 아이콘 (기본)',
    drawnBy: '이 프로젝트 — `tools/assets/shellArt.py`가 아이콘 마스터에서 굽는다',
    wordmark: false,
    depicts: '기라티나(오리진 폼)의 머리로 보이는 형상',
    note:
      '같은 그림이다. **선으로 따라 그린 벡터가 아니라** 아이콘을 128px로 줄인 '
      + '무손실 픽셀을 SVG 안에 담은 것이다 — 금빛 기울기를 벡터로 추적하면 색 띠가 '
      + '생기고, 색을 256단계로 눌러도 픽셀당 최대 60/255 어긋난다. 31KB.',
  },
  {
    path: 'assets/radiant-platinum-favicon.png',
    what: '탭 아이콘 — SVG 파비콘을 안 받는 브라우저용',
    drawnBy: '이 프로젝트 — 위 아이콘의 64px 축소판',
    wordmark: false,
    depicts: '기라티나(오리진 폼)의 머리로 보이는 형상',
    note: '64×64 · 7.4KB.',
  },
]

/**
 * 지웠던 그림과 그 이유.
 *
 * ⚠️ **"바꿨다"로 끝내지 않고 무엇을 왜 지웠는지 남긴다.** 여기 있는 둘은 위
 * 그림들을 빼고 있던 동안 대신 쓰던 것이다 — 코드로 그린 고리 여섯이라 무엇을
 * 그렸는지 다툴 여지가 없었다. 만든 사람이 원래 그림으로 되돌리면서 갈 곳이
 * 없어졌고, 쓰이지 않는 그림을 셸에 남겨 두지 않는다
 */
export const REMOVED_ART = [
  {
    path: 'assets/mark.svg',
    why: '원래 그림이 돌아와서 아무 데서도 안 쓴다 · 1.3KB',
    now: 'assets/radiant-platinum-favicon.svg',
  },
  {
    path: 'assets/mark-180.png',
    why: '같음 · 15KB',
    now: 'assets/radiant-platinum-icon.png',
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
 * 만든 사람이 **알고 감수하기로 한** 위험. 없으면 null이고, 그때 `brand-art`
 * blocker는 선다.
 *
 * ⚠️ **이것은 대장을 고치는 것이 아니다.** 위 `SHELL_ART`는 무엇이 그려져 있는지를
 * 그대로 적고, 그 사실은 이 결정과 **무관하게** 남는다. 여기 적는 것은 잰 사실을
 * 두고 공개를 막을 것인가 말 것인가 하는 **판단**이고, 판단은 사람의 몫이다.
 *
 * ⚠️ **"문제 없음"이라고 적지 않는다.** 관행이 넓다는 것이 위험이 없다는 뜻이
 * 아니다 — 리디자인한 표지를 쓴 팬게임 중에도 실제로 내려간 것이 있다
 * (Pokémon Uranium · Pokémon Prism · AM2R). 상표와 2차적 저작물의 자리는
 * 그대로고 BYOR가 줄여 주지 않는다 (COPYRIGHT.md §3 · §11). 그래서 적는 것은
 * "안전하다"가 아니라 **누가 · 언제 · 무엇을 알고 · 무엇을 근거로** 정했는가다.
 *
 * ⚠️ **조용히 사라지지 않는다.** 감수해도 `pnpm release:check`는 무엇을 감수했는지
 * 매번 찍는다 (`check.mjs`). 안 찍히면 잊히고, 잊힌 결정은 결정이 아니다
 */
export const ACCEPTED_BRAND_RISK = {
  by: '만든 사람',
  on: '2026-08-17',
  because: '원작을 리디자인한 타이틀 표지를 쓰는 팬게임이 널리 있다',
  knowing:
    '관행이 넓다는 것은 허가도 면책도 아니다. 상표·2차적 저작물 위험과 takedown '
    + '가능성은 그대로 남는다 (COPYRIGHT.md §3). 신고를 받으면 TAKEDOWN.md 순서로 간다',
}

/**
 * 공개 배포를 막는 그림 — **감수 결정과 무관하게** 사실 그대로.
 *
 * **"안 될 것 같다"가 아니라 대장에 적힌 사실로 판정한다.** 워드마크를 지우고
 * 캐릭터가 아닌 것으로 바꾸면 `depicts: null`·`wordmark: false`가 되고,
 * 그 순간 이 목록이 빈다
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
