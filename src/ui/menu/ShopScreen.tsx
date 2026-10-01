// 상점 — 산다·판다.
//
// 재고는 우리가 고르지 않는다. 스크립트가 `PokeMartCommon`을 부르면 그 자리의
// 뱃지 수가 목록을 정하고, `PokeMartSpecialties`면 상점 번호가 정한다
// (`engine/bag/mart.ts`). 값도 아이템 자료의 `price`를 그대로 쓴다.
//
// 파는 값은 **사는 값의 절반**이다 (`Item_SellPrice`: price / 2).
//
// 몬스터볼을 한 번에 열 개 이상 사면 프레미어볼 하나가 덤으로 온다 (`Shop_FinishPurchase`).
import { useEffect, useRef, useState } from 'react'
import {
  loadItemDescriptions, loadItemIcons, loadItemNames, loadItems, type ItemTable,
} from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import { ITEM_TABLE } from '../../import/platinum/itemTable'
import { addRecord } from '../../engine/world/gameRecords'
import { fieldScripts } from '../../engine/script/field'
import type { ItemIcons } from '../../data/schema'
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
import * as own from './dialog.css'

/** 가방과 같은 크기를 쓴다 — 같은 물건이 화면마다 다른 크기면 안 된다 */
const LIST_ICON = 28
const BIG_ICON = 96

/** `Item_SellPrice` — 사는 값의 절반으로 쳐 준다 */
const sellPrice = (price: number): number => Math.floor(price / 2)

/** 열거형 이름으로 번호를 찾는다. 번호를 손으로 적으면 표와 어긋날 자리가 생긴다 */
const itemId = (constant: string): number => ITEM_TABLE.findIndex(([name]) => name === constant)
const ITEM_POKE_BALL = itemId('ITEM_POKE_BALL')
const ITEM_PREMIER_BALL = itemId('ITEM_PREMIER_BALL')

/** 몬스터볼을 한 번에 이만큼 사면 덤이 온다 (`itemAmount >= 10`) */
const PREMIER_MIN_BALLS = 10

/** `pl_msg_00000543_00010` — 「프레미어볼 1개를 서비스로 드리겠습니다!」 */
const SHOP_TEXT_PREMIER = 10

/**
 * `SEQ_SE_DP_REGI` — 계산대 소리. 산 것이 정해진 순간 한 번 운다 (`shop_menu.c:1196`).
 *
 * 번호는 `generated/sdat.txt`의 닻 `SEQ_SE_PL_W012 = 1350`에서 254줄 아래다
 * (`engine/audio/sfx.ts` 머리말의 셈법)
 */
const SE_REGI = 1604

/**
 * 게임 기록 칸 (`generated/game_records.txt`의 차례).
 *
 * 돈과 BP는 칸이 따로다 (`Shop_ConfirmItemPurchase`) — 프런티어에서 쓴 것은
 * 돈 쓴 기록에 안 들어간다. 50번은 덤을 받은 횟수다 (`Shop_FinishPurchase`)
 */
const RECORD_MONEY_SPENT = 35
const RECORD_UNK_050 = 50
const RECORD_BATTLE_POINTS_SPENT = 69

/**
 * 덤으로 줄 물건 (`Shop_FinishPurchase`). 없으면 null이다.
 *
 * ⚠️ **원작은 돈 가게와 프런티어 가게 둘 다 준다** (`MART_TYPE_NORMAL || MART_TYPE_FRONTIER`) —
 * 화폐로 가르지 않는다. 프런티어가 몬스터볼을 안 파니 실제로는 돈 가게에서만 난다
 */
export function premierBonus(item: number, count: number): number | null {
  return item === ITEM_POKE_BALL && count >= PREMIER_MIN_BALLS ? ITEM_PREMIER_BALL : null
}

type CountKey = 'up' | 'down' | 'left' | 'right'

/**
 * 개수 고르기 한 칸 (`sub_0208C15C`).
 *
 * ↑는 하나 늘고 최대를 넘으면 **1로 감긴다**. ↓는 하나 줄고 1 밑으로 가면 **최대로 감긴다**.
 * ←→는 열씩 움직이되 감기지 않고 1과 최대에서 멈춘다. 원작이 `pressedKeysRepeatable`로
 * 받으므로 길게 누르면 계속 간다 (`useMenuKeys`가 방향은 반복을 받는다)
 */
export function stepCount(count: number, max: number, key: CountKey): number {
  switch (key) {
    case 'up': return count + 1 > max ? 1 : count + 1
    case 'down': return count - 1 <= 0 ? max : count - 1
    case 'left': return Math.max(1, count - 10)
    case 'right': return Math.min(max, count + 10)
  }
}

