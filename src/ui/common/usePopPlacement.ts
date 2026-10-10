// 뜨는 창을 원인 옆에 앉히는 훅 (`ChoiceMenu` · `YesNo`가 같이 쓴다).
//
// 그린 뒤에 창 크기를 재서 `placeChoice`로 자리를 정한다 — 첫 프레임에 엉뚱한 곳에 안 뜨게 `useLayoutEffect`다.
// 원인이 없으면(`anchor === null`) 자리를 안 잡고 부모가 정한다(`position: absolute` 그대로).
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { popoverSide } from '../theme/window.css'
import { placeChoice, type Box, type PopSide } from './choicePlace'

function boxOf(node: Element): Box {
  const r = node.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export interface PopPlacement {
  ref: RefObject<HTMLDivElement | null>
  /** 인라인 스타일 — 자리와 꼭지 변수. 원인이 없으면 비어 있다 */
  style: CSSProperties
  /** 꼭지 클래스 (`popoverSide`) */
  nib: string
  /** 원인이 있으면 `fixed`로 앉는다 */
  fixed: boolean
}

export function usePopPlacement(
  anchor: HTMLElement | null | undefined, within: HTMLElement | null | undefined, side: PopSide, dep: unknown,
): PopPlacement {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number, top: number, side: PopSide, nibAt: number } | null>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || !anchor) { setPlace(null); return }
    const bounds: Box = within
      ? boxOf(within)
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    setPlace(placeChoice(boxOf(anchor), { width: node.offsetWidth, height: node.offsetHeight }, bounds, side))
  }, [anchor, within, side, dep])

  const sat = place?.side ?? side
  // 창이 원인의 오른쪽에 앉으면 꼭지는 **왼쪽 변**에 선다 (원인을 가리킨다). 원인이 없으면 꼭지도 없다
  const nib = !anchor ? '' : sat === 'right' ? popoverSide.left : popoverSide.right
  const style: CSSProperties = !anchor
    ? {}
    : place === null
      ? { visibility: 'hidden' }
      : {
        left: place.left,
        top: place.top,
        ['--nib-at' as string]: `${String(place.nibAt)}px`,
        ['--enter-x' as string]: sat === 'right' ? '-6px' : '6px',
      }
  return { ref, style, nib, fixed: !!anchor }
}
