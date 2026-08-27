// 더블 배틀 (PARITY §2.2)
//
// **재는 것 넷:**
//
//   ① 네 자리가 다 서고, 자리마다 체력이 **따로** 움직인다
//   ② 대상을 찍어야 하는 기술과 안 찍어도 되는 기술이 갈린다 — sim이 거절하면
//      요청을 비운 뒤라 배틀이 그 자리에 **선다**
//   ③ 한 자리만 쓰러진 턴에 멀쩡한 자리가 `pass`로 넘어간다
//   ④ 끝까지 굴려도 안 굳는다 (담금질)
import { expect, it } from 'vitest'
import { withData } from '../../../data/romData.testkit'
import { BattleController } from './controller'
import { needsTarget, type BattleAction } from '../choice'
import { SLOTS } from '../events'
import { rng, spawn, movesById } from './fixtures.testkit'

const maybe = withData('species.json', 'moves.json')

/** 모부기 · 불꽃숭이 · 팽도리 · 이상해씨 */
const TURTWIG = 387
const CHIMCHAR = 390
const PIPLUP = 393

const basePp = (move: number): number => movesById.get(move)?.pp ?? 5

function team(prefix: string, seed: number) {
  return [
    spawn(TURTWIG, 30, seed, `${prefix}-0`),
    spawn(CHIMCHAR, 30, seed + 1, `${prefix}-1`),
    spawn(PIPLUP, 30, seed + 2, `${prefix}-2`),
  ]
}

async function open(seed: number, smart = false) {
  return BattleController.start({
    player: { name: '나', team: team('p1', seed) },
    foe: { name: '상대', team: team('p2', seed + 100) },
    doubles: true,
    basePp,
    random: rng(seed),
    seed: [seed & 0xffff, (seed * 7) & 0xffff, (seed * 13) & 0xffff, (seed * 31) & 0xffff],
    // 바닥은 `TrainerBrain`이 깐다. 0으로 줘도 BDSP의 111이 먹는다 (PLAN §7.7.5)
    ...(smart ? { ai: { flags: 0, moves: { byId: movesById } } } : {}),
  })
}

/** 자리마다 하나씩 아무거나. 같은 마리를 두 자리가 부르지 않게 거른다 */
function pickTurn(c: BattleController, random: () => number): BattleAction[] {
  const out: BattleAction[] = []
  const taken = new Set<number>()
  for (const at of c.chooseSlots) {
    const left = c.actionsAt(at, [...taken])
    const pick = left[Math.floor(random() * left.length)] ?? left[0]
    if (!pick) break
    if (pick.type === 'switch') taken.add(pick.index)
    out.push(pick)
  }
  return out
}

