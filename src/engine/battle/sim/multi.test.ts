// 트레이너가 넷인 배틀 (PARITY §2.2b · REPAIR §82)
//
// 원작의 2vs2 둘을 잰다:
//
//   · **태그 더블** (`BATTLE_TYPE_TAG_DOUBLES`) — 나 혼자 두 자리를 내 파티로 채우고,
//     상대 트레이너 둘이 **저마다 제 파티로** 자리 a·b를 채운다
//   · **편과 함께** (`BATTLE_TYPE_TRAINER_WITH_AI_PARTNER`) — 우리 쪽 자리 b가 편의
//     것이다. 편의 AI가 매 턴 고르고, **내 파티가 다 쓰러지면 진다**
//
// **재는 것:**
//
//   ① 자리마다 제 주인의 마리만 나선다 — 쓰러진 뒤 채우는 것도, 억지로 끌려
//      나오는 것도 (`battle_controller_player.c` 4081 · `battle_script.c` 5257)
//   ② 한 트레이너가 바닥나면 그 자리는 빈 채로 남고 판은 이어진다
//   ③ 두 트레이너가 다 바닥나야 이긴다 (`BattleControllerPlayer_CheckBattleOver`)
//   ④ 편은 서 있는 턴마다 수를 둔다. 내가 편의 마리를 부를 수 없다
//   ⑤ 편이 서 있어도 내 파티가 바닥나면 진다 (같은 함수 4202)
//   ⑥ 담금질 — 여러 씨앗으로 끝까지 굴려 sim이 한 번도 명령을 거절하지 않는다
import { describe, expect, it } from 'vitest'
import { withData } from '../../../data/romData.testkit'
import type { BattleAction } from '../choice'
import type { BattleEvent } from '../events'
import { BattleController } from './controller'
import { itemsById, movesById, rng, spawn, speciesById } from './fixtures.testkit'
import { TrainerItems } from '../meta/trainerItems'
import type { SideMon } from './session'

const maybe = withData('species.json', 'moves.json')

const basePp = (move: number): number => movesById.get(move)?.pp ?? 5
const AI = { flags: 0, moves: { byId: movesById } }

/** 도구 표. 트레이너 도구를 쓰는 갈래를 태운다 */
const itemTable = { get: (id: number) => itemsById.get(id)! }
const itemId = (name: string): number =>
  [...itemsById.entries()].find(([, it]) => it.name === name)![0]
/**
 * 트레이너 한 사람의 가방. **사람마다 새로 만든다** — 원작도 트레이너마다 제
 * 도구 칸을 따로 센다 (`aiContext.trainerItems[battler >> 1]`)
 */
const bagOf = () => ({
  bag: new TrainerItems([itemId('super_potion'), itemId('full_restore')], itemTable),
  item: (id: number) => itemTable.get(id),
})

/** 모부기 · 불꽃숭이 · 팽도리 · 찌르꼬 · 비버니 · 꼬몽울 */
const TURTWIG = 387
const CHIMCHAR = 390
const PIPLUP = 393
const STARLY = 396
const BIDOOF = 399
const SHINX = 403
const ZUBAT = 41
const GLAMEOW = 431
const STUNKY = 434

/** 키 앞머리 — 누구의 마리인지가 키에 박혀 있다 (`aftermath.partyKey`와 같은 꼴) */
const owner = (key: string): string => key.slice(0, 2)

function party(prefix: string, species: readonly number[], level: number, seed: number): SideMon[] {
  return species.map((id, i) => spawn(id, level, seed + i, `${prefix}-${String(i)}`))
}

