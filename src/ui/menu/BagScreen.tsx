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
import { useEffect, useMemo, useState } from 'react'
import {
  loadBagSprite, loadItemDescriptions, loadItemIcons, loadItemNames, loadItems, loadMoves,
  loadSpecies, type ItemTable, type MoveTable, type SpeciesTable,
} from '../../data/gameData'
import { BAG_MENU, fillMenuText, loadUiText, YES_NO } from '../../data/uiText'
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
import type { BagSprite, ItemIcons } from '../../data/schema'
import { clampCursor, scrollIntoView, useMenuKeys, wrapCursor } from './useMenuKeys'
import { fieldAction, FieldUse } from '../../engine/bag/fieldUse'
import { tradeEvolutionItems } from '../../engine/pokemon/evolution'
import { itemIcon } from './itemIcon'
import { bagArt, pocketIcon } from './bagArt'
import { withHeldItem } from './formChange'
import { heldItemKeepsGiratinaForm, ITEM_GRISEOUS_ORB, SPECIES_GIRATINA } from '../../engine/pokemon/form'
import { world as mapWorld } from '../../engine/map/world'
import { withObject } from '../korean'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './bagScreen.css'
// 갈래 메뉴 창은 파티 화면 것을 그대로 쓴다 — 원작도 두 화면이 같은 오른쪽 아래
// 창을 띄운다 (`BagUI_ShowItemActionsMenu` · `GetContextMenuEntriesForPartyMon`)
import * as menu from './partyScreen.css'

/** 목록의 아이콘. 줄 높이(32)를 넘지 않는다 */
const LIST_ICON = 28
/** 설명칸의 아이콘. 이 화면에서 제일 큰 그림이어야 한다 */
const BIG_ICON = 80
/** 왼쪽에 선 가방. 원작 스프라이트가 64픽셀이라 정수배로만 키운다 */
const BAG_ART = 192
/** 주머니 아이콘. 원작이 16픽셀이라 역시 정수배 */
const POCKET_ICON = 32
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
  /**
   * 종족·기술 표.
   *
   * ⚠️ **도구를 「건네준다」로 붙이는 자리 때문에 필요하다** — 백금옥을 쥐여
   * 주면 그 자리에서 기라티나의 폼과 능력치가 바뀐다 (PARITY §3.4)
   */
  species: SpeciesTable
  moves: MoveTable
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