/**
 * 끝난 뒤의 한 줄. ⚠️ **거절 줄과 같은 합쇼체다** — 한 화면에서 거절은 존댓말,
 * 성공은 반말이면 말하는 사람이 바뀐 것처럼 읽힌다
 */
export const boughtLine = (name: string, count: number): string => `${name} ${String(count)}개를 샀습니다`
export const soldLine = (paid: string): string => `${paid}을 받았습니다`

interface Loaded {
  items: ItemTable
  names: string[]
  descriptions: string[]
  icons: ItemIcons
  bag: string[]
  /** 상점 뱅크(543). 덤 줄이 여기 있다 */
  shop: string[]
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
      loadItemIcons(), loadUiText('bag', locale), loadUiText('shop', locale),
    ])
      .then(([items, names, descriptions, icons, bagText, shopText]) => {
        if (alive) setData({ items, names, descriptions, icons, bag: bagText, shop: shopText })
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
      fieldScripts.services.sound?.playEffect(SE_REGI)
      let records = addRecord(useSaveStore.getState().records,
        isBP ? RECORD_BATTLE_POINTS_SPENT : RECORD_MONEY_SPENT, cost)
      let line = boughtLine(data?.names[row.item] ?? '', count)
      const bonus = premierBonus(row.item, count)
      // 덤은 칸이 있을 때만 준다. 못 넣으면 줄도 기록도 없다 (`Bag_TryAddItem == TRUE`)
      if (bonus !== null && save.addItem(data?.items.get(bonus).pocket ?? 0, bonus, 1)) {
        records = addRecord(records, RECORD_UNK_050, 1)
        const gift = data?.shop[SHOP_TEXT_PREMIER] ?? ''
        if (gift !== '') line = `${line}\n${gift}`
      }
      useSaveStore.setState({ records })
      setNote(line)
    } else {
      if (!save.removeItem(pocket, row.item, count)) { setNote('팔 수 없습니다'); return }
      save.addMoney(unit * count)
      sold.current++
      setNote(soldLine(amount(unit * count)))
    }
    // ⚠️ **커서는 그 자리에 둔다.** 원작은 목록을 닫을 때만 커서를 놓는다
    // (`shop_menu.c` 875~876줄) — 맨 아래 볼을 두 번에 나눠 사면서 매번 처음부터
    // 내려가게 하지 않는다. 판다 쪽 목록이 줄어들면 `at`이 끝으로 당긴다
    setCursor(at)
    setCount(0)
  }

  /** 개수를 고르는 중이면 개수를 옮긴다. 안 바뀌면 소리를 안 낸다 (`sub_0208C15C`가 0을 낸다) */
  const countKey = (key: CountKey): boolean => {
    const next = stepCount(count, max, key)
    if (next === count) return false
    setCount(next)
    return true
  }
  const moveCursor = (delta: number): boolean => {
    // `at`에서 센다 — 판 뒤 목록이 줄면 담아 둔 커서가 끝을 넘어 있을 수 있다
    const next = clampCursor(at, delta, rows.length)
    if (next === at) return false
    setCursor(next)
    return true
  }
  const switchTab = (): boolean => {
    // BP 가게에는 「판다」가 없다 — 갈래를 안 바꾼다
    if (isBP) return false
    setTab((t) => (t === 'buy' ? 'sell' : 'buy'))
    setCursor(0)
    reset()
    return true
  }

  useMenuKeys({
    up: () => (count > 0 ? countKey('up') : moveCursor(-1)),
    down: () => (count > 0 ? countKey('down') : moveCursor(1)),
    // 개수를 고를 때 ←→는 열씩이다. 갈래는 고르는 중이 아닐 때만 바뀐다
    left: () => (count > 0 ? countKey('left') : switchTab()),
    right: () => (count > 0 ? countKey('right') : switchTab()),
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
      note={isBP ? amount(battlePoints) : `${data?.bag[78] ?? '용돈'} ${amount(money)}`}
      foot={count > 0
        ? `↑↓ 개수 (최대 ${String(max)}) · ←→ ±10 · Z 결정 · X 그만둔다`
        : isBP
          ? `↑↓ 고르기 · Z 결정 · X 닫기 · ${String(rows.length)}종`
          : `←→ 산다/판다 · ↑↓ 고르기 · Z 결정 · X 닫기 · ${String(rows.length)}종`}
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
              <div className={css.hero}>
                <span className={css.heroIcon} style={itemIcon(data?.icons, row.item, BIG_ICON)} aria-hidden />
                <span className={css.heroText}>
                  <span className={css.heroName}>{data?.names[row.item] ?? ''}</span>
                  <span className={css.heroSub}>{amount(unit)}</span>
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