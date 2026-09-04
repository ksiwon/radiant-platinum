// 타이틀 화면.
//
// 여기가 게임의 첫인상이라 **게임 화면처럼 보여야 한다.** 가운데 정렬한 버튼
// 두 개가 아니라, 제목 그림이 화면을 차지하고 그 아래에 고를 것이 놓인 모양이다.
//
// ⚠️ **한동안 화면이 통째로 비어 있었다.** 배경 그림을 뺐는데(아래 `sky`)
// 제목까지 `display: none`인 채로 남아서, 그라디언트만 깔린 검은 화면에 버튼
// 다섯 개가 떠 있었다. 지금은 그림이 돌아왔고 제목도 그 안에 그려져 있다 —
// 그래서 `crest`는 다시 눈에 안 보이지만, 이번에는 **문서에는 남는다**
// (`display: none`이 아니라 화면에서만 걷어낸다).
import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { PICKED, WINDOW, WINDOW_SMALL } from '../theme/window.css'


export const wrap = style({
  position: 'fixed',
  inset: 0,
  display: 'grid',
  gridTemplateRows: '1fr auto 1fr',
  justifyItems: 'center',
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
 * ⚠️ **그림 아래에 그라디언트를 남겨 둔다.** 2.3MB짜리 PNG라 첫 프레임에는
 * 아직 안 와 있고, 오프라인에서는 아예 안 온다(서비스 워커가 이 장은 미리
 * 안 받는다 — `public/sw.js`). 밑칠이 없으면 그 사이가 검은 화면이다.
 *
 * 무엇이 그려져 있는지는 `tools/distribution/shellArt.mjs`에 적혀 있고,
 * 그것이 `brand-art` release blocker다 (COPYRIGHT.md §11)
 */
export const sky = style({
  position: 'absolute',
  inset: 0,
  zIndex: -2,
  backgroundColor: vars.scrim.deep,
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'cover',
  // ⚠️ **그림 위에 빛을 덧그리지 않는다.** 한때 여기에 방사형 그러데이션 둘과
  // 대각 광택 한 겹이 얹혀 있었다 — 「어두운 배경 뒤의 오로라」는 AI가 만든
  // 화면을 알아보는 표식으로 꼽히는 것이고(DESIGN.md §0), 무엇보다 그림이
  // 이미 그 빛을 그려 놓았다. 밑칠은 그림이 아직 안 왔을 때를 위한 것 하나면 된다
  backgroundImage: "url('/assets/radiant-platinum-intro.webp')",
})

/** 아래쪽 땅. 지평선이 있으면 하늘이 하늘로 읽힌다 */
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
 * ⚠️ **화면에서만 걷어낸다.** 제목은 배경 그림 안에 이미 그려져 있어서 글자로
 * 또 얹으면 두 번 겹친다. 그렇다고 `display: none`으로 두면 스크린 리더에도
 * 안 잡혀 이 화면에는 제목이 아예 없는 것이 된다 — 그건 그림 안의 글자를
 * 못 읽는 사람에게 제목을 안 준 것이다.
 *
 * 비공식 고지는 여기 들어 있지 않다. 그건 `disclaimer`가 **눈에 보이게**
 * 들고 있다 (COPYRIGHT.md §11) — 숨긴 자리에 적는 것은 표시한 것이 아니다
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
 * 고를 것 다섯 — 한 줄이다.
 *
 * ⚠️ **두 줄로 두면 층이 갈린다.** 예전에는 위 줄에 리포트 단추 둘, 아래 줄에
 * 나머지 셋이었는데, 같은 층의 일인데도 위아래로 나뉘어 보였고 키보드 커서는
 * 아래 셋만 돌았다. 다섯을 한 줄에 놓고 커서도 다섯을 다 돈다.
 *
 * 첫 칸만 넓다 — "모험 시작"은 나머지 넷과 무게가 다르다
 */
export const menu = style({
  position: 'absolute',
  left: '50%',
  bottom: 'clamp(16px, 2.6vh, 30px)',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  justifyContent: 'center',
  gap: 10,
  width: 'min(940px, calc(100vw - 32px))',
  transform: 'translateX(-50%)',
  pointerEvents: 'auto',
  '@media': {
    'screen and (max-width: 760px)': { flexWrap: 'wrap' },
  },
})

export const button = style({
  position: 'relative',
  flex: '1 1 0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  appearance: 'none',
  padding: '10px 16px 10px 26px',
  fontSize: TEXT.small,
  fontWeight: 700,
  lineHeight: 1.25,
  whiteSpace: 'nowrap',
  fontFamily: vars.font.ui,
  textAlign: 'center',
  ...WINDOW_SMALL,
  cursor: 'pointer',
  transition: 'transform 90ms ease-out, border-color 120ms linear',
  selectors: {
    '&:active': { transform: 'translateY(1px)' },
    // 눌러도 할 일이 없는 것. **왜 못 누르는지는 차림표 아래에 글로 적는다** —
    // 흐리기만 하면 눌러 보고 나서야 없다는 걸 알게 된다 (`TitleScreen` 머리말)
    '&:disabled': { opacity: 0.42, cursor: 'default' },
    '&:disabled:active': { transform: 'none' },
  },
})

/**
 * 커서가 올라간 칸.
 *
 * 마우스 hover와 키보드 커서를 **같은 표시**로 둔다 — 둘이 다르면 어느 쪽이
 * 지금 눌리는 칸인지 헷갈린다
 */
export const buttonOn = style({
  ...PICKED,
})

/**
 * 첫 칸 — 모험을 시작하거나 이어하는 자리.
 *
 * 나머지 넷과 **무게가 다르다.** 다섯을 똑같이 두면 처음 온 사람이 어디를
 * 눌러야 하는지 화면이 안 알려 준다
 */
export const buttonMain = style({
  flexGrow: 1.7,
  fontSize: TEXT.base,
  borderColor: vars.pick.edge,
})

/** 리포트 파일 쪽 둘. 눌릴 일이 드물어 한 톤 죽인다 */
export const buttonGhost = style({
  fontWeight: 600,
  fontSize: 13,
  opacity: 0.86,
  selectors: { '&:hover': { opacity: 1 } },
})

/** 지금 고른 칸 앞의 화살표. 원작 메뉴도 커서를 글자 앞에 둔다 */
export const caret = style({
  position: 'absolute',
  left: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  color: vars.pick.edge,
  fontSize: TEXT.small,
})

/**
 * 안 본 것이 있다는 점 — 「패치노트」 칸에만 붙는다.
 *
 * ⚠️ **글자 뒤에 흐름대로 놓는다.** 커서(`caret`)처럼 절대 자리로 띄우면 칸마다
 * 글자 길이가 달라 어느 칸에서는 글자 위에 앉는다. 여기는 칸을 6px 넓히고 만다
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

export const hint = style({
  fontSize: TEXT.tiny,
  color: vars.ink.onDarkDim,
})

/** 화면 아래에 붙는 조작 안내 */
export const foot = style({
  display: 'none',
})

/** 리포트 요약. 원작 메인 메뉴도 이 넷을 보여준다 */
export const summary = style({
  position: 'absolute',
  left: 'clamp(12px, 2vw, 24px)',
  bottom: 'clamp(12px, 2vh, 24px)',
  display: 'grid',
  gridTemplateColumns: 'auto auto',
  columnGap: 18,
  rowGap: 3,
  margin: 0,
  padding: '9px 13px',
  fontSize: TEXT.tiny,
  ...WINDOW,
  pointerEvents: 'auto',
  '@media': {
    'screen and (max-width: 980px)': {
      top: 12,
      bottom: 'auto',
    },
  },
})

globalStyle(`${summary} dt`, { color: vars.ink.dim })
globalStyle(`${summary} dd`, {
  margin: 0,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
})

/**
 * 리포트 파일 줄 — "백업 받기"와 "파일 불러오기" (IMPORT.md §10~11).
 *
 * ⚠️ **리포트가 없어도 보여야 한다.** 새 브라우저 프로필에서 파일을 들고 온
 * 사람에게는 이것이 유일한 입구인데, "리포트가 있을 때만"으로 두면 그 사람에게는
 * 아무 데도 없다
 */
export const filesArea = style({
  // ⚠️ `head`가 `position: absolute; inset: 0`이라 **보통 흐름에 두면 왼쪽 위로
  // 올라간다.** 실제로 이 줄이 제목 위에 겹쳐 잘려 있었다 — 형제인 `menu`처럼
  // 자리를 직접 잡는다. 단추는 이제 `menu` 한 줄에 있고, 여기 남는 것은
  // 알림·확인 판뿐이라 버튼 줄 **위로** 쌓인다
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  bottom: 'calc(clamp(16px, 2.6vh, 30px) + 58px)',
  width: 'min(620px, calc(100vw - 32px))',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  pointerEvents: 'none',
})

export const files = style({
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  justifyContent: 'center',
})

export const fileButton = style({
  ...WINDOW_SMALL,
  appearance: 'none',
  padding: `7px ${GAP.base}px`,
  fontFamily: vars.font.ui,
  fontSize: TEXT.tiny,
  borderRadius: RADIUS.cell,
  opacity: 0.85,
  cursor: 'pointer',
  pointerEvents: 'auto',
  selectors: { '&:hover': { opacity: 1 } },
})

/**
 * 비공식·비제휴 고지 (COPYRIGHT.md §11).
 *
 * ⚠️ **`crest`·`foot`처럼 숨기지 않는다.** 문서에만 있고 화면에 없으면 그건
 * 표시한 것이 아니다. 형제인 `menu`·`filesArea`처럼 자리를 직접 잡는다 —
 * `head`가 `position: absolute; inset: 0`이라 보통 흐름에 두면 왼쪽 위로 올라간다
 */
export const disclaimer = style({
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  // ⚠️ **배경 그림 위에 겹치면 못 읽는다.** 처음에 메뉴 위쪽에 뒀더니 제목
  // 그림과 정확히 겹쳐 글자가 사라졌다 (`shots/title.png`로 확인). 그림이
  // 비어 있는 맨 위로 올리고, 어두운 판을 깐다
  top: 'clamp(8px, 1.6vh, 16px)',
  // ⚠️ **두 줄에 들어와야 한다.** 넉 줄짜리 문단이 화면 위를 가로질러 덮고
  // 있었다. 담아야 하는 것은 다섯 가지고(COPYRIGHT.md §11) 그것을 줄이지 않은
  // 채로 두 줄에 넣으려면 폭이 필요하다 — 좁히지 말고 넓힌다
  width: 'min(1000px, calc(100vw - 24px))',
  margin: 0,
  padding: '7px 16px',
  boxSizing: 'border-box',
  fontFamily: vars.font.ui,
  fontSize: TEXT.tiny,
  lineHeight: 1.55,
  textAlign: 'center',
  ...WINDOW_SMALL,
})

/** 파일을 열어 보고 나서 확인받는 자리, 그리고 실패 이유 */
export const notice = style({
  ...WINDOW_SMALL,
  padding: `${GAP.small + 2}px ${GAP.base}px`,
  maxWidth: 520,
  fontFamily: vars.font.ui,
  fontSize: TEXT.tiny,
  lineHeight: 1.6,
  pointerEvents: 'auto',
  whiteSpace: 'pre-line',
})
