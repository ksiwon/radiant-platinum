// 바위 모양 (FIRST_PERSON §6.3).
import { describe, expect, it } from 'vitest'
import {
  ROCK_RECIPES, ROCK_SIDES, rockAspect, rockPositions, rockVariant,
} from './rockShape'

const tris = (p: Float32Array): number => p.length / 9

describe('덩이 하나', () => {
  const p = rockPositions(ROCK_RECIPES[0]!, 0.42, 0.1)

  it('삼각형 수가 §10.1의 상한 안이다', () => {
    // (링 4 − 1) × 둘레 7 × 2 + 7 = 49
    expect(tris(p)).toBe((ROCK_RECIPES[0]!.rings.length - 1) * ROCK_SIDES * 2 + ROCK_SIDES)
    expect(tris(p)).toBeLessThanOrEqual(160)
  })

  it('비인덱스라 면마다 제 법선이 선다 — 능선이 각진다', () => {
    // 정점이 삼각형마다 셋씩 따로다. 나눠 쓰면 `computeVertexNormals`가 뭉갠다
    expect(p.length % 9).toBe(0)
  })

  it('밑은 땅에 묻히고 꼭대기는 제 키다', () => {
    const ys: number[] = []
    for (let i = 1; i < p.length; i += 3) ys.push(p[i]!)
    expect(Math.min(...ys)).toBeCloseTo(-0.1 * 0.42, 6)
    expect(Math.max(...ys)).toBeCloseTo(0.42 - 0.1 * 0.42, 6)
  })

  it('회전체가 아니다 — 링마다 반지름과 중심이 다르다', () => {
    // 같은 높이의 둘레 점들이 한 원 위에 있지 않아야 한다
    const ring = ROCK_RECIPES[0]!.rings[1]!
    const y = -0.1 * 0.42 + ring[0] * 0.42
    const radii: number[] = []
    for (let i = 0; i < p.length; i += 3) {
      if (Math.abs(p[i + 1]! - y) > 1e-6) continue
      radii.push(Math.hypot(p[i]! - ring[2], p[i + 2]! - ring[3]))
    }
    expect(radii.length).toBeGreaterThan(6)
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.02)
  })

  it('들쭉날쭉함이 세로줄로 안 선다', () => {
    // 링을 올라갈 때 표를 한 칸 민다. 안 밀면 같은 방향이 계속 튀어나와 기둥이 된다
    const recipe = ROCK_RECIPES[0]!
    const angle0 = recipe.bumps[0]!
    const angle1 = recipe.bumps[1]!
    expect(angle0).not.toBe(angle1)
  })

  it('변주 셋이 서로 다르다', () => {
    const shapes = ROCK_RECIPES.map((r) => rockPositions(r, 0.42, 0.1).join(','))
    expect(new Set(shapes).size).toBe(ROCK_RECIPES.length)
  })

  it('자리가 같으면 늘 같은 변주다', () => {
    expect(rockVariant(12.5, 40.5)).toBe(rockVariant(12.5, 40.5))
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) seen.add(rockVariant(i * 1.5, i * 0.7))
    // 셋이 고루 나온다 — 한 변주만 나오면 고른 뜻이 없다
    expect(seen.size).toBe(ROCK_RECIPES.length)
  })
})

describe('실루엣에서 높이를 받는다', () => {
  it('칸을 가득 채우면 예전 값 0.414가 그대로 나온다', () => {
    expect(rockAspect(1, 1)).toBeCloseTo(0.414, 3)
  })

  it('위아래가 빈 칸은 더 낮은 돌이다', () => {
    expect(rockAspect(0.7, 1)).toBeLessThan(rockAspect(1, 1))
  })

  it('좌우가 빈 칸은 더 솟은 돌이다', () => {
    expect(rockAspect(1, 0.7)).toBeGreaterThan(rockAspect(1, 1))
  })

  it('판때기도 기둥도 안 된다', () => {
    expect(rockAspect(0.01, 1)).toBeGreaterThanOrEqual(0.22)
    expect(rockAspect(1, 0.05)).toBeLessThanOrEqual(0.95)
  })
})
