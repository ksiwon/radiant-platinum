// 상점 — 산다·판다.
//
// 재고는 우리가 고르지 않는다. 스크립트가 `PokeMartCommon`을 부르면 그 자리의
// 뱃지 수가 목록을 정하고, `PokeMartSpecialties`면 상점 번호가 정한다
// (`engine/bag/mart.ts`). 값도 아이템 자료의 `price`를 그대로 쓴다.
//
// 파는 값은 **사는 값의 절반**이다 (`Item_SellPrice`: price / 2).
//
// 사는 길은 원작 `shop_menu.c`의 차례 그대로다 (롬 `shop` 뱅크 · `MART_TEXT`):
//   고른다 → 돈이 모자라면 「돈이 부족하시군요!」(3)
//          → 아니면 「몇 개 구입하시겠습니까?」(4)와 개수 창
//   개수를 정한다 → 칸이 모자라면 「그 이상은 가지고 다닐 수 없어요!」(7)
//                 → 아니면 「…개로군요 총 …원입니다.」(5)에 예·아니오
//   예 → 계산대 소리 · 「네 여기 있습니다 … 포켓에 넣었다」(6)
// 끝 줄(거절이든 산 것이든)을 넘기면 다시 목록이다. BP 가게는 줄이 따로다(33·35·37).
//
// 몬스터볼을 한 번에 열 개 이상 사면 프레미어볼 하나가 덤으로 온다 (`Shop_FinishPurchase`).
import { useEffect, useRef, useState } from 'react'
import {
  loadItemDescriptions, loadItemIcons, loadItemNames, loadItems, loadMoveNames, type ItemTable,
} from '../../data/gameData'
import { fillMenuText, loadUiText, MART_TEXT, YES_NO } from '../../data/uiText'
import { ITEM_TABLE } from '../../import/platinum/itemTable'
import {
  addRecord, RECORD_BATTLE_POINTS_SPENT, RECORD_MONEY_SPENT, RECORD_PREMIER_BALLS_RECEIVED,
} from '../../engine/world/gameRecords'
import { SFX } from '../../engine/audio/sfx'
import { canFit } from '../../engine/bag/bag'
import { tmMove } from '../../engine/bag/fieldUse'
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
import * as stage from './bagScreen.css'
// 예·아니오 창은 파티 화면 것을 그대로 쓴다 — 오른쪽 아래 구석의 창 하나다
import * as menu from './partyScreen.css'

/** 가방과 같은 크기를 쓴다 — 같은 물건이 화면마다 다른 크기면 안 된다 */
const LIST_ICON = 28
const BIG_ICON = 96

/** `Item_SellPrice` — 사는 값의 절반으로 쳐 준다 */
const sellPrice = (price: number): number => Math.floor(price / 2)

/** 열거형 이름으로 번호를 찾는다. 번호를 손으로 적으면 표와 어긋날 자리가 생긴다 */
const itemId = (constant: string): number => ITEM_TABLE.findIndex(([name]) => name === constant)
const ITEM_POKE_BALL = itemId('ITEM_POKE_BALL')
const ITEM_PREMIER_BALL = itemId('ITEM_PREMIER_BALL')
const ITEM_TM01 = itemId('ITEM_TM01')
const ITEM_HM01 = itemId('ITEM_HM01')

/** 몬스터볼을 한 번에 이만큼 사면 덤이 온다 (`itemAmount >= 10`) */
const PREMIER_MIN_BALLS = 10

/** 한 번에 고를 수 있는 개수의 끝 (`itemAmountMax > 99`이면 99) */
const MAX_PER_PURCHASE = 99

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

/** 판 뒤의 한 줄. 파는 길은 가방 앱의 일이라(`ResolveSale`) 이 뱅크에 줄이 없다 */
export const soldLine = (paid: string): string => `${paid}을 받았습니다`

/**
 * 고른 물건에 처음 하는 말 (`Shop_SelectBuyMenu`).
 *
 * ⚠️ **하나도 못 사면 개수를 안 묻는다** — 값이 가진 돈보다 크면 그 자리에서 거절 줄이고, 개수 창이 안 뜬다
 */
export function pickLine(purse: number, price: number, bp: boolean): number {
  if (purse < price) return bp ? MART_TEXT.noBP : MART_TEXT.noMoney
  return bp ? MART_TEXT.bpHowMany : MART_TEXT.howMany
}

