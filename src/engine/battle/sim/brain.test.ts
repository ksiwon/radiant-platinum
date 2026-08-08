// 트레이너 AI가 실제 배틀에서 무엇을 하는가.
//
// 점수 단위 테스트(`ai/score.test.ts`)는 "이 상황에서 이 폭"까지만 본다. 그게 맞아도
// 배선이 어긋나 있으면 AI는 아무 일도 안 한다 — 그러면 배틀은 멀쩡히 돌아가고
// 아무도 눈치 못 챈다.
//
// 그래서 여기서는 **같은 파티로 붙여서 승률을 잰다.** AI를 꽂은 쪽이 무작위로 두는
// 쪽보다 유의미하게 이기지 못하면, 이 AI는 아무것도 안 하고 있는 것이다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { moveFileSchema, trainerFileSchema, type Move } from '../../../data/schema'
import { AI_FLAG, CHAMPION_FLAGS } from '../ai/score'
import { chooseRandom } from '../choice'
import { EXPERT_HANDLED } from '../ai/expert'
import type { BattleAction } from '../choice'
import { BattleController } from './controller'
import { movesById, rng, spawn, speciesById } from './fixtures.testkit'
import type { SideMon } from './session'

const DATA = resolve(__dirname, '../../../../public/data')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8')) as unknown
const moveTable = { byId: movesById }

/**
 * 양쪽이 쓸 파티. 세 마리씩 같은 것을 쓴다 — 파티가 다르면 승률 차이가 AI
 * 때문인지 파티 때문인지 못 가른다.
 *
 * 종족은 **판단이 갈리도록** 골랐다: 무효(고스트 대 노말)와 4배(바위 대 물)가
 * 둘 다 나오는 조합이라야 "제일 센 걸 고른다"가 승패로 이어진다
 */
const ROSTER: [number, number][] = [
  [94, 50], // 팬텀 — 고스트/독
  [95, 50], // 롱스톤 — 바위/땅
  [130, 50], // 갸라도스 — 물/비행
]

function team(prefix: string, seed: number): SideMon[] {
  return ROSTER.map(([id, level], i) => spawn(id, level, seed + i * 17, `${prefix}-${i}`))
}

/** 무작위로 기술 하나. 교체를 강요당한 턴에만 교체를 고른다 */
function randomMove(actions: BattleAction[], random: () => number): BattleAction | null {
  if (!actions.length) return null
  const picks = actions.filter((a) => a.type === 'move')
  const pool = picks.length ? picks : actions
  return pool[Math.floor(random() * pool.length)] ?? pool[0]!
}

/**
 * 한 판. p2가 AI, p1이 무작위다. p2가 이겼으면 true.
 *
 * `smart`가 거짓이면 p2도 무작위다 — 그게 기준선이다. 플래그를 0으로 주는 것으로는
 * 기준선이 안 된다. `TrainerBrain`이 챔피언의 비트를 바닥으로 깔기 때문이다
 * (`CHAMPION_FLAGS`)
 */
async function battle(seed: number, smart: boolean): Promise<boolean | null> {
  const random = rng(seed)
  const controller = await BattleController.start({
    player: { name: '무작위', team: team('p1', seed) },
    // 씨앗까지 같다 — 개체값·성격이 어긋나면 승률 차이가 AI 때문인지 개체 때문인지
    // 못 가른다. 키만 다르다
    foe: { name: 'AI', team: team('p2', seed) },
    random,
    ai: { flags: AI_FLAG.BASIC | AI_FLAG.EVAL_ATTACK | AI_FLAG.EXPERT, moves: moveTable },
    ...(smart ? {} : { foePolicy: (r) => chooseRandom(r, random) }),
  }).then((r) => r.controller)

  try {
    // 상한은 안전장치다. 여기 걸리면 배틀이 안 끝나고 맴돈 것이다
    for (let i = 0; i < 300 && !controller.ended; i++) {
      const action = randomMove(controller.actions, random)
      if (!action) break
      await controller.choose(action)
    }
    if (!controller.ended) return null
    return controller.finish === 'loss'
  } finally {
    controller.destroy()
  }
}

/** 여러 판을 돌려 p2의 승수를 센다 */
async function winRate(smart: boolean, rounds: number): Promise<{ wins: number; played: number }> {
  let wins = 0
  let played = 0
  for (let i = 0; i < rounds; i++) {
    const won = await battle(9000 + i * 31, smart)
    if (won === null) continue
    played++
    if (won) wins++
  }
  return { wins, played }
}

const ROUNDS = 40

