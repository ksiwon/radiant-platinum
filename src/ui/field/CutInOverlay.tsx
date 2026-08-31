// 조우 컷인의 덮개 (`scene/encounterCutIn`)
//
// 컷인이 화면에 얹는 것 셋 중 둘이 여기다 — **번쩍임**과 **조리개**다. 나머지
// 하나(화면을 찢고 물결치게 하는 것)는 3D 그림 자체를 미는 것이라 후처리가
// 한다 (`scene/fx/post`).
//
// `FadeOverlay`와 같은 방식이다: rAF로 들여다보고 **스타일을 직접 만진다** —
// 서른여덟 프레임짜리 연출에 React가 서른여덟 번 리렌더할 이유가 없다.
import { useEffect, useRef } from 'react'
import { cutInFrame } from '../../engine/battle/encounterCutIn'
import * as css from './cutInOverlay.css'
import { vars } from '../theme/contract.css'

/**
 * 조리개가 다 열렸을 때의 반지름 (화면 대각선의 몫).
 *
 * ⚠️ **1이면 모자란다.** 화면 대각선의 절반까지 가야 네 귀퉁이가 다 열리는데,
 * `radial-gradient`의 기본 자는 가까운 변이라 그것보다 짧다. `farthest-corner`로
 * 재면 딱 그 대각선이라 1이 곧 「다 열림」이 된다
 */
const OPEN = 'farthest-corner'

export function CutInOverlay() {
  const flashRef = useRef<HTMLDivElement>(null)
  const irisRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let lastFlash = Number.NaN
    let lastIris = Number.NaN
    const poll = (): void => {
      raf = requestAnimationFrame(poll)
      const at = cutInFrame.now
      const flash = flashRef.current
      const iris = irisRef.current
      if (!flash || !iris) return

      // 번쩍임(±1)과 마지막 검정을 한 판이 같이 그린다 — 둘 다 「화면을 한 색으로
      // 덮는 정도」고 동시에 서는 일이 없다 (검어질 때는 번쩍임이 이미 끝났다)
      const cover = at === null ? 0 : at.black > 0 ? -at.black : at.flash
      if (cover !== lastFlash) {
        lastFlash = cover
        flash.style.display = cover === 0 ? 'none' : 'block'
        flash.style.opacity = String(Math.abs(cover))
        // 양수가 흰색이다 — 상대가 더 셀 때 그렇다 (`EncounterEffect_Flash(1, 16, …)`)
        flash.style.background = cover > 0 ? vars.bar.trackTop : vars.scrim.black
      }

      const open = at?.iris ?? 1
      if (open !== lastIris) {
        lastIris = open
        iris.style.display = open >= 1 ? 'none' : 'block'
        // 안쪽은 뚫리고 바깥은 검다. 가장자리를 1%만 부드럽게 둬서 계단이 안 진다
        const inner = Math.max(0, open * 100)
        iris.style.background =
          `radial-gradient(circle ${OPEN} at 50% 50%,`
          + ` transparent ${String(inner)}%, ${vars.scrim.black} ${String(Math.min(100, inner + 1))}%)`
      }
    }
    raf = requestAnimationFrame(poll)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  return (
    <>
      <div ref={irisRef} className={css.iris} aria-hidden />
      <div ref={flashRef} className={css.cover} aria-hidden />
    </>
  )
}
