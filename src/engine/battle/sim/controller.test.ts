// 배틀 진행이 실제로 끝까지 간다.
//
// 여기서 확인하는 것은 "우리가 고를 차례가 정확히 우리가 고를 수 있을 때만 온다"는
// 것이다. 상대가 쓰러져 그쪽만 교체하는 턴처럼 우리 요청이 `wait`인 구간을 컨트롤러가
// 삼키지 못하면, UI에 "아무것도 못 누르는 화면"이 그대로 새어 나온다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import type { BattleAction } from '../choice'
import type { BattleEvent } from '../events'
import { applyEvents, emptyView } from '../view'
import { buildBeats } from '../playback'
import { Ball } from '../meta/capture'
import { embargoBlocks } from '../meta/bagItem'
import { TrainerItems } from '../meta/trainerItems'
import type { Item } from '../../../data/schema'
import { BattleController } from './controller'
import { movesById, rng, spawn } from './fixtures.testkit'

const TURTWIG = 387
const STARLY = 396
const LUXRAY = 405
const RATTATA = 19
const BLISSEY = 242
const ARCEUS = 493
/** 빈 턴 칸이 쓰는 물장구의 롬 번호 */
const SPLASH = 150

const itemList = (JSON.parse(readFileSync(
  resolve(__dirname, '../../../../public/data/items.json'), 'utf8')) as { items: Item[] }).items
const itemTable = { get: (id: number) => itemList[id]! }
const FULL_RESTORE = itemList.findIndex((i) => i.name === 'full_restore')

