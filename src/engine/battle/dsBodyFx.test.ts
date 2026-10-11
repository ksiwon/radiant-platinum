import { describe, expect, it } from 'vitest'
import { ASSIST_PAWS, FORESIGHT_FRAMES, foresightAt, odorShakeAt, pawAt, snatchAt, SNATCH_FRAMES } from './dsBodyFx'

describe('DS 몸 연출 시간표', () => {
  it('선견 — 눈이 여섯 구간을 지나 제자리에서 사라지고 그 뒤 몸이 번쩍인다', () => {
    expect(foresightAt(0).alpha).toBe(1)
    // 첫 구간 끝(5 + 8프레임 = 둘째 구간의 시작) — (40, 40)에 닿는다 (y는 위가 +라 −40)
    const s1 = foresightAt(13)
    expect(s1.x).toBeCloseTo(40, 5)
    expect(s1.y).toBeCloseTo(-40, 5)
    const end = foresightAt(13 * 6 - 1)
    expect(Math.abs(end.x) + Math.abs(end.y)).toBeLessThanOrEqual(10)
    expect(foresightAt(13 * 6 + 20).alpha).toBe(0)
    expect(foresightAt(13 * 6 + 8).flash).toBeGreaterThan(0)
    expect(foresightAt(FORESIGHT_FRAMES - 1).flash).toBeLessThan(0.2)
  })

  it('슬쩍 — 15프레임씩 세 구간이고 끝나면 null', () => {
    expect(snatchAt(0)).toEqual({ leg: 0, k: 0 })
    expect(snatchAt(15)?.leg).toBe(1)
    expect(snatchAt(44)?.leg).toBe(2)
    expect(snatchAt(SNATCH_FRAMES)).toBeNull()
  })

  it('냄새맡기 — 열 번 프레임마다 부호가 바뀌고 그 뒤 멎는다', () => {
    expect(odorShakeAt(0)).toBe(20)
    expect(odorShakeAt(1)).toBe(-20)
    expect(odorShakeAt(20)).toBe(0)
  })

  it('도우미 — 발바닥이 나오고 부풀었다 돌아오고 날아간다. 같은 번호는 늘 같은 자리', () => {
    for (let i = 0; i < ASSIST_PAWS; i++) {
      expect(pawAt(i, 0).shown).toBe(false)
      expect(pawAt(i, 200).fly).toBe(1)
      expect(pawAt(i, 12).at).toEqual(pawAt(i, 99).at)
    }
    const peak = Math.max(...Array.from({ length: 60 }, (_, f) => pawAt(0, f).scale))
    expect(peak).toBeGreaterThan(1.2)
    expect(peak).toBeLessThanOrEqual(1.3 + 1e-9)
  })
})
