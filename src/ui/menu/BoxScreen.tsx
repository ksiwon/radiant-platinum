// 포켓몬 보관 시스템 (DATA.md §2.20)
//
// PC 앞에서 "포켓몬을 맡긴다"를 고르면 열린다. 원작 스크립트가 그대로 도므로
// 여기까지 오는 길과 항목 글은 전부 롬의 것이다 (`CommonScript_StorageSystem`).
//
// 화면이 하는 일은 하나뿐이다 — **집어서 다른 자리에 놓는다.** 맡기기·꺼내기·
// 정리하기가 원작에서도 같은 손짓이고, 갈래(`mode`)는 커서가 어디서 시작하는지와
// 창 이름만 정한다.
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
import { BOX_TEXT, loadUiText, PC_MENU } from '../../data/uiText'
import { genderOf, maxHp, natureOf, PARTY_MAX, statsOf } from '../../engine/pokemon/instance'
import type { PokemonInstance } from '../../engine/pokemon/instance'
import {
  BOX_COLS, BOX_COUNT, BOX_MODE, BOX_ROWS, BOX_SIZE, countAll, countInBox,
} from '../../engine/pokemon/boxes'
import type { BoxSpot } from '../../engine/pokemon/boxes'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { LocationEvent } from '../../engine/world/journal'
import { journalPlain } from '../../scene/journal'
import { MenuScreen } from './MenuScreen'
import { boxWallpaper, monIcon } from './pokeIcon'
import { useMenuKeys, wrapCursor } from './useMenuKeys'
import * as css from './menuChrome.css'
import * as own from './boxScreen.css'

/** 벽지·아이콘을 화면 픽셀로 옮기는 배수. css 쪽과 같은 값이다 */
const K = 3
/** 박스 칸의 아이콘 크기 (원작 32) */
const SLOT_ICON = 32 * K

/** 커서가 앉을 수 있는 곳 */
type Pane = 'box' | 'party'

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

  const mode = useMenuStore((s) => s.boxMode)
  const back = useMenuStore((s) => s.back)
  const party = useSaveStore((s) => s.party)
  const boxes = useSaveStore((s) => s.boxes)
  const box = useSaveStore((s) => s.currentBox)
  const wallpapers = useSaveStore((s) => s.wallpapers)
  const setCurrentBox = useSaveStore((s) => s.setCurrentBox)
  // 이 화면에서 한 마리라도 옮겼는가. 노트가 나갈 때 이 값을 본다
  const moved = useRef(false)
  const setBoxSlot = useSaveStore((s) => s.setBoxSlot)
  const setPartySlot = useSaveStore((s) => s.setPartySlot)
  const depositMon = useSaveStore((s) => s.depositMon)
  const withdrawMon = useSaveStore((s) => s.withdrawMon)
  const swapBoxSlots = useSaveStore((s) => s.swapBoxSlots)
  const swapParty = useSaveStore((s) => s.swapParty)

  // 맡기러 왔으면 파티에서, 꺼내러 왔으면 박스에서 시작한다.
  // 원작도 갈래마다 처음 잡는 손이 다르다
  const [cursor, setCursor] = useState<Cursor>(
    () => ({ pane: mode === BOX_MODE.deposit ? 'party' : 'box', at: 0 }),
  )
  const [held, setHeld] = useState<Held | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 도구 옮기기(3)에서 집어 든 도구. 어디서 집었는지까지 든다 */
  const [heldItem, setHeldItem] = useState<{ from: Held; item: number } | null>(null)
  /** 비교하기(4)에 올려 둔 두 마리. 채운 차례대로 들어간다 */
  const [compare, setCompare] = useState<(Held | null)[]>([null, null])
  /** 비교 쪽 셋 — 능력치 · 콘테스트 · 기술 */
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
    ])
      .then(([table, list, icon, wall, names18, names19, entries, items, moves]) => {
        if (!alive) return
        setSpecies(table); setNames(list); setIcons(icon); setWalls(wall)
        setBoxText(names18); setMsg(names19); setPcText(entries)
        setItemNames(items); setMoveNames(moves)
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
    setCursor((c) => move(c, dx, dz, party.length))
  }

  const turnBox = (d: number) => () => {
    setNotice(null)
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
    // 도구 옮기기(3)·비교하기(4)는 마리가 아니라 다른 것을 집는다
    if (mode === BOX_MODE.items) { grabItem(); return }
    if (mode === BOX_MODE.compare) { markCompare(); return }
    if (held === null) {
      if (!selected) return
      setHeld(cursor.pane === 'box'
        ? { pane: 'box', at: { box, slot: cursor.at } }
        : { pane: 'party', at: cursor.at })
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
      // 비교하기에서는 Tab이 쪽을 넘긴다 (`enum CompareMode`)
      if (mode === BOX_MODE.compare) {
        setComparePage((p) => wrapCursor(p, 1, COMPARE_PAGES.length))
        return
      }
      setCursor((c) => ({ pane: c.pane === 'box' ? 'party' : 'box', at: 0 }))
    },
    confirm: grab,
    cancel: () => {
      setNotice(null)
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
      back()
    },
  })

  const nameOf = (mon: PokemonInstance): string => mon.nickname ?? names[mon.species] ?? ''
  const info = species && selected ? species.of(selected) : undefined
  const boxName = boxText[BOX_TEXT.boxName + box] ?? ''
  const title = pcText[PC_MENU.storageModes + mode] ?? ''

  const foot = mode === BOX_MODE.compare
    ? `↑↓←→ 고르기 · Z 올린다/내린다 · Tab ${COMPARE_PAGES[comparePage]} · X 닫기`
    : mode === BOX_MODE.items
      ? (heldItem !== null
        ? '↑↓←→ 옮기기 · Z 놓기 · Q/E 박스 · X 닫기'
        : '↑↓←→ 고르기 · Z 도구 집기 · Tab 파티/박스 · Q/E 박스 · X 닫기')
      : held !== null
        ? '↑↓←→ 옮기기 · Z 놓기 · Q/E 박스 · X 되돌리기'
        : '↑↓←→ 고르기 · Z 집기 · Tab 파티/박스 · Q/E 박스 · X 닫기'

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
            <div className={own.boxName}>{boxName}</div>
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
                  <span>{natureOf(selected.pid)}</span>
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
  if (cursor.pane === 'box') {
    const col = cursor.at % BOX_COLS, row = Math.floor(cursor.at / BOX_COLS)
    if (dx > 0 && col === BOX_COLS - 1) return { pane: 'party', at: 0 }
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

/** 비교 쪽 셋 (`enum CompareMode`) */
const COMPARE_PAGES = ['능력치', '콘테스트', '기술'] as const

const STAT_ROWS: readonly (readonly [string, keyof ReturnType<typeof statsOf>])[] = [
  ['HP', 'hp'], ['공격', 'atk'], ['방어', 'def'],
  ['특공', 'spa'], ['특방', 'spd'], ['스피드', 'spe'],
]

/**
 * 두 마리를 나란히 놓고 본다 (`PC_MODE_COMPARE`).
 *
 * ⚠️ **콘테스트 쪽은 아직 못 채운다.** 멋짐·아름다움 다섯 값이 §3.11이고
 * 그 계통이 없다 — 0을 늘어놓으면 「다 0이구나」로 읽히므로 그렇게 말한다
 */
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
        <div className={own.compareNote}>
          콘테스트 능력치가 아직 없다 (§3.11)
        </div>
      )}

      {page === 2 && (
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
