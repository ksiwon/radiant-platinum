// 한 방향 갈색 점프 턱의 모양 (FIRST_PERSON §7.4.5)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BufferAttribute } from 'three'
import { Behavior } from '../engine/map/zone'
import { decodePng, withData } from '../data/romData.testkit'
import {
  LEDGE, ledgeFacing, ledgeGeometry, ledgeRuns, ledgeSwatch, type LedgeTile,
} from './ledgeVisual'

const SWATCH = { top: 0xcea58c, front: 0x84524a, frontLow: 0x4a3931, end: 0x5a3939 }
const tile = (x: number, z: number, dx: number, dz: number, y = 0): LedgeTile => ({ x, z, y, dx, dz })

describe('3D ledge facing', () => {
  it('turns the raised face toward the legal jump side', () => {
    expect(ledgeFacing(Behavior.LEDGE_SOUTH)).toMatchObject({ dx: 0, dz: 1, yaw: 0 })
    expect(ledgeFacing(Behavior.LEDGE_WEST)!.yaw).toBeCloseTo(-Math.PI / 2)
    expect(ledgeFacing(Behavior.LEDGE_EAST)!.yaw).toBeCloseTo(Math.PI / 2)
  })

  it('does not raise ordinary tiles', () => {
    expect(ledgeFacing(Behavior.NORMAL)).toBeNull()
  })
})

describe('턱 줄 잇기', () => {
  it('남쪽 턱은 x축으로, 동·서 턱은 z축으로 이어진다', () => {
    const south = ledgeRuns([tile(0.5, 9.5, 0, 1), tile(1.5, 9.5, 0, 1), tile(2.5, 9.5, 0, 1)])
    expect(south).toHaveLength(1)
    expect(south[0]).toMatchObject({ x: 0.5, z: 9.5, tiles: 3 })
    const west = ledgeRuns([tile(4.5, 1.5, -1, 0), tile(4.5, 2.5, -1, 0)])
    expect(west).toHaveLength(1)
    expect(west[0]).toMatchObject({ x: 4.5, z: 1.5, tiles: 2 })
  })

  it('끊어진 줄·다른 방향·다른 높이는 안 잇는다', () => {
    expect(ledgeRuns([tile(0.5, 9.5, 0, 1), tile(2.5, 9.5, 0, 1)])).toHaveLength(2)
    expect(ledgeRuns([tile(0.5, 9.5, 0, 1), tile(1.5, 9.5, 1, 0)])).toHaveLength(2)
    expect(ledgeRuns([tile(0.5, 9.5, 0, 1), tile(1.5, 9.5, 0, 1, 1)])).toHaveLength(2)
  })

  it('들어온 차례가 달라도 같은 줄이 나온다 — 청크 경계에서 흔들리면 안 된다', () => {
    const a = ledgeRuns([tile(0.5, 9.5, 0, 1), tile(1.5, 9.5, 0, 1), tile(2.5, 9.5, 0, 1)])
    const b = ledgeRuns([tile(2.5, 9.5, 0, 1), tile(0.5, 9.5, 0, 1), tile(1.5, 9.5, 0, 1)])
    expect(b).toEqual(a)
  })

  it('턱이 없으면 줄도 없다', () => {
    expect(ledgeRuns([])).toEqual([])
  })
})

