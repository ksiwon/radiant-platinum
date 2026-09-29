// 배틀프런티어 시설 장면의 무대 (PARITY §9.3).
//
// ⚠️ **암전 위, 대사창 아래다.** 로비는 장면으로 넘어가기 전에 화면을 검게 닫는다(`FadeScreenOut`) —
// 그 덮개(300)가 대사창(200)보다 위라 그대로면 장면의 말이 하나도 안 보인다. 원작도 장면 VM이
// 제 화면을 새로 연다. 그래서 무대가 덮개 위에 서고, 무대가 선 동안은 대사창·저장 창을 그 위로 올린다
import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { frame } from './messageBox.css'
import { stage as saveStage } from './saveInfoWindow.css'

const STAGE_Z = 320

export const stage = style({
  position: 'fixed',
  inset: 0,
  zIndex: STAGE_Z,
  background: vars.scrim.black,
  pointerEvents: 'none',
})

/** 원작 화면 한 장 (256×192) — 창에 맞춰 키운다 */
export const screen = style({
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: 256,
  height: 192,
  overflow: 'hidden',
  background: vars.scrim.black,
  imageRendering: 'pixelated',
})

export const layer = style({
  position: 'absolute',
  inset: 0,
  width: 256,
  height: 192,
  imageRendering: 'pixelated',
})

/** 배틀룸의 불 — 켜진 벌의 그 자리만 덮는다 */
export const light = style({
  position: 'absolute',
  imageRendering: 'pixelated',
})

/** 걷는 사람 — 필드의 걷는 그림 한 장 */
export const person = style({
  position: 'absolute',
  backgroundRepeat: 'no-repeat',
  imageRendering: 'pixelated',
})

/** 배틀로 넘어가는 연출의 위층 — 브레인 컷인 · 어둡기 · 번쩍임 (사람 위 · 암전 밑) */
export const overlay = style({
  position: 'absolute',
  inset: 0,
  width: 256,
  height: 192,
  zIndex: 1000,
  imageRendering: 'pixelated',
  pointerEvents: 'none',
})

/** 암전 (`FadeScreenIn` · `Out`) */
export const fade = style({
  position: 'absolute',
  inset: 0,
  background: vars.scrim.black,
  pointerEvents: 'none',
})

/** 무대가 선 동안 — `sceneMark`의 `data-frontier-stage` */
const ON = 'html[data-frontier-stage]'
globalStyle(`${ON} ${frame}`, { zIndex: STAGE_Z + 10 })
globalStyle(`${ON} ${saveStage}`, { zIndex: STAGE_Z + 5 })
