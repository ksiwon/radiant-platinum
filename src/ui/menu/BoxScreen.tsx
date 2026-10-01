// 포켓몬 보관 시스템 (DATA.md §2.20)
//
// PC 앞에서 "포켓몬을 맡긴다"를 고르면 열린다. 원작 스크립트가 그대로 도므로
// 여기까지 오는 길과 항목 글은 전부 롬의 것이다 (`CommonScript_StorageSystem`).
//
// 화면의 손짓은 **집어서 다른 자리에 놓는다**가 바탕이다. 맡기기·꺼내기·정리하기가
// 원작에서도 같은 손짓이고, 갈래(`mode`)는 커서가 어디서 시작하는지와 창 이름, 그리고
// 마리 위에서 Z로 여는 갈래 메뉴의 항목을 정한다 (`BoxMenu_FillTopLevelMenuItems`).
//
// ⚠️ 그림은 **원작 아이콘**이다. 배틀 그림을 줄여 쓰면 서른 칸이 그림으로 덮인다
// (`data/pokeIcons.png`). 벽지도 원작 것이다 — 박스 열여덟 개를 눈으로 가르는
// 것이 이름이 아니라 벽지 색이다.
import { useEffect, useRef, useState } from 'react'
import {
  loadBoxWallpapers, loadItemNames, loadMoveNames, loadPokeIcons, loadSpecies, loadSpeciesNames,
} from '../../data/gameData'
import type { SpeciesTable } from '../../data/gameData'
import type { BoxWallpapers, PokeIcons } from '../../data/schema'
import { BOX_TEXT, fillMenuText, loadUiText, PC_MENU } from '../../data/uiText'
import { genderOf, maxHp, natureOf, PARTY_MAX, statsOf } from '../../engine/pokemon/instance'
import type { PokemonInstance } from '../../engine/pokemon/instance'
import {
  BOX_COLS, BOX_COUNT, BOX_MODE, BOX_ROWS, BOX_SIZE, countAll, countInBox, onLastAliveMon,
  releaseFromBox, releaseRefusal, releaseReturns,
} from '../../engine/pokemon/boxes'
import type { ReleaseRefusal } from '../../engine/pokemon/boxes'
import type { BoxSpot } from '../../engine/pokemon/boxes'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { SPECIES_CHATOT } from '../../engine/pokemon/chatotCry'
import { LocationEvent } from '../../engine/world/journal'
import { journalPlain } from '../../scene/journal'
import { MenuScreen } from './MenuScreen'
import { summaryLast } from './partyChoice'
import { boxWallpaper, monIcon } from './pokeIcon'
import { useMenuKeys, wrapCursor } from './useMenuKeys'
import * as css from './menuChrome.css'
import * as own from './boxScreen.css'

/** 벽지·아이콘을 화면 픽셀로 옮기는 배수. css 쪽과 같은 값이다 */
const K = 3
/** 박스 칸의 아이콘 크기 (원작 32) */
const SLOT_ICON = 32 * K

/** 커서가 앉을 수 있는 곳 — 박스 이름 머리(`header`)는 박스 맨 윗줄 위다 */
type Pane = 'box' | 'party' | 'header'

/**
 * 머리 메뉴 (`BoxMenu_FillHeaderMenu` · `box_app_manager.c`의 `BoxAppMan_BoxJumpAction` · `…_WallpaperMenu`).
 * 항목 번호는 원작 `enum BoxMenuItem`이고 글은 보관 시스템 뱅크의 **24 + 항목**이다 — 점프 0 · 벽지 1 · 이름 2 ·
 * 그만둔다 3 · 풍경1~3 · etc. 4~7 · 애호가1 · 2 8 · 9 · 벽지 10~33(숲 … 갤럭시단)
 */
const BOX_MENU = {
  jump: 0, wallpaper: 1, name: 2, cancel: 3, firstTheme: 4, friends1: 8, friends2: 9, firstWall: 10, firstFriendWall: 26,
  // 마리 메뉴 — 잡는다 34 · 상태를 본다 37 · 데리고 간다 38 · 맡긴다 39 · 놓아준다 42 · 그만둔다 43 · 예 54 · 아니오 55
  move: 34, summary: 37, withdraw: 38, store: 39, release: 42, monCancel: 43, yes: 54, no: 55,
} as const
const MENU_LABEL = 24
/** 테마마다의 벽지 넷 (`sWallpaperPages`) */
const WALL_PAGES = [[10, 11, 12, 13], [14, 15, 16, 17], [18, 19, 20, 21], [22, 23, 24, 25]] as const
/** 박스 이름 칸 (`PCBoxes.names` — 여덟 글자) */
const BOX_NAME_MAX = 8

interface HeaderMenu {
  /** 머리 셋(`header`·`jump`·`theme`·`walls`)과 마리 셋(`mon`·`store`·`release`) */
  kind: 'header' | 'jump' | 'theme' | 'walls' | 'mon' | 'store' | 'release'
  /** 항목 — 점프·맡기기면 박스 번호, 나머지는 `BOX_MENU` 번호 */
  items: readonly number[]
  at: number
  /** 마리 메뉴가 가리키는 자리. 머리 메뉴에는 없다 */
  target?: Held
}