describe('턱 쐐기', () => {
  const shape = ledgeGeometry(3, SWATCH)
  const pos = (shape.getAttribute('position') as BufferAttribute).array
  const nor = (shape.getAttribute('normal') as BufferAttribute).array

  it('좌표가 다 유한하고 바닥 아래로 안 내려간다', () => {
    let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < pos.length; i += 3) {
      expect(Number.isFinite(pos[i]!) && Number.isFinite(pos[i + 1]!) && Number.isFinite(pos[i + 2]!)).toBe(true)
      minY = Math.min(minY, pos[i + 1]!); maxY = Math.max(maxY, pos[i + 1]!)
      minZ = Math.min(minZ, pos[i + 2]!); maxZ = Math.max(maxZ, pos[i + 2]!)
    }
    expect(minY).toBe(0)
    expect(maxY).toBeCloseTo(LEDGE.lipHeight, 6)
    // 단면은 칸 안에 있다 — 출발·착지 걷는 자리를 안 침범한다
    expect(minZ).toBeCloseTo(LEDGE.backV - 0.5, 6)
    expect(maxZ).toBeCloseTo(LEDGE.frontV - 0.5, 6)
  })

  it('줄 길이만큼 길어지고 단면은 그대로다', () => {
    const span = (n: number) => {
      const p = (ledgeGeometry(n, SWATCH).getAttribute('position') as BufferAttribute).array
      let lo = Infinity, hi = -Infinity
      for (let i = 0; i < p.length; i += 3) { lo = Math.min(lo, p[i]!); hi = Math.max(hi, p[i]!) }
      return hi - lo
    }
    expect(span(1)).toBeCloseTo(1, 6)
    expect(span(3)).toBeCloseTo(3, 6)
  })

  it('앞면은 뛰는 쪽(+z) · 윗면은 위(+y) · 밑면은 아래를 본다', () => {
    let front = 0, up = 0, down = 0
    for (let i = 0; i < nor.length; i += 3) {
      if (nor[i + 2]! > 0.99) front += 1
      if (nor[i + 1]! > 0.99) up += 1
      if (nor[i + 1]! < -0.99) down += 1
    }
    expect(front).toBeGreaterThan(0)
    expect(up).toBeGreaterThan(0)
    expect(down).toBeGreaterThan(0)
  })

  /**
   * ⚠️ **면마다 바깥을 봐야 한다.** 한 면이라도 뒤집히면 Lambert가 그 면을 까맣게
   * 칠한다 — 윗면이 실제로 그랬다 (`ledge-after` 첫 판). `DoubleSide`로 감추지
   * 않고 감긴 방향을 고친다
   */
  it('모든 면의 법선이 덩이 한가운데에서 바깥으로 나간다', () => {
    let cx = 0, cy = 0, cz = 0
    const n = pos.length / 3
    for (let i = 0; i < pos.length; i += 3) { cx += pos[i]! / n; cy += pos[i + 1]! / n; cz += pos[i + 2]! / n }
    for (let i = 0; i < pos.length; i += 3) {
      const dot = nor[i]! * (pos[i]! - cx) + nor[i + 1]! * (pos[i + 1]! - cy) + nor[i + 2]! * (pos[i + 2]! - cz)
      expect(dot, `정점 ${String(i / 3)}의 법선이 안을 본다`).toBeGreaterThan(0)
    }
  })

  it('앞면은 밑이 어둡다 — 원본 행 29의 색이 바닥 모서리에 온다', () => {
    const color = (shape.getAttribute('color') as BufferAttribute).array
    let low = 0
    for (let i = 0; i < pos.length; i += 3) {
      if (Math.abs(pos[i + 2]! - (LEDGE.frontV - 0.5)) > 1e-6 || pos[i + 1]! !== 0) continue
      // 어두운 색이 밝은 색보다 작다
      if (color[i]! < 0.2) low += 1
    }
    expect(low).toBeGreaterThan(0)
  })

  it('땅에 진 그림자(행 30)는 입체에 안 칠한다 — 회색이 하나도 없다', () => {
    const color = (shape.getAttribute('color') as BufferAttribute).array
    for (let i = 0; i < color.length; i += 3) {
      const [r, g, b] = [color[i]!, color[i + 1]!, color[i + 2]!]
      const grey = Math.abs(r - g) < 0.02 && Math.abs(g - b) < 0.02
      expect(grey).toBe(false)
    }
  })
})

withData('tex/index.json', 'tex/6.png', 'tex/62.png')('원본 칸에서 읽은 색', () => {
  const DATA = resolve(__dirname, '../../public/data')
  const idx = JSON.parse(readFileSync(resolve(DATA, 'tex/index.json'), 'utf8')) as {
    sets: { items: [string, string, number, number, number, number][] }[]
  }
  const open = (set: number) => {
    const png = decodePng(resolve(DATA, `tex/${String(set)}.png`))
    const [, , x, y, w, h] = idx.sets[set]!.items.find(([t]) => t === 'allpeak')!
    return { sheet: { width: png.width, pixels: png.pixels }, item: { x, y, w, h } }
  }

  it('묶음 6 — 윗면 테와 갈색 앞면, 밑이 어둡다', () => {
    const { sheet, item } = open(6)
    expect(ledgeSwatch(sheet, item)).toEqual(SWATCH)
  })

  it('묶음 62는 같은 짜임에 색만 다르다', () => {
    const { sheet, item } = open(62)
    const got = ledgeSwatch(sheet, item)!
    expect(got.top).toBe(0xcea58c)
    expect(got.front).not.toBe(SWATCH.front)
    // 밑이 위보다 어둡다
    expect(got.frontLow).toBeLessThan(got.front)
  })
})
