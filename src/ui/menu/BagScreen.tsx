// 가방 — 주머니 8개, 좌우로 넘긴다.
//
// 주머니마다 나열 순서가 다르다. 나무열매와 기술머신은 번호순, 나머지는 주운
// 순서다 (`engine/bag/bag.ts`). 그 차이가 여기서 눈에 보이므로 정렬을 다시
// 하지 않고 저장된 순서를 그대로 그린다.
//
// ⚠️ **배치가 원작 것이다** (DESIGN.md §5). 왼쪽에 가방이 서고, 오른쪽이 도구
// 목록, 아래 폭 전체가 설명이다. 한때 「왼쪽 목록 / 오른쪽 상세」였는데 그건
// 설정 앱의 배치고, 그렇게 두면 이 화면이 어느 게임의 것인지가 안 남는다.
//
// ⚠️ 설명칸에 **아이콘을 크게** 세운다. 목록의 28픽셀짜리로는 무엇을 고르고
// 있는지가 안 보인다 — 원작도 위 화면에 고른 물건을 크게 띄운다.
//
// ⚠️ **Z는 갈래 메뉴를 연다** (`MakeItemActionsMenu`). 쓴다·건네준다·버린다·등록·
// 태그확인이 다 그 안에 있다 — 한때 Z가 곧바로 「쓴다」였고 등록은 따로 키를,
// 태그는 Tab을 받았는데 그 둘은 원작에 없는 길이고 버리기는 아예 없었다.
// 스크립트가 고르라고 연 가방과 파티에서 「건네준다」로 연 가방만 메뉴 없이
// 곧바로 고른다 — 원작도 그 둘은 갈래를 안 띄운다.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  loadBagSprite, loadItemDescriptions, loadItemIcons, loadItemNames, loadItems, loadMoveNames, loadMoves,
  loadPokeIcons, loadSpecies, loadSpeciesNames, type ItemTable, type MoveTable, type SpeciesTable,
} from '../../data/gameData'
import { BAG_MENU, fillMenuText, loadUiText, MONEY_WINDOW_TEXT, SHOP_TEXT, START_MENU, YES_NO } from '../../data/uiText'
import type { DataLocale } from '../../data/gameData'
import { POCKET_BERRIES, POCKET_SIZE, POCKET_TMHMS } from '../../engine/bag/bag'
import { BINDINGS } from '../../engine/input/keys'
import { keyList } from '../../engine/input/keyNames'
import { keyLocale } from '../../engine/input/controlLegend'
import { mailTypeOfItem } from '../../engine/world/mail'
import type { PokemonInstance } from '../../engine/pokemon/instance'
import { useMenuStore } from '../../state/menuStore'
import { itemChoice } from './itemChoice'
import { fieldContextNow, performItemAction } from './itemAction'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import type { BagSprite, ItemIcons, PokeIcons } from '../../data/schema'
import { clampCursor, scrollIntoView, useMenuKeys, wrapCursor } from './useMenuKeys'
import { fieldAction, FieldUse, tmMove } from '../../engine/bag/fieldUse'
import { tradeEvolutionItems } from '../../engine/pokemon/evolution'
import { itemIcon } from './itemIcon'
import { bagArt, pocketIcon } from './bagArt'
import { withHeldItem } from './formChange'
import { heldItemKeepsGiratinaForm, ITEM_GRISEOUS_ORB, SPECIES_GIRATINA } from '../../engine/pokemon/form'
import { world as mapWorld } from '../../engine/map/world'
import { typeColor } from '../../engine/battle/typeColor'
import { withObject } from '../korean'
import { ChoiceMenu } from '../common/ChoiceMenu'
import { CountPicker } from '../common/CountPicker'
import { GroundShadow } from '../common/GroundShadow'
import { MoveFacts } from '../common/MoveFacts'
import { ScrollKnob, scrollList } from '../common/ScrollKnob'
import { TypeBadge } from '../common/TypeBadge'
import { usePopPlacement } from '../common/usePopPlacement'
import { YesNo } from '../common/YesNo'
import * as popCss from '../common/choiceMenu.css'
import { MenuScreen } from './MenuScreen'
import { menuUiText, type BagFootMode } from './menuUiText'
import { monIcon } from './pokeIcon'
import {
  berryNumber, cursorRows, movablePocket, pad2, reorder, rowKind, tmNumber,
} from './bagRows'
import * as css from './menuChrome.css'
import * as own from './bagScreen.css'
import { pointerMoved } from '../pointerMoved'
import { GAP } from '../theme/scale'

/** 목록의 아이콘. 칸(32)의 1배 — 줄 높이와 같다 (정수배) */
const LIST_ICON = 32
/** 설명칸의 아이콘. 이 화면에서 제일 큰 그림이어야 한다 (2배) */
const BIG_ICON = 64
/** 왼쪽에 선 가방. 원작 스프라이트가 64픽셀이라 정수배로만 키운다 */
const BAG_ART = 192
/** 주머니 아이콘. 원작이 16픽셀이라 역시 정수배 */
const POCKET_ICON = 32
/** 빈 주머니의 흐린 아이콘 (4배) */
const POCKET_EMPTY_ICON = 64
/** 목록 줄 높이 (`LINE.row`와 같다 — 스크롤 눈금이 이 값으로 센다) */
const ROW = 32

/** 가방 뱅크(7)의 줄 — 「닫는다」와 그 설명, 「어디에 넣겠습니까?」(줄 옮기기) */
const BAG_LINE = { close: 41, closeDesc: SHOP_TEXT.close, moveWhere: 45 } as const
/**
 * `POCKET_MAIL` (`constants/items.h`). 이 주머니의 「쓴다」 자리는 「본다」다.
 * 편지지가 드나드는 주머니라 메일 화면·메일박스도 이 번호를 쓴다
 */
