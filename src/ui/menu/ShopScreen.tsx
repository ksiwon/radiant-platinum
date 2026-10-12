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
// 파는 길도 원작이다 (`applications/bag/main.c`의 팔기 모드 · 가방 뱅크 7의 74~77):
//   고른다 → 값이 0이면 「파실 수 없습니다!」(74)
//          → 가진 것이 하나뿐이면 **개수를 안 묻고** 하나 넘으면 「몇 개 파시겠습니까?」(75)와 개수 창
//   → 「그 물건은 …원으로 쳐 드리겠습니다」(76)에 예·아니오 → 「… 건네고 …원을 받았다」(77)
//
// 목록 끝에 「그만둔다」 줄(롬 8)이 있고 나갈 때 「또 오세요!」(1)를 말한다. 그 말은 **아무 키에 바로 닫히고** 0.9초 뒤에는
// 저절로 닫힌다 — 하네스(`clearTalk`)가 X를 되풀이하므로 키를 막는 단계가 아니다.
//
// 몬스터볼을 한 번에 열 개 이상 사면 프레미어볼 하나가 덤으로 온다 (`Shop_FinishPurchase`).
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  loadBagSprite, loadDialogueBankOrNull, loadItemDescriptions, loadItemIcons, loadItemNames, loadItems,
  loadMoveNames, loadMoves, loadSealIcons, type ItemTable, type MoveTable,
} from '../../data/gameData'
import { fillMenuText, loadUiText, MART_TEXT, MONEY_WINDOW_TEXT, SELL_TEXT, UI_BANK, YES_NO } from '../../data/uiText'
import { canGiveOrTake, countSeal, giveOrTakeSeal } from '../../engine/world/sealCase'
import { sealsInUse } from '../../engine/world/ballCapsule'
import { SEAL_PRICE } from '../../engine/world/sealTables'
import { ITEM_TABLE } from '../../import/platinum/itemTable'
import {
  addRecord, RECORD_BATTLE_POINTS_SPENT, RECORD_MONEY_SPENT, RECORD_PREMIER_BALLS_RECEIVED,
} from '../../engine/world/gameRecords'
import { SFX } from '../../engine/audio/sfx'
import { canFit, POCKET_BERRIES } from '../../engine/bag/bag'
import { tmMove } from '../../engine/bag/fieldUse'
import { typeColor } from '../../engine/battle/typeColor'
import { fieldScripts } from '../../engine/script/field'
import type { BagSprite, ItemIcons } from '../../data/schema'
import { useMenuStore } from '../../state/menuStore'
import { addBattlePoints, bpPriceOf, spendBattlePoints } from '../../engine/bag/frontierMart'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { world } from '../../engine/map/world'
import { journalShopped } from '../../scene/journal'
import { CountPicker } from '../common/CountPicker'
import { GroundShadow } from '../common/GroundShadow'
import { MoveFacts } from '../common/MoveFacts'
import { bandAt } from '../common/pickBand'
import { ScrollKnob, scrollList } from '../common/ScrollKnob'
import { TypeBadge } from '../common/TypeBadge'
import { pointerMoved } from '../pointerMoved'
import { pickBand } from '../theme/window.css'
import { clampCursor, scrollIntoView, useMenuKeys } from './useMenuKeys'
import { itemIcon } from './itemIcon'
import { pocketIcon } from './bagArt'
import { pixelSprite } from '../common/pixelSprite'
import { useSheet } from '../common/useSheet'
import { PIXEL, type PixelScale } from '../theme/scale'
import { berryNumber, pad2, tmNumber } from './bagRows'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './shopScreen.css'
import {
  buyRows, canSell, entriesOf, receipt, sellRows, soldLine, type ShopRow,
} from './shopRows'

