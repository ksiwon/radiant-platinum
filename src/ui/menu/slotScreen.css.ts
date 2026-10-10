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
import { WINDOW } from '../theme/window.css'

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

export const sideCol = style({
  flex: '0 0 auto',
  width: 256,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
})


export const failed = style({ color: vars.state.bad, fontSize: TEXT.small })
