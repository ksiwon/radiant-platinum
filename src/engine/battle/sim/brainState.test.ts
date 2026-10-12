// 브레인이 사건에서 모으는 EXPERT 상태 (PLAN §7.7.9) — 재활용할 도구 · 록온을 당한 표지
import { describe, expect, it } from 'vitest'
import type { AiTurn } from '../ai/context'
import type { Actor, BattleEvent, EffectRef, ItemRef } from '../events'
import { movesById, spawn } from './fixtures.testkit'
import { TrainerBrain } from './brain'

const actor = (name: string, side: 'p1' | 'p2'): Actor =>
  ({ name, side, slot: `${side}a`, species: '', level: 50 }) as unknown as Actor
const item = (num: number): ItemRef => ({ id: 'x', num, name: 'x' })
const effect = (id: string): EffectRef => ({ id, kind: 'move', num: null, name: id })
const extras = { num: null, move: null, moveName: null }

function brain() {
  const mine = [spawn(399, 50, 1, 'me')]
  const foes = [spawn(399, 50, 2, 'foe')]
  const b = new TrainerBrain({
    flags: 4, moves: { byId: movesById }, random: () => 0.5, side: 'p2', team: mine, foeTeam: foes,
  })
  type Extras = Pick<AiTurn, 'recycleItem' | 'lockedOnto'>
  const read = (): Extras => (b as unknown as {
    extras: (...a: unknown[]) => Extras
  }).extras({}, {}, 0, {}, {}, 'foe', { key: 'me' }, [], ['me'])
  return { b, read }
}

describe('재활용 · 록온', () => {
  it('먹은 열매는 기억하고, 빼앗긴 도구는 기억하지 않고, 재활용이 비운다', () => {
    const { b, read } = brain()
    const me = actor('me', 'p2')
    expect(read().recycleItem).toBe(0)
    const eaten = { kind: 'enditem', actor: me, item: item(157), from: null, of: null, how: 'eat', silent: false } as BattleEvent
    b.observe([eaten])
    expect(read().recycleItem).toBe(157)
    const stolen = { ...eaten, item: item(150), how: null, of: actor('foe', 'p1') } as BattleEvent
    b.observe([stolen])
    expect(read().recycleItem).toBe(157)
    b.observe([{ kind: 'item', actor: me, item: item(157), from: { kind: 'move', id: 278, name: 'Recycle' }, of: null } as BattleEvent])
    expect(read().recycleItem).toBe(0)
  })

  it('록온을 걸린 쪽에 표지가 서고, 건 쪽이 움직이면 풀린다', () => {
    const { b, read } = brain()
    const foe = actor('foe', 'p1')
    b.observe([{ kind: 'activate', actor: foe, effect: effect('lockon'), of: actor('me', 'p2'), extra: extras } as BattleEvent])
    expect(read().lockedOnto).toBe(true)
    b.observe([{ kind: 'move', actor: foe, move: 33 } as BattleEvent])
    expect(read().lockedOnto).toBe(false)
  })
})
