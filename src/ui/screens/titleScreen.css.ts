// 타이틀 화면.
//
// 여기가 게임의 첫인상이라 **게임 화면처럼 보여야 한다.** 그림이 화면의 주인공이고, 아래에 창 한 장이 놓인다 — 상자 다섯을
// 가로로 늘어놓지 않는다. 위에는 고지 창, 아래에는 고를 것의 창이 그림을 위아래로 감싼다(레터박스).
//
//   고지 창   x 40, y 12, 폭 880
//   고를 것 창  줄 1(고를 것 · 금 띠 하나) + `RULE` + 줄 2(이어하기의 사정 · 조작 안내)
//
// ⚠️ **그림 위에 맨 글자를 두지 않는다.** 그림 위의 글은 대비를 잴 수 없다(`tools/shot/title.mjs`의 `groundOf`는 첫 불투명
// 조상 배경을 쓴다). 글은 전부 창 위에 있다.
//
// ⚠️ **제목은 그림이 들고 있다.** `crest`는 화면에서만 걷어내서 문서와 스크린 리더에는 남는다.
import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT, TIME } from '../theme/scale'
import { RULE, WINDOW, WINDOW_SMALL } from '../theme/window.css'

/** 고를 것 창의 폭 — 고지 창과 같다 */
const DOCK_W = 880
/** 줄 1 · 줄 2의 높이 */
const BAR_ROW = 56
const STATUS_ROW = 32

export const wrap = style({
  position: 'fixed',
  inset: 0,
  color: vars.ink.onDark,
  fontFamily: vars.font.ui,
  zIndex: 10,
  overflow: 'hidden',
  userSelect: 'none',
  background: vars.scrim.deep,
})

/**
 * 하늘 — 타이틀 그림.
 *
 * 3D 무대를 띄우지 않는다 — 타이틀은 three.js 없이 떠야 한다(PLAN §10.4).
 *
 * ⚠️ **그림 아래에 밑칠을 남겨 둔다.** 2.3MB짜리 PNG라 첫 프레임에는 아직 안 와 있고, 오프라인에서는 아예 안 온다(서비스
 * 워커가 이 장은 미리 안 받는다 — `public/sw.js`). 밑칠이 없으면 그 사이가 검은 화면이다.
 *
 * 무엇이 그려져 있는지는 `tools/distribution/shellArt.mjs`에 적혀 있고, 그것이 `brand-art` release blocker다
 * (COPYRIGHT.md §11)
 */
export const sky = style({
  position: 'absolute',
  inset: 0,
  zIndex: -2,
  backgroundColor: vars.scrim.deep,
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'cover',
  // ⚠️ **그림 위에 빛을 덧그리지 않는다.** 그림이 이미 그 빛을 그려 놓았다 (DESIGN.md §0)
  backgroundImage: "url('/assets/radiant-platinum-intro.webp')",
})

/** 아래쪽 땅 — 고를 것 창 뒤가 그림에서 가라앉는다 */
export const ground = style({
  position: 'absolute',
  inset: 0,
  zIndex: -1,
  background: `linear-gradient(180deg, transparent 70%, ${vars.scrim.deep} 100%)`,
  pointerEvents: 'none',
})

export const head = style({
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  pointerEvents: 'none',
})

/**
 * 제목 덩어리 — 이름과 한 줄 설명.
 *
 * ⚠️ **화면에서만 걷어낸다.** 제목은 배경 그림 안에 이미 그려져 있어서 글자로 또 얹으면 두 번 겹친다. 그렇다고
 * `display: none`으로 두면 스크린 리더에도 안 잡혀 이 화면에는 제목이 아예 없는 것이 된다.
 *
 * 비공식 고지는 여기 들어 있지 않다. 그건 `disclaimer`가 **눈에 보이게** 들고 있다 (COPYRIGHT.md §11)
 */
export const crest = style({
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
})

/**
 * 비공식·비제휴 고지 (COPYRIGHT.md §11) — 그림 위쪽의 창 한 장.
 *
 * ⚠️ **숨기지 않는다.** 문서에만 있고 화면에 없으면 그건 표시한 것이 아니다. 그림이 비어 있는 맨 위에 두고 창으로 깐다 —
 * 그림 위에 맨 글자로 두면 못 읽는다. 폭은 고를 것 창과 같다.
 */
export const disclaimer = style({
  ...WINDOW_SMALL,
  position: 'absolute',
  left: '50%',
  top: GAP.base,
  transform: 'translateX(-50%)',
  width: `min(${String(DOCK_W)}px, calc(100vw - ${String(GAP.loose * 2)}px))`,
  margin: 0,
  padding: `${String(GAP.small - 1)}px ${String(GAP.wide)}px`,
  boxSizing: 'border-box',
  fontFamily: vars.font.ui,
  fontSize: TEXT.tiny,
  lineHeight: 1.55,
  textAlign: 'center',
  pointerEvents: 'auto',
})

