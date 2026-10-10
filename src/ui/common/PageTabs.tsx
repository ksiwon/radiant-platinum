// 탭 한 벌 (SYSTEM §0 L3 · §2.2 `PageTabs`).
//
// 모양이 셋이던 탭(테두리 탭 · 칩 · 밑줄)을 **글자 아래 금 밑줄 하나**로 모았다. 밑줄은 탭이 아니라
// 목록 칸 안의 `aria-hidden` 요소 하나이고 고른 탭 쪽으로 `TIME.slide` 동안 미끄러진다.
// 쪽 색(`mark`)은 작은 점 하나로만 나온다 — 판을 그 색으로 칠하지 않는다 (결정).
//
// 탭 글에 숫자와 `/`를 안 넣는다 — 「1/4」 같은 쪽 표시는 탭이 아니라 쪽 자체(`note`)가 말한다.
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import * as css from './parts.css'

export interface PageTab {
  key: string
  label: string
  /** 쪽 색 점 (`vars.page.*`). 탭 표식에만 쓴다 */
  mark?: string
}

/** 탭 글이 규칙을 지키는가 — 숫자와 `/`가 없다 */
export function tabLabelOk(label: string): boolean {
  return !/[0-9/]/.test(label)
}

export function PageTabs(
  { pages, at, onPick, label }: {
    pages: readonly PageTab[]
    /** 고른 탭의 번호 */
    at: number
    /** 눌렀을 때(마우스). 키는 화면이 `useMenuKeys`로 처리한다 */
    onPick?: (index: number) => void
    /** 탭 줄의 이름 (읽어 주는 이름) */
    label?: string
  },
) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [bar, setBar] = useState<{ x: number, w: number } | null>(null)

  // 밑줄의 자리 — 고른 탭의 왼쪽과 폭. 글꼴이 늦게 와서 폭이 바뀔 수 있어 탭이 자라도 따라간다
  useLayoutEffect(() => {
    const node = refs.current[at]
    if (!node) return
    const place = (): void => { setBar({ x: node.offsetLeft, w: node.offsetWidth }) }
    place()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(place)
    watch.observe(node)
    return () => { watch.disconnect() }
  }, [at, pages.length])

  return (
    <div
      className={css.tabList}
      role="tablist"
      {...(label !== undefined ? { 'aria-label': label } : {})}
      style={bar ? { '--bar-x': `${String(bar.x)}px`, '--bar-w': `${String(bar.w)}px` } as CSSProperties : undefined}
    >
      {pages.map((page, i) => (
        <button
          key={page.key}
          ref={(node) => { refs.current[i] = node }}
          type="button"
          role="tab"
          aria-selected={i === at}
          tabIndex={i === at ? 0 : -1}
          className={i === at ? `${css.tab} ${css.tabOn}` : css.tab}
          onClick={() => { onPick?.(i) }}
        >
          {page.mark !== undefined && (
            <span className={css.tabMark} aria-hidden style={{ '--mark': page.mark } as CSSProperties} />
          )}
          {page.label}
        </button>
      ))}
      {bar !== null && <span className={css.tabBar} aria-hidden />}
    </div>
  )
}
