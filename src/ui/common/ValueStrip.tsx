// 같은 열에 값을 늘어놓는다 (SYSTEM §2.2 `ValueStrip`) — 설정 화면의 값 줄.
//
// 칸 폭이 160으로 같아서 값이 줄마다 열에 맞는다. 고른 값은 `emphasis.one`과 금 밑줄이고, 밑줄 하나가
// `TIME.slide` 동안 옮겨 간다. `radiogroup`을 단다 — 설정은 §2.3의 「떠 있을 수 없는 화면」이다.
//
// ⚠️ **key는 값 글자가 아니라 자리(k)다.** 언어를 바꾸면 값 글이 바뀌는데 글로 key를 쥐면 칸이 통째로
// 다시 만들어져 밑줄이 튄다.
import type { CSSProperties } from 'react'
import * as css from './parts.css'

/** 칸 폭(px) — `parts.css`의 `valueCell`과 같다 */
export const VALUE_CELL = 160

export function ValueStrip(
  { values, at, onPick, label }: {
    values: readonly string[]
    at: number
    onPick?: (index: number) => void
    /** 이 줄의 이름 (읽어 주는 이름) */
    label?: string
  },
) {
  return (
    <div
      className={css.valueStrip}
      role="radiogroup"
      {...(label !== undefined ? { 'aria-label': label } : {})}
      style={{ '--bar-x': `${String(at * VALUE_CELL)}px` } as CSSProperties}
    >
      {values.map((value, k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={k === at}
          className={k === at ? `${css.valueCell} ${css.valueCellOn}` : css.valueCell}
          onClick={() => { onPick?.(k) }}
        >
          {value}
        </button>
      ))}
      <span className={css.valueBar} aria-hidden />
    </div>
  )
}
