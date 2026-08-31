// 글꼴 (DESIGN.md §4).
//
// ⚠️ **CDN을 안 부른다.** 오프라인에서 도는 게임이라(PLAN §4.6) 첫 화면이 남의
// 서버를 기다리면 안 된다. 파일은 `public/fonts/`에 있고, 서비스 워커가 **처음
// 쓸 때** 셸 캐시에 넣는다 — 빌드된 js·css와 같은 길이다 (`public/sw.js`).
// 미리 받는 목록(`SHELL_FILES`)에는 안 넣는다. 거기는 앱이 도는 데 꼭 필요한
// 것만 적는 자리고, 글꼴이 안 와도 폴백 글꼴로 화면은 선다.
//
// ⚠️ **`font-display: swap`이다.** 안 주면 글꼴이 오는 동안 글자가 아예 안 보인다
// (블록 3초). 게임 첫 화면이 빈 채로 서는 것보다 시스템 글꼴로 잠깐 보이는 쪽이 낫다.
import { globalFontFace } from '@vanilla-extract/css'

/** 대사창·간판. 원작 대사창이 픽셀 글꼴이다 */
const PIXEL = 'Galmuri11'
/** 그 밖의 UI 전부 */
const UI = 'Pretendard'

globalFontFace(PIXEL, {
  src: "url('/fonts/Galmuri11.woff2') format('woff2')",
  fontWeight: '400',
  fontStyle: 'normal',
  fontDisplay: 'swap',
})

globalFontFace(UI, {
  src: "url('/fonts/Pretendard-Regular.subset.woff2') format('woff2')",
  fontWeight: '400',
  fontStyle: 'normal',
  fontDisplay: 'swap',
})

globalFontFace(UI, {
  src: "url('/fonts/Pretendard-Bold.subset.woff2') format('woff2')",
  fontWeight: '700',
  fontStyle: 'normal',
  fontDisplay: 'swap',
})

/**
 * 일본어 UI (`tools/fonts/jpSubset.py`).
 *
 * Pretendard 서브셋에는 가나가 한 자도 없다 — 일본어로 두면 UI 전체가 시스템
 * 글꼴로 새고, 한 화면에 글꼴 둘이 선다. 그래서 **가나 몫만** 따로 싣는다.
 *
 * ⚠️ **`unicodeRange`에 한자가 없다.** 한자를 넣으면 한국어 화면의 한자까지
 * 일본 자형으로 끌려간다 (아래 폴백 주석과 같은 문제다). 4세대 일본어판은
 * 한자를 안 써서 넣을 이유도 없다 — 게임 텍스트 496개 파일에 한자가 0자다.
 *
 * ⚠️ **`unicodeRange`가 곧 다운로드 조건이다.** 한국어·영어로 노는 사람은
 * 이 66KB를 아예 안 받는다 — 화면에 그 코드포인트가 나와야 그때 받는다.
 */
const JP_RANGE = [
  'U+2026', 'U+22EF', 'U+2640', 'U+2642', 'U+266B',
  'U+3000-303F', 'U+3040-309F', 'U+30A0-30FF',
  'U+329A-329B', 'U+FF01-FF5E', 'U+FF61-FF9F',
].join(', ')

globalFontFace(UI, {
  src: "url('/fonts/NotoSansJP-Regular.subset.woff2') format('woff2')",
  fontWeight: '400',
  fontStyle: 'normal',
  fontDisplay: 'swap',
  unicodeRange: JP_RANGE,
})

globalFontFace(UI, {
  src: "url('/fonts/NotoSansJP-Bold.subset.woff2') format('woff2')",
  fontWeight: '700',
  fontStyle: 'normal',
  fontDisplay: 'swap',
  unicodeRange: JP_RANGE,
})

/**
 * 폴백 목록.
 *
 * ⚠️ **한자 글꼴은 순서가 곧 나라다.** 브라우저는 글자마다 앞에서부터 그 글자를
 * 가진 글꼴을 찾으므로, 일본어 글꼴(Yu Gothic)을 한국어 글꼴(맑은 고딕)보다
 * 앞에 두면 **한자만** 일본 자형으로 간다. 한글은 맑은 고딕에만 있어서 그대로
 * 오고, 일본어 본문은 가나·한자가 다 Yu Gothic으로 온다. 반대로 두면 일본어
 * 한자가 한국 자형으로 나온다 — 같은 코드포인트라 눈으로만 갈린다
 */
const FALLBACK = "'Malgun Gothic', 'Yu Gothic UI', 'Meiryo', sans-serif"

export const STACK = {
  ui: `'${UI}', ${FALLBACK}`,
  /**
   * 대사창.
   *
   * Galmuri11은 한글 11,172자에 **가나 187자와 한자 6,477자까지** 들고 있다
   * (`fontTools`로 cmap을 세어 확인했다). 그래서 일본어 대사도 픽셀 글꼴
   * 그대로 나온다 — 일본어 픽셀 글꼴을 따로 실을 이유가 없었다.
   * 뒤의 `'${UI}'`가 받는 것은 ⋯·㊚·㊛ 셋뿐이다
   */
  pixel: `'${PIXEL}', '${UI}', ${FALLBACK}`,
  mono: "'Cascadia Mono', 'Consolas', 'Malgun Gothic', monospace",
} as const
