// 가이드맵 — 신오 지도 위에서 갈 곳을 고른다 (PARITY §5 · `applications/town_map`)
//
// 전에는 **목록**이었다. 원작은 지도를 띄우고 그 위에서 고르므로
// (`TOWN_MAP_MODE_FLY`), 어디가 어디 옆인지가 목록으로는 통째로 사라진다.
//
// 커서는 격자를 **한 칸씩** 움직이고 선 칸이 곧 고른 곳이다 — 표식 사이를
// 건너뛰지 않는다(`TownMap_UpdateHoveredFlyLocation`이 커서 칸으로 찾는다).
// 그래서 도로 이름도 지나가며 읽힌다.
//
// 갈 수 있는 곳은 **가 본 마을**뿐이다. 원작도 존에 처음 발을 들일 때 열린다
// (`unlockOnMapEntry`).
//
// 원작은 두 화면(전체 + 확대)이지만 우리는 한 화면이다 — 왼쪽에 지도를 정수배(3 · Tab으로 4)로 크게 두고,
// 오른쪽 칸이 이름 · 설명 · 날기 줄 · 열린 곳 목록 · 지금 있는 곳을 맡는다. 계산(영역 · 이름표 쪽 · 이동 · Q/E)은
// `flyMap.ts`고, 커서 칸 셈(`at`)은 이 파일이 쥔다 — 이동과 확대는 연출일 뿐 `at`을 안 건드린다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flySpotOpen, spawnWarp } from '../../engine/map/spawns'
import {
  cellAt,
  flySpotAt,
  FLY_SPOTS,
  GRID_MAX_X,
  GRID_MAX_Z,
  GRID_MIN_X,
  GRID_MIN_Z,
  NO_LANDMARK,
  unlockedHidden,
  type TownMapCell,
} from '../../engine/map/townMap'
import { fieldScripts, flyVerdictNow } from '../../engine/script/field'
import { loadPokeIcons, loadTownMap, loadTownMapPlayer } from '../../data/gameData'
import type { PokeIcons } from '../../data/schema'
import type { SpriteSheet } from '../../data/spriteSheet'
import { loadUiText } from '../../data/uiText'
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import { useSessionStore } from '../../state/sessionStore'
import { worldState } from '../../state/worldState'
import { localToRom, mapById, world as mapWorld } from '../../engine/map/world'
import { useGameLocale } from '../../state/optionsStore'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { assets, readJson } from '../../data/providers/assetProvider'
import { FIELD_MOVES } from '../../engine/script/fieldMoves'
import { ScrollKnob } from '../common/ScrollKnob'
import { pixelSpriteAt } from '../common/pixelSprite'
import { LINE } from '../theme/scale'
import { MenuScreen } from './MenuScreen'
import { monIconAt } from './pokeIcon'
import {
  CROP, SHEET, ZOOM, captionParts, cellBox, cellCenter, flyFoot, labelAnchor, labelledSpots, mapSize, markBox, panFor, stepSpot,
} from './flyMap'
import type { Spot } from './flyMap'
import { useMenuKeys } from './useMenuKeys'
import { roamersFlew } from '../../scene/roamers'
import { journalFlew } from '../../scene/journal'
import { beginFlyTransition } from '../../scene/flyTransition'
import * as own from './flyScreen.css'
import { pointerMoved } from '../pointerMoved'

/** 커서가 처음 서는 칸. 갈 수 있는 첫 곳으로 간다 */
const HOME = { x: 3, z: 27 }

/**
 * 커서가 처음 설 칸 — **주인공이 있는 블록**이다 (`TownMap_Init` → `initialCursorX = playerX / 32`).
 *
 * 실내·동굴이면 들어오기 전 바깥 자리(`FieldOverworldState_GetExitLocation` — 우리 `save.exit`)다. 자리를 모르면 원작처럼
 * 떡잎마을(3,27)이다. 날기·벽 지도·타운맵 도구가 다 같다.
 *
 * 내보낸다 — e2e가 방향키를 몇 번 누를지 **이 값에서** 센다(`observe.flyPlan`). 따로 셈하면 갈린다
 */