/** 개수 창의 끝 — 가진 것으로 살 수 있는 만큼, 99에서 멈춘다 (`currMoney / itemPrice`) */
export function purchaseMax(purse: number, price: number): number {
  if (price <= 0) return MAX_PER_PURCHASE
  return Math.max(0, Math.min(MAX_PER_PURCHASE, Math.floor(purse / price)))
}

/**
 * 결제 전 확인 줄 (`Shop_ShowPurchaseMessage`). 기술머신·비전머신은 기술 이름이 붙는 판이다
 * (`ITEM_TM01 <= itemId <= ITEM_HM01` — ⚠️ 원작 조건이 HM01에서 끝나서 HM02~08은 보통 판이다)
 */
export function confirmLine(item: number, bp: boolean): number {
  const tm = item >= ITEM_TM01 && item <= ITEM_HM01
  if (bp) return tm ? MART_TEXT.bpTmConfirm : MART_TEXT.bpConfirm
  return tm ? MART_TEXT.tmConfirm : MART_TEXT.confirm
}

/**
 * 끝 줄을 넘겼다 (`Shop_FinishPurchase`). 덤으로 줄 물건을 돌려준다.
 *
 * ⚠️ **거절 줄을 넘겨도 센다.** 원작은 이 상태에서 A·B를 받으면 무엇을 샀는지 안 보고
 * `SystemVars_IncrementDepartmentStoreBuyCount`를 부른다 — 돈이 모자라다는 줄도, 칸이 모자라다는 줄도 같은
 * 상태(`SHOP_STATE_FINISH_PURCHASE`)로 끝난다. 그래서 백화점에서 못 산 것도 단골 셈에 든다.
 * 덤은 거절 쪽에서 안 난다 — 그때 개수가 1(돈)이거나 0(칸)이다
 */
export function finishPurchase(done: { item: number; count: number }, onPurchase: (() => void) | null): number | null {
  onPurchase?.()
  return premierBonus(done.item, done.count)
}

/** 롬 줄의 `\r`(다음 쪽)은 창 하나에 한꺼번에 올리므로 줄바꿈으로 편다 */
function flat(text: string): string {
  return text.replace(/[\r\f]/g, '\n')
}

interface Loaded {
  items: ItemTable
  names: string[]
  descriptions: string[]
  icons: ItemIcons
  /** 가방 뱅크(7). 소지금 이름표가 여기 있다 */
  bag: string[]
  /** 상점 뱅크(543) — 사는 흐름의 줄 전부 (`MART_TEXT`) */
  shop: string[]
  /** 메뉴 뱅크 — 예·아니오 (`Menu_MakeYesNoChoice`) */
  menu: string[]
  /** 주머니 이름 — 「…포켓에 넣었다」의 1번 칸 (`StringTemplate_SetBagPocketName`) */
  pockets: string[]
  /** 기술 이름 — 기술머신 확인 줄의 3번 칸 */
  moves: string[]
}

type Tab = 'buy' | 'sell'

/**
 * 사고파는 단계 (`SHOP_STATE_*`).
 *
 * - `count` — 개수 창. 파는 쪽도 같은 창이다
 * - `confirm` — 결제 전 확인과 예·아니오. 커서는 **예**에서 시작한다
 * - `finish` — 끝 줄(거절 또는 산 것). A·B로 넘긴다. `count`는 산 개수고 거절이면 원작처럼 1 또는 0이다
 * - `premier` — 덤 줄
 */
type Step =
  | { kind: 'list' }
  | { kind: 'count'; n: number }
  | { kind: 'confirm'; n: number; yes: boolean }
  | { kind: 'finish'; line: string; item: number; count: number }
  | { kind: 'premier'; line: string }
  | { kind: 'sold'; line: string }