/**
 * 마리 메뉴의 항목 (`BoxMenu_FillTopLevelMenuItems`).
 *
 * 원작 차례 그대로다 — 정리하기는 잡는다 · 상태를 본다 · 지닌물건 · 데리고 간다/맡긴다 ·
 * 마킹 · 놓아준다 · 그만둔다, 맡기기·꺼내기는 맡긴다/데리고 간다 · 상태를 본다 · 마킹 ·
 * 놓아준다 · 그만둔다. 데리고 간다/맡긴다는 커서가 박스에 있는가로 갈린다.
 *
 * ⚠️ **셋이 빠져 있다.** 지닌물건은 가방을 여는 흐름(`BoxAppMan_GiveItemFromBagAction`)이고,
 * 마킹은 마리에 마킹 칸이 없다(`PokemonInstance`·저장 스키마). 상태를 본다는 **파티 마리만**
 * 선다 — 요약 화면이 파티 자리만 읽는다. 셋 다 고를 수 있게 두면 눌러도 아무 일이 없다
 */
function monMenuItems(mode: number, inBox: boolean): number[] {
  const swap = inBox ? BOX_MENU.withdraw : BOX_MENU.store
  const summary = inBox ? [] : [BOX_MENU.summary]
  if (mode === BOX_MODE.deposit || mode === BOX_MODE.withdraw) {
    return [swap, ...summary, BOX_MENU.release, BOX_MENU.monCancel]
  }
  return [BOX_MENU.move, ...summary, swap, BOX_MENU.release, BOX_MENU.monCancel]
}

/** `box_messages` 뱅크 — 마리 메뉴와 놓아주기 흐름의 줄 (`BoxText_*`) */
const MON_TEXT = {
  /** 「{이름} 어떻게 하겠습니까?」 (`BoxText_MonSelected`) */
  selected: 0,
  /** 「정말 놓아주겠습니까?」 */
  releaseAsk: 2,
  /** 「{이름} 밖에 놓아주었다」 → 「바이바이, {이름}!」 */
  released: 3, goodbye: 4,
  /** 「어느 박스에 맡기겠습니까?」 */
  depositWhere: 19,
  /** 「{이름} 되돌아와 버렸다!」 → 「걱정했었나...」 */
  returned: 32, worried: 33,
} as const

/** 묻기 전에 막는 까닭의 줄 (`BoxAppMan_CheckReleaseMonValid`) */
const REFUSAL_TEXT: Record<ReleaseRefusal, number> = { egg: 31, mail: 30, lastMon: BOX_TEXT.lastMon }

/**
 * 요약을 보고 돌아올 때 들고 갈 것.
 *
 * 요약을 쌓으면 `MenuLayer`가 이 화면을 내렸다가 다시 세운다 — 커서와 「옮겼다」를
 * 화면이 못 들고 있다. 원작은 요약에서 마지막으로 본 마리 자리로 커서를 둔다
 * (`BoxApp_SetCursorPosToSummaryMonPos`).
 *
 * ⚠️ 박스가 스택에서 사라지면(메뉴째 닫힘) 버린다 — 남기면 다음에 따로 연 박스가 그 자리로 선다
 */
let resume: { moved: boolean } | null = null
function holdForSummary(moved: boolean): void {
  resume = { moved }
  const stop = useMenuStore.subscribe((s) => {
    if (s.stack.includes('box')) return
    resume = null
    stop()
  })
}

/** 테마 줄 (`BoxMenu_FillWallpaperMenu`) — 애호가 줄은 푼 벽지가 있어야 서고, 다섯부터 둘째 줄이 선다 */
function themeItems(unlocked: number): number[] {
  const n = [...Array(8).keys()].filter((i) => (unlocked & (1 << i)) !== 0).length
  return [4, 5, 6, 7, ...(n > 0 ? [BOX_MENU.friends1] : []), ...(n > 4 ? [BOX_MENU.friends2] : [])]
}

/** 그 테마의 벽지 (`BoxMenu_FillWallpaperSelectionMenu`) — 애호가 둘째 줄은 푼 것의 다섯째부터 넷이다 */
function wallItems(theme: number, unlocked: number): number[] {
  if (theme < BOX_MENU.friends1) return [...WALL_PAGES[theme - BOX_MENU.firstTheme]!]
  let skip = theme === BOX_MENU.friends2 ? 4 : 0
  const out: number[] = []
  for (let i = 0; i < 8 && out.length < 4; i++) {
    if ((unlocked & (1 << i)) === 0) continue
    if (skip > 0) { skip--; continue }
    out.push(BOX_MENU.firstFriendWall + i)
  }
  return out
}

interface Cursor {
  pane: Pane
  /** 박스면 0~29, 파티면 0~5 */
  at: number
}

/** 집어 든 한 마리. 어디서 집었는지를 함께 든다 — 놓을 때 되돌려 놔야 한다 */
type Held =
  | { pane: 'box'; at: BoxSpot }
  | { pane: 'party'; at: number }