/** 기억해 둔 그 주머니의 커서. 목록이 그새 줄었으면 끝 칸으로 당긴다 */
export function recallCursor(pocket: number, length: number): number {
  return Math.max(0, Math.min(bagMemory.pos[pocket] ?? 0, length - 1))
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
export function bagFoot(mode: 'normal' | 'pick' | 'give' | 'menu' | 'count'): string {
  switch (mode) {
    case 'normal': return '←→ 주머니 · ↑↓ 고르기 · Z 메뉴 · X 닫기'
    case 'give': return '←→ 주머니 · ↑↓ 고르기 · Z 결정 · X 그만둔다'
    case 'pick': return '↑↓ 고르기 · Z 결정 · X 그만둔다'
    case 'menu': return '↑↓ 고르기 · Z 결정 · X 그만둔다'
    case 'count': return '↑↓ 하나씩 · ←→ 열씩 · Z 결정 · X 그만둔다'
  }
}

export function BagScreen() {
  const [data, setData] = useState<Loaded | null>(null)
  // 설정의 언어. 바뀌면 이름과 설명을 그 언어로 다시 받는다
  const locale = useGameLocale()
  const [pocket, setPocket] = useState(() => bagMemory.pocket)
  const [pos, setPos] = useState<number[]>(() => [...bagMemory.pos])
  /** 한 줄 알림 — 못 쓰는 이유 · 버렸다 · 지니게 했다. 원작도 한 줄 띄우고 만다 */
  const [notice, setNotice] = useState<string | null>(null)
  const [open, setOpen] = useState<Menu | null>(null)
  const [menuAt, setMenuAt] = useState(0)
  const back = useMenuStore((s) => s.back)
  const bag = useSaveStore((s) => s.bag)
  const money = useSaveStore((s) => s.money)
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
    void Promise.all([
      loadItems(), loadItemNames(locale), loadItemDescriptions(locale),
      loadItemIcons(), loadUiText('bagPockets', locale), loadSpecies(), loadMoves(),
      loadUiText('bag', locale), loadUiText('menuEntries', locale),
      // ⚠️ **이 하나만 낱개로 받는다.** 나머지는 다 필수 그룹이라 없으면
      // 애초에 게임이 안 열리는데, 이것은 아니다 — 한 뭉치로 묶으면 그림
      // 한 장 때문에 도구 목록까지 같이 없어진다 (위 `bag` 주석)
      loadBagSprite().catch(() => undefined),
    ])
      .then(([
        items, names, descriptions, icons, pockets, species, moves,
        bagText, menuText, bag,
      ]) => {
        if (alive) {
          setData({
            items, names, descriptions, icons, bag, pockets, species, moves,
            bagText, menuText,
          })
        }
      })
      .catch(() => { /* 빈 가방으로 뜬다 */ })
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
  const slots = bag[shown] ?? []
  const at = Math.max(0, Math.min(pos[shown] ?? 0, slots.length - 1))
  const selected = slots[at]
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

  const choosePocket = (to: number): void => {
    if (pickPocket !== null) return
    setPocket(to)
    bagMemory.pocket = to
    setNotice(null)
  }

  /**
   * 도구를 파티의 한 마리에게 붙인다 (`UpdatePokemonWithItem` · `SwapPokemonItem`).
   *
   * ⚠️ **이미 들고 있으면 맞바꾼다.** 원작이 들고 있던 것을 가방에 돌려주고
   * 새것을 붙인다 — 덮어쓰면 도구 하나가 세상에서 사라진다
   */
  const attachItem = (slot: number, id: number, from: number): void => {
    const party = useSaveStore.getState().party
    const mon = party[slot]
    if (!mon) return
    const held = mon.heldItem
    const next = [...party]
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

  /** Z — 목록에서. 모드에 따라 고르기·건네기·메뉴 열기로 갈린다 */
  const confirmList = (): void => {
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
    setMenuAt(0)
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
        openBerryTag(id)
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
        setMenuAt(0)
        return
      case 'register': case 'deselect': {
        const next = action === 'deselect' ? 0 : id
        useSaveStore.setState({ registeredItem: next })
        setOpen(null)
        // 원작은 표식만 바꾸고 말이 없다. 우리는 **무슨 키로 쓰는지**를 한 줄 적는다 —
        // 그 키가 DS의 Y가 아니라서 말해 주지 않으면 찾을 길이 없다
        setNotice(next === 0
          ? `${itemName(id)}의 등록을 해제했다.`
          : `${withObject(itemName(id))} ${registerKey}에 등록했다!`)
        return
      }
    }
  }

  const trashYes = (n: number): void => {
    if (!data || !selected) return
    const id = selected.item
    removeItem(data.items.get(id).pocket ?? shown, id, n)
    setOpen(null)
    // 줄어든 목록에 맞춰 커서를 당긴다 (`RestrictItemListCursor`)
    const left = selected.count > n ? slots.length : slots.length - 1
    moveCursor(Math.max(0, Math.min(at, left - 1)))
    setNotice(oneLine(line(data.bagText, BAG_MENU.trashed, [itemName(id), String(n)])))
  }

  /** 지금 창에 깔린 줄 수 — 커서가 그 안에서 돈다 */
  const rows = open === null ? 0
    : open.kind === 'actions' ? open.list.length
      : open.kind === 'count' ? 0 : 2

  const menuMove = (d: number): boolean => {
    if (rows === 0) return false
    // 갈래가 넷 이상이면 끝에서 돈다 (`menuTemplate.loopAround = numActions >= 4`)
    const next = open?.kind === 'actions' && rows >= 4
      ? wrapCursor(menuAt, d, rows)
      : clampCursor(Math.min(menuAt, rows - 1), d, rows)
    if (next === menuAt) return false
    setMenuAt(next)
    return true
  }

  const menuConfirm = (pick: number = menuAt): void => {
    if (!open) return
    const i = Math.min(pick, Math.max(0, rows - 1))
    switch (open.kind) {
      case 'actions': { const a = open.list[i]; if (a) runAction(a); return }
      case 'count': setOpen({ kind: 'trash', n: open.n }); setMenuAt(0); return
      case 'trash': if (i === 0) trashYes(open.n); else setOpen(null); return
    }
  }

  const countKey = (key: 'up' | 'down' | 'left' | 'right'): boolean => {
    if (open?.kind !== 'count' || !selected) return false
    const n = trashStep(open.n, selected.count, key)
    if (n === open.n) return false
    setOpen({ kind: 'count', n })
    return true
  }

  useMenuKeys({
    up: () => {
      if (open?.kind === 'count') return countKey('up')
      if (open) return menuMove(-1)
      setNotice(null)
      moveCursor(clampCursor(at, -1, slots.length))
      return undefined
    },
    down: () => {
      if (open?.kind === 'count') return countKey('down')
      if (open) return menuMove(1)
      setNotice(null)
      moveCursor(clampCursor(at, 1, slots.length))
      return undefined
    },
    left: () => {
      if (open?.kind === 'count') return countKey('left')
      if (open || pickPocket !== null) return false
      choosePocket(wrapCursor(pocket, -1, POCKET_SIZE.length))
      return undefined
    },
    right: () => {
      if (open?.kind === 'count') return countKey('right')
      if (open || pickPocket !== null) return false
      choosePocket(wrapCursor(pocket, 1, POCKET_SIZE.length))
      return undefined
    },
    confirm: () => { if (open) menuConfirm(); else confirmList() },
    // ⚠️ 고르라고 열린 가방은 취소도 **0을 남기고** 닫아야 한다 — 안 그러면
    // 앞서 고른 도구가 그대로 남아 다시 심긴다
    cancel: () => {
      if (open) { setOpen(null); return }
      if (pickPocket === null) { back(); return }
      itemChoice.item = 0
      closeAll()
    },
  })

  /** 창 위의 물음 (`Bag_Text_ItemIsSelected` · `ThrowAwayHowMany` · …) */
  const ask = (): string => {
    if (!open || !data || !selected) return ''
    // 롬 줄의 `\r`(다음 쪽)은 창 하나에 한꺼번에 올리므로 줄바꿈으로 편다
    return askLine(open, data, itemName(selected.item)).replace(/[\r\f]/g, '\n')
  }

  const askLine = (open: Menu, data: Loaded, name: string): string => {
    switch (open.kind) {
      case 'actions': return line(data.bagText, BAG_MENU.selected, [name])
      case 'count': return line(data.bagText, BAG_MENU.trashHowMany, [name])
      case 'trash': return line(data.bagText, BAG_MENU.trashOk, [name, String(open.n)])
    }
  }

  /** 창에 깔 줄들 */
  const choices: string[] = !open || !data ? []
    : open.kind === 'actions' ? open.list.map((a) => data.bagText[BAG_ACTION_LINE[a]] ?? '')
      : open.kind === 'count' ? []
        : [data.menuText[YES_NO.yes] ?? '', data.menuText[YES_NO.no] ?? '']

  const mode = open?.kind === 'count' ? 'count'
    : open ? 'menu'
      : pickPocket !== null ? 'pick'
        : giveTo !== null ? 'give' : 'normal'

  return (
    <MenuScreen
      title="가방"
      note={`${money.toLocaleString('ko-KR')}원`}
      foot={(notice ?? bagFoot(mode))
        + ` · ${String(slots.length)}/${String(POCKET_SIZE[shown] ?? 0)}칸`}
    >
      {/* 갈래 창이 이 칸의 오른쪽 아래 구석에 붙는다 — 설명 칸 위에 겹치는 것이 원작이다 */}
      <div className={own.stage}>
        {/* 왼쪽 — 가방이 선다. 열린 칸이 지금 주머니를 말한다 */}
        <div className={own.bay}>
          <span
            className={own.bag}
            style={bagArt(data?.bag, shown, gender, BAG_ART)}
            aria-hidden
          />
          <div className={own.pockets}>
            {(data?.pockets ?? []).map((name, i) => (
              <span
                key={name}
                className={i === shown ? own.pocketOn : own.pocketOff}
                style={pocketIcon(data?.bag, i, i === shown, POCKET_ICON)}
                title={name}
                onPointerDown={() => { if (!open) choosePocket(i) }}
              />
            ))}
          </div>
          <div className={own.pocketName}>
            {/* 고르라고 열린 가방은 그 주머니에 못 박히므로 화살표를 안 띄운다 */}
            <span className={own.arrow}>{pickPocket === null ? '◀' : ''}</span>
            {data?.pockets[shown] ?? ''}
            <span className={own.arrow}>{pickPocket === null ? '▶' : ''}</span>
          </div>
        </div>

        <div className={own.list}>
          {slots.length === 0 && <div className={css.empty}>아무것도 없다</div>}
          {slots.map((slot, i) => (
            <div
              key={slot.item}
              className={i === at ? css.rowOn : css.row}
              ref={i === at ? scrollIntoView : undefined}
              onPointerEnter={() => { if (!open) moveCursor(i) }}
            >
              {i === at && <span className={css.caret} aria-hidden />}
              <span className={css.face}>
                <span className={css.icon} style={itemIcon(data?.icons, slot.item, LIST_ICON)} aria-hidden />
                <span className={css.label}>{itemName(slot.item)}</span>
                {/* 등록한 물건에 표식 하나 (`BagUI_DrawRegisteredIcon`) — 그 물건을 쓰는 키 이름이다 */}
                {slot.item === registered && <span className={own.registered}>{registerKey}</span>}
                {/* 중요한 물건은 개수를 안 붙인다 — 원작도 한 개뿐이라 안 센다 */}
                {data?.items.get(slot.item).preventToss === 1
                  ? null
                  : <span className={css.countNear}>×{slot.count}</span>}
              </span>
            </div>
          ))}
        </div>

        {/* 아래 — 원작도 설명은 화면 폭 전체다 */}
        <div className={own.desc}>
          {selected
            ? (
              <>
                <span
                  className={own.icon}
                  style={itemIcon(data?.icons, selected.item, BIG_ICON)}
                  aria-hidden
                />
                <span className={own.text}>
                  <span className={own.name}>{itemName(selected.item)}</span>
                  <span className={own.body}>{data?.descriptions[selected.item] ?? ''}</span>
                </span>
              </>
            )
            : <span className={own.descEmpty}>고른 물건이 없다</span>}
        </div>

        {/* 갈래 창 (`BagUI_ShowItemActionsMenu`). 물음이 먼저 서고 그 밑에 갈래가 깔린다 */}
        {open && (
          <div className={menu.choices}>
            <div className={menu.choiceAsk}>{ask()}</div>
            {open.kind === 'count' && (
              // 개수 칸 — 원작은 세 자리를 0으로 채운다 (`BagUI_PrintItemTrashCount`)
              <div className={menu.choiceOn}>
                {line(data?.bagText, BAG_MENU.trashCount, [String(open.n).padStart(3, '0')])}
              </div>
            )}
            {choices.map((label, i) => (
              <div
                key={`${label}-${String(i)}`}
                className={i === Math.min(menuAt, choices.length - 1) ? menu.choiceOn : menu.choice}
                onPointerEnter={() => { setMenuAt(i) }}
                onClick={() => { setMenuAt(i); menuConfirm(i) }}
              >
                {label}
              </div>
            ))}
          </div>
        )}
      </div>

    </MenuScreen>
  )
}