/** sim이 거절한 명령을 센다. 거절은 조용히 일어나고 배틀만 선다 */
function watchRefusals(controller: BattleController): string[] {
  const refused: string[] = []
  const session = (controller as unknown as {
    session: { settle: () => Promise<{ p1: string[]; p2: string[] }> }
  }).session
  const settle = session.settle.bind(session)
  session.settle = async () => {
    const lines = await settle()
    refused.push(...[...lines.p1, ...lines.p2].filter((x) => x.startsWith('|error|')))
    return lines
  }
  return refused
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

/** 끝날 때까지 굴린다. 사건 전부와 턴 수를 돌려준다 */
async function playOut(
  controller: BattleController, random: () => number, first: readonly BattleEvent[],
  limit = 300,
): Promise<{ events: BattleEvent[]; turns: number; refused: string[] }> {
  const refused = watchRefusals(controller)
  const events: BattleEvent[] = [...first]
  let turns = 0
  for (; turns < limit && !controller.ended; turns++) {
    const pick = pickTurn(controller, random)
    expect(pick.length, `${String(turns)}턴에 고를 것이 없다`).toBeGreaterThan(0)
    const step = await controller.chooseTurn(pick)
    events.push(...step.events)
    expect(refused, `${String(turns)}턴에 sim이 명령을 거절했다`).toEqual([])
  }
  return { events, turns, refused }
}

function seedOf(n: number): [number, number, number, number] {
  return [n & 0xffff, (n * 7) & 0xffff, (n * 13) & 0xffff, (n * 31) & 0xffff]
}

async function tagDoubles(seed: number, opts: { foe1?: number[]; foe2?: number[] } = {}) {
  return BattleController.start({
    player: { name: '나', team: party('p1', [TURTWIG, CHIMCHAR, PIPLUP, STARLY], 34, seed) },
    foe: { name: '갤럭시단 조무래기', team: party('p2', opts.foe1 ?? [ZUBAT, GLAMEOW], 30, seed + 40) },
    foe2: { name: '갤럭시단 조무래기', team: party('p4', opts.foe2 ?? [STUNKY, BIDOOF, SHINX], 30, seed + 80) },
    ai: AI,
    ai2: AI,
    basePp,
    random: rng(seed),
    seed: seedOf(seed),
  })
}

async function withPartner(seed: number, level = 34) {
  return BattleController.start({
    player: { name: '나', team: party('p1', [TURTWIG, CHIMCHAR], level, seed) },
    partner: { name: '라이벌', team: party('p3', [PIPLUP, STARLY, SHINX], 36, seed + 20) },
    partnerAi: AI,
    foe: { name: '마스', team: party('p2', [ZUBAT, GLAMEOW], 34, seed + 40) },
    foe2: { name: '쥬피터', team: party('p4', [STUNKY, BIDOOF], 34, seed + 80) },
    ai: AI,
    ai2: AI,
    basePp,
    random: rng(seed),
    seed: seedOf(seed),
  })
}

/** 자리 → 그 자리에 선 마리의 주인 앞머리 */
function slotOwners(events: readonly BattleEvent[]): { slot: string; owner: string }[] {
  return events.flatMap((e) => (e.kind === 'switch'
    ? [{ slot: e.actor.slot, owner: owner(e.actor.name) }] : []))
}

maybe('태그 더블 — 나 혼자 vs 트레이너 둘', () => {
  it('자리 a는 첫 상대, 자리 b는 둘째 상대의 마리만 선다', async () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { controller, step } = await tagDoubles(seed)
      try {
        const run = await playOut(controller, rng(seed * 3), step.events)
        expect(controller.ended, `씨앗 ${String(seed)}: 안 끝났다`).toBe(true)
        for (const { slot, owner: who } of slotOwners(run.events)) {
          if (slot === 'p2a') expect(who, `씨앗 ${String(seed)}: 자리 a에 남의 마리`).toBe('p2')
          if (slot === 'p2b') expect(who, `씨앗 ${String(seed)}: 자리 b에 남의 마리`).toBe('p4')
        }
      } finally { controller.destroy() }
    }
  }, 120_000)

  it('두 트레이너가 다 바닥나야 이긴다 — 한쪽이 먼저 비면 그 자리는 빈 채로 이어진다', async () => {
    let emptied = 0
    for (let seed = 11; seed <= 20; seed++) {
      // 첫 상대는 한 마리, 둘째는 셋이다. 첫 상대가 먼저 비는 판이 많다
      const { controller, step } = await tagDoubles(seed, { foe1: [BIDOOF], foe2: [ZUBAT, GLAMEOW, STUNKY] })
      try {
        const run = await playOut(controller, rng(seed), step.events)
        const foes = controller.results('p2')
        if (controller.finish === 'win') {
          expect(foes.every((r) => r.fainted), `씨앗 ${String(seed)}: 남은 상대가 있는데 이겼다`).toBe(true)
        }
        // 첫 상대의 마지막 한 마리가 쓰러진 뒤에도 판이 이어졌으면 — 그 자리는 비어 있었다
        const at = run.events.findIndex((e) => e.kind === 'faint' && e.actor.name === 'p2-0')
        if (at >= 0 && run.events.slice(at).some((e) => e.kind === 'move' && e.actor.side === 'p2')) {
          emptied++
          const after = slotOwners(run.events.slice(at))
          expect(after.filter((s) => s.slot === 'p2a'), `씨앗 ${String(seed)}: 빈 자리를 짝이 채웠다`)
            .toEqual([])
        }
      } finally { controller.destroy() }
    }
    expect(emptied, '첫 상대가 먼저 빈 판이 하나도 없어 ②를 못 쟀다').toBeGreaterThan(0)
  }, 120_000)
})

