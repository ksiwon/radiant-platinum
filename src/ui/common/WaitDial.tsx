// 쓰는 중 · 기다리는 중을 말하는 다이얼 (SYSTEM §2.2 `WaitDial`) — 점 여덟이 돈다.
//
// 리포트 · 필드 `SaveInfoWindow` · 팩토리 저장이 쓴다. 원작 프레임 움직임이라 `prefers-reduced-motion`에서도
// 남는다 (§3). 주기는 실측 2.14s다(16 VBlank × 8) — `parts.css`의 `dialRunning` 한 곳만 고친다.
import type { CSSProperties } from 'react'
import * as css from './parts.css'

const DOTS = 8

export function WaitDial({ running = true }: { running?: boolean }) {
  return (
    <span className={css.dial} aria-hidden data-wait-dial={running ? 'on' : 'off'}>
      {Array.from({ length: DOTS }, (_, i) => (
        <span
          key={i}
          className={running ? `${css.dialDot} ${css.dialRunning}` : css.dialDot}
          style={{ '--a': `${String(i * (360 / DOTS))}deg`, '--i': i } as CSSProperties}
        />
      ))}
    </span>
  )
}
