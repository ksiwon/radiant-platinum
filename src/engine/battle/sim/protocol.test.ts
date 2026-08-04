// 프로토콜 파싱 + 뷰 접기를 **실전 배틀로** 검증한다.
//
// 파싱은 눈으로 봐서 맞다고 할 수 없다. 그래서 씨앗을 고정한 배틀을 끝까지 굴리고,
// 우리가 프로토콜만 보고 접어 만든 HP·상태이상을 sim이 매 턴 따로 보내 주는
// `|request|`(같은 값의 독립된 출처)와 **한 칸도 안 틀리게** 대조한다.
//
// 이 대조가 실제로 잡은 것: 전지적 스트림을 그냥 읽으면 `|split|` 뒤에 같은 사건이
// 두 줄 와서 데미지가 두 번 들어간다. 눈으로는 "데미지 줄이 나왔다"까지만 보이고
// 숫자가 두 배라는 건 안 보인다.
import { describe, it, expect } from 'vitest'
import { chooseRandom, encodeAction } from '../choice'
import type { BattleRequest, SideId } from '../events'
import { parseCondition, parseDetails } from '../events'
import { applyEvent, emptyView, type BattleView } from '../view'
import { parseLines } from './protocol'
import { rng, spawn } from './fixtures.testkit'
import { BattleSession } from './session'

describe('프로토콜 표기', () => {
  it('상태 표기를 푼다', () => {
    expect(parseCondition('58/62')).toEqual({ hp: 58, maxHp: 62, status: 'ok' })
    expect(parseCondition('58/62 par')).toEqual({ hp: 58, maxHp: 62, status: 'par' })
    expect(parseCondition('100/100 tox')).toEqual({ hp: 100, maxHp: 100, status: 'tox' })
    // 쓰러진 줄은 최대치를 안 알려준다. 0으로 채우면 HP 바가 0/0이 되어 NaN이 된다
    expect(parseCondition('0 fnt')).toEqual({ hp: 0, maxHp: null, status: 'ok' })
  })

  it('종족 표기를 푼다', () => {
    expect(parseDetails('Turtwig, L5, F')).toEqual({
      speciesName: 'Turtwig', level: 5, gender: 'female', shiny: false,
    })
    // 레벨 표기가 없으면 100이다 — 프로토콜이 100을 생략한다
    expect(parseDetails('Palkia')).toEqual({
      speciesName: 'Palkia', level: 100, gender: 'genderless', shiny: false,
    })
    expect(parseDetails('Starly, L20, M, shiny')).toEqual({
      speciesName: 'Starly', level: 20, gender: 'male', shiny: true,
    })
  })
})

/** 4세대 각 계열에서 하나씩. 특성·상태이상·타입이 골고루 나오도록 고른다 */
const POOL = [
  387, 390, 393, 396, 399, 403, 406, 417, 418, 425, 427, 431, 434, 436, 442,
  443, 446, 447, 449, 451, 453, 456, 459, 25, 35, 74, 92, 95, 129, 143, 197, 248,
]

interface Playout {
  /** 뷰와 `|request|`가 어긋난 곳. 비어 있어야 한다 */
  mismatches: string[]
  /** 아직 모양을 안 준 프로토콜 명령 */
  others: Map<string, string>
  turns: number
  view: BattleView
  /** 한 번이라도 관측된 사건 종류 — 배틀이 실제로 굴러갔다는 증거 */
  kinds: Set<string>
}

/**
 * 배틀 하나를 끝까지 굴리며 매 정산마다 뷰와 요청을 대조한다.
 *
 * 뷰는 **p1 스트림만** 보고 만든다. p2의 요청은 상대 HP를 우리가 맞게 접었는지
 * 확인하는 두 번째 출처로만 쓴다 — 그쪽 줄을 뷰에 섞으면 대조가 자기 자신과의
 * 비교가 되어 아무것도 검증하지 못한다.
 */
async function playout(seed: number, teamSize: number): Promise<Playout> {
  const r = rng(seed)
  const pick = (i: number) => spawn(
    POOL[Math.floor(r() * POOL.length)]!, 15 + Math.floor(r() * 55), seed * 100 + i,
  )
  const battle = new BattleSession({
    player: { name: '빛나', team: Array.from({ length: teamSize }, (_, i) => pick(i)) },
    foe: { name: '진구지', team: Array.from({ length: teamSize }, (_, i) => pick(i + 10)) },
    seed: [seed & 0xffff, (seed * 7) & 0xffff, (seed * 13) & 0xffff, (seed * 29) & 0xffff],
  })

  let view = emptyView()
  const request: Record<SideId, BattleRequest | null> = { p1: null, p2: null }
  const out: Playout = {
    mismatches: [], others: new Map(), turns: 0, view, kinds: new Set(),
  }

  for (let step = 0; step < 400; step++) {
    const lines = await battle.settle()

    for (const e of parseLines(lines.p1)) {
      out.kinds.add(e.kind)
      if (e.kind === 'other') out.others.set(e.cmd, `${e.cmd}|${e.args.join('|')}`)
      else if (e.kind === 'request') request.p1 = e.request
      view = applyEvent(view, e)
    }
    for (const e of parseLines(lines.p2)) if (e.kind === 'request') request.p2 = e.request

    compare(view, request.p1, 'p1', seed, out.mismatches)
    compare(view, request.p2, 'p2', seed, out.mismatches)

    if (view.ended) break
    let sent = false
    for (const side of ['p1', 'p2'] as const) {
      const action = chooseRandom(request[side], r)
      if (!action) continue
      battle.send(`${side} ${encodeAction(action)}`)
      request[side] = null
      sent = true
    }
    if (!sent) break
  }

  battle.destroy()
  out.turns = view.turn
  out.view = view
  return out
}

