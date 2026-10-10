// 교환 장면의 판 (`facilities` 설계 §4.3) — **창이 아니라 장면**이다. 3D 몸이 주인공이고 DOM에는 길 띠와 대사창뿐이다.
//
// 층 (아래에서 위로):
//
//   0 영속 Canvas (3D)  — 몸 · 무대 (`scene/CinematicStage`의 `tradePose`)
//   1 길 띠              — 위 가운데, 폭 420. `[내 마리] ───◆─── [받는 마리]`. 어두운 무대 위 글이다
//   2 대사창             — 아래 가운데, 폭 560. 필드 대사창과 같은 창 (`MessageWindow`)
//
// ⚠️ **통신관 그림을 지어내지 않는다** (`TradeScreen.tsx` 주석의 약속). 길 띠의 마름모는 그림이 아니라 진행 표시이고
// 관을 지나는 마디(`transit`)에만 선 위를 건넌다. 그 밖의 마디에는 없다
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, TEXT, TIME } from '../theme/scale'

/** 장면 한 장 — 연출 창(`cinematicScreen`)을 가득 채운다. 3D는 뒤의 영속 Canvas가 그린다 */
export const stage = style({
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
  pointerEvents: 'none',
})

/** 길 띠 — 위 가운데. 양쪽 끝에 마리, 가운데에 선 */
export const route = style({
  position: 'absolute',
  top: GAP.loose,
  left: 0,
  right: 0,
  margin: '0 auto',
  width: 420,
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr) max-content',
  alignItems: 'center',
  columnGap: GAP.base,
  color: vars.ink.onDark,
  fontSize: TEXT.small,
})

/** 마리 하나 — 아이콘 64(32의 2배) 아래 이름. 어두운 무대 위 글이다 */
export const mon = style({
  display: 'grid',
  justifyItems: 'center',
  rowGap: GAP.tight,
  minWidth: 64,
})

export const icon = style({
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

export const monName = style({
  maxWidth: 120,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** 두 마리를 잇는 선 — 마름모가 이 안에서 건넌다 */
export const line = style({
  position: 'relative',
  height: EDGE.bar,
  background: vars.ink.onDarkDim,
  // 아이콘 한가운데 높이에 선다 (이름 줄이 아래라 위로 올린다)
  alignSelf: 'start',
  marginTop: 32,
})

const travel = keyframes({
  from: { left: 0 },
  to: { left: '100%' },
})

/**
 * 진행 마름모. `left`를 0에서 100%로 `--travel`(= 관을 지나는 시간) 동안 건넌다. 마디가 끝나면 그 마디에서만 그려지는 요소라
 * 같이 사라진다. 움직임을 줄이는 설정이면 선 한가운데에 서 있다
 */
export const diamond = style({
  position: 'absolute',
  top: '50%',
  width: 10,
  height: 10,
  background: vars.pick.edge,
  transform: 'translate(-50%, -50%) rotate(45deg)',
  animation: `${travel} var(--travel, 1.8s) linear both`,
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none', left: '50%' },
  },
})

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

/**
 * 대사창 — 필드 대사창과 같은 두 줄 창(`MessageWindow`)이 아래 가운데에 선다. 폭 560.
 * 줄이 바뀔 때 100ms 페이드다(한 자씩 찍지 않는다). 입력이 없으므로 `pointer-events`를 안 받는다
 */
export const dock = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: GAP.loose,
  margin: '0 auto',
  width: 560,
  maxWidth: `calc(100% - ${String(GAP.loose * 2)}px)`,
  pointerEvents: 'none',
  animation: `${fadeIn} ${TIME.open} ease-out`,
})
