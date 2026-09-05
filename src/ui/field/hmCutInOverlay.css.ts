// 비전기술 컷인의 밴드 (`engine/actor/hmCutIn`).
//
// 원작은 아래 화면에 창 하나를 가로로 벌렸다 세로로 벌린다. 우리는 그 창을
// **위아래 검은 띠**로 뒤집어 그린다 — 3D 화면은 창 안을 따로 못 그리므로,
// 밖을 덮어 가운데만 남기는 쪽이 같은 그림이 된다.
//
// ⚠️ **컷인 몸(zIndex 없음, 3D)보다 위이면 안 된다.** 몸은 캔버스 안에 있어서
// 이 띠들과 겹치지 않는다 — 띠는 캔버스 **위**를 덮고 가운데를 비워 둔다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

const bar = {
  position: 'fixed',
  left: 0,
  right: 0,
  zIndex: 250,
  height: '50%',
  background: vars.scrim.black,
  pointerEvents: 'none',
  display: 'none',
} as const

export const top = style({ ...bar, top: 0, transformOrigin: 'top center' })
export const bottom = style({ ...bar, bottom: 0, transformOrigin: 'bottom center' })
