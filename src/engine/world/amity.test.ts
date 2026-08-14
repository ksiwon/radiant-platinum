// 우호광장 (PARITY §7.8)
import { describe, expect, it } from 'vitest'
import {
  AMITY_GIFT_COUNT, AMITY_STEP_MAX, amityFindIndex, amityFound, amityGiftId,
  amityGiftIsAccessory, amityPool, amityStep,
} from './amity'
import { AMITY_FIND, AMITY_FIND_WEIGHTS, AMITY_GIFTS, AMITY_POOL_OF } from './amityTables'

describe('표', () => {
  it('무리 여섯에 열 자리씩이다', () => {
    expect(AMITY_FIND).toHaveLength(6)
    for (const pool of AMITY_FIND) expect(pool).toHaveLength(10)
  })

  it('자리마다의 확률 합이 100이다', () => {
    expect(AMITY_FIND_WEIGHTS.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('들어갈 수 있는 스무 종이 표에 있다', () => {
    expect(AMITY_POOL_OF).toHaveLength(20)
    for (const [, pool] of AMITY_POOL_OF) {
      expect(pool).toBeGreaterThanOrEqual(0)
      expect(pool).toBeLessThan(AMITY_FIND.length)
    }
  })

  it('선물이 열여섯이고 앞의 아홉이 열매다', () => {
    expect(AMITY_GIFTS).toHaveLength(16)
    expect(AMITY_GIFT_COUNT).toBe(16)
    // 열매는 도구 번호 149~212 안이다
    for (let i = 0; i < 9; i++) {
      expect(AMITY_GIFTS[i]!, `선물 ${String(i)}`).toBeGreaterThanOrEqual(149)
      expect(AMITY_GIFTS[i]!).toBeLessThanOrEqual(212)
    }
  })
})

describe('무리 고르기', () => {
  it('불꽃숭이 셋이 0번 무리다', () => {
    for (const s of [390, 391, 392]) expect(amityPool(s)).toBe(0)
  })

  it('팽도리 셋이 1번, 모부기 셋이 2번이다', () => {
    for (const s of [393, 394, 395]) expect(amityPool(s)).toBe(1)
    for (const s of [387, 388, 389]) expect(amityPool(s)).toBe(2)
  })

  it('⚠️ 표에 없는 종은 0번 무리다 — 원작의 `default`다', () => {
    expect(amityPool(1)).toBe(0)
    expect(amityPool(493)).toBe(0)
  })
})

describe('주워 오는 장식', () => {
  it('⚠️ 자리마다 폭이 다르다 — 앞의 넷이 15%씩이다', () => {
    expect(amityFindIndex(0)).toBe(0)
    expect(amityFindIndex(14)).toBe(0)
    expect(amityFindIndex(15)).toBe(1)
    expect(amityFindIndex(59)).toBe(3)
    expect(amityFindIndex(60)).toBe(4) // 여기부터 10%
    expect(amityFindIndex(79)).toBe(5)
    expect(amityFindIndex(80)).toBe(6) // 8%
    expect(amityFindIndex(87)).toBe(6)
    expect(amityFindIndex(88)).toBe(7) // 5%
    expect(amityFindIndex(93)).toBe(8)
    expect(amityFindIndex(98)).toBe(9) // 2%
    expect(amityFindIndex(99)).toBe(9)
  })

  it('무리가 다르면 같은 굴림에 다른 것이 나온다', () => {
    // 불꽃숭이(390)와 모부기(387)의 첫 자리가 서로 다르다
    expect(amityFound(390, 0)).not.toBe(amityFound(387, 0))
  })

  it('굴림이 범위를 벗어나도 안 터진다', () => {
    expect(amityFindIndex(999)).toBe(9)
    expect(amityFound(390, 999)).toBe(AMITY_FIND[0]![9])
  })
})

describe('걸음', () => {
  it('한 걸음씩 는다', () => {
    expect(amityStep(0)).toBe(1)
    expect(amityStep(500)).toBe(501)
  })

  it('만에서 멈춘다', () => {
    expect(amityStep(AMITY_STEP_MAX - 1)).toBe(AMITY_STEP_MAX)
    expect(amityStep(AMITY_STEP_MAX)).toBe(AMITY_STEP_MAX)
  })
})

describe('아저씨의 선물', () => {
  it('⚠️ 아홉 번째부터 장식이다 — 번호로만 가른다', () => {
    expect(amityGiftIsAccessory(8)).toBe(false)
    expect(amityGiftIsAccessory(9)).toBe(true)
    expect(amityGiftIsAccessory(15)).toBe(true)
  })

  it('번호가 표의 그 줄을 준다', () => {
    for (let i = 0; i < AMITY_GIFTS.length; i++) expect(amityGiftId(i)).toBe(AMITY_GIFTS[i])
    expect(amityGiftId(99)).toBe(0)
  })
})
