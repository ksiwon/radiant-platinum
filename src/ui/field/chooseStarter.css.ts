// 파트너를 고르는 화면의 창들 (`choose_starter_app.c`).
//
// **가방과 볼은 여기 없다.** 그건 원작 3D 모델이고 오버월드와 같은 Canvas에서
// 돈다(`scene/field/StarterStage`). 이 파일이 그리는 것은 그 위에 얹히는
// 글창·예아니오·미리보기뿐이라 **바탕이 투명해야 한다** — 덮으면 무대가 가려진다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const wrap = style({
  position: 'fixed',
  inset: 0,
  zIndex: 400,
  // ⚠️ 바탕을 칠하지 않는다. 뒤가 3D 무대다 — 배경은 그쪽이 판 한 장으로 덮는다
  fontFamily: vars.font.ui,
  userSelect: 'none',
  // 아래에 글창, 위쪽에 미리보기
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: '0 0 5vh',
  // 화면을 덮지만 입력은 안 가로챈다 — 키보드는 `useMenuKeys`가 받는다
  pointerEvents: 'none',
})

/**
 * 미리보기 창 (`StarterPreviewWindow`).
 *
 * 원작은 확인을 물을 때만 열린다 — 커서를 옮기는 동안에는 볼만 보인다
 */
export const preview = style({
  width: 176,
  height: 176,
  marginBottom: 'auto',
  marginTop: '8vh',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '100% 100%',
  filter: 'drop-shadow(0 10px 18px rgba(0, 0, 0, 0.6))',
})

/** 아래 대사창. 필드 창과 같은 모양이다 — 원작도 같은 테두리를 쓴다 */
export const box = style({
  position: 'relative',
  pointerEvents: 'auto',
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
