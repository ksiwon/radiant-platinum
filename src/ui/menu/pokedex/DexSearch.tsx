// 검색 시트 (pokedex.md §4.3) — 목록 칸 위에 겹치는 같은 창 재질의 시트다. 목록은 뒤에 흐리게 남고 왼쪽 도감 쪽은 그대로라
// 지금 고른 종이 계속 보인다.
//
// 줄 이름은 롬 것이다: 순서(50) · 이름(47) · 타입(48) · 형태(49). 맨 위 「도감」 줄은 원작 검색에 없는 우리 줄이다.
// 타입 두 줄은 눈으로는 한 줄에 값 둘로 묶는다 — 커서 자리는 여섯 그대로다(앞 값 · 뒤 값에 금 띠가 선다).
// 형태는 글이 아니라 **원작 실루엣 그림**(`dexShapes`)이다. 안 거른 칸은 롬 「-」(53).
import { FILTER_TYPE_OF, SortOrder, type DexQuery } from '../../../engine/pokemon/dexSort'
import { pixelSprite } from '../../common/pixelSprite'
import { TypeBadge } from '../../common/TypeBadge'
import { PIXEL } from '../../theme/scale'
import * as own from '../pokedexScreen.css'
import { DEX_LINE, NAME_TEXT_FIRST, nameGroupLabel, searchHelp, sortLabel } from './dexText'
import type { DexData } from './dexData'
import { useDexWords } from './dexWords'

/** 검색 창 커서 여섯: 도감 · 순서 · 이름 · 타입 앞 · 타입 뒤 · 형태 (`SEARCH_ROWS`의 차례) */
export const SEARCH_ROW_COUNT = 6

/** 줄(커서 자리) → 그 줄이 속한 눈에 보이는 줄. 타입 두 자리가 한 줄이다 */
function visualRow(cursor: number): number {
  return cursor >= 4 ? cursor - 1 : cursor
}

function TypeValue({ at, data, on }: { at: number, data: DexData, on: boolean }) {
  const dash = data.ui[DEX_LINE.none] ?? ''
  // ⚠️ 거르기 자리와 타입 번호가 다르다 — `FILTER_TYPE_OF[타입] = 거르기 자리`라 되짚는다 (표에 ???가 없다)
  const found = at === 0 ? -1 : FILTER_TYPE_OF.indexOf(at)
  const type = found < 0 ? null : found
  return (
    <span className={on ? own.searchCellOn : own.searchCell}>
      {type === null ? dash : <TypeBadge type={type} {...(data.types[type] !== undefined ? { name: data.types[type] } : {})} />}
    </span>
  )
}

export function DexSearch(
  { cursor, query, data, national, found }: {
    cursor: number
    query: DexQuery
    data: DexData
    /** 전국도감을 받았는가 */
    national: boolean
    /** 지금 걸린 물음의 결과 수 */
    found: number
  },
) {
  const ui = data.ui
  const dash = ui[DEX_LINE.none] ?? ''
  const row = (i: number): 'on' | 'off' => (visualRow(cursor) === i ? 'on' : 'off')
  const arrows = (i: number): boolean => visualRow(cursor) === i
  const help = searchHelp(cursor, ui)
  const words = useDexWords()
  return (
    <div className={own.sheet} data-dex-search>
      <div className={own.sheetHead}>
        <span />
        <span className={own.listCount}>{ui[DEX_LINE.found] ?? ''} {found}</span>
      </div>

      <div className={own.searchRow[row(0)]}>
        <span className={own.searchLabel}>{words.dexRow}</span>
        <span className={own.searchValues}>
          {arrows(0) && <span className={own.searchArrow}>◂</span>}
          <span>{national && query.national ? words.national : words.sinnoh}</span>
          {arrows(0) && <span className={own.searchArrow}>▸</span>}
        </span>
      </div>

      <div className={own.searchRow[row(1)]}>
        <span className={own.searchLabel}>{ui[DEX_LINE.searchOrder] ?? ''}</span>
        <span className={own.searchValues}>
          {arrows(1) && <span className={own.searchArrow}>◂</span>}
          <span>{sortLabel(query.sort, ui)}</span>
          {arrows(1) && <span className={own.searchArrow}>▸</span>}
        </span>
      </div>

      <div className={own.searchRow[row(2)]}>
        <span className={own.searchLabel}>{ui[DEX_LINE.searchName] ?? ''}</span>
        <span className={own.searchValues}>
          {arrows(2) && <span className={own.searchArrow}>◂</span>}
          <span>{query.name === 0 ? dash : nameGroupLabel(ui[NAME_TEXT_FIRST + query.name - 1] ?? '')}</span>
          {arrows(2) && <span className={own.searchArrow}>▸</span>}
        </span>
      </div>

      <div className={own.searchRow[row(3)]}>
        <span className={own.searchLabel}>{ui[DEX_LINE.searchType] ?? ''}</span>
        <span className={own.searchValues}>
          {cursor === 3 && <span className={own.searchArrow}>◂</span>}
          <TypeValue at={query.type1} data={data} on={cursor === 3} />
          <TypeValue at={query.type2} data={data} on={cursor === 4} />
          {cursor === 4 && <span className={own.searchArrow}>▸</span>}
        </span>
      </div>

      <div className={own.searchRow[row(4)]}>
        <span className={own.searchLabel}>{ui[DEX_LINE.searchForm] ?? ''}</span>
        <span className={own.searchValues}>
          {arrows(4) && <span className={own.searchArrow}>◂</span>}
          {query.shape === 0 || data.shapes === null
            ? <span>{dash}</span>
            : <span className={own.shapeCell} aria-hidden style={pixelSprite(data.shapes, query.shape - 1, PIXEL.x1)} />}
          {arrows(4) && <span className={own.searchArrow}>▸</span>}
        </span>
      </div>

      {/* 고른 줄의 설명 — 롬 줄의 줄바꿈을 그대로 둔다 */}
      {help !== '' && <p className={own.searchNote}>{help}</p>}
      {/* 무게·키 순은 잡은 것만 남는다 — `keepUncaught`가 가나다순에만 켜진다 (`dexSort`). 롬에 없는 우리 문구다 */}
      {query.sort !== SortOrder.NUMERICAL && query.sort !== SortOrder.ALPHABETICAL && <p className={own.searchNote}>{words.caughtOnly}</p>}
    </div>
  )
}
