// 물 면 검증 (DATA.md §2.2)
//
// 겁나는 것은 **물이 아닌 데에 물을 까는 것**이다. 자리는 거동값이 주고 그 값은
// 파도타기 표와의 교차검증으로 확정됐다(`map/zone`의 `isWater`) — 여기서는 그
// 값이 실제 격자에서 어떻게 떨어지는지와, 물결이 물처럼 도는지를 본다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it, expect, beforeAll } from 'vitest'
import { MapGrid, type MatrixMeta } from '../engine/map/grid'
import { heightField } from '../engine/map/height'
import { Behavior, isWater } from '../engine/map/zone'
import { LIFT, waterField, waveAt } from './Water'
import { waterColors } from './plates'
import type { TexSheet } from './chunkMesh'
import { withData } from '../data/romData.testkit'

const DATA = resolve(__dirname, '../../public/data')
const maybe = withData('matrices/0.bin', 'bdhc.bin', 'bdhc.json')

function detach(p: string): ArrayBuffer {
  const buf = readFileSync(resolve(DATA, p))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

maybe('물', () => {
  let grid: MapGrid

  beforeAll(() => {
    // 높이 판을 안 얹으면 `heightAtWorld`가 전부 null이라 물가가 안 보인다
    const meta = JSON.parse(readFileSync(resolve(DATA, 'bdhc.json'), 'utf8')) as {
      planes: [number, number, number, number][]
      chunks: [number, number][]
      plateCount: number
      fixedPerTile: number
    }
    const blob = detach('bdhc.bin')
    heightField.data = {
      planes: meta.planes,
      chunks: meta.chunks,
      coords: new Int32Array(blob, 0, meta.plateCount * 4),
      refs: new Uint16Array(blob, meta.plateCount * 16, meta.plateCount),
      fixedPerTile: meta.fixedPerTile,
    }
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
    // 골이 원래 물 그림 아래로 내려가면 그 자리만 지지직거린다
    expect(hi).toBeLessThan(LIFT)
  })

  it('물가 모서리가 뭍 높이를 안 받는다', () => {
    // 모서리를 `heightAtWorld(x, z)`에 그대로 물으면 남동쪽 한 칸만 보므로 기슭에서
    // 뭍 높이가 들어온다. 그러면 수면이 못 바닥 아래로 꺼져 바닥이 비어져 나온다
    const NB = [[0, 0], [-1, 0], [0, -1], [-1, -1]] as const
    for (const ci of [238, grid.chunkIndexAt(110, 892)]) {
      const { grid: pos } = waterField(grid, ci, 1)
      let checked = 0
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!
        const wet: number[] = []
        for (const [dx, dz] of NB) {
          if (!isWater(grid.behavior(x + dx, z + dz))) continue
          const h = grid.heightAtWorld(x + dx + 0.5, z + dz + 0.5)
          if (h !== null) wet.push(h)
        }
        expect(wet.length, `${String(x)},${String(z)}`).toBeGreaterThan(0)
        expect(y, `${String(x)},${String(z)}`).toBe(Math.min(...wet))
        checked += 1
      }
      expect(checked).toBeGreaterThan(40)
    }
  })

  it('창을 넓혀도 같은 모서리는 같은 높이다 — 이음매가 안 생긴다', () => {
    const ci = grid.chunkIndexAt(110, 892)
    const height = (radius: number) => {
      const { grid: pos } = waterField(grid, ci, radius)
      const m = new Map<string, number>()
      for (let i = 0; i < pos.length; i += 3) m.set(`${String(pos[i])},${String(pos[i + 2])}`, pos[i + 1]!)
      return m
    }
    const near = height(0), far = height(1)
    expect(near.size).toBeGreaterThan(0)
    for (const [k, y] of near) expect(far.get(k), k).toBe(y)
  })

  it('떡잎 연못 수면이 한 높이로 평평하다', () => {
    // 실측: 칸 108–115 × 891–895가 물 0.50, 남쪽 잔디가 0.00이다. 고치기 전에는
    // 남쪽 모서리 아홉이 0.00으로 꺼졌다
    const { grid: pos } = waterField(grid, grid.chunkIndexAt(110, 892), 0)
    const pond = []
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i]! >= 108 && pos[i]! <= 116 && pos[i + 2]! >= 891 && pos[i + 2]! <= 896) pond.push(pos[i + 1]!)
    }
    expect(pond.length).toBe(54)
    expect(new Set(pond)).toEqual(new Set([0.5]))
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

  it('높이가 다른 물은 정점을 안 나눠 쓴다', () => {
    // 실측: 오버월드 모서리 32,205개 중 445개가 높이가 다른 물 칸에 걸쳐 있다.
    // (910,480)은 2.0과 0.5가 만나는 자리다 — 예전 키(`x*4096+z`)는 낮은 쪽을
    // 골랐으므로 높은 못의 가장자리가 1.5타일을 주저앉아 비스듬한 판이 됐다
    const ci = grid.chunkIndexAt(911, 481)
    const { grid: pos } = waterField(grid, ci, 1)
    const byCorner = new Map<string, number[]>()
    for (let i = 0; i < pos.length; i += 3) {
      const key = `${String(pos[i])},${String(pos[i + 2])}`
      const had = byCorner.get(key)
      if (had) had.push(pos[i + 1]!)
      else byCorner.set(key, [pos[i + 1]!])
    }
    const split = [...byCorner.entries()].filter(([, ys]) => ys.length > 1)
    expect(split.length, '높이가 갈리는 모서리가 이 창에 없다 — 시험 자리가 틀렸다')
      .toBeGreaterThan(0)
    // 갈린 자리는 **정말 높이가 다르다.** 같은 높이가 둘이면 그냥 중복이다
    for (const [key, ys] of split) {
      expect(new Set(ys).size, key).toBe(ys.length)
    }
    // 그리고 그 높이는 실제 물 칸이 가진 값 중 하나여야 한다
    const NB = [[0, 0], [-1, 0], [0, -1], [-1, -1]] as const
    for (const [key, ys] of split) {
      const [x, z] = key.split(',').map(Number)
      const wet = new Set<number>()
      for (const [dx, dz] of NB) {
        if (!isWater(grid.behavior(x! + dx, z! + dz))) continue
        const h = grid.heightAtWorld(x! + dx + 0.5, z! + dz + 0.5)
        if (h !== null) wet.add(Math.round(h * 256) / 256)
      }
      for (const y of ys) expect(wet.has(y), `${key} → ${String(y)}`).toBe(true)
    }
  })

  it('기슭에서 물결이 잦아든다', () => {
    const { grid: pos, shore } = waterField(grid, 238, 1)
    expect(shore.length).toBe(pos.length)
    let atShore = 0, inside = 0
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]!, z = pos[i + 2]!
      // 물가에 붙은 모서리 — 둘레 네 칸 중 물이 아닌 것이 있다
      const wet = [[0, 0], [-1, 0], [0, -1], [-1, -1]]
        .every(([dx, dz]) => isWater(grid.behavior(x + dx!, z + dz!)))
      const a = shore[i]!
      expect(a, `${String(x)},${String(z)}`).toBeGreaterThanOrEqual(0)
      expect(a, `${String(x)},${String(z)}`).toBeLessThanOrEqual(1)
      if (!wet) { expect(a, `물가 ${String(x)},${String(z)}`).toBeLessThan(0.2); atShore++ }
      else if (a > 0.99) inside++
    }
    expect(atShore, '물가 모서리가 없다').toBeGreaterThan(20)
    expect(inside, '속이 트인 물이 없다').toBeGreaterThan(20)
  })

  it('감쇠 기울기가 감쇠 자체의 미분과 맞다', () => {
    // ⚠️ 파동 미분에 `a`만 곱하면 기슭에서 법선이 틀린다 (FIRST_PERSON §8.3).
    // 그래서 `∂a/∂x`를 같이 들고 다니는데, 그 값이 실제 `a`의 기울기여야 한다
    const { grid: pos, shore } = waterField(grid, 238, 1)
    let flat = 0, sloped = 0
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]!, z = pos[i + 2]!
      const a = shore[i]!, ax = shore[i + 1]!, az = shore[i + 2]!
      // 기울기가 터무니없이 크면 안 된다 — smoothstep의 최대 기울기는
      // 폭 1타일에서 1.5다
      expect(Math.hypot(ax, az), `${String(x)},${String(z)}`).toBeLessThan(1.6)
      // ⚠️ **모서리에서 `a`는 0 아니면 1이다.** 정점이 타일 모서리에 놓이고
      // 물가도 타일 변이라 거리가 0 아니면 1 이상이다 — 그 사이는 GPU가 면
      // 안에서 선형으로 채운다. 그래서 「중간값이 있는가」가 아니라 **물가에서
      // 기울기가 살아 있는가**를 본다. 부호를 안 가르면 이 값이 0으로 죽는다
      if (a === 0) {
        expect(Math.hypot(ax, az), `물가 ${String(x)},${String(z)}`).toBeGreaterThan(0)
        sloped++
      }
      // **둘레 세 칸이 죄다 물**이면 물가에서 충분히 멀다 — 거기서는 평평하다
      const deep = [-2, -1, 0, 1].every((dz) =>
        [-2, -1, 0, 1].every((dx) => isWater(grid.behavior(x + dx, z + dz))))
      if (deep) {
        expect(a, `속 ${String(x)},${String(z)}`).toBe(1)
        expect(Math.abs(ax) + Math.abs(az), `속 ${String(x)},${String(z)}`).toBe(0)
        flat++
      }
    }
    expect(flat, '속이 트인 자리가 없다').toBeGreaterThan(20)
    expect(sloped, '물가 경사가 없다').toBeGreaterThan(10)
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
