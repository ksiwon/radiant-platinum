// 가방 — 주머니 8개, 좌우로 넘긴다.
//
// 주머니마다 나열 순서가 다르다. 나무열매와 기술머신은 번호순, 나머지는 주운
// 순서다 (`engine/bag/bag.ts`). 그 차이가 여기서 눈에 보이므로 정렬을 다시
// 하지 않고 저장된 순서를 그대로 그린다.
//
// 아이콘은 468칸짜리 아틀라스 한 장을 배경 위치로 잘라 쓴다. 파일 468개를
// 받는 것보다 훨씬 싸고, 스크롤할 때 새로 뜨는 칸이 없다.
import { useEffect, useState } from 'react'
import {
  loadItemDescriptions, loadItemIcons, loadItemNames, loadItems,
  type ItemTable,
} from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import { POCKET_SIZE } from '../../engine/bag/bag'
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import type { ItemIcons } from '../../data/schema'
import { clampCursor, useMenuKeys, wrapCursor } from './useMenuKeys'
import * as css from './menuChrome.css'

const ATLAS = `${import.meta.env.BASE_URL}data/itemIcons.png`

interface Loaded {
  items: ItemTable
  names: string[]
  descriptions: string[]
  icons: ItemIcons
  pockets: string[]
}

export function BagScreen() {
  const [data, setData] = useState<Loaded | null>(null)
  const [pocket, setPocket] = useState(0)
  const [cursor, setCursor] = useState(0)
  const back = useMenuStore((s) => s.back)
  const bag = useSaveStore((s) => s.bag)
  const money = useSaveStore((s) => s.money)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadItems(), loadItemNames('ko'), loadItemDescriptions('ko'),
      loadItemIcons(), loadUiText('bagPockets'),
    ])
      .then(([items, names, descriptions, icons, pockets]) => {
        if (alive) setData({ items, names, descriptions, icons, pockets })
      })
      .catch(() => { /* 빈 가방으로 뜬다 */ })
    return () => { alive = false }
  }, [])

  const slots = bag[pocket] ?? []
  const at = Math.min(cursor, Math.max(0, slots.length - 1))
  const selected = slots[at]

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, slots.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, slots.length)) },
    left: () => { setPocket((p) => wrapCursor(p, -1, POCKET_SIZE.length)); setCursor(0) },
    right: () => { setPocket((p) => wrapCursor(p, 1, POCKET_SIZE.length)); setCursor(0) },
    cancel: back,
  })

  const iconStyle = (id: number): React.CSSProperties | undefined => {
    if (!data) return undefined
    const { size, cols } = data.icons
    return {
      backgroundImage: `url(${ATLAS})`,
      backgroundPosition: `-${String((id % cols) * size)}px -${String(Math.floor(id / cols) * size)}px`,
    }
  }

  return (
    <div className={css.overlay}>
      <div className={css.head}>
        <span className={css.crest}><span className={css.crestText}>가방</span></span>
        <span className={css.headNote}>{money.toLocaleString('ko-KR')}원</span>
      </div>

      <div className={css.tabs}>
        {(data?.pockets ?? []).map((name, i) => (
          <span key={name} className={i === pocket ? css.tab.on : css.tab.off}><span>{name}</span></span>
        ))}
      </div>

      <div className={css.stage}>
        <div className={css.list}>
          {slots.length === 0 && <div className={css.empty}>아무것도 없다</div>}
          {slots.map((slot, i) => (
            <div key={slot.item} className={i === at ? css.rowOn : css.row}
              onPointerEnter={() => { setCursor(i) }}>
              {i === at && <span className={css.caret} aria-hidden />}
              <span className={css.face}>
                <span className={css.icon} style={iconStyle(slot.item)} aria-hidden />
                <span className={css.label}>{data?.names[slot.item] ?? ''}</span>
                {/* 중요한 물건은 개수를 안 붙인다 — 원작도 한 개뿐이라 안 센다 */}
                {data?.items.get(slot.item).preventToss === 1
                  ? null
                  : <span className={css.count}>×{slot.count}</span>}
              </span>
            </div>
          ))}
        </div>

        <div className={css.detail}>
          {selected && (
            <>
              <div className={css.detailTitle}>
                {data?.names[selected.item] ?? ''}
                <span className={css.detailSub}>{data?.pockets[pocket] ?? ''}</span>
              </div>
              <div className={css.detailText}>{data?.descriptions[selected.item] ?? ''}</div>
            </>
          )}
        </div>
      </div>

      <div className={css.foot}>
        ←→ 주머니 · ↑↓ 고르기 · X 닫기 · {slots.length}/{POCKET_SIZE[pocket] ?? 0}칸
      </div>
    </div>
  )
}
