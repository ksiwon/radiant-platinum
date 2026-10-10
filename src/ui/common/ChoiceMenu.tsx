// 원인 옆에 뜨는 갈래 창 (SYSTEM §2.2 `ChoiceMenu` · 4.4 · 4.24).
//
// 파티 · 가방 · 박스 · 팩토리 · 메일박스 · 상점이 쓴다. **원인(고른 줄) 옆에** 붙고, 위끝을 원인에 맞추며
// 본문 밖으로 나가면 당긴다(`placeChoice`). 물음은 이 창에 없다 — `MessageDock`으로 보낸다.
//
// 지켜야 하는 것 셋:
//   ① **`pointerMoved` 가드는 필수다.** 창이 마우스 밑에 뜨면 크로미움이 가짜 이동을 보내 그 줄을 「들어섰다」고
//      친다 — 가드를 빠뜨리면 「버린다」에서 열린다 (`pointerMoved.ts`의 실측).
//   ② **`role="radiogroup"`을 달지 않는다.** 하네스의 대사 도우미가 「첫 radiogroup」을 읽을 때 떠 있을 수 없는
//      화면에만 단다 (§2.3). 박스는 `rootProps`로 `role="menu"` · `data-box-menu`를, `itemRole`로 `menuitem`과
//      `aria-selected`를 받는다 (`_boxHeader.mjs` 계약). 안 주면 아무 역할도 안 단다.
//   ③ **열리자마자 키를 먹는다** — 하네스가 바로 친다. 입력을 막는 움직임이 없다.
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { clampCursor, useMenuKeys, wrapCursor } from '../menu/useMenuKeys'
import { pointerMoved } from '../pointerMoved'
import { LINE } from '../theme/scale'
import { pickBand } from '../theme/window.css'
import { bandAt } from './pickBand'
import type { PopSide } from './choicePlace'
import { usePopPlacement } from './usePopPlacement'
import * as css from './choiceMenu.css'

export interface ChoiceItem {
  key?: string
  label: ReactNode
  disabled?: boolean
}

export function ChoiceMenu(
  {
    items, at, initial = 0, anchor, within, side = 'right', loop = false,
    onPick, onCancel, onAt, scroll, rootProps, itemRole, enabled = true,
  }: {
    items: readonly ChoiceItem[]
    /** 커서를 화면이 쥘 때 (제어). 안 주면 이 창이 쥔다 */
    at?: number
    /** 안 쥘 때 처음 서는 줄 */
    initial?: number
    /** 원인이 된 줄. 없으면 자리를 못 잡아 위치를 부모에 맡긴다(`absolute`) */
    anchor: HTMLElement | null
    /** 넘지 말아야 하는 본문. 안 주면 화면 */
    within?: HTMLElement | null
    /** 앉고 싶은 쪽 — 자리가 없으면 뒤집는다 */
    side?: PopSide
    /** 끝에서 도는가. 갈래 창은 안 돈다 */
    loop?: boolean
    onPick: (index: number) => void
    onCancel?: () => void
    /** 커서가 바뀔 때 (마우스 포함) */
    onAt?: (index: number) => void
    /** 보이는 줄 수. 넘치면 스크롤한다 (박스 점프의 8줄 창) */
    scroll?: number
    /** 뿌리에 펼친다 — 박스가 `role="menu"` · `data-box-menu`를 준다 */
    rootProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | number | undefined>
    /** `menuitem`이면 줄에 그 역할과 `aria-selected`를 단다 */
    itemRole?: 'menuitem'
    enabled?: boolean
  },
) {
  const [own, setOwn] = useState(initial)
  const cursor = Math.min(at ?? own, Math.max(0, items.length - 1))
  const move = (i: number): void => {
    if (i === cursor) return
    setOwn(i)
    onAt?.(i)
  }
  const step = (d: number) => (): boolean => {
    const next = loop ? wrapCursor(cursor, d, items.length) : clampCursor(cursor, d, items.length)
    if (next === cursor) return false
    move(next)
    return true
  }
  useMenuKeys({
    up: step(-1),
    down: step(1),
    confirm: () => {
      if (items[cursor]?.disabled === true) return false
      onPick(cursor)
      return true
    },
    ...(onCancel ? { cancel: onCancel } : {}),
  }, enabled)

  const pop = usePopPlacement(anchor, within, side, items.length)

  // 고른 줄이 보이게 — 스크롤 창일 때만
  const rows = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    if (scroll !== undefined) rows.current[cursor]?.scrollIntoView({ block: 'nearest' })
  }, [cursor, scroll])

  const { className, style: given, ...rest } = rootProps ?? {}
  return (
    <div
      ref={pop.ref}
      className={[css.root, pop.fixed ? css.rootFixed : '', pop.nib, className ?? ''].filter(Boolean).join(' ')}
      style={{ ...pop.style, ...given }}
      {...rest}
    >
      <div
        className={scroll === undefined ? css.list : `${css.list} ${css.scrolling}`}
        style={scroll === undefined ? undefined : { maxHeight: scroll * LINE.row }}
      >
        {/* 고정 목록은 금 띠 하나가 미끄러진다. 스크롤 목록은 줄이 즉시 옮겨 간다 (§0 L5) */}
        {scroll === undefined && (
          <span className={pickBand.y} aria-hidden style={bandAt('y', cursor)}>
            <span className={css.caret} />
          </span>
        )}
        {items.map((entry, i) => (
          <div
            key={entry.key ?? i}
            ref={(node) => { rows.current[i] = node }}
            className={[
              css.item,
              i === cursor ? css.itemOn : '',
              i === cursor && scroll !== undefined ? css.itemPicked : '',
              entry.disabled === true ? css.itemOff : '',
            ].filter(Boolean).join(' ')}
            {...(itemRole !== undefined ? { role: itemRole, 'aria-selected': i === cursor } : {})}
            onPointerMove={(e) => { if (pointerMoved(e)) move(i) }}
            onClick={() => { if (entry.disabled !== true) onPick(i) }}
          >
            {i === cursor && scroll !== undefined && <span className={css.caret} aria-hidden />}
            {entry.label}
          </div>
        ))}
      </div>
    </div>
  )
}
