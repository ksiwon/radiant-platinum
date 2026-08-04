// 상금. 공식과 배수표를 **원작에 실제로 적혀 있는 금액**으로 확인한다 —
// 난천 12400엔, 강석 4920엔. 배수표가 한 칸 밀리면 여기서 바로 어긋난다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { trainerFileSchema, TRAINER_CLASS_COUNT } from '../../../data/schema'
import { prizeFor, prizeMoney } from './prize'

const file = trainerFileSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, '../../../../public/data/trainers.json'), 'utf8')),
)
const trainers = file.trainers
const mul = file.prizeMul

describe('상금 공식', () => {
  it('마지막 포켓몬 레벨 × 4 × 배수', () => {
    expect(prizeMoney({ mul: 50, lastLevel: 62 })).toBe(12400)
    expect(prizeMoney({ mul: 4, lastLevel: 5 })).toBe(80)
  })

  it('부적금화와 더블은 각각 두 배다', () => {
    expect(prizeMoney({ mul: 10, lastLevel: 10, amuletCoin: true })).toBe(800)
    expect(prizeMoney({ mul: 10, lastLevel: 10, doubles: true })).toBe(800)
    expect(prizeMoney({ mul: 10, lastLevel: 10, doubles: true, amuletCoin: true })).toBe(1600)
  })

  it('배수가 0이면 상금이 없다', () => {
    // 주인공 두 분류가 0이다. 여기가 안 걸리면 자기 자신과 싸워 돈을 번다
    expect(prizeMoney({ mul: 0, lastLevel: 100 })).toBe(0)
  })
})

describe('배수표', () => {
  it('분류 수만큼 있다', () => {
    expect(mul).toHaveLength(TRAINER_CLASS_COUNT)
  })

  it('원작 금액과 같다', () => {
    // 난천(#267)은 12400엔, 강석(#250)은 4920엔이다. 공식과 표를 함께 확인한다
    expect(prizeFor(trainers[267]!, mul)).toBe(12400)
    expect(prizeFor(trainers[250]!, mul)).toBe(4920)
  })

  it('파티가 없으면 0이다', () => {
    // 0번은 자리표시자다. 마지막 칸을 못 찾을 때 NaN이 세이브로 들어가면 안 된다
    expect(prizeFor(trainers[0]!, mul)).toBe(0)
  })

  it('928명 전부 상금이 정수이고 음수가 아니다', () => {
    let paying = 0
    for (const t of trainers) {
      const money = prizeFor(t, mul)
      expect(Number.isInteger(money), `#${t.id}`).toBe(true)
      expect(money, `#${t.id}`).toBeGreaterThanOrEqual(0)
      if (money > 0) paying++
    }
    // 대부분이 돈을 준다는 것 — 표가 통째로 0이면 위 단언들이 전부 공허하다
    expect(paying).toBeGreaterThan(900)
  })

  it('관장급이 잡트레이너보다 많이 준다', () => {
    const gym = prizeFor(trainers[250]!, mul)
    const plain = prizeFor(trainers.find((t) => prizeFor(t, mul) > 0 && t.class === 4)!, mul)
    expect(gym).toBeGreaterThan(plain * 10)
  })
})
