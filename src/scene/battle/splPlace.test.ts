// DS 입자 공간을 얹는 자.
//
// ⚠️ **여기서 재는 것은 「값이 맞다」가 아니라 「자가 성립한다」다.** 축 셋이
// 직교하고 오른손이어야 원작의 회전·기울임이 그대로 옮겨진다 — 하나만
// 뒤집혀도 그림이 거울이 되는데, 그건 화면으로 못 잡는다.
import { describe, expect, it } from 'vitest'
import { MON_DS, splAnchorAt, splBasis, splMetre, splToWorld, type Vec3 } from './splPlace'

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])

describe('splBasis', () => {
  it('축 셋이 정규직교다', () => {
    const b = splBasis([0, 1, 2.2], [0, 1.4, -2.2])
    for (const v of [b.ex, b.ey, b.ez]) expect(len(v)).toBeCloseTo(1, 6)
    expect(dot(b.ex, b.ey)).toBeCloseTo(0, 6)
    expect(dot(b.ey, b.ez)).toBeCloseTo(0, 6)
    expect(dot(b.ez, b.ex)).toBeCloseTo(0, 6)
  })

  it('오른손이다 — ex × ey = ez (원작도 그렇다)', () => {
    const b = splBasis([1, 0, 3], [-2, 0, -1])
    const cross: Vec3 = [
      b.ex[1] * b.ey[2] - b.ex[2] * b.ey[1],
      b.ex[2] * b.ey[0] - b.ex[0] * b.ey[2],
      b.ex[0] * b.ey[1] - b.ex[1] * b.ey[0],
    ]
    for (const i of [0, 1, 2]) expect(cross[i]).toBeCloseTo(b.ez[i], 6)
  })

  it('+X는 때린 쪽에서 맞는 쪽으로, 땅과 나란하다', () => {
    // 키가 크게 다른 둘 — 원작에서 +X는 내 쪽 → 상대 쪽이다
    const b = splBasis([0, 0.2, 2.2], [0, 3.5, -2.2])
    expect(b.ex[1]).toBe(0)
    expect(b.ex[2]).toBeCloseTo(-1, 6)
  })

  it('두 자리가 겹쳐도 축이 선다 — 자기 몸에 거는 기술', () => {
    const b = splBasis([0, 1, 2.2], [0, 1, 2.2])
    expect(len(b.ex)).toBeCloseTo(1, 6)
    expect(Number.isFinite(b.ez[0])).toBe(true)
  })
})

describe('splMetre', () => {
  it('몸이 세 단위라는 실측 그대로다', () => {
    expect(splMetre(1.2)).toBeCloseTo(1.2 / MON_DS, 6)
  })

  it('아주 작은 종과 아주 큰 종에서 묶인다', () => {
    // 디그다 0.2m와 왕구리 7.3m를 그대로 쓰면 같은 기술이 서른 배씩 벌어진다
    expect(splMetre(0.2)).toBe(splMetre(0.6))
    expect(splMetre(7.3)).toBe(splMetre(2.4))
    expect(splMetre(7.3) / splMetre(0.2)).toBe(4)
  })
})

describe('splAnchorAt', () => {
  const by: Vec3 = [0, 1, 2.2]
  const foe: Vec3 = [0, 1.4, -2.2]

  it('맞는 쪽·가운데·때린 쪽', () => {
    expect(splAnchorAt('defender', by, foe)).toEqual(foe)
    expect(splAnchorAt('center', by, foe)).toEqual([0, 1.2, 0])
    expect(splAnchorAt('attacker', by, foe)).toEqual(by)
  })

  it('generic은 때린 쪽이다 — 원작 기본이 「때린 쪽에서 맞는 쪽으로」다', () => {
    expect(splAnchorAt('generic', by, foe)).toEqual(by)
  })
})

describe('splToWorld', () => {
  it('DS +X만큼 가면 상대 쪽으로 그만큼 간다', () => {
    const b = splBasis([0, 1, 2.2], [0, 1, -2.2])
    const w = splToWorld(b, [2, 0, 0], 0.4)
    expect(w[0]).toBeCloseTo(0, 6)
    expect(w[1]).toBeCloseTo(0, 6)
    expect(w[2]).toBeCloseTo(-0.8, 6)
  })

  it('DS +Y는 언제나 위다', () => {
    const b = splBasis([1, 0, 3], [-2, 0, -1])
    const w = splToWorld(b, [0, 3, 0], 0.5)
    expect(w).toEqual([0, 1.5, 0])
  })
})
