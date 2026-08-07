// 파트너를 고르는 화면 (`choose_starter_app.c`).
//
// 원작은 가방이 열리고 몬스터볼 셋이 놓인 **3D 장면**이다
// (`NARC_INDEX_GRAPHIC__EV_POKESELECT`의 모델과 NSBCA). 우리는 그 모델을 아직
// 못 뽑았으므로 **롬에서 뽑은 그림만으로** 같은 배치를 만든다 — 서류가방은
// 오버월드 스프라이트 174번(`BRIEFCASE`), 볼은 도구 아이콘 4번, 미리보기는
// 포켓몬 앞모습이다. 없는 것을 그려 넣지 않는다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const wrap = style({
  position: 'fixed',
  inset: 0,
  zIndex: 400,
  // 필드가 이미 어두워진 뒤에 열린다(`FadeScreenOut` → `StartChooseStarterScene`).
  // 그 위에 한 겹 더 덮어 장면을 완전히 갈아 끼운다
  background: 'radial-gradient(circle at 50% 42%, #2b3550 0%, #10131f 68%, #05070d 100%)',
  fontFamily: vars.font.ui,
  userSelect: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
})

/** 볼 셋과 가방이 놓이는 자리 */
export const stage = style({
  position: 'relative',
  width: 'min(92vw, 620px)',
  height: 'min(52vh, 340px)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
})

/** 열린 서류가방. 볼이 그 위에 놓인다 */
export const briefcase = style({
  position: 'absolute',
  bottom: 0,
  width: 288,
  height: 288,
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '100% 100%',
  filter: 'drop-shadow(0 18px 26px rgba(0, 0, 0, 0.55))',
})

export const balls = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'flex-end',
  gap: 74,
  marginBottom: 96,
})

const float = keyframes({
  '0%, 100%': { transform: 'translateY(0)' },
  '50%': { transform: 'translateY(-7px)' },
})

const ballBase = style({
  position: 'relative',
  width: 64,
  height: 64,
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  filter: 'drop-shadow(0 6px 8px rgba(0, 0, 0, 0.5))',
})

export const ball = style([ballBase, { opacity: 0.82 }])

/**
 * 커서가 얹힌 볼. 원작은 이 볼만 **애니메이션을 돌린다**
 * (`UpdateSelectedPokeballAnimation` — 나머지는 0프레임으로 세워 둔다)
 */
export const ballOn = style([ballBase, {
  animation: `${float} 1.1s ease-in-out infinite`,
}])

/** 고른 볼 위에 뜨는 삼각 커서 */
export const cursor = style({
  position: 'absolute',
  left: '50%',
  top: -26,
  transform: 'translateX(-50%)',
  fontSize: 20,
  color: '#ffe9a8',
  textShadow: '0 2px 4px rgba(0, 0, 0, 0.6)',
})

/**
 * 미리보기 창 (`StarterPreviewWindow`).
 *
 * 원작은 확인을 물을 때만 열린다 — 커서를 옮기는 동안에는 볼만 보인다
 */
export const preview = style({
  position: 'absolute',
  left: '50%',
  top: 0,
  transform: 'translateX(-50%)',
  width: 176,
  height: 176,
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '100% 100%',
  filter: 'drop-shadow(0 10px 18px rgba(0, 0, 0, 0.6))',
})

/** 아래 대사창. 필드 창과 같은 모양이다 — 원작도 같은 테두리를 쓴다 */
export const box = style({
  position: 'relative',
  width: 'min(calc(100vw - 48px), 760px)',
  marginTop: 18,
  background: 'linear-gradient(180deg, rgba(250, 250, 252, 0.96), rgba(232, 236, 244, 0.96))',
  border: '2px solid rgba(60, 74, 102, 0.85)',
  borderRadius: 10,
  boxShadow: '0 8px 26px rgba(0, 0, 0, 0.45), inset 0 0 0 2px rgba(255, 255, 255, 0.7)',
  color: '#20263a',
  padding: '14px 26px 14px 20px',
  fontSize: 19,
  lineHeight: '30px',
  minHeight: 60,
  whiteSpace: 'pre-line',
})

export const menu = style({
  position: 'absolute',
  right: 0,
  bottom: 'calc(100% + 10px)',
  minWidth: 128,
  background: 'linear-gradient(180deg, rgba(250, 250, 252, 0.96), rgba(232, 236, 244, 0.96))',
  border: '2px solid rgba(60, 74, 102, 0.85)',
  borderRadius: 10,
  boxShadow: '0 8px 26px rgba(0, 0, 0, 0.45), inset 0 0 0 2px rgba(255, 255, 255, 0.7)',
  color: '#20263a',
  padding: '8px 12px',
  fontSize: 18,
  lineHeight: '30px',
})

const itemBase = style({ paddingLeft: 22 })

export const item = style([itemBase, { opacity: 0.6 }])

export const itemOn = style([itemBase, {
  position: 'relative',
  fontWeight: 700,
  selectors: {
    '&::before': {
      content: '"▶"',
      position: 'absolute',
      left: 2,
      fontSize: 12,
      lineHeight: '30px',
    },
  },
}])
