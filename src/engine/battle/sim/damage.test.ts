// AI의 데미지 어림을 sim이 실제로 깎는 값과 맞춰 본다.
//
// AI는 "어느 기술이 제일 센가"와 "이걸로 쓰러뜨릴 수 있나"를 스스로 계산해서 판단한다.
// 그 계산이 틀리면 AI는 멀쩡히 돌아가면서 계속 잘못된 수를 둔다 — 배틀은 안 깨지고,
// 테스트도 안 깨지고, 아무도 모른다.
//
// 그래서 **실제 배틀을 한 턴 굴려서** 깎인 HP와 어림값을 비교한다. 4세대 데미지는
// 85~100% 사이에서 흔들리므로, 어림값의 그 구간 안에 관측값이 들어와야 한다.
import { describe, it, expect } from 'vitest'
import { estimateDamage } from '../ai/damage'
import type { AiMon, AiMove } from '../ai/context'
import { noBoosts } from '../view'
import { statsOf } from '../../pokemon/instance'
import { BattleController } from './controller'
import { itemsById, movesById, rng, spawn } from './fixtures.testkit'
import type { SideMon } from './session'

/** 물장구 — 아무 일도 안 일어나는 기술. 상대가 방해하지 않게 이것만 들려 보낸다 */
const SPLASH = 150

/** 기술 한 칸만 들려 보낸다. 그래야 어느 기술이 깎았는지가 확실하다 */
function withMove(side: SideMon, move: number): SideMon {
  const pp = movesById.get(move)?.pp ?? 10
  return { ...side, mon: { ...side.mon, moves: [{ move, pp, ppUps: 0 }] } }
}

/** 도구를 들려 보낸다. 0이면 안 든다 */
function withItem(side: SideMon, item: number): SideMon {
  return item === 0 ? side : { ...side, mon: { ...side.mon, heldItem: item } }
}

function toAiMon(side: SideMon): AiMon {
  const stats = statsOf(side.mon, side.species)
  // ⚠️ **`sim/brain`이 채우는 것과 같은 값을 같은 자리에서 뽑는다.** 여기서
  // 0으로 두면 도구를 들려 보내 놓고 어림은 안 든 셈으로 재게 된다
  const it = side.mon.heldItem > 0 ? itemsById.get(side.mon.heldItem) : undefined
  const ngType = it?.naturalGiftType ?? 31
  return {
    species: side.species.id,
    types: side.species.types,
    level: side.mon.level,
    hp: side.mon.hp,
    maxHp: stats.hp,
    status: 'ok',
    boosts: noBoosts(),
    ability: side.species.abilities[0],
    stats,
    heldItem: side.mon.heldItem,
    itemEffect: it?.holdEffect ?? 0,
    itemParam: it?.effectParam ?? 0,
    naturalGiftPower: it?.naturalGiftPower ?? 0,
    naturalGiftType: ngType === 31 ? -1 : ngType,
    weightHg: side.species.weightHg,
    gender: 'male',
    bench: 0,
    volatiles: new Set(),
    side: new Map(),
  }
}

function toAiMove(id: number): AiMove {
  const m = movesById.get(id)
  if (!m) throw new Error(`기술 #${id}가 데이터에 없다`)
  return {
    slot: 1,
    id,
    effect: m.effect,
    power: m.power,
    type: m.type,
    category: m.category,
    accuracy: m.accuracy,
    priority: m.priority,
  }
}

interface Sample {
  label: string
  observed: number
  low: number
  high: number
}

/**
 * 한 턴만 굴려서 상대가 얼마나 깎였는지 본다.
 *
 * 급소가 터진 턴은 버린다 — 원작 AI도 급소는 안 세므로 비교 대상이 아니다.
 * 빗나간 턴도 버린다
 */
async function oneHit(
  attackerId: number,
  defenderId: number,
  move: number,
  seed: number,
  item = 0,
): Promise<Sample | null> {
  // 레벨을 벌려 놓는다. 한 방에 쓰러지면 깎인 HP가 최대치에서 잘려서, 어림값이
  // 얼마나 큰지와 무관하게 "최대 HP만큼 깎였다"로만 보인다 — 비교가 성립하지 않는다
  const attacker = withItem(withMove(spawn(attackerId, 35, seed, 'a'), move), item)
  const defender = withMove(spawn(defenderId, 70, seed + 7, 'd'), SPLASH)

  const { controller, step } = await BattleController.start({
    player: { name: '공격', team: [attacker] },
    foe: { name: '방어', team: [defender] },
    random: rng(seed),
    // 도구를 든 판을 재려면 sim에도 도구가 들어가야 한다
    itemName: (id) => itemsById.get(id)?.name,
  })
  try {
    const maxHp = step.view.active.p2a?.maxHp ?? 0
    const result = await controller.choose(controller.actions[0]!)
    if (result.events.some((e) => e.kind === 'crit')) return null
    if (result.events.some((e) => e.kind === 'miss')) return null
    const hit = result.events.find((e) => e.kind === 'damage' && e.actor.side === 'p2')
    if (!hit || hit.kind !== 'damage') return null

    // 쓰러진 판은 못 쓴다 — 깎인 양이 최대 HP에서 잘린다
    if (hit.condition.hp <= 0) return null
    const observed = maxHp - hit.condition.hp
    if (observed <= 0) return null
    const aiMove = toAiMove(move)
    const self = toAiMon(attacker)
    const foe = toAiMon(defender)
    return {
      label: `#${attackerId} ${move}→ #${defenderId}`,
      observed,
      low: estimateDamage(aiMove, self, foe, null, 85),
      high: estimateDamage(aiMove, self, foe, null, 100),
    }
  } finally {
    controller.destroy()
  }
}

