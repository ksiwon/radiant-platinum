// 문 워프의 소리가 문 종류를 제대로 집는가 — 워프 칸 둘레의 소품이 문 모델이어야 `PendingWarp.doorTile`로 종류를 안다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, expect, it } from 'vitest'
import { MapGrid, type MatrixMeta } from '../engine/map/grid'
import type { EventFile, MapHeader } from '../engine/map/world'
import { doorKindAt } from './doorKindAt'
import { withData } from '../data/romData.testkit'

const DATA = resolve(__dirname, '../../public/data')
const maybe = withData('matrices/0.bin', 'maps.json', 'events.json')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
function detach(p: string): ArrayBuffer {
  const buf = readFileSync(resolve(DATA, p))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

maybe('워프 칸의 문 모델', () => {
  const grids = new Map<number, MapGrid>()
  let maps: MapHeader[]
  let events: Record<string, EventFile>
  beforeAll(() => {
    maps = read('maps.json').maps as MapHeader[]
    events = read('events.json').events as Record<string, EventFile>
    grids.set(0, new MapGrid(read('matrices/0.json') as MatrixMeta, new Uint16Array(detach('matrices/0.bin'))))
    const idx = read('matrices/interiors.json') as { matrices: Record<string, MatrixMeta & { byteOffset: number }> }
    const blob = detach('matrices/interiors.bin')
    for (const [id, meta] of Object.entries(idx.matrices)) {
      grids.set(Number(id), new MapGrid(meta, new Uint16Array(blob, meta.byteOffset, meta.tileWidth * meta.tileHeight)))
    }
  })

  it('상점 문과 미닫이 문 워프가 그 종류로 잡힌다', () => {
    const counts: Record<string, number> = {}
    for (const m of maps) {
      const grid = grids.get(m.matrix)
      if (!grid) continue
      for (const w of events[String(m.events)]?.warps ?? []) {
        const kind = doorKindAt(grid, w.x, w.z) ?? 'none'
        counts[kind] = (counts[kind] ?? 0) + 1
      }
    }
    // 원작 표의 미닫이·상점 문 모델이 놓인 워프가 하나도 안 잡히면 소리가 전부 여닫이로 떨어진다
    expect(counts.sliding ?? 0, JSON.stringify(counts)).toBeGreaterThanOrEqual(80)
    expect(counts.chime ?? 0, JSON.stringify(counts)).toBeGreaterThanOrEqual(3)
  })

  it('격자가 없으면 문 종류도 없다 (여닫이 소리로 떨어진다)', () => {
    expect(doorKindAt(null, 3, 4)).toBeUndefined()
  })
})
