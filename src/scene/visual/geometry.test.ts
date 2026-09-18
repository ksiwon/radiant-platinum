// 형상 생성 검증 (FIRST_PERSON §13.1 「기하」)
import { describe, expect, it } from 'vitest'
import {
  FENCE_SLOTS, PLANTER, PLANTER_SLOTS, SHRUB_SLOTS, fenceGeometry, openEdges, planterGeometry, shrubGeometry,
  signedVolume,
  type BuiltShape,
} from './geometry'

function sane(shape: BuiltShape): void {
  const g = shape.geometry
  const pos = g.getAttribute('position').array
  const nor = g.getAttribute('normal').array
  const uv = g.getAttribute('uv').array
  expect([...pos, ...nor, ...uv].every(Number.isFinite)).toBe(true)
  const n = pos.length / 3
  const index = g.getIndex()!.array
  expect(index.length % 3).toBe(0)
  expect([...index].every((i) => i >= 0 && i < n)).toBe(true)
  // 그룹이 색인 전부를 빈틈·겹침 없이 덮고, 재질 칸 안을 가리킨다
  const sorted = [...g.groups].sort((a, b) => a.start - b.start)
  let at = 0
  for (const grp of sorted) {
    expect(grp.start).toBe(at)
    expect(grp.materialIndex).toBeLessThan(shape.slots.length)
    at += grp.count
  }
  expect(at).toBe(index.length)
  // 상자에 모든 정점이 든다
  const [x0, y0, z0, x1, y1, z1] = shape.bounds
  for (let i = 0; i < n; i++) {
    expect(pos[i * 3]!).toBeGreaterThanOrEqual(x0 - 1e-6)
    expect(pos[i * 3]!).toBeLessThanOrEqual(x1 + 1e-6)
    expect(pos[i * 3 + 1]!).toBeGreaterThanOrEqual(y0 - 1e-6)
    expect(pos[i * 3 + 1]!).toBeLessThanOrEqual(y1 + 1e-6)
    expect(pos[i * 3 + 2]!).toBeGreaterThanOrEqual(z0 - 1e-6)
    expect(pos[i * 3 + 2]!).toBeLessThanOrEqual(z1 + 1e-6)
  }
}

describe('사각 화분', () => {
  const W = 1
  const shape = planterGeometry(W)
  const pot = [0, 1, 2]

  it('수치가 유효하고 그룹·상자가 맞는다', () => { sane(shape) })

  it('칸이 넷이고 넷 다 채워졌다', () => {
    expect(shape.slots).toEqual(PLANTER_SLOTS)
    expect(new Set(shape.geometry.groups.map((g) => g.materialIndex))).toEqual(new Set([0, 1, 2, 3]))
  })

  it('용기·림·흙은 구멍 없이 닫혀 있고 바깥을 보게 감겼다', () => {
    expect(openEdges(shape.geometry, pot)).toBe(0)
    expect(signedVolume(shape.geometry, pot)).toBeGreaterThan(0)
  })

  it('구멍을 재는 자가 실제로 구멍을 잡는다 — 흙을 빼면 열린다', () => {
    expect(openEdges(shape.geometry, [0, 1])).toBeGreaterThan(0)
  })

  it('식물도 닫힌 덩이고 바깥을 본다', () => {
    expect(openEdges(shape.geometry, [3])).toBe(0)
    expect(signedVolume(shape.geometry, [3])).toBeGreaterThan(0)
  })

  it('밑면이 지면(y=0)에 닿고 폭이 W를 안 넘는다 — 지면 밑으로 안 나간다', () => {
    const [x0, y0, z0, x1, , z1] = shape.bounds
    expect(y0).toBeCloseTo(0, 6)
    expect(x1 - x0).toBeCloseTo(W, 6)
    expect(z1 - z0).toBeCloseTo(W, 6)
  })

  it('네모 용기는 변이 축과 나란하다 — 림 바깥 네 귀가 (±W/2, ±W/2)', () => {
    const pos = shape.geometry.getAttribute('position').array
    const rimTop = (PLANTER.body + PLANTER.rimHeight) * W
    const corners = new Set<string>()
    for (let i = 0; i < pos.length; i += 3) {
      if (Math.abs(pos[i + 1]! - rimTop) < 1e-6 && Math.abs(Math.abs(pos[i]!) - W / 2) < 1e-6
        && Math.abs(Math.abs(pos[i + 2]!) - W / 2) < 1e-6) corners.add(`${Math.sign(pos[i]!)},${Math.sign(pos[i + 2]!)}`)
    }
    expect(corners.size).toBe(4)
  })

  it('흙은 림 위보다 낮고, 식물은 흙 위로 올라온다', () => {
    const pos = shape.geometry.getAttribute('position').array
    const index = shape.geometry.getIndex()!.array
    const ys = (slot: number) => {
      const g = shape.geometry.groups.find((x) => x.materialIndex === slot)!
      const out: number[] = []
      for (let t = g.start; t < g.start + g.count; t++) out.push(pos[index[t]! * 3 + 1]!)
      return out
    }
    const rimTop = Math.max(...ys(1))
    const soilTop = Math.max(...ys(2))
    expect(soilTop).toBeCloseTo(rimTop - PLANTER.soilDrop * W, 6)
    expect(Math.max(...ys(3))).toBeGreaterThan(rimTop)
  })

  it('폭에 비례한다', () => {
    const big = planterGeometry(2)
    expect(big.bounds[4]).toBeCloseTo(shape.bounds[4] * 2, 6)
  })
})

