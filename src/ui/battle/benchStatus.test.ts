// 공 줄이 벤치 마리의 상태 이상을 잊지 않는다 (`PartyGaugeData_Fill`의 `STOCK_STATUS`).
import { afterEach, describe, expect, it } from 'vitest'
import type { PartySlot } from '../../engine/battle/choice'
import type { Actor, BattleEvent } from '../../engine/battle/events'
import { applyEvents, emptyView } from '../../engine/battle/view'
import { useBattleStore } from '../../state/battleStore'
import { benchStatusOf, foldBenchStatus } from './benchStatus'

const foeA: Actor = { slot: 'p2a', side: 'p2', name: 'p2-0' }
const foeB: Actor = { slot: 'p2a', side: 'p2', name: 'p2-1' }

const send = (actor: Actor, status: 'ok' | 'psn' = 'ok'): BattleEvent => ({
  kind: 'switch', actor, species: 74, speciesName: 'Geodude', level: 10, gender: 'male', shiny: false,
  condition: { hp: 30, maxHp: 30, status }, forced: false,
})

const slot = (key: string, status: string | null, active = false): PartySlot => ({
  index: 1, key, hp: 20, maxHp: 20, status, active, fainted: false, ability: '', moves: [],
})

afterEach(() => { useBattleStore.setState({ phase: 'off', view: null, party: [] }) })

describe('물러난 마리의 상태를 남긴다', () => {
  it('독에 걸린 채 교체해 나간 상대가 공 줄에서 초록으로 돌아가지 않는다', () => {
    let view = applyEvents(emptyView(), [send(foeA)])
    let map = foldBenchStatus(new Map(), view, [])
    view = applyEvents(view, [{ kind: 'status', actor: foeA, status: 'psn' }])
    map = foldBenchStatus(map, view, [])
    view = applyEvents(view, [send(foeB)])
    map = foldBenchStatus(map, view, [])
    expect(map.get('p2-0')).toBe('psn')
    expect(map.has('p2-1')).toBe(false)
  })

  it('나은 것도 따라간다 — 다시 나와 나으면 지운다', () => {
    let view = applyEvents(emptyView(), [send(foeA, 'psn')])
    let map = foldBenchStatus(new Map(), view, [])
    expect(map.get('p2-0')).toBe('psn')
    view = applyEvents(view, [{ kind: 'curestatus', actor: foeA, status: 'psn' }])
    map = foldBenchStatus(map, view, [])
    expect(map.has('p2-0')).toBe(false)
  })

  it('우리 벤치는 파티 요약이 말한다 — 처음부터 벤치에 있던 독 마리', () => {
    const map = foldBenchStatus(new Map(), null, [slot('p1-0', null, true), slot('p1-1', 'psn')])
    expect(map.get('p1-1')).toBe('psn')
    // 서 있는 마리는 요약이 아니라 뷰가 정한다
    expect(map.has('p1-0')).toBe(false)
  })

  it('바뀐 것이 없으면 같은 지도다', () => {
    const map = foldBenchStatus(new Map(), null, [slot('p1-1', 'psn')])
    expect(foldBenchStatus(map, null, [slot('p1-1', 'psn')])).toBe(map)
  })
})

describe('스토어를 따라간다', () => {
  it('판이 도는 동안 모으고, 끝나면 비운다', () => {
    let view = applyEvents(emptyView(), [send(foeA, 'psn')])
    useBattleStore.setState({ phase: 'running', view })
    view = applyEvents(view, [send(foeB)])
    useBattleStore.setState({ view })
    expect(benchStatusOf('p2-0')).toBe('psn')
    useBattleStore.setState({ phase: 'off', view: null })
    expect(benchStatusOf('p2-0')).toBeNull()
  })
})
