// 슬롯머신 화면 — 원작 두 판(기계 · 달밤)과 그 주변 (`facilities` 설계 §4.2).
//
// 기계 그림(릴 · 숫자판 · 줄 불빛)은 엔진이 원작 256×192 도트로 그리므로 **건드리지 않는다.** 여기가 정하는 것은 창 틀 ·
// 정수배 확대 · 주변 판독부와 키 안내다. 창은 `MenuScreen`(덮는 창)이 그린다 — 옛 검은 덮개 `overlay`는 없다.
//
// 왼쪽 열은 기계(정수 2배), 오른쪽 열은 달밤(1배)과 판독부다. 캔버스에는 2px `bar.edge` 윤곽만 둔다 — 원작이 만든
// 물건 그림이라 모서리를 안 둥글린다(도트 화면).
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, TEXT } from '../theme/scale'
import { RULE, WINDOW } from '../theme/window.css'

/** 본문 — 두 열을 가운데에 세운다. 크기는 창이 정하고 기계의 배수는 이 칸에서 거꾸로 정한다 (`slotScale`) */
export const body = style({
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: GAP.wide,
  padding: `${GAP.wide}px`,
  userSelect: 'none',
})

export const machineCol = style({
  flex: '0 0 auto',
  display: 'flex',
  flexDirection: 'column',
})

export const screen = style({ position: 'relative' })

export const canvas = style({
  display: 'block',
  imageRendering: 'pixelated',
  outline: `${EDGE.bar}px solid ${vars.bar.edge}`,
  outlineOffset: 0,
})

/**
 * 원작 글 창 — 위 화면 아래쪽 네 줄 (`Unk_ov101_021D8588` — 타일 (2,19)에서 26×4).
 *
 * ⚠️ **글자 크기는 16 고정이다.** 한때 `8 * 배수`라 1배에서 8px 픽셀 글자가 됐다. Galmuri11의 최소 읽히는 크기가 16이고
 * (캔버스 2배 기준의 8×2) 배수가 달라져도 글은 그대로다
 */
export const message = style({
  position: 'absolute',
  left: '7%',
  right: '7%',
  bottom: '4%',
  padding: `${GAP.small}px ${GAP.base}px`,
  whiteSpace: 'pre-line',
  fontSize: TEXT.base,
  lineHeight: 1.5,
  fontFamily: vars.font.pixel,
  ...WINDOW,
})

/** 기계 아래 키 안내 줄 — 릴 셋 아래 Y · B · A 단추 칸(원작) 자리에 이 게임의 키를 붙인다 */
export const reelKeys = style({
  position: 'relative',
  flex: '0 0 auto',
  height: 32,
  marginTop: GAP.small,
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
})

export const reelKey = style({
  position: 'absolute',
  top: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: GAP.tight,
  whiteSpace: 'nowrap',
  transform: 'translateX(-50%)',
})

export const sideCol = style({
  flex: '0 0 auto',
  width: 256,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
})

/**
 * 판독부 — 큰 글자 동전과 이번 지불. **보너스 중에만** 보너스 연속 · 남은 회전 · 보너스 동전이 붙는다.
 * 기계의 숫자판과 겹치지만 도트를 읽기 힘든 해상도에서의 보험이다.
 *
 * ⚠️ **값은 React 상태가 아니라 `ref`로 직접 쓴다** — 엔진이 60Hz로 돌리는 값이라 `setState`면 프레임이 떨어진다
 */
export const readout = style({
  display: 'grid',
  gap: GAP.tight,
  paddingTop: GAP.small,
  borderTop: RULE,
})

export const readRow = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: GAP.small,
  fontSize: TEXT.small,
  color: vars.ink.dim,
})

export const readValue = style({
  fontSize: TEXT.base,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.strong,
})

/** 동전 — 판독부에서 가장 크다 */
export const readCoins = style({
  fontSize: TEXT.big,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.strong,
})

export const bonus = style({
  display: 'grid',
  gap: GAP.tight,
  selectors: { '&[hidden]': { display: 'none' } },
})

/** 오른쪽 아래 — 동전 넣기 · 레버 */
export const sideKeys = style({
  display: 'flex',
  flexWrap: 'wrap',
  columnGap: GAP.wide,
  rowGap: GAP.tight,
  fontSize: TEXT.small,
  color: vars.ink.dim,
})

export const failed = style({ color: vars.state.bad, fontSize: TEXT.small })
