// 트레이너가 넷인 배틀을 **가게로** 끝까지 돌린다 (PARITY §2.2b · REPAIR §82)
//
// 엔진 쪽(`sim/multi.test.ts`)은 자리 주인과 편 AI를 잰다. 여기서 보는 것은 그
// 위에 얹힌 것 — 롬의 트레이너 자료로 판이 열리는가, 상금이 원작 셈인가, 끝말이
// 두 사람 것인가, 스크립트가 보는 결과가 맞는가:
//
//   · 창기둥 조무래기 둘 (`StartTrainerBattle 521, 527` — 나 혼자 vs 둘)
//   · 창기둥 마스·쥬피터 + 라이벌 (`StartTagBattle 620, 528, 407`)
//   · 영원의 숲 모미와 함께 만난 야생 둘 (`BATTLE_TYPE_AI_PARTNER`)
import 'fake-indexeddb/auto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useBattleStore } from './battleStore'
import { createNewSave, useSaveStore } from './saveStore'
import { createWild, fillPp, statsOf, wildMoves } from '../engine/pokemon/instance'
import { expForLevel } from '../engine/pokemon/exp'
import { loadDialogueBank, loadMoves, loadSpecies, loadTrainers } from '../data/gameData'
import { installNodeAssets, withData } from '../data/romData.testkit'
import { ownerOfKey } from '../engine/battle/aftermath'
import { prizeFor } from '../engine/battle/meta/prize'
import { Ball } from '../engine/battle/meta/capture'
import { closingLines, openingLine } from '../ui/battle/bookends'
import { BATTLE_BANK } from '../ui/battle/romText'

const maybe = withData('trainers.json', 'species.json', 'moves.json', 'dialogue/ko/617.json')

let restoreAssets: (() => void) | null = null
beforeAll(() => { restoreAssets = installNodeAssets() })
afterAll(() => { restoreAssets?.() })

/** `generated/trainers.txt` — 줄 번호에서 1을 뺀 값이 트레이너 번호다 */
const GRUNT_SPEAR_1 = 521
const GRUNT_SPEAR_2 = 527
const MARS_SPEAR = 528
const JUPITER_SPEAR = 407
/** 라이벌 (창기둥 · 불꽃숭이를 고른 판) */
const RIVAL_SPEAR = 620
const CHERYL = 608
const STARLY = 396
const BIDOOF = 399

beforeEach(() => {
  useBattleStore.getState().close()
  const save = createNewSave()
  useSaveStore.setState({
    ...save,
    trainer: { ...save.trainer, id: 1, secretId: 1, name: '', gender: 'boy' },
  })
})

/** 재현 가능한 난수 (mulberry32) */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function giveParty(ids: readonly number[], level: number) {
  const [table, moves] = await Promise.all([loadSpecies(), loadMoves()])
  const pp = (id: number) => moves.byId.get(id)?.pp ?? 5
  useSaveStore.setState({
    party: ids.map((id, i) => {
      const sp = table.get(id)
      const mon = createWild({ species: sp, level, rng: rng(i + 1), otId: 1, otSecretId: 1 })
      mon.exp = expForLevel(sp.growthRate, level)
      mon.moves = wildMoves(sp, level)
      mon.hp = statsOf(mon, sp).hp
      return fillPp(mon, pp)
    }),
  })
}

/**
 * 끝날 때까지 민다. 자리마다 가장 센 기술을 고른다.
 *
 * 돌려주는 것은 **내게 물은 자리 번호**들이다 — 편이 있는 판에서 1이 섞이면
 * 편 자리를 내게 물은 것이다
 */
async function playToEnd(limit = 400): Promise<number[]> {
  const moves = await loadMoves()
  const power = (id: number | null) => (id === null ? 0 : moves.byId.get(id)?.power ?? 0)
  const asked: number[] = []
  for (let steps = 0; useBattleStore.getState().phase === 'running' && steps < limit; steps++) {
    const { actions, atSlot } = useBattleStore.getState()
    if (!actions.length) break
    asked.push(atSlot)
    const attacks = actions.filter((a) => a.type === 'move')
    const best = [...attacks].sort((a, b) => power(b.move) - power(a.move))[0]
    await useBattleStore.getState().choose(best ?? actions[0]!)
  }
  return asked
}

/** 이긴 뒤 상대가 하는 말 — 롬 대사 뱅크에서 직접 읽는다 */
async function defeatOf(id: number): Promise<string> {
  const [table, said] = await Promise.all([loadTrainers(), loadDialogueBank('ko', 617)])
  return said[table.get(id).msg['1']!]!.replace(/\s+$/, '')
}

