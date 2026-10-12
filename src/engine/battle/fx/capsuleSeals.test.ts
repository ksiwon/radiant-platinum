import { describe, expect, it } from 'vitest'
import { CAPSULE_SLOTS, emptyCapsule } from '../../world/ballCapsule'
import { SEAL_FX_FIXED, SEAL_FX_RES, SEAL_KINDS } from '../../world/sealTables'
import { burstSeals, sealDelayFrames, sealOffset, sealParticle } from './capsuleSeals'

describe('볼캡슐 씰 입자', () => {
  it('씰마다 입자 번호가 있고 서로 다른 것이 많다', () => {
    expect(SEAL_FX_RES).toHaveLength(SEAL_KINDS)
    expect(SEAL_FX_FIXED).toHaveLength(SEAL_KINDS)
    expect(sealParticle(1)).toBe(37)
    expect(sealParticle(0)).toBeNull()
    expect(sealParticle(SEAL_KINDS + 1)).toBeNull()
    expect(new Set(SEAL_FX_RES).size).toBeGreaterThan(60)
  })

  it('늦춤은 가운데에서 멀수록 늘고 모서리는 14프레임이다', () => {
    const at = (x: number, y: number) => sealDelayFrames({ type: 1, x, y })
    expect(at(190, 70)).toBe(0)
    // 거리 30 → ⌊31/20⌋ = 1 → 8
    expect(at(160, 70)).toBe(8)
    // 거리 √1800 ≈ 42.4 → ⌊43.4/20⌋ = 2 → 14
    expect(at(160, 40)).toBe(14)
    // 거리 60 ≥ 56 → 넷째 구간 20
    expect(at(250, 70)).toBe(20)
  })

  it('고정 깃발 씰은 자리와 상관없이 8프레임이다', () => {
    const fixed = SEAL_FX_FIXED.findIndex((f) => f === 1) + 1
    expect(fixed).toBeGreaterThan(0)
    expect(sealDelayFrames({ type: fixed, x: 250, y: 0 })).toBe(8)
  })

  it('칸 여덟이 모두 시차 표 안의 구간이다', () => {
    for (const s of CAPSULE_SLOTS) expect([0, 8, 14]).toContain(sealDelayFrames({ type: 1, ...s }))
  })

  it('자리 환산은 위가 +이고 가운데가 원점이다', () => {
    expect(sealOffset({ type: 1, x: 190, y: 70 })).toEqual([0, 0])
    const [dx, dy] = sealOffset({ type: 1, x: 220, y: 40 })
    expect(dx).toBeCloseTo(30 * 172 / 4096)
    expect(dy).toBeCloseTo(30 * 172 / 4096)
  })

  it('빈 칸은 터지지 않는다', () => {
    const c = emptyCapsule()
    c[2] = { ...c[2]!, type: 5 }
    expect(burstSeals(c)).toHaveLength(1)
  })
})
