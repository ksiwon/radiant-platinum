// 배틀 진행이 실제로 끝까지 간다.
//
// 여기서 확인하는 것은 "우리가 고를 차례가 정확히 우리가 고를 수 있을 때만 온다"는
// 것이다. 상대가 쓰러져 그쪽만 교체하는 턴처럼 우리 요청이 `wait`인 구간을 컨트롤러가
// 삼키지 못하면, UI에 "아무것도 못 누르는 화면"이 그대로 새어 나온다.
import { describe, it, expect } from 'vitest'
import type { BattleAction } from '../choice'
import { applyEvents, emptyView } from '../view'
import { BattleController } from './controller'
import { rng, spawn } from './fixtures.testkit'

const TURTWIG = 387
const STARLY = 396
const LUXRAY = 405
const RATTATA = 19

/** 파티가 다 쓰러질 때까지 무작위로 두는 한 판 */
async function play(seed: number, playerTeam: number[], foeTeam: number[]) {
  const r = rng(seed)
  const { controller, step } = await BattleController.start({
    player: { name: '빛나', team: playerTeam.map((id, i) => spawn(id, 20 + i * 3, seed * 10 + i)) },
    foe: { name: '야생', team: foeTeam.map((id, i) => spawn(id, 18 + i * 3, seed * 10 + 50 + i)) },
    seed: [seed & 0xffff, (seed * 7) & 0xffff, (seed * 13) & 0xffff, (seed * 29) & 0xffff],
    random: r,
  })

  const all = [...step.events]
  let steps = 0
  /** `actions`가 비었는데 안 끝난 상태 — 컨트롤러가 삼켰어야 할 구간이 샌 것 */
  let stuck = 0
  let sawForceSwitch = 0

  while (!controller.ended && steps < 300) {
    const options: BattleAction[] = controller.actions
    if (!options.length) { stuck++; break }
    if (controller.mustSwitch) {
      sawForceSwitch++
      expect(options.every((a) => a.type === 'switch'), '교체만 골라야 하는 턴에 기술이 보인다').toBe(true)
    }
    const next = await controller.choose(options[Math.floor(r() * options.length)]!)
    all.push(...next.events)
    steps++
  }

  const view = controller.state
  controller.destroy()
  return { view, all, steps, stuck, sawForceSwitch }
}

describe('배틀 진행', () => {
  it('야생 한 마리와의 배틀이 승부까지 간다', async () => {
    const { view, steps, stuck } = await play(1, [TURTWIG], [STARLY])
    expect(stuck, '고를 게 없는데 안 끝난 상태로 멈췄다').toBe(0)
    expect(view.ended, '승부가 안 났다').toBe(true)
    expect(view.winner).not.toBeNull()
    expect(steps, '한 수도 안 두고 끝났다').toBeGreaterThan(0)
  }, 30_000)

  it('3대3에서도 안 막힌다 — 쓰러진 뒤 교체가 강제된다', async () => {
    const runs = await Promise.all(
      [2, 3, 4, 5].map((s) => play(s, [TURTWIG, LUXRAY, RATTATA], [STARLY, RATTATA, LUXRAY])),
    )
    for (const r of runs) {
      expect(r.stuck, '고를 게 없는데 안 끝난 상태로 멈췄다').toBe(0)
      expect(r.view.ended).toBe(true)
    }
    // 3대3이면 누군가는 반드시 쓰러지고 강제 교체가 온다. 안 왔다면 위 단언이 공허하다
    expect(runs.reduce((n, r) => n + r.sawForceSwitch, 0)).toBeGreaterThan(0)
  }, 60_000)

  it('걸음마다 돌려준 이벤트만으로 마지막 화면이 그대로 나온다', async () => {
    // 이벤트를 하나라도 흘리면 연출이 본 것과 실제 상태가 달라진다.
    // 걸음들이 돌려준 이벤트만 모아 처음부터 다시 접어서 같은 화면이 나오는지 본다
    const { view, all } = await play(6, [TURTWIG, LUXRAY], [STARLY, RATTATA])
    // 뷰에 안 남는 사건(기술 사용·기절)은 다시 접어도 티가 안 난다. 연출은 그걸로
    // 사는 것들이라 종류별로 살아 있는지 따로 본다
    const kinds = new Set(all.map((e) => e.kind))
    for (const kind of ['switch', 'move', 'damage', 'faint', 'turn', 'win']) {
      expect(kinds.has(kind as never), `${kind} 이벤트가 사라졌다`).toBe(true)
    }
    const rebuilt = applyEvents(emptyView(), all)
    expect(rebuilt.active.p1).toEqual(view.active.p1)
    expect(rebuilt.active.p2).toEqual(view.active.p2)
    expect(rebuilt.turn).toBe(view.turn)
    expect(rebuilt.winner).toBe(view.winner)
    expect(rebuilt.ended).toBe(view.ended)
  }, 30_000)

  it('같은 씨앗이면 같은 배틀이 나온다', async () => {
    const a = await play(7, [TURTWIG, LUXRAY], [STARLY, RATTATA])
    const b = await play(7, [TURTWIG, LUXRAY], [STARLY, RATTATA])
    expect(a.steps).toBe(b.steps)
    expect(a.view.winner).toBe(b.view.winner)
    expect(a.all.map((e) => e.kind).join()).toBe(b.all.map((e) => e.kind).join())
  }, 30_000)

  it('끝난 뒤에 더 고르면 아무 일도 안 일어난다', async () => {
    const { controller } = await BattleController.start({
      player: { name: '빛나', team: [spawn(TURTWIG, 60, 80)] },
      foe: { name: '야생', team: [spawn(STARLY, 2, 81)] },
      seed: [9, 9, 9, 9],
      random: rng(9),
    })
    let guard = 0
    while (!controller.ended && guard++ < 50) {
      const options = controller.actions
      if (!options.length) break
      await controller.choose(options[0]!)
    }
    expect(controller.ended).toBe(true)
    // 연출이 끝나기 전에 입력이 한 번 더 들어올 수 있다. 터지면 안 된다
    const after = await controller.choose({ type: 'move', slot: 1, id: 'tackle', name: 'Tackle' })
    expect(after.events).toHaveLength(0)
    expect(controller.actions).toHaveLength(0)
    controller.destroy()
  }, 30_000)
})
