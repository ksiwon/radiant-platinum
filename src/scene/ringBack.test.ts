// 둥근 건물의 빈 뒤를 몸통으로 닫는다 — 배틀프런티어 천막 (REPAIR §161)
import { describe, expect, it } from 'vitest'
import type { BufferAttribute } from 'three'
import { RING_BACKS, eaveRing, ringBack, ringPath, ringStrip } from './ringBack'
import { shellPaint, stripGroup, wallSource, wallStrip } from './shell'
import type { ChunkMesh, TexSheet } from './chunkMesh'
import { withData } from '../data/romData.testkit'

describe('고르는 소품', () => {
  it('⚠️ 천막 하나뿐이다 — 판을 끄는 일이 다른 소품으로 번지지 않는다', () => {
    expect([...RING_BACKS.keys()]).toEqual([540])
  })
})

withData('props/index.json', 'props/540.bin', 'props/540.png')('실제 자료 — 배틀프런티어 천막 (소품 540)', () => {
  const spec = RING_BACKS.get(540)!
  let mesh: ChunkMesh
  let sheet: TexSheet | null

  const load = async () => {
    const { loadPropMesh, loadPropSheet } = await import('./chunkMesh')
    const { installNodeAssets } = await import('../data/romData.testkit')
    installNodeAssets()
    mesh = await loadPropMesh(540)
    sheet = await loadPropSheet(540)
  }

  /** 원작 벽(서브메시 6)의 바닥 꼭짓점 — 처마 한가운데에서 잰 각 */
  const wallAngles = (center: readonly [number, number]): number[] => {
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute
    const index = mesh.geometry.getIndex()!
    const [, start, count] = mesh.groups[6]!
    const out: number[] = []
    for (let k = start; k < start + count; k++) {
      const i = index.getX(k)
      if (pos.getY(i) < 0.3) out.push(Math.atan2(pos.getZ(i) - center[1], pos.getX(i) - center[0]))
    }
    return out
  }

  it('처마 고리는 정십각형이다 — 반지름 7.1 · 처마 밑 5.34~7.31', async () => {
    await load()
    const ring = eaveRing(mesh, spec)!
    expect(ring.center[0]).toBeCloseTo(1.459, 2)
    expect(ring.center[1]).toBeCloseTo(-1.166, 2)
    // 열 꼭짓점 — 같은 자리에 반올림이 갈린 짝이 몇 있어 그보다 많을 수 있다. 각으로 묶으면 열이다
    const bins = new Set(ring.corners.map(([a]) => Math.round((a * 180) / Math.PI / 36 - 0.05)))
    expect(bins.size).toBe(10)
    for (const [, x, z, y] of ring.corners) {
      expect(Math.hypot(x - ring.center[0], z - ring.center[1])).toBeGreaterThan(6.9)
      expect(Math.hypot(x - ring.center[0], z - ring.center[1])).toBeLessThan(7.2)
      expect(y).toBeGreaterThanOrEqual(5.34)
      expect(y).toBeLessThanOrEqual(7.32)
    }
  }, 60_000)

  it('몸통은 원작 벽이 없는 호만 돈다 — 앞 벽과 안 겹친다', async () => {
    await load()
    const made = ringPath(mesh, spec)!
    const [cx, cz] = made.center
    const turn = (a: number, from: number): number => (a < from ? a + 2 * Math.PI : a)
    const a0 = Math.atan2(spec.from[1] - cz, spec.from[0] - cx)
    const a1 = turn(Math.atan2(spec.to[1] - cz, spec.to[0] - cx), a0)
    // 원작 벽 바닥 꼭짓점은 하나도 그 호 안에 없다 (끝자리 자신은 경계라 1° 여유)
    const inside = wallAngles(made.center).filter((a) => {
      const t = turn(a, a0)
      return t > a0 + Math.PI / 180 && t < a1 - Math.PI / 180
    })
    expect(inside).toEqual([])
    // 그 호가 뒤쪽 절반 남짓이다 — −161.7°에서 문틀 뒤 기둥(+5°)까지
    expect(((a1 - a0) * 180) / Math.PI).toBeGreaterThan(160)
    expect(((a1 - a0) * 180) / Math.PI).toBeLessThan(175)
    expect(made.path[0]!.slice(0, 2)).toEqual([...spec.from])
    expect(made.path.at(-1)!.slice(0, 2)).toEqual([...spec.to])
    // 처마 밑까지 — 뒤로 갈수록 높다
    expect(made.path.map(([, , y]) => +y.toFixed(2))).toEqual([5.34, 5.72, 6.32, 6.34, 6.71, 6.71])
  }, 60_000)

  it('몸통은 바깥을 보고 처마 안에 선다 · 재질은 띠 자리 하나다', async () => {
    await load()
    const geo = ringBack(mesh, spec)!
    const [cx, cz] = eaveRing(mesh, spec)!.center
    expect(geo.groups).toEqual([{ start: 0, count: geo.getAttribute('position').count, materialIndex: stripGroup(mesh) }])
    const pos = geo.getAttribute('position') as BufferAttribute
    const nor = geo.getAttribute('normal') as BufferAttribute
    for (let t = 0; t < pos.count; t += 3) {
      const p = [0, 1, 2].map((j) => [pos.getX(t + j), pos.getY(t + j), pos.getZ(t + j)])
      const mx = (p[0]![0]! + p[1]![0]! + p[2]![0]!) / 3, mz = (p[0]![2]! + p[1]![2]! + p[2]![2]!) / 3
      // 법선이 바깥(한가운데에서 먼 쪽)
      expect(nor.getX(t) * (mx - cx) + nor.getZ(t) * (mz - cz)).toBeGreaterThan(0)
      // 감는 방향도 바깥 — 양면 재질이어도 조명이 법선을 따른다
      const ab = [p[1]![0]! - p[0]![0]!, p[1]![1]! - p[0]![1]!, p[1]![2]! - p[0]![2]!]
      const ac = [p[2]![0]! - p[0]![0]!, p[2]![1]! - p[0]![1]!, p[2]![2]! - p[0]![2]!]
      const nx = ab[1]! * ac[2]! - ab[2]! * ac[1]!, nz = ab[0]! * ac[1]! - ab[1]! * ac[0]!
      expect(nx * nor.getX(t) + nz * nor.getZ(t)).toBeGreaterThan(0)
      for (const q of p) {
        // 문틀 뒤 기둥(반지름 7.24)까지가 제일 멀다 — 처마(7.1) 밖으로 판이 튀어나가지 않는다
        expect(Math.hypot(q[0]! - cx, q[2]! - cz)).toBeLessThan(7.25)
        expect(q[1]).toBeGreaterThanOrEqual(spec.span[0])
        expect(q[1]).toBeLessThanOrEqual(6.72)
      }
    }
  }, 60_000)

  it('⚠️ 띠는 벽을 찍어 읽는다 — 벽 끝 v로 읽으면 한 색(#efef9c)뿐이다', async () => {
    await load()
    const colors = (s: { pixels: Uint8Array, h: number }): number[] => {
      const out: number[] = []
      for (let k = 0; k < s.h; k++) out.push((s.pixels[k * 4]! << 16) | (s.pixels[k * 4 + 1]! << 8) | s.pixels[k * 4 + 2]!)
      return out
    }
    // 옛 길 — 맨 아래와 맨 위 꼭짓점의 v가 둘 다 0.15625라 서른두 줄이 한 색이었다
    const old = wallStrip(mesh, sheet, wallSource(mesh, shellPaint(mesh, sheet)))!
    expect(new Set(colors(old))).toEqual(new Set([0xefef9c]))
    const made = ringStrip(mesh, sheet, spec)!
    const got = colors(made)
    expect(made.h).toBe(32)
    // 기단 진분홍 · 벽 회분홍 · 층 사이 진분홍 띠가 높이대로 선다 — 앞 벽과 같은 결이다
    expect(got[0]).toBe(0xad5a63)
    expect(got[8]).toBe(0xad9c9c)
    expect(got[15]).toBe(0xad5a63)
    expect(got[31]).toBe(0xad5a63)
    expect(got).not.toContain(0xefef9c)
  }, 60_000)
})