describe('둥근 덤불', () => {
  const shape = shrubGeometry(1)
  it('수치가 유효하고 닫혀 있으며 바깥을 본다', () => {
    sane(shape)
    expect(shape.slots).toEqual(SHRUB_SLOTS)
    expect(openEdges(shape.geometry)).toBe(0)
    expect(signedVolume(shape.geometry)).toBeGreaterThan(0)
  })
  it('화분과 윤곽이 다르다 — 네모 귀가 없다 (대각선 방향이 반폭×√2에 못 미친다)', () => {
    const diag = (s: BuiltShape) => {
      const pos = s.geometry.getAttribute('position').array
      let m = 0
      for (let i = 0; i < pos.length; i += 3) m = Math.max(m, Math.abs(pos[i]!) + Math.abs(pos[i + 2]!))
      return m
    }
    expect(diag(planterGeometry(1))).toBeCloseTo(1, 6)
    expect(diag(shape)).toBeLessThan(0.8)
  })
})

describe('화분 칠하기', () => {
  it('역할마다 제 색이 들어가고, 흙이 없는 그림은 가장 어두운 잎으로 채운다', async () => {
    const { paintedPlanter } = await import('./planter')
    const { Color } = await import('three')
    const swatch = {
      rim: 0xe7e7ce, rimEdge: 0xadad9c, container: 0xadad9c, containerEdge: 0x6b6b7b,
      soil: null, leaves: [0x84d642, 0x63ad39, 0x4a8452, 0x295a39],
    }
    const g = paintedPlanter(1, swatch)
    const col = g.getAttribute('color').array
    const nor = g.getAttribute('normal').array
    const index = g.getIndex()!.array
    const lin = (hex: number) => { const c = new Color().setHex(hex); return [c.r, c.g, c.b] }
    const at = (i: number) => [col[i * 3]!, col[i * 3 + 1]!, col[i * 3 + 2]!]
    const slotColors = (slot: number) => {
      const grp = g.groups.find((x) => x.materialIndex === slot)!
      const seen = new Set<string>()
      for (let t = grp.start; t < grp.start + grp.count; t++) seen.add(at(index[t]!).map((v) => v.toFixed(4)).join(','))
      return seen
    }
    const key = (hex: number) => lin(hex).map((v) => v.toFixed(4)).join(',')
    expect(slotColors(0)).toEqual(new Set([key(0xadad9c), key(0x6b6b7b)]))
    expect(slotColors(1)).toEqual(new Set([key(0xe7e7ce), key(0xadad9c)]))
    expect(slotColors(2)).toEqual(new Set([key(0x295a39)]))
    // 식물 꼭대기가 가장 밝은 잎이다
    const plant = g.groups.find((x) => x.materialIndex === 3)!
    let top = -1, topColor = ''
    for (let t = plant.start; t < plant.start + plant.count; t++) {
      const i = index[t]!
      const y = g.getAttribute('position').array[i * 3 + 1]!
      if (y > top) { top = y; topColor = at(i).map((v) => v.toFixed(4)).join(',') }
    }
    expect(topColor).toBe(key(0x84d642))
    // 흰색(칠 안 된 정점)이 없다
    expect([...index].some((i) => at(i).every((v) => v === 0))).toBe(false)
    expect(nor.length).toBe(col.length)
  })
})

describe('말뚝 울타리', () => {
  it('네 칸(64텍셀)이면 기둥 여덟 · 끝 여덟 · 가로대 둘이고 상자마다 닫혀 있다', () => {
    const shape = fenceGeometry(4, 0, 64)
    sane(shape)
    expect(shape.slots).toEqual(FENCE_SLOTS)
    // 상자 하나 = 삼각형 12
    expect(shape.geometry.getIndex()!.count / 3).toBe((8 + 8 + 2) * 12)
    expect(openEdges(shape.geometry)).toBe(0)
    expect(signedVolume(shape.geometry)).toBeGreaterThan(0)
    // 높이는 행 1의 위 가장자리(14/16) · 폭은 판 길이 그대로
    expect(shape.bounds[4]).toBeCloseTo(14 / 16, 6)
    expect(shape.bounds[3] - shape.bounds[0]).toBeCloseTo(4, 6)
  })

  it('기둥은 u가 8의 배수 +2…+6인 자리에 서고, 거꾸로 된 u면 좌우가 뒤집힌다', () => {
    // 4텍셀(u 0…4, 길이 0.25): 기둥 반쪽 u 2…4 → 로컬 x 0…0.125, 끝 u 3…4 → 0.0625…0.125
    const posts = (s: ReturnType<typeof fenceGeometry>) => {
      const pos = s.geometry.getAttribute('position').array
      const xs = new Set<number>()
      for (let i = 0; i < pos.length; i += 3) if (pos[i + 1]! > 12 / 16) xs.add(+pos[i]!.toFixed(4) + 0)
      return [...xs].sort((a, b) => a - b)
    }
    expect(posts(fenceGeometry(0.25, 0, 4))).toEqual([0, 0.0625, 0.125])
    expect(posts(fenceGeometry(0.25, 4, 0))).toEqual([-0.125, -0.0625, 0])
  })

  it('판 끝에서 잘린 기둥은 잘린 폭만 남고, 칸 밖 반복 u도 같은 자리에 선다', () => {
    const cut = fenceGeometry(0.25, 4, 8)
    const b = cut.bounds
    expect(b[0]).toBeCloseTo(-0.125, 6)
    const shifted = fenceGeometry(4, -32, 32)
    const plain = fenceGeometry(4, 0, 64)
    expect([...shifted.geometry.getAttribute('position').array])
      .toEqual([...plain.geometry.getAttribute('position').array])
  })
})