/** 그 기술 하나만 아는 마리로 바꾼다 */
function only(side: SideMon, move: number): SideMon {
  side.mon.moves = [{ move, pp: movesById.get(move)?.pp ?? 5, ppUps: 0 }]
  return side
}
const ROAR = 46
const U_TURN = 369
const SPLASH = 150

maybe('억지 교체도 제 파티에서만', () => {
  it('울부짖기가 끌어내는 마리는 맞은 자리 주인의 것이다 (`battle_script.c` 5257)', async () => {
    let dragged = 0
    for (let seed = 1; seed <= 6; seed++) {
      const { controller } = await BattleController.start({
        player: {
          name: '나',
          team: [only(spawn(SHINX, 100, seed, 'p1-0'), ROAR), only(spawn(STARLY, 100, seed + 1, 'p1-1'), ROAR)],
        },
        foe: { name: '가', team: party('p2', [ZUBAT, GLAMEOW, BIDOOF], 10, seed + 40).map((m) => only(m, SPLASH)) },
        foe2: { name: '나', team: party('p4', [STUNKY, PIPLUP, TURTWIG], 10, seed + 80).map((m) => only(m, SPLASH)) },
        basePp,
        random: rng(seed),
        seed: seedOf(seed),
      })
      try {
        const refused = watchRefusals(controller)
        for (let turn = 0; turn < 8 && !controller.ended; turn++) {
          // 두 자리가 저마다 상대 a·b를 겨눈다
          const pick: BattleAction[] = controller.chooseSlots.map((at) => {
            const moves = controller.actionsAt(at).filter((a) => a.type === 'move')
            return moves.find((a) => a.type === 'move' && a.target === at + 1) ?? moves[0]!
          })
          const got = await controller.chooseTurn(pick)
          expect(refused).toEqual([])
          for (const e of got.events) {
            if (e.kind !== 'switch' || !e.forced) continue
            dragged++
            expect(owner(e.actor.name), `씨앗 ${String(seed)}: ${e.actor.slot}에 ${e.actor.name}`)
              .toBe(e.actor.slot === 'p2a' ? 'p2' : 'p4')
          }
        }
      } finally { controller.destroy() }
    }
    expect(dragged, '한 번도 끌려 나오지 않았다').toBeGreaterThan(0)
  }, 120_000)

  it('제 벤치가 없는 자리는 유턴을 써도 교체를 안 묻는다 — 짝의 벤치가 남아 있어도', async () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { controller } = await BattleController.start({
        player: { name: '나', team: party('p1', [PIPLUP, TURTWIG], 60, seed).map((m) => only(m, SPLASH)) },
        // 첫 상대는 한 마리뿐이고 유턴만 안다. 둘째 상대는 벤치가 있다
        foe: { name: '가', team: [only(spawn(STARLY, 30, seed + 40, 'p2-0'), U_TURN)] },
        foe2: { name: '나', team: party('p4', [STUNKY, BIDOOF, SHINX], 30, seed + 80).map((m) => only(m, SPLASH)) },
        basePp,
        random: rng(seed),
        seed: seedOf(seed),
      })
      try {
        const refused = watchRefusals(controller)
        for (let turn = 0; turn < 5 && !controller.ended; turn++) {
          const got = await controller.chooseTurn(pickTurn(controller, rng(seed + turn)))
          expect(refused).toEqual([])
          // 자리 a에 남의 마리가 들어서지 않는다
          for (const e of got.events) {
            if (e.kind === 'switch' && e.actor.slot === 'p2a') expect(owner(e.actor.name)).toBe('p2')
          }
          expect(controller.state.active.p2a?.key).toBe('p2-0')
        }
      } finally { controller.destroy() }
    }
  }, 120_000)
})

