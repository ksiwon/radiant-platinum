// 금 띠 하나가 어느 줄에 앉는가 (SYSTEM §0 L5 · `theme/window.css`의 `pickBand`).
//
// 띠는 줄이 아니라 **목록 칸 안의 요소 하나**라서, 고른 줄이 바뀌면 이 `transform`만 바뀐다. 고정 목록(스크롤 없는
// 10줄 이하)만 미끄러지고 스크롤 목록은 줄이 즉시 옮겨 간다 — 키를 누르고 있을 때 띠가 뒤처지거나
// `scrollIntoView`와 겹쳐 두 번 움직이는 일을 없애려는 것이다.
import type { CSSProperties } from 'react'
import { LINE } from '../theme/scale'

/**
 * 띠를 `index`번 줄에 앉힌다. `size`는 한 줄의 높이(`axis: 'y'`)나 폭(`'x'`)이고 기본은 목록 줄 높이다.
 * 줄 높이가 다르면(`LINE.rowTall` 44) 띠의 `height`도 같이 준다 — 이 함수가 둘 다 낸다
 */
export function bandAt(axis: 'y' | 'x', index: number, size: number = LINE.row, span?: number): CSSProperties {
  const at = Math.max(0, index) * size
  return axis === 'y'
    ? { transform: `translateY(${String(at)}px)`, height: span ?? size }
    : { transform: `translateX(${String(at)}px)`, width: span ?? size }
}
