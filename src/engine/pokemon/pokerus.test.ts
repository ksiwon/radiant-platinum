// 포켓루스 (PARITY §3.9)
//
// 65536분의 3이라 「여러 번 돌려서 걸리나 본다」로는 못 잰다. 난수를 직접
// 먹여 갈림길을 못박는다.
import { describe, expect, it } from 'vitest'
import {
  afterBattle, cured, daysLeft, doublesEvs, elapseDays, INFECT_ROLLS, infected,
  rollInfection, spread,
} from './pokerus'

/** 미리 정한 값을 차례로 내는 난수. 다 쓰면 마지막 값을 되풀이한다 */
function feed(...values: number[]): () => number {
  let at = 0
  return () => values[Math.min(at++, values.length - 1)] ?? 0
}

/** `LCRNG_Next()`가 그 u16 값을 내게 하는 [0,1) 값 */
const u16 = (n: number): number => n / 0x10000

type Slot = { species: number; isEgg: boolean; pokerus: number }
const slot = (pokerus = 0, species = 387): Slot => ({ species, isEgg: false, pokerus })

describe('바이트 한 장이 담는 것', () => {
  it('아래 니블이 남은 날, 위 니블이 균주다', () => {
    expect(infected({ pokerus: 0x52 })).toBe(true)
    expect(daysLeft({ pokerus: 0x52 })).toBe(2)
    expect(cured({ pokerus: 0x52 })).toBe(false)
  })

  it('남은 날이 0이고 균주가 있으면 나은 것이다', () => {
    expect(infected({ pokerus: 0x50 })).toBe(false)
    expect(cured({ pokerus: 0x50 })).toBe(true)
  })

  it('한 번도 안 걸렸으면 둘 다 아니다', () => {
    expect(infected({ pokerus: 0 })).toBe(false)
    expect(cured({ pokerus: 0 })).toBe(false)
  })

  it('⚠️ 나아도 노력치 두 배는 안 사라진다', () => {
    // 원작이 `Pokemon_HasPokerus`로 판정하는데 그 함수는 바이트가 0이 아니기만
    // 하면 참을 낸다. 「남은 날」로 재면 나흘 뒤에 조용히 사라진다
    expect(doublesEvs({ pokerus: 0x52 })).toBe(true)
    expect(doublesEvs({ pokerus: 0x50 })).toBe(true)
    expect(doublesEvs({ pokerus: 0 })).toBe(false)
  })
})

describe('걸리는 자리', () => {
  it('뽑은 값이 셋 중 하나가 아니면 아무 일도 없다', () => {
    expect(rollInfection([slot()], feed(u16(1)))).toBeNull()
    expect(rollInfection([slot()], feed(u16(16383)))).toBeNull()
  })

  it('셋 중 하나면 한 마리가 걸린다', () => {
    for (const roll of INFECT_ROLLS) {
      const got = rollInfection([slot()], feed(u16(roll), 0, 5 / 256))
      expect(got, `${roll}`).not.toBeNull()
      expect(got!.slot).toBe(0)
      // 균주 5, 남은 날은 늘 1~4다
      expect(got!.pokerus & 0xf0).toBe(0x50)
      expect(daysLeft({ pokerus: got!.pokerus })).toBeGreaterThanOrEqual(1)
      expect(daysLeft({ pokerus: got!.pokerus })).toBeLessThanOrEqual(4)
    }
  })

  it('한 번이라도 걸렸던 마리는 다시 안 걸린다', () => {
    // 다 나은 마리(0x50)도 마찬가지다
    expect(rollInfection([slot(0x50)], feed(u16(16384), 0, 5 / 256))).toBeNull()
  })

  it('알은 안 걸린다', () => {
    const eggs = [{ species: 387, isEgg: true, pokerus: 0 }]
    expect(rollInfection(eggs, feed(u16(16384), 0))).toBeNull()
  })

  it('남은 날은 언제나 1~4다', () => {
    // 바이트를 통째로 훑는다 — 하나라도 0이나 5 이상이 나오면 날짜 계산이 깨진다
    for (let b = 0; b < 256; b++) {
      const got = rollInfection([slot()], feed(u16(16384), 0, b / 256))
      const left = daysLeft({ pokerus: got!.pokerus })
      expect(left, `${b}`).toBeGreaterThanOrEqual(1)
      expect(left, `${b}`).toBeLessThanOrEqual(4)
    }
  })
})

