// 확인 지점이 **진짜 설 수 있는 칸**을 가리키는가.
//
// 이 표는 손으로 적은 좌표가 아니라 자료를 가리키는 것이라, 자료가 바뀌면 가리킨
// 곳도 따라 바뀐다. 그 결과가 벽 속이면 시험용 화면이 시험을 못 하게 되므로
// 여기서 전부 풀어 보고 걸어갈 수 있는지 확인한다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'
import { MapGrid, type MatrixMeta } from '../map/grid'
import { walkOutOfDoor, type EventFile, type MapHeader } from '../map/world'
import { isEncounterTile } from '../battle/encounter'
import { CHECKPOINTS, resolveSpot } from './checkpoints'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'matrices/0.bin'))
const maybe = present ? describe : describe.skip
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** Buffer는 공유 풀에서 잘라 온 것이라 그대로 뷰를 얹으면 엉뚱한 데이터를 읽는다 */
function detach(p: string): ArrayBuffer {
  const buf = readFileSync(resolve(DATA, p))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

maybe('확인 지점', () => {
  let maps: MapHeader[]
  let events: Record<string, EventFile>
  const grids = new Map<number, MapGrid>()

  beforeAll(() => {
    maps = read('maps.json').maps as MapHeader[]
    events = read('events.json').events as Record<string, EventFile>

    const overworld = new MapGrid(
      read('matrices/0.json') as MatrixMeta, new Uint16Array(detach('matrices/0.bin')),
    )
    grids.set(0, overworld)

    const idx = read('matrices/interiors.json') as {
      matrices: Record<string, MatrixMeta & { byteOffset: number }>
    }
    const blob = detach('matrices/interiors.bin')
    for (const [id, meta] of Object.entries(idx.matrices)) {
      const count = meta.tileWidth * meta.tileHeight
      grids.set(Number(id), new MapGrid(meta, new Uint16Array(blob, meta.byteOffset, count)))
    }
  })

  const warpsOf = (mapId: number) => events[String(maps[mapId]!.events)]?.warps ?? []

  it('번호가 겹치지 않고 맵이 전부 실재한다', () => {
    expect(new Set(CHECKPOINTS.map((c) => c.id)).size).toBe(CHECKPOINTS.length)
    for (const c of CHECKPOINTS) expect(maps[c.map], c.label).toBeDefined()
  })

  it.each(CHECKPOINTS.map((c) => [c.label, c] as const))('%s — 설 수 있는 칸이다', (_, c) => {
    const grid = grids.get(maps[c.map]!.matrix)
    expect(grid, `행렬 ${maps[c.map]!.matrix}이 없다`).toBeDefined()

    const at = resolveSpot(grid!, c.map, c.spot, warpsOf(c.map))
    expect(at, '자리를 못 찾았다').not.toBeNull()

    // 씬이 하는 것과 같은 손질. 문 위는 통행 불가라 한 칸 내려 세운다
    const out = walkOutOfDoor(grid!, at!.x, at!.z)
    const tx = Math.floor(out.x), tz = Math.floor(out.z)
    expect(grid!.isBlocked(tx, tz), `(${tx},${tz})이 막혀 있다`).toBe(false)
    // 오버월드는 한 격자에 맵이 여럿이라 어느 맵에 섰는지 확인해야 한다 — 엉뚱한
    // 칸이면 지역명도 인카운터 표도 어긋난다. 실내 행렬은 통째로 한 맵이라
    // 청크에 맵 번호가 안 적혀 있고(`zoneAt`이 -1) 확인할 것도 없다
    if (maps[c.map]!.matrix === 0) expect(grid!.zoneAt(tx, tz), '다른 맵에 섰다').toBe(c.map)
  })

  it('풀숲 지점은 정말 풀숲이다', () => {
    const grass = CHECKPOINTS.filter((c) => c.spot.kind === 'grass')
    expect(grass.length).toBeGreaterThan(0)
    for (const c of grass) {
      const grid = grids.get(maps[c.map]!.matrix)!
      const at = resolveSpot(grid, c.map, c.spot, warpsOf(c.map))!
      expect(isEncounterTile(grid.behavior(Math.floor(at.x), Math.floor(at.z))), c.label).toBe(true)
      // 야생이 나오려면 그 맵에 인카운터 표가 붙어 있어야 한다
      expect(maps[c.map]!.encounters, c.label).not.toBeNull()
    }
  })

  it('`atWarp`는 워프를 마주 본다', () => {
    for (const c of CHECKPOINTS) {
      if (c.spot.kind !== 'atWarp') continue
      const grid = grids.get(maps[c.map]!.matrix)!
      const w = warpsOf(c.map)[c.spot.index]!
      const at = resolveSpot(grid, c.map, c.spot, warpsOf(c.map))!
      // 붙어 있는 칸이다 — 맨해튼 거리 1
      expect(Math.abs(Math.floor(at.x) - w.x) + Math.abs(Math.floor(at.z) - w.z), c.label).toBe(1)
      // 한 걸음 앞이 그 워프다. `facing`은 atan2(dx, dz)라 0이 남쪽이다
      expect(Math.round(at.x - 0.5 + Math.sin(at.facing)), c.label).toBe(w.x)
      expect(Math.round(at.z - 0.5 + Math.cos(at.facing)), c.label).toBe(w.z)
    }
  })

  it('배틀 지점은 파티를 갖고 간다 — 빈손이면 배틀이 안 열린다', () => {
    for (const c of CHECKPOINTS) {
      if (!c.battle) continue
      expect(c.party?.length ?? 0, c.label).toBeGreaterThan(0)
    }
  })
})