/** 요청이 말하는 "지금 나와 있는 우리 애"의 상태 */
function activeInRequest(request: BattleRequest | null) {
  return request?.side.pokemon.find((p) => p.active) ?? null
}

function compare(
  view: BattleView,
  request: BattleRequest | null,
  side: SideId,
  seed: number,
  into: string[],
): void {
  const truth = activeInRequest(request)
  const mine = view.active[side]
  if (!truth || !mine) return
  const c = parseCondition(truth.condition)
  const at = `#${seed} 턴${view.turn} ${side}`
  if (mine.hp !== c.hp) into.push(`${at} HP ${mine.hp} vs ${c.hp}`)
  if (c.maxHp !== null && mine.maxHp !== c.maxHp) {
    into.push(`${at} 최대HP ${mine.maxHp} vs ${c.maxHp}`)
  }
  // 쓰러진 줄(`0 fnt`)은 상태이상 자리를 안 쓴다. HP가 남았을 때만 본다
  if (c.hp > 0 && mine.status !== c.status) into.push(`${at} 상태 ${mine.status} vs ${c.status}`)
  if (mine.fainted !== (c.hp <= 0)) into.push(`${at} 기절 ${mine.fainted}`)
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

/**
 * 8배틀을 굴려 실제로 관측된, 아직 모양을 안 준 명령.
 *
 * 전부 **부가 연출**이다 — 씨뿌리기가 걸렸다(`-start`), 압정이 깔렸다(`-sidestart`),
 * 2타 맞았다(`-hitcount`) 같은 것들. 진행과 HP에는 영향이 없어서 지금 없어도
 * 배틀이 성립한다. 연출 계층(PLAN §7.3)을 만들 때 여기부터 채우면 된다
 */
const UNMODELLED = [
  '-activate', '-end', '-fieldend', '-fieldstart', '-ohko',
  '-prepare', '-sideend', '-sidestart', '-start',
]

/** 배틀 굴리기는 비싸다. 두 테스트가 같은 판을 나눠 쓴다 */
let cached: Promise<Playout[]> | null = null
const playouts = () => (cached ??= Promise.all(SEEDS.map((s) => playout(s, 3))))

describe('뷰는 sim과 같은 것을 본다', () => {
  it('여러 배틀을 끝까지 굴려도 HP·상태가 한 번도 안 어긋난다', async () => {
    const runs = await playouts()
    const bad = runs.flatMap((p) => p.mismatches)
    expect(bad, bad.slice(0, 8).join(' / ')).toHaveLength(0)

    // 배틀이 실제로 굴러갔다는 증거. 안 그러면 위 단언이 공허하다
    const totalTurns = runs.reduce((n, p) => n + p.turns, 0)
    expect(totalTurns, '턴이 거의 안 돌았다').toBeGreaterThan(40)
    expect(runs.filter((p) => p.view.ended).length, '끝까지 간 배틀이 없다').toBeGreaterThan(0)
    for (const kind of ['switch', 'move', 'damage', 'faint', 'turn']) {
      expect(runs.some((p) => p.kinds.has(kind)), `${kind} 이벤트가 한 번도 안 나왔다`).toBe(true)
    }
  }, 60_000)

  it('아직 모양을 안 준 프로토콜 명령 목록', async () => {
    // 모르는 줄은 버리지 않고 `other`로 남긴다. 여기 목록이 곧 "연출이 아직 없는
    // 사건"이라, 늘어나면 알아채야 한다. 배틀 진행·화면에 필요한 명령이 여기
    // 있으면 안 된다 — 아래 목록은 전부 부가 연출이다
    const runs = await playouts()
    const seen = new Set<string>()
    for (const p of runs) for (const cmd of p.others.keys()) seen.add(cmd)
    for (const need of ['switch', 'move', '-damage', '-heal', 'faint', 'turn', 'request']) {
      expect(seen.has(need), `${need}는 반드시 다뤄져야 한다`).toBe(false)
    }
    expect([...seen].sort()).toEqual(UNMODELLED)
  }, 60_000)
})
