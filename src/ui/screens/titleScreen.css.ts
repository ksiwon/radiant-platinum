// 타이틀 화면.
//
// 여기가 게임의 첫인상이라 **게임 화면처럼 보여야 한다.** 가운데 정렬한 버튼
// 두 개가 아니라, 제목이 화면을 차지하고 그 아래에 고를 것이 놓인 모양이다.
import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 배경이 천천히 흐른다. 정지 화면이면 게임이 멈춘 것처럼 보인다 */


export const wrap = style({
  position: 'fixed',
  inset: 0,
  display: 'grid',
  gridTemplateRows: '1fr auto 1fr',
  justifyItems: 'center',
  color: vars.panel.text,
  fontFamily: vars.font.ui,
  zIndex: 10,
  overflow: 'hidden',
  userSelect: 'none',
  background: '#070c16',
})

/**
 * 하늘.
 *
 * 3D 무대를 띄우지 않는다 — 타이틀은 three.js 없이 떠야 한다(PLAN §10.4).
 * 대신 필드의 낮 하늘과 같은 계열로 칠해서 이어지는 느낌만 남긴다
 */
export const sky = style({
  position: 'absolute',
  inset: 0,
  zIndex: -2,
  // ⚠️ **그림을 쓰지 않는다.** 예전에는 2.4MB짜리 PNG 한 장이었고 그 안에 금속
  // 질감의 워드마크와 기라티나(오리진 폼)로 보이는 형상이 그려져 있었다 —
  // 우리가 만든 PNG라 바이트 검사는 전부 통과하는데 화면은 공식처럼 보였다
  // (COPYRIGHT.md §11). 지금 여기 있는 것은 그라디언트 넷뿐이고, 배포물에서
  // 2.4MB가 그대로 빠졌다
  backgroundColor: '#070c16',
  backgroundImage: [
    // 위쪽에서 비스듬히 드는 차가운 빛
    'radial-gradient(120% 90% at 50% -18%, rgba(126, 168, 214, 0.42), transparent 62%)',
    // 지평선 쪽 옅은 온기
    'radial-gradient(140% 70% at 50% 108%, rgba(96, 120, 158, 0.30), transparent 60%)',
    // 백금빛 띠 하나. 금속 느낌은 이 기울기에서 나온다
    'linear-gradient(200deg, rgba(214, 228, 244, 0.10) 0%, transparent 36%,'
    + ' transparent 64%, rgba(214, 228, 244, 0.07) 100%)',
    'linear-gradient(180deg, #0b1422 0%, #070c16 58%, #05080f 100%)',
  ].join(', '),
})

/** 아래쪽 땅. 지평선이 있으면 하늘이 하늘로 읽힌다 */
export const ground = style({
  position: 'absolute',
  inset: 0,
  zIndex: -1,
  background:
    'linear-gradient(180deg, transparent 76%, rgba(2, 3, 6, 0.12) 88%, rgba(2, 3, 6, 0.62) 100%)',
  pointerEvents: 'none',
})

export const head = style({
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  pointerEvents: 'none',
})

export const crest = style({
  display: 'none',
})

/** 위에 작게 얹히는 줄 */
export const brand = style({
  fontSize: 'clamp(15px, 1.9vw, 22px)',
  fontWeight: 700,
  letterSpacing: '0.42em',
  textIndent: '0.42em',
  color: '#f7e08a',
  textShadow: '0 2px 6px rgba(0,0,0,0.6), 0 0 18px rgba(247, 224, 138, 0.35)',
})

/**
 * 제목.
 *
 * 백금이라 **금속처럼** 보여야 한다 — 위아래로 밝기가 뒤집히는 그라디언트가
 * 그 느낌을 낸다. 글자에 직접 칠하려고 `background-clip`을 쓴다
 */
export const title = style({
  margin: 0,
  fontSize: 'clamp(38px, 7.4vw, 92px)',
  fontWeight: 800,
  lineHeight: 1.02,
  letterSpacing: '0.02em',
  textAlign: 'center',
  backgroundImage:
    'linear-gradient(180deg, #ffffff 0%, #dfe8f2 26%, #9fb2c6 48%,' +
    ' #f2f6fa 56%, #b9c8d8 74%, #7f92a8 100%)',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  color: 'transparent',
  filter: 'drop-shadow(0 3px 0 rgba(30, 48, 74, 0.55)) drop-shadow(0 10px 26px rgba(0,0,0,0.6))',
})

/** 팬이 만든 것이라는 표시. 감추지 않는다 */
export const sub = style({
  fontSize: 'clamp(11px, 1.25vw, 14px)',
  letterSpacing: '0.16em',
  opacity: 0.72,
  textShadow: '0 1px 4px rgba(0,0,0,0.7)',
})

