// 설치 화면의 스크롤 칸 — 공용 `ScrollKnob`을 픽셀로 쓴다.
//
// 칸이 넘쳐도 브라우저 스크롤막대가 얇거나 겹쳐 그려져 스크롤할 수 있는지 안 보였다(1280×720에서 왼쪽 사실 넷과
// 오른쪽 준비물 끝이 잘린 채로 보였다). 다른 메뉴처럼 6px 홈과 손잡이를 늘 세운다. 줄 대신 픽셀을 넣으면
// `knobSpan`이 같은 식으로 손잡이를 잰다.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ScrollKnob } from '../../ui/common/ScrollKnob'
import * as css from './importWizard.css'

interface Span { at: number, visible: number, total: number }

export function ScrollPane(
  { pane, inner, children }: { pane: string, inner: string, children: ReactNode },
) {
  const ref = useRef<HTMLDivElement>(null)
  const [span, setSpan] = useState<Span>({ at: 0, visible: 1, total: 1 })

  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    const read = () => {
      setSpan({ at: el.scrollTop, visible: el.clientHeight, total: el.scrollHeight })
    }
    // 접힌 칸을 열거나 글이 바뀌면 높이가 바뀐다 — 칸과 그 아이들의 크기를 같이 본다
    const sizes = new ResizeObserver(read)
    const watch = () => {
      sizes.disconnect()
      sizes.observe(el)
      for (const child of el.children) sizes.observe(child)
      read()
    }
    const kids = new MutationObserver(watch)
    kids.observe(el, { childList: true })
    el.addEventListener('scroll', read, { passive: true })
    watch()
    return () => {
      el.removeEventListener('scroll', read)
      kids.disconnect()
      sizes.disconnect()
    }
  }, [])

  return (
    <div className={`${css.scrollPane} ${pane}`}>
      <div ref={ref} className={inner}>{children}</div>
      <ScrollKnob at={span.at} visible={span.visible} total={span.total} />
    </div>
  )
}