export const POCKET_MAIL = 5

interface Loaded {
  items: ItemTable
  names: string[]
  descriptions: string[]
  icons: ItemIcons
  /**
   * 가방 그림. **없을 수 있다.**
   *
   * ⚠️ `bagSprite`는 필수 그룹이 아니고(`install/required.ts`), 새 그룹은
   * **이미 깔린 설치본에 저절로 안 들어온다** (IMPORT.md §15). 그러면 이
   * 한 장이 없다는 이유로 목록·이름·설명까지 통째로 없는 화면이 뜬다 —
   * 실측으로 왼쪽 칸이 빈 채 주머니 아이콘 여덟과 주머니 이름이 다 사라졌다.
   * `bagArt`·`pocketIcon`은 처음부터 `undefined`를 받게 돼 있다
   */
  bag: BagSprite | undefined
  pockets: string[]
  /** 가방 뱅크 — 갈래 이름과 버리기 흐름의 말 (`BAG_MENU`) */
  bagText: string[]
  /** 메뉴 뱅크 — 예·아니오 (`YES_NO`) */
  menuText: string[]
  /** 시작 메뉴 뱅크 367 — 화면 제목 「가방」(`START_MENU.bag`). 이미 시작 메뉴가 받아 둔 뱅크다 */
  menuTitles: string[]
  /** 상점 뱅크 543 — 소지금 틀 (`MONEY_WINDOW_TEXT.amount`). 소지금 창(`CurrencyWindow`)과 같은 뱅크다 */
  shopText: string[]
  /**
   * 종족·기술 표.
   *
   * ⚠️ **도구를 「건네준다」로 붙이는 자리 때문에 필요하다** — 백금옥을 쥐여
   * 주면 그 자리에서 기라티나의 폼과 능력치가 바뀐다 (PARITY §3.4)
   */
  species: SpeciesTable
  moves: MoveTable
  /**
   * 기술 이름 · 파티 아이콘 · 종족 이름 — **없어도 화면은 선다.** 기술머신 줄이 기술 이름 대신 도구 이름으로,
   * 건네주기 표지가 아이콘 없이 떨어진다 (`loadBagData`의 `catch`)
   */
  moveNames: string[]
  pokeIcons: PokeIcons | undefined
  speciesNames: string[]
}

/**
 * 가방이 기억하는 자리 — 주머니 하나와 주머니마다의 커서 (`BagCursor`).
 *
 * 원작은 필드가 이것을 들고 있어서(`field_system.h`의 `bagCursor`) 상처약을
 * 먹이고 돌아오거나 가방을 닫았다 열어도 그 주머니 그 칸이다
 * (`applications/bag/main.c` · `bag.c`). 우리 화면은 파티를 올리면 가방이
 * 내려가므로(`MenuLayer`가 맨 위 하나만 그린다) 화면 상태에 두면 매번 첫
 * 주머니 첫 칸으로 돌아간다. 그래서 **모듈에 둔다.** 닫을 때(`closeAll`)도 안
 * 지운다 — 원작도 안 지운다
 */
export const bagMemory: { pocket: number; pos: number[] } = { pocket: 0, pos: [] }

/**
 * 기억해 둔 그 주머니의 커서. 목록이 그새 줄었으면 끝 칸으로 당긴다.
 *
 * ⚠️ **끝 칸은 마지막 도구가 아니라 「닫는다」 줄이다** — 줄은 `0..itemCount`이고 `itemCount`째가 닫는다다
 * (`cursorRows`). 하네스 `bagCursor`가 같은 값을 읽는다
 */
export function recallCursor(pocket: number, itemCount: number): number {
  return Math.max(0, Math.min(bagMemory.pos[pocket] ?? 0, cursorRows(itemCount) - 1))
}

/** 갈래 메뉴의 항목 (`ITEM_ACTION_*`) */
type BagAction =
  | 'checkTag' | 'use' | 'walk' | 'check' | 'open' | 'plant'
  | 'give' | 'trash' | 'register' | 'deselect' | 'cancel'

/** 항목 → 가방 뱅크의 줄 (`BagUI_LoadItemActionStrings`) */
export const BAG_ACTION_LINE: Readonly<Record<BagAction, number>> = {
  checkTag: BAG_MENU.checkTag, use: BAG_MENU.use, walk: BAG_MENU.walk, check: BAG_MENU.check,
  open: BAG_MENU.open, plant: BAG_MENU.plant, give: BAG_MENU.give, trash: BAG_MENU.trash,
  register: BAG_MENU.register, deselect: BAG_MENU.deselect, cancel: BAG_MENU.cancel,
}

/** 메뉴를 짤 때 보는 것 */
interface BagActionInput {
  /** 지금 주머니 (`POCKET_*`) */
  pocket: number
  item: number
  fieldUseFunc: number
  /**
   * 지닌 채 교환해야 하던 도구인가 (PARITY §12.2). 원작은 갈래가 0이라 「쓴다」가
   * 안 오르는데, 우리는 교환이 없으므로 진화의돌처럼 쓴다 (`fieldAction`과 같다)
   */
  evoItem: boolean
  preventToss: boolean
  canRegister: boolean
  /** 지금 등록된 도구 */
  registered: number
  /** 자전거를 타고 있는가 */
  cycling: boolean
  /** 앞 칸이 빈 나무열매 밭인가 (`BerryPatch_IsEmpty`) */
  berryPatchEmpty: boolean
}

