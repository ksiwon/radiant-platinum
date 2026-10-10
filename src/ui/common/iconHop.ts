// 아이콘 뜀의 박자 (SYSTEM §2.2 `iconHopFrames` · 4.11).
//
// 원작 파티 아이콘은 HP에 따라 **뛰는 박자가 다르다** — 만피 8프레임 · 초록 12 · 노랑 24 · 빨강 40.
// 상태 이상이나 기절이면 안 뛴다(`null`). 파티 · 교체 띠 · 박스 격자(3배) · 박스 파티가 한 박자를 쓴다.
// 예전에는 교체가 0.5s, 박스가 12프레임으로 고정이었다.
//
// 뛰는 폭은 **위로 3, 아래로 1 원본px**이고 `steps(1)`이다 — 사이를 보간하지 않는다. 배율을 곱한다.
import type { CSSProperties } from 'react'
import { hpColor } from '../../engine/battle/healthbar'
import { frames, type PixelScale } from '../theme/scale'
import * as css from './parts.css'

/** 원작 박자(프레임). 안 뛰면 null */
export function iconHopFrames(hp: number, max: number, status?: string | null): number | null {
  if (hp <= 0 || max <= 0) return null
  if (status !== undefined && status !== null && status !== 'ok' && status !== '') return null
  if (hp >= max) return 8
  switch (hpColor(hp, max)) {
    case 'green': return 12
    case 'yellow': return 24
    case 'red': return 40
    default: return null
  }
}

/** 뜀의 위아래 폭(원본px) — 위로 3, 아래로 1 */
export const HOP = { up: 3, down: 1 } as const

export interface HopStyle {
  className: string
  style: CSSProperties
}

/** 그 아이콘에 붙일 클래스와 인라인 변수. 안 뛰면 null이다 */
export function iconHop(
  hp: number, max: number, status: string | null | undefined, scale: PixelScale,
): HopStyle | null {
  const at = iconHopFrames(hp, max, status)
  if (at === null) return null
  return {
    className: css.iconHop,
    style: {
      animationDuration: frames(at),
      '--hop-up': `-${String(HOP.up * scale)}px`,
      '--hop-down': `${String(HOP.down * scale)}px`,
    } as CSSProperties,
  }
}
