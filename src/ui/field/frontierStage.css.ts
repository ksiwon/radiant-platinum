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

/** 무대가 선 동안 — `sceneMark`의 `data-frontier-stage` */
const ON = 'html[data-frontier-stage]'
globalStyle(`${ON} ${frame}`, { zIndex: STAGE_Z + 10 })
globalStyle(`${ON} ${saveStage}`, { zIndex: STAGE_Z + 5 })