describe('옆으로 옮는다', () => {
  it('세 번에 한 번만 돈다', () => {
    // ⚠️ 이 한 줄이 없으면 파티 여섯이 한 배틀 만에 다 걸린다
    const party = [slot(0x52), slot()]
    expect(spread(party, feed(0.5))[1]!.pokerus).toBe(0)
    expect(spread(party, feed(0))[1]!.pokerus).toBe(0x52)
  })

  it('양옆으로 같은 균주가 옮는다', () => {
    const got = spread([slot(), slot(0x52), slot()], feed(0))
    expect(got.map((m) => m.pokerus)).toEqual([0x52, 0x52, 0x52])
  })

  it('한 번이라도 걸렸던 옆 칸에는 안 옮는다', () => {
    const got = spread([slot(0x10), slot(0x52), slot(0x33)], feed(0))
    expect(got.map((m) => m.pokerus)).toEqual([0x10, 0x52, 0x33])
  })

  it('다 나은 마리는 더 안 옮긴다', () => {
    expect(spread([slot(0x50), slot()], feed(0))[1]!.pokerus).toBe(0)
  })

  it('막 옮은 칸이 그 자리에서 또 옮기지는 않는다', () => {
    // 원작이 오른쪽으로 옮긴 뒤 그 칸을 건너뛴다(`i++`). 안 그러면 한 번에
    // 파티 끝까지 번진다
    const got = spread([slot(0x52), slot(), slot()], feed(0))
    expect(got.map((m) => m.pokerus)).toEqual([0x52, 0x52, 0])
  })
})

describe('날이 지나면', () => {
  it('하루에 한 칸씩 깎인다', () => {
    expect(elapseDays([slot(0x54)], 1)[0]!.pokerus).toBe(0x53)
    expect(elapseDays([slot(0x54)], 3)[0]!.pokerus).toBe(0x51)
  })

  it('남은 날보다 오래 지났으면 낫는다', () => {
    expect(elapseDays([slot(0x52)], 3)[0]!.pokerus).toBe(0x50)
  })

  it('⚠️ 나흘을 넘겼으면 남은 날에 상관없이 낫는다', () => {
    // 시계를 앞으로 돌려도 균주가 안 살아남게 하는 자리다
    expect(elapseDays([slot(0x54)], 5)[0]!.pokerus).toBe(0x50)
  })

  it('다 나은 마리와 안 걸린 마리는 안 건드린다', () => {
    expect(elapseDays([slot(0x50), slot(0)], 9).map((m) => m.pokerus)).toEqual([0x50, 0])
  })

  it('날이 안 지났으면 그대로다', () => {
    expect(elapseDays([slot(0x52)], 0)[0]!.pokerus).toBe(0x52)
    // 시계를 뒤로 돌린 경우도 마찬가지다
    expect(elapseDays([slot(0x52)], -3)[0]!.pokerus).toBe(0x52)
  })
})

describe('배틀이 끝날 때', () => {
  it('안 걸리는 판에서도 옮기는 것은 돈다', () => {
    // 원작이 `ApplyPokerus`와 `ValidatePokerus`를 나란히 부른다
    const party = [{ ...mon(), pokerus: 0x52 }, mon()]
    const got = afterBattle(party, feed(u16(1), 0))
    expect(got[1]!.pokerus).toBe(0x52)
  })

  it('원본을 바꾸지 않는다', () => {
    const party = [{ ...mon(), pokerus: 0x52 }, mon()]
    afterBattle(party, feed(u16(1), 0))
    expect(party[1]!.pokerus).toBe(0)
  })
})

/** 배틀 뒤 처리에 필요한 칸만 채운 개체 */
function mon(): { species: number; isEgg: boolean; pokerus: number } & Record<string, unknown> {
  return { species: 387, isEgg: false, pokerus: 0 }
}
