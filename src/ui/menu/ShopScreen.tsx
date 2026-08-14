// 상점 — 산다·판다.
//
// 재고는 우리가 고르지 않는다. 스크립트가 `PokeMartCommon`을 부르면 그 자리의
// 뱃지 수가 목록을 정하고, `PokeMartSpecialties`면 상점 번호가 정한다
// (`engine/bag/mart.ts`). 값도 아이템 자료의 `price`를 그대로 쓴다.
//
// 파는 값은 **사는 값의 절반**이다 (`Item_SellPrice`: price / 2).
import { useEffect, useRef, useState } from 'react'
import {
  loadItemDescriptions, loadItemIcons, loadItemNames, loadItems, type ItemTable,
} from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import type { ItemIcons } from '../../data/schema'
import { POCKET_SIZE } from '../../engine/bag/bag'
import { useMenuStore } from '../../state/menuStore'
import { addBattlePoints, bpPriceOf, spendBattlePoints } from '../../engine/bag/frontierMart'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { world } from '../../engine/map/world'
import { journalShopped } from '../../scene/journal'
import { clampCursor, scrollIntoView, useMenuKeys } from './useMenuKeys'
import { itemIcon } from './itemIcon'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as hero from './bagScreen.css'
import * as own from './dialog.css'

/** 가방과 같은 크기를 쓴다 — 같은 물건이 화면마다 다른 크기면 안 된다 */
const LIST_ICON = 28
const BIG_ICON = 96

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
  // 설정의 언어. 바뀌면 이름과 설명을 그 언어로 다시 받는다
  const locale = useGameLocale()
  const [tab, setTab] = useState<Tab>('buy')
  // 노트가 「많이 샀다」를 가르는 데 쓰는 횟수. 상점을 나갈 때 한 번 읽는다
  const bought = useRef(0)
  const sold = useRef(0)
  const [cursor, setCursor] = useState(0)
  /** 몇 개 살지. 0이면 아직 고르는 중이다 */
  const [count, setCount] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const closeAll = useMenuStore((s) => s.closeAll)
  const stock = useMenuStore((s) => s.shopStock)
  const money = useSaveStore((s) => s.money)
  const bag = useSaveStore((s) => s.bag)
  /**
   * 배틀프런티어 교환 코너인가 (PARITY §12.3).
   *
   * ⚠️ **원작은 이 가게에 「판다」가 없다** — 갈래가 「산다·그만둔다」 둘뿐이다
   * (`shop_menu.c`의 `maxOptions = 2`). BP는 되팔 수 없다
   */
  const isBP = useMenuStore((s) => s.shopCurrency) === 'bp'
  const battlePoints = useSaveStore((s) => s.battlePoints)
  const purse = isBP ? battlePoints : money
  const priceOf = (item: number): number =>
    isBP ? bpPriceOf(item) : data?.items.get(item).price ?? 0
  const amount = (value: number): string =>
    isBP ? `${String(value)} BP` : `${value.toLocaleString('ko-KR')}원`

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadItems(), loadItemNames(locale), loadItemDescriptions(locale),
      loadItemIcons(), loadUiText('bag', locale),
    ])
      .then(([items, names, descriptions, icons, bagText]) => {
        if (alive) setData({ items, names, descriptions, icons, bag: bagText })
      })
      .catch(() => { /* 글을 못 받으면 빈 상점이 뜬다 */ })
    return () => { alive = false }
  }, [locale])

  /** 팔 수 있는 것 — 주머니를 통째로 편다. 중요한 물건은 못 판다 */
  const sellable = bag.flatMap((slots, pocket) =>
    slots.map((slot) => ({ ...slot, pocket })),
  ).filter((slot) => data?.items.get(slot.item).preventToss !== 1)

  const rows: { item: number; price: number; have: number }[] = tab === 'buy'
    ? stock.map((item) => ({
      item,
      price: priceOf(item),
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
      : Math.max(0, Math.min(99, unit > 0 ? Math.floor(purse / unit) : 99))

  const reset = (): void => { setCount(0); setNote(null) }

  const settle = (): void => {
    if (!row || count <= 0) return
    const save = useSaveStore.getState()
    const pocket = data?.items.get(row.item).pocket ?? 0
    if (tab === 'buy') {
      const cost = unit * count
      if (isBP) {
        if (battlePoints < cost) { setNote('BP가 모자랍니다'); return }
        useSaveStore.setState((st) => ({ battlePoints: spendBattlePoints(st.battlePoints, cost) }))
      } else if (!save.spendMoney(cost)) { setNote('돈이 모자랍니다'); return }
      if (!save.addItem(pocket, row.item, count)) {
        // 칸이 없으면 값을 되돌린다. 안 그러면 낸 것만 사라진다
        if (isBP) {
          useSaveStore.setState((st) => ({ battlePoints: addBattlePoints(st.battlePoints, cost) }))
        } else save.addMoney(cost)
        setNote('가방이 가득 찼습니다')
        return
      }
      bought.current++
      setNote(`${data?.names[row.item] ?? ''} ${count}개를 샀다`)
    } else {
      if (!save.removeItem(pocket, row.item, count)) { setNote('팔 수 없습니다'); return }
      save.addMoney(unit * count)
      sold.current++
      setNote(`${amount(unit * count)}을 받았다`)
    }
    setCount(0)
    setCursor(0)
  }

  useMenuKeys({
    up: () => { if (count > 0) setCount((c) => Math.min(max, c + 1)); else setCursor((c) => clampCursor(c, -1, rows.length)) },
    down: () => { if (count > 0) setCount((c) => Math.max(1, c - 1)); else setCursor((c) => clampCursor(c, 1, rows.length)) },
    // BP 가게에는 「판다」가 없다 — 갈래를 안 바꾼다
    left: () => { if (count === 0 && !isBP) { setTab((t) => (t === 'buy' ? 'sell' : 'buy')); setCursor(0); reset() } },
    right: () => { if (count === 0 && !isBP) { setTab((t) => (t === 'buy' ? 'sell' : 'buy')); setCursor(0); reset() } },
    confirm: () => {
      if (count > 0) { settle(); return }
      if (max > 0) { setCount(1); setNote(null) }
    },
    cancel: () => {
      if (count > 0) { reset(); return }
      // 상점을 나갈 때 노트에 한 줄 (PARITY §7.4). ⚠️ **횟수로 가른다** —
      // 두 번 이상 샀으면 「많이 샀다」다
      journalShopped(world.mapId, bought.current, sold.current)
      closeAll()
    },
  })

  return (
    <MenuScreen
      title={tab === 'buy' ? '산다' : '판다'}
      note={isBP ? `BP ${String(battlePoints)}` : `${data?.bag[78] ?? '용돈'} ${amount(money)}`}
      foot={count > 0
        ? `↑↓ 개수 (최대 ${String(max)}) · Z 결정 · X 그만둔다`
        : isBP
          ? `↑↓ 고르기 · Z 결정 · X 나간다 · ${String(rows.length)}종`
          : `←→ 산다/판다 · ↑↓ 고르기 · Z 결정 · X 나간다 · ${String(rows.length)}종`}
    >
      {!isBP && (
        <div className={css.tabs}>
          <span className={tab === 'buy' ? css.tab.on : css.tab.off}>산다</span>
          <span className={tab === 'sell' ? css.tab.on : css.tab.off}>판다</span>
        </div>
      )}

      <div className={css.stage}>
        <div className={css.list}>
          {rows.length === 0 && <div className={css.empty}>아무것도 없다</div>}
          {rows.map((r, i) => (
            <div
              key={`${r.item}-${String(i)}`}
              className={i === at ? css.rowOn : css.row}
              ref={i === at ? scrollIntoView : undefined}
            >
              {i === at && <span className={css.caret} aria-hidden />}
              <span className={css.face}>
                <span className={css.icon} style={itemIcon(data?.icons, r.item, LIST_ICON)} aria-hidden />
                <span className={css.label}>{data?.names[r.item] ?? ''}</span>
                <span className={css.count}>
                  {r.have > 0 && <span style={{ opacity: 0.6, marginRight: 10 }}>×{r.have}</span>}
                  {amount(r.price)}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className={css.detail}>
          {row && (
            <>
              <div className={hero.hero}>
                <span className={hero.heroIcon} style={itemIcon(data?.icons, row.item, BIG_ICON)} aria-hidden />
                <span className={hero.heroText}>
                  <span className={hero.heroName}>{data?.names[row.item] ?? ''}</span>
                  <span className={hero.heroSub}>{amount(unit)}</span>
                </span>
              </div>
              <div className={css.detailText}>{data?.descriptions[row.item] ?? ''}</div>
            </>
          )}
          {count > 0 && row && (
            <div className={own.prompt}>
              {data?.names[row.item]} {count}개
              <br />
              {amount(unit * count)}
            </div>
          )}
          {note !== null && <div className={own.help}>{note}</div>}
        </div>
      </div>
    </MenuScreen>
  )
}

/** 가방 칸 수 상한. 상점이 "가득 찼습니다"를 낼 자리를 아는 데 쓴다 */
export const POCKET_LIMIT = POCKET_SIZE