describe('AI가 실제로 이긴다', () => {
  it('트레이너 AI가 무작위로 두는 쪽보다 잘 싸운다', async () => {
    // 같은 파티, 같은 씨앗, 같은 상대(무작위). 다른 것은 p2가 AI냐 무작위냐뿐이다
    const off = await winRate(false, ROUNDS)
    const on = await winRate(true, ROUNDS)

    expect(off.played, '기준선 배틀이 안 끝났다').toBeGreaterThan(ROUNDS - 5)
    expect(on.played, 'AI 배틀이 안 끝났다').toBeGreaterThan(ROUNDS - 5)

    const offRate = off.wins / off.played
    const onRate = on.wins / on.played
    // 실측은 5할 대 8할이다. 문턱을 10%p로 둔 것은 sim 내부 난수를 우리가 못 잡아서다
    // — 판마다 흔들리므로 "확실히 벌어진다"만 요구한다
    expect(onRate, `무작위 ${off.wins}/${off.played} · AI ${on.wins}/${on.played}`)
      .toBeGreaterThan(offRate + 0.1)
    // 기준선이 5할 언저리여야 위 비교가 의미가 있다. 여기가 8할이면 파티가 이미
    // 한쪽으로 기운 것이고, 그러면 AI가 아니라 파티를 재고 있는 것이다
    expect(offRate, `기준선 ${off.wins}/${off.played}`).toBeGreaterThan(0.3)
    expect(offRate, `기준선 ${off.wins}/${off.played}`).toBeLessThan(0.7)
  }, 120_000)
})

describe('바닥 플래그', () => {
  it('우리가 까는 바닥이 곧 난천의 것이다', () => {
    // "일반 트레이너라고 AI가 쉬울 필요는 없다"는 이 프로젝트의 선택이다. 그
    // 기준을 지어내지 않고 **챔피언이 실제로 켜고 나오는 값**을 그대로 쓴다
    const trainers = trainerFileSchema.parse(read('trainers.json')).trainers
    expect(trainers[267]!.ai).toBe(CHAMPION_FLAGS)
  })

  it('롬 그대로면 638명이 헛수만 거른다 — 그래서 바닥을 깐다', () => {
    const trainers = trainerFileSchema.parse(read('trainers.json')).trainers
    const fighting = trainers.filter((t) => t.party.length > 0)
    expect(fighting).toHaveLength(927)
    const dumb = fighting.filter((t) => (t.ai & AI_FLAG.EXPERT) === 0)
    expect(dumb.length).toBe(638)
    // 바닥을 깔면 하나도 안 남는다
    expect(fighting.filter((t) => ((t.ai | CHAMPION_FLAGS) & AI_FLAG.EXPERT) === 0)).toHaveLength(0)
  })
})

describe('EXPERT 적용 범위', () => {
  it('EXPERT 트레이너의 지정 기술 중 얼마나 판단되는지', () => {
    // 부분 이식이므로 **얼마나 덮는지를 숫자로 못박는다.** 루틴을 지우면 이 값이
    // 떨어져서 테스트가 깨진다
    const trainers = trainerFileSchema.parse(read('trainers.json')).trainers
    const moves = new Map<number, Move>(
      moveFileSchema.parse(read('moves.json')).moves.map((m) => [m.id, m]),
    )
    let total = 0
    let handled = 0
    for (const t of trainers) {
      if (!(t.ai & AI_FLAG.EXPERT)) continue
      for (const p of t.party) {
        const list = p.moves.length ? p.moves : levelMoves(p.species, p.level)
        for (const id of list) {
          const effect = moves.get(id)?.effect
          if (effect === undefined) continue
          total++
          if (EXPERT_HANDLED.has(effect)) handled++
        }
      }
    }
    expect(total, 'EXPERT 트레이너를 하나도 못 찾았다').toBeGreaterThan(2000)
    const rate = handled / total
    // 실측 42.0% (1261/3004). 원작 분기표가 닿는 범위는 51.8%이므로 그 8할을 덮는다.
    // 남은 9.8%p는 골로피 횟수·도구 소지·미래예지 예약처럼 우리가 아직 안 들고 있는
    // 상태를 봐야 하는 루틴들이고, 하나하나가 1% 미만인 긴 꼬리다
    expect(rate, `적용률 ${(rate * 100).toFixed(1)}% (${handled}/${total})`)
      .toBeGreaterThan(0.40)
  })
})

/** 기술이 지정 안 된 트레이너 개체는 그 레벨의 레벨업 기술로 싸운다 */
function levelMoves(species: number, level: number): number[] {
  const sp = speciesById.get(species)
  if (!sp) return []
  const learned: number[] = []
  for (const l of sp.learnset) {
    if (l.level > level) continue
    const dup = learned.indexOf(l.move)
    if (dup >= 0) learned.splice(dup, 1)
    learned.push(l.move)
  }
  return learned.slice(-4)
}