/**
 * 고른 물건의 갈래 메뉴 (`MakeItemActionsMenu`의 `BAG_MODE_NORMAL`).
 *
 * 차례가 원작 것이다 — 나무열매 주머니면 태그확인이 맨 위, 그 다음 쓴다 자리,
 * 건네준다·버린다(중요한 물건이 아닐 때만 · 기술머신은 못 버린다), 등록·해제,
 * 끝에 그만둔다. 콜로세움·유니온룸 갈래는 통신이라 없다
 */
export function bagActions(input: BagActionInput): BagAction[] {
  const out: BagAction[] = []
  if (input.pocket === POCKET_BERRIES) out.push('checkTag')
  if (input.fieldUseFunc !== FieldUse.NONE || input.evoItem) {
    if (input.fieldUseFunc === FieldUse.BICYCLE && input.cycling) out.push('walk')
    else if (input.pocket === POCKET_MAIL) out.push('check')
    else if (input.fieldUseFunc === FieldUse.POFFIN_CASE) out.push('open')
    else if (input.pocket === POCKET_BERRIES && input.berryPatchEmpty) out.push('plant')
    else out.push('use')
  }
  if (!input.preventToss) {
    out.push('give')
    if (input.pocket !== POCKET_TMHMS) out.push('trash')
  }
  if (input.canRegister) out.push(input.registered === input.item ? 'deselect' : 'register')
  out.push('cancel')
  return out
}

/**
 * 버릴 개수를 키 하나만큼 옮긴다 (`sub_0208C15C`).
 *
 * 위아래는 하나씩이고 **끝에서 돈다**(최대에서 위 → 1 · 1에서 아래 → 최대).
 * 좌우는 열씩이고 돌지 않는다 — 1과 최대에서 멈춘다
 */
export function trashStep(count: number, limit: number, key: 'up' | 'down' | 'left' | 'right'): number {
  switch (key) {
    case 'up': return count + 1 > limit ? 1 : count + 1
    case 'down': return count - 1 <= 0 ? limit : count - 1
    case 'left': return Math.max(1, count - 10)
    case 'right': return Math.min(limit, count + 10)
  }
}

/** 건네줄 마리를 골랐을 때 일어나는 일 (`ProcessItemApplication`). 파티 화면의 건네주기가 이것으로 갈린다 */
type GiveVerdict = 'given' | 'swap' | 'mustRemoveMail' | 'cannotHold'

/**
 * 고른 마리에게 그 도구를 붙일 수 있는가.
 *
 * ⚠️ **백금옥이 먼저다** — 기라티나가 아니면 손이 비었든 말든 못 지닌다.
 * 메일을 든 마리는 메일부터 떼야 하고, 무엇을 든 마리는 맞바꿀지 묻는다.
 * 알은 막지 않는다 — 원작의 이 길에 알 검사가 없다
 */
export function giveVerdict(mon: Pick<PokemonInstance, 'species' | 'heldItem'>, item: number): GiveVerdict {
  if (item === ITEM_GRISEOUS_ORB && mon.species !== SPECIES_GIRATINA) return 'cannotHold'
  if (mon.heldItem === 0) return 'given'
  if (mailTypeOfItem(mon.heldItem) !== null) return 'mustRemoveMail'
  return 'swap'
}

/** 롬 줄의 줄바꿈을 바닥 한 줄로 편다. 바닥줄은 한 줄이라 `\n`이 그대로 찍힌다 */
function oneLine(text: string): string {
  return text.replace(/[\n\r\f]+/g, ' ').trim()
}

/**
 * 메뉴가 떠 있는 동안의 단계.
 *
 * ⚠️ **「건네준다」는 여기 없다.** 원작은 가방을 닫고 파티 화면을 건네주기(`PARTY_MENU_MODE_GIVE_ITEM`)로 연다 —
 * 마리 고르기·맞바꿀지 묻기·말이 다 그 화면의 일이고(`ProcessItemApplication`), 끝나면 가방으로 돌아온다
 */
type Menu =
  /** 갈래 메뉴. 항목은 연 순간에 정한다 — 그 자리의 앞 칸·자전거가 갈래를 바꾼다 */
  | { kind: 'actions'; list: readonly BagAction[] }
  /** 몇 개 버릴까 */
  | { kind: 'count'; n: number }
  /** 그만큼 버려도 괜찮나 */
  | { kind: 'trash'; n: number }

/** 바닥 안내. 메뉴가 떠 있으면 그 단계의 키만 적는다 */
export function bagFoot(
  mode: BagFootMode, movable = false, locale: DataLocale = 'ko',
): string {
  return menuUiText(locale).bagFoot(mode, movable)
}

/**
 * **가방 화면이 쓰는 자료를 한 번에 받는다** — 시작 메뉴가 열릴 때 미리 데운다(`StartMenu`).
 *
 * ⚠️ **다 오기 전에는 화면을 안 그린다**(아래 `data === null`). 실측(2026-10-10 연쇄 P4 영상 48:33~48:45):
 * 깨어진 세계처럼 바쁜 맵에서 금액과 노란 줄만 있고 도구 이름 · 주머니가 빈 가방이 몇 프레임 떴다.
 * 로더는 실패를 캐시하지 않으므로(`gameData`의 `cache.delete`) 세 번까지 다시 받는다
 */
