// 상점 — 산다·판다.
//
// 재고는 우리가 고르지 않는다. 스크립트가 `PokeMartCommon`을 부르면 그 자리의
// 뱃지 수가 목록을 정하고, `PokeMartSpecialties`면 상점 번호가 정한다
// (`engine/bag/mart.ts`). 값도 아이템 자료의 `price`를 그대로 쓴다.
//
// 파는 값은 **사는 값의 절반**이다 (`Item_SellPrice`: price / 2).
import { useEffect, useState } from 'react'
import {
  loadItemDescriptions, loadItemIcons, loadItemNames, loadItems, type ItemTable,
} from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import type { ItemIcons } from '../../data/schema'
import { POCKET_SIZE } from '../../engine/bag/bag'
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import * as css from './menuChrome.css'
import * as own from './dialog.css'

const ATLAS = `${import.meta.env.BASE_URL}data/itemIcons.png`

/** `Item_SellPrice` — 사는 값의 절반으로 쳐 준다 */
export const sellPrice = (price: number): number => Math.floor(price / 2)

interface Loaded {
  items: ItemTable
  names: string[]
  descriptions: string[]
  icons: ItemIcons
  bag: string[]
}

type Tab = 'buy' | 'sell'

export function ShopScreen() {
  const [data, setData] = useState<Loaded | null>(null)
  const [tab, setTab] = useState<Tab>('buy')
  const [cursor, setCursor] = useState(0)
  /** 몇 개 살지. 0이면 아직 고르는 중이다 */
  const [count, setCount] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const closeAll = useMenuStore((s) => s.closeAll)
  const stock = useMenuStore((s) => s.shopStock)
  const money = useSaveStore((s) => s.money)
  const bag = useSaveStore((s) => s.bag)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadItems(), loadItemNames('ko'), loadItemDescriptions('ko'),
      loadItemIcons(), loadUiText('bag'),
    ])
      .then(([items, names, descriptions, icons, bagText]) => {
        if (alive) setData({ items, names, descriptions, icons, bag: bagText })
      })
      .catch(() => { /* 글을 못 받으면 빈 상점이 뜬다 */ })
    return () => { alive = false }
  }, [])

  /** 팔 수 있는 것 — 주머니를 통째로 편다. 중요한 물건은 못 판다 */
  const sellable = bag.flatMap((slots, pocket) =>
    slots.map((slot) => ({ ...slot, pocket })),
  ).filter((slot) => data?.items.get(slot.item).preventToss !== 1)

  const rows: { item: number; price: number; have: number }[] = tab === 'buy'
    ? stock.map((item) => ({
      item,
      price: data?.items.get(item).price ?? 0,
      have: bag.flat().find((s) => s.item === item)?.count ?? 0,
    }))
    : sellable.map((slot) => ({
      item: slot.item,
      price: sellPrice(data?.items.get(slot.item).price ?? 0),
      have: slot.count,
    }))

  const at = Math.min(cursor, Math.max(0, rows.length - 1))
  const row = rows[at]
  const unit = row?.price ?? 0
  /** 살 수 있는 최대 개수. 돈과 칸이 둘 다 막는다 */
  const max = row === undefined ? 0
    : tab === 'sell' ? row.have
      : Math.max(0, Math.min(99, unit > 0 ? Math.floor(money / unit) : 99))

  const reset = (): void => { setCount(0); setNote(null) }

  const settle = (): void => {
    if (!row || count <= 0) return
    const save = useSaveStore.getState()
    const pocket = data?.items.get(row.item).pocket ?? 0
    if (tab === 'buy') {
      if (!save.spendMoney(unit * count)) { setNote('돈이 모자랍니다'); return }
      if (!save.addItem(pocket, row.item, count)) {
        // 칸이 없으면 돈을 되돌린다. 안 그러면 돈만 사라진다
        save.addMoney(unit * count)
        setNote('가방이 가득 찼습니다')
        return
      }
      setNote(`${data?.names[row.item] ?? ''} ${count}개를 샀다`)
    } else {
      if (!save.removeItem(pocket, row.item, count)) { setNote('팔 수 없습니다'); return }
      save.addMoney(unit * count)
      setNote(`${unit * count}원을 받았다`)
    }
    setCount(0)
    setCursor(0)
  }

  useMenuKeys({
    up: () => { if (count > 0) setCount((c) => Math.min(max, c + 1)); else setCursor((c) => clampCursor(c, -1, rows.length)) },
    down: () => { if (count > 0) setCount((c) => Math.max(1, c - 1)); else setCursor((c) => clampCursor(c, 1, rows.length)) },
    left: () => { if (count === 0) { setTab((t) => (t === 'buy' ? 'sell' : 'buy')); setCursor(0); reset() } },
    right: () => { if (count === 0) { setTab((t) => (t === 'buy' ? 'sell' : 'buy')); setCursor(0); reset() } },
    confirm: () => {
      if (count > 0) { settle(); return }
      if (max > 0) { setCount(1); setNote(null) }
    },
    cancel: () => { if (count > 0) reset(); else closeAll() },
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
        <span>{tab === 'buy' ? '산다' : '판다'}</span>
        <span className={css.headNote}>{data?.bag[78] ?? '용돈'} {money.toLocaleString('ko-KR')}원</span>
      </div>

      <div className={css.tabs}>
        <span className={tab === 'buy' ? css.tab.on : css.tab.off}><span>산다</span></span>
        <span className={tab === 'sell' ? css.tab.on : css.tab.off}><span>판다</span></span>
      </div>

      <div className={css.stage}>
        <div className={css.list}>
          {rows.length === 0 && <div className={css.empty}>아무것도 없다</div>}
          {rows.map((r, i) => (
            <div key={`${r.item}-${String(i)}`} className={i === at ? css.rowOn : css.row}>
              {i === at && <span className={css.caret} aria-hidden />}
              <span className={css.face}>
                <span className={css.icon} style={iconStyle(r.item)} aria-hidden />
                <span className={css.label}>{data?.names[r.item] ?? ''}</span>
                <span className={css.count}>
                  {r.have > 0 && <span style={{ opacity: 0.6, marginRight: 10 }}>×{r.have}</span>}
                  {r.price.toLocaleString('ko-KR')}원
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className={css.detail}>
          {row && (
            <>
              <div className={css.detailTitle}>{data?.names[row.item] ?? ''}</div>
              <div className={css.detailText}>{data?.descriptions[row.item] ?? ''}</div>
            </>
          )}
          {count > 0 && row && (
            <div className={own.prompt}>
              {data?.names[row.item]} {count}개
              <br />
              {(unit * count).toLocaleString('ko-KR')}원
            </div>
          )}
          {note !== null && <div className={own.help}>{note}</div>}
        </div>
      </div>

      <div className={css.foot}>
        {count > 0
          ? `↑↓ 개수 (최대 ${String(max)}) · Z 결정 · X 그만둔다`
          : `←→ 산다/판다 · ↑↓ 고르기 · Z 결정 · X 나간다 · ${String(rows.length)}종`}
      </div>
    </div>
  )
}

/** 가방 칸 수 상한. 상점이 "가득 찼습니다"를 낼 자리를 아는 데 쓴다 */
export const POCKET_LIMIT = POCKET_SIZE