export function ShopScreen() {
  const [data, setData] = useState<Loaded | null>(null)
  // 설정의 언어. 바뀌면 이름과 설명을 그 언어로 다시 받는다
  const locale = useGameLocale()
  const [tab, setTab] = useState<Tab>('buy')
  // 노트가 「많이 샀다」를 가르는 데 쓰는 횟수. 상점을 나갈 때 한 번 읽는다
  const bought = useRef(0)
  const sold = useRef(0)
  const [cursor, setCursor] = useState(0)
  const [step, setStep] = useState<Step>({ kind: 'list' })
  const closeAll = useMenuStore((s) => s.closeAll)
  const stock = useMenuStore((s) => s.shopStock)
  const onPurchase = useMenuStore((s) => s.shopOnPurchase)
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
      loadUiText('menuEntries', locale), loadUiText('bagPockets', locale), loadMoveNames(locale),
    ])
      .then(([items, names, descriptions, icons, bagText, shopText, menuText, pockets, moves]) => {
        if (alive) {
          setData({
            items, names, descriptions, icons, bag: bagText, shop: shopText, menu: menuText, pockets, moves,
          })
        }
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
  const name = (item: number): string => data?.names[item] ?? ''
  /** 고를 수 있는 최대 개수 — 사는 쪽은 돈이, 파는 쪽은 가진 수가 막는다 */
  const max = row === undefined ? 0 : tab === 'sell' ? row.have : purchaseMax(purse, unit)
  /** 상점 뱅크 한 줄을 채워 편다 */
  const say = (line: number, values: readonly string[]): string => flat(fillMenuText(data?.shop[line] ?? '', values))
  const sound = (seq: number): void => { fieldScripts.services.sound?.playEffect(seq) }
  const pocketOf = (item: number): number => data?.items.get(item).pocket ?? 0

  /** Z — 목록에서 고른다 (`Shop_SelectBuyMenu`의 `default`) */
  const pick = (): boolean => {
    if (!row) return false
    if (tab === 'sell') {
      if (max <= 0) return false
      setStep({ kind: 'count', n: 1 })
      return true
    }
    const line = pickLine(purse, unit, isBP)
    if (line === MART_TEXT.noMoney || line === MART_TEXT.noBP) {
      // 거절 줄은 소리 없이 뜬다 — 원작이 이 갈래에서만 `SEQ_SE_CONFIRM`을 안 낸다
      setStep({ kind: 'finish', line: say(line, []), item: row.item, count: 1 })
      return false
    }
    setStep({ kind: 'count', n: 1 })
    return true
  }

  /** 개수를 정했다 (`Shop_SelectPurchaseMenu`의 A → `Shop_ShowPurchaseMessage`) */
  const decideCount = (n: number): void => {
    if (!row) return
    if (tab === 'sell') { sell(n); return }
    if (!canFit(useSaveStore.getState().bag, pocketOf(row.item), row.item, n)) {
      setStep({ kind: 'finish', line: say(MART_TEXT.noRoom, []), item: row.item, count: 0 })
      return
    }
    setStep({ kind: 'confirm', n, yes: true })
  }

  /**
   * 예 — 값을 치르고 물건을 넣는다 (`Shop_SelectConfirmPurchase` → `Shop_ConfirmItemPurchase`).
   *
   * 계산대 소리가 이 순간 한 번 운다. 돈과 BP는 기록 칸이 따로다
   */
  const buy = (n: number): void => {
    if (!row || !data) return
    const save = useSaveStore.getState()
    const pocket = pocketOf(row.item)
    const cost = unit * n
    if (isBP) {
      if (battlePoints < cost) { setStep({ kind: 'finish', line: say(MART_TEXT.noBP, []), item: row.item, count: 1 }); return }
      useSaveStore.setState((st) => ({ battlePoints: spendBattlePoints(st.battlePoints, cost) }))
    } else if (!save.spendMoney(cost)) {
      setStep({ kind: 'finish', line: say(MART_TEXT.noMoney, []), item: row.item, count: 1 })
      return
    }
    if (!save.addItem(pocket, row.item, n)) {
      // 칸은 개수를 정할 때 봤다. 그새 바뀌었으면 값을 되돌린다 — 안 그러면 낸 것만 사라진다
      if (isBP) {
        useSaveStore.setState((st) => ({ battlePoints: addBattlePoints(st.battlePoints, cost) }))
      } else save.addMoney(cost)
      setStep({ kind: 'finish', line: say(MART_TEXT.noRoom, []), item: row.item, count: 0 })
      return
    }
    bought.current++
    sound(SFX.CASH_REGISTER)
    useSaveStore.setState((st) => ({
      records: addRecord(st.records, isBP ? RECORD_BATTLE_POINTS_SPENT : RECORD_MONEY_SPENT, cost),
    }))
    setStep({
      kind: 'finish',
      line: say(MART_TEXT.thanks, [name(row.item), data.pockets[pocket] ?? '']),
      item: row.item,
      count: n,
    })
  }

  /** 판다. 파는 길은 원작 가방 앱의 것이라(`ResolveSale`) 확인 없이 바로 판다 — 이 화면이 그 앱을 대신한다 */
  const sell = (n: number): void => {
    if (!row) return
    const save = useSaveStore.getState()
    if (!save.removeItem(pocketOf(row.item), row.item, n)) { setStep({ kind: 'sold', line: '팔 수 없습니다' }); return }
    save.addMoney(unit * n)
    sold.current++
    sound(SFX.CASH_REGISTER)
    setStep({ kind: 'sold', line: soldLine(amount(unit * n)) })
  }

  /**
   * 끝 줄을 넘긴다 (`Shop_FinishPurchase` · `Shop_FinishFreePremierBall`).
   *
   * ⚠️ **커서는 그 자리에 둔다.** 원작은 목록을 닫을 때만 커서를 놓는다
   * (`shop_menu.c` 875~876줄) — 맨 아래 볼을 두 번에 나눠 사면서 매번 처음부터
   * 내려가게 하지 않는다. 판다 쪽 목록이 줄어들면 `at`이 끝으로 당긴다
   */
  const dismiss = (): void => {
    if (step.kind !== 'finish') { setCursor(at); setStep({ kind: 'list' }); return }
    const bonus = finishPurchase(step, onPurchase)
    // 덤은 칸이 있을 때만 준다. 못 넣으면 줄도 기록도 없다 (`Bag_TryAddItem == TRUE`)
    if (bonus !== null && useSaveStore.getState().addItem(pocketOf(bonus), bonus, 1)) {
      useSaveStore.setState((st) => ({ records: addRecord(st.records, RECORD_PREMIER_BALLS_RECEIVED, 1) }))
      setStep({ kind: 'premier', line: say(MART_TEXT.premier, []) })
      return
    }
    setCursor(at)
    setStep({ kind: 'list' })
  }

  /**
   * 개수 창의 키. 바뀌면 `SEQ_SE_DP_BAG_004`를 내고 메뉴 소리는 안 낸다 (`Shop_SelectPurchaseMenu`) —
   * 안 바뀌면 아무 소리도 없다 (`sub_0208C15C`가 0을 낸다)
   */
  const countKey = (n: number, key: CountKey): false => {
    const next = stepCount(n, max, key)
    if (next !== n) {
      sound(SFX.BAG_COUNT)
      setStep({ kind: 'count', n: next })
    }
    return false
  }
  /** 목록 커서. 옮기면 개수 창과 같은 소리다 (`Shop_MenuCursorCallback`) */
  const moveCursor = (delta: number): false => {
    // `at`에서 센다 — 판 뒤 목록이 줄면 담아 둔 커서가 끝을 넘어 있을 수 있다
    const next = clampCursor(at, delta, rows.length)
    if (next !== at) {
      sound(SFX.BAG_COUNT)
      setCursor(next)
    }
    return false
  }
  const switchTab = (): boolean => {
    // BP 가게에는 「판다」가 없다 — 갈래를 안 바꾼다
    if (isBP) return false
    setTab((t) => (t === 'buy' ? 'sell' : 'buy'))
    setCursor(0)
    return true
  }
  /** 예·아니오 커서. 둘뿐이라 끝에서 안 돈다 */
  const moveYesNo = (yes: boolean): boolean => {
    if (step.kind !== 'confirm' || step.yes === yes) return false
    setStep({ ...step, yes })
    return true
  }

  useMenuKeys({
    up: () => {
      switch (step.kind) {
        case 'list': return moveCursor(-1)
        case 'count': return countKey(step.n, 'up')
        case 'confirm': return moveYesNo(true)
        default: return false
      }
    },
    down: () => {
      switch (step.kind) {
        case 'list': return moveCursor(1)
        case 'count': return countKey(step.n, 'down')
        case 'confirm': return moveYesNo(false)
        default: return false
      }
    },
    // 개수를 고를 때 ←→는 열씩이다. 갈래는 목록에서만 바뀐다
    left: () => (step.kind === 'count' ? countKey(step.n, 'left') : step.kind === 'list' && switchTab()),
    right: () => (step.kind === 'count' ? countKey(step.n, 'right') : step.kind === 'list' && switchTab()),
    confirm: () => {
      switch (step.kind) {
        case 'list': return pick()
        case 'count': decideCount(step.n); return true
        case 'confirm':
          if (step.yes) buy(step.n)
          else { setCursor(at); setStep({ kind: 'list' }) }
          return true
        // 끝 줄은 A·B로 넘기고 소리가 없다 (`JOY_NEW(PAD_BUTTON_A | PAD_BUTTON_B)`)
        default: dismiss(); return false
      }
    },
    cancel: () => {
      switch (step.kind) {
        case 'list':
          // 상점을 나갈 때 노트에 한 줄 (PARITY §7.4). ⚠️ **횟수로 가른다** —
          // 두 번 이상 샀으면 「많이 샀다」다
          journalShopped(world.mapId, bought.current, sold.current)
          closeAll()
          return true
        // 개수 창과 예·아니오의 B는 목록으로 물러난다 (`MENU_CANCEL`)
        case 'count': case 'confirm': setStep({ kind: 'list' }); return true
        default: dismiss(); return false
      }
    },
  })

  /** 아래 글상자 — 지금 단계의 말 */
  const message = (): string | null => {
    if (!row) return null
    switch (step.kind) {
      case 'list': return null
      case 'count':
        return tab === 'buy' ? say(isBP ? MART_TEXT.bpHowMany : MART_TEXT.howMany, [name(row.item)]) : null
      case 'confirm': return null
      default: return step.line
    }
  }

  /** 결제 전 확인 줄 — 예·아니오 창 위에 선다. 칸은 0 도구 · 1 개수 · 2 값 · 3 기술이다 */
  const confirmAsk = (n: number): string => {
    if (!row || !data) return ''
    const move = tmMove(data.items.get(row.item), data.items.tmMoves)
    return say(confirmLine(row.item, isBP), [
      name(row.item), String(n), (unit * n).toLocaleString('ko-KR'), move === null ? '' : data.moves[move] ?? '',
    ])
  }

  const counting = step.kind === 'count'
  const note = message()

  return (
    <MenuScreen
      title={tab === 'buy' ? '산다' : '판다'}
      note={isBP ? amount(battlePoints) : `${data?.bag[78] ?? '용돈'} ${amount(money)}`}
      foot={counting
        ? `↑↓ 개수 (최대 ${String(max)}) · ←→ ±10 · Z 결정 · X 그만둔다`
        : step.kind === 'confirm'
          ? '↑↓ 고르기 · Z 결정 · X 그만둔다'
          : step.kind !== 'list'
            ? 'Z 다음'
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

      {/* 예·아니오 창이 이 칸의 오른쪽 아래 구석에 붙는다 */}
      <div className={stage.anchorStage}>
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
                <span className={css.label}>{name(r.item)}</span>
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
                  <span className={css.heroName}>{name(row.item)}</span>
                  <span className={css.heroSub}>{amount(unit)}</span>
                </span>
              </div>
              <div className={css.detailText}>{data?.descriptions[row.item] ?? ''}</div>
            </>
          )}
          {counting && row && (
            // 개수 창 셋 (`Shop_ShowQtyWithinInventory` · `…TotalItemPurchase`) — 가진 수 · x개수 · 합계.
            // 개수는 원작처럼 두 자리를 0으로 채운다
            <div className={own.prompt}>
              {tab === 'buy' && <>{fillMenuText(data?.shop[MART_TEXT.inBag] ?? '', [String(row.have)])}<br /></>}
              {fillMenuText(data?.shop[MART_TEXT.quantity] ?? '', [String(step.n).padStart(2, '0')])}
              {'  '}
              {fillMenuText(data?.shop[isBP ? MART_TEXT.bpTotal : MART_TEXT.total] ?? '',
                [(unit * step.n).toLocaleString('ko-KR')])}
            </div>
          )}
          {note !== null && <div className={own.help}>{note}</div>}
        </div>

        {step.kind === 'confirm' && (
          <div className={menu.choices}>
            <div className={menu.choiceAsk}>{confirmAsk(step.n)}</div>
            {[true, false].map((yes) => (
              <div
                key={String(yes)}
                className={step.yes === yes ? menu.choiceOn : menu.choice}
                onPointerEnter={() => { setStep({ ...step, yes }) }}
              >
                {data?.menu[yes ? YES_NO.yes : YES_NO.no] ?? ''}
              </div>
            ))}
          </div>
        )}
      </div>
    </MenuScreen>
  )
}