/** 목록 아이콘은 칸(32)의 1배, 영웅은 3배, 계산서의 영웅은 2배다 — 정수배만 쓴다 */
const LIST_ICON = 32
const HERO_ICON = 96
const RECEIPT_ICON = 64
const EMPTY_ICON = 64
/** 목록이 한 번에 보이는 줄 수 (스크롤 눈금이 센다) */
const VISIBLE_ROWS = 9
/** 작별 말이 아무 키가 없어도 저절로 닫히는 시간 (ms) */
const FAREWELL_MS = 900

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
  /** 가방 뱅크(7). 판다의 줄(74~77)과 BP 소지금 이름표(97)가 여기 있다 */
  bag: string[]
  /** 상점 뱅크(543) — 사는 흐름의 줄 전부 (`MART_TEXT`) */
  shop: string[]
  /** 메뉴 뱅크 — 예·아니오 (`Menu_MakeYesNoChoice`) */
  menu: string[]
  /** 주머니 이름 — 「…포켓에 넣었다」의 1번 칸 (`StringTemplate_SetBagPocketName`) */
  pockets: string[]
  /** 기술 이름 — 기술머신 줄과 확인 줄의 3번 칸 */
  moveNames: string[]
  /** 기술 표 — 기술머신 정보 칸의 타입 · 분류 · 위력 · 명중 · PP. 못 받으면 정보 칸이 없다 */
  moves: MoveTable | undefined
  /** 주머니 아이콘 — 판다의 주머니 머리와 빈 목록. 못 받으면 아이콘 없이 선다 */
  bagSprite: BagSprite | undefined
  /** 「포인트 교환 코너」(롬 195의 21) — BP 가게의 머리. 못 받으면 소지금 이름표로 떨어진다 */
  frontierTitle: string | undefined
  /** 볼 씰 이름 (롬 12) — 씰 가게의 줄 이름. 못 받으면 이름 없는 줄이 선다 */
  sealNames: string[]
}

type Tab = 'buy' | 'sell'

/**
 * 사고파는 단계 (`SHOP_STATE_*`).
 *
 * - `count` — 개수 창. 파는 쪽도 같은 창이다
 * - `confirm` — 결제 전 확인과 예·아니오. 커서는 **예**에서 시작한다. 파는 쪽도 같다(`sell`)
 * - `finish` — 끝 줄(거절 또는 산 것). A·B로 넘긴다. `count`는 산 개수고 거절이면 원작처럼 1 또는 0이다
 * - `premier` — 덤 줄
 * - `sold` — 판 뒤의 줄 · 못 판다는 줄
 * - `bye` — 작별. 아무 키에 바로 닫히고 0.9초 뒤에 저절로 닫힌다
 */
type Step =
  | { kind: 'list' }
  | { kind: 'count'; n: number }
  | { kind: 'confirm'; n: number; yes: boolean }
  | { kind: 'finish'; line: string; item: number; count: number }
  | { kind: 'premier'; line: string }
  | { kind: 'sold'; line: string }
  | { kind: 'bye'; line: string }

