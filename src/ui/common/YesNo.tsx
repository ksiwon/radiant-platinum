// 예/아니오 (SYSTEM §2.2 `YesNo`) — 창 한 장에 두 줄과 금 띠.
//
// 리포트(`group`, 처음 칸 예) · 파티(예) · 되살리기(아니오) · 설정 처음부터(**아니오 — 계약**) · 진화 · 부화(예) ·
// 상점(예) · 팩토리 · 박스 놓아주기(아니오)가 쓴다. 처음 칸(`initial`)은 화면마다 다르다 — 하네스가 그 칸에서
// 출발한다고 가정하는 화면이 있으므로 **부르는 쪽이 늘 적는다.**
//
// ⚠️ **`group`이 참일 때만 `radiogroup`을 단다** (§2.3). 하네스의 대사 도우미가 「첫 radiogroup」을 읽을 때
// 떠 있을 수 없는 화면은 리포트뿐이다. 나머지는 역할 없이 선다.
// ⚠️ **`pointerMoved` 가드는 필수다** — 창이 마우스 밑에 뜨면 가짜 이동이 줄을 고른다 (`pointerMoved.ts`).
//
// 자리: `anchor`(원인 줄)를 주면 `ChoiceMenu`처럼 그 옆에 앉고, 안 주면 부모가 `className` · `style`로 정한다.
import { useState, type CSSProperties } from 'react'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import { pointerMoved } from '../pointerMoved'
import { pickBand } from '../theme/window.css'
import { bandAt } from './pickBand'
import type { PopSide } from './choicePlace'
import { usePopPlacement } from './usePopPlacement'
import * as css from './choiceMenu.css'

export function YesNo(
  { labels, initial, at, group = false, anchor, within, side = 'right', onPick, onCancel, className, style }: {
    /** 「예」 · 「아니오」 — 롬 글이다 (`YES_NO`) */
    labels: readonly [string, string]
    /** 처음 서는 칸. 0이 예, 1이 아니오 */
    initial: 0 | 1
    /** 커서를 화면이 쥘 때 (제어) */
    at?: 0 | 1
    group?: boolean
    /** 원인 줄. 주면 그 옆에 앉는다 */
    anchor?: HTMLElement | null
    within?: HTMLElement | null
    side?: PopSide
    onPick: (yes: boolean) => void
    /** X. 안 주면 「아니오」와 같다 (필드와 같은 손버릇) */
    onCancel?: () => void
    className?: string
    style?: CSSProperties
  },
) {
  const [own, setOwn] = useState<0 | 1>(initial)
  const cursor = at ?? own
  const step = (d: number) => (): boolean => {
    const next = clampCursor(cursor, d, 2) as 0 | 1
    if (next === cursor) return false
    setOwn(next)
    return true
  }
  useMenuKeys({
    up: step(-1),
    down: step(1),
    confirm: () => { onPick(cursor === 0) },
    cancel: () => { if (onCancel) onCancel(); else onPick(false) },
  })
  const pop = usePopPlacement(anchor, within, side, 0)
  return (
    <div
      ref={pop.ref}
      className={[css.root, pop.fixed ? css.rootFixed : '', pop.nib, className ?? ''].filter(Boolean).join(' ')}
      style={{ ...pop.style, ...style }}
      {...(group ? { role: 'radiogroup', 'aria-label': '예 아니오' } : {})}
    >
      <div className={css.list}>
        <span className={pickBand.y} aria-hidden style={bandAt('y', cursor)}>
          <span className={css.caret} />
        </span>
        {labels.map((label, i) => (
          <div
            key={i}
            className={i === cursor ? `${css.item} ${css.itemOn}` : css.item}
            {...(group ? { role: 'radio', 'aria-checked': i === cursor } : {})}
            onPointerMove={(e) => { if (pointerMoved(e)) setOwn(i as 0 | 1) }}
            onClick={() => { onPick(i === 0) }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
