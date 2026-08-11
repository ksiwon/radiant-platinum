// 배틀을 **수백 판 굴려서** 깨지는 자리를 찾는다 (PLAN §7.2).
//
// ⚠️ **손으로 고른 판으로는 이걸 못 잡는다.** `controller.test.ts`가 보는 것은
// 우리가 미리 아는 상황이다 — 모부기와 찌르꼬, 3대3, 볼 하나. 실제로 사용자가
// 만나는 배틀은 493종 × 레벨 × 특성 × 도구 × AI 조합이라, 한 조합에서만 서는
// 버그는 그 목록에 영영 안 걸린다.
//
// 그래서 **무작위로 짜고 무작위로 두고, 대신 불변식을 재다.** 무엇이 나올지는
// 모르지만 "이런 일은 절대 없어야 한다"는 알고 있다:
//
//   ① 예외가 안 난다 — 한 판이라도 터지면 화면에서 배틀 창이 그대로 닫힌다
//   ② 반드시 끝난다 — 고를 것이 없는데 안 끝난 상태(`stuck`)가 0
//   ③ 돌려준 사건만으로 마지막 화면이 그대로 나온다 (연출이 보는 것 = 실제)
//   ④ 박자로 펴도 안 터진다 (`buildBeats`) — 연출 계층까지 태운다
//   ⑤ 체력·PP가 범위를 안 벗어난다
//   ⑥ 빈 턴 칸(`IDLE_MOVE`)이 화면에 안 샌다
//   ⑦ 끝났으면 `finish`가 반드시 정해진다 (세이브가 이걸로 갈린다)
//   ⑧ 화면에 영어가 안 뜬다 — 이름을 못 찾은 자리는 원문이 그대로 새어 나온다
//
// 기본은 짧게 돈다. **길게 돌리려면 `BATTLE_SOAK=500`** 처럼 판 수를 준다 —
// 버그를 찾을 때 쓰고, 찾은 것은 여기가 아니라 제 자리의 시험으로 옮긴다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import type { BattleAction } from '../choice'
import type { BattleEvent } from '../events'
import type { Item } from '../../../data/schema'
import { applyEvents, emptyView } from '../view'
import { buildBeats } from '../playback'
import { Ball } from '../meta/capture'
import { TrainerItems } from '../meta/trainerItems'
import { battleText } from '../../../ui/battle/messages'
import { BattleController } from './controller'
import { IDLE_MOVE_ID } from './session'
import { movesById, rng, speciesById, spawn } from './fixtures.testkit'

/** 몇 판 굴리나. `BATTLE_SOAK=500 pnpm test`로 늘린다 */
const ROUNDS = Number(process.env.BATTLE_SOAK ?? '') || 24

const DATA = resolve(__dirname, '../../../../public/data')
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(DATA, name), 'utf8')) as T

const itemList = read<{ items: Item[] }>('items.json').items
const itemTable = { get: (id: number) => itemList[id]! }
/** 트레이너 가방에 넣을 회복약 두 칸. 도구를 쓰는 갈래를 태우는 것이 목적이다 */
const POTIONS: readonly number[] = [
  itemList.findIndex((i) => i.name === 'super_potion'),
  itemList.findIndex((i) => i.name === 'full_restore'),
]
/** 화면이 쓰는 것과 **같은 표**다 (`BattleScreen`의 `useNames`) */
const NAMES = {
  species: read<string[]>('names/species.ko.json'),
  moves: read<string[]>('names/moves.ko.json'),
  abilities: read<{ abilities: string[] }>('names/labels.ko.json').abilities,
  items: read<string[]>('names/items.ko.json'),
}

/**
 * 짤 수 있는 종족. 우리 자료에 있고 **기술을 하나라도 아는** 것만 고른다.
 *
 * 기술이 0개면 `toSet`이 발버둥만 남기는데, 그건 그것대로 정당한 판이라 따로
 * 한 판 섞는다(아래 `bare`) — 무작위 표본이 통째로 그쪽으로 쏠리면 안 된다
 */
const ROSTER = [...speciesById.keys()].filter((id) => id >= 1 && id <= 493)

/** 이번 판의 설정. 씨앗 하나에서 전부 뽑는다 — 실패하면 그 씨앗으로 재현된다 */
interface Plan {
  seed: number
  mine: number[]
  theirs: number[]
  levels: [number, number]
  trainer: boolean
  aiFlags: number
  shift: boolean
  withItems: boolean
  noCrit: boolean
}

