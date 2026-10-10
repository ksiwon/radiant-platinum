// 분포 쪽의 셈 — 도감 서식지 표(`pokedexHabitat.json`)를 **실제 타운맵 그림** 위의 칸으로 옮긴다.
//
// 칸 좌표는 타운맵의 격자 칸과 같다 (실측: 들판 칸 124개 중 123개가 `townMap.json`의 칸 위에 떨어지고, 동굴 22곳 중
// 20곳이 칸 위다 — 같은 좌표계다). 그림 안 픽셀은 `engine/map/townMap`의 `gridX · gridY`(칸 7px)다.
//
// ⚠️ **들판만 축이 뒤집혀 있다.** 서식지 표의 들판은 `[x * height + y]` 열 우선이고(`PokedexEncData_LocateFieldOnMap`) 던전은
// `x`를 가로로 쓴다 (`LocateDungeonOnMap`). 그래서 들판의 `x`가 **세로 줄**이고 `y`가 **가로 칸**이다 — 안 뒤집으면
// 201번도로가 신오 북동쪽에 찍힌다.
import type { PokedexHabitat } from '../../../data/gameData'
import { gridX, gridY } from '../../../engine/map/townMap'

/** 시간대 셋 (원작 분포 쪽은 아침 · 낮 · 밤 하나만 고른다) */
const AREA_TIMES = ['Morning', 'Day', 'Night'] as const
export type AreaTime = 0 | 1 | 2

/** 타운맵 그림 한 장 (256×192) */
export const MAP_W = 256
/**
 * 그림에서 지도로 쓰는 곳. 왼쪽 16 · 오른쪽 16은 DS 화면의 테두리 띠(실측 x 0~15 · 239~255가 한 색)고 아래 24줄은 안내줄
 * (실측 y ≥ 168)이다. 맨 아래 칸(z 28)이 y 162~168이라 한 줄을 더 싣는다 — 칸이 있는 것은 이 안뿐이다
 */
export const MAP_CROP = { x: 16, y: 0, w: 224, h: 169 } as const
/** 칸 하나의 픽셀 (`TOWN_MAP_GRID_SPACING`) */
export const CELL = 7
/** 화면에 그릴 때의 정수 배율 */
export const MAP_SCALE = 2

interface AreaCell { col: number, row: number }
interface AreaDungeon { x: number, y: number }

interface AreaSpots {
  /** 이 종이 사는 들판 칸 (중복 없음) */
  cells: AreaCell[]
  /** 이 종이 사는 동굴 */
  dungeons: AreaDungeon[]
}

/** 시간대의 갈래 이름. 갈래마다 `field…`/`dungeon…` 앞이 붙는다 */
function groups(time: AreaTime, national: boolean): string[] {
  const out = [AREA_TIMES[time], 'Special']
  if (national) out.push('SpecialNational')
  return out
}

/** 들판 한 곳이 켠 칸들 */
function fieldCells(f: PokedexHabitat['fields'][number]): AreaCell[] {
  const out: AreaCell[] = []
  for (let x = 0; x < f.width; x++) {
    for (let y = 0; y < f.height; y++) {
      if (!f.cells[x * f.height + y]) continue
      out.push({ col: f.y + y, row: f.x + x })
    }
  }
  return out
}

/**
 * 그 종이 그 시간대에 사는 곳. 특별한 곳(`Special`)은 시간대와 상관없이 늘 들어가고, 전국 특별(`SpecialNational`)은
 * 전국도감을 받은 뒤에만 든다
 */
export function spotsFor(
  habitat: PokedexHabitat | null, species: number, time: AreaTime, national: boolean,
): AreaSpots {
  const entry = habitat?.species[String(species)]
  const spots: AreaSpots = { cells: [], dungeons: [] }
  if (!habitat || !entry) return spots
  const seen = new Set<number>()
  const seenDungeon = new Set<number>()
  for (const g of groups(time, national)) {
    for (const at of entry[`field${g}`] ?? []) {
      const f = habitat.fields[at]
      if (!f) continue
      for (const c of fieldCells(f)) {
        const key = c.row * 64 + c.col
        if (seen.has(key)) continue
        seen.add(key)
        spots.cells.push(c)
      }
    }
    for (const at of entry[`dungeon${g}`] ?? []) {
      const d = habitat.dungeons[at]
      if (!d || seenDungeon.has(at)) continue
      seenDungeon.add(at)
      spots.dungeons.push({ x: d.x, y: d.y })
    }
  }
  return spots
}

/** 그 종이 어느 시간대에든 사는 곳이 있는가 — 「서식지 불명」을 가를 때 */
export function livesAnywhere(habitat: PokedexHabitat | null, species: number, national: boolean): boolean {
  return ([0, 1, 2] as const).some((t) => {
    const s = spotsFor(habitat, species, t, national)
    return s.cells.length > 0 || s.dungeons.length > 0
  })
}

/** 칸 → 화면에 그린 지도(자른 그림) 안 왼쪽 위 픽셀. 칸은 `CELL × 배율` 정사각이다 */
export function cellRect(c: AreaCell): { left: number, top: number, size: number } {
  return {
    left: (gridX(c.col) - MAP_CROP.x) * MAP_SCALE,
    top: (gridY(c.row) - MAP_CROP.y) * MAP_SCALE,
    size: CELL * MAP_SCALE,
  }
}

/** 동굴 → 칸 가운데의 픽셀 (고리를 칸 가운데에 찍는다) */
export function dungeonCenter(d: AreaDungeon): { cx: number, cy: number } {
  const r = cellRect({ col: d.x, row: d.y })
  return { cx: r.left + r.size / 2, cy: r.top + r.size / 2 }
}

/** 시간대를 한 칸 돈다 */
export function nextTime(t: AreaTime): AreaTime {
  return ((t + 1) % 3) as AreaTime
}

/** 지금 게임 시계의 시간 → 분포 시간대. 해질녘은 낮으로, 심야는 밤으로 센다 (인카운터 표도 그렇게 묶는다) */
export function areaTimeOf(timeOfDay: number): AreaTime {
  if (timeOfDay === 0) return 0
  if (timeOfDay === 3 || timeOfDay === 4) return 2
  return 1
}
