// 그림 밑의 그늘 타원 (SYSTEM §2.2 `GroundShadow`).
//
// 그림자(`boxShadow` · `drop-shadow`)가 아니라 **땅에 닿은 자리를 보이는 면**이다 — `window.shade` 한 색의
// 타원이다. 박스에서 드는 아이콘과 상점 아이콘이 그림자 대신 이것을 쓴다 (SYSTEM §0).
import type { CSSProperties } from 'react'
import * as css from './parts.css'

export function GroundShadow({ w, h, style }: { w: number, h: number, style?: CSSProperties }) {
  return <span className={css.groundShadow} aria-hidden style={{ width: w, height: h, ...style }} />
}