maybe('편과 함께 — 나와 편 vs 트레이너 둘', () => {
  it('AI 비트 — 편은 자료 값 그대로(바닥 없음), 상대는 바닥을 깔고, 셋 다 TAG_STRATEGY가 켜진다', async () => {
    const { controller } = await BattleController.start({
      player: { name: '나', team: party('p1', [TURTWIG, CHIMCHAR], 34, 1) },
      // 창기둥의 라이벌(607·619·620)과 마스(528)·쥬피터(407)의 `ai` 값 그대로다
      partner: { name: '라이벌', team: party('p3', [PIPLUP, STARLY], 36, 21) },
      partnerAi: { flags: 7, moves: { byId: movesById } },
      foe: { name: '마스', team: party('p2', [ZUBAT, GLAMEOW], 34, 41) },
      foe2: { name: '쥬피터', team: party('p4', [STUNKY, BIDOOF], 34, 81) },
      ai: { flags: 15, moves: { byId: movesById } },
      ai2: { flags: 15, moves: { byId: movesById } },
      basePp,
      random: rng(1),
      seed: seedOf(1),
    })
    try {
      const brains = (controller as unknown as { brains: { thinkingMask: number }[] }).brains
      const TAG = 1 << 7
      // 편: 7 | 128 — `TrainerAI_Init`이 자료 값에 더블의 TAG만 얹는다 (`trainer_ai.c` 250·252)
      expect(brains[2]!.thinkingMask).toBe(7 | TAG)
      // 상대: 15 | BDSP 바닥(111) | 128
      expect(brains[0]!.thinkingMask).toBe(15 | 111 | TAG)
      expect(brains[1]!.thinkingMask).toBe(15 | 111 | TAG)
    } finally { controller.destroy() }
  })

  it('편 AI는 짝(나)을 때리지 않는다 — 짝을 겨눈 명령은 짝에게 쓸 이유가 있는 기술뿐이다', async () => {
    // 편의 마리들은 짝에게 쓸 이유가 없는 기술만 가졌다 → 짝을 겨눈 벌은 늘 −30 → −1
    let aimed = 0
    for (let seed = 1; seed <= 4; seed++) {
      const { controller } = await withPartner(seed)
      try {
        const sent: string[] = []
        const session = (controller as unknown as { session: { send: (s: string) => void } }).session
        const send = session.send.bind(session)
        session.send = (line: string) => { sent.push(line); send(line) }
        const random = rng(seed * 11)
        for (let turns = 0; turns < 300 && !controller.ended; turns++) {
          await controller.chooseTurn(pickTurn(controller, random))
        }
        // 우리 쪽 줄의 둘째 명령이 편 자리다. `-1`(자리 a = 나)을 겨누면 짝을 친 것이다
        for (const line of sent.filter((l) => l.startsWith('p1 '))) {
          const ally = line.slice(3).split(', ')[1]
          if (ally !== undefined && / -1$/.test(ally)) aimed++
        }
      } finally { controller.destroy() }
    }
    expect(aimed).toBe(0)
  }, 120_000)

  it('나는 자리 a만 고르고, 편은 서 있는 턴마다 제 수를 둔다', async () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { controller, step } = await withPartner(seed)
      try {
        expect(controller.withPartner).toBe(true)
        const refused = watchRefusals(controller)
        const random = rng(seed * 5)
        let turns = 0
        for (; turns < 300 && !controller.ended; turns++) {
          // 내게 묻는 자리는 a 하나뿐이고, 내 교체 후보에 편의 마리가 없다
          expect(controller.chooseSlots.every((at) => at === 0)).toBe(true)
          for (const a of controller.actionsAt(0)) {
            if (a.type === 'switch') expect(owner(a.key), '편의 마리를 부를 수 있다').toBe('p1')
          }
          expect(controller.party.every((p) => owner(p.key) === 'p1'), '파티 화면에 편의 마리').toBe(true)
          const allyUp = controller.state.active.p1b !== null && !controller.state.active.p1b.fainted
          const allyKey = controller.state.active.p1b?.key
          // 기술을 고르는 턴이었나 — 쓰러져 갈아타는 턴에는 편도 할 일이 없다
          const movePhase = !controller.mustSwitch
          const got = await controller.chooseTurn(pickTurn(controller, random))
          expect(refused).toEqual([])
          // 편이 서 있던 턴에는 편이 무언가를 했다 — 기술이든, 못 움직였든(`cant`),
          // 혼란으로 자기를 때렸든(`-activate|confusion`), 교체든.
          // 그 턴 안에서 판이 끝났으면(상대가 먼저 다 쓰러졌다) 못 움직인 것이 맞다
          const upTo = got.events.findIndex((e) => e.kind === 'turn')
          const within = upTo < 0 ? got.events : got.events.slice(0, upTo)
          if (allyUp && movePhase && upTo >= 0) {
            const acted = within.some((e) => (e.kind === 'move' || e.kind === 'cant'
              || e.kind === 'switch' || e.kind === 'activate') && e.actor?.name === allyKey)
            const down = within.some((e) => e.kind === 'faint' && e.actor.name === allyKey)
            expect(acted || down, `씨앗 ${String(seed)}: ${String(turns)}턴에 편이 가만히 있었다\n`
              + within.map((e) => e.kind + ('actor' in e && e.actor ? ` ${e.actor.slot}:${e.actor.name}` : '')).join('\n'))
              .toBe(true)
          }
        }
        expect(controller.ended).toBe(true)
        for (const { slot, owner: who } of slotOwners(step.events)) {
          if (slot === 'p1b') expect(who).toBe('p3')
        }
      } finally { controller.destroy() }
    }
  }, 120_000)

  it('⚠️ 편이 서 있어도 내 파티가 다 쓰러지면 진다', async () => {
    let alone = 0
    for (let seed = 1; seed <= 12; seed++) {
      // 내 파티를 약하게 둔다 — 편보다 먼저 바닥나는 판이 나와야 잰다
      const { controller, step } = await withPartner(seed, 8)
      try {
        await playOut(controller, rng(seed), step.events)
        const mine = controller.results('p1').filter((r) => owner(r.key) === 'p1')
        const ally = controller.results('p1').filter((r) => owner(r.key) === 'p3')
        if (mine.every((r) => r.fainted)) {
          expect(controller.finish, `씨앗 ${String(seed)}`).toBe('loss')
          if (ally.some((r) => !r.fainted)) alone++
        } else {
          expect(controller.finish).toBe('win')
        }
      } finally { controller.destroy() }
    }
    expect(alone, '편이 살아 있는데 내가 진 판이 없어 ⑤를 못 쟀다').toBeGreaterThan(0)
  }, 120_000)

  it('편이 먼저 바닥나도 판은 이어지고, 이기면 이긴 판이다', async () => {
    let solo = 0
    for (let seed = 30; seed <= 40; seed++) {
      const { controller, step } = await BattleController.start({
        player: { name: '나', team: party('p1', [TURTWIG, CHIMCHAR, PIPLUP], 45, seed) },
        partner: { name: '라이벌', team: party('p3', [BIDOOF], 5, seed + 20) },
        partnerAi: AI,
        foe: { name: '마스', team: party('p2', [ZUBAT], 25, seed + 40) },
        foe2: { name: '쥬피터', team: party('p4', [STUNKY, GLAMEOW], 25, seed + 80) },
        ai: AI,
        ai2: AI,
        basePp,
        random: rng(seed),
        seed: seedOf(seed),
      })
      try {
        await playOut(controller, rng(seed), step.events)
        const ally = controller.results('p1').filter((r) => owner(r.key) === 'p3')
        if (ally.every((r) => r.fainted) && controller.finish === 'win') solo++
      } finally { controller.destroy() }
    }
    expect(solo, '편이 먼저 쓰러지고 이긴 판이 없다').toBeGreaterThan(0)
  }, 120_000)
})

