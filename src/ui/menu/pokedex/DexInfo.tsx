// ① 설명 쪽 (pokedex.md §4.2).
//
// 본 종이면 그림(3D)과 이름이 서고, 분류 · 키 · 몸무게는 롬의 0번 글(「?????포켓몬」 · 「???.?m」 · 「???.?kg」)이다 —
// 원작은 잡지 않았으면 0번 종의 글을 찍는다 (`infomain.c:416-418` · `:748-750`). 타입 둘과 설명문은 **잡은 종만** 열리고,
// 안 열린 자리에는 글을 안 넣는다(원작도 비워 둔다). 안 본 칸은 「?」와 「-----」다.
import { POKEDEX_TEXT } from '../../../data/uiText'
import { MonViewport } from '../../common/MonViewport'
import { TypeBadge } from '../../common/TypeBadge'
import * as own from '../pokedexScreen.css'
import { dexNumber } from './DexList'
import { DEX_LINE } from './dexText'
import type { DexData } from './dexData'

/** 구멍의 한 변 */
export const INFO_SIZE = 240

export function DexInfo(
  { data, species, row, national, seen, caught, form = 0 }: {
    data: DexData
    /** 종족 번호. 안 본 칸이면 0 */
    species: number
    /** 목록 줄 번호 (안 본 칸의 번호를 찍는다) */
    row: number
    national: boolean
    seen: boolean
    caught: boolean
    form?: number
  },
) {
  const ui = data.ui
  const info = data.species.byId.get(species)
  const [t1, t2] = info?.types ?? [0, 0]
  const no = String(dexNumber(data, national, species, row)).padStart(3, '0')
  return (
    <>
      <div className={own.infoTop}>
        <div className={own.stage} style={{ width: INFO_SIZE, height: INFO_SIZE }}>
          <MonViewport species={seen ? species : null} form={form} size={INFO_SIZE} />
        </div>
        <div className={own.card}>
          <span className={own.number}>No.{no}</span>
          <div className={own.name}>{seen ? data.names[species] ?? '' : ui[DEX_LINE.blank] ?? ''}</div>
          {seen && <div className={own.category}>{(caught ? data.category[species] : data.category[0]) ?? ''}</div>}
          <div className={own.types}>
            {caught && info && (
              <>
                <TypeBadge type={t1} {...(data.types[t1] !== undefined ? { name: data.types[t1] } : {})} />
                {t2 !== t1 && <TypeBadge type={t2} {...(data.types[t2] !== undefined ? { name: data.types[t2] } : {})} />}
              </>
            )}
          </div>
          {seen && (
            <div className={own.measures}>
              <div className={own.measure}>
                <span className={own.measureLabel}>{ui[POKEDEX_TEXT.height] ?? ''}</span>
                <span className={own.measureValue}>{((caught ? data.heights[species] : data.heights[0]) ?? '').trim()}</span>
              </div>
              <div className={own.measure}>
                <span className={own.measureLabel}>{ui[POKEDEX_TEXT.weight] ?? ''}</span>
                <span className={own.measureValue}>{((caught ? data.weights[species] : data.weights[0]) ?? '').trim()}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={own.entry}>{caught ? data.entries[species] ?? '' : ''}</div>
    </>
  )
}