/** 자속·상성·물리특수가 골고루 섞이도록 골랐다 */
const CASES: [number, number, number, string][] = [
  [130, 95, 57, '갸라도스 물의파동 → 롱스톤(4배·자속)'],
  [94, 63, 94, '팬텀 사이코키네시스 → 캐이시(반감·특수)'],
  [95, 130, 89, '롱스톤 지진 → 갸라도스(무효 아님·물리)'],
  [59, 387, 53, '윈디 화염방사 → 모부기(2배·자속)'],
  [130, 387, 44, '갸라도스 물기 → 모부기(무자속·물리)'],
  [63, 95, 94, '캐이시 사이코키네시스 → 롱스톤(자속·특수)'],
  [387, 95, 71, '모부기 흡수 → 롱스톤(4배·자속·특수)'],
  [59, 95, 52, '윈디 불꽃세례 → 롱스톤(반감·자속)'],
]

/**
 * 도구를 든 판 (REPAIR §7).
 *
 * ⚠️ **여기 있는 것은 전부 `BattleSystem_CalcMoveDamage` **안**에서 곱해지는
 * 도구다.** 생명의구슬(계산이 끝난 뒤 ×1.3)과 달인의띠(효과가 굉장할 때 ×1.2)는
 * 그 함수 밖이라 **원작 AI도 안 본다** — 넣으면 어림이 sim보다 커진다
 */
const ITEM_CASES: [number, number, number, number, string][] = [
  [130, 387, 44, 220, '갸라도스 + 구애머리띠 (공격 ×1.5, 물기)'],
  [59, 387, 53, 249, '윈디 + 목탄 (불꽃 위력 ×1.2, 화염방사)'],
  [95, 63, 89, 266, '롱스톤 + 힘의머리띠 (물리 위력 ×1.1, 지진)'],
  [63, 95, 94, 297, '캐이시 + 구애안경 (특공 ×1.5, 사이코키네시스)'],
  [59, 95, 52, 249, '윈디 + 목탄 (반감 자속, 불꽃세례)'],
]

describe('AI의 데미지 어림', () => {
  it('sim이 실제로 깎는 값이 어림한 85~100% 구간 안에 들어온다', async () => {
    const samples: Sample[] = []
    for (const [atk, def, move, label] of CASES) {
      // 씨앗을 여러 개 돌려 급소·빗나감으로 버려지는 판을 메운다
      for (let s = 0; s < 4 && samples.length < CASES.length * 2; s++) {
        const got = await oneHit(atk, def, move, 4200 + s * 13 + atk)
        if (got) samples.push({ ...got, label })
      }
    }
    expect(samples.length, '한 턴도 못 재봤다').toBeGreaterThan(CASES.length)

    const bad = samples
      .filter((s) => s.observed < s.low || s.observed > s.high)
      .map((s) => `${s.label}: 실제 ${s.observed} ∉ [${s.low}, ${s.high}]`)
    expect(bad, bad.join(' / ')).toEqual([])

    // 구간이 붙어 있어야 위 단언이 의미가 있다. [0, 9999]면 뭐든 통과한다.
    // 85~100%는 이론상 1.176배인데, 정수로 자르는 자리가 여러 군데라 작은 값에서는
    // 조금 더 벌어진다 — 1.5를 넘으면 계산 자체가 이상한 것이다
    for (const s of samples) {
      expect(s.high, `${s.label}: 어림값이 0이다`).toBeGreaterThan(0)
      expect(s.high / Math.max(1, s.low), `${s.label}: 구간이 너무 넓다`).toBeLessThanOrEqual(1.5)
    }
  }, 60_000)

  // ⚠️ **도구를 든 판이 없으면 §7의 고침이 아무것도 못 지킨다.** 도구 보정을
  // 통째로 빼도 위 시험은 그대로 초록이다 — 거기 쓰이는 개체가 아무것도 안 들기
  // 때문이다
  it('⚠️ 도구를 든 판도 어림한 구간 안에 들어온다', async () => {
    const samples: Sample[] = []
    for (const [atk, def, move, item, label] of ITEM_CASES) {
      // 급소·빗나감·쓰러짐으로 버려지는 판이 있어 씨앗을 여럿 굴린다
      for (let s = 0; s < 12; s++) {
        const got = await oneHit(atk, def, move, 8800 + s * 17 + atk, item)
        if (got) { samples.push({ ...got, label }); break }
      }
    }
    expect(samples.length, '한 턴도 못 재봤다').toBe(ITEM_CASES.length)

    const bad = samples
      .filter((s) => s.observed < s.low || s.observed > s.high)
      .map((s) => `${s.label}: 실제 ${s.observed} ∉ [${s.low}, ${s.high}]`)
    expect(bad, bad.join(' / ')).toEqual([])
  }, 60_000)

  // ⚠️ **이빨이 있는지 여기서 본다.** 위 시험은 「구간 안에 든다」라, 어림이
  // 도구를 아예 안 봐도 넉넉한 구간에 우연히 들어올 수 있다. 도구를 든 어림이
  // 안 든 어림보다 **실제로 더 큰지**를 따로 못 박는다
  it('⚠️ 도구를 들면 어림값이 커진다 — 안 그러면 보정이 안 걸린 것이다', () => {
    const bare = spawn(130, 35, 4242, 'a')
    const band = withItem(bare, 220)
    const foe = spawn(387, 70, 4249, 'd')
    const bite = toAiMove(44)
    const without = estimateDamage(bite, toAiMon(bare), toAiMon(foe), null, 100)
    const with_ = estimateDamage(bite, toAiMon(band), toAiMon(foe), null, 100)
    expect(without).toBeGreaterThan(0)
    expect(with_).toBeGreaterThan(without)
  })
})
