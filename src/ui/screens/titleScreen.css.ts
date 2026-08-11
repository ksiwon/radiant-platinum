// 타이틀 화면.
//
// 여기가 게임의 첫인상이라 **게임 화면처럼 보여야 한다.** 가운데 정렬한 버튼
// 두 개가 아니라, 제목이 화면을 차지하고 그 아래에 고를 것이 놓인 모양이다.
//
// ⚠️ **한동안 화면이 통째로 비어 있었다.** 배경 그림을 뺐는데(아래 `sky`)
// 제목까지 `display: none`인 채로 남아서, 그라디언트만 깔린 검은 화면에 버튼
// 다섯 개가 떠 있었다. 그림을 되살릴 수는 없다 — 대신 **우리가 그린 추상
// 표식**(`public/assets/mark.svg`와 같은 고리 여섯)을 크게 놓고 제목을 켠다.
import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 표식이 아주 천천히 돈다. 완전히 멈춰 있으면 화면이 죽은 것처럼 보인다 */
const spin = keyframes({
  from: { transform: 'translate(-50%, -50%) rotate(0deg)' },
  to: { transform: 'translate(-50%, -50%) rotate(360deg)' },
})

/** 표식 뒤의 빛이 숨 쉰다 */
const breathe = keyframes({
  '0%, 100%': { opacity: 0.55, transform: 'translate(-50%, -50%) scale(1)' },
  '50%': { opacity: 0.85, transform: 'translate(-50%, -50%) scale(1.06)' },
})


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

/**
 * 제목 덩어리 — 표식 · 이름 · 한 줄 설명.
 *
 * ⚠️ 예전에 `display: none`이었다. 배경 그림 안에 제목이 이미 그려져 있었기
 * 때문인데, 그 그림을 뺀 뒤로는 **아무것도 안 남았다**
 */
export const crest = style({
  position: 'absolute',
  left: '50%',
  top: '43%',
  transform: 'translate(-50%, -50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'clamp(6px, 1vh, 12px)',
  width: 'min(900px, calc(100vw - 32px))',
})

/**
 * 제목 뒤의 추상 표식 — 퍼져 나가는 고리 여섯.
 *
 * ⚠️ **파일을 안 받는다.** `assets/mark.svg`와 같은 그림이지만 여기서는 문서에
 * 직접 그린다 — 첫 화면에 요청을 하나 더 만들 이유가 없고, 크기와 밝기를 이
 * 자리에 맞춰야 한다. 무엇을 그렸는지는 `tools/distribution/shellArt.mjs`에
 * 적혀 있다: 생물 실루엣도 몬스터볼 모양도 공식 로고 형태도 없다
 */
export const emblem = style({
  position: 'absolute',
  left: '50%',
  top: '46%',
  width: 'min(58vh, 560px)',
  height: 'min(58vh, 560px)',
  transform: 'translate(-50%, -50%)',
  animation: `${spin} 240s linear infinite`,
  opacity: 0.24,
  pointerEvents: 'none',
  zIndex: -1,
})

/**
 * 제목 자리를 눌러 주는 타원.
 *
 * ⚠️ **고리가 글자를 가로지른다.** 표식을 제목 뒤에 두면 선이 글자 획과 섞여
 * 둘 다 안 읽힌다. 그렇다고 상자를 깔면 투박하다 — **가장자리가 없는 타원**으로
 * 가운데만 어둡게 누른다.
 *
 * ⚠️ 이걸 `crest`의 배경으로 두면 안 된다. 그 상자가 그라디언트를 잘라서
 * **가로로 곧은 이음매 두 줄**이 생긴다 — 실측으로 화면에 그대로 보였다.
 * 글자보다 넉넉히 큰 자기 자리를 갖고 있어야 falloff가 끝까지 흐려진다
 */
export const halo = style({
  position: 'absolute',
  left: '50%',
  top: '43%',
  width: 'min(1240px, 94vw)',
  height: 'min(52vh, 460px)',
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  background: [
    'radial-gradient(closest-side, rgba(4, 7, 13, 0.88) 0%,'
    + ' rgba(4, 7, 13, 0.60) 38%, rgba(4, 7, 13, 0.22) 62%, transparent 82%)',
    'radial-gradient(closest-side, rgba(126, 168, 214, 0.20) 26%,'
    + ' rgba(126, 168, 214, 0.06) 54%, transparent 78%)',
  ].join(', '),
  animation: `${breathe} 9s ease-in-out infinite`,
  pointerEvents: 'none',
  zIndex: -1,
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
  fontSize: 'clamp(38px, 6.6vw, 84px)',
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
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.25,
  whiteSpace: 'nowrap',
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

/**
 * 첫 칸 — 모험을 시작하거나 이어하는 자리.
 *
 * 나머지 넷과 **무게가 다르다.** 다섯을 똑같이 두면 처음 온 사람이 어디를
 * 눌러야 하는지 화면이 안 알려 준다
 */
export const buttonMain = style({
  flexGrow: 1.7,
  fontSize: 15,
  borderColor: 'rgba(247, 224, 138, 0.42)',
  background: 'linear-gradient(180deg, rgba(38, 52, 78, 0.86), rgba(14, 22, 38, 0.9))',
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
  // ⚠️ **두 줄에 들어와야 한다.** 넉 줄짜리 문단이 화면 위를 가로질러 덮고
  // 있었다. 담아야 하는 것은 다섯 가지고(COPYRIGHT.md §11) 그것을 줄이지 않은
  // 채로 두 줄에 넣으려면 폭이 필요하다 — 좁히지 말고 넓힌다
  width: 'min(1000px, calc(100vw - 24px))',
  margin: 0,
  padding: '7px 16px',
  boxSizing: 'border-box',
  fontFamily: vars.font.ui,
  fontSize: 12,
  lineHeight: 1.55,
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
