// 물 면 검증 (DATA.md §2.2)
//
// 겁나는 것은 **물이 아닌 데에 물을 까는 것**이다. 자리는 거동값이 주고 그 값은
// 파도타기 표와의 교차검증으로 확정됐다(`map/zone`의 `isWater`) — 여기서는 그
// 값이 실제 격자에서 어떻게 떨어지는지와, 물결이 물처럼 도는지를 본다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it, expect, beforeAll } from 'vitest'
import { MapGrid, type MatrixMeta } from '../engine/map/grid'
import { Behavior, isWater } from '../engine/map/zone'
import { waterField, waveAt } from './Water'
import { waterColors } from './plates'
import type { TexSheet } from './chunkMesh'
import { withData } from '../data/romData.testkit'

const DATA = resolve(__dirname, '../../public/data')
const maybe = withData('matrices/0.bin')

function detach(p: string): ArrayBuffer {
  const buf = readFileSync(resolve(DATA, p))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

maybe('물', () => {
  let grid: MapGrid

  beforeAll(() => {
    grid = new MapGrid(
      JSON.parse(readFileSync(resolve(DATA, 'matrices/0.json'), 'utf8')) as MatrixMeta,
      new Uint16Array(detach('matrices/0.bin')),
    )
  })

  it('오버월드 물이 실측과 같다', () => {
    // 이 수가 자리를 고른 근거다. 자료가 바뀌면 근거부터 다시 봐야 한다
    let open = 0, pond = 0
    for (let z = 0; z < grid.tileHeight; z++) {
      for (let x = 0; x < grid.tileWidth; x++) {
        const b = grid.behavior(x, z)
        if (b === Behavior.WATER_OPEN) open++
        else if (b === Behavior.WATER_POND) pond++
      }
    }
    expect(open).toBe(24371)
    expect(pond).toBe(1114)
    // 둘을 합쳐야 맞다 — 하나만 쓰면 트윈리프 연못이 빠진다
    expect(isWater(Behavior.WATER_OPEN) && isWater(Behavior.WATER_POND)).toBe(true)
    expect(isWater(Behavior.TALL_GRASS) || isWater(Behavior.NORMAL)).toBe(false)
  })

  it('물 칸에만 면이 깔린다', () => {
    // 물이 제일 많은 청크(238) 둘레
    const { grid: pos, index } = waterField(grid, 238, 1)
    expect(index.length).toBeGreaterThan(0)
    expect(index.length % 6).toBe(0)
    // 삼각형 두 개가 한 칸이고, 그 칸은 전부 물이어야 한다
    for (let t = 0; t < index.length; t += 6) {
      const a = index[t]!
      const x = pos[a * 3]!, z = pos[a * 3 + 2]!
      expect(isWater(grid.behavior(x, z)), `${String(x)},${String(z)}`).toBe(true)
    }
  })

  it('이웃한 칸이 모서리를 나눠 쓴다 — 안 그러면 격자 선이 보인다', () => {
    const { grid: pos, index } = waterField(grid, 238, 0)
    const tiles = index.length / 6
    // 모서리를 안 나누면 정점이 칸당 4개다. 나누면 그보다 한참 적다
    expect(pos.length / 3).toBeLessThan(tiles * 4 * 0.6)
    // 같은 자리에 정점이 둘 있으면 안 된다
    const seen = new Set<string>()
    for (let i = 0; i < pos.length; i += 3) {
      const key = `${String(pos[i])},${String(pos[i + 2])}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('물결이 한 방향 줄무늬가 아니다', () => {
    // 물결 하나면 어느 축으로 잘라도 같은 모양이라 빨래판이 된다
    const along = (fix: number, axis: 0 | 1) => {
      const v: number[] = []
      for (let i = 0; i < 24; i++) v.push(waveAt(axis === 0 ? i * 0.5 : fix, axis === 0 ? fix : i * 0.5, 0)[0])
      return v
    }
    const a = along(0, 0), b = along(0, 1)
    expect(a.some((v, i) => Math.abs(v - b[i]!) > 1e-6)).toBe(true)
    // 두 줄을 서로 다른 자리에서 떠도 달라야 한다
    expect(along(3, 0).some((v, i) => Math.abs(v - a[i]!) > 1e-6)).toBe(true)
  })

  it('물결이 타일보다 낮게 인다 — 크면 계단처럼 각진다', () => {
    let hi = 0
    for (let t = 0; t < 4; t += 0.05) {
      for (let x = 0; x < 12; x += 0.25) hi = Math.max(hi, Math.abs(waveAt(x, x * 0.7, t)[0]))
    }
    expect(hi).toBeLessThan(0.12)
    expect(hi).toBeGreaterThan(0.03)
  })

  it('법선이 물결 기울기와 맞다', () => {
    // 마루에서는 위를, 오르막에서는 진행 반대쪽을 본다. 어긋나면 빛이 물결과
    // 따로 논다
    const h = 1e-4
    for (const [x, z] of [[1.3, 2.7], [5.5, 0.2], [9.1, 4.4]]) {
      const [, dx, dz] = waveAt(x!, z!, 0.3)
      const numX = (waveAt(x! + h, z!, 0.3)[0] - waveAt(x! - h, z!, 0.3)[0]) / (2 * h)
      const numZ = (waveAt(x!, z! + h, 0.3)[0] - waveAt(x!, z! - h, 0.3)[0]) / (2 * h)
      expect(dx).toBeCloseTo(numX, 4)
      expect(dz).toBeCloseTo(numZ, 4)
    }
  })

  it('색은 그림에서 오고 마루가 더 밝다', () => {
    const items = [{ tex: 'sea', pal: '', x: 0, y: 0, w: 4, h: 4 }]
    const pixels = new Uint8ClampedArray(4 * 4 * 4)
    const put = (i: number, r: number, g: number, b: number) => {
      pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = 255
    }
    for (let i = 0; i < 8; i++) put(i, 40, 80, 150)
    for (let i = 8; i < 16; i++) put(i, 140, 200, 240)
    const sheet: TexSheet = { width: 4, height: 4, items, pixels }
    const [light, dark] = waterColors(sheet)
    const luma = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.6 + (c & 255) * 0.1
    expect(luma(light)).toBeGreaterThan(luma(dark))
    // 그림이 없으면 파랑 한 쌍으로 떨어진다
    const [a, b] = waterColors(null)
    expect(luma(a)).toBeGreaterThan(luma(b))
  })
})
