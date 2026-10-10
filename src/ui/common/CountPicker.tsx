// 개수 고르기 (SYSTEM §2.2 `CountPicker`) — ▲ ×003 ▼.
//
// 가방 버리기 · 상점이 쓴다. 숫자는 `TEXT.big`에 tabular다(mono 금지 — SYSTEM §0 L4). 화살표는 `TIME.blink`로
// 깜박이고 **꺼질 때 `pick.trace`**로 선다 — 더 못 가는 쪽(끝)은 깜박이지 않고 꺼진 색으로 선다.
// 키는 화면이 `useMenuKeys`로 처리한다 (↑↓ ±1 · ←→ ±10 따위는 화면마다 다르다). 이 부품은 그리기만 한다.
import * as css from './parts.css'

/** 「×003」 — 세 자리로 채운다 */
export function countText(value: number): string {
  return `×${String(Math.max(0, Math.trunc(value))).padStart(3, '0')}`
}

export function CountPicker({ value, min, max }: { value: number, min: number, max: number }) {
  return (
    <span className={css.counter} role="spinbutton" aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}>
      <span className={value >= max ? `${css.countUp} ${css.countOff}` : css.countUp} aria-hidden />
      <span className={css.countValue}>{countText(value)}</span>
      <span className={value <= min ? `${css.countDown} ${css.countOffDown}` : css.countDown} aria-hidden />
    </span>
  )
}