export async function loadBagData(locale: Parameters<typeof loadItemNames>[0]): Promise<Loaded> {
  let last: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [
        items, names, descriptions, icons, pockets, species, moves,
        bagText, menuText, menuTitles, shopText, bag, moveNames, pokeIcons, speciesNames,
      ] = await Promise.all([
        loadItems(), loadItemNames(locale), loadItemDescriptions(locale),
        loadItemIcons(), loadUiText('bagPockets', locale), loadSpecies(), loadMoves(),
        loadUiText('bag', locale), loadUiText('menuEntries', locale),
        // 제목과 소지금 틀은 없어도 가방이 뜬다 — 낱개로 받는다
        loadUiText('startMenu', locale).catch(() => [] as string[]),
        loadUiText('shop', locale).catch(() => [] as string[]),
        // ⚠️ **이 하나만 낱개로 받는다.** 나머지는 다 필수 그룹이라 없으면
        // 애초에 게임이 안 열리는데, 이것은 아니다 — 한 뭉치로 묶으면 그림
        // 한 장 때문에 도구 목록까지 같이 없어진다 (위 `bag` 주석)
        loadBagSprite().catch(() => undefined),
        // 아래 셋도 낱개다 — 기술머신 줄 · 건네주기 표지가 없다는 이유로 가방이 통째로 안 뜨면 안 된다
        loadMoveNames(locale).catch(() => [] as string[]),
        loadPokeIcons().catch(() => undefined),
        loadSpeciesNames(locale).catch(() => [] as string[]),
      ])
      return {
        items, names, descriptions, icons, bag, pockets, species, moves, bagText, menuText, menuTitles, shopText,
        moveNames, pokeIcons, speciesNames,
      }
    } catch (e) {
      last = e
      await new Promise((ok) => setTimeout(ok, 300 * (attempt + 1)))
    }
  }
  throw last
}

/**
 * 개수 고르기 창 — 고른 줄 옆에 뜨는 작은 창 한 장. 갈래 창(`ChoiceMenu`)과 같은 살갗이고 안에 ▲ ×003 ▼가 선다.
 * 키는 화면이 `useMenuKeys`로 받는다 (↑↓ ±1 · ←→ ±10 — `trashStep`)
 */
function CountWindow(
  { anchor, within, value, max }: {
    anchor: HTMLElement | null, within: HTMLElement | null, value: number, max: number
  },
) {
  const pop = usePopPlacement(anchor, within, 'right', value)
  return (
    <div
      ref={pop.ref}
      className={[popCss.root, pop.fixed ? popCss.rootFixed : '', pop.nib].filter(Boolean).join(' ')}
      style={{ ...pop.style, minWidth: 132 }}
    >
      <div className={own.countBox}>
        <CountPicker value={value} min={1} max={max} />
      </div>
    </div>
  )
}

