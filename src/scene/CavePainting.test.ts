// 천관산 2층 벽화 · 조각 (`CavePainting`) — 롬 모델(`celestic_ruins_wall` · `painting_shards_*`) 실측대로 짓는가
import { describe, expect, it } from 'vitest'
import { Box3, type BufferGeometry } from 'three'
import { paintingFaceGeometry, paintingWallGeometry, shardRelief, WALL_PROFILE } from './CavePainting'

const boxOf = (g: BufferGeometry): Box3 => {
  g.computeBoundingBox()
  return g.boundingBox!
}
const tris = (g: BufferGeometry): number => g.getAttribute('position').count / 3

describe('벽 쐐기', () => {
  it('롬 46삼각형에 뒷면 넷을 더한다 — 폭 4칸 · 높이 2칸 · z 0 → −2', () => {
    const g = paintingWallGeometry()
    expect(tris(g)).toBe(46 + 4)
    const b = boxOf(g)
    expect([b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z]).toEqual([-2, 2, 0, 2, -2, 0])
  })

  it('앞면이 계단꼴로 물러난다 — 롬 꺾임 일곱 점', () => {
    expect(WALL_PROFILE.length).toBe(7)
    // 위로 갈수록 뒤로 — 쐐기가 앞으로 넘어오는 띠가 없다
    for (let i = 1; i < WALL_PROFILE.length; i++) {
      expect(WALL_PROFILE[i]![0]).toBeGreaterThan(WALL_PROFILE[i - 1]![0])
      expect(WALL_PROFILE[i]![1]).toBeLessThan(WALL_PROFILE[i - 1]![1])
    }
  })

  it('벽은 아틀라스 왼쪽 장(벽), 그림 판은 오른쪽 장(그림)만 본다', () => {
    const us = (g: BufferGeometry): number[] => {
      const uv = g.getAttribute('uv')
      return Array.from({ length: uv.count }, (_, i) => uv.getX(i))
    }
    expect(Math.max(...us(paintingWallGeometry()))).toBeLessThanOrEqual(0.5)
    expect(Math.min(...us(paintingFaceGeometry()))).toBeGreaterThanOrEqual(0.5)
  })

  it('그림 판은 앞면보다 앞에 선다 — 롬 (y 0.25, z −0.125) → (y 2, z −1.625)', () => {
    const b = boxOf(paintingFaceGeometry())
    expect([b.min.y, b.max.y, b.min.z, b.max.z]).toEqual([0.25, 2, -1.625, -0.125])
    // y 1에서 앞면은 z −1, 그림 판은 −0.77 — 0.23칸 앞이다
    const faceZ = -0.125 + (1 - 0.25) * (-1.5 / 1.75)
    expect(faceZ).toBeGreaterThan(-1)
  })
})

describe('조각 기둥 (`shardRelief`)', () => {
  /** 4×2 그림 — 왼쪽 반(2×2)에 불투명 텍셀 둘(어두운 것 · 밝은 것), 오른쪽 반은 비었다 */
  const image = (): Uint8ClampedArray => {
    const px = new Uint8ClampedArray(4 * 2 * 4)
    const put = (c: number, r: number, v: number): void => { px.set([v, v, v, 255], (r * 4 + c) * 4) }
    put(0, 0, 40)
    put(1, 1, 220)
    return px
  }

  it('불투명 텍셀마다 기둥 하나 — 윗면 하나와 낮은 쪽 옆면', () => {
    const g = shardRelief(image(), 4, 2, 0)!
    // 대각선으로 떨어진 두 텍셀 — 둘 다 네 옆이 다 낮다: (윗면 1 + 옆 4) × 2 = 네모 10 = 삼각형 20
    expect(tris(g)).toBe(20)
    const b = boxOf(g)
    // 롬 판의 자리 — x −1~1 · z −0.937~0.937 안
    expect(b.min.x).toBeGreaterThanOrEqual(-1)
    expect(b.max.x).toBeLessThanOrEqual(1)
    expect(b.min.z).toBeGreaterThanOrEqual(-0.937)
    expect(b.max.z).toBeLessThanOrEqual(0.937)
    expect(b.min.y).toBe(0)
  })

  it('밝은 텍셀이 높다 — 가장 어두운 것 0.05칸 · 가장 밝은 것 0.24칸', () => {
    const g = shardRelief(image(), 4, 2, 0)!
    const pos = g.getAttribute('position')
    const tops = new Map<string, number>()
    for (let i = 0; i < pos.count; i++) {
      const key = pos.getX(i) < 0 ? 'dark' : 'bright'
      tops.set(key, Math.max(tops.get(key) ?? 0, pos.getY(i)))
    }
    expect(tops.get('dark')).toBeCloseTo(0.05)
    expect(tops.get('bright')).toBeCloseTo(0.24)
  })

  it('빈 반쪽이면 null — 판때기가 선다', () => {
    expect(shardRelief(image(), 4, 2, 1)).toBeNull()
  })
})
