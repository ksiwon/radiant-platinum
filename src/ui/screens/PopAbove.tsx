// 타이틀 창 **위로** 뜨는 창 — 꼭지가 아래의 칸을 가리킨다 (app-screens §4.1~4.3).
//
// 공용 뜨는 창(`ChoiceMenu` · `YesNo`)은 원인의 **옆**에 앉는다. 타이틀의 줄은 화면 맨 아래에 가로로 놓여 있어서 위로 뜨는
// 자리가 따로 필요하다. 살갗은 같은 `POPOVER`이고 꼭지만 아래 변(`popoverSide.bottom`)에 선다.
//
// 자리는 순수 함수(`placeAbove`)가 정한다 — 원인 칸의 가운데에 창의 가운데를 맞추되 화면 가장자리를 안 넘고, 꼭지는 칸의
// 가운데를 가리킨다.
import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { NIB } from '../theme/scale'
import { popoverSide } from '../theme/window.css'
import * as css from './popAbove.css'

/** 꼭지가 창 모서리에 너무 붙지 않게 두는 여백(px) */
const NIB_MARGIN = 20
/** 창과 화면 가장자리 사이 */
const EDGE_MARGIN = 16

export interface AboveAt {
  left: number
  /** 꼭지가 창 왼쪽에서 얼마나 떨어지나 */
  nibAt: number
}

/** 원인 칸(`anchor`) 위로 뜨는 폭 `width`의 창 — 화면(`viewport`) 안에 머문다 */
export function placeAbove(anchor: { left: number, width: number }, width: number, viewport: number): AboveAt {
  const center = anchor.left + anchor.width / 2
  const wide = Math.min(width, viewport - EDGE_MARGIN * 2)
  const left = Math.max(EDGE_MARGIN, Math.min(center - wide / 2, viewport - EDGE_MARGIN - wide))
  const nibAt = Math.max(NIB_MARGIN, Math.min(wide - NIB_MARGIN, center - left))
  return { left, nibAt }
}

export function PopAbove(
  { anchor, width, children, className }: {
    anchor: HTMLElement | null
    width: number
    children: ReactNode
    className?: string
  },
) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    if (!anchor) return
    const place = (): void => {
      const r = anchor.getBoundingClientRect()
      const at = placeAbove(r, width, window.innerWidth)
      setStyle({
        left: at.left,
        bottom: window.innerHeight - r.top + NIB + 4,
        width: Math.min(width, window.innerWidth - EDGE_MARGIN * 2),
        ['--nib-at' as string]: `${String(at.nibAt)}px`,
      })
    }
    place()
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('resize', place) }
  }, [anchor, width])

  return (
    <div className={[css.root, popoverSide.bottom, className ?? ''].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  )
}
