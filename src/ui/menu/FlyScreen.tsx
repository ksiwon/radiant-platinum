// 공중날기 — 어디로 갈지 고른다 (DATA.md §2.3)
//
// 원작은 타운맵을 띄우고 지도 위에서 고른다(`TOWN_MAP_MODE_FLY`). 그 지도 그림은
// 아직 안 뽑았으므로 여기서는 **목록**으로 낸다 — 갈 수 있는 곳과 그 순서는
// 원작 표 그대로다(`spawns.json`).
//
// 목록에 뜨는 곳은 **가 본 마을**뿐이다. 원작도 존에 처음 발을 들일 때 열린다
// (`unlockOnMapEntry`) — 안 가 본 데로는 못 난다.
import { useEffect, useState } from 'react'
import { spawnTable, spawnWarp } from '../../engine/map/spawns'
import { mapById, world } from '../../engine/map/world'
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import { MenuScreen } from './MenuScreen'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import * as css from './menuChrome.css'
import { assets, readJson } from '../../data/providers/assetProvider'

export function FlyScreen() {
  const closeAll = useMenuStore((s) => s.closeAll)
  const back = useMenuStore((s) => s.back)
  const flySpots = useSaveStore((s) => s.flySpots)
  const [names, setNames] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    let alive = true
    void (readJson(assets(), 'data/names/locations.ko.json') as Promise<string[]>)
      .then((list) => { if (alive) setNames(list) })
      .catch(() => { /* 이름이 없으면 맵 이름으로 뜬다 */ })
    return () => { alive = false }
  }, [])

  const spots = spawnTable.list
    .map((spot, index) => ({ spot, index }))
    .filter(({ index }) => (flySpots & (1 << index)) !== 0)
    .map(({ spot, index }) => {
      const header = mapById(spot.fly.map)
      return {
        index,
        label: (header ? names[header.label] : undefined)
          ?? spot.flyName.replace('MAP_HEADER_', ''),
      }
    })
    // 같은 곳이 두 줄로 뜨지 않게 한다 — 포켓몬리그가 표에 두 번 들어 있다
    .filter((s, i, all) => all.findIndex((o) => o.label === s.label) === i)

  const at = Math.min(cursor, Math.max(0, spots.length - 1))

  const flyTo = (i: number): void => {
    const pick = spots[i]
    if (!pick) return
    const target = spawnWarp(pick.index, 'fly')
    if (!target) return
    world.pending = target
    closeAll()
  }

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, spots.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, spots.length)) },
    confirm: () => { flyTo(at) },
    cancel: back,
  })

  return (
    <MenuScreen
      title="공중날기"
      note={`${String(spots.length)}곳`}
      foot={<span>↑↓ 고르기 · Z 날아간다 · X 뒤로</span>}
    >
      <div className={css.stageWide}>
        <div className={css.list}>
          {spots.length === 0 && <div className={css.empty}>아직 가 본 마을이 없다</div>}
          {spots.map((s, i) => (
            <div
              key={s.index}
              className={i === at ? css.rowOn : css.row}
              onPointerEnter={() => { setCursor(i) }}
              onClick={() => { flyTo(i) }}
            >
              {/* ⚠️ `caret`은 테두리로 그린 삼각형이다 — 0×0이라 안에 글자를
                  넣으면 그 글자가 밖으로 삐져나온다. 실제로 화살표가 둘로 보였다 */}
              {i === at && <span className={css.caret} aria-hidden />}
              <span className={css.face}>
                <span className={css.label}>{s.label}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </MenuScreen>
  )
}