describe('담금질', () => {
  maybe('여러 씨앗으로 끝까지 — 거절 0', () => {
    const ROUNDS = Number(process.env.BATTLE_SOAK ?? '') || 16
    it(`태그 더블 ${String(ROUNDS)}판`, async () => {
      for (let seed = 100; seed < 100 + ROUNDS; seed++) {
        const { controller, step } = await tagDoubles(seed)
        try {
          const run = await playOut(controller, rng(seed * 11), step.events)
          expect(run.refused).toEqual([])
          expect(controller.ended, `씨앗 ${String(seed)}: 굳었다`).toBe(true)
          expect(controller.finish).not.toBeNull()
        } finally { controller.destroy() }
      }
    }, 300_000)

    /**
     * 종족을 무작위로 뽑는다 — 울부짖기·날려버리기·유턴·바톤터치·치유소원처럼
     * **교체를 부르는 기술**이 손으로 고른 여섯 마리에는 없다. 493종에서 뽑으면
     * 그 기술들을 아는 마리가 판마다 섞여 들어온다
     */
    it(`무작위 종족 ${String(ROUNDS * 2)}판 (두 형식 반씩)`, async () => {
      const roster = [...speciesById.keys()].filter((id) => id >= 1 && id <= 493)
      /** 도구를 쓴 사람 (키 앞머리). 둘 다 한 번은 써야 도구 갈래를 태운 것이다 */
      const usedBy = new Set<string>()
      for (let seed = 500; seed < 500 + ROUNDS * 2; seed++) {
        const r = rng(seed)
        const pickSpecies = (n: number) => Array.from({ length: n },
          () => roster[Math.floor(r() * roster.length)]!)
        const size = () => 1 + Math.floor(r() * 3)
        const level = () => 20 + Math.floor(r() * 50)
        const partnered = seed % 2 === 0
        const { controller, step } = await BattleController.start({
          player: { name: '나', team: party('p1', pickSpecies(partnered ? size() : 1 + size()), level(), seed) },
          ...(partnered
            ? { partner: { name: '편', team: party('p3', pickSpecies(size()), level(), seed + 20) }, partnerAi: AI }
            : {}),
          foe: { name: '가', team: party('p2', pickSpecies(size()), level(), seed + 40) },
          foe2: { name: '나', team: party('p4', pickSpecies(size()), level(), seed + 80) },
          ai: AI,
          ai2: AI,
          // 편이 없는 태그 더블은 두 트레이너가 저마다 도구를 쓴다. 편이 있으면
          // 아무도 안 쓴다 (`BATTLE_TYPE_NO_AI_ITEMS`) — 가게가 그렇게 넘긴다
          ...(partnered ? {} : { items: bagOf(), items2: bagOf() }),
          basePp,
          random: rng(seed * 17),
          seed: seedOf(seed),
        })
        try {
          const run = await playOut(controller, rng(seed * 11), step.events, 400)
          expect(run.refused, `씨앗 ${String(seed)}`).toEqual([])
          expect(controller.ended, `씨앗 ${String(seed)}: 굳었다`).toBe(true)
          for (const { slot, owner: who } of slotOwners(run.events)) {
            const want = slot === 'p2a' ? 'p2' : slot === 'p2b' ? 'p4'
              : slot === 'p1b' && partnered ? 'p3' : 'p1'
            expect(who, `씨앗 ${String(seed)}: ${slot}에 ${who}의 마리`).toBe(want)
          }
          for (const e of run.events) {
            if (e.kind !== 'trainerItem') continue
            expect(partnered, `씨앗 ${String(seed)}: 편이 있는 판에서 도구를 썼다`).toBe(false)
            usedBy.add(owner(e.key))
          }
        } finally { controller.destroy() }
      }
      expect(usedBy, '두 트레이너가 저마다 도구를 쓴 적이 없다').toEqual(new Set(['p2', 'p4']))
    }, 600_000)

    it(`편과 함께 ${String(ROUNDS)}판`, async () => {
      for (let seed = 200; seed < 200 + ROUNDS; seed++) {
        const { controller, step } = await withPartner(seed, 20 + (seed % 20))
        try {
          const run = await playOut(controller, rng(seed * 11), step.events)
          expect(run.refused).toEqual([])
          expect(controller.ended, `씨앗 ${String(seed)}: 굳었다`).toBe(true)
          expect(controller.finish).not.toBeNull()
        } finally { controller.destroy() }
      }
    }, 300_000)
  })
})