/** 고를 것 창 — 줄 1과 줄 2를 품는다 */
export const dock = style({
  ...WINDOW,
  position: 'absolute',
  left: '50%',
  bottom: GAP.wide,
  transform: 'translateX(-50%)',
  width: `min(${String(DOCK_W)}px, calc(100vw - ${String(GAP.loose * 2)}px))`,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: vars.font.ui,
  pointerEvents: 'auto',
})

/** 줄 1 — 고를 것과 오른쪽 끝의 판 표시 */
export const row1 = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.base,
  minHeight: BAR_ROW,
  boxSizing: 'border-box',
  padding: `${String(GAP.small - 2)}px ${String(GAP.base)}px`,
})

/**
 * 고를 것 묶음 (`role="toolbar"`). 금 띠 하나(`pickBand.x`)가 이 안을 미끄러진다.
 *
 * ⚠️ **한 줄에 안 들면 감긴다.** 조건부 칸 둘(어긋난 에셋 다시 만들기 · 백업에서 되찾기)이 더해지면 줄 1이 폭을 넘을 수
 * 있다 — 그때는 창이 위로 한 줄 자란다
 */
export const bar = style({
  position: 'relative',
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  rowGap: GAP.tight,
})

/** 고를 것 하나 — 맨 글자 단추. 고른 것은 금 띠가 가린다 */
export const item = style({
  position: 'relative',
  zIndex: 1,
  appearance: 'none',
  boxSizing: 'border-box',
  height: 44,
  padding: `0 ${String(GAP.base + 2)}px`,
  border: 'none',
  background: 'none',
  borderRadius: RADIUS.cell,
  color: vars.ink.normal,
  fontFamily: vars.font.ui,
  fontSize: TEXT.small,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  selectors: {
    // 눌러도 할 일이 없는 것. **왜 못 누르는지는 줄 2가 말한다** — 흐리기만 하면 눌러 보고 나서야 없다는 걸 알게 된다
    '&:disabled': { opacity: 0.42, cursor: 'default' },
    // ⚠️ **브라우저 포커스 링을 따로 안 돌린다.** Tab으로 옮긴 포커스는 그 칸으로 커서를 데려온다(`onFocus`) — 금 띠가
    // 곧 포커스 표시다. 링을 남기면 게임 커서와 브라우저 커서 둘이 한 화면에 선다
    '&:focus-visible': { outline: 'none' },
  },
})

/** 으뜸 둘 — 모험을 시작하거나 이어하는 자리 */
export const itemMain = style({
  fontSize: TEXT.list,
  fontWeight: 700,
  color: vars.ink.strong,
  padding: `0 ${String(GAP.loose - 4)}px`,
})

export const itemOn = style({ color: vars.pick.text })

/** 묶음 사이 세로 구분선 */
export const sep = style({
  flex: '0 0 auto',
  width: EDGE.rule,
  height: 24,
  margin: `0 ${String(GAP.small)}px`,
  background: vars.window.rule,
})

/** 「세이브 파일」 이름표 — 읽어 주지 않는다 (`aria-hidden`). 칸의 이름은 `aria-label`이 든다 */
export const groupLabel = style({
  flex: '0 0 auto',
  margin: `0 ${String(GAP.tight)}px 0 ${String(GAP.tight)}px`,
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})

/**
 * 안 본 것이 있다는 점 — 「더보기」 칸에만 붙는다. 글자 뒤에 흐름대로 놓는다 — 칸마다 글자 길이가 달라 절대 자리로 띄우면
 * 어느 칸에서는 글자 위에 앉는다
 */
export const dot = style({
  display: 'inline-block',
  width: 6,
  height: 6,
  marginLeft: 6,
  verticalAlign: 'middle',
  borderRadius: RADIUS.round,
  background: vars.pick.edge,
})

/**
 * 판 표시 — 줄 1 오른쪽 끝의 `v1.0.0` 한 줄. 누르면 패치노트가 열린다.
 *
 * 창 안이라 흐린 글도 읽힌다. 키로 가는 길은 따로 안 낸다 — 커서가 이 칸까지 돌면 「무엇부터 하나」가 흐려진다
 */
export const version = style({
  flex: '0 0 auto',
  margin: 0,
  padding: `${String(GAP.tight)}px ${String(GAP.small)}px`,
  appearance: 'none',
  background: 'none',
  border: 0,
  fontFamily: vars.font.ui,
  fontSize: TEXT.tiny,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.dim,
  cursor: 'pointer',
  selectors: {
    '&:hover': { color: vars.ink.strong },
    '&:focus-visible': { outline: 'none' },
  },
})

/** 줄 2 — 이어하기의 사정 (요약 · 알림 · 키 안내) */
export const row2 = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.wide,
  minHeight: STATUS_ROW,
  boxSizing: 'border-box',
  padding: `0 ${String(GAP.base)}px 0 ${String(GAP.wide)}px`,
  borderTop: RULE,
  fontSize: TEXT.small,
})