maybe('나 혼자 vs 트레이너 둘 (`BATTLE_TYPE_TAG_DOUBLES`)', () => {
  it('창기둥 조무래기 둘 — 두 사람이 각자의 파티로 자리 a·b를 채우고, 둘 다 쓰러져야 이긴다', async () => {
    await giveParty([445, 448, 392], 70)
    const before = useSaveStore.getState().money
    await useBattleStore.getState().startTrainer(GRUNT_SPEAR_1, { second: GRUNT_SPEAR_2 })
    const s = useBattleStore.getState()
    expect(s.error).toBeNull()
    expect(s.doubles).toBe(true)
    expect(s.foes.map((t) => t.id)).toEqual([GRUNT_SPEAR_1, GRUNT_SPEAR_2])
    expect(s.partner).toBeNull()

    // 상금은 **두 사람의 합이고 두 배가 없다** (`battle_script.c` 3683)
    const table = await loadTrainers()
    const one = table.get(GRUNT_SPEAR_1)
    const two = table.get(GRUNT_SPEAR_2)
    const sum = prizeFor(one, table.prizeMul, false, false) + prizeFor(two, table.prizeMul, false, false)
    expect(s.prize).toBe(sum)

    // 끝말은 첫 상대 · 둘째 상대 차례다 (`subscript_battle_won.s` _087)
    expect(s.defeatLines).toEqual([await defeatOf(GRUNT_SPEAR_1), await defeatOf(GRUNT_SPEAR_2)])

    await playToEnd()
    const end = useBattleStore.getState()
    expect(end.outcome).toBe('win')
    expect(useSaveStore.getState().money - before).toBe(sum)

    // 자리 a에는 첫 상대의 마리만, 자리 b에는 둘째 상대의 마리만 섰다
    const outs = end.events.flatMap((e) => (e.kind === 'switch' && e.actor.side === 'p2'
      ? [{ slot: e.actor.slot, who: ownerOfKey(e.actor.name) }] : []))
    expect(outs.filter((o) => o.slot === 'p2a').every((o) => o.who === 'foe')).toBe(true)
    expect(outs.filter((o) => o.slot === 'p2b').every((o) => o.who === 'foe2')).toBe(true)
    // 두 사람의 마리가 다 나왔다 — 한 사람만 싸웠다면 위 단언이 공허하다
    expect(new Set(outs.map((o) => o.who))).toEqual(new Set(['foe', 'foe2']))

    // 여는 줄과 끝 줄이 두 사람을 한 창에 담는다
    const lines = await loadDialogueBank('ko', BATTLE_BANK)
    const ends = {
      lines, kind: end.kind, outcome: end.outcome, foes: end.foes, foeName: end.foeName,
      foeClass: end.foeClass, foeTrainer: end.foeTrainer, defeatLines: end.defeatLines,
      prize: end.prize, playerName: '나',
    }
    const hello = openingLine(ends)
    expect(hello).toContain(end.foes[0]!.cls!)
    expect(hello).toContain('승부를 걸어왔다')
    const tail = closingLines(ends)
    expect(tail).toHaveLength(4)
    expect(tail[0]).toContain('승부에서 이겼다')
    expect(tail.slice(1, 3)).toEqual(end.defeatLines)
    expect(tail[3]).toContain(String(sum))
    useBattleStore.getState().close()
  }, 120_000)

  it('스크립트가 보는 결과 — 지면 `loss`다', async () => {
    await giveParty([STARLY, BIDOOF], 3)
    await useBattleStore.getState().startTrainer(GRUNT_SPEAR_1, { second: GRUNT_SPEAR_2 })
    await playToEnd()
    expect(useBattleStore.getState().outcome).toBe('loss')
    useBattleStore.getState().close()
  }, 120_000)
})

