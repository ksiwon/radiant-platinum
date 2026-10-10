// 목록 칸 (pokedex.md §4.1·4.4). 줄은 **전부 DOM에 세운다** — 가상 스크롤로 바꾸지 않는다 (`[data-dex-rows]`가 `dexList()`의
// 길이와 같아야 하는 구조 판정이 이것에 기댄다, `tools/e2e/run.mjs`).
//
//   안 본 칸   번호(흐림) · 아이콘 없음 · 「-----」(롬 99)
//   본 종      번호 · 아이콘 · 이름
//   잡은 종    + 오른쪽 끝 몬스터볼
//   커서 줄    금 띠(`rowOn`)가 즉시 옮겨 간다 — 스크롤 목록이라 미끄러지지 않는다 (§0 L5)
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { DexEntry } from '../../../engine/pokemon/dexSort'
import { iconSlot } from '../../../engine/pokemon/form'
import { ScrollKnob, scrollList } from '../../common/ScrollKnob'
import { PIXEL } from '../../theme/scale'
import { LINE } from '../../theme/scale'
import { pokeIconAt } from '../pokeIcon'
import * as css from '../menuChrome.css'
import * as own from '../pokedexScreen.css'
import { scrollIntoView } from '../useMenuKeys'
import { DEX_LINE } from './dexText'
import type { DexData } from './dexData'

/** 스크롤 칸에서 맨 위 줄 번호와 한 번에 보이는 줄 수를 읽는다 */
function useScrollWindow(ref: RefObject<HTMLElement | null>): { top: number, visible: number } {
  const [win, setWin] = useState({ top: 0, visible: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = (): void => {
      const top = Math.round(el.scrollTop / LINE.row)
      const visible = Math.floor(el.clientHeight / LINE.row)
      setWin((w) => (w.top === top && w.visible === visible ? w : { top, visible }))
    }
    read()
    el.addEventListener('scroll', read, { passive: true })
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    watch?.observe(el)
    return () => { el.removeEventListener('scroll', read); watch?.disconnect() }
  }, [ref])
  return win
}

/** 목록에 찍는 번호 — 신오도감이면 그 종의 신오 번호, 전국도감이면 종족 번호다. 정렬·거르기를 걸어도 **번호는 그 종의 것**이다 */
export function dexNumber(data: DexData | null, national: boolean, species: number, row: number): number {
  if (species === 0) return row + 1
  if (national) return species
  return data?.species.sinnohOf[species] ?? row + 1
}

export function DexList(
  { order, at, data, national, caught, onPick }: {
    order: readonly DexEntry[]
    at: number
    data: DexData | null
    /** 지금 보는 도감이 전국인가 (번호를 가른다) */
    national: boolean
    caught: (species: number) => boolean
    onPick: (row: number) => void
  },
) {
  const box = useRef<HTMLDivElement>(null)
  const { top, visible } = useScrollWindow(box)
  const blank = data?.ui[DEX_LINE.blank] ?? ''
  return (
    <div className={own.listBox}>
      <div ref={box} className={`${scrollList} ${own.listScroll}`} data-dex-rows={order.length}>
        {order.map((e, i) => {
          const known = !e.blank
          const on = i === at
          return (
            <div
              // 안 본 칸은 번호가 같을 수 없지만(칸마다 한 종) 정렬을 걸면 같은 종이 다시 올 수 있어 줄 번호도 섞는다
              key={`${String(e.species)}/${String(i)}`}
              className={on ? css.rowOn : known ? css.row : css.rowDim}
              data-on={on ? 'yes' : 'no'}
              data-species={known ? e.species : undefined}
              ref={on ? scrollIntoView : undefined}
              onClick={() => { onPick(i) }}
            >
              {on && <span className={css.caret} aria-hidden />}
              <span className={css.face}>
                <span className={own.rowNo}>{String(dexNumber(data, national, e.species, i)).padStart(3, '0')}</span>
                <span
                  className={own.rowIcon}
                  aria-hidden
                  style={known && data ? pokeIconAt(data.icons ?? undefined, iconSlot(e.species, 0, false), PIXEL.x1) : undefined}
                />
                <span className={css.label}>{known ? data?.names[e.species] ?? '' : blank}</span>
                {known && caught(e.species) && <span className={own.ballMark} data-caught aria-hidden />}
              </span>
            </div>
          )
        })}
      </div>
      <span className={own.knobWrap}>
        <ScrollKnob at={top} visible={visible} total={order.length} />
      </span>
    </div>
  )
}