/** 리포트 요약. 원작 메인 메뉴도 이 넷을 보여준다. 이름표와 값이 쌍으로 한 줄에 선다 */
export const summary = style({
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: GAP.loose,
  margin: 0,
  fontSize: TEXT.small,
})

export const pair = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: GAP.small - 2,
})

globalStyle(`${summary} dt`, { color: vars.ink.dim, fontSize: TEXT.tiny })
globalStyle(`${summary} dd`, {
  display: 'inline-flex',
  alignItems: 'center',
  gap: GAP.small - 2,
  margin: 0,
  fontWeight: 700,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
})

/** 성별 색 — 원작 요약이 이름 · 시간 · 배지를 성별로 칠한다. 창 위라 대비가 선다 */
export const male = style({ color: vars.state.male })
export const female = style({ color: vars.state.female })

/**
 * 「이어할 리포트가 없습니다」 · 못 읽는 리포트 한 줄 — 왜 「이어하기」를 못 누르는지.
 *
 * ⚠️ **흐리게만 두지 않는다.** 눌러 보고 나서야 없다는 걸 알게 되는 것을 막는 줄이라 본문 색(`ink.normal`)이다
 */
export const status = style({
  flex: '1 1 auto',
  minWidth: 0,
  margin: 0,
  color: vars.ink.normal,
  lineHeight: 1.4,
})

/** 조작 안내 — 키캡. 줄 2 오른쪽 끝 */
export const keys = style({
  flex: '0 0 auto',
  marginLeft: 'auto',
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
  whiteSpace: 'nowrap',
})

// ─────────────────────────────────────────────────────────────────
// 뜨는 창 — 확인 · 알림. 사람이 부른 것에 한한다 (기본 상태는 아무것도 안 뜬다)
// ─────────────────────────────────────────────────────────────────

/** 뜨는 창 안의 한 덩이 — 글과 (있으면) 고를 것 */
export const block = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  padding: `${String(GAP.tight)}px ${String(GAP.small)}px`,
  selectors: { '& + &': { borderTop: RULE, marginTop: GAP.small, paddingTop: GAP.base } },
})

export const blockText = style({
  margin: 0,
  fontSize: TEXT.small,
  lineHeight: 1.6,
  color: vars.ink.normal,
  whiteSpace: 'pre-line',
})

/** 알림 안에서 조심할 문장. 창 테마의 「못 하는 것」 색이다 (`state.bad`) */
export const warn = style({
  color: vars.state.bad,
  fontWeight: 700,
})

/** 확인 창의 고를 것 — 고른 줄에 금 띠 하나(`pickBand.y`)가 미끄러진다 */
export const choices = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
})

export const choice = style({
  position: 'relative',
  zIndex: 1,
  appearance: 'none',
  boxSizing: 'border-box',
  height: 32,
  padding: `0 ${String(GAP.base)}px 0 22px`,
  border: 'none',
  background: 'none',
  borderRadius: RADIUS.cell,
  color: vars.ink.normal,
  fontFamily: vars.font.ui,
  fontSize: TEXT.list,
  textAlign: 'left',
  cursor: 'pointer',
  selectors: {
    '&:focus-visible': { outline: 'none' },
  },
})

export const choiceOn = style({ color: vars.pick.text, fontWeight: 700 })

/** 확인 창이 뜰 때 뒤의 창이 한 단 어두워진다 */
export const dimmed = style({
  filter: 'brightness(0.82)',
  transition: `filter ${TIME.open} ease-out`,
})

/**
 * 뜨는 창 한 장 — 안에 덩이가 쌓인다. 폭은 `PopAbove`가 준다.
 *
 * ⚠️ **누름을 되살린다.** 이 창은 `head` 안에 그려지는데 `head`가 `pointerEvents: 'none'`이라 그대로 두면 물려받는다 —
 * 그러면 누름이 창을 지나 뒤의 `sky`로 빠져서 「이 리포트로 이어하기」 · 「처음부터 시작하기」를 마우스로 못 눌렀다(키보드만 됐다).
 * e2e ㉕가 그 자리에서 섰다 (`<div class="titleScreen_sky"> intercepts pointer events`)
 */
export const callout = style({
  display: 'flex', flexDirection: 'column', maxHeight: '70vh', overflowY: 'auto', pointerEvents: 'auto',
})

/** 「자동 저장에서 이어하기」 — 줄 2의 한 줄 단추. 글처럼 보이되 눌린다 */
export const autoLink = style({
  flex: '0 0 auto',
  whiteSpace: 'nowrap',
  margin: 0,
  padding: 0,
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  textAlign: 'left',
  color: vars.ink.normal,
  lineHeight: 1.4,
  cursor: 'pointer',
  selectors: { '&:hover': { color: vars.pick.text } },
})