export function ShopScreen() {
  const [data, setData] = useState<Loaded | null>(null)
  // 설정의 언어. 바뀌면 이름과 설명을 그 언어로 다시 받는다
  const locale = useGameLocale()
  const [tab, setTab] = useState<Tab>('buy')
  // 노트가 「많이 샀다」를 가르는 데 쓰는 횟수. 상점을 나갈 때 한 번 읽는다
  const bought = useRef(0)
  const sold = useRef(0)
  const [cursor, setCursor] = useState(0)
  const [scrolled, setScrolled] = useState(0)
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
  const currency = useMenuStore((s) => s.shopCurrency)
  const isBP = currency === 'bp'
  /**
   * 해님시티 씰 가게 (`MART_TYPE_SEAL`). 재고 칸이 **도구 번호가 아니라 씰 번호**다 — 값은 씰 표, 가진 수는 씰케이스,
   * 이름은 롬 12다. 돈으로 사고 되팔지 않는다 (판다 없음 — BP 가게와 같다)
   */
  const isSeal = currency === 'seal'
  const sealCase = useSaveStore((s) => s.sealCase)
  const battlePoints = useSaveStore((s) => s.battlePoints)
  const purse = isBP ? battlePoints : money
  const priceOf = (item: number): number =>
    isSeal ? SEAL_PRICE[item - 1] ?? 0 : isBP ? bpPriceOf(item) : data?.items.get(item).price ?? 0
  const pocketOf = (item: number): number => (isSeal ? 0 : data?.items.get(item).pocket ?? 0)
  // 씰 그림 시트(롬 `cb_data`) — 씰 가게에서만 받는다. 못 받았으면 그림 없이 이름만 선다
  const sealIcons = useSheet(isSeal ? loadSealIcons : () => Promise.resolve(null), String(isSeal))
  /** 씰 그림의 정수 배율 — 24 한 칸이 `size`에 들어가는 가장 큰 배 */
  const sealScale = (size: number): PixelScale => (Math.max(1, Math.min(4, Math.floor(size / 24))) as PixelScale)
  /** 줄 아이콘 — 씰은 도구 그림이 아니라 씰 시트다 (없으면 undefined) */
  const iconOf = (item: number, size: number): CSSProperties | undefined =>
    isSeal
      ? (sealIcons ? pixelSprite(sealIcons, item - 1, sealScale(size)) : undefined)
      : itemIcon(data?.icons, item, size)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadItems(), loadItemNames(locale), loadItemDescriptions(locale),
      loadItemIcons(), loadUiText('bag', locale), loadUiText('shop', locale),
      loadUiText('menuEntries', locale), loadUiText('bagPockets', locale), loadMoveNames(locale),
      // 아래 셋은 없어도 화면이 선다 — 그림 한 장 때문에 상점이 통째로 안 뜨면 안 된다
      loadMoves().catch(() => undefined),
      loadBagSprite().catch(() => undefined),
      loadDialogueBankOrNull(locale, 195),
      loadDialogueBankOrNull(locale, UI_BANK.ballSealNames),
    ])
      .then(([items, names, descriptions, icons, bagText, shopText, menuText, pockets, moveNames, moves, bagSprite, frontier, seals]) => {
        if (alive) {
          setData({
            items, names, descriptions, icons, bag: bagText, shop: shopText, menu: menuText, pockets, moveNames,
            moves, bagSprite, frontierTitle: frontier?.[21] || undefined, sealNames: seals ?? [],
          })
        }
      })
      .catch(() => { /* 글을 못 받으면 빈 상점이 뜬다 */ })
    return () => { alive = false }
  }, [locale])

  /** 줄 모델 — 고를 수 있는 줄. 끝 「그만둔다」 줄이 맨 끝이다 (`shopStock` 차례 = 줄 차례) */
  const rows: ShopRow[] = tab === 'buy'
    ? buyRows(stock, priceOf, (item) => (isSeal ? countSeal(sealCase, item) : bag.flat().find((s) => s.item === item)?.count ?? 0), pocketOf)
    // 중요한 물건은 못 판다 (`preventToss`) — 값이 0인 도구는 남기고 고르면 「파실 수 없습니다!」가 뜬다
    : sellRows(bag, (item) => data?.items.get(item).preventToss !== 1, (item) => data?.items.get(item).price ?? 0)

  const at = Math.min(cursor, Math.max(0, rows.length - 1))
  const row = rows[at]
  const itemRow = row?.kind === 'item' ? row : undefined
  const onEnd = row?.kind === 'end'
  const unit = itemRow?.price ?? 0
  const name = (item: number): string => (isSeal ? data?.sealNames[item] ?? '' : data?.names[item] ?? '')
  /** 고를 수 있는 최대 개수 — 사는 쪽은 돈이, 파는 쪽은 가진 수가 막는다 */
  const max = itemRow === undefined ? 0 : tab === 'sell' ? itemRow.have : purchaseMax(purse, unit)
  const amount = (value: number): string => {
    const text = value.toLocaleString('ko-KR')
    return fillMenuText(data?.shop[isBP ? MART_TEXT.bpMoney : MONEY_WINDOW_TEXT.amount] ?? '', [text]) || text
  }
  /** 상점 뱅크 한 줄을 채워 편다 */
  const say = (line: number, values: readonly string[]): string => flat(fillMenuText(data?.shop[line] ?? '', values))
  /** 가방 뱅크 한 줄 (판다의 74~77) */
  const sayBag = (line: number, values: readonly string[]): string => flat(fillMenuText(data?.bag[line] ?? '', values))
  const sound = (seq: number): void => { fieldScripts.services.sound?.playEffect(seq) }

  /** 상점을 나간다 — 노트에 한 줄 (PARITY §7.4). ⚠️ **횟수로 가른다**: 두 번 이상 샀으면 「많이 샀다」다 */
  const closeShop = (): void => {
    journalShopped(world.mapId, bought.current, sold.current)
    closeAll()
  }
  // 작별은 아무 키가 없어도 저절로 닫힌다 — 최신 `closeShop`을 ref로 부른다
  const closeRef = useRef(closeShop)
  closeRef.current = closeShop
  const leaving = step.kind === 'bye'
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => { closeRef.current() }, FAREWELL_MS)
    return () => { clearTimeout(timer) }
  }, [leaving])

  /** 「그만둔다」 줄 · X — 작별 말을 하고 닫는다 (`Shop_Exit`). 말이 없으면 바로 닫는다 */
  const leave = (): void => {
    const line = say(isBP ? MART_TEXT.byeBP : MART_TEXT.bye, [])
    if (line === '') { closeShop(); return }
    setStep({ kind: 'bye', line })
  }

  /** Z — 목록에서 고른다 (`Shop_SelectBuyMenu`의 `default`) */
  const pick = (): boolean => {
    if (!row) return false
    if (row.kind === 'end') { leave(); return true }
    if (tab === 'sell') {
      // 값이 0이면 원작이 거절한다 (`ResolveSale`)
      if (!canSell(row.price) || max <= 0) {
        setStep({ kind: 'sold', line: sayBag(SELL_TEXT.cannot, [name(row.item)]) })
        return false
      }
      // 가진 것이 하나뿐이면 개수를 안 묻는다
      setStep(max === 1 ? { kind: 'confirm', n: 1, yes: true } : { kind: 'count', n: 1 })
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
    if (!itemRow) return
    if (tab === 'sell') { setStep({ kind: 'confirm', n, yes: true }); return }
    // 씰은 한 종류 99장까지다 (`SealCase_CheckSealCount`) — 넘으면 씰 전용 줄(롬 14)이다
    const fits = isSeal
      ? canGiveOrTake(useSaveStore.getState().sealCase, itemRow.item, n, sealsInUse(useSaveStore.getState().capsules, itemRow.item))
      : canFit(useSaveStore.getState().bag, pocketOf(itemRow.item), itemRow.item, n)
    if (!fits) {
      setStep({ kind: 'finish', line: say(isSeal ? MART_TEXT.sealNoRoom : MART_TEXT.noRoom, []), item: itemRow.item, count: 0 })
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
    if (!itemRow || !data) return
    const save = useSaveStore.getState()
    const pocket = pocketOf(itemRow.item)
    const cost = unit * n
    if (isBP) {
      if (battlePoints < cost) { setStep({ kind: 'finish', line: say(MART_TEXT.noBP, []), item: itemRow.item, count: 1 }); return }
      useSaveStore.setState((st) => ({ battlePoints: spendBattlePoints(st.battlePoints, cost) }))
    } else if (!save.spendMoney(cost)) {
      setStep({ kind: 'finish', line: say(MART_TEXT.noMoney, []), item: itemRow.item, count: 1 })
      return
    }
    const stored = isSeal
      ? ((): boolean => {
        const put = giveOrTakeSeal(useSaveStore.getState().sealCase, itemRow.item, n, sealsInUse(useSaveStore.getState().capsules, itemRow.item))
        if (put.ok) useSaveStore.setState({ sealCase: [...put.seals] })
        return put.ok
      })()
      : save.addItem(pocket, itemRow.item, n)
    if (!stored) {
      // 칸은 개수를 정할 때 봤다. 그새 바뀌었으면 값을 되돌린다 — 안 그러면 낸 것만 사라진다
      if (isBP) {
        useSaveStore.setState((st) => ({ battlePoints: addBattlePoints(st.battlePoints, cost) }))
      } else save.addMoney(cost)
      setStep({ kind: 'finish', line: say(MART_TEXT.noRoom, []), item: itemRow.item, count: 0 })
      return
    }
    bought.current++
    sound(SFX.CASH_REGISTER)
    useSaveStore.setState((st) => ({
      records: addRecord(st.records, isBP ? RECORD_BATTLE_POINTS_SPENT : RECORD_MONEY_SPENT, cost),
    }))
    setStep({
      kind: 'finish',
      // 씰은 주머니가 없다 — 롬 13이 이름 한 칸만 받는다 (`Shop_SelectConfirmPurchase`의 씰 갈래)
      line: isSeal ? say(MART_TEXT.sealThanks, [name(itemRow.item)]) : say(MART_TEXT.thanks, [name(itemRow.item), data.pockets[pocket] ?? '']),
      item: itemRow.item,
      count: n,
    })
  }

  /** 판다. 확인(롬 76)에 예라고 했을 때만 온다 — 파는 길은 원작 가방 앱의 것이라(`ResolveSale`) 이 화면이 그 앱을 대신한다 */
  const sell = (n: number): void => {
    if (!itemRow) return
    const save = useSaveStore.getState()
    if (!save.removeItem(pocketOf(itemRow.item), itemRow.item, n)) {
      setStep({ kind: 'sold', line: sayBag(SELL_TEXT.cannot, [name(itemRow.item)]) })
      return
    }
    save.addMoney(unit * n)
    sold.current++
    sound(SFX.CASH_REGISTER)
    setStep({ kind: 'sold', line: soldLine(data?.bag ?? [], SELL_TEXT.done, name(itemRow.item), (unit * n).toLocaleString('ko-KR')) })
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
    // ⚠️ 씰 번호는 도구 번호와 겹친다(4번이 몬스터볼) — 씰에는 덤이 없다
    const bonus = isSeal ? null : finishPurchase(step, onPurchase)
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
    // BP 가게와 씰 가게에는 「판다」가 없다 — 갈래를 안 바꾼다
    if (isBP || isSeal) return false
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
          if (!step.yes) { setCursor(at); setStep({ kind: 'list' }); return true }
          if (tab === 'sell') sell(step.n)
          else buy(step.n)
          return true
        // 작별은 아무 키에 바로 닫힌다 — 하네스가 두 번째 X를 소비하는 자리가 어긋나지 않게
        case 'bye': closeShop(); return false
        // 끝 줄은 A·B로 넘기고 소리가 없다 (`JOY_NEW(PAD_BUTTON_A | PAD_BUTTON_B)`)
        default: dismiss(); return false
      }
    },
    cancel: () => {
      switch (step.kind) {
        case 'list': leave(); return true
        // 개수 창과 예·아니오의 B는 목록으로 물러난다 (`MENU_CANCEL`)
        case 'count': case 'confirm': setStep({ kind: 'list' }); return true
        case 'bye': closeShop(); return false
        default: dismiss(); return false
      }
    },
  })

  // ── 아래 띠 — 지금 단계의 말 ─────────────────────────────────────────────
  /** 결제 전 확인 줄 — 칸은 0 도구 · 1 개수 · 2 값 · 3 기술이다 */
  const confirmAsk = (n: number): string => {
    if (!itemRow || !data) return ''
    if (tab === 'sell') return sayBag(SELL_TEXT.ask, [(unit * n).toLocaleString('ko-KR')])
    const move = isSeal ? null : tmMove(data.items.get(itemRow.item), data.items.tmMoves)
    return say(confirmLine(isSeal ? 0 : itemRow.item, isBP), [
      name(itemRow.item), String(n), (unit * n).toLocaleString('ko-KR'), move === null ? '' : data.moveNames[move] ?? '',
    ])
  }
  const clerk = ((): { text: string, tone: 'clerk' | 'refuse', next: boolean } | null => {
    switch (step.kind) {
      case 'list':
        // 끝 줄에 서면 점원이 묻는다 (롬 2)
        return onEnd ? { text: say(MART_TEXT.more, []), tone: 'clerk', next: false } : null
      case 'count':
        if (!itemRow) return null
        return {
          text: tab === 'buy'
            ? say(isBP ? MART_TEXT.bpHowMany : MART_TEXT.howMany, [name(itemRow.item)])
            : sayBag(SELL_TEXT.howMany, [name(itemRow.item)]),
          tone: 'clerk',
          next: false,
        }
      case 'confirm': return { text: confirmAsk(step.n), tone: 'clerk', next: false }
      case 'finish': {
        const refused = step.line === say(MART_TEXT.noMoney, []) || step.line === say(MART_TEXT.noBP, [])
        return { text: step.line, tone: refused ? 'refuse' : 'clerk', next: true }
      }
      case 'premier': case 'sold': return { text: step.line, tone: 'clerk', next: true }
      case 'bye': return { text: step.line, tone: 'clerk', next: false }
    }
  })()

  // ── 계산대 ───────────────────────────────────────────────────────────────
  const walletLabel = isBP ? (data?.bag[97] ?? '').split('\n')[0] ?? '' : data?.shop[MONEY_WINDOW_TEXT.label] ?? ''
  const wallet = amount(purse)
  const tmMoveId = itemRow && data && !isSeal ? tmMove(data.items.get(itemRow.item), data.items.tmMoves) : null
  const moveRow = tmMoveId !== null ? data?.moves?.byId.get(tmMoveId) : undefined
  const heroName = tmMoveId !== null && data?.moveNames[tmMoveId] ? data.moveNames[tmMoveId] : itemRow ? name(itemRow.item) : ''
  const poolName = itemRow && !isSeal ? data?.pockets[itemRow.pocket] ?? '' : ''
  const buying = step.kind === 'count' || step.kind === 'confirm'
  const canAfford = tab === 'sell' || purse >= unit

  const renderCounter = () => {
    // 끝 줄 · 빈 판다 — 지갑만 크게 선다
    if (!itemRow) {
      return (
        <div className={own.walletBig}>
          <span>{walletLabel}</span>
          <span key={purse} className={own.walletBigValue}>{wallet}</span>
        </div>
      )
    }
    if (buying) {
      const n = step.kind === 'count' || step.kind === 'confirm' ? step.n : 1
      const sum = receipt(purse, unit, n, tab === 'sell')
      const sign = sum.delta < 0 ? '−' : '+'
      const bonus = tab === 'buy' && !isSeal ? premierBonus(itemRow.item, n) : null
      const have = tab === 'sell' ? `${String(itemRow.have)} → ${String(itemRow.have - n)}` : `${String(itemRow.have)} → ${String(itemRow.have + n)}`
      return (
        <div className={own.receipt}>
          <div className={own.receiptHead}>
            <span className={own.heroIcon} style={iconOf(itemRow.item, RECEIPT_ICON)} aria-hidden />
            <span>
              <div className={own.heroName} style={{ textAlign: 'left' }}>{heroName}</div>
              {/* 롬 20의 숫자 칸에 「5 → 8」을 넣는다 — 우리 말을 안 붙인다 */}
              <div className={own.heroSub} style={{ textAlign: 'left' }}>
                {poolName} · {fillMenuText(data?.shop[MART_TEXT.inBag] ?? '', [have])}
              </div>
            </span>
          </div>
          <div className={own.receiptRow}>
            <span className={own.receiptPurse}>{walletLabel}</span>
            <span className={own.receiptPurse}>{wallet}</span>
          </div>
          <div className={own.receiptRow}>
            {step.kind === 'count'
              ? <CountPicker value={n} min={1} max={Math.max(1, max)} />
              : <span className={own.receiptDelta}>{`×${String(n).padStart(3, '0')}`}</span>}
            <span className={own.receiptDelta}>{sign}{amount(Math.abs(sum.delta))}</span>
          </div>
          <div className={`${own.receiptRow} ${own.receiptAfter}`}>{amount(sum.after)}</div>
          {bonus !== null && (
            <div className={own.bonus}>
              <span className={css.icon} style={itemIcon(data?.icons, bonus, LIST_ICON)} aria-hidden />
              {name(bonus)} +1
            </div>
          )}
          {step.kind === 'confirm' && (
            <div className={own.yesNo}>
              <span className={pickBand.y} aria-hidden style={bandAt('y', step.yes ? 0 : 1)}>
                <span className={css.caret} />
              </span>
              {[true, false].map((yes) => (
                <div
                  key={String(yes)}
                  className={step.yes === yes ? `${own.yesNoItem} ${own.yesNoOn}` : own.yesNoItem}
                  onPointerMove={(e) => { if (pointerMoved(e) && step.yes !== yes) setStep({ ...step, yes }) }}
                  onClick={() => {
                    setStep({ ...step, yes })
                    if (yes) { if (tab === 'sell') sell(step.n); else buy(step.n) } else { setCursor(at); setStep({ kind: 'list' }) }
                  }}
                >
                  {data?.menu[yes ? YES_NO.yes : YES_NO.no] ?? ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    // 목록 단계 — 지갑 · 영웅 · 값
    return (
      <>
        <div className={own.wallet}>
          <span>{walletLabel}</span>
          <span key={purse} className={own.walletValue}>{wallet}</span>
        </div>
        <div className={own.hero}>
          <span className={own.heroIcon} style={iconOf(itemRow.item, HERO_ICON)} aria-hidden />
          <GroundShadow w={112} h={14} />
          <div className={own.heroName}>{heroName}</div>
          {/* 기술머신은 이름이 기술이라 도구 이름이 한 줄 밑으로 내려간다 */}
          {tmMoveId !== null && <div className={own.heroSub}>{name(itemRow.item)}</div>}
          {tab === 'buy' && (
            <div className={own.heroSub}>
              {poolName} · {fillMenuText(data?.shop[MART_TEXT.inBag] ?? '', [String(itemRow.have)])}
            </div>
          )}
        </div>
        <div className={canAfford ? own.bigPrice : `${own.bigPrice} ${own.bigPriceBad}`}>
          {amount(unit)}
        </div>
        {moveRow && (
          <div className={own.moveInfo}>
            <TypeBadge type={moveRow.type} />
            <MoveFacts move={moveRow} layout="column" description={false} />
          </div>
        )}
      </>
    )
  }

  const entries = entriesOf(rows, tab === 'sell')
  const kind = isBP ? 'bp' : tab
  const noSell = isBP || isSeal
  const foot = step.kind === 'count'
    ? '↑↓ 개수 · ←→ ±10 · Z 결정 · X 그만둔다'
    : step.kind === 'confirm'
      ? '↑↓ 고르기 · Z 결정 · X 그만둔다'
      : step.kind !== 'list'
        ? 'Z 다음'
        : noSell
          ? '↑↓ 고르기 · Z 결정 · X 닫기'
          : '←→ 산다/판다 · ↑↓ 고르기 · Z 결정 · X 닫기'

  return (
    <MenuScreen
      title={kind === 'sell' ? '판다' : kind === 'bp' ? (data?.frontierTitle ?? walletLabel) : '산다'}
      {...(noSell ? {} : {
        tabs: {
          pages: [{ key: 'buy', label: '산다' }, { key: 'sell', label: '판다' }],
          at: tab === 'buy' ? 0 : 1,
          onPick: (i: number) => { if (step.kind === 'list' && (i === 0) !== (tab === 'buy')) switchTab() },
        },
      })}
      note={`${String(rows.length - 1)}종`}
      foot={foot}
    >
      <div className={own.stage}>
        <div className={own.ledgerBox}>
          <div
            key={kind}
            className={`${own.ledger} ${scrollList}`}
            onScroll={(e) => { setScrolled(Math.round(e.currentTarget.scrollTop / own.ROW)) }}
          >
            {entries.map((entry) => {
              if (entry.kind === 'head') {
                // 판다 목록은 주머니별로 가른다 — 머리는 판이 아니라 `[아이콘 16] 이름 ───`이다
                return (
                  <div key={`head-${String(entry.pocket)}`} className={css.sectionHead}>
                    <span style={pocketIcon(data?.bagSprite, entry.pocket, false, 16)} aria-hidden />
                    {data?.pockets[entry.pocket] ?? ''}
                  </div>
                )
              }
              const r = entry.row
              const on = entry.index === at
              if (r.kind === 'end') {
                return (
                  <div
                    key="end"
                    className={on ? css.rowOn : css.row}
                    ref={on ? scrollIntoView : undefined}
                    {...(on ? { 'data-on': '' } : {})}
                  >
                    {on && <span className={css.caret} aria-hidden />}
                    <span className={own.line}>
                      <span className={own.iconSlot} aria-hidden />
                      <span className={css.label}>{data?.shop[MART_TEXT.closeRow] ?? ''}</span>
                    </span>
                  </div>
                )
              }
              const item = isSeal ? undefined : data?.items.get(r.item)
              const rowMove = item && data ? tmMove(item, data.items.tmMoves) : null
              const tm = rowMove !== null && item !== undefined
              const rowName = tm && data?.moveNames[rowMove] ? data.moveNames[rowMove] : name(r.item)
              const number = tm && item ? `${item.constant.startsWith('ITEM_HM') ? 'HM' : 'No'}${pad2(tmNumber(item) ?? 0)}` : null
              const berry = r.pocket === POCKET_BERRIES && !tm
              const tint = tm && data?.moves
                ? { '--tint': typeColor(data.moves.byId.get(rowMove)?.type ?? 0) } as CSSProperties
                : undefined
              const bad = tab === 'buy' && purse < r.price
              return (
                <div
                  key={`${String(r.item)}-${String(entry.index)}`}
                  className={on ? css.rowOn : css.row}
                  ref={on ? scrollIntoView : undefined}
                  {...(on ? { 'data-on': '' } : {})}
                >
                  {on && <span className={css.caret} aria-hidden />}
                  <span className={own.line}>
                    {number !== null && <span className={own.number}>{number}</span>}
                    {tm
                      ? <span className={own.typeTick} style={tint} aria-hidden />
                      : (
                        <>
                          {berry && <span className={own.number}>No{pad2(berryNumber(r.item))}</span>}
                          {!isSeal && <span className={css.icon} style={itemIcon(data?.icons, r.item, LIST_ICON)} aria-hidden />}
                          {isSeal && sealIcons && (
                            <span className={own.iconSlot} aria-hidden>
                              <i style={{ display: 'block', margin: '4px', ...pixelSprite(sealIcons, r.item - 1, PIXEL.x1) }} />
                            </span>
                          )}
                        </>
                      )}
                    {rowName === '' ? <span className={own.nameSkeleton} aria-hidden /> : <span className={css.label}>{rowName}</span>}
                    <span className={own.lead} aria-hidden />
                    <span className={own.have}>{r.have > 0 ? `×${String(r.have)}` : ''}</span>
                    <span className={bad ? `${own.price} ${own.priceBad}` : own.price}>{amount(r.price)}</span>
                  </span>
                </div>
              )
            })}
            {/* 팔 것이 없다 — 「그만둔다」 한 줄 밑에 흐린 도구 주머니 아이콘 */}
            {rows.length === 1 && (
              <div className={own.emptyArt} aria-hidden>
                <span style={pocketIcon(data?.bagSprite, 0, false, EMPTY_ICON)} />
              </div>
            )}
          </div>
          <ScrollKnob at={scrolled} visible={VISIBLE_ROWS} total={entries.length} />
        </div>

        <div className={own.counter}>{renderCounter()}</div>

        {/* 아래 띠 — 글 한 덩이. 점원의 말은 Galmuri, 도구 설명은 Pretendard로 말하는 이가 갈린다 */}
        <div className={own.band}>
          {clerk !== null
            ? (
              <>
                <div className={own.bandText[clerk.tone]}>{clerk.text}</div>
                {clerk.next && <span className={own.nextMark} aria-hidden />}
              </>
            )
            : itemRow && !isSeal ? <div className={own.bandText.desc}>{data?.descriptions[itemRow.item] ?? ''}</div> : null}
        </div>
      </div>
    </MenuScreen>
  )
}