export function playerBlock(): { x: number, z: number } {
  const header = mapById(mapWorld.mapId)
  const p = worldState.player.position
  const exit = useSaveStore.getState().exit
  const at = header?.matrix === 0 ? localToRom(mapWorld.mapId, Math.floor(p.x), Math.floor(p.z))
    : exit === null ? null : localToRom(exit.map, Math.floor(exit.x), Math.floor(exit.z))
  if (at === null || (at.x === 0 && at.z === 0)) return HOME
  return { x: Math.floor(at.x / 32), z: Math.floor(at.z / 32) }
}

/**
 * 지도 아래 날기 줄. 날기 자리가 아닌 칸이면 null이다.
 *
 * ⚠️ **보기만 하는 지도에서는 「Z · 여기로 날아간다」를 안 띄운다** — 벽 지도와
 * 타운맵 도구는 Z가 아무것도 안 한다(`fly`의 `viewOnly`). 열린 자리는 날 수
 * 있는 곳이라고만 적는다
 */
export function flyCaption(spot: boolean, unlocked: boolean, viewOnly: boolean): string | null {
  if (!spot) return null
  if (!unlocked) return '아직 가 본 적이 없다'
  return viewOnly ? '날 수 있는 곳' : 'Z · 여기로 날아간다'
}

/** 목록 머리 · 지금 있는 곳 — 롬에 없는 말이라 세 언어를 든다 */
const COPY: Record<string, { open: string, here: string }> = {
  ko: { open: '날 수 있는 곳', here: '지금 있는 곳' },
  en: { open: 'Places to fly', here: 'You are here' },
  ja: { open: '行ける場所', here: 'いまいる場所' },
}

