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
import { activeAt, applyEvent, emptyView, type BattleView } from '../view'
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

describe('지속 효과 접기', () => {
  // 트레이너 AI가 이 세 갈래를 본다 (PLAN §7.7). 하나라도 안 쌓이면 AI는
  // 리플렉터가 깔린 줄 모르고 깨트리다를 안 쓴다 — 배틀은 멀쩡히 돌아간다

  const fold = (lines: string[]) => {
    let view = emptyView()
    for (const e of parseLines(lines)) view = applyEvent(view, e)
    return view
  }

  it('진영 효과가 쪽별로 쌓이고 걷힌다', () => {
    const on = fold([
      '|-sidestart|p1: 빛나|Reflect',
      '|-sidestart|p2: 난천|move: Light Screen',
    ])
    expect(on.sideConditions.p1.has('reflect')).toBe(true)
    expect(on.sideConditions.p2.has('lightscreen')).toBe(true)
    // 쪽이 안 섞여야 한다 — 섞이면 AI가 자기 벽을 상대 벽으로 착각한다
    expect(on.sideConditions.p1.has('lightscreen')).toBe(false)

    const off = fold([
      '|-sidestart|p1: 빛나|Reflect',
      '|-sideend|p1: 빛나|Reflect',
    ])
    expect(off.sideConditions.p1.has('reflect')).toBe(false)
  })

  it('압정은 층수를 센다', () => {
    // 프로토콜은 층이 늘 때마다 같은 줄을 한 번 더 보낸다. 집합으로 담으면
    // 1층과 3층이 구분이 안 되고, AI는 다 찼는데도 계속 깔려 한다
    const two = fold([
      '|-sidestart|p2: 난천|Spikes',
      '|-sidestart|p2: 난천|Spikes',
    ])
    expect(two.sideConditions.p2.get('spikes')).toBe(2)

    // 걷힐 때는 층이 몇이든 한 번에 사라진다
    const gone = fold([
      '|-sidestart|p2: 난천|Spikes',
      '|-sidestart|p2: 난천|Spikes',
      '|-sideend|p2: 난천|Spikes',
    ])
    expect(gone.sideConditions.p2.has('spikes')).toBe(false)
  })

  it('개체 효과는 그 자리에 붙고 교체로 사라진다', () => {
    const seeded = fold([
      '|switch|p2a: 난천|Roserade, L58, F|100/100',
      '|-start|p2a: 난천|move: Leech Seed',
      '|-start|p2a: 난천|Substitute',
    ])
    expect(seeded.active.p2a?.volatiles.has('leechseed')).toBe(true)
    expect(seeded.active.p2a?.volatiles.has('substitute')).toBe(true)

    const switched = fold([
      '|switch|p2a: 난천|Roserade, L58, F|100/100',
      '|-start|p2a: 난천|move: Leech Seed',
      '|switch|p2a: 난천2|Milotic, L58, F|100/100',
    ])
    expect(switched.active.p2a?.volatiles.size).toBe(0)
  })

  it('배북은 랭크를 **그 값으로** 못 박는다', () => {
    // ⚠️ `-setboost`는 절대값이다. 한동안 `other`로 흘려 버려서, 배북을 쓴 뒤에도
    // 화면과 AI가 공격 랭크 0을 보고 있었다 — AI는 그 상태에서 배북을 또 골랐다
    const drum = fold([
      '|switch|p2a: 난천|Snorlax, L58, M|100/100',
      '|-boost|p2a: 난천|atk|1',
      '|-setboost|p2a: 난천|atk|6|[from] move: Belly Drum',
    ])
    expect(drum.active.p2a?.boosts.atk).toBe(6)
  })

  it('흑안개는 **양쪽 자리 전부**를 되돌린다', () => {
    const hazed = fold([
      '|switch|p1a: 빛나|Milotic, L58, F|100/100',
      '|switch|p2a: 난천|Garchomp, L58, F|100/100',
      '|-boost|p2a: 난천|atk|2',
      '|-unboost|p1a: 빛나|def|1',
      '|-clearallboost',
    ])
    expect(hazed.active.p2a?.boosts.atk).toBe(0)
    expect(hazed.active.p1a?.boosts.def).toBe(0)
  })

  it('심리전은 상대의 랭크를 통째로 베낀다', () => {
    const copied = fold([
      '|switch|p1a: 빛나|Milotic, L58, F|100/100',
      '|switch|p2a: 난천|Garchomp, L58, F|100/100',
      '|-boost|p2a: 난천|atk|2',
      '|-boost|p2a: 난천|spe|1',
      '|-copyboost|p1a: 빛나|p2a: 난천|[from] move: Psych Up',
    ])
    expect(copied.active.p1a?.boosts.atk).toBe(2)
    expect(copied.active.p1a?.boosts.spe).toBe(1)
    // 베껴지는 쪽은 안 바뀐다
    expect(copied.active.p2a?.boosts.atk).toBe(2)
  })

  it('필드 효과는 쪽이 없다', () => {
    const on = fold(['|-fieldstart|move: Trick Room|[of] p2a: 난천'])
    expect(on.field.has('trickroom')).toBe(true)
    const off = fold([
      '|-fieldstart|move: Trick Room',
      '|-fieldend|move: Trick Room',
    ])
    expect(off.field.has('trickroom')).toBe(false)
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
  const mine = activeAt(view, side)
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
 * 8배틀을 굴려도 아직 모양을 못 준 명령. **지금은 비어 있다.**
 *
 * 비어 있는 것이 이 검사의 값이다 — 모르는 줄은 버리지 않고 `other`로 남기므로,
 * sim 판이 올라가 새 줄이 오면 여기서 티가 난다
 */
// 지속 효과 여섯 줄(`-start`/`-end`/`-sidestart`/`-sideend`/`-fieldstart`/`-fieldend`)은
// 트레이너 AI가 리플렉터·대타출동·트릭룸을 보게 하려고 모양을 줬다 (PLAN §7.7)
// ⚠️ 이 목록은 **여덟 판에서 실제로 본 것**이라 난수 흐름이 바뀌면 같이
// 바뀐다. `-ohko`가 빠진 것은 일격필살을 안 다루게 됐다는 뜻이 아니라
// 이 여덟 판에 안 나왔다는 뜻이다 (성별을 sim이 안 굴리게 되면서 흐름이 밀렸다)
// ⚠️ 또 바뀌었다. 빈 턴 칸의 PP를 0으로 눕히면서(`session.lowerIdle`) 무작위로
// 두는 쪽의 후보 목록이 달라졌고, 여덟 판이 다른 길로 흘렀다 — `-hitcount`(연타)와
// `-singleturn`(방어·기합펀치)이 그 길에서 새로 보였다
// ⚠️ 또 바뀌었다. `-setboost`·`-clearallboost`·`-copyboost` 셋에 모양을 줬다 —
// 셋 다 **랭크의 진실을 바꾸는 줄**이라 부가 연출이 아니었다. 여덟 판에서는
// `-setboost`만 보였다.
//
// ⚠️ **그리고 비었다 (PARITY §2.24).** 120판을 굴려 세면 열여섯 가지가 나왔는데
// (`-activate` 156 · `-singleturn` 56 · `-prepare` 46 · `-singlemove` 36 ·
// `-hitcount` 33 · `-notarget` 29 · `-block` 28 · `-mustrecharge` 15 ·
// `-endability` 11 · `-fieldactivate` 9 · `-cureteam` 3 · `-hint` 2 · `-ohko` 2),
// 그 열셋에 전부 모양을 줬다. **모양이 있다는 것과 글이 있다는 것은 다르다** —
// 문구를 아직 못 댄 효과는 `ui/battle/messages`가 null을 내고 그 목록은
// PARITY §2.24에 있다. 여기서 세는 것은 **모양**뿐이다.
//
// ⚠️ `-hint`에도 모양을 줬다. 원작에 없는 줄이라 글은 안 놓지만, `other`에
// 남겨 두면 이 목록이 그것 하나 때문에 영영 안 빈다
const UNMODELLED: string[] = []

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
