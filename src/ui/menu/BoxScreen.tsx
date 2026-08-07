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
import { useEffect, useState } from 'react'
import { loadBoxWallpapers, loadPokeIcons, loadSpecies, loadSpeciesNames } from '../../data/gameData'
import type { SpeciesTable } from '../../data/gameData'
import type { BoxWallpapers, PokeIcons } from '../../data/schema'
import { BOX_TEXT, loadUiText, PC_MENU } from '../../data/uiText'
import { genderOf, maxHp, natureOf, PARTY_MAX } from '../../engine/pokemon/instance'
import type { PokemonInstance } from '../../engine/pokemon/instance'
import {
  BOX_COLS, BOX_COUNT, BOX_MODE, BOX_ROWS, BOX_SIZE, countAll, countInBox,
} from '../../engine/pokemon/boxes'
import type { BoxSpot } from '../../engine/pokemon/boxes'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { MenuScreen } from './MenuScreen'
import { boxWallpaper, pokeIcon } from './pokeIcon'
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

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(), loadSpeciesNames(locale), loadPokeIcons(), loadBoxWallpapers(),
      loadUiText('storageSystem', locale), loadUiText('boxMessages', locale),
      loadUiText('menuEntries', locale),
    ])
      .then(([table, list, icon, wall, names18, names19, entries]) => {
        if (!alive) return
        setSpecies(table); setNames(list); setIcons(icon); setWalls(wall)
        setBoxText(names18); setMsg(names19); setPcText(entries)
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
    if (held === null) {
      if (!selected) return
      setHeld(cursor.pane === 'box'
        ? { pane: 'box', at: { box, slot: cursor.at } }
        : { pane: 'party', at: cursor.at })
      return
    }
    if (place(held)) setHeld(null)
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
      setCursor((c) => ({ pane: c.pane === 'box' ? 'party' : 'box', at: 0 }))
    },
    confirm: grab,
    cancel: () => {
      setNotice(null)
      if (held !== null) { setHeld(null); return }
      back()
    },
  })

  const nameOf = (mon: PokemonInstance): string => mon.nickname ?? names[mon.species] ?? ''
  const info = species && selected ? species.byId.get(selected.species) : undefined
  const boxName = boxText[BOX_TEXT.boxName + box] ?? ''
  const title = pcText[PC_MENU.storageModes + mode] ?? ''

  const foot = held !== null
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
                    ...(mon ? pokeIcon(icons, mon.species, SLOT_ICON) : { width: SLOT_ICON, height: SLOT_ICON }),
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
                    style={mon ? pokeIcon(icons, mon.species, 40) : undefined}
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
            {selected && info ? (
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
              </>
            ) : null}
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