export const menu = style({
  position: 'absolute',
  left: '50%',
  bottom: 'clamp(12px, 2vh, 24px)',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  width: 'min(440px, calc(100vw - 32px))',
  transform: 'translateX(-50%)',
  pointerEvents: 'auto',
})

export const button = style({
  position: 'relative',
  flex: 1,
  appearance: 'none',
  padding: '10px 18px',
  fontSize: 15,
  fontWeight: 700,
  fontFamily: vars.font.ui,
  color: '#eef3fa',
  textAlign: 'center',
  background: 'linear-gradient(180deg, rgba(22, 32, 50, 0.74), rgba(8, 13, 23, 0.82))',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 999,
  boxShadow: '0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
  backdropFilter: 'blur(3px)',
  cursor: 'pointer',
  transition: 'transform 90ms ease-out, border-color 120ms linear, box-shadow 120ms linear',
  selectors: {
    '&:active': { transform: 'translateY(1px)' },
  },
})

/**
 * 커서가 올라간 칸.
 *
 * 마우스 hover와 키보드 커서를 **같은 표시**로 둔다 — 둘이 다르면 어느 쪽이
 * 지금 눌리는 칸인지 헷갈린다
 */
export const buttonOn = style({
  borderColor: 'rgba(247, 224, 138, 0.75)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(247, 224, 138, 0.3)',
  background: 'linear-gradient(180deg, rgba(34, 48, 72, 0.92), rgba(18, 27, 44, 0.94))',
})

/** 지금 고른 칸 앞의 화살표. 원작 메뉴도 커서를 글자 앞에 둔다 */
export const caret = style({
  position: 'absolute',
  left: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#f7e08a',
  fontSize: 13,
})

export const hint = style({
  fontSize: 12,
  opacity: 0.62,
  textShadow: '0 1px 4px rgba(0,0,0,0.8)',
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
  fontSize: 12,
  background: 'linear-gradient(180deg, rgba(18, 26, 42, 0.66), rgba(8, 13, 23, 0.74))',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 9,
  backdropFilter: 'blur(5px)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
  pointerEvents: 'auto',
  '@media': {
    'screen and (max-width: 980px)': {
      top: 12,
      bottom: 'auto',
    },
  },
})

globalStyle(`${summary} dt`, { opacity: 0.62 })
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
  // 올라간다.** 실제로 파일 줄이 제목 위에 겹쳐 잘려 있었다 — 형제인 `menu`처럼
  // 자리를 직접 잡는다
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  bottom: 'calc(clamp(12px, 2vh, 24px) + 54px)',
  width: 'min(560px, calc(100vw - 32px))',
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
  appearance: 'none',
  padding: '7px 12px',
  fontFamily: vars.font.ui,
  fontSize: 12,
  color: vars.panel.text,
  background: 'rgba(8, 13, 23, 0.54)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 999,
  opacity: 0.78,
  backdropFilter: 'blur(4px)',
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
  width: 'min(720px, calc(100vw - 24px))',
  margin: 0,
  padding: '6px 12px',
  boxSizing: 'border-box',
  fontFamily: vars.font.ui,
  fontSize: 11,
  lineHeight: 1.65,
  textAlign: 'center',
  color: 'rgba(233, 238, 250, 0.92)',
  background: 'rgba(6, 10, 18, 0.72)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 8,
  backdropFilter: 'blur(3px)',
})

/** 파일을 열어 보고 나서 확인받는 자리, 그리고 실패 이유 */
export const notice = style({
  padding: '10px 12px',
  maxWidth: 520,
  fontFamily: vars.font.ui,
  fontSize: 12,
  lineHeight: 1.6,
  color: vars.panel.text,
  background: 'rgba(8, 13, 23, 0.66)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 10,
  backdropFilter: 'blur(4px)',
  pointerEvents: 'auto',
  whiteSpace: 'pre-line',
})

/** 리포트가 있을 때만 뜨는 "처음부터". 실수로 누르면 안 되므로 글자로만 둔다 */
export const restart = style({
  position: 'absolute',
  right: 'clamp(12px, 2vw, 24px)',
  bottom: 'clamp(16px, 2.3vh, 28px)',
  appearance: 'none',
  padding: '6px 10px',
  fontFamily: vars.font.ui,
  fontSize: 11,
  color: vars.panel.text,
  background: 'rgba(8, 13, 23, 0.54)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 999,
  opacity: 0.68,
  backdropFilter: 'blur(4px)',
  cursor: 'pointer',
  pointerEvents: 'auto',
  selectors: {
    '&:hover': { opacity: 1 },
  },
  '@media': {
    'screen and (max-width: 980px)': {
      top: 12,
      bottom: 'auto',
    },
  },
})