maybe('편과 함께 (`BATTLE_TYPE_TRAINER_WITH_AI_PARTNER`)', () => {
  it('창기둥 마스·쥬피터 + 라이벌 — 나는 자리 a만 고르고 편은 제 파티로 싸운다', async () => {
    await giveParty([445, 448], 70)
    await useBattleStore.getState().startTrainer(MARS_SPEAR, { second: JUPITER_SPEAR, partner: RIVAL_SPEAR })
    const s = useBattleStore.getState()
    expect(s.error).toBeNull()
    expect(s.partner?.id).toBe(RIVAL_SPEAR)
    expect(s.foes.map((t) => t.id)).toEqual([MARS_SPEAR, JUPITER_SPEAR])
    // 편의 마리가 우리 쪽 자리 b에 섰다
    expect(ownerOfKey(s.truth!.active.p1b!.key)).toBe('partner')
    // 파티 화면에 편의 마리가 없다
    expect(s.party.every((p) => ownerOfKey(p.key) === 'player')).toBe(true)

    const asked = await playToEnd()
    expect(asked.every((at) => at === 0), '편 자리를 내게 물었다').toBe(true)
    const end = useBattleStore.getState()
    expect(end.outcome).toBe('win')
    // 편이 실제로 싸웠다 — 편의 마리가 기술을 썼다
    const allyMoved = end.events.some((e) => e.kind === 'move' && ownerOfKey(e.actor.name) === 'partner')
    expect(allyMoved, '편이 한 번도 안 움직였다').toBe(true)
    // ⚠️ 편이 있는 판에서는 아무도 도구를 안 쓴다 (`BATTLE_TYPE_NO_AI_ITEMS`)
    expect(end.events.some((e) => e.kind === 'trainerItem')).toBe(false)
    // 편의 마리는 세이브로 안 돌아온다 — 내 파티는 두 마리 그대로다
    useBattleStore.getState().close()
    expect(useSaveStore.getState().party).toHaveLength(2)
  }, 120_000)

  it('⚠️ 편이 서 있어도 내 파티가 다 쓰러지면 진다 (`BattleControllerPlayer_CheckBattleOver`)', async () => {
    await giveParty([BIDOOF], 2)
    await useBattleStore.getState().startTrainer(MARS_SPEAR, { second: JUPITER_SPEAR, partner: RIVAL_SPEAR })
    await playToEnd()
    const end = useBattleStore.getState()
    expect(end.outcome).toBe('loss')
    // 편의 여섯 중 적어도 하나는 아직 서 있었다 — 쪽 전체가 쓰러져 진 것이 아니다
    const allyDown = end.events.filter((e) => e.kind === 'faint' && ownerOfKey(e.actor.name) === 'partner')
    expect(allyDown.length).toBeLessThan(6)
    useBattleStore.getState().close()
  }, 120_000)
})

maybe('동행과 함께 만난 야생 둘 (`BATTLE_TYPE_AI_PARTNER`)', () => {
  it('모미가 옆에 서고, 둘이 다 서 있으면 볼을 못 던진다', async () => {
    await giveParty([392], 30)
    await useBattleStore.getState().startWild({
      species: STARLY, level: 10, second: { species: BIDOOF, level: 10 }, partner: CHERYL,
    })
    const s = useBattleStore.getState()
    expect(s.error).toBeNull()
    expect(s.kind).toBe('wild')
    expect(s.doubles).toBe(true)
    expect(s.partner?.id).toBe(CHERYL)
    expect(s.truth!.active.p2a!.species).toBe(STARLY)
    expect(s.truth!.active.p2b!.species).toBe(BIDOOF)
    expect(ownerOfKey(s.truth!.active.p1b!.key)).toBe('partner')

    // 「안돼! 2마리 있어서 목표를 정할 수가 없어...!」 (`battle_bag.c` 454)
    const before = s.events.length
    await useBattleStore.getState().throwBall(Ball.POKE)
    expect(useBattleStore.getState().events.slice(before).some((e) => e.kind === 'ball')).toBe(false)

    await playToEnd()
    expect(useBattleStore.getState().outcome).toBe('win')
    useBattleStore.getState().close()
  }, 120_000)
})

describe('판 이름', () => {
  it('두 사람의 첫 줄·끝 줄은 뱅크가 없으면 조용하다 — 지어낸 글을 안 띄운다', () => {
    const ends = {
      lines: [] as string[], kind: 'trainer' as const, outcome: 'win' as const,
      foes: [{ cls: '갤럭시단', name: '가' }, { cls: '갤럭시단', name: '나' }],
      foeName: null, foeClass: null, foeTrainer: null, defeatLines: ['끝말 하나', '끝말 둘'],
      prize: 100, playerName: '나',
    }
    expect(openingLine(ends)).toBeNull()
    // 끝말은 롬 대사라 뱅크와 상관없이 남는다
    expect(closingLines(ends)).toEqual(['끝말 하나', '끝말 둘'])
  })
})
