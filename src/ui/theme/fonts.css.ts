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
  /** 픽셀 글꼴에는 한자가 없다. 뒤를 시스템 글꼴이 받는다 */
  pixel: `'${PIXEL}', '${UI}', ${FALLBACK}`,
  mono: "'Cascadia Mono', 'Consolas', 'Malgun Gothic', monospace",
} as const
