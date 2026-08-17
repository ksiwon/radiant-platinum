// AI가 **얼마나 센가** — 수로 잰다 (PLAN §7.7 · PARITY §2.3)
//
// ⚠️ **「원작 스크립트를 옮겼다」는 세기의 증거가 아니다.** 옮긴 것이 실제로
// 이기는 수를 고르는지는 다른 질문이고, 여태 그것을 재는 자리가 없었다 —
// `soak.test.ts`는 **안 터지는가**를 보고 `score.test.ts`는 **점수 한 줄**을 본다.
// 둘 다 초록인 채로 AI가 늘 첫 칸만 눌러도 아무도 모른다.
//
// 그래서 **같은 편성끼리 붙인다.** 양쪽 파티가 같으니 이기고 지는 것은 오직
// 고르는 수에서 갈린다.
//
//   무작위   합법 후보 중 하나를 고른다. 아래를 재는 잣대다
//   탐욕     제일 센 기술을 늘 고른다. 처음 하는 사람이 실제로 두는 수다
//
// 상대는 **난천(#870)의 실제 편성과 실제 AI 바이트**다 — 원작이 그에게 준
// 값이 `0x07`(BASIC | EVAL_ATTACK | EXPERT)이고 그것이 이 게임에서 제일 높다.
//
// ⚠️ **문턱을 눈으로 정하지 않는다.** 아래 수는 다 실측이고, 떨어지면 AI가
// 약해진 것이다. `AI_STRENGTH=200`으로 판 수를 늘려 다시 잴 수 있다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BattleAction } from '../choice'
import type { Species } from '../../../data/schema'
import { statsOf } from '../../pokemon/instance'
import { trainerMonToInstance } from '../meta/trainerParty'
import { romMove } from '../sim/bridge'
import { BattleController } from '../sim/controller'
import { movesById, rng, speciesById } from '../sim/fixtures.testkit'
import type { SideMon } from '../sim/session'
import { CHAMPION_FLAGS } from './score'

/** 몇 판씩 붙이나. `AI_STRENGTH=200`으로 늘린다 */
const ROUNDS = Number(process.env.AI_STRENGTH ?? '') || 40
/** 한 판의 수 상한. 넘으면 무승부로 센다 */
const MAX_STEPS = 500

const DATA = resolve(__dirname, '../../../../public/data')
interface TrainerMon { ivs: number; level: number; species: number; moves: number[]; item?: number }
const trainers = (JSON.parse(readFileSync(resolve(DATA, 'trainers.json'), 'utf8')) as {
  trainers: { id: number; ai: number; party: TrainerMon[] }[]
}).trainers

/** 난천 — 챔피언. 파티 여섯, 최고 78레벨 */
const CYNTHIA = 870

function partyOf(id: number, tag: string): SideMon[] {
  const t = trainers[id]
  if (!t) throw new Error(`트레이너 #${String(id)}가 없다`)
  return t.party.map((entry, i) => {
    const species = speciesById.get(entry.species)
    if (!species) throw new Error(`종족 #${String(entry.species)}가 없다`)
    const mon = trainerMonToInstance(entry, species, id, i)
    mon.hp = statsOf(mon, species as Species).hp
    for (const slot of mon.moves) slot.pp = movesById.get(slot.move)?.pp ?? 5
    return { mon, species, key: `${tag}-${String(i)}` }
  })
}

/** 이쪽이 어떻게 두는가 */
type Baseline = (options: BattleAction[], r: () => number) => BattleAction

const random: Baseline = (options, r) => options[Math.floor(r() * options.length)]!

/**
 * 늘 제일 센 기술을 누른다.
 *
 * ⚠️ **상성도 랭크도 안 본다.** 처음 하는 사람이 두는 수를 흉내 낸 것이고,
 * AI가 이 정도는 넘어야 「생각하고 둔다」고 말할 수 있다. 교체는 쓰러졌을
 * 때만 한다 — 그래야 두 쪽의 차이가 **기술 고르기 하나**로 좁혀진다
 */
