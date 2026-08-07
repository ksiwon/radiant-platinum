// 가방 — 주머니 8개, 좌우로 넘긴다.
//
// 주머니마다 나열 순서가 다르다. 나무열매와 기술머신은 번호순, 나머지는 주운
// 순서다 (`engine/bag/bag.ts`). 그 차이가 여기서 눈에 보이므로 정렬을 다시
// 하지 않고 저장된 순서를 그대로 그린다.
//
// ⚠️ 설명칸에 **아이콘을 크게** 세운다. 목록의 28픽셀짜리로는 무엇을 고르고
// 있는지가 안 보인다 — 원작도 위 화면에 고른 물건을 크게 띄운다.
import { useEffect, useState } from 'react'
import {
  loadItemDescriptions, loadItemIcons, loadItemNames, loadItems,
  type ItemTable,
} from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import { POCKET_SIZE } from '../../engine/bag/bag'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import type { ItemIcons } from '../../data/schema'
import { clampCursor, useMenuKeys, wrapCursor } from './useMenuKeys'
import { itemIcon } from './itemIcon'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './bagScreen.css'

/** 목록의 아이콘. 줄 높이(32)를 넘지 않는다 */
const LIST_ICON = 28
/** 설명칸의 아이콘. 이 화면에서 제일 큰 그림이어야 한다 */
const BIG_ICON = 96

interface Loaded {
  items: ItemTable
  names: string[]
  descriptions: string[]
  icons: ItemIcons
  pockets: string[]
}

export function BagScreen() {
  const [data, setData] = useState<Loaded | null>(null)
  // 설정의 언어. 바뀌면 이름과 설명을 그 언어로 다시 받는다
  const locale = useGameLocale()
  const [pocket, setPocket] = useState(0)
  const [cursor, setCursor] = useState(0)
  const back = useMenuStore((s) => s.back)
  const bag = useSaveStore((s) => s.bag)
  const money = useSaveStore((s) => s.money)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadItems(), loadItemNames(locale), loadItemDescriptions(locale),
      loadItemIcons(), loadUiText('bagPockets', locale),
    ])
      .then(([items, names, descriptions, icons, pockets]) => {
        if (alive) setData({ items, names, descriptions, icons, pockets })
      })
      .catch(() => { /* 빈 가방으로 뜬다 */ })
    return () => { alive = false }
  }, [locale])

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

  return (
    <MenuScreen
      title="가방"
      note={`${money.toLocaleString('ko-KR')}원`}
      foot={`←→ 주머니 · ↑↓ 고르기 · X 닫기 · ${String(slots.length)}/${String(POCKET_SIZE[pocket] ?? 0)}칸`}
    >
      <div className={css.tabs}>
        {(data?.pockets ?? []).map((name, i) => (
          <span
            key={name}
            className={i === pocket ? css.tab.on : css.tab.off}
            onPointerDown={() => { setPocket(i); setCursor(0) }}
          >
            {name}
          </span>
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
                <span className={css.icon} style={itemIcon(data?.icons, slot.item, LIST_ICON)} aria-hidden />
                <span className={css.label}>{data?.names[slot.item] ?? ''}</span>
                {/* 중요한 물건은 개수를 안 붙인다 — 원작도 한 개뿐이라 안 센다 */}
                {data?.items.get(slot.item).preventToss === 1
                  ? null
                  : <span className={css.countNear}>×{slot.count}</span>}
              </span>
            </div>
          ))}
        </div>

        <div className={css.detail}>
          {selected && (
            <>
              <div className={own.hero}>
                <span
                  className={own.heroIcon}
                  style={itemIcon(data?.icons, selected.item, BIG_ICON)}
                  aria-hidden
                />
                <span className={own.heroText}>
                  <span className={own.heroName}>{data?.names[selected.item] ?? ''}</span>
                  <span className={own.heroSub}>
                    {data?.pockets[pocket] ?? ''}
                    {data?.items.get(selected.item).preventToss === 1 ? '' : ` · ${String(selected.count)}개`}
                  </span>
                </span>
              </div>
              <div className={css.detailText}>{data?.descriptions[selected.item] ?? ''}</div>
            </>
          )}
        </div>
      </div>
    </MenuScreen>
  )
}