/** 파티가 다 쓰러질 때까지 무작위로 두는 한 판 */
async function play(seed: number, playerTeam: number[], foeTeam: number[]) {
  const r = rng(seed)
  const { controller, step } = await BattleController.start({
    player: {
      name: '빛나',
      team: playerTeam.map((id, i) => spawn(id, 20 + i * 3, seed * 10 + i, `p1-${i}`)),
    },
    foe: {
      name: '야생',
      team: foeTeam.map((id, i) => spawn(id, 18 + i * 3, seed * 10 + 50 + i, `p2-${i}`)),
    },
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
  const results = controller.results('p1')
  controller.destroy()
  return { view, all, steps, stuck, sawForceSwitch, results }
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

  it('끝난 뒤 파티 상태를 키로 전부 돌려준다', async () => {
    // 세이브에 HP를 되돌리려면 벤치에 있던 애들 것까지 알아야 한다. 프로토콜에는
    // 그게 안 나오므로 sim 배틀 객체를 직접 읽는데, 그 배열은 **팀 순서가 아니다**
    const { results, view } = await play(8, [TURTWIG, LUXRAY, RATTATA], [STARLY, RATTATA])
    expect(results.map((r) => r.key).sort()).toEqual(['p1-0', 'p1-1', 'p1-2'])
    for (const r of results) {
      expect(r.hp, `${r.key} HP 범위`).toBeGreaterThanOrEqual(0)
      expect(r.hp).toBeLessThanOrEqual(r.maxHp)
      expect(r.fainted).toBe(r.hp === 0)
    }
    // 나와 있던 애의 HP는 프로토콜로 접은 화면과 같아야 한다 — 서로 모르는 두 출처다
    const active = view.active.p1!
    const same = results.find((r) => r.key === active.key)
    expect(same, `${active.key}가 결과에 없다`).toBeDefined()
    expect(same!.hp).toBe(active.hp)
    expect(same!.maxHp).toBe(active.maxHp)
    expect(same!.status).toBe(active.status)
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
    const after = await controller.choose({ type: 'move', slot: 1, id: 'tackle', name: 'Tackle', move: 33 })
    expect(after.events).toHaveLength(0)
    expect(controller.actions).toHaveLength(0)
    controller.destroy()
  }, 30_000)
})

describe('볼과 도망', () => {
  /** 잡거나 도망칠 판 하나. 야생은 한 마리다 */
  const wild = (seed: number, foeLevel = 3) => BattleController.start({
    player: { name: '빛나', team: [spawn(TURTWIG, 30, seed, 'p1-0')] },
    foe: { name: '야생', team: [spawn(STARLY, foeLevel, seed + 1, 'p2-0')] },
    seed: [seed & 0xffff, (seed * 7) & 0xffff, (seed * 13) & 0xffff, (seed * 29) & 0xffff],
    random: rng(seed),
  })

  const catchCtx = { caughtBefore: false, inWater: false, darkness: false }

  it('마스터볼은 반드시 잡고 그 자리에서 끝난다', async () => {
    const { controller } = await wild(101)
    const step = await controller.throwBall(Ball.MASTER, catchCtx)
    const ball = step.events.find((e) => e.kind === 'ball')
    expect(ball, '볼 이벤트가 없다').toBeDefined()
    expect(ball!.kind === 'ball' && ball!.caught).toBe(true)
    expect(controller.finish).toBe('caught')
    expect(controller.ended).toBe(true)
    expect(controller.captured?.key).toBe('p2-0')
    controller.destroy()
  }, 30_000)

  it('볼을 던져 놓치면 야생이 반격한다 — 우리 턴이 사라진다', async () => {
    // sim에는 "이번 턴 아무것도 안 함"이 없다. 숨긴 기술 칸으로 턴을 비우는데,
    // 그게 안 되면 볼이 공짜가 되어 원작과 다른 게임이 된다
    const { controller } = await wild(102, 30)
    const before = controller.state.turn
    const step = await controller.throwBall(Ball.POKE, catchCtx)

    const ball = step.events.find((e) => e.kind === 'ball')
    expect(ball!.kind === 'ball' && ball!.caught, '이 씨앗에서는 잡히면 안 된다').toBe(false)
    // 턴이 넘어갔다는 것이 곧 야생이 행동했다는 뜻이다
    expect(controller.state.turn).toBe(before + 1)
    expect(step.events.some((e) => e.kind === 'move' && e.actor.side === 'p2'),
      '야생이 아무것도 안 했다').toBe(true)
    controller.destroy()
  }, 30_000)

  it('숨긴 칸은 기술 목록에 안 보인다', async () => {
    // 보이면 플레이어가 "아무것도 안 하기"를 직접 고를 수 있게 된다
    const { controller } = await wild(103)
    const moves = controller.actions.filter((a) => a.type === 'move')
    expect(moves.length, '기술이 하나도 없다').toBeGreaterThan(0)
    expect(moves.some((m) => m.id === 'splash'), 'Splash가 노출됐다').toBe(false)
    controller.destroy()
  }, 30_000)

  it('30레벨이 3레벨한테서 도망치는 것은 언제나 성공한다', async () => {
    const { controller } = await wild(104)
    const step = await controller.run()
    expect(step.events.some((e) => e.kind === 'escape' && e.success)).toBe(true)
    expect(controller.finish).toBe('fled')
    expect(controller.ended).toBe(true)
    controller.destroy()
  }, 30_000)

  it('끝난 뒤에 볼을 더 던져도 아무 일도 안 일어난다', async () => {
    const { controller } = await wild(105)
    await controller.throwBall(Ball.MASTER, catchCtx)
    const again = await controller.throwBall(Ball.MASTER, catchCtx)
    expect(again.events).toHaveLength(0)
    const fled = await controller.run()
    expect(fled.events).toHaveLength(0)
    controller.destroy()
  }, 30_000)
})

describe('시합규칙 「교체」', () => {
  /** 상대가 둘, 우리도 둘. 첫 마리를 쓰러뜨리면 물어볼 자리가 생긴다 */
  const two = (shift: boolean) => BattleController.start({
    player: {
      name: '빛나',
      team: [spawn(LUXRAY, 60, 201, 'p1-0'), spawn(TURTWIG, 60, 202, 'p1-1')],
    },
    foe: { name: '상대', team: [spawn(STARLY, 5, 203, 'p2-0'), spawn(RATTATA, 5, 204, 'p2-1')] },
    seed: [21, 22, 23, 24],
    random: rng(21),
    ai: { flags: 7, moves: { byId: movesById } },
    ...(shift ? { shift: true } : {}),
  })

  /** 쓰러질 때까지 가장 센 것으로 때린다. 물어보는 자리에서 멈춘다 */
  async function hitUntilAsked(controller: BattleController) {
    const all: BattleEvent[] = []
    for (let i = 0; i < 20 && !controller.ended && controller.shiftAsk === null; i++) {
      const moves = controller.actions.filter((a) => a.type === 'move')
      if (!moves.length) break
      const best = [...moves].sort((a, b) =>
        (movesById.get(b.move ?? 0)?.power ?? 0) - (movesById.get(a.move ?? 0)?.power ?? 0))[0]!
      all.push(...(await controller.choose(best)).events)
    }
    return all
  }

  it('상대가 다음 마리를 내보내기 전에 묻는다', async () => {
    const { controller } = await two(true)
    const all = await hitUntilAsked(controller)
    expect(controller.shiftAsk, '안 물어봤다').toBe('p2-1')

    // 물어보는 시점에는 **아직 새 마리가 안 나와 있어야** 한다. 나온 뒤에 묻는
    // 것은 원작과 순서가 반대고, 무엇을 보고 고르는지가 달라진다
    expect(all.some((e) => e.kind === 'switch' && e.actor.name === 'p2-1'),
      '묻기 전에 이미 나왔다').toBe(false)
    expect(all.some((e) => e.kind === 'shift'), '물음 사건이 안 왔다').toBe(true)
    controller.destroy()
  }, 30_000)

  it('바꾸겠다고 하면 턴을 안 쓰고 바뀐다', async () => {
    const { controller } = await two(true)
    await hitUntilAsked(controller)
    const before = controller.state.turn

    const answered = await controller.answerShift(true)
    // 답한 다음에 오는 것은 "누구를 내보낼까"다 — 강제 교체와 같은 목록이다
    const options = controller.actions
    expect(options.length, '고를 게 안 왔다').toBeGreaterThan(0)
    expect(options.every((a) => a.type === 'switch'), '교체 말고 다른 게 보인다').toBe(true)

    const step = await controller.choose(options[0]!)
    const between = [...answered.events, ...step.events]
    // **공짜라는 것이 이 단언이다.** 두 교체 사이에 상대가 기술을 쓰면 턴을 쓴 것이다
    expect(between.some((e) => e.kind === 'move'), '교체 사이에 기술이 나갔다').toBe(false)
    expect(between.filter((e) => e.kind === 'switch').map((e) => e.actor.name).sort())
      .toEqual(['p1-1', 'p2-1'])
    expect(controller.state.turn, '턴이 두 번 넘어갔다').toBe(before + 1)
    expect(controller.state.active.p1?.key).toBe('p1-1')
    controller.destroy()
  }, 30_000)

  it('안 바꾸겠다고 하면 그대로 잇는다', async () => {
    const { controller } = await two(true)
    await hitUntilAsked(controller)
    const step = await controller.answerShift(false)
    expect(controller.shiftAsk).toBeNull()
    expect(step.events.some((e) => e.kind === 'switch' && e.actor.name === 'p2-1'),
      '상대가 안 나왔다').toBe(true)
    expect(controller.state.active.p1?.key, '우리 쪽이 바뀌었다').toBe('p1-0')
    controller.destroy()
  }, 30_000)

  it('「토너먼트」면 안 묻는다', async () => {
    const { controller } = await two(false)
    const all = await hitUntilAsked(controller)
    expect(controller.shiftAsk).toBeNull()
    expect(all.some((e) => e.kind === 'shift')).toBe(false)
    expect(all.some((e) => e.kind === 'switch' && e.actor.name === 'p2-1'),
      '다음 마리가 안 나왔다').toBe(true)
    controller.destroy()
  }, 30_000)
})

describe('트레이너의 도구', () => {
  it('체력이 ¼ 아래로 떨어지면 회복약을 쓰고, 그 턴에는 기술을 안 쓴다', async () => {
    // 해피너스(HP 651)를 제일 약한 기술로 천천히 깎는다. 세게 때리면 ¼ 아래로
    // 내려가기 전에 쓰러져서 도구를 쓸 자리가 아예 안 생긴다
    const { controller } = await BattleController.start({
      player: { name: '빛나', team: [spawn(ARCEUS, 100, 301, 'p1-0')] },
      foe: { name: '상대', team: [spawn(BLISSEY, 100, 302, 'p2-0')] },
      seed: [1, 2, 3, 4],
      random: rng(7),
      ai: { flags: 7, moves: { byId: movesById } },
      items: {
        bag: new TrainerItems([FULL_RESTORE, FULL_RESTORE], itemTable),
        item: (id) => itemTable.get(id),
      },
    })

    const all: BattleEvent[] = []
    for (let i = 0; i < 40 && !controller.ended; i++) {
      const moves = controller.actions.filter((a) => a.type === 'move')
      if (!moves.length) break
      const hurts = moves.filter((a) => (movesById.get(a.move ?? 0)?.power ?? 0) > 0)
      const weakest = [...(hurts.length ? hurts : moves)].sort((a, b) =>
        (movesById.get(a.move ?? 0)?.power ?? 0) - (movesById.get(b.move ?? 0)?.power ?? 0))[0]!
      all.push(...(await controller.choose(weakest)).events)
    }

    const at = all.findIndex((e) => e.kind === 'trainerItem')
    expect(at, '도구를 한 번도 안 썼다').toBeGreaterThanOrEqual(0)
    const used = all[at]!
    expect(used.kind === 'trainerItem' && used.item).toBe(FULL_RESTORE)

    // 실제로 차야 한다. 사건만 뜨고 체력이 그대로면 아무 일도 안 한 것이다
    const healed = all.slice(at).find((e) => e.kind === 'heal' && e.actor.side === 'p2')
    expect(healed, '회복 사건이 안 왔다').toBeDefined()

    // 도구를 쓴 턴에는 기술이 안 나가야 한다 — 원작도 도구가 그 턴을 쓴다.
    // 물장구가 새어 나오면 화면에 "해피너스의 물장구!"가 뜬다
    const nextTurn = all.findIndex((e, i) => i > at && e.kind === 'turn')
    const sameTurn = all.slice(at, nextTurn < 0 ? all.length : nextTurn)
    expect(sameTurn.some((e) => e.kind === 'move' && e.actor.side === 'p2'),
      '도구를 쓰고도 기술을 썼다').toBe(false)
    // 빈 턴 칸이 로그에 새어 나오면 안 된다 — "해피너스의 물장구!"가 뜬다
    expect(all.some((e) => e.kind === 'move' && e.move === SPLASH), '물장구가 보인다').toBe(false)
    controller.destroy()
  }, 60_000)

  it('AI는 빈 턴 칸을 안 고른다', async () => {
    // 상대에게도 물장구 칸이 붙어 있다. AI가 그걸 고르면 그냥 한 턴을 버린다
    const { controller } = await BattleController.start({
      player: { name: '빛나', team: [spawn(TURTWIG, 30, 311, 'p1-0')] },
      foe: { name: '상대', team: [spawn(LUXRAY, 30, 312, 'p2-0')] },
      seed: [5, 6, 7, 8],
      random: rng(11),
      ai: { flags: 7, moves: { byId: movesById } },
      items: { bag: new TrainerItems([], itemTable), item: (id) => itemTable.get(id) },
    })
    const all: BattleEvent[] = []
    for (let i = 0; i < 12 && !controller.ended; i++) {
      const moves = controller.actions.filter((a) => a.type === 'move')
      if (!moves.length) break
      all.push(...(await controller.choose(moves[0]!)).events)
    }
    const theirs = all.filter((e) => e.kind === 'move' && e.actor.side === 'p2')
    expect(theirs.length, '상대가 한 번도 안 움직였다').toBeGreaterThan(0)
    expect(theirs.some((e) => e.kind === 'move' && e.move === SPLASH), 'AI가 물장구를 골랐다')
      .toBe(false)
    controller.destroy()
  }, 30_000)
})

describe('화면이 정본을 따라잡는다', () => {
  /**
   * 재생기가 하는 그대로 한다 (`ui/battle/useBattlePlayback`).
   *
   * ⚠️ **박자 목록을 통째로 한 번 훑는 것이 아니다.** 사건이 붙을 때마다
   * `buildBeats`를 **처음부터** 다시 부르고, 이미 튼 번호 뒤부터 이어서 튼다.
   * 그 재생기와 똑같이 굴려야 앞부분이 흔들리는 것을 여기서 잡는다
   */
  class Screen {
    view = emptyView()
    private at = 0

    play(events: readonly BattleEvent[]): void {
      const beats = buildBeats(events, () => null)
      for (; this.at < beats.length; this.at++) {
        this.view = applyEvents(this.view, beats[this.at]!.events)
      }
    }
  }

  it('내가 교체하면 화면의 마리도 바뀐다', async () => {
    // ⚠️ **실제로 안 바뀌던 자리다.** 기술 목록은 `actions`에서 바로 오니까
    // 렌트라 것으로 바뀌는데, 이름표와 3D 모델은 이 뷰를 보므로 토대부기가
    // 계속 서 있었다 (`playback`의 머리말)
    const { controller, step } = await BattleController.start({
      player: {
        name: '빛나',
        team: [spawn(TURTWIG, 55, 401, 'p1-0'), spawn(LUXRAY, 54, 402, 'p1-1')],
      },
      foe: { name: '상대', team: [spawn(STARLY, 20, 403, 'p2-0')] },
      seed: [1, 2, 3, 4],
      random: rng(21),
    })
    const all = [...step.events]
    const screen = new Screen()
    screen.play(all)
    expect(screen.view.active.p1?.key, '첫 마리가 안 섰다').toBe('p1-0')

    const swap = controller.actions.find((a) => a.type === 'switch')
    expect(swap, '교체할 수 있는 마리가 없다').toBeDefined()
    all.push(...(await controller.choose(swap!)).events)
    screen.play(all)

    expect(screen.view.active.p1?.key, '화면이 아직 앞 마리를 들고 있다').toBe('p1-1')
    expect(screen.view.active.p1?.species, '화면의 종이 안 바뀌었다').toBe(LUXRAY)
    // 정본과 어긋나면 안 된다. 모델·이름표·체력바가 전부 이 뷰를 본다
    expect(screen.view.active.p1?.species).toBe(controller.state.active.p1?.species)
    controller.destroy()
  }, 30_000)

  it('한 판을 끝까지 틀어도 화면이 정본과 안 어긋난다', async () => {
    const r = rng(22)
    const { controller, step } = await BattleController.start({
      player: {
        name: '빛나',
        team: [spawn(TURTWIG, 30, 411, 'p1-0'), spawn(LUXRAY, 30, 412, 'p1-1')],
      },
      foe: {
        name: '상대',
        team: [spawn(STARLY, 28, 413, 'p2-0'), spawn(RATTATA, 28, 414, 'p2-1')],
      },
      seed: [9, 8, 7, 6],
      random: r,
    })
    const all = [...step.events]
    const screen = new Screen()
    screen.play(all)

    for (let i = 0; i < 60 && !controller.ended; i++) {
      const options = controller.actions
      if (!options.length) break
      all.push(...(await controller.choose(options[Math.floor(r() * options.length)]!)).events)
      screen.play(all)
      // 재생이 끝난 자리에서는 화면이 정본과 같은 마리를 들고 있어야 한다
      expect(screen.view.active.p1?.key, `${i}번째 수에서 우리 쪽이 어긋났다`)
        .toBe(controller.state.active.p1?.key)
      expect(screen.view.active.p2?.key, `${i}번째 수에서 상대 쪽이 어긋났다`)
        .toBe(controller.state.active.p2?.key)
    }
    controller.destroy()
  }, 60_000)
})

describe('우리 가방에서 도구를 쓴다', () => {
  const POTION = itemList.findIndex((i) => i.name === 'potion')
  const REVIVE = itemList.findIndex((i) => i.name === 'revive')
  const X_ATTACK = itemList.findIndex((i) => i.name === 'x_attack')
  const bag = (id: number) => ({ id, data: itemTable.get(id) })

  /** 우리 쪽 누군가가 깎일 때까지 굴린다. 상처약을 쓰려면 깎여 있어야 한다 */
  async function hurt(seed: number, team: number[]) {
    const r = rng(seed)
    const { controller } = await BattleController.start({
      player: { name: '빛나', team: team.map((id, i) => spawn(id, 30, seed * 10 + i, `p1-${i}`)) },
      foe: { name: '상대', team: [spawn(LUXRAY, 40, seed * 10 + 90, 'p2-0')] },
      seed: [seed & 0xffff, 2, 3, 4],
      random: r,
    })
    for (let i = 0; i < 30; i++) {
      const mine = controller.results('p1')
      if (mine.some((one) => !one.fainted && one.hp < one.maxHp)) return controller
      const options = controller.actions
      if (!options.length) break
      await controller.choose(options[0]!)
    }
    throw new Error('서른 턴을 둬도 우리 쪽이 안 깎였다')
  }

  it('상처약을 쓰면 나와 있는 마리의 체력이 실제로 찬다', async () => {
    const controller = await hurt(7, [TURTWIG])
    const before = controller.results('p1')[0]!
    const step = await controller.useBagItem(bag(POTION), 'p1-0')

    expect(step.events.some((e) => e.kind === 'bagItem' && e.item === POTION),
      '도구를 썼다는 사건이 없다').toBe(true)
    // 사건만 뜨고 숫자가 그대로면 아무 일도 안 한 것이다
    const after = controller.results('p1').find((one) => one.key === 'p1-0')!
    const want = Math.min(before.maxHp, before.hp + (itemTable.get(POTION).param?.hpRestored ?? 0))
    // 도구를 쓴 뒤 상대가 반격하므로 그만큼 다시 깎일 수 있다. 회복 사건으로 잰다
    const healed = step.events.find((e) => e.kind === 'heal' && e.actor.side === 'p1')
    expect(healed, '회복 사건이 안 왔다').toBeDefined()
    if (healed?.kind === 'heal') expect(healed.condition.hp).toBe(want)
    expect(after.hp).toBeGreaterThan(0)
    controller.destroy()
  }, 60_000)

  it('도구를 쓴 턴에는 기술이 안 나간다 — 도구가 그 턴을 쓴다', async () => {
    const controller = await hurt(11, [TURTWIG])
    const step = await controller.useBagItem(bag(POTION), 'p1-0')
    expect(step.events.some((e) => e.kind === 'move' && e.actor.side === 'p1'),
      '도구를 쓰고도 우리가 기술을 썼다').toBe(false)
    // 빈 턴 칸이 로그에 새어 나오면 "모부기의 물장구!"가 뜬다
    expect(step.events.some((e) => e.kind === 'move' && e.move === SPLASH)).toBe(false)
    // 상대는 반격한다. 도구가 공짜면 원작과 다른 게임이 된다
    expect(step.events.some((e) => e.kind === 'move' && e.actor.side === 'p2')).toBe(true)
    controller.destroy()
  }, 60_000)

  it('벤치에 있는 마리도 먹일 수 있다 — 그런데 화면의 게이지는 안 움직인다', async () => {
    // 벤치의 `-heal`을 프로토콜로 흘리면 뷰가 **자리로** 접기 때문에 나와 있는
    // 마리의 게이지가 움직인다. 원본도 배틀 개체 사본은 안 건드린다
    // (`selectedSlot == partySlot`일 때만 같이 고친다)
    // ⚠️ 씨앗 13은 모부기가 **깎이는 게 아니라 쓰러진다** — 그러면 벤치로
    // 보낼 것이 없어 시나리오가 아예 안 선다. 실측으로 서는 씨앗을 골랐다
    const controller = await hurt(14, [TURTWIG, BLISSEY])
    // 깎인 애를 벤치로 보낸다. 해피너스는 두꺼워서 그동안 안 쓰러진다
    let bench: string | undefined
    for (let i = 0; i < 10; i++) {
      const here = controller.state.active.p1?.key
      bench = controller.results('p1').find(
        (one) => one.key !== here && !one.fainted && one.hp < one.maxHp)?.key
      if (bench !== undefined) break
      const swap = controller.actions.find((a) => a.type === 'switch')
      if (!swap) break
      await controller.choose(swap)
    }
    expect(bench, '벤치에 깎인 마리가 안 생겼다').toBeDefined()

    const before = controller.results('p1').find((one) => one.key === bench)!
    const step = await controller.useBagItem(bag(POTION), bench!)
    const after = controller.results('p1').find((one) => one.key === bench)!
    expect(after.hp, '벤치의 체력이 안 찼다').toBeGreaterThan(before.hp)
    expect(step.events.some((e) => e.kind === 'heal' && e.actor.side === 'p1'),
      '벤치를 먹였는데 화면 게이지가 움직였다').toBe(false)
    controller.destroy()
  }, 60_000)

  it('기력의조각을 쓰면 남은 마리를 다시 센다 — 안 그러면 그 자리에서 진다', async () => {
    // ⚠️ **`side.pokemonLeft`가 이 시험의 전부다.** sim은 쓰러질 때 그 칸을 하나
    // 줄이고, 0이 되면 그쪽이 진 것으로 본다. 되살리면서 안 되돌리면 **되살린
    // 마리가 멀쩡히 서 있는데도** 다음 한 마리가 쓰러지는 순간 배틀이 끝난다
    const { controller } = await BattleController.start({
      player: {
        name: '빛나',
        team: [spawn(STARLY, 5, 210, 'p1-0'), spawn(RATTATA, 5, 211, 'p1-1')],
      },
      foe: { name: '상대', team: [spawn(ARCEUS, 60, 212, 'p2-0')] },
      seed: [9, 9, 9, 9],
      random: rng(21),
    })
    // 찌르꼬가 먼저 쓰러진다. 쓰러진 직후는 강제 교체라 원작도 가방을 안 열어 준다
    for (let i = 0; i < 6 && !controller.mustSwitch; i++) {
      const options = controller.actions
      if (!options.length) break
      await controller.choose(options[0]!)
    }
    expect(controller.results('p1').find((one) => one.key === 'p1-0')?.fainted,
      '찌르꼬가 안 쓰러졌다').toBe(true)
    await controller.choose(controller.actions.find(
      (a) => a.type === 'switch' && a.key === 'p1-1')!)
    expect(controller.ended).toBe(false)

    // 되살린다. 절반까지 찬다 — 254는 개수가 아니라 "절반"이라는 표지다
    await controller.useBagItem(bag(REVIVE), 'p1-0')
    const back = controller.results('p1').find((one) => one.key === 'p1-0')!
    expect(back.fainted, '되살아나지 않았다').toBe(false)
    expect(back.hp).toBe(Math.max(1, Math.floor(back.maxHp / 2)))

    // 도구를 쓴 턴에 아르세우스가 코리를 눕힌다. 그래도 배틀은 안 끝나야 한다
    expect(controller.results('p1').find((one) => one.key === 'p1-1')?.fainted,
      '코리가 안 쓰러졌다 — 이 판으로는 검증이 안 된다').toBe(true)
    expect(controller.ended, '되살렸는데 그 자리에서 졌다').toBe(false)
    expect(controller.actions.some((a) => a.type === 'switch' && a.key === 'p1-0'),
      '되살렸는데 내보낼 수가 없다').toBe(true)
    controller.destroy()
  }, 60_000)

  it('플러스파워는 나와 있는 마리에게만 걸리고 랭크 사건이 뜬다', async () => {
    const controller = await hurt(17, [TURTWIG, STARLY])
    const step = await controller.useBagItem(bag(X_ATTACK), 'p1-0')
    const boosted = step.events.find((e) => e.kind === 'boost' && e.actor.side === 'p1')
    expect(boosted, '랭크 사건이 안 왔다').toBeDefined()
    if (boosted?.kind === 'boost') expect(boosted).toMatchObject({ stat: 'atk', amount: 1 })
    // 벤치에는 랭크 칸이 없다 — 계획 자체가 안 선다
    expect(controller.planFor(itemTable.get(X_ATTACK), 'p1-1')).toBeNull()
    controller.destroy()
  }, 60_000)

  it('아무 일도 안 일어날 도구는 턴을 안 쓴다', async () => {
    const r = rng(23)
    const { controller } = await BattleController.start({
      player: { name: '빛나', team: [spawn(TURTWIG, 30, 230, 'p1-0')] },
      foe: { name: '상대', team: [spawn(RATTATA, 5, 231, 'p2-0')] },
      seed: [3, 3, 3, 3],
      random: r,
    })
    // 멀쩡한 애에게 상처약. 원작도 "효과가 없을 것 같다"를 띄우고 되돌린다
    expect(controller.planFor(itemTable.get(POTION), 'p1-0')).toBeNull()
    const turn = controller.state.turn
    const step = await controller.useBagItem(bag(POTION), 'p1-0')
    expect(step.events).toHaveLength(0)
    expect(controller.state.turn, '턴이 지나가 버렸다').toBe(turn)
    controller.destroy()
  }, 60_000)
})

describe('「금제」가 걸리면 가방이 안 열린다', () => {
  const POTION = itemList.findIndex((i) => i.name === 'potion')
  const X_ATTACK = itemList.findIndex((i) => i.name === 'x_attack')
  const GUARD_SPEC = itemList.findIndex((i) => i.name === 'guard_spec')
  const POKE_DOLL = itemList.findIndex((i) => i.name === 'poke_doll')
  /** 금제의 롬 기술 번호 */
  const EMBARGO = 373

  it('상대가 걸면 나와 있는 마리에게 도구를 못 쓴다 — 이펙트가드와 도망 도구만 빠져나간다', async () => {
    // 상대에게 금제 하나만 쥐여 준다. 그러면 첫 턴에 반드시 그것을 쓴다
    const foe = spawn(LUXRAY, 40, 900, 'p2-0')
    foe.mon.moves = [{ move: EMBARGO, pp: 15, ppUps: 0 }]
    const { controller } = await BattleController.start({
      player: { name: '빛나', team: [spawn(TURTWIG, 30, 901, 'p1-0'), spawn(STARLY, 30, 902, 'p1-1')] },
      foe: { name: '상대', team: [foe] },
      seed: [4, 4, 4, 4],
      random: rng(31),
    })

    // 걸리기 전에는 플러스파워가 먹는다 — 안 그러면 아래 단언이 공허하다
    expect(controller.planFor(itemTable.get(X_ATTACK), 'p1-0')).not.toBeNull()
    await controller.choose(controller.actions.find((a) => a.type === 'move')!)
    expect(controller.state.active.p1?.volatiles.has('embargo'), '금제가 안 걸렸다').toBe(true)

    expect(controller.planFor(itemTable.get(X_ATTACK), 'p1-0'), '랭크가 올라갔다').toBeNull()
    expect(controller.planFor(itemTable.get(POTION), 'p1-0'), '회복이 됐다').toBeNull()
    // 이펙트가드는 개체가 아니라 진영에 건다. 원본도 이것만 이름으로 빼 준다
    expect(controller.planFor(itemTable.get(GUARD_SPEC), 'p1-0')?.mist).toBe(true)
    // 벤치는 배틀러가 아니라 애초에 금제가 안 걸린다
    expect(controller.planFor(itemTable.get(X_ATTACK), 'p1-1'), '벤치에 랭크가 붙었다').toBeNull()
    controller.destroy()
  }, 60_000)

  it('금제 중에도 삐삐인형으로는 도망친다', () => {
    // 판정이 아니라 자료다 — `battleUseFunc 3`은 검사 자체를 안 거친다
    expect(embargoBlocks(itemTable.get(POKE_DOLL), true)).toBe(false)
    expect(embargoBlocks(itemTable.get(POTION), true)).toBe(true)
  })
})

/**
 * **담금질이 잡은 것들** (`soak.test.ts`).
 *
 * 무작위 1,200판을 굴려 찾은 자리다. 손으로 고른 판으로는 하나도 안 걸렸고,
 * 전부 화면에서 배틀이 통째로 서거나 없는 기술이 뜨는 고장이었다. 찾은 것을
 * 담금질에만 두면 씨앗이 바뀌는 순간 잊히므로 여기 못 박는다.
 */
describe('담금질이 잡은 자리', () => {
  /** 물장구를 진짜로 아는 잉어킹. 빈 턴 칸과 헷갈리기 쉬운 자리다 */
  const MAGIKARP = 129

  it('벤치의 빈 턴 칸이 교체 화면에 안 보인다', async () => {
    // 빈 턴 칸은 **우리 팀 전원**의 맨 뒤에 붙는다(`session.toSet`). 예전에는
    // 나와 있는 한 마리만 가려서, 교체 화면의 잉어킹이 `물장구·몸통박치기·물장구`
    // 세 칸으로 떴다 — 아는 것은 둘인데
    const mine = [spawn(TURTWIG, 20, 1, 'p1-0'), spawn(MAGIKARP, 20, 2, 'p1-1')]
    const { controller } = await BattleController.start({
      player: { name: '빛나', team: mine },
      foe: { name: '야생', team: [spawn(STARLY, 20, 3, 'p2-0')] },
      seed: [1, 2, 3, 4],
      random: rng(5),
      basePp: (m) => movesById.get(m)?.pp ?? 5,
    })
    for (const slot of controller.party) {
      const real = mine.find((m) => m.key === slot.key)!.mon.moves.length
      expect(slot.moves.length, `${slot.key}의 기술 칸`).toBe(real)
    }
    // 잉어킹의 진짜 물장구는 남아 있어야 한다 — 이름으로 지우면 안 된다
    const karp = controller.party.find((p) => p.key === 'p1-1')!
    expect(karp.moves.some((m) => m.id === 'splash'), '진짜 물장구까지 지웠다').toBe(true)
    controller.destroy()
  }, 30_000)

  it('진짜 기술 PP가 다 떨어지면 발버둥이 나온다', async () => {
    // 빈 턴 칸에 PP를 남겨 두면 sim이 "아직 쓸 게 있다"고 보고 발버둥을 안 준다.
    // 그런데 그 칸은 화면에서도 AI에서도 걸러지므로 **고를 것이 하나도 없는
    // 요청**이 되고 배틀이 그 자리에 선다 (담금질 씨앗 1019, 103턴째)
    const mine = spawn(TURTWIG, 30, 11, 'p1-0')
    for (const slot of mine.mon.moves) slot.pp = 0
    const { controller } = await BattleController.start({
      player: { name: '빛나', team: [mine] },
      foe: { name: '야생', team: [spawn(STARLY, 5, 12, 'p2-0')] },
      seed: [7, 7, 7, 7],
      random: rng(7),
      basePp: (m) => movesById.get(m)?.pp ?? 5,
    })
    const moves = controller.actions.filter((a) => a.type === 'move')
    expect(moves.map((m) => m.id), '발버둥 하나여야 한다').toEqual(['struggle'])
    controller.destroy()
  }, 30_000)

  it('쓰러져 갈아타는 턴에는 볼도 도망도 안 먹는다', async () => {
    // sim은 그 턴에 기술 명령을 거절한다("You need a switch response"). 우리는
    // 이미 요청을 비운 뒤라 답이 영영 안 오고 **배틀이 선다** (씨앗 1016·1022)
    const { controller } = await BattleController.start({
      player: { name: '빛나', team: [spawn(MAGIKARP, 2, 21, 'p1-0'), spawn(TURTWIG, 50, 22, 'p1-1')] },
      foe: { name: '야생', team: [spawn(LUXRAY, 60, 23, 'p2-0')] },
      seed: [8, 8, 8, 8],
      random: rng(8),
      basePp: (m) => movesById.get(m)?.pp ?? 5,
    })
    // 2레벨 잉어킹이 60레벨 렌트라 앞에 섰다. 한 대면 쓰러진다
    for (let i = 0; i < 6 && !controller.mustSwitch && !controller.ended; i++) {
      const moves = controller.actions.filter((a) => a.type === 'move')
      if (moves.length === 0) break
      await controller.choose(moves[0]!)
    }
    expect(controller.mustSwitch, '강제 교체가 안 왔다 — 아래 단언이 공허하다').toBe(true)
    expect(controller.canSpendTurn).toBe(false)
    expect((await controller.throwBall(Ball.POKE, {
      caughtBefore: false, inWater: false, darkness: false,
    })).events).toHaveLength(0)
    expect((await controller.run()).events).toHaveLength(0)
    // 그래도 교체는 그대로 열려 있어야 한다
    expect(controller.actions.length, '교체까지 막혔다').toBeGreaterThan(0)
    controller.destroy()
  }, 60_000)

  it('기술에 묶인 턴에는 도망이 안 먹는다', async () => {
    // 참기·역린·구르기·회복 턴에는 sim이 요청에 **묶인 기술 하나만** 담는다.
    // 그 틈에 도망치면 `move 5`가 "그런 기술 없다"로 거절되고 배틀이 선다
    // (씨앗 1077, 참기 다음 턴)
    const BIDE = 117
    const mine = spawn(TURTWIG, 40, 31, 'p1-0')
    mine.mon.moves = [{ move: BIDE, pp: 10, ppUps: 0 }]
    const { controller } = await BattleController.start({
      player: { name: '빛나', team: [mine] },
      foe: { name: '야생', team: [spawn(STARLY, 5, 32, 'p2-0')] },
      seed: [9, 9, 9, 9],
      random: rng(9),
      basePp: (m) => movesById.get(m)?.pp ?? 5,
    })
    expect(controller.canSpendTurn, '묶이기 전에는 열려 있어야 한다').toBe(true)
    await controller.choose(controller.actions.find((a) => a.type === 'move')!)
    expect(controller.state.active.p1?.volatiles.has('bide'), '참기가 안 걸렸다').toBe(true)
    expect(controller.canSpendTurn).toBe(false)
    expect((await controller.run()).events).toHaveLength(0)
    expect(controller.ended, '배틀이 끝나 버렸다').toBe(false)
    // 묶인 기술은 그대로 고를 수 있어야 한다
    expect(controller.actions.length).toBeGreaterThan(0)
    controller.destroy()
  }, 60_000)

  it('잡으면 사건만 다시 접어도 끝난 것으로 나온다', async () => {
    // sim은 포획을 모른다(대전 규칙 밖이다). 컨트롤러가 제 뷰만 세우고 사건에
    // 안 남기면 **재생기가 접어 만든 화면은 영영 안 끝난 상태**로 남는다
    const { controller } = await BattleController.start({
      player: { name: '빛나', team: [spawn(TURTWIG, 30, 41, 'p1-0')] },
      foe: { name: '야생', team: [spawn(STARLY, 3, 42, 'p2-0')] },
      seed: [5, 5, 5, 5],
      random: rng(5),
    })
    const step = await controller.throwBall(Ball.MASTER, {
      caughtBefore: false, inWater: false, darkness: false,
    })
    expect(applyEvents(emptyView(), step.events).ended, '다시 접으면 안 끝났다').toBe(true)
    controller.destroy()
  }, 30_000)
})
