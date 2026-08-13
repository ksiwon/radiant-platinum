// 말 안 듣기 (PARITY §2.18)
//
// 확률이 섞인 규칙이라 「몇 번에 한 번 나온다」로는 못 잰다. 난수를 **직접 먹여**
// 갈림길마다 어느 쪽으로 가는지를 못박는다.
import { describe, expect, it } from 'vitest'
import {
  badgeCount, checkObedience, damageVariance, idleFlavor, obeyCap, selfHitDamage,
  type ObeyContext,
} from './obedience'

/** 미리 정한 값을 차례로 내는 난수. 다 쓰면 마지막 값을 되풀이한다 */
function feed(...values: number[]): () => number {
  let at = 0
  return () => values[Math.min(at++, values.length - 1)] ?? 0
}

const base: ObeyContext = {
  level: 100,
  badges: 0,
  isOwn: false,
  status: 'ok',
  sleepMove: false,
  cantSleep: false,
  otherSlots: [2, 3, 4],
}

describe('뱃지가 정하는 문턱', () => {
  it('짝수 뱃지에서만 오른다', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(obeyCap))
      .toEqual([10, 10, 30, 30, 50, 50, 70, 70, 70])
  })

  it('비트마스크에서 개수를 센다', () => {
    expect(badgeCount(0)).toBe(0)
    expect(badgeCount(0b101)).toBe(2)
    expect(badgeCount(0xff)).toBe(8)
  })
})

describe('언제 듣는가', () => {
  it('내가 잡은 마리는 뱃지가 하나도 없어도 듣는다', () => {
    // ⚠️ 이게 이 규칙의 절반이다. 원작이 원래 트레이너를 먼저 본다
    expect(checkObedience({ ...base, isOwn: true }, feed(0.99)).result).toBe('obey')
  })

  it('뱃지 여덟이면 통째로 사라진다', () => {
    expect(checkObedience({ ...base, badges: 8 }, feed(0.99)).result).toBe('obey')
  })

  it('문턱 이하의 레벨은 듣는다', () => {
    expect(checkObedience({ ...base, level: 10 }, feed(0.99)).result).toBe('obey')
    // 문턱 바로 위는 판정을 탄다
    expect(checkObedience({ ...base, level: 11 }, feed(0.99)).result).not.toBe('obey')
  })

  it('난수가 작으면 그냥 듣는다', () => {
    // ((0 & 0xFF) * (100 + 10)) >> 8 = 0 < 10
    expect(checkObedience(base, feed(0)).result).toBe('obey')
  })

  it('레벨이 높을수록 덜 듣는다', () => {
    // 같은 난수 바이트로 레벨만 바꾼다. 곱하는 값에 레벨이 들어 있어서
    // 문턱을 크게 넘길수록 통과가 어려워진다
    const roll = 0.1 // 바이트 25
    expect(checkObedience({ ...base, level: 11 }, feed(roll)).result).toBe('obey')
    expect(checkObedience({ ...base, level: 100 }, feed(roll)).result).not.toBe('obey')
  })
})

describe('안 들으면 무슨 일이 일어나는가', () => {
  it('자면서 코골기·잠꼬대를 시키면 그냥 무시한다', () => {
    // 다른 기술로 바꿀 수가 없는 자리다 — 그 둘은 자고 있어야 나간다
    const got = checkObedience(
      { ...base, status: 'slp', sleepMove: true }, feed(0.99),
    )
    expect(got.result).toBe('ignoredAsleep')
  })

  it('두 번째 판정을 통과하면 다른 기술을 쓴다', () => {
    // 1) 첫 판정 떨어짐 2) 두 번째 통과 3) 칸 고르기
    const got = checkObedience(base, feed(0.99, 0, 0.5))
    expect(got.result).toBe('otherMove')
    expect(got.slot).toBe(3)
  })

  it('바꿔 쓸 기술이 없으면 아무것도 안 한다', () => {
    const got = checkObedience({ ...base, otherSlots: [] }, feed(0.99, 0))
    expect(got.result).toBe('nothing')
  })

  it('문턱을 넘긴 폭이 졸음과 자해의 확률이 된다', () => {
    // 레벨 100, 뱃지 0 → 폭 90. 바이트가 90 미만이면 존다
    expect(checkObedience(base, feed(0.99, 0.99, 0)).result).toBe('nap')
    // 바이트 100 → 100 - 90 = 10 < 90 이라 자해
    expect(checkObedience(base, feed(0.99, 0.99, 100 / 256)).result).toBe('hitSelf')
    // 바이트 250 → 250 - 90 = 160 ≥ 90 이라 아무것도 안 한다
    expect(checkObedience(base, feed(0.99, 0.99, 250 / 256)).result).toBe('nothing')
  })

  it('이미 상태이상이거나 불면·의욕이면 안 존다', () => {
    // 원작이 셋을 같은 자리에서 본다. 대신 자해 쪽으로 밀린다
    expect(checkObedience({ ...base, status: 'par' }, feed(0.99, 0.99, 0)).result)
      .toBe('hitSelf')
    expect(checkObedience({ ...base, cantSleep: true }, feed(0.99, 0.99, 0)).result)
      .toBe('hitSelf')
  })

  it('아무것도 안 한 마디는 넷이다', () => {
    // `Random 3, 0`이 **범위에 1을 더하므로** 셋이 아니라 넷이다
    const seen = new Set([0, 0.3, 0.6, 0.9].map((v) => idleFlavor(feed(v))))
    expect([...seen].sort()).toEqual([0, 1, 2, 3])
  })
})

describe('자기를 때리는 데미지', () => {
  it('혼란 자해와 같은 값이다', () => {
    // 공격 100 · 방어 100 · 레벨 50 → floor(100*40*22/100/50) + 2 = 19
    expect(selfHitDamage(50, 100, 100)).toBe(19)
    // 급소도 상성도 자속도 안 걸린다 — 공격만 두 배면 데미지도 대략 두 배다
    expect(selfHitDamage(50, 200, 100)).toBe(37)
  })

  it('흔들림은 100에서 15까지 깎는다', () => {
    // ⚠️ 흔한 「85~100 균일」이 아니라 `100 − rand%16`이다. 16칸이라 85가 하한
    expect(damageVariance(100, feed(0))).toBe(100)
    expect(damageVariance(100, feed(15 / 16))).toBe(85)
    // 0을 깎는 일은 없다
    expect(damageVariance(1, feed(15 / 16))).toBe(1)
    expect(damageVariance(0, feed(0))).toBe(0)
  })
})
