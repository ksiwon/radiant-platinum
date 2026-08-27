// 경험치 소리가 언제 나는가 (`battle_display.c`의 `Task_UpdateExpGauge`)
//
// 소리를 실제로 내는 것은 `ui/battle/BattleSound`고, 그쪽이 보는 것이 이 값이다.
// 여기서 재는 것은 **같은 점수가 이어서 와도 두 번 난다**는 것 — 파티 여섯이
// 같은 몫을 받으면 값이 전부 같아서, 번호가 없으면 뒤 다섯이 조용하다.
import { describe, expect, it } from 'vitest'
import type { BattleEvent } from './events'
import { applyEvent, emptyView } from './view'

const reward = (exp: number, levels: number[] = []): BattleEvent => ({
  kind: 'reward', key: 'p1-0', exp, levels, learned: [], pending: [],
})

describe('경험치를 받은 자리', () => {
  it('빈 화면에는 아무 값도 없다', () => {
    expect(emptyView().lastReward).toBeNull()
  })

  it('받으면 점수와 레벨이 올랐는가가 남는다', () => {
    const view = applyEvent(emptyView(), reward(160, [6, 7]))
    expect(view.lastReward).toEqual({ exp: 160, levelUp: true, seq: 1 })
  })

  it('레벨이 안 올랐으면 그 소리는 안 난다', () => {
    expect(applyEvent(emptyView(), reward(12)).lastReward)
      .toEqual({ exp: 12, levelUp: false, seq: 1 })
  })

  it('같은 점수가 이어서 와도 번호가 오른다', () => {
    // 파티 여섯이 같은 몫을 받는 자리다 — 번호가 없으면 뒤 다섯이 조용하다
    let view = emptyView()
    for (let i = 0; i < 6; i += 1) view = applyEvent(view, reward(40))
    expect(view.lastReward).toEqual({ exp: 40, levelUp: false, seq: 6 })
  })

  it('0점은 값이 남되 소리 쪽이 거른다', () => {
    // 레벨 100은 한 점도 못 받는다. 그래도 사건이 오면 번호는 오른다 —
    // 「소리를 낼 것인가」는 `BattleSound`가 `exp > 0`으로 가른다
    expect(applyEvent(emptyView(), reward(0, [])).lastReward)
      .toEqual({ exp: 0, levelUp: false, seq: 1 })
  })
})
