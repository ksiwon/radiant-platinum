// 종이 한 장 (text-screens §6 `PaperSheet`) — `paper.*` 종이 + 줄지 + 여백선 + 철한 구멍.
//
// 모험노트가 쓰던 것을 일반화했다. 메일은 편지지 그림이 안 구워졌을 때(`loadMailArt`가 `null`) 이 종이로 떨어지고,
// 낱말 고르기의 종이도 같은 바탕이다. 높이와 안쪽 여백은 쓰는 쪽이 `className`으로 준다.
import type { CSSProperties, ReactNode } from 'react'
import * as css from './paperSheet.css'

export function PaperSheet(
  { children, rings = 0, margin = true, lined = true, fill = false, marginAt, ruleTop, className, style }: {
    children: ReactNode
    /** 철한 구멍 수. 0이면 구멍이 없다 */
    rings?: number
    /** 왼쪽 빨간 여백선 */
    margin?: boolean
    lined?: boolean
    /** 내용을 종이 안쪽 전체를 기준으로 얹는다 (자리를 좌표로 주는 편지). 아니면 위에서 아래로 흐른다 */
    fill?: boolean
    /** 여백선의 가로 자리(px) */
    marginAt?: number
    /** 첫 줄지가 앉는 세로 자리(px) */
    ruleTop?: number
    className?: string
    style?: CSSProperties
  },
) {
  const own: CSSProperties = {
    ...(marginAt !== undefined ? { ['--paper-margin' as string]: `${String(marginAt)}px` } : {}),
    ...(ruleTop !== undefined ? { ['--paper-top' as string]: `${String(ruleTop)}px` } : {}),
    ...style,
  }
  return (
    <div
      className={[css.paper, lined ? css.lined : '', margin ? css.margined : '', className ?? '']
        .filter(Boolean).join(' ')}
      style={own}
    >
      {rings > 0 && (
        <div className={css.rings} aria-hidden="true">
          {Array.from({ length: rings }, (_, i) => <span key={i} className={css.ring} />)}
        </div>
      )}
      <div className={fill ? css.layerFill : css.layer}>{children}</div>
    </div>
  )
}