export function FlyScreen() {
  const closeAll = useMenuStore((s) => s.closeAll)
  const back = useMenuStore((s) => s.back)
  const flySpots = useSaveStore((s) => s.flySpots)
  const party = useSaveStore((s) => s.party)
  const gender = useSaveStore((s) => s.trainer.gender)
  const zoneName = useSessionStore((s) => s.zoneName)
  const locale = useGameLocale()
  const [cells, setCells] = useState<readonly TownMapCell[]>([])
  /** 칸 설명 (`TEXT_BANK_TOWN_MAP`). 0번은 날기 물음, 1번은 화면 이름 */
  const [notes, setNotes] = useState<string[]>([])
  /** 지역명 (`names/locations.*.json`). 이름은 이쪽에서 온다 */
  const [names, setNames] = useState<string[]>([])
  const [monIcons, setMonIcons] = useState<PokeIcons>()
  const [playerSheet, setPlayerSheet] = useState<SpriteSheet | null>(null)
  const viewOnly = useMenuStore((s) => s.townMapView)
  const [at, setAt] = useState(playerBlock)
  /** 주인공이 서 있는 블록 — 커서가 처음 서는 칸과 같다 */
  const [home] = useState(playerBlock)
  const [zoomed, setZoomed] = useState(false)
  const sheet = useAssetImage('data/townMap.png')
  const k = zoomed ? ZOOM.in : ZOOM.out

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadTownMap(),
      loadUiText('townMap', locale),
      readJson(assets(), `data/names/locations.${locale}.json`) as Promise<string[]>,
    ])
      .then(([file, text, places]) => {
        if (!alive) return
        setCells(file.cells)
        setNotes(text)
        setNames(places)
      })
      .catch(() => {
        /* 이름 없이도 지도는 뜬다 */
      })
    // 머리 그림 둘은 없어도 화면이 선다 — 못 받으면 아이콘 칸 · 주인공 표식이 비거나 점으로 떨어진다
    void loadPokeIcons().then((v) => { if (alive) setMonIcons(v) }, () => { /* 머리 아이콘만 빈다 */ })
    void loadTownMapPlayer().then((v) => { if (alive) setPlayerSheet(v) }, () => { /* 점으로 떨어진다 */ })
    return () => {
      alive = false
    }
  }, [locale])

  // 숨은 자리 넷은 이야기가 열기 전에는 지도에 아예 없다 (PARITY §5)
  const hidden = unlockedHidden((id) => fieldScripts.vars.get(id))
  const cellHere = cellAt(cells, at.x, at.z, hidden)
  const spot = flySpotAt(cellHere?.map ?? -1, at.x, at.z)
  const isOpen = (spawn: number): boolean => flySpotOpen(spawn, flySpots, (f) => fieldScripts.vars.checkFlag(f))
  const unlocked = spot !== null && isOpen(spot.spawn)
  const caption = flyCaption(spot !== null, unlocked, viewOnly)
  /**
   * 열린 날기 자리 — 표 차례(이야기 순). 목록 · Q/E · 이름표가 같은 것을 본다.
   *
   * 포켓몬리그(spawn 14 · 19)는 이름이 같아도 **두 자리를 다 세운다.** 원작도 `sFlyLocations` 스무 곳에 챔피언로드 앞
   * (`FLY_LOCATION_VICTORY_ROAD`)과 리그 정문(`FLY_LOCATION_POKEMON_LEAGUE`)을 따로 두고 열림 깃발도 따로 본다
   * (`sTownMapFlyLocationUnlockFlags`) — 내리는 자리가 다르다. 이름표만 하나로 줄인다(`labelledSpots`)
   */
  const openSpots = FLY_SPOTS.filter((s) => isOpen(s.spawn))
  const spotAtBlock = (x: number, z: number): Spot | null => flySpotAt(cellAt(cells, x, z, hidden)?.map ?? -1, x, z)
  const homeSpot = spotAtBlock(home.x, home.z)
  /** 그 자리의 이름 — 표식이 선 칸의 지역명이다 */
  const spotName = (s: Spot): string => {
    const c = cellAt(cells, s.x, s.z, hidden)
    return c ? names[c.label] ?? '' : ''
  }

  const move = (dx: number, dz: number) => () => {
    setAt((c) => ({
      x: Math.max(GRID_MIN_X, Math.min(GRID_MAX_X, c.x + dx)),
      z: Math.max(GRID_MIN_Z, Math.min(GRID_MAX_Z, c.z + dz)),
    }))
  }

  /** Q · E — 열린 날기 자리로 건너뛴다. 방향키와 같은 `setAt`이다 */
  const hop = (dir: 1 | -1) => () => {
    setAt((c) => {
      const next = stepSpot(openSpots, spotAtBlock(c.x, c.z), dir)
      return next === null ? c : { x: next.x, z: next.z }
    })
  }

  const flyTo = (target: Spot | null): void => {
    // 벽 지도와 타운맵 도구는 보기만 한다 — A가 아무것도 안 한다 (`TownMap_HandleInput_WallMap` · `_Item`)
    if (viewOnly) return
    if (!target || !isOpen(target.spawn)) return
    // ⚠️ **떠나는 자리도 다시 본다** (`FieldMoves_CheckFly`, REPAIR §91). 이 화면은
    // 시작 메뉴와 파티 화면이 헤더를 본 뒤에만 열리지만, 열린 채로 맵이 바뀌는 길을
    // 하나라도 남기면 막힌 맵에서 난다 — 막혔으면 날지 않고 닫는다
    if (flyVerdictNow() !== null) { closeAll(); return }
    const warp = spawnWarp(target.spawn, 'fly')
    if (!warp) return
    // ⚠️ **날면 배회가 전부 흩어진다** (`FieldSystem_SetFlyFlags`, PARITY §6.3).
    // 이게 없으면 배회를 찾아 놓고 날아가서 잡는 것이 되어, 도로를 걸어
    // 뒤쫓는다는 규칙이 통째로 무의미해진다
    roamersFlew()
    // 노트에 「…로 날아갔다!」 (PARITY §7.4)
    journalFlew(warp.to)
    beginFlyTransition(warp)
    closeAll()
  }
  const fly = (): void => { flyTo(spot) }

  useMenuKeys({
    up: move(0, -1),
    down: move(0, 1),
    left: move(-1, 0),
    right: move(1, 0),
    pageUp: hop(-1),
    pageDown: hop(1),
    // 원작은 아래 화면이 늘 확대판이다. 우리는 화면이 하나라 Tab으로 오간다 —
    // 도로 이름을 읽기에는 확대 쪽이 낫고, 어디로 갈지 고르기에는 전체가 낫다
    tab: () => {
      setZoomed((z) => !z)
    },
    confirm: fly,
    cancel: back,
  })

  // 지도 칸의 크기 — 이동(pan)의 기준. 창이 커지면 지도 칸은 그대로고 오른쪽 칸이 는다
  const viewEl = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ w: own.MAP_COLUMN, h: 530 })
  useLayoutEffect(() => {
    const el = viewEl.current
    if (el === null) return
    const measure = (): void => {
      setView((v) => (v.w === el.clientWidth && v.h === el.clientHeight ? v : { w: el.clientWidth, h: el.clientHeight }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => { watch.disconnect() }
  }, [])

  // 목록 — 고른 줄이 보이게 하고, 손잡이가 읽을 위치를 안다
  const listEl = useRef<HTMLDivElement>(null)
  const [listScroll, setListScroll] = useState({ top: 0, height: 0 })
  const syncList = (): void => {
    const el = listEl.current
    if (el === null) return
    setListScroll((v) => (v.top === el.scrollTop && v.height === el.clientHeight ? v : { top: el.scrollTop, height: el.clientHeight }))
  }
  const listAt = spot === null ? -1 : openSpots.findIndex((s) => s.spawn === spot.spawn)
  useLayoutEffect(() => {
    const el = listEl.current
    if (el !== null && listAt >= 0) {
      const top = listAt * LINE.row
      if (top < el.scrollTop) el.scrollTop = top
      else if (top + LINE.row > el.scrollTop + el.clientHeight) el.scrollTop = top + LINE.row - el.clientHeight
    }
    syncList()
  })

  const size = mapSize(k)
  const offset = panFor(at, k, view)
  const area = cellHere === null
    ? []
    : cells.filter((c) => c.label === cellHere.label && (c.hidden === 0 || (c.hidden & hidden) !== 0))
  const meAt = cellCenter(home.x, home.z, k)
  const meSize = 32
  const playerAt = (col: number, scale: 1 | 2) => (playerSheet === null ? null : pixelSpriteAt(playerSheet, col, 0, scale))
  const col = gender === 'boy' ? 0 : 1
  const flyer = viewOnly ? undefined : party.find((m) => m.moves.some((s) => s.move === FIELD_MOVES.fly.move))
  const copy = COPY[locale] ?? COPY.ko!
  const act = caption === null ? null : captionParts(caption)

  return (
    <MenuScreen
      title={notes[1] ?? ''}
      {...(flyer !== undefined ? { icon: <span style={monIconAt(monIcons, flyer, 1)} aria-hidden /> } : {})}
      {...(!viewOnly && notes[0] !== undefined ? { note: notes[0] } : {})}
      foot={flyFoot(zoomed, viewOnly)}
    >
      <div className={own.stage}>
        <div className={own.viewport} ref={viewEl}>
          <div
            className={own.pan}
            style={{ width: size.w, height: size.h, transform: `translate(${String(offset.x)}px, ${String(offset.y)}px)` }}
          >
            <div
              className={own.art}
              style={{
                ...(sheet !== null ? { backgroundImage: `url(${sheet})` } : {}),
                backgroundSize: `${String(SHEET.w * k)}px ${String(SHEET.h * k)}px`,
                backgroundPosition: `-${String(CROP.x * k)}px -${String(CROP.y * k)}px`,
              }}
            />

            {/* 고른 칸이 속한 구역 — 이름 붙은 칸이 통째로 밝아진다 */}
            {area.map((c) => <span key={`${String(c.x)}/${String(c.z)}`} className={own.tint} style={cellBox(c.x, c.z, k)} />)}

            {FLY_SPOTS.map((s, i) => {
              const lit = isOpen(s.spawn)
              return (
                <span
                  key={`${String(s.spawn)}/${String(i)}`}
                  className={own.mark[lit ? (s.city ? 'city' : 'town') : 'locked']}
                  style={markBox(s, k)}
                  onPointerMove={(e) => {
                    if (pointerMoved(e) && (at.x !== s.x || at.z !== s.z)) setAt({ x: s.x, z: s.z })
                  }}
                  onClick={() => { flyTo(s) }}
                />
              )
            })}

            {/* 열린 곳에만 이름이 붙는다 — 닫힌 곳은 원작처럼 이름 없이 회색 표식만이다 */}
            {labelledSpots(openSpots, spotName).map((s) => (
              <span key={s.spawn} className={own.label} style={labelAnchor(s, k, locale)}>{spotName(s)}</span>
            ))}

            {/* 주인공이 있는 블록 — 머리 그림과 파문. 그림을 못 받았으면 금 점 */}
            <span
              className={own.ring}
              style={{ left: meAt.x - meSize / 2 - 4, top: meAt.y - meSize / 2 - 4, width: meSize + 8, height: meSize + 8 }}
            />
            {playerSheet !== null
              ? (
                <span
                  className={own.me}
                  style={{ left: meAt.x - meSize / 2, top: meAt.y - meSize / 2, ...playerAt(col, 2) }}
                  aria-hidden
                />
              )
              : <span className={own.meDot} style={{ left: meAt.x - 8, top: meAt.y - 8, width: 16, height: 16 }} />}

            <span className={own.cursor} style={cellBox(at.x, at.z, k)} />
          </div>
        </div>

        <div className={own.side}>
          {/* 이름도 원작 글이다 (`TEXT_BANK_TOWN_MAP`) — 이름은 지역명 표, 설명은 타운맵 뱅크다. 원작도 다른 표에서 가져온다 */}
          <div className={cellHere ? own.name : `${own.name} ${own.nameNone}`}>{cellHere ? (names[cellHere.label] ?? '') : '—'}</div>
          <div className={own.desc}>
            {cellHere && cellHere.landmark !== NO_LANDMARK
              ? (notes[cellHere.landmark] ?? '')
              : cellHere
                ? (notes[cellHere.area] ?? '')
                : ''}
          </div>
          <div className={own.act}>
            {act !== null && spot !== null && (
              unlocked && !viewOnly
                ? (
                  <div className={own.go}>
                    {act.key !== null && <kbd className={own.keycap}>{act.key}</kbd>}
                    {act.text}
                  </div>
                )
                : (
                  <span className={`${own.noteLine} ${own.note[unlocked ? 'open' : 'locked']}`}>
                    <i className={own.dot[unlocked ? (spot.city ? 'city' : 'town') : 'locked']} />
                    {act.text}
                  </span>
                )
            )}
          </div>

          <div className={own.listHead}>
            {copy.open}
            <span className={own.listCount}>{openSpots.length}/{FLY_SPOTS.length}</span>
          </div>
          <div className={own.listBox}>
            <div className={own.list} ref={listEl} role="list" onScroll={syncList}>
              {openSpots.map((s) => {
                const on = spot !== null && spot.spawn === s.spawn
                return (
                  <div
                    key={s.spawn}
                    role="listitem"
                    className={on ? own.rowOn : own.row}
                    onPointerMove={(e) => {
                      if (pointerMoved(e) && (at.x !== s.x || at.z !== s.z)) setAt({ x: s.x, z: s.z })
                    }}
                    onClick={() => { flyTo(s) }}
                  >
                    {on && <span className={own.rowCaret} />}
                    <i className={own.dot[s.city ? 'city' : 'town']} />
                    <span className={own.rowName}>{spotName(s)}</span>
                    {homeSpot !== null && homeSpot.spawn === s.spawn && playerSheet !== null && (
                      <span className={own.rowHere} style={playerAt(col, 1) ?? undefined} aria-hidden />
                    )}
                  </div>
                )
              })}
            </div>
            <ScrollKnob at={listScroll.top / LINE.row} visible={listScroll.height / LINE.row} total={openSpots.length} />
          </div>
          <div className={own.now}>
            {playerSheet !== null && <span className={own.nowIcon} style={playerAt(col, 2) ?? undefined} aria-hidden />}
            {copy.here}
            {zoneName !== null && <b className={own.nowName}>{zoneName}</b>}
          </div>
        </div>
      </div>
    </MenuScreen>
  )
}