export function BagScreen() {
  const [data, setData] = useState<Loaded | null>(null)
  // 설정의 언어. 바뀌면 이름과 설명을 그 언어로 다시 받는다
  const locale = useGameLocale()
  const [pocket, setPocket] = useState(() => bagMemory.pocket)
  const [pos, setPos] = useState<number[]>(() => [...bagMemory.pos])
  /** 한 줄 알림 — 못 쓰는 이유 · 버렸다 · 지니게 했다. 원작도 한 줄 띄우고 만다. 설명 띠의 대사 줄에 뜬다 */
  const [notice, setNotice] = useState<string | null>(null)
  const [open, setOpen] = useState<Menu | null>(null)
  /** 줄 옮기기 (SELECT) — `from`의 줄을 `to` 자리로 끌고 간다 */
  const [moving, setMoving] = useState<{ from: number, to: number } | null>(null)
  /** 갈래 창이 앉을 원인(고른 줄 안의 점)과 넘지 말아야 할 목록 칸 */
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [within, setWithin] = useState<HTMLElement | null>(null)
  /** 목록이 맨 위에서 몇 줄 내려왔나 (스크롤 눈금) */
  const [scrolled, setScrolled] = useState(0)
  /** 주머니를 넘긴 횟수 — 가방이 들썩이게 하는 열쇠 · 이름표가 들어오는 쪽 */
  const [hop, setHop] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const back = useMenuStore((s) => s.back)
  const bag = useSaveStore((s) => s.bag)
  const money = useSaveStore((s) => s.money)
  const party = useSaveStore((s) => s.party)
  // 가방 그림이 남·여 두 벌이다 (`bag_sprite_{male,female}`)
  const gender = useSaveStore((s) => s.trainer.gender)
  const removeItem = useSaveStore((s) => s.removeItem)
  const addItem = useSaveStore((s) => s.addItem)
  const openPartyWithItem = useMenuStore((s) => s.openPartyWithItem)
  const openPartyToGive = useMenuStore((s) => s.openPartyToGive)
  const giveTo = useMenuStore((s) => s.giveTo)
  const pickPocket = useMenuStore((s) => s.pickPocket)
  const closeAll = useMenuStore((s) => s.closeAll)
  const registered = useSaveStore((s) => s.registeredItem)
  const push = useMenuStore((s) => s.push)
  const openBerryTag = useMenuStore((s) => s.openBerryTag)
  /** 등록 키의 이름. 손으로 적으면 키를 옮긴 날부터 거짓말이 된다 (`BINDINGS`) */
  const registerKey = keyList(BINDINGS.register, keyLocale(locale))

  useEffect(() => {
    let alive = true
    void loadBagData(locale)
      .then((loaded) => { if (alive) setData(loaded) })
      // 세 번 받아도 안 되면 드러낸다 — 예전에는 여기서 삼켜서 이름 없는 가방이 영영 떴다
      .catch((e: unknown) => { console.error('가방 자료를 못 받았다', e) })
    return () => { alive = false }
  }, [locale])

  /**
   * 지닌 채 교환해야 하던 도구들 (PARITY §12.2). 종족표에서 뽑아 롬 이름표로
   * 바꾼다 — 도구표의 갈래(`fieldUseFunc`)로는 못 찾는다
   */
  const evoItems = useMemo(() => {
    if (!data) return undefined
    const out = new Set<string>()
    for (const id of tradeEvolutionItems(data.species.all)) {
      const constant = data.items.all[id]?.constant
      if (constant !== undefined) out.add(constant)
    }
    return out
  }, [data])

  // 스크립트가 고르라고 열었으면 그 주머니에 못 박힌다 (`FieldSystem_CreateBagContext`)
  const shown = pickPocket ?? pocket
  const stored = bag[shown] ?? []
  /** 옮기는 중이면 옮긴 뒤의 차례를 미리 보여 준다 — 놓기 전에는 저장에 안 쓴다 */
  const slots = moving === null ? stored : reorder(stored, moving.from, moving.to)
  /** 줄은 `0..slots.length`이고 `slots.length`째가 「닫는다」다 */
  const at = moving?.to ?? Math.max(0, Math.min(pos[shown] ?? 0, slots.length))
  const onClose = at === slots.length
  const selected = onClose ? undefined : slots[at]
  const itemName = (id: number): string => data?.names[id] ?? ''
  const line = (bank: readonly string[] | undefined, n: number, values: readonly string[] = []): string =>
    fillMenuText(bank?.[n] ?? '', values)

  /** 그 주머니의 커서를 옮기고 기억한다 */
  const moveCursor = (to: number): void => {
    const next = [...pos]
    next[shown] = to
    bagMemory.pos[shown] = to
    setPos(next)
  }

  const choosePocket = (to: number, d: 1 | -1 = to >= pocket ? 1 : -1): void => {
    if (pickPocket !== null) return
    setPocket(to)
    bagMemory.pocket = to
    setNotice(null)
    setDir(d)
    setHop((h) => h + 1)
  }

  /** 가방을 닫는다. 고르라고 열린 가방은 **0을 남기고** 닫는다 — 안 그러면 앞서 고른 도구가 그대로 남아 다시 심긴다 */
  const closeBag = (): void => {
    if (pickPocket === null) { back(); return }
    itemChoice.item = 0
    closeAll()
  }

  /**
   * 도구를 파티의 한 마리에게 붙인다 (`UpdatePokemonWithItem` · `SwapPokemonItem`).
   *
   * ⚠️ **이미 들고 있으면 맞바꾼다.** 원작이 들고 있던 것을 가방에 돌려주고
   * 새것을 붙인다 — 덮어쓰면 도구 하나가 세상에서 사라진다
   */
  const attachItem = (slot: number, id: number, from: number): void => {
    const current = useSaveStore.getState().party
    const mon = current[slot]
    if (!mon) return
    const held = mon.heldItem
    const next = [...current]
    // 백금옥을 쥐여 주면 그 자리에서 오리진이 된다 (PARITY §3.4).
    // ⚠️ **빈손에 쥐여 줄 때만** 깨어진 세계가 모습을 붙든다 (`UpdatePokemonWithItem`의 맵 검사) —
    // 맞바꾸기(`SwapPokemonItem`)에는 그 검사가 없어서 세계 안에서도 바뀐다 (REPAIR §94)
    const keep = held === 0 && heldItemKeepsGiratinaForm(mapWorld.mapId)
    next[slot] = withHeldItem({ ...mon, heldItem: id }, data?.species, data?.moves, keep)
    useSaveStore.setState({ party: next })
    removeItem(from, id, 1)
    if (held > 0) addItem(data?.items.get(held).pocket ?? 0, held, 1)
  }

  /**
   * 고른 물건을 쓴다 (PARITY §4.1).
   *
   * 무엇을 하는지는 도구표의 `fieldUseFunc`가 정한다 (`engine/bag/fieldUse`) —
   * 원작의 `sItemUseFuncs`와 같은 표다. 예전에는 자전거 하나만 반응하고
   * 나머지는 **눌러도 아무 일도 안 일어났다**
   */
  const applyItem = (id: number): void => {
    if (!data) return
    const item = data.items.get(id)
    const action = fieldAction(item, fieldContextNow(evoItems))
    performItemAction(action, {
      item: id,
      name: itemName(id),
      pocket: item.pocket ?? 0,
      say: (text) => { setNotice(oneLine(text)) },
      consume: removeItem,
      back,
      push,
      closeAll,
      openParty: (use) => { openPartyWithItem({ item: id, use }) },
    })
  }

  /** Z — 목록에서. 모드에 따라 닫기 · 고르기 · 건네기 · 메뉴 열기로 갈린다 */
  const confirmList = (): void => {
    // 「닫는다」 줄 — 원작도 이 줄에서 A가 가방을 닫는다 (`Bag_Text_CloseBag`)
    if (onClose) { closeBag(); return }
    const id = selected?.item
    // ⚠️ **고르라고 열린 가방은 쓰지 않는다.** 고른 번호만 남기고 닫는다 —
    // 스크립트가 그 뒤에 `GetSelectedItem`으로 읽는다
    if (pickPocket !== null) {
      if (id === undefined) return
      itemChoice.item = id
      closeAll()
      return
    }
    if (id === undefined || !data) return
    const item = data.items.get(id)
    // 「건네준다」로 열린 가방이다 (`ProcessItemListInput_GiveToMon`). 쓰는 것이
    // 아니라 **붙이는 것**이라 도구표의 갈래를 아예 안 본다. 중요한 물건만 거른다
    if (giveTo !== null) {
      if (item.preventToss === 1) { setNotice(oneLine(line(data.bagText, BAG_MENU.cantHold, [itemName(id)]))); return }
      attachItem(giveTo, id, item.pocket ?? 0)
      back()
      return
    }
    const ctx = fieldContextNow(evoItems)
    setNotice(null)
    setOpen({
      kind: 'actions',
      list: bagActions({
        pocket: shown,
        item: id,
        fieldUseFunc: item.fieldUseFunc ?? FieldUse.NONE,
        evoItem: evoItems?.has(item.constant) === true,
        preventToss: item.preventToss === 1,
        canRegister: item.canRegister === 1,
        registered,
        cycling: ctx.onBike === true,
        berryPatchEmpty: ctx.berryAhead?.empty === true,
      }),
    })
  }

  const runAction = (action: BagAction): void => {
    if (!data || !selected) return
    const id = selected.item
    switch (action) {
      case 'cancel':
        setOpen(null)
        return
      case 'checkTag':
        setOpen(null)
        // 나무열매 주머니의 줄 차례 그대로 ↑↓ 이웃 열매가 된다 (`openBerryTag(item, list)`)
        openBerryTag(id, slots.map((s) => s.item))
        return
      case 'use': case 'walk': case 'check': case 'open': case 'plant':
        setOpen(null)
        applyItem(id)
        return
      case 'give':
        // 메일은 지니게 하면서 **글부터 쓴다** (`PARTY_MENU_EXIT_CODE_WRITE_MAIL`) —
        // 「쓴다」와 같은 파티 화면 길이 그 일을 한다
        setOpen(null)
        if (mailTypeOfItem(id) !== null) {
          openPartyWithItem({ item: id, use: 'mail' })
          return
        }
        // 파티 화면이 「어느 포켓몬에게 건네줄까?」로 뜬다 (`BAG_EXIT_CODE_GIVE_ITEM` → `PARTY_MENU_MODE_GIVE_ITEM`)
        openPartyToGive(id)
        return
      case 'trash':
        // 하나뿐이면 개수를 안 묻고 곧바로 괜찮은지 묻는다 (`ItemActionFunc_Trash`)
        setOpen(selected.count === 1 ? { kind: 'trash', n: 1 } : { kind: 'count', n: 1 })
        return
      case 'register': case 'deselect': {
        const next = action === 'deselect' ? 0 : id
        useSaveStore.setState({ registeredItem: next })
        setOpen(null)
        // 원작은 표식만 바꾸고 말이 없다. 우리는 **무슨 키로 쓰는지**를 한 줄 적는다 —
        // 그 키가 DS의 Y가 아니라서 말해 주지 않으면 찾을 길이 없다
        const ui = menuUiText(locale)
        setNotice(next === 0
          ? ui.bagUnregistered(itemName(id))
          : ui.bagRegistered(itemName(id), locale === 'ko' ? withObject(itemName(id)) : itemName(id), registerKey))
        return
      }
    }
  }

  const trashYes = (n: number): void => {
    if (!data || !selected) return
    const id = selected.item
    removeItem(data.items.get(id).pocket ?? shown, id, n)
    setOpen(null)
    // 줄어든 목록에 맞춰 커서를 당긴다 (`RestrictItemListCursor`). 끝 칸은 「닫는다」 줄이다
    const left = selected.count > n ? slots.length : slots.length - 1
    moveCursor(Math.max(0, Math.min(at, left)))
    setNotice(oneLine(line(data.bagText, BAG_MENU.trashed, [itemName(id), String(n)])))
  }

  const countKey = (key: 'up' | 'down' | 'left' | 'right'): boolean => {
    if (open?.kind !== 'count' || !selected) return false
    const n = trashStep(open.n, selected.count, key)
    if (n === open.n) return false
    setOpen({ kind: 'count', n })
    return true
  }

  /** 줄 옮기기를 시작한다 (`StartMovingItem`) — 나무열매 · 기술머신은 저절로 늘어서므로 못 옮긴다 */
  const canMove = data !== null && pickPocket === null && giveTo === null && movablePocket(shown) && stored.length > 1
  const startMove = (): boolean => {
    if (!canMove || open || selected === undefined) return false
    setNotice(null)
    setMoving({ from: at, to: at })
    return true
  }
  /** 놓는다. 저장에 쓰는 것은 여기뿐이다 */
  const dropMove = (): void => {
    if (moving === null) return
    const placed = reorder(stored, moving.from, moving.to)
    if (moving.from !== moving.to) {
      useSaveStore.setState({ bag: bag.map((slotsOf, i) => (i === shown ? placed : slotsOf)) })
    }
    moveCursor(moving.to)
    setMoving(null)
  }

  /** ↑↓ — 목록 줄 하나. 끝에서 안 돈다. 안 움직였으면 `false`라 소리가 안 난다 */
  const stepRow = (d: number): boolean => {
    if (moving !== null) {
      // 옮기는 동안은 「닫는다」 줄로 못 간다 — 줄 끝은 마지막 도구 자리다
      const to = clampCursor(moving.to, d, slots.length)
      if (to === moving.to) return false
      setMoving({ ...moving, to })
      return true
    }
    setNotice(null)
    const next = clampCursor(at, d, cursorRows(slots.length))
    if (next === at) return false
    moveCursor(next)
    return true
  }

  // 갈래 창과 예/아니오는 제 키를 받는다 (`ChoiceMenu` · `YesNo`) — 화면은 그동안 목록 키를 끈다
  const popKeys = open?.kind === 'actions' || open?.kind === 'trash'
  useMenuKeys({
    up: () => (open?.kind === 'count' ? countKey('up') : stepRow(-1)),
    down: () => (open?.kind === 'count' ? countKey('down') : stepRow(1)),
    left: () => {
      if (open?.kind === 'count') return countKey('left')
      if (open || moving !== null || pickPocket !== null) return false
      choosePocket(wrapCursor(pocket, -1, POCKET_SIZE.length), -1)
      return undefined
    },
    right: () => {
      if (open?.kind === 'count') return countKey('right')
      if (open || moving !== null || pickPocket !== null) return false
      choosePocket(wrapCursor(pocket, 1, POCKET_SIZE.length), 1)
      return undefined
    },
    confirm: () => {
      if (open?.kind === 'count') { setOpen({ kind: 'trash', n: open.n }); return }
      if (moving !== null) { dropMove(); return }
      confirmList()
    },
    // ⚠️ 고르라고 열린 가방은 취소도 **0을 남기고** 닫아야 한다 (`closeBag`)
    cancel: () => {
      if (open) { setOpen(null); return }
      if (moving !== null) { setMoving(null); return }
      closeBag()
    },
    select: () => {
      if (moving !== null) { dropMove(); return undefined }
      return startMove()
    },
  }, !popKeys)

  /** 설명 띠의 대사 줄 (`Bag_Text_ItemIsSelected` · `ThrowAwayHowMany` · 줄 옮기기 · 알림). 롬 줄의 `\r`은 줄바꿈으로 편다 */
  const speech = ((): string | null => {
    if (!data) return null
    const name = selected ? itemName(selected.item) : ''
    if (open && selected) {
      switch (open.kind) {
        case 'actions': return line(data.bagText, BAG_MENU.selected, [name]).replace(/[\r\f]/g, '\n')
        case 'count': return line(data.bagText, BAG_MENU.trashHowMany, [name]).replace(/[\r\f]/g, '\n')
        case 'trash': return line(data.bagText, BAG_MENU.trashOk, [name, String(open.n)]).replace(/[\r\f]/g, '\n')
      }
    }
    if (moving !== null) return line(data.bagText, BAG_LINE.moveWhere, [name]).replace(/[\r\f]/g, '\n')
    return notice
  })()

  const mode = open?.kind === 'count' ? 'count'
    : open ? 'menu'
      : moving !== null ? 'move'
        : pickPocket !== null ? 'pick'
          : giveTo !== null ? 'give' : 'normal'

  // 자료가 오기 전의 반쪽 화면(금액 · 빈 줄)은 안 그린다 — 위 `loadBagData`
  if (data === null) return null

  // ── 줄 하나 ──────────────────────────────────────────────────────────────
  const dimmed = open !== null
  const renderRow = (slot: { item: number, count: number }, i: number) => {
    const item = data.items.get(slot.item)
    const kind = rowKind(shown, item)
    const on = i === at
    const rowMove = kind === 'tm' || kind === 'hm' ? tmMove(item, data.items.tmMoves) : null
    const rowMoveName = rowMove === null ? undefined : data.moveNames[rowMove]
    const label = rowMoveName !== undefined && rowMoveName !== '' ? rowMoveName : itemName(slot.item)
    const number = kind === 'tm' ? `No${pad2(tmNumber(item) ?? 0)}`
      : kind === 'hm' ? `HM${pad2(tmNumber(item) ?? 0)}`
        : kind === 'berry' ? `No${pad2(berryNumber(slot.item))}` : null
    const tint = rowMove === null
      ? undefined
      : { '--tint': typeColor(data.moves.byId.get(rowMove)?.type ?? 0) } as CSSProperties
    const counted = kind === 'plain' || kind === 'tm' || kind === 'berry'
    return (
      <div
        key={slot.item}
        className={[on ? css.rowOn : css.row, dimmed && !on ? own.faded : ''].filter(Boolean).join(' ')}
        ref={on ? scrollIntoView : undefined}
        onPointerMove={(e) => { if (pointerMoved(e) && !open && moving === null && !on) moveCursor(i) }}
      >
        {on && <span className={css.caret} aria-hidden />}
        {on && <span ref={setAnchor} className={own.popAnchor} aria-hidden />}
        <span className={own.line}>
          {number !== null && <span className={own.number}>{number}</span>}
          {kind === 'tm' || kind === 'hm'
            ? <span className={own.typeTick} style={tint} aria-hidden />
            : <span className={css.icon} style={itemIcon(data.icons, slot.item, LIST_ICON)} aria-hidden />}
          <span className={css.ledger} style={{ flex: '1 1 auto' }}>
            <span className={css.label}>{label}</span>
            {counted && <span className={`${css.ledgerLead} ${own.lead}`} aria-hidden />}
            {/* 등록한 물건에 표식 하나 (`BagUI_DrawRegisteredIcon`) — 그 물건을 쓰는 키 이름이다 */}
            {slot.item === registered && <span className={own.registered}>{registerKey}</span>}
            {counted && <span className={`${css.ledgerCount} ${own.countCol}`}>×{slot.count}</span>}
          </span>
        </span>
      </div>
    )
  }

  // ── 설명 띠 ──────────────────────────────────────────────────────────────
  const move = selected && data.items.tmMoves.length > 0
    ? tmMove(data.items.get(selected.item), data.items.tmMoves) : null
  const moveRow = move === null ? undefined : data.moves.byId.get(move)
  const closeLabel = data.bagText[BAG_LINE.close] ?? ''
  // 소지금 — 상점 뱅크 543의 19번 틀(ko 「N원」 · en 「$N」 · ja 「N¥」)이다. 없으면 숫자만 둔다
  const moneyFormat = data.shopText[MONEY_WINDOW_TEXT.amount]
  const moneyNote = moneyFormat ? fillMenuText(moneyFormat, [money.toLocaleString('ko-KR')]) : String(money)
  const giver = giveTo !== null ? party[giveTo] : undefined
  const giverName = giver ? giver.nickname ?? data.speciesNames[giver.species] ?? '' : ''

  return (
    <MenuScreen
      title={data.menuTitles[START_MENU.bag] ?? ''}
      note={moneyNote}
      // 바닥은 **키 안내만** 남는다 — 알림 · 물음 · 칸 수는 설명 띠와 레일 밑으로 옮겼다
      foot={bagFoot(mode, canMove, locale)}
      {...(giver
        ? {
          tag: (
            <span className={own.modeTag}>
              <span className={css.icon} style={monIcon(data.pokeIcons, giver, 32)} aria-hidden />
              {data.bagText[BAG_MENU.give] ?? ''} · {giverName}
            </span>
          ),
        }
        : {})}
    >
      <div className={own.stage}>
        {/* 왼쪽 — 가방이 선다. 열린 칸이 지금 주머니를 말한다 */}
        <div className={own.bay}>
          <span
            key={hop}
            className={hop > 0 ? `${own.bag} ${own.bagHopping}` : own.bag}
            style={bagArt(data.bag, shown, gender, BAG_ART)}
            aria-hidden
          />
          <GroundShadow w={140} h={14} style={{ marginTop: -GAP.base }} />
          <div className={own.pocketName}>
            {/* 고르라고 열린 가방은 그 주머니에 못 박히므로 화살표를 안 띄운다 */}
            <span className={own.arrow}>{pickPocket === null ? '◀' : ''}</span>
            <span key={shown} className={own.pocketNameText} style={{ '--from': `${String(12 * dir)}px` } as CSSProperties}>
              {data.pockets[shown] ?? ''}
            </span>
            <span className={own.arrow}>{pickPocket === null ? '▶' : ''}</span>
          </div>
          <div className={own.rail}>
            {data.pockets.map((name, i) => (
              <span
                key={name}
                className={pickPocket !== null && i !== shown ? `${own.railCell} ${own.railCellOff}` : own.railCell}
                title={name}
                onPointerDown={() => { if (!open && moving === null) choosePocket(i) }}
              >
                <span style={pocketIcon(data.bag, i, i === shown, POCKET_ICON)} aria-hidden />
              </span>
            ))}
            <span className={own.railMark} aria-hidden style={{ transform: `translateX(${String(shown * 36)}px)` }} />
          </div>
          <div className={own.capacity}>{stored.length} / {POCKET_SIZE[shown] ?? 0}</div>
        </div>

        <div className={own.listWrap} ref={setWithin}>
          <div
            key={shown}
            className={`${own.list} ${scrollList}`}
            onScroll={(e) => { setScrolled(Math.round(e.currentTarget.scrollTop / ROW)) }}
          >
            {slots.map(renderRow)}
            {/* 목록 끝 「닫는다」 줄 — 빈 주머니는 이 한 줄뿐이다 */}
            <div
              className={[onClose ? css.rowOn : css.row, dimmed && !onClose ? own.faded : ''].filter(Boolean).join(' ')}
              ref={onClose ? scrollIntoView : undefined}
              onPointerMove={(e) => { if (pointerMoved(e) && !open && moving === null && !onClose) moveCursor(slots.length) }}
            >
              {onClose && <span className={css.caret} aria-hidden />}
              <span className={own.line}>
                <span className={own.iconSlot} aria-hidden />
                <span className={css.label}>{closeLabel}</span>
              </span>
            </div>
            {slots.length === 0 && (
              <div className={own.emptyArt} aria-hidden>
                <span style={pocketIcon(data.bag, shown, false, POCKET_EMPTY_ICON)} />
              </div>
            )}
          </div>
          <ScrollKnob at={scrolled} visible={12} total={cursorRows(slots.length)} />
        </div>

        {/* 아래 — 원작도 설명은 화면 폭 전체다. 물음 · 알림이 같은 자리에 대사 줄로 선다 */}
        <div className={own.desc}>
          <span className={own.art}>
            {selected && (
              <>
                <span className={own.icon} style={itemIcon(data.icons, selected.item, BIG_ICON)} aria-hidden />
                <GroundShadow w={56} h={10} />
              </>
            )}
          </span>
          <span className={own.text}>
            {speech !== null
              ? <span className={own.speech}>{speech}</span>
              : selected
                ? (
                  <>
                    <span className={own.name}>{itemName(selected.item)}</span>
                    <span className={own.body}>{data.descriptions[selected.item] ?? ''}</span>
                  </>
                )
                : onClose
                  ? (
                    <>
                      <span className={own.name}>{closeLabel}</span>
                      <span className={own.body}>{data.bagText[BAG_LINE.closeDesc] ?? ''}</span>
                    </>
                  )
                  : null}
          </span>
          {/* 기술머신 · 비전머신은 가르치는 기술의 사실이 오른쪽에 선다 — 원작은 갈래를 열어야만 보이지만 폭이 있다 */}
          {moveRow && (
            <span className={own.facts}>
              <TypeBadge type={moveRow.type} />
              <MoveFacts move={moveRow} layout="column" description={false} />
            </span>
          )}
        </div>

        {open?.kind === 'actions' && selected && (
          <ChoiceMenu
            items={open.list.map((a) => ({ key: a, label: data.bagText[BAG_ACTION_LINE[a]] ?? '' }))}
            anchor={anchor}
            within={within}
            loop={open.list.length >= 4}
            onPick={(i) => { const a = open.list[i]; if (a) runAction(a) }}
            onCancel={() => { setOpen(null) }}
          />
        )}
        {open?.kind === 'count' && selected && (
          <CountWindow anchor={anchor} within={within} value={open.n} max={selected.count} />
        )}
        {open?.kind === 'trash' && selected && (
          <YesNo
            labels={[data.menuText[YES_NO.yes] ?? '', data.menuText[YES_NO.no] ?? '']}
            initial={0}
            anchor={anchor}
            within={within}
            onPick={(yes) => { if (yes) trashYes(open.n); else setOpen(null) }}
            onCancel={() => { setOpen(null) }}
          />
        )}
      </div>
    </MenuScreen>
  )
}
