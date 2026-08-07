// 화면 페이드 덮개 (`engine/script/fade`)
//
// 컷신이 `FadeScreen`으로 장면을 끊는다. 그림 자체는 이 판 하나가 전부다 —
// 3D 위에 색을 덮는 것이라 three를 거칠 이유가 없고, DOM이면 대사창·메뉴까지
// 함께 덮인다(원작도 두 화면을 다 덮는다).
//
// 대사창과 같은 방식으로 rAF로 들여다본다. 다만 여기는 **매 프레임 바뀌는
// 값**이라 setState 대신 스타일을 직접 만진다 — 여섯 프레임짜리 페이드에
// React가 여섯 번 리렌더할 이유가 없다.
//
// 진하기를 굴리는 것은 여기가 아니라 세계다(`FieldWorld.tick`) — 원작 인자가
// 프레임 수라 게임 시계로 세야 맞는다.
import { useEffect, useRef } from 'react'
import { fadeAlpha, screenFade } from '../../engine/script/fade'
import * as css from './fadeOverlay.css'

export function FadeOverlay() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let last = -1
    const poll = (): void => {
      raf = requestAnimationFrame(poll)
      const el = ref.current
      if (!el) return
      const alpha = fadeAlpha()
      if (alpha === last) return
      last = alpha
      el.style.opacity = String(alpha)
      // 완전히 투명하면 클릭을 막지 않게 아예 뺀다
      el.style.display = alpha > 0 ? 'block' : 'none'
      el.style.background = screenFade.now?.color ?? '#000'
    }
    raf = requestAnimationFrame(poll)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  return <div ref={ref} className={css.cover} aria-hidden />
}