export function BoxScreen() {
  const locale = useGameLocale()
  const [species, setSpecies] = useState<SpeciesTable | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [icons, setIcons] = useState<PokeIcons>()
  const [walls, setWalls] = useState<BoxWallpapers>()
  /** `pokemon_storage_system` — 박스 이름 18개 */
  const [boxText, setBoxText] = useState<string[]>([])
  /** `box_messages` — 화면이 띄우는 말 */
  const [msg, setMsg] = useState<string[]>([])
  /** `menu_entries` — 창 이름으로 쓰는 PC 항목 글 */
  const [pcText, setPcText] = useState<string[]>([])
  /** 성격 이름 25 (`TEXT_BANK_NATURE_NAMES`). 번호를 그대로 찍지 않는다 */
  const [natureNames, setNatureNames] = useState<string[]>([])

  const mode = useMenuStore((s) => s.boxMode)
  const back = useMenuStore((s) => s.back)
  const party = useSaveStore((s) => s.party)
  const boxes = useSaveStore((s) => s.boxes)
  const box = useSaveStore((s) => s.currentBox)
  const wallpapers = useSaveStore((s) => s.wallpapers)
  const setCurrentBox = useSaveStore((s) => s.setCurrentBox)
  // 이 화면에서 한 마리라도 옮겼는가. 노트가 나갈 때 이 값을 본다
  const moved = useRef(resume?.moved ?? false)
  // 돌아온 자리는 한 번만 읽는다
  useEffect(() => { resume = null }, [])
  const setBoxSlot = useSaveStore((s) => s.setBoxSlot)
  const setPartySlot = useSaveStore((s) => s.setPartySlot)
  const depositMon = useSaveStore((s) => s.depositMon)
  const withdrawMon = useSaveStore((s) => s.withdrawMon)
  const swapBoxSlots = useSaveStore((s) => s.swapBoxSlots)
  const swapParty = useSaveStore((s) => s.swapParty)

  // 맡기러 왔으면 파티에서, 꺼내러 왔으면 박스에서 시작한다.
  // 원작도 갈래마다 처음 잡는 손이 다르다
  const [cursor, setCursor] = useState<Cursor>(
    () => (resume !== null
      ? { pane: 'party', at: summaryLast.slot }
      : { pane: mode === BOX_MODE.deposit ? 'party' : 'box', at: 0 }),
  )
  const [held, setHeld] = useState<Held | null>(null)
  const [menu, setMenu] = useState<HeaderMenu | null>(null)
  const unlockedWallpapers = useSaveStore((s) => s.unlockedWallpapers)
  const boxNames = useSaveStore((s) => s.boxNames)
  const pushNaming = useMenuStore((s) => s.pushNaming)
  const [notice, setNotice] = useState<string | null>(null)
  /** 메뉴 자리에 띄운 원작 줄. Z·X로 한 줄씩 넘기고 다 읽으면 닫힌다 */
  const [say, setSay] = useState<string[] | null>(null)
  const openSummary = useMenuStore((s) => s.openSummary)
  /** 도구 옮기기(3)에서 집어 든 도구. 어디서 집었는지까지 든다 */
  const [heldItem, setHeldItem] = useState<{ from: Held; item: number } | null>(null)
  /** 비교하기(4)에 올려 둔 두 마리. 채운 차례대로 들어간다 */
  const [compare, setCompare] = useState<(Held | null)[]>([null, null])
  /** 비교 쪽 둘 — 능력치 · 기술 */
  const [comparePage, setComparePage] = useState(0)
  const [itemNames, setItemNames] = useState<string[]>([])
  const [moveNames, setMoveNames] = useState<string[]>([])

  /** 올려 둔 자리의 마리. 박스를 넘겨도 그 박스에서 찾는다 */
  const monAtHeld = (at: Held): PokemonInstance | null => (at.pane === 'box'
    ? boxes[at.at.box]?.[at.at.slot] ?? null
    : party[at.at] ?? null)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(), loadSpeciesNames(locale), loadPokeIcons(), loadBoxWallpapers(),
      loadUiText('storageSystem', locale), loadUiText('boxMessages', locale),
      loadUiText('menuEntries', locale), loadItemNames(locale), loadMoveNames(locale),
      loadUiText('natureNames', locale),
    ])
      .then(([table, list, icon, wall, names18, names19, entries, items, moves, natures]) => {
        if (!alive) return
        setSpecies(table); setNames(list); setIcons(icon); setWalls(wall)
        setBoxText(names18); setMsg(names19); setPcText(entries)
        setItemNames(items); setMoveNames(moves); setNatureNames(natures)
      })
      .catch(() => { /* 그림과 이름만 빈다. 자리는 선다 */ })
    return () => { alive = false }
  }, [locale])

  const current = boxes[box] ?? []
  const monAt = (c: Cursor): PokemonInstance | null =>
    (c.pane === 'box' ? current[c.at] : party[c.at]) ?? null
  const selected = monAt(cursor)

  const step = (dx: number, dz: number) => () => {
    setNotice(null)
    if (say !== null) return false
    if (menu !== null) {
      const d = dz !== 0 ? dz : dx
      setMenu({ ...menu, at: Math.max(0, Math.min(menu.items.length - 1, menu.at + d)) })
      return
    }
    // 머리에서 ←→는 박스를 넘긴다 (원작도 머리 칸의 화살표다)
    if (cursor.pane === 'header' && dx !== 0) { setCurrentBox(wrapCursor(box, dx, BOX_COUNT)); return }
    setCursor((c) => move(c, dx, dz, party.length))
  }

  /** 박스의 이름 — 지은 것이 없으면 원작 기본 이름 */
  const nameOfBox = (at: number): string => boxNames[at] ?? boxText[BOX_TEXT.boxName + at] ?? ''

  /** 머리 메뉴·마리 메뉴에서 고른다. 누른 칸을 바로 넘길 수 있다 — 클릭은 커서보다 먼저 온다 */
  const pickMenu = (at: number = menu?.at ?? 0): void => {
    if (menu === null) return
    const item = menu.items[at]
    if (item === undefined) return
    if (menu.kind === 'mon' || menu.kind === 'store' || menu.kind === 'release') { pickMon(menu, item); return }
    if (menu.kind === 'header') {
      if (item === BOX_MENU.jump) setMenu({ kind: 'jump', items: [...Array(BOX_COUNT).keys()], at: box })
      else if (item === BOX_MENU.wallpaper) setMenu({ kind: 'theme', items: themeItems(unlockedWallpapers), at: 0 })
      else if (item === BOX_MENU.name) {
        setMenu(null)
        pushNaming({ kind: 'box', slot: box, initial: nameOfBox(box), max: BOX_NAME_MAX })
      } else setMenu(null)
      return
    }
    if (menu.kind === 'jump') { setCurrentBox(item); setMenu(null); return }
    if (menu.kind === 'theme') { setMenu({ kind: 'walls', items: wallItems(item, unlockedWallpapers), at: 0 }); return }
    // 벽지 — `PCBoxes_SetWallpaper(…, USE_CURRENT_BOX, menuItem - BOX_MENU_FIRST_WALLPAPER)`
    const wall = item - BOX_MENU.firstWall
    useSaveStore.setState((st) => ({ wallpapers: st.wallpapers.map((w, i) => (i === box ? wall : w)) }))
    setMenu(null)
  }

  /** 원작 줄 하나. 마리를 주면 그 이름이 0번 칸이다 (`StringTemplate_SetNickname`) */
  const line = (at: number, mon?: PokemonInstance): string =>
    fillMenuText(msg[at] ?? '', mon ? [nameOf(mon)] : [])

  /** Z가 마리 위에서 메뉴를 연다 (`BoxAppMan_MonCursorMenuAction`) */
  const openMonMenu = (target: Held): void => {
    setMenu({ kind: 'mon', items: monMenuItems(mode, target.pane === 'box'), at: 0, target })
  }

  /**
   * 마리 메뉴의 한 항목.
   *
   * 놓아주기는 원작 흐름 그대로다 (`BoxAppMan_ReleaseMonAction`) — 알·편지·마지막 한 마리면
   * **묻지도 않고** 막는다. 그다음 「정말 놓아주겠습니까?」를 **아니오에 커서를 두고** 한 번
   * 묻는다(`BoxMenu_FillYesNo(…, 1)`). 예를 고른 뒤에야 막는 기술 셋을 세서, 그 기술을 아는
   * 것이 이 마리뿐이면 되돌아온다
   */
  const pickMon = (open: HeaderMenu, item: number): void => {
    const target = open.target
    const mon = target ? monAtHeld(target) : null
    if (!target || !mon) { setMenu(null); return }
    if (open.kind === 'store') {
      // 고른 박스에 맡긴다 (`BoxAppMan_TryStoreCursorMonInBox`). 그 박스가 차 있으면 못 맡긴다
      setMenu(null)
      if (target.pane !== 'party') return
      if (countInBox(boxes, item) >= BOX_SIZE) { setSay([msg[BOX_TEXT.boxFull] ?? '']); return }
      // 스토어는 지금 박스부터 빈 칸을 찾는다 — 고른 박스를 잠깐 세웠다가 보던 박스로 돌린다
      const shown = box
      setCurrentBox(item)
      const put = depositMon(target.at)
      setCurrentBox(shown)
      if (put === null) { setSay([msg[BOX_TEXT.lastMon] ?? '']); return }
      moved.current = true
      return
    }
    if (open.kind === 'release') {
      setMenu(null)
      if (item !== BOX_MENU.yes) return
      if (releaseReturns(boxes, party, mon)) {
        setSay([line(MON_TEXT.returned, mon), line(MON_TEXT.worried)])
        return
      }
      if (target.pane === 'box') {
        useSaveStore.setState((st) => ({ boxes: releaseFromBox(st.boxes, target.at) }))
      } else {
        useSaveStore.setState((st) => ({ party: st.party.filter((_, i) => i !== target.at) }))
        setCursor((c) => (c.pane === 'party' ? { pane: 'party', at: Math.min(c.at, party.length - 1) } : c))
      }
      // 놓아준 것도 박스를 쓴 것이다 (`BoxAppMan_FlagRecordBoxUseInJournal`)
      moved.current = true
      setSay([line(MON_TEXT.released, mon), line(MON_TEXT.goodbye, mon)])
      return
    }
    switch (item) {
      case BOX_MENU.move:
        setMenu(null)
        setHeld(target)
        return
      case BOX_MENU.summary:
        setMenu(null)
        if (target.pane !== 'party') return
        holdForSummary(moved.current)
        openSummary(target.at)
        return
      case BOX_MENU.withdraw:
        setMenu(null)
        if (target.pane !== 'box') return
        if (party.length >= PARTY_MAX) { setSay([msg[BOX_TEXT.partyFull] ?? '']); return }
        if (withdrawMon(target.at)) moved.current = true
        return
      case BOX_MENU.store:
        if (target.pane !== 'party') { setMenu(null); return }
        // 박스를 고르기 전에 막는다 (`STORE_MON_CHECK_CAN_STORE_MON`)
        if (onLastAliveMon(party, mon)) { setMenu(null); setSay([msg[BOX_TEXT.lastMon] ?? '']); return }
        setMenu({ kind: 'store', items: [...Array(BOX_COUNT).keys()], at: box, target })
        return
      case BOX_MENU.release: {
        const refusal = releaseRefusal(mon, party, target.pane === 'party')
        if (refusal !== null) { setMenu(null); setSay([msg[REFUSAL_TEXT[refusal]] ?? '']); return }
        setMenu({ kind: 'release', items: [BOX_MENU.yes, BOX_MENU.no], at: 1, target })
        return
      }
      default:
        setMenu(null)
    }
  }

  /** 띄운 줄을 한 줄 넘긴다. 마지막 줄 다음은 닫는다 */
  const nextSay = (): void => {
    if (say === null) return
    setSay(say.length > 1 ? say.slice(1) : null)
  }

  /** 머리 메뉴에서 한 단 물러난다 — 벽지에서는 테마로 (`WALLPAPER_MENU_PICK_THEME_INIT`) */
  const backMenu = (): void => {
    if (menu === null) return
    if (menu.kind === 'walls') { setMenu({ kind: 'theme', items: themeItems(unlockedWallpapers), at: 0 }); return }
    setMenu(null)
  }

  const turnBox = (d: number) => () => {
    setNotice(null)
    if (say !== null || menu !== null) return false
    setCurrentBox(wrapCursor(box, d, BOX_COUNT))
  }

  /**
   * 집거나 놓는다.
   *
   * 놓는 자리에 다른 마리가 있으면 **맞바꾼다** — 원작도 그렇다. 파티와 박스
   * 사이를 오갈 때만 원작의 두 제한이 걸린다: 파티가 여섯이면 못 꺼내고,
   * 싸울 수 있는 마지막 한 마리는 못 맡긴다
   */
  const grab = (): void => {
    setNotice(null)
    // 띄운 줄은 끝까지 읽고 닫아야 다음 손짓이 선다
    if (say !== null) return
    // 도구 옮기기(3)·비교하기(4)는 마리가 아니라 다른 것을 집는다
    if (mode === BOX_MODE.items) { grabItem(); return }
    if (mode === BOX_MODE.compare) { markCompare(); return }
    if (held === null) {
      if (!selected) return
      openMonMenu(here())
      return
    }
    if (place(held)) { moved.current = true; setHeld(null) }
  }

  /** 지금 커서가 선 자리를 `Held`로 */
  const here = (): Held => (cursor.pane === 'box'
    ? { pane: 'box', at: { box, slot: cursor.at } }
    : { pane: 'party', at: cursor.at })

  /** 그 자리의 마리를 새 값으로 갈아 끼운다 */
  const writeMon = (at: Held, mon: PokemonInstance): void => {
    if (at.pane === 'box') setBoxSlot(at.at, mon)
    else setPartySlot(at.at, mon)
  }

  /**
   * 도구를 집고 놓는다 (`PC_MODE_MOVE_ITEMS`).
   *
   * ⚠️ **빈 칸에는 못 놓는다.** 도구는 마리가 들고 있는 것이라 놓을 데가
   * 없으면 갈 곳이 없다 — 원작도 빈 칸을 그냥 안 받는다
   */
  const grabItem = (): void => {
    if (heldItem === null) {
      if (!selected || selected.heldItem === 0) { setNotice('지닌 물건이 없다'); return }
      const from = here()
      writeMon(from, { ...selected, heldItem: 0 })
      setHeldItem({ from, item: selected.heldItem })
      return
    }
    if (!selected) { setNotice(msg[BOX_TEXT.noItem] ?? '여기에는 못 놓는다'); return }
    const to = here()
    // 상대가 이미 들고 있으면 **맞바꾼다** — 원작도 그렇다
    const swapped = selected.heldItem
    writeMon(to, { ...selected, heldItem: heldItem.item })
    if (swapped !== 0) { setHeldItem({ from: to, item: swapped }); return }
    setHeldItem(null)
    moved.current = true
  }

  /**
   * 비교할 두 마리를 올린다 (`PC_MODE_COMPARE`).
   *
   * 이미 올라간 자리를 다시 고르면 내린다. 셋째를 고르면 앞의 하나가 밀린다
   */
  const markCompare = (): void => {
    if (!selected) return
    const at = here()
    const same = (a: Held | null): boolean =>
      a !== null && a.pane === at.pane
      && (a.pane === 'box' && at.pane === 'box'
        ? a.at.box === at.at.box && a.at.slot === at.at.slot
        : a.at === at.at)
    if (compare.some(same)) { setCompare(compare.map((c) => (same(c) ? null : c))); return }
    const free = compare.findIndex((c) => c === null)
    if (free >= 0) setCompare(compare.map((c, i) => (i === free ? at : c)))
    else setCompare([compare[1] ?? null, at])
  }

  const place = (from: Held): boolean => {
    const to = cursor
    if (from.pane === 'box' && to.pane === 'box') {
      swapBoxSlots(from.at, { box, slot: to.at })
      return true
    }
    if (from.pane === 'party' && to.pane === 'party') {
      swapParty(from.at, to.at)
      return true
    }
    if (from.pane === 'party') {
      // 맡긴다. 자리는 스토어가 원작 규칙으로 고른다 — 커서가 선 칸이 비어
      // 있으면 그 칸이지만, 차 있으면 그다음 빈 칸이다
      if (countAll(boxes) >= BOX_COUNT * BOX_SIZE) { setNotice(msg[BOX_TEXT.boxFull] ?? null); return false }
      const put = depositMon(from.at)
      if (put === null) { setNotice(msg[BOX_TEXT.lastMon] ?? null); return false }
      setCursor({ pane: 'box', at: put.slot })
      setCurrentBox(put.box)
      return true
    }
    // 꺼낸다
    if (party.length >= PARTY_MAX) { setNotice(msg[BOX_TEXT.partyFull] ?? null); return false }
    if (!withdrawMon(from.at)) return false
    setCursor({ pane: 'party', at: party.length })
    return true
  }

  useMenuKeys({
    up: step(0, -1),
    down: step(0, 1),
    left: step(-1, 0),
    right: step(1, 0),
    pageUp: turnBox(-1),
    pageDown: turnBox(1),
    tab: () => {
      setNotice(null)
      if (say !== null || menu !== null) return false
      // 비교하기에서는 Tab이 쪽을 넘긴다 (`enum CompareMode`)
      if (mode === BOX_MODE.compare) {
        setComparePage((p) => wrapCursor(p, 1, COMPARE_PAGES.length))
        return
      }
      setCursor((c) => ({ pane: c.pane === 'box' ? 'party' : 'box', at: 0 }))
    },
    confirm: () => {
      if (say !== null) { nextSay(); return }
      if (menu !== null) { pickMenu(); return }
      if (cursor.pane === 'header') {
        if (held !== null || heldItem !== null) return
        // 비교하기에서는 점프만 선다 (`BoxMenu_FillHeaderMenu`)
        const items = mode === BOX_MODE.compare
          ? [BOX_MENU.jump, BOX_MENU.cancel]
          : [BOX_MENU.jump, BOX_MENU.wallpaper, BOX_MENU.name, BOX_MENU.cancel]
        setMenu({ kind: 'header', items, at: 0 })
        return
      }
      grab()
    },
    cancel: () => {
      setNotice(null)
      if (say !== null) { nextSay(); return }
      if (menu !== null) { backMenu(); return }
      // ⚠️ **들고 있던 도구를 돌려놓고 닫는다.** 안 그러면 도구가 사라진다
      if (heldItem !== null) {
        const owner = monAtHeld(heldItem.from)
        if (owner) writeMon(heldItem.from, { ...owner, heldItem: heldItem.item })
        setHeldItem(null)
        return
      }
      if (held !== null) { setHeld(null); return }
      // 한 마리라도 옮겼으면 노트에 「박스를 썼다」 (PARITY §7.4).
      // ⚠️ **연 것만으로는 안 적는다** — 원작도 실제로 옮겼을 때만 깃발을 세운다
      // (`BoxAppMan_FlagRecordBoxUseInJournal`)
      if (moved.current) journalPlain(LocationEvent.USED_PC_BOX)
      // 파티에 페라페가 없으면 배운 말을 잊는다 (`BoxAppMan_Exit`의 `ChatotCry_ResetStatus`).
      // ⚠️ **페라페 알도 페라페로 친다** — `Party_HasSpecies`가 `MON_DATA_SPECIES`(알 속의 종족)를 본다
      const save = useSaveStore.getState()
      if (save.chatotCry !== null && !save.party.some((m) => m.species === SPECIES_CHATOT)) {
        useSaveStore.setState({ chatotCry: null })
      }
      back()
    },
  })

  const nameOf = (mon: PokemonInstance): string => mon.nickname ?? names[mon.species] ?? ''
  /** 메뉴 위의 물음 — 머리 셋은 고정 줄, 마리 메뉴는 그 마리 이름이 든 줄 */
  const askOf = (open: HeaderMenu): string => {
    switch (open.kind) {
      case 'jump': return msg[BOX_TEXT.jumpToBox] ?? ''
      case 'theme': return msg[BOX_TEXT.pickTheme] ?? ''
      case 'walls': return msg[BOX_TEXT.pickWallpaper] ?? ''
      case 'mon': return line(MON_TEXT.selected, open.target ? monAtHeld(open.target) ?? undefined : undefined)
      case 'store': return msg[MON_TEXT.depositWhere] ?? ''
      case 'release': return msg[MON_TEXT.releaseAsk] ?? ''
      default: return ''
    }
  }
  const info = species && selected ? species.of(selected) : undefined
  const boxName = nameOfBox(box)
  const title = pcText[PC_MENU.storageModes + mode] ?? ''

  const foot = say !== null
    ? 'Z 다음'
    : menu !== null
      ? '↑↓ 고르기 · Z 결정 · X 그만둔다'
      : mode === BOX_MODE.compare
        ? `↑↓←→ 고르기 · Z 올린다/내린다 · Tab ${COMPARE_PAGES[comparePage]} · X 닫기`
        : mode === BOX_MODE.items
          ? (heldItem !== null
            ? '↑↓←→ 옮기기 · Z 놓기 · Q/E 박스 · X 도구 돌려놓기'
            : '↑↓←→ 고르기 · Z 도구 집기 · Tab 파티/박스 · Q/E 박스 · X 닫기')
          : held !== null
            ? '↑↓←→ 옮기기 · Z 놓기 · Q/E 박스 · X 되돌리기'
            : '↑↓←→ 고르기 · Z 메뉴 · Tab 파티/박스 · Q/E 박스 · X 닫기'

  return (
    <MenuScreen
      title={title}
      note={`박스 ${String(countAll(boxes))}/${String(BOX_COUNT * BOX_SIZE)} · 파티 ${String(party.length)}/${String(PARTY_MAX)}`}
      foot={foot}
    >
      <div className={own.stage}>
        <div className={own.boxSide}>
          <div className={own.pager}>
            <span className={own.pagerArrow} onClick={turnBox(-1)}>◀</span>
            <span className={own.pagerCount}>
              {box + 1} / {BOX_COUNT} · {countInBox(boxes, box)}/{BOX_SIZE}
            </span>
            <span className={own.pagerArrow} onClick={turnBox(1)}>▶</span>
          </div>

          <div
            className={own.wall}
            style={boxWallpaper(walls, wallpapers[box] ?? 0, K)}
          >
            <div
              className={own.boxName}
              data-box-header={cursor.pane === 'header' ? 'on' : 'off'}
              style={cursor.pane === 'header' ? { outline: '3px solid currentColor', outlineOffset: 2, borderRadius: 6 } : undefined}
              onClick={() => { setCursor({ pane: 'header', at: 0 }) }}
            >
              {boxName}
            </div>
            {say !== null ? (
              <div role="status" data-box-say className={own.headerMenu} onClick={nextSay}>
                <div className={own.headerItem} style={{ paddingLeft: 16 }}>{say[0]}</div>
              </div>
            ) : menu !== null && (
              <div role="menu" data-box-menu={menu.kind} className={own.headerMenu}>
                {menu.kind !== 'header' && (
                  <div className={own.headerAsk}>{askOf(menu)}</div>
                )}
                {menu.items.map((item, i) => (
                  <div
                    key={item}
                    role="menuitem"
                    aria-selected={i === menu.at}
                    className={i === menu.at ? own.headerItemOn : own.headerItem}
                    onPointerEnter={() => { setMenu({ ...menu, at: i }) }}
                    onClick={() => { pickMenu(i) }}
                  >
                    {menu.kind === 'jump' || menu.kind === 'store' ? nameOfBox(item) : boxText[MENU_LABEL + item] ?? ''}
                  </div>
                ))}
              </div>
            )}
            <div className={own.grid}>
              {cursor.pane === 'box' && (
                <span
                  className={own.cursor}
                  style={{
                    left: (cursor.at % BOX_COLS) * own.SLOT_PITCH,
                    top: Math.floor(cursor.at / BOX_COLS) * own.SLOT_PITCH,
                  }}
                />
              )}
              {current.map((mon, i) => (
                <span
                  key={i}
                  className={[
                    own.slot,
                    held?.pane === 'box' && held.at.box === box && held.at.slot === i
                      ? own.picked : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    left: (i % BOX_COLS) * own.SLOT_PITCH,
                    top: Math.floor(i / BOX_COLS) * own.SLOT_PITCH,
                    ...(mon ? monIcon(icons, mon, SLOT_ICON) : { width: SLOT_ICON, height: SLOT_ICON }),
                  }}
                  onPointerEnter={() => { setCursor({ pane: 'box', at: i }) }}
                  onClick={grab}
                />
              ))}
            </div>
          </div>
        </div>

        <div className={own.side}>
          <div className={own.partyHead}>파티</div>
          <div className={own.party}>
            {Array.from({ length: PARTY_MAX }, (_, i) => {
              const mon = party[i]
              const on = cursor.pane === 'party' && cursor.at === i
              const kind = mon ? (on ? 'on' : 'off') : 'empty'
              return (
                <div
                  key={i}
                  className={[
                    own.partySlot[kind],
                    held?.pane === 'party' && held.at === i ? own.picked : '',
                  ].filter(Boolean).join(' ')}
                  onPointerEnter={() => { setCursor({ pane: 'party', at: i }) }}
                  onClick={grab}
                >
                  <span
                    className={own.partyIcon}
                    style={mon ? monIcon(icons, mon, 40) : undefined}
                  />
                  {mon && (
                    <span className={own.partyName}>
                      <span className={css.label}>{nameOf(mon)}</span>
                      <span className={own.partyLevel}>Lv.{mon.level}</span>
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className={own.notice}>{notice}</div>

          <div className={own.detail}>
            {mode === BOX_MODE.compare ? (
              <ComparePanel
                page={comparePage}
                mons={compare.map((c) => (c === null ? null : monAtHeld(c)))}
                names={names}
                species={species}
                moveNames={moveNames}
              />
            ) : selected && info ? (
              <>
                <div className={own.detailName}>
                  {nameOf(selected)}
                  <Gender mon={selected} ratio={info.genderRatio} />
                  <span className={own.detailSub}>Lv.{selected.level}</span>
                </div>
                <div className={own.detailRow}>
                  <span className={own.detailLabel}>종족</span>
                  <span>
                    No.{String(selected.species).padStart(3, '0')} {names[selected.species] ?? ''}
                  </span>
                </div>
                <div className={own.detailRow}>
                  <span className={own.detailLabel}>성격</span>
                  <span>{natureNames[natureOf(selected.pid)] ?? ''}</span>
                </div>
                <div className={own.detailRow}>
                  <span className={own.detailLabel}>HP</span>
                  <span>{selected.hp} / {maxHp(selected, info)}</span>
                </div>
                {/* 도구 옮기기에서는 지닌 물건이 주인공이다 */}
                {mode === BOX_MODE.items && (
                  <div className={own.detailRow}>
                    <span className={own.detailLabel}>지닌 물건</span>
                    <span>{selected.heldItem === 0 ? '없음' : itemNames[selected.heldItem] ?? ''}</span>
                  </div>
                )}
              </>
            ) : null}
            {mode === BOX_MODE.items && heldItem !== null && (
              <div className={own.detailRow}>
                <span className={own.detailLabel}>손에</span>
                <span>{itemNames[heldItem.item] ?? ''}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </MenuScreen>
  )
}

const GENDER_MARK: Record<string, { mark: string; cls: string }> = {
  male: { mark: '♂', cls: own.male },
  female: { mark: '♀', cls: own.female },
}

function Gender({ mon, ratio }: { mon: PokemonInstance; ratio: number }) {
  const gender = GENDER_MARK[genderOf(mon.pid, ratio)]
  return gender ? <span className={gender.cls}>{gender.mark}</span> : null
}

/**
 * 커서 한 칸 옮기기.
 *
 * 박스와 파티가 **옆으로 이어져 있다.** 박스 오른쪽 끝에서 →를 누르면 파티로
 * 넘어가고 파티 왼쪽 끝에서 ←를 누르면 박스로 돌아온다 — 원작도 6열 끝에서
 * 오른쪽을 누르면 파티 버튼으로 간다 (`box_app_manager`의 `boxCol == MAX_PC_COLS - 1`).
 *
 * 파티는 세 칸씩 두 줄이라 위아래도 그 모양으로 움직인다
 */
export function move(cursor: Cursor, dx: number, dz: number, partyCount: number): Cursor {
  // 머리 — ↓로 박스 맨 윗줄에 내려선다
  if (cursor.pane === 'header') return dz > 0 ? { pane: 'box', at: 0 } : cursor
  if (cursor.pane === 'box') {
    const col = cursor.at % BOX_COLS, row = Math.floor(cursor.at / BOX_COLS)
    if (dx > 0 && col === BOX_COLS - 1) return { pane: 'party', at: 0 }
    if (dz < 0 && row === 0) return { pane: 'header', at: 0 }
    const nx = Math.max(0, Math.min(BOX_COLS - 1, col + dx))
    const nz = Math.max(0, Math.min(BOX_ROWS - 1, row + dz))
    return { pane: 'box', at: nz * BOX_COLS + nx }
  }
  const col = cursor.at % 3, row = Math.floor(cursor.at / 3)
  if (dx < 0 && col === 0) return { pane: 'box', at: BOX_COLS - 1 }
  const nx = Math.max(0, Math.min(2, col + dx))
  const nz = Math.max(0, Math.min(1, row + dz))
  // 빈 칸도 커서가 선다 — 거기에 놓을 수 있어야 한다. 다만 파티는 앞에서부터
  // 차므로 들어 있는 수 **바로 다음 칸**까지만 간다
  return { pane: 'party', at: Math.min(nz * 3 + nx, Math.min(partyCount, PARTY_MAX - 1)) }
}

/**
 * 비교 쪽 둘 (`enum CompareMode`의 능력치 · 기술).
 *
 * ⚠️ 원작의 가운데 쪽(콘테스트 능력치)은 **접었다** — 콘테스트는 범위 밖이라 멋짐·아름다움
 * 다섯 값을 담는 계통이 없다. 빈 쪽을 넘겨 보게 두지 않는다
 */
const COMPARE_PAGES = ['능력치', '기술'] as const

const STAT_ROWS: readonly (readonly [string, keyof ReturnType<typeof statsOf>])[] = [
  ['HP', 'hp'], ['공격', 'atk'], ['방어', 'def'],
  ['특공', 'spa'], ['특방', 'spd'], ['스피드', 'spe'],
]

/** 두 마리를 나란히 놓고 본다 (`PC_MODE_COMPARE`). 쪽은 `COMPARE_PAGES`의 둘이다 */
function ComparePanel(
  { page, mons, names, species, moveNames }: {
    page: number
    mons: (PokemonInstance | null)[]
    names: string[]
    species: SpeciesTable | null
    moveNames: string[]
  },
) {
  const nameOf = (mon: PokemonInstance): string =>
    mon.nickname ?? names[mon.species] ?? `#${String(mon.species)}`
  const both = mons.filter((m): m is PokemonInstance => m !== null)
  if (!both.length) {
    return <div className={own.compareNote}>Z로 두 마리를 올린다 · Tab으로 쪽을 넘긴다</div>
  }

  return (
    <div className={own.compare}>
      <div className={own.compareHead}>
        {mons.map((mon, i) => (
          <span key={i} className={own.compareName}>{mon ? nameOf(mon) : '—'}</span>
        ))}
      </div>
      <div className={own.comparePage}>{COMPARE_PAGES[page]}</div>

      {page === 0 && species && mons[0] && mons[1] && (
        <div className={own.compareRows}>
          {STAT_ROWS.map(([label, key]) => {
            const a = statsOf(mons[0]!, species.of(mons[0]!))[key]
            const b = statsOf(mons[1]!, species.of(mons[1]!))[key]
            return (
              <div key={label} className={own.compareRow}>
                <span className={a > b ? own.compareWin : own.compareValue}>{a}</span>
                <span className={own.compareLabel}>{label}</span>
                <span className={b > a ? own.compareWin : own.compareValue}>{b}</span>
              </div>
            )
          })}
        </div>
      )}

      {page === 1 && (
        <div className={own.compareRows}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={own.compareRow}>
              <span className={own.compareValue}>
                {mons[0]?.moves[i] ? moveNames[mons[0].moves[i].move] ?? '' : '—'}
              </span>
              <span className={own.compareLabel}>{i + 1}</span>
              <span className={own.compareValue}>
                {mons[1]?.moves[i] ? moveNames[mons[1].moves[i].move] ?? '' : '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {(!mons[0] || !mons[1]) && (
        <div className={own.compareNote}>한 마리를 더 올린다</div>
      )}
    </div>
  )
}
