// 메뉴의 기술 한 줄 (SYSTEM §2.2 `MoveLine`) — 타입 그림 · 이름 · (위력 · 명중 · PP).
//
// 요약 · 교체 · 파티 잊기 · 되살리기 · 진화 기술 창 · 팩토리 · 박스 상세가 쓴다. 9° 판(`TYPE_PLATE`)은 **배틀 명령
// 구역에만** 있고, 메뉴는 이 줄이다 (§0 · 4.9).
//
// ⚠️ **기본은 `div`다.** `button`이 되는 것은 진화 · 배틀 잊기 목록뿐이고, 그때 PP를 `n/n`으로 쓴다 — 하네스
// `forgetPick`이 「`\d+/\d+`가 든 button」을 잊을 기술 칸으로 읽는다. 다른 button에 `n/n`을 넣으면 안 된다.
// 빈 칸은 이름 자리에 「—」, 숫자 자리에 「--」다 (롬 455:153).
import { TypeBadge } from './TypeBadge'
import { accuracyText, powerText } from './MoveFacts'
import * as css from './parts.css'
import type { CSSProperties, MouseEventHandler } from 'react'

export type MoveCol = 'power' | 'acc' | 'pp'

/** 줄 하나가 그리는 기술. 이름과 타입 이름은 부르는 쪽이 푼다 (이 부품은 표를 안 읽는다) */
export interface MoveLineMove {
  id?: number
  name: string
  type: number | null
  typeName?: string
  power?: number
  accuracy?: number
}

/** 롬의 값 없음 표시 (뱅크 3의 50 · 455의 154) */
const NONE = '---'
/** 빈 칸의 숫자 자리 (455의 153) */
const EMPTY_NUM = '--'

export function MoveLine(
  { move, pp, maxPp, cols = [], empty = false, as = 'div', onClick, dataMoveId }: {
    move: MoveLineMove | null
    pp?: number
    maxPp?: number
    cols?: readonly MoveCol[]
    /** 기술이 없는 칸 — 이름 「—」, 숫자 「--」 */
    empty?: boolean
    as?: 'div' | 'button'
    onClick?: MouseEventHandler<HTMLElement>
    /** `data-move-id` — 하네스가 이름 글자 대신 읽는다 */
    dataMoveId?: number
  },
) {
  const blank = empty || move === null
  const cell = (col: MoveCol): string => {
    if (blank) return EMPTY_NUM
    switch (col) {
      case 'power': return powerText(move.power ?? 0) ?? NONE
      case 'acc': return accuracyText(move.accuracy ?? 0) ?? NONE
      case 'pp': return pp === undefined || maxPp === undefined ? EMPTY_NUM : `${String(pp)}/${String(maxPp)}`
    }
  }
  const body = (
    <>
      <span className={css.moveName}>
        {!blank && <TypeBadge type={move.type} {...(move.typeName !== undefined ? { name: move.typeName } : {})} />}
        <span className={blank ? `${css.moveNameText} ${css.moveEmpty}` : css.moveNameText}>
          {blank ? '—' : move.name}
        </span>
      </span>
      {cols.map((col) => <span key={col} className={css.moveNum}>{cell(col)}</span>)}
    </>
  )
  const style = { '--cols': Math.max(1, cols.length) } as CSSProperties
  const id = dataMoveId ?? (blank ? undefined : move.id)
  if (as === 'button') {
    return (
      <button type="button" className={css.moveLine} style={style} data-move-id={id} onClick={onClick}>
        {body}
      </button>
    )
  }
  return <div className={css.moveLine} style={style} data-move-id={id} onClick={onClick}>{body}</div>
}
