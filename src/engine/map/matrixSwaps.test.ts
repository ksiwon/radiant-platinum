// 숨은 자리가 바꿔 끼우는 청크 (`map/matrixSwaps` · REPAIR §137)
//
// 구운 오버월드 격자와 `swaps`로 잰다 — 파도의길은 열려야 뚫리고, 떠나는샘길은 열리기 전에 바다다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MapGrid, type MatrixMeta } from './grid'
import { applyMatrixSwaps, hiddenUnlocked } from './matrixSwaps'
import { HIDDEN_LOCATION_MAGIC, HiddenLocation, VAR_HIDDEN_LOCATION_FIRST } from './townMap'
import { DATA, withData } from '../../data/romData.testkit'

const maybe = withData('matrices/0.bin', 'matrices/0.json')

function load(): MapGrid {
  const meta = JSON.parse(readFileSync(resolve(DATA, 'matrices/0.json'), 'utf8')) as MatrixMeta
  const buf = readFileSync(resolve(DATA, 'matrices/0.bin'))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  return new MapGrid(meta, new Uint16Array(ab))
}

/** 그 청크(행렬 칸)에서 막힌 칸 수 */
function blockedIn(grid: MapGrid, mx: number, my: number): number {
  let n = 0
  for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) if (grid.isBlocked(mx * 32 + x, my * 32 + z)) n++
  return n
}

const vars = (open: number[]) => (id: number) => {
  const i = id - VAR_HIDDEN_LOCATION_FIRST
  return open.includes(i) ? HIDDEN_LOCATION_MAGIC[i]! : 0
}

maybe('숨은 자리 청크', () => {
  it('열쇠는 매직 넘버다 — 1로는 안 열린다', () => {
    expect(hiddenUnlocked(vars([HiddenLocation.SEABREAK_PATH]), HiddenLocation.SEABREAK_PATH)).toBe(true)
    expect(hiddenUnlocked(() => 1, HiddenLocation.SEABREAK_PATH)).toBe(false)
  })

  it('파도의길 — 열리기 전엔 기본 청크(115)의 벽, 열리면 119로 갈아 끼워 가운데(x 14~16)로 길이 뚫린다', () => {
    const grid = load()
    // 벽 줄 z 7~9를 지나는 세로 길 — 기본 청크에서는 막혔다
    const wall = [7, 8, 9].map((z) => grid.isBlocked(28 * 32 + 15, 15 * 32 + z))
    expect(wall).toEqual([true, true, true])
    expect(applyMatrixSwaps(grid, vars([HiddenLocation.SPRING_PATH]))).toBe(false)
    expect(applyMatrixSwaps(grid, vars([HiddenLocation.SPRING_PATH, HiddenLocation.SEABREAK_PATH]))).toBe(true)
    for (let z = 0; z <= 10; z++) expect(grid.isBlocked(28 * 32 + 15, 15 * 32 + z), `z ${String(z)}`).toBe(false)
    expect(grid.meta.chunks.find((c) => c.i === 15 * 30 + 28)!.land).toBe(119)
    const rev = grid.revision
    // 같은 상태로 다시 불러도 안 바뀐다
    expect(applyMatrixSwaps(grid, vars([HiddenLocation.SPRING_PATH, HiddenLocation.SEABREAK_PATH]))).toBe(false)
    expect(grid.revision).toBe(rev)
  })

  it('떠나는샘길 — 열리기 전엔 바다(176)로 막히고, 열리면 기본 청크로 되돌린다', () => {
    const grid = load()
    // 기본 청크 넷 중 걸을 수 있는 칸은 (23,22)의 90칸뿐이다 — 나머지 셋은 원래 통째로 막혔다
    expect(1024 - blockedIn(grid, 23, 22)).toBe(90)
    applyMatrixSwaps(grid, vars([]))
    expect(blockedIn(grid, 23, 22)).toBe(1024)
    applyMatrixSwaps(grid, vars([HiddenLocation.SPRING_PATH]))
    expect(1024 - blockedIn(grid, 23, 22)).toBe(90)
  })
})

describe('청크 되돌리기', () => {
  it('없는 칸은 안 건드린다', () => {
    const meta: MatrixMeta = {
      id: 0, name: 't', width: 1, height: 1, tileWidth: 32, tileHeight: 32,
      chunks: [{ i: 0, mx: 0, my: 0, land: 5, zone: 0 }], buildings: {},
    }
    const grid = new MapGrid(meta, new Uint16Array(32 * 32))
    expect(grid.swapChunk(3, null)).toBe(false)
    expect(grid.swapChunk(0, null)).toBe(false)
    expect(grid.swapChunk(0, { tiles: new Uint16Array(1024).fill(0x8000), land: 9, buildings: [] })).toBe(true)
    expect(grid.isBlocked(3, 3)).toBe(true)
    expect(meta.chunks[0]!.land).toBe(9)
    expect(grid.swapChunk(0, null)).toBe(true)
    expect(grid.isBlocked(3, 3)).toBe(false)
    expect(meta.chunks[0]!.land).toBe(5)
  })
})
