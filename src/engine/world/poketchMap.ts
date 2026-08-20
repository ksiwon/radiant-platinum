// 포켓치의 지도 화면 — 마킹맵과 나무열매탐색기가 같은 그림을 쓴다 (PARITY §7.3)
//
// 그림은 롬에서 뽑고(`data/poketchMap.png`), **그 위 어디에 무엇을 찍는가**는
// 코드 안의 표라 디컴프에서 굽는다 (`poketchMapTable.ts` · `pnpm gen:poketchmap`).
//
// ⚠️ **격자 한 칸이 맵 한 장이다.** 원작이 주인공 타일 좌표를 32로 나눠 행렬
// 칸을 만든다 (`PoketchMap_GetPlayerLocation`). 마을 안에서 걸어 다니는 동안
// 점이 안 움직이는 것이 정상이다.
//
// ⚠️ **본 행렬 밖에서는 나온 문의 자리를 쓴다.** 동굴·건물 안에서는 그 맵의
// 좌표가 신오 지도 위에 뜻이 없어서, 원작이 `ExitLocation`(마지막으로 밖에
// 있던 자리)을 대신 본다.
import {
  POKETCH_BERRY_SPOTS, POKETCH_HIDDEN_SPOTS, POKETCH_MAP_TILES,
  POKETCH_MAP_X, POKETCH_MAP_Y, POKETCH_MAP_Y_FIRST,
  VAR_HIDDEN_LOCATION_FIRST, type PoketchHiddenSpot,
} from './poketchMapTable'
import { BERRY_STAGE, type BerryPatch } from './berryPatches'

export {
  POKETCH_BERRY_SPOTS, POKETCH_HIDDEN_SPOTS, POKETCH_MAP_TILES,
  VAR_HIDDEN_LOCATION_FIRST, type PoketchHiddenSpot,
}

/** 지도에 한 번에 찍을 수 있는 열매 점 (`MAX_MAP_BERRIES`) */
export const POKETCH_MAX_BERRY_DOTS = 64

/**
 * 지도 그림 한 장의 크기.
 *
 * ⚠️ **롬 자료가 아니라 DS 아래 화면 크기다** — 원작이 화면을 통째로 지도로
 * 쓴다. 아틀라스의 실제 크기는 `poketchMap.json`이 들고 있고 이 값과 같아야
 * 한다 (달라지면 그림이 틀어지므로 화면 쪽에서 아틀라스 값이 이긴다)
 */
export const POKETCH_MAP_VIEW = { width: 256, height: 192 } as const

interface MapPoint { x: number, y: number }

/**
 * 격자 칸 → 그림 위 픽셀 (`PoketchMap_GetPositionOnMap`).
 *
 * 격자 밖이면 `null`이다 — 원작은 0으로 접어 화면 왼쪽 위에 찍는데, 그러면
 * "지도에 없는 자리"와 "지도 맨 위 왼쪽"이 화면에서 같아진다.
 */
export function mapPoint(cellX: number, cellY: number): MapPoint | null {
  const x = POKETCH_MAP_X[cellX]
  const y = POKETCH_MAP_Y[cellY]
  if (x === undefined || y === undefined) return null
  if (cellY < POKETCH_MAP_Y_FIRST) return null
  return { x, y }
}

/** 타일 좌표 → 격자 칸. 한 칸이 맵 한 장이다 */
export function mapCell(tileX: number, tileZ: number): { x: number, y: number } {
  return {
    x: Math.floor(tileX / POKETCH_MAP_TILES),
    y: Math.floor(tileZ / POKETCH_MAP_TILES),
  }
}

/**
 * 열매가 열린 밭을 지도 자리로 모은다 (`GetReadyBerryPatches`).
 *
 * ⚠️ **본 적 있고 열려 있는 밭만이다** — `isGrowing`이 안 서면 그 밭은 시간이
 * 안 흐르므로 지도에도 안 뜬다 (PARITY §4.6).
 *
 * ⚠️ **이어진 같은 자리는 하나로 뭉친다.** 한 마을에 밭이 넷씩 붙어 있어서
 * 안 뭉치면 같은 점을 네 번 찍는다. 원작의 `while`이 하는 일이 그것이고,
 * **떨어져 있는 같은 자리는 안 뭉친다** — 표 차례가 곧 규칙이다.
 */
export function readyBerrySpots(patches: readonly BerryPatch[]): MapPoint[] {
  const out: MapPoint[] = []
  for (let i = 0; i < POKETCH_BERRY_SPOTS.length; i++) {
    const patch = patches[i]
    if (!patch?.isGrowing || patch.growthStage !== BERRY_STAGE.fruit) continue
    const spot = POKETCH_BERRY_SPOTS[i]
    if (!spot) continue
    const point = mapPoint(spot[0], spot[1])
    if (point) out.push(point)
    // 뒤에 붙은 같은 자리를 건너뛴다. 자리를 못 찍었어도 건너뛰는 것은 같다
    while (i + 1 < POKETCH_BERRY_SPOTS.length) {
      const next = POKETCH_BERRY_SPOTS[i + 1]
      if (!next || next[0] !== spot[0] || next[1] !== spot[1]) break
      i++
    }
    if (out.length >= POKETCH_MAX_BERRY_DOTS) break
  }
  return out
}

/**
 * 지도에 뜨는 숨은 자리 (`LoadHiddenLocationsState`).
 *
 * ⚠️ **변수가 0이 아니라 정해진 값일 때만 뜬다** (`SystemVars_CheckHiddenLocation`) —
 * 이야기가 그 값을 적어 넣는다. 0이 아니면 다 뜬다고 보면 엉뚱한 섬이 뜬다
 */
export function hiddenSpots(getVar: (id: number) => number): PoketchHiddenSpot[] {
  return POKETCH_HIDDEN_SPOTS.filter(
    (spot, i) => getVar(VAR_HIDDEN_LOCATION_FIRST + i) === spot.magic,
  )
}
