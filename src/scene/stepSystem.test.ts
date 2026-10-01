// 한 걸음이 어디서 끊기는가를 잰다 (`Field_ProcessStep`, `overlay005/field_control.c` 735-761).
//
// 원작은 독 → 사파리 → 육성가 → … → 리펠 차례로 돌고, 앞의 것이 `TRUE`면 뒤는 그 걸음에 안 돈다.
// 독으로 1까지 내려간 걸음(`FLDPSN_FAINTED`)이 그 첫 자리다.
import { describe, expect, it, vi } from 'vitest'
import { Poison } from '../engine/actor/steps'
import { walkAfterPoison } from './stepSystem'

/** 사파리·육성가가 몇 번 불렸는지 센다. `hatch`면 육성가가 알을 깬다 */
function rest(hatch = false) {
  return { safari: vi.fn(), daycare: vi.fn(() => hatch) }
}

describe('walkAfterPoison — 독 다음 차례', () => {
  it('독으로 1까지 내려간 걸음은 사파리도 육성가도 안 부르고 독에서 끝난다', () => {
    const after = rest(true)
    const got = walkAfterPoison({ poison: Poison.FAINTED, repelSteps: 4, repelExpired: false }, 5, after)
    expect(got.stop).toBe('poison')
    expect(after.safari).not.toHaveBeenCalled()
    expect(after.daycare).not.toHaveBeenCalled()
  })

  it('독에서 멈춘 걸음은 리펠을 안 깎는다 — 마지막 한 걸음이 겹쳐도 다음 걸음에 알린다', () => {
    const after = rest()
    const got = walkAfterPoison({ poison: Poison.FAINTED, repelSteps: 0, repelExpired: true }, 1, after)
    expect(got).toEqual({ stop: 'poison', repelSteps: 1 })
  })

  it('깎이기만 한 걸음은 원작이 FALSE를 돌려줘서 사파리·육성가·리펠이 이어 돈다', () => {
    const after = rest()
    const got = walkAfterPoison({ poison: Poison.HURT, repelSteps: 0, repelExpired: true }, 1, after)
    expect(after.safari).toHaveBeenCalledTimes(1)
    expect(after.daycare).toHaveBeenCalledTimes(1)
    expect(got).toEqual({ stop: 'repel', repelSteps: 0 })
  })

  it('사파리가 육성가보다 먼저다', () => {
    const order: string[] = []
    walkAfterPoison({ poison: Poison.NONE, repelSteps: 0, repelExpired: false }, 0, {
      safari: () => { order.push('safari') },
      daycare: () => { order.push('daycare'); return false },
    })
    expect(order).toEqual(['safari', 'daycare'])
  })

  it('알이 깬 걸음은 부화에서 끝나고 리펠을 안 깎는다', () => {
    const after = rest(true)
    const got = walkAfterPoison({ poison: Poison.NONE, repelSteps: 0, repelExpired: true }, 1, after)
    expect(after.daycare).toHaveBeenCalledTimes(1)
    expect(got).toEqual({ stop: 'hatch', repelSteps: 1 })
  })

  it('아무 일 없는 걸음은 끝까지 돌고 리펠이 한 걸음 깎인다', () => {
    const got = walkAfterPoison({ poison: Poison.NONE, repelSteps: 9, repelExpired: false }, 10, rest())
    expect(got).toEqual({ stop: null, repelSteps: 9 })
  })
})