maybe('더블 배틀', () => {
  it('네 자리가 다 선다', async () => {
    const { controller } = await open(1)
    try {
      for (const slot of SLOTS) {
        expect(controller.state.active[slot], `${slot}이 비었다`).not.toBeNull()
      }
      expect(controller.state.doubles).toBe(true)
      // 자리마다 다른 마리다 — 쪽으로 접혀 있으면 여기서 둘이 같아진다
      const keys = SLOTS.map((s) => controller.state.active[s]?.key)
      expect(new Set(keys).size, `키가 겹쳤다: ${keys.join(',')}`).toBe(4)
    } finally { controller.destroy() }
  })

  it('자리마다 따로 고르고, 명령 둘이 한 줄로 나간다', async () => {
    const { controller } = await open(2)
    try {
      expect(controller.slotCount).toBe(2)
      const first = controller.actionsAt(0)
      const second = controller.actionsAt(1)
      expect(first.length).toBeGreaterThan(0)
      expect(second.length).toBeGreaterThan(0)
      // 자리 번호가 붙어 있어야 명령을 묶을 때 차례가 맞는다
      expect(first.every((a) => (a.at ?? 0) === 0)).toBe(true)
      expect(second.every((a) => a.at === 1)).toBe(true)

      const before = SLOTS.map((s) => controller.state.active[s]?.hp ?? 0)
      const step = await controller.chooseTurn(pickTurn(controller, rng(9)))
      expect(step.events.length, '아무 일도 안 일어났다').toBeGreaterThan(0)
      const after = SLOTS.map((s) => controller.state.active[s]?.hp ?? 0)
      expect(after, '네 자리 중 아무도 안 움직였다').not.toEqual(before)
    } finally { controller.destroy() }
  })

  it('⚠️ 대상을 찍어야 하는 기술은 자리마다 후보가 갈린다', async () => {
    const { controller } = await open(3)
    try {
      const actions = controller.actionsAt(0).filter((a) => a.type === 'move')
      // 겨냥 갈래는 요청에 실려 온다. 대상이 필요한 기술은 같은 칸 번호로 둘이 뜬다
      const bySlot = new Map<number, number[]>()
      for (const a of actions) {
        if (a.type !== 'move') continue
        bySlot.set(a.slot, [...(bySlot.get(a.slot) ?? []), a.target ?? 0])
      }
      const targeted = [...bySlot.values()].filter((ts) => ts.length > 1)
      expect(targeted.length, '대상을 고를 수 있는 기술이 하나도 없다').toBeGreaterThan(0)
      // 상대 두 자리(1·2)가 후보다
      for (const ts of targeted) expect(new Set(ts)).toEqual(new Set([1, 2]))
    } finally { controller.destroy() }
  })

  it('겨냥 갈래 다섯만 대상을 찍는다 — sim에 던져 보고 센 것이다', () => {
    for (const t of ['normal', 'any', 'adjacentAlly', 'adjacentAllyOrSelf', 'adjacentFoe']) {
      expect(needsTarget(t), t).toBe(true)
    }
    for (const t of [
      'self', 'all', 'allAdjacent', 'allAdjacentFoes', 'allySide',
      'allyTeam', 'foeSide', 'randomNormal', 'scripted',
    ]) {
      expect(needsTarget(t), t).toBe(false)
    }
    expect(needsTarget(undefined)).toBe(false)
  })

  it('⚠️ AI가 자리마다 **따로** 생각한다 — 그리고 제 짝을 안 때린다', async () => {
    // ⚠️ **오래 안 그랬다.** 브레인이 `at`을 안 받아서 자리 A로 한 번 판단하고,
    // 컨트롤러가 그 **칸 번호**만 자리 B의 합법 목록에 다시 심었다. B의 기술칸이
    // 다르면 그것은 사실상 무작위였고, 겨눈 자리는 그 뒤에 또 무작위로 흩어졌다.
    //
    // 잡는 법은 **고른 칸 번호**다 — 옛 코드에서는 두 자리가 반드시 같았다.
    // 그리고 짝을 겨눈 명령이 한 번이라도 나오면 안 된다
    const SEED = 7
    const foes = team('p2', SEED + 100)
    /** 키 → 그 마리의 기술 번호 차례 */
    const slotsOf = new Map(foes.map((m) => [m.key, m.mon.moves.map((s) => s.move)]))
    const { controller } = await open(SEED, true)
    try {
      let sameSlot = 0
      let differed = 0
      let hitAlly = 0
      for (let turn = 0; turn < 25 && !controller.ended; turn += 1) {
        const view = controller.state
        const step = await controller.chooseTurn(pickTurn(controller, rng(turn * 13 + 1)))
        const picked = new Map<string, number>()
        for (const e of step.events) {
          if (e.kind !== 'move' || e.actor.side !== 'p2' || e.move === null) continue
          // ⚠️ **제 몸에 거는 기술은 여기 들면 안 된다** — 껍질에숨기·성장은
          // 겨눈 자리가 자기 자신이라 쪽만 보면 「짝을 때렸다」로 세어진다
          if (e.target && e.target.side === 'p2' && e.target.slot !== e.actor.slot) hitAlly += 1
          const key = view.active[e.actor.slot]?.key
          const at = key === undefined ? -1 : slotsOf.get(key)?.indexOf(e.move) ?? -1
          if (at >= 0) picked.set(e.actor.slot, at)
        }
        const a = picked.get('p2a')
        const b = picked.get('p2b')
        if (a === undefined || b === undefined) continue
        if (a === b) sameSlot += 1
        else differed += 1
      }
      expect(sameSlot + differed, '두 자리가 같이 기술을 쓴 턴이 한 번도 없다')
        .toBeGreaterThan(2)
      // 옛 코드에서는 `differed`가 반드시 0이었다
      expect(differed, `두 자리가 늘 같은 칸을 골랐다 (같음 ${String(sameSlot)})`)
        .toBeGreaterThan(0)
      expect(hitAlly, 'AI가 제 짝을 겨눴다').toBe(0)
    } finally { controller.destroy() }
  }, 60_000)

  it('⚠️ 끝까지 굴려도 안 굳는다', async () => {
    // 싱글에서 배틀을 세운 것들(빈 턴 칸·잠긴 기술·강제 교체)이 더블에서는
    // **자리마다** 다시 생긴다. 한 자리만 쓰러진 턴의 `pass`가 특히 그렇다
    // 씨앗 23의 7턴째가 「You sent more choices than unfainted Pokémon」으로
    // 굳던 자리다. 넓게 굴려야 그런 자리가 나온다
    for (let seed = 1; seed <= 40; seed++) {
      const { controller } = await open(seed)
      const random = rng(seed * 3)
      try {
        let turns = 0
        while (!controller.state.ended && turns < 200) {
          const turn = pickTurn(controller, random)
          if (turn.length === 0) break
          await controller.chooseTurn(turn)
          turns++
        }
        expect(controller.state.ended, `씨앗 ${seed}: ${turns}턴에서 굳었다`).toBe(true)
      } finally { controller.destroy() }
    }
  }, 60_000)

  it('한 자리만 쓰러지면 멀쩡한 자리는 pass다', async () => {
    // 강제 교체 요청이 자리마다 온다. 안 쓰러진 자리에 교체 목록을 내주면
    // 화면이 멀쩡한 마리를 바꾸라고 묻는다
    const { controller } = await open(5)
    const random = rng(77)
    try {
      let sawPass = false
      for (let i = 0; i < 200 && !controller.state.ended; i++) {
        for (const at of controller.chooseSlots) {
          const only = controller.actionsAt(at)
          if (only.length === 1 && only[0]!.type === 'pass') sawPass = true
        }
        const turn = pickTurn(controller, random)
        if (turn.length === 0) break
        await controller.chooseTurn(turn)
      }
      expect(sawPass, '한 자리만 쓰러진 턴이 한 번도 안 나왔다').toBe(true)
    } finally { controller.destroy() }
  }, 60_000)
})
