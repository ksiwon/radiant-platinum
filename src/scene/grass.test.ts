// 서 있는 풀숲이 **풀숲 칸에만** 서는가 (Grass.tsx)
//
// 여기서 겁나는 것은 반대다. 잔디·길바닥까지 포기가 서면 온 맵이 털밭이 된다.
// 자리를 그림이 아니라 타일 거동값에서 뽑는 이유가 그것이라, 그 값이 실제로
// 인카운터가 도는 칸과 같은 칸인지 확인한다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it, expect, beforeAll } from 'vitest'
import { MapGrid, type MatrixMeta } from '../engine/map/grid'
import { heightField } from '../engine/map/height'
import { isEncounterTile, isGrassTile } from '../engine/battle/encounter'
import { grassSpots } from './Grass'
import { withData } from '../data/romData.testkit'

const DATA = resolve(__dirname, '../../public/data')
const maybe = withData('matrices/0.bin')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** Buffer는 공유 풀에서 잘라 온 것이라 그대로 뷰를 얹으면 엉뚱한 데이터를 읽는다 */
function detach(p: string): ArrayBuffer {
  const buf = readFileSync(resolve(DATA, p))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

maybe('서 있는 풀숲', () => {
  let grid: MapGrid

  beforeAll(() => {
    grid = new MapGrid(
      read('matrices/0.json') as MatrixMeta, new Uint16Array(detach('matrices/0.bin')),
    )
    // `worldData.bootWorld`가 하는 것과 같은 결합. 그쪽은 fetch를 타서 못 쓴다
    const meta = read('bdhc.json') as {
      plateCount: number; fixedPerTile: number
      planes: [number, number, number, number][]; chunks: [number, number][]
    }
    const blob = detach('bdhc.bin')
    heightField.data = {
      planes: meta.planes,
      chunks: meta.chunks,
      coords: new Int32Array(blob, 0, meta.plateCount * 4),
      refs: new Uint16Array(blob, meta.plateCount * 16, meta.plateCount),
      fixedPerTile: meta.fixedPerTile,
    }
  })

  /** 201번도로 한복판. 첫 풀숲이고 확인 지점이 가리키는 칸이다 */
  const R201 = { tx: 128, tz: 848 }

  it('201번도로에 포기가 서고, 전부 인카운터가 도는 칸 위다', () => {
    const at = grid.chunkIndexAt(R201.tx, R201.tz)
    const spots = grassSpots(grid, at, 2)
    expect(spots.length).toBeGreaterThan(0)

    for (let i = 0; i < spots.length; i += 3) {
      const tx = Math.floor(spots[i]!), tz = Math.floor(spots[i + 2]!)
      const behavior = grid.behavior(tx, tz)
      expect(isGrassTile(behavior), `(${String(tx)},${String(tz)})`).toBe(true)
      // 같은 칸을 인카운터 판정도 풀숲으로 봐야 한다. 두 코드가 따로 있어서
      // 한쪽만 고치면 눈에 보이는 풀과 실제로 튀어나오는 자리가 어긋난다
      expect(isEncounterTile(behavior)).toBe(true)
    }
  })

  it('풀숲이 없는 곳에는 하나도 안 선다', () => {
    // 선단시티는 포장길과 잔디뿐이고 인카운터 표가 없다
    const at = grid.chunkIndexAt(160, 768)
    expect(grassSpots(grid, at, 0)).toHaveLength(0)
  })

  it('한 칸에 정해진 수만큼, 칸 안에, 지면 높이에 선다', () => {
    const at = grid.chunkIndexAt(R201.tx, R201.tz)
    const spots = grassSpots(grid, at, 0)
    const cells = new Set<string>()
    for (let i = 0; i < spots.length; i += 3) {
      const x = spots[i]!, y = spots[i + 1]!, z = spots[i + 2]!
      cells.add(`${String(Math.floor(x))},${String(Math.floor(z))}`)
      // 칸 가장자리에 붙으면 이웃 칸(길)으로 잎이 삐져나온다
      expect(x - Math.floor(x)).toBeGreaterThanOrEqual(0.2)
      expect(x - Math.floor(x)).toBeLessThanOrEqual(0.8)
      // 땅에 붙어야 한다. 격자가 주는 높이와 다르면 풀이 뜨거나 파묻힌다
      expect(y).toBe(grid.heightAtWorld(x, z))
    }
    expect(spots.length / 3).toBe(cells.size * 3)
  })

  it('같은 자리는 늘 같은 포기다 — 청크를 다시 세워도 안 흔들린다', () => {
    const at = grid.chunkIndexAt(R201.tx, R201.tz)
    expect([...grassSpots(grid, at, 0)]).toEqual([...grassSpots(grid, at, 0)])
  })
})