function planOf(seed: number): Plan {
  const r = rng(seed)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)]!
  const size = () => 1 + Math.floor(r() * 6)
  const trainer = r() < 0.55
  return {
    seed,
    mine: Array.from({ length: size() }, () => pick(ROSTER)),
    theirs: Array.from({ length: size() }, () => pick(ROSTER)),
    levels: [2 + Math.floor(r() * 70), 2 + Math.floor(r() * 70)],
    trainer,
    aiFlags: Math.floor(r() * 0x100),
    shift: trainer && r() < 0.4,
    withItems: trainer && r() < 0.5,
    noCrit: r() < 0.15,
  }
}

/** 한 판에서 깨진 것들. 비어 있어야 통과다 */
interface Broken {
  seed: number
  why: string[]
}

/**
 * 한 판을 끝까지 굴린다.
 *
 * 고르는 것도 무작위다 — 기술·교체뿐 아니라 볼·도망·가방까지 섞는다. 사람이
 * 실제로 누르는 것이 그 전부라서다
 */
async function soak(plan: Plan): Promise<Broken> {
  const why: string[] = []
  const r = rng(plan.seed ^ 0x5f3a)
  const team = (ids: number[], level: number, tag: string) =>
    ids.map((id, i) => spawn(id, Math.max(1, Math.min(100, level + i)), plan.seed * 97 + i, `${tag}-${i}`))

  const mine = team(plan.mine, plan.levels[0], 'p1')
  /** 그 마리가 **실제로 아는** 기술 수. 화면에 이보다 많이 뜨면 빈 턴 칸이 샌 것이다*/
  const realMoves = new Map(mine.map((m) => [m.key, m.mon.moves.length]))

  const { controller, step } = await BattleController.start({
    player: { name: '빛나', team: mine },
    foe: { name: plan.trainer ? '상대' : '야생', team: team(plan.theirs, plan.levels[1], 'p2') },
    seed: [plan.seed & 0xffff, (plan.seed * 7) & 0xffff,
      (plan.seed * 13) & 0xffff, (plan.seed * 29) & 0xffff],
    random: r,
    basePp: (move) => movesById.get(move)?.pp ?? 5,
    ...(plan.noCrit ? { noCrit: true } : {}),
    ...(plan.trainer ? { ai: { flags: plan.aiFlags, moves: { byId: movesById } } } : {}),
    ...(plan.shift ? { shift: true } : {}),
    ...(plan.withItems
      ? {
          items: {
            bag: new TrainerItems(POTIONS, itemTable),
            item: (id: number) => itemList[id]!,
          },
        }
      : {}),
  })

  const all: BattleEvent[] = [...step.events]
  const seenKinds = new Set<string>()
  let steps = 0

  const note = (msg: string) => { if (!why.includes(msg)) why.push(msg) }

  /** 어느 시점에서든 체력이 범위를 벗어나면 안 된다 */
  const checkHp = () => {
    for (const side of ['p1', 'p2'] as const) {
      const mon = controller.state.active[side]
      if (!mon) continue
      if (mon.hp < 0 || mon.hp > mon.maxHp) note(`${side} 체력이 범위 밖 ${String(mon.hp)}/${String(mon.maxHp)}`)
      if (mon.maxHp <= 0) note(`${side} 최대 체력이 0 이하`)
    }
  }

  /**
   * 빈 턴 칸이 화면에 새면 플레이어가 "아무것도 안 하기"를 고를 수 있게 된다.
   *
   * ⚠️ **기술 이름으로는 못 가른다.** 잉어킹처럼 물장구를 진짜로 아는 애가 있다.
   * 그래서 **개수**로 잰다 — 화면에 뜬 칸이 그 마리가 아는 것보다 많으면 샌 것이다
   */
  const checkHidden = () => {
    /**
     * 칸이 늘었는데 **맨 뒤가 빈 턴 칸**이면 샌 것이다.
     *
     * ⚠️ 개수만으로는 못 가른다. 변신한 메타몽은 아는 기술이 하나인데 화면에
     * 넷이 뜨고 그게 맞다 — 그때 맨 뒤는 베껴 온 기술이지 우리 칸이 아니다
     */
    const leaked = (ids: readonly string[], real: number | undefined): boolean =>
      real !== undefined && ids.length > real && ids[ids.length - 1] === IDLE_MOVE_ID
    const moves = controller.actions.filter((a) => a.type === 'move')
    const key = controller.state.active.p1?.key
    if (leaked(moves.map((a) => a.id), key === undefined ? undefined : realMoves.get(key))) {
      note(`기술 목록 맨 뒤에 빈 턴 칸이 있다 (${String(moves.length)}개)`)
    }
    for (const slot of controller.party) {
      if (leaked(slot.moves.map((m) => m.id), realMoves.get(slot.key))) {
        note(`파티 ${slot.active ? '선두' : '벤치'} 맨 뒤에 빈 턴 칸이 있다 (${String(slot.moves.length)}개)`)
      }
    }
  }

  while (!controller.ended && steps < 400) {
    checkHp()
    checkHidden()
    if (controller.shiftAsk !== null) {
      all.push(...(await controller.answerShift(r() < 0.5)).events)
      steps++
      continue
    }
    const options: BattleAction[] = controller.actions
    if (options.length === 0) {
      note('고를 것이 없는데 안 끝났다')
      break
    }
    if (controller.mustSwitch && options.some((a) => a.type === 'move')) {
      note('강제 교체 턴에 기술이 보인다')
    }

    // 사람이 실제로 누르는 것들. 야생전에서만 볼과 도망이 열린다
    const dice = r()
    let next
    if (!plan.trainer && dice < 0.06) {
      next = await controller.throwBall(Ball.POKE, {
        caughtBefore: false, inWater: false, darkness: false,
      })
    } else if (!plan.trainer && dice < 0.1) {
      next = await controller.run()
    } else {
      next = await controller.choose(options[Math.floor(r() * options.length)]!)
    }
    all.push(...next.events)
    for (const e of next.events) seenKinds.add(e.kind)
    steps++
  }

  if (steps >= 400) note('400수 안에 안 끝났다')
  if (controller.ended && controller.finish === null) note('끝났는데 finish가 null이다')

  // ③ 걸음이 돌려준 사건만으로 같은 화면이 나오는가 — 연출이 보는 것이 곧 실제인가
  const rebuilt = applyEvents(emptyView(), all)
  const live = controller.state
  if (rebuilt.ended !== live.ended) note('다시 접으면 끝난 여부가 다르다')
  if (rebuilt.winner !== live.winner) note('다시 접으면 승자가 다르다')
  if (rebuilt.turn !== live.turn) note(`다시 접으면 턴이 다르다 ${String(rebuilt.turn)}≠${String(live.turn)}`)
  for (const side of ['p1', 'p2'] as const) {
    if (JSON.stringify(rebuilt.active[side]) !== JSON.stringify(live.active[side])) {
      note(`다시 접으면 ${side}의 개체가 다르다`)
    }
  }

  // ④ 박자로 펴도 안 터지고, ⑧ 화면에 영어가 안 샌다
  const label = (a: { side: 'p1' | 'p2' }) => (a.side === 'p1' ? '이쪽' : '저쪽')
  const beats = buildBeats(all, (e) => battleText(e, { names: NAMES, label }))
  for (const b of beats) {
    if (b.hold < 0 || !Number.isFinite(b.hold)) note('박자의 쉼이 이상하다')
    // 이름을 못 찾으면 프로토콜의 영어 이름이 그대로 나온다. 로마자 낱말이
    // 두 글자 이상 이어지면 그것이다 — 한국어 문장에는 나올 자리가 없다
    if (b.text && /[A-Za-z]{3,}/.test(b.text)) note(`화면에 영어가 떴다: ${b.text.slice(0, 40)}`)
  }

  // ⑤ 끝난 뒤 파티 상태. 세이브에 이대로 되돌아간다
  for (const side of ['p1', 'p2'] as const) {
    for (const mon of controller.results(side)) {
      if (mon.hp < 0 || mon.hp > mon.maxHp) note(`${mon.key} 최종 체력 범위 밖`)
      if (mon.fainted !== (mon.hp === 0)) note(`${mon.key} 기절 표시와 체력이 안 맞는다`)
      for (const slot of mon.pp) {
        if (slot.pp < 0) note(`${mon.key} PP가 음수`)
      }
    }
  }
  const keys = controller.results('p1').map((m) => m.key).sort()
  if (keys.length !== plan.mine.length) note('우리 파티 수가 달라졌다')

  controller.destroy()
  return { seed: plan.seed, why }
}

describe('배틀 담금질', () => {
  it(`무작위 ${String(ROUNDS)}판이 전부 불변식을 지킨다`, async () => {
    const broken: Broken[] = []
    for (let i = 0; i < ROUNDS; i++) {
      const plan = planOf(1000 + i)
      let result: Broken
      try {
        result = await soak(plan)
      } catch (e) {
        result = { seed: plan.seed, why: [`예외: ${String(e)}`] }
      }
      if (result.why.length > 0) broken.push(result)
    }
    // 실패는 **씨앗과 함께** 적는다. 그 숫자 하나로 같은 판을 다시 굴릴 수 있다
    expect(broken.map((b) => `씨앗 ${String(b.seed)}: ${b.why.join(' · ')}`)).toEqual([])
    // 한 판이 0.5초쯤이다. 못 박아 두면 판 수를 늘렸을 때 **시간 초과가 실패로**
    // 나와서, 불변식이 깨진 것과 그냥 오래 걸린 것을 못 가른다 (1,500판에서
    // 실제로 그랬다). 판 수에 맞춰 늘린다
  }, 60_000 + ROUNDS * 2_000)
})
