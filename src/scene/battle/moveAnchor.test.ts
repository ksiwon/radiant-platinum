// 기술이 몸에 맞는 높이에서 나가는가 (PARITY §7.3)
//
// ⚠️ 여기서 재는 것은 「상수를 안 쓴다」다. 상수로 두면 화면에서 두 가지로
// 보인다 — 작은 종은 머리 위 허공으로 빔이 지나가고, 큰 종은 배를 뚫고 간다
import { beforeEach, describe, expect, it } from 'vitest'
import { girth, muzzleY, shapeSpan, torsoY } from './moveAnchor'
import { SLOT_TALL, slotBody, tallOf } from './stageRefs'

/** 실측값 — `pnpm shot --tree`로 잰 자세 먹인 키 */
const DIGLETT = 0.3
const GYARADOS = 3.54

describe('기술이 나가고 맞는 자리', () => {
  beforeEach(() => {
    for (const key of Object.keys(slotBody)) delete slotBody[key]
  })

  it('아직 안 재었으면 기본 키를 쓴다', () => {
    expect(tallOf('p1a')).toBe(SLOT_TALL)
    // 0에 가까운 값은 「아직 안 쟀다」다 — 그대로 쓰면 기술이 땅에 붙는다
    slotBody.p1a = 0
    expect(tallOf('p1a')).toBe(SLOT_TALL)
  })

  it('작은 종은 낮게, 큰 종은 높게 나간다', () => {
    slotBody.p1a = DIGLETT
    slotBody.p2a = GYARADOS
    expect(muzzleY('p1a')).toBeCloseTo(0.234, 3)
    expect(muzzleY('p2a')).toBeCloseTo(2.761, 3)
    // 맞는 자리는 몸통이라 입보다 낮다
    expect(torsoY('p2a')).toBeLessThan(muzzleY('p2a'))
    // 디그다의 몸 안이다 — 상수 1.2였을 때는 머리 위 네 배였다
    expect(torsoY('p1a')).toBeLessThan(DIGLETT)
    expect(torsoY('p1a')).toBeGreaterThan(0)
  })

  it('둘레도 키에서 나온다', () => {
    slotBody.p1a = GYARADOS
    expect(girth('p1a')).toBeCloseTo(GYARADOS * 0.45, 5)
  })

  // ⚠️ 때리는 쪽만 보면 갸라도스가 디그다를 칠 때 디그다가 도형에 묻힌다
  it('도형 크기는 두 몸의 평균이고 위아래로 묶여 있다', () => {
    slotBody.p1a = DIGLETT
    slotBody.p2a = GYARADOS
    const both = shapeSpan('p1a', 'p2a')
    expect(both).toBe(shapeSpan('p2a', 'p1a'))
    expect(both).toBeGreaterThan(shapeSpan('p1a', 'p1a'))
    expect(both).toBeLessThan(shapeSpan('p2a', 'p2a'))
    // 아주 작아도 안 사라지고 아주 커도 화면을 안 덮는다
    slotBody.p1a = 0.1
    slotBody.p2a = 0.1
    expect(shapeSpan('p1a', 'p2a')).toBe(0.45)
    slotBody.p1a = 40
    slotBody.p2a = 40
    expect(shapeSpan('p1a', 'p2a')).toBe(1.6)
  })
})
