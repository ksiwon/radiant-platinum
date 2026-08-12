// 타운맵 — 신오 지도 위에서 갈 곳을 고른다 (PARITY §5 · `applications/town_map`)
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
import { useEffect, useState } from 'react'
import { spawnWarp } from '../../engine/map/spawns'
import { world } from '../../engine/map/world'
import {
  cellAt, flySpotAt, FLY_SPOTS, GRID, gridX, gridY, GRID_MAX_X, GRID_MAX_Z,
  GRID_MIN_X, GRID_MIN_Z, NO_LANDMARK, SHAPE_SIZE, type TownMapCell,
} from '../../engine/map/townMap'
import { loadTownMap } from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import { useSessionStore } from '../../state/sessionStore'
import { useGameLocale } from '../../state/optionsStore'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { assets, readJson } from '../../data/providers/assetProvider'
import { MenuScreen } from './MenuScreen'
import { useMenuKeys } from './useMenuKeys'
import { roamersFlew } from '../../scene/roamers'
import { journalFlew } from '../../scene/journal'
import * as own from './flyScreen.css'
import { ZOOM } from './flyScreen.css'

/** 커서가 처음 서는 칸. 갈 수 있는 첫 곳으로 간다 */
const HOME = { x: 3, z: 27 }

export function FlyScreen() {
  const closeAll = useMenuStore((s) => s.closeAll)
  const back = useMenuStore((s) => s.back)
  const flySpots = useSaveStore((s) => s.flySpots)
  const mapId = useSessionStore((s) => s.mapId)
  const locale = useGameLocale()
  const [cells, setCells] = useState<readonly TownMapCell[]>([])
  /** 칸 설명 (`TEXT_BANK_TOWN_MAP`) */
  const [notes, setNotes] = useState<string[]>([])
  /** 지역명 (`names/locations.*.json`). 이름은 이쪽에서 온다 */
  const [names, setNames] = useState<string[]>([])
  const [at, setAt] = useState(HOME)
  const sheet = useAssetImage('data/townMap.png')

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
      .catch(() => { /* 이름 없이도 지도는 뜬다 */ })
    return () => { alive = false }
  }, [locale])

  // 커서를 갈 수 있는 첫 곳에 세운다. 아무 데도 못 가면 떡잎마을 자리다
  useEffect(() => {
    const open = FLY_SPOTS.find((s) => (flySpots & (1 << s.spawn)) !== 0)
    if (open) setAt({ x: open.x, z: open.z })
  }, [flySpots])

  const cellHere = cellAt(cells, at.x, at.z)
  const spot = flySpotAt(cellHere?.map ?? -1, at.x, at.z)
  const unlocked = spot !== null && (flySpots & (1 << spot.spawn)) !== 0
  const cell = cellHere

  const move = (dx: number, dz: number) => () => {
    setAt((c) => ({
      x: Math.max(GRID_MIN_X, Math.min(GRID_MAX_X, c.x + dx)),
      z: Math.max(GRID_MIN_Z, Math.min(GRID_MAX_Z, c.z + dz)),
    }))
  }

  const fly = (): void => {
    if (!spot || !unlocked) return
    const target = spawnWarp(spot.spawn, 'fly')
    if (!target) return
    // ⚠️ **날면 배회가 전부 흩어진다** (`FieldSystem_SetFlyFlags`, PARITY §6.3).
    // 이게 없으면 배회를 찾아 놓고 날아가서 잡는 것이 되어, 도로를 걸어
    // 뒤쫓는다는 규칙이 통째로 무의미해진다
    roamersFlew()
    // 노트에 「…로 날아갔다!」 (PARITY §7.4)
    journalFlew(target.to)
    world.pending = target
    closeAll()
  }

  useMenuKeys({
    up: move(0, -1),
    down: move(0, 1),
    left: move(-1, 0),
    right: move(1, 0),
    confirm: fly,
    cancel: back,
  })

  const open = FLY_SPOTS.filter((s) => (flySpots & (1 << s.spawn)) !== 0).length
  const px = (v: number): number => v * ZOOM

  return (
    <MenuScreen
      title="타운맵"
      note={`갈 수 있는 곳 ${String(open)}`}
      foot={<span>↑↓←→ 옮기기 · Z 날아간다 · X 뒤로</span>}
    >
      <div className={own.stage}>
        <div className={own.map}>
          {sheet !== null && <img className={own.sheet} src={sheet} alt="" />}

          {FLY_SPOTS.map((s, i) => {
            const [w, h] = SHAPE_SIZE[s.shape] ?? [GRID, GRID]
            const lit = (flySpots & (1 << s.spawn)) !== 0
            return (
              <span
                key={`${String(s.spawn)}/${String(i)}`}
                className={own.mark[lit ? (s.city ? 'city' : 'town') : 'locked']}
                style={{
                  left: px(gridX(s.x) + s.dx),
                  top: px(gridY(s.z) + s.dy),
                  width: px(w),
                  height: px(h),
                }}
                onPointerEnter={() => { setAt({ x: s.x, z: s.z }) }}
                onClick={fly}
              />
            )
          })}

          {/* 지금 서 있는 자리. 어디서 나는지가 보여야 어디로 갈지가 읽힌다 */}
          {(() => {
            const home = FLY_SPOTS.find((s) => s.map === mapId)
            if (!home) return null
            return (
              <span
                className={own.here}
                style={{
                  left: px(gridX(home.x) + 2), top: px(gridY(home.z) + 2),
                  width: px(3), height: px(3),
                }}
              />
            )
          })()}

          <span
            className={own.cursor}
            style={{
              left: px(gridX(at.x)) - ZOOM,
              top: px(gridY(at.z)) - ZOOM,
              width: px(GRID),
              height: px(GRID),
            }}
          />

          <div className={own.caption}>
          {/* 이름도 원작 글이다 (`TEXT_BANK_TOWN_MAP`) — 칸마다 이름이 붙어 있다 */}
            {/* 이름은 지역명 표, 아래 한 줄은 타운맵 뱅크의 설명이다 —
                원작도 이름과 설명을 다른 표에서 가져온다 */}
            <span className={own.captionName}>{cell ? names[cell.label] ?? '' : ''}</span>
            <span className={own.captionSub}>
              {cell && cell.landmark !== NO_LANDMARK
                ? notes[cell.landmark] ?? ''
                : cell ? notes[cell.area] ?? '' : ''}
            </span>
            {spot && (
              <span className={own.captionFly}>
                {unlocked ? 'Z · 여기로 날아간다' : '아직 가 본 적이 없다'}
              </span>
            )}
          </div>
        </div>
      </div>
    </MenuScreen>
  )
}
