// 비전기술 컷인의 위아래 띠 (`scene/hmCutInScene`)
//
// `FadeOverlay`·`CutInOverlay`와 같은 방식이다: rAF로 들여다보고 **스타일을
// 직접 만진다** — 마흔 몇 프레임짜리 연출에 React가 마흔 번 리렌더할 이유가 없다.
import { useEffect, useRef } from 'react'
import { bandFraction } from '../../engine/actor/hmCutIn'
import { hmCutIn } from '../../scene/hmCutInScene'
import * as css from './hmCutInOverlay.css'

export function HmCutInOverlay() {
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let last = Number.NaN
    const poll = (): void => {
      raf = requestAnimationFrame(poll)
      const now = hmCutIn.now
      // 열린 띠의 몫. 안 도는 동안은 0이라 두 판이 아예 안 그려진다
      const band = now === null ? 0 : bandFraction(now)
      if (band === last) return
      last = band
      // 가운데에 `band`만큼을 비워 두려면 위아래 띠가 각각 그 절반씩 물러난다.
      // 판 하나가 화면 절반이므로 `1 − band`가 곧 남길 높이의 비율이다
      const keep = Math.max(0, 1 - band)
      for (const el of [topRef.current, bottomRef.current]) {
        if (!el) continue
        el.style.display = band > 0 ? 'block' : 'none'
        el.style.transform = `scaleY(${String(keep)})`
      }
    }
    raf = requestAnimationFrame(poll)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  return (
    <>
      <div ref={topRef} className={css.top} aria-hidden />
      <div ref={bottomRef} className={css.bottom} aria-hidden />
    </>
  )
}
