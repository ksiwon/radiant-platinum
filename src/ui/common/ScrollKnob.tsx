// 스크롤 표시 한 벌 (SYSTEM §2.2 `ScrollKnob` · 4.13).
//
// 스크롤 표시가 셋이던 것(`ScrollThumb` · 눈금 · 얇은 스크롤막대)을 이것 하나로 합친다. 6px 홈과 손잡이이고
// 브라우저 스크롤막대는 숨긴다(`scrollList`). 목록 끝 6px는 페이드한다.
//
// 쓰는 쪽은 목록 칸을 `position: relative`로 두고 안에 이것을 넣는다. 보이는 줄 수(`visible`)가 전체(`total`)
// 이상이면 아무것도 안 그린다.
import * as css from './parts.css'

export { scrollList } from './parts.css'

/** 손잡이의 위치와 길이 (홈 길이에 대한 0~1). 시험이 이 값을 본다 */
export function knobSpan(at: number, visible: number, total: number): { top: number, size: number } | null {
  if (total <= 0 || visible >= total) return null
  const size = Math.max(visible / total, 0.08)
  const room = 1 - size
  const span = Math.max(1, total - visible)
  return { top: Math.min(1, Math.max(0, at / span)) * room, size }
}

export function ScrollKnob(
  { at, visible, total }: {
    /** 맨 위에서 몇 줄(또는 칸) 내려왔나 */
    at: number
    /** 한 번에 보이는 줄 수 */
    visible: number
    total: number
  },
) {
  const span = knobSpan(at, visible, total)
  if (span === null) return null
  return (
    <span className={css.knobTrack} aria-hidden data-scroll-knob>
      <span
        className={css.knob}
        style={{ top: `${String(span.top * 100)}%`, height: `${String(span.size * 100)}%` }}
      />
    </span>
  )
}