const greedy: Baseline = (options, r) => {
  const moves = options.filter((a) => a.type === 'move')
  if (moves.length === 0) return random(options, r)
  let best = moves[0]!
  let top = -1
  for (const a of moves) {
    // ⚠️ **`a.id`는 sim의 영어 아이디다** (`earthquake`). 숫자를 뽑아내려
    // 들면 전부 0이 나와서 「탐욕」이 조용히 무작위가 된다 — 실제로 그랬고,
    // 그때 두 잣대가 나란히 100%로 나와서 들켰다
    const rom = romMove(a.id)
    const power = rom === null ? 0 : movesById.get(rom)?.power ?? 0
    if (power > top) { top = power; best = a }
  }
  // 위력이 다 0이면(변화기만 있다) 무작위로 떨어진다 — 굳지 않게
  return top > 0 ? best : random(options, r)
}

interface Score { ai: number; them: number; draw: number }

async function match(baseline: Baseline, rounds: number): Promise<Score> {
  const out: Score = { ai: 0, them: 0, draw: 0 }
  for (let seed = 1; seed <= rounds; seed += 1) {
    const r = rng(seed * 7919)
    const { controller } = await BattleController.start({
      player: { name: '이쪽', team: partyOf(CYNTHIA, 'p1') },
      foe: { name: '난천', team: partyOf(CYNTHIA, 'p2') },
      seed: [seed & 0xffff, (seed * 7) & 0xffff, (seed * 13) & 0xffff, (seed * 29) & 0xffff],
      random: r,
      basePp: (move) => movesById.get(move)?.pp ?? 5,
      // 상대만 AI다. 이쪽은 아래 잣대가 둔다
      ai: { flags: CHAMPION_FLAGS, moves: { byId: movesById } },
    })
    let steps = 0
    while (!controller.ended && steps < MAX_STEPS) {
      const options = controller.actions
      if (options.length === 0) break
      await controller.choose(baseline(options, r))
      steps += 1
    }
    // ⚠️ **`state.winner`는 쪽 이름이 아니라 트레이너 이름이다** (「난천」).
    // 이겼는지 졌는지는 `finish`가 이쪽 기준으로 말해 준다 — `loss`가 AI의 승리다
    if (!controller.ended) out.draw += 1
    else if (controller.finish === 'loss') out.ai += 1
    else if (controller.finish === 'win') out.them += 1
    else out.draw += 1
  }
  return out
}

const pct = (s: Score): number => (s.ai / (s.ai + s.them + s.draw)) * 100
/** 통과해도 찍는다 — 「이겼다」가 아니라 **몇 대 몇인가**가 답이다 */
const show = (label: string, s: Score): void => {
  console.log(`  ${label}: AI ${String(s.ai)}승 · 상대 ${String(s.them)}승 · 무 ${String(s.draw)} → ${pct(s).toFixed(1)}%`)
}

describe('AI 세기 — 같은 편성끼리 (난천 #870 · ai=0x07)', () => {
  it(`무작위를 상대로 이긴다 (${String(ROUNDS)}판)`, async () => {
    const s = await match(random, ROUNDS)
    show('무작위', s)
    // 실측 40/40 (100%). 문턱은 난수가 흔들릴 자리를 남겨 90으로 둔다
    expect(pct(s)).toBeGreaterThanOrEqual(90)
  }, 300_000)

  it(`탐욕(늘 제일 센 기술)을 상대로도 이긴다 (${String(ROUNDS)}판)`, async () => {
    const s = await match(greedy, ROUNDS)
    show('탐욕', s)
    // 실측 40/40 (100%). **같은 편성인데 한 판도 안 진다** — 위력만 보고 누르는
    // 쪽은 상성·랭크·마무리 판단에서 매 턴 조금씩 손해를 보고, 여섯 마리가
    // 도는 동안 그것이 뒤집히지 않는다
    expect(pct(s)).toBeGreaterThanOrEqual(90)
  }, 300_000)

  it('난천의 AI 바이트가 원작 그대로 최고값이다', () => {
    expect(trainers[CYNTHIA]?.ai).toBe(CHAMPION_FLAGS)
    expect(trainers[CYNTHIA]?.party).toHaveLength(6)
    // 928명 중 이 값을 갖는 사람이 얼마나 되는가 — 세기의 상한이 여기다
    const top = trainers.filter((t) => t.ai === CHAMPION_FLAGS).length
    expect(top).toBeGreaterThan(200)
  })
})
