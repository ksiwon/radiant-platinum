// 연출 순서 검증.
//
// 여기서 지키는 것은 하나다 — **글이 먼저 뜨고 그 다음에 체력이 닳는다.** 뒤집히면
// 화면에서만 티가 나고 어떤 계산도 안 틀리므로, 순서 자체를 못박아 둔다.
import { describe, expect, it } from 'vitest'
import type { Actor, BattleEvent } from './events'
import { buildBeats, drainFrames } from './playback'
import { MOVE_FRAMES } from './vfx'
import { applyEvents, emptyView } from './view'

const p1: Actor = { slot: 'p1a', side: 'p1', name: 'party-0' }
const p2: Actor = { slot: 'p2a', side: 'p2', name: 'foe-0' }

const enter = (actor: Actor, hp: number): BattleEvent => ({
  kind: 'switch',
  actor,
  species: 387,
  speciesName: 'Turtwig',
  level: 5,
  gender: 'male',
  shiny: false,
  condition: { hp, maxHp: hp, status: 'ok' },
  forced: false,
})

/** 배틀 중에 갈아탄다. 종이 바뀌므로 모델도 이름표도 이걸 보고 바뀐다 */
const swap = (actor: Actor, species: number, speciesName: string): BattleEvent => {
  const on = enter(actor, 40)
  return on.kind === 'switch' ? { ...on, species, speciesName } : on
}

const hit = (actor: Actor, hp: number, maxHp: number): BattleEvent => ({
  kind: 'damage', actor, condition: { hp, maxHp, status: 'ok' }, from: null,
})

/** 사건 하나를 한 줄로. 실제 문구는 UI가 정하므로 여기서는 종류만 적는다 */
const say = (e: BattleEvent): string | null => {
  if (e.kind === 'move') return `${e.actor.name}의 ${e.moveName}!`
  if (e.kind === 'faint') return `${e.actor.name}는 쓰러졌다!`
  if (e.kind === 'crit') return '급소에 맞았다!'
  if (e.kind === 'effectiveness') return '효과가 굉장했다!'
  if (e.kind === 'switch') return `가라! ${e.actor.name}!`
  return null
}

const move = (actor: Actor, name: string): BattleEvent => ({
  kind: 'move', actor, move: 33, moveName: name, target: null, miss: false, from: null,
})

describe('게이지 속도', () => {
  // `UpdateGauge`: 최대 HP가 48 미만이면 프레임당 max/48, 이상이면 프레임당 1
  it('최대 HP가 48보다 작으면 게이지 전체가 늘 48프레임이다', () => {
    expect(drainFrames(20, 20)).toBe(48)
    expect(drainFrames(47, 47)).toBe(48)
    // 절반만 깎이면 절반의 시간
    expect(drainFrames(10, 20)).toBe(24)
  })

  it('최대 HP가 48 이상이면 깎인 만큼의 프레임이다', () => {
    expect(drainFrames(1, 48)).toBe(1)
    expect(drainFrames(40, 150)).toBe(40)
    expect(drainFrames(150, 150)).toBe(150)
  })

  it('안 움직이면 안 기다린다', () => {
    expect(drainFrames(0, 100)).toBe(0)
    expect(drainFrames(-5, 100)).toBe(0)
  })
})

describe('박자 순서', () => {
  it('기술 이름이 먼저 뜨고 그 다음 박자에서 체력이 닳는다', () => {
    const beats = buildBeats([enter(p2, 20), move(p1, 'Tackle'), hit(p2, 12, 20)], say)
    const at = beats.findIndex((b) => b.text?.includes('Tackle'))
    const drain = beats.findIndex((b) => b.events.some((e) => e.kind === 'damage'))
    expect(at).toBeGreaterThanOrEqual(0)
    // 데미지가 글보다 **뒤에** 있어야 한다. 이 한 줄이 이 파일의 이유다
    expect(drain).toBeGreaterThan(at)
    // 기술 줄은 안 멈춘다 — 그 글을 띄운 채로 게이지가 움직인다
    expect(beats[at]!.hold).toBe(0)
    // 20 중 8이 깎였다 → 8 × 48 / 20
    expect(beats[drain]!.hold).toBe(drainFrames(8, 20))
  })

  it('스스로 글을 가진 데미지도 글이 먼저다', () => {
    // 독·화상·모래바람은 `PrintMessage / Wait / WaitButtonABTime 30` 다음에
    // 게이지가 움직인다 (`subscript_burn_damage.s`). 기술 데미지와 달리 자기 글이 있다
    const poison: BattleEvent = {
      kind: 'damage',
      actor: p2,
      condition: { hp: 17, maxHp: 20, status: 'psn' },
      from: { kind: 'status', id: null, name: 'psn' },
    }
    const beats = buildBeats(
      [enter(p2, 20), poison],
      (e) => (e === poison ? '야생의 찌르꼬는 독으로 데미지를 입었다!' : say(e)),
    )
    const line = beats.findIndex((b) => b.text?.includes('독으로'))
    const drain = beats.findIndex((b) => b.events.includes(poison))
    expect(line).toBeGreaterThanOrEqual(0)
    expect(drain).toBeGreaterThan(line)
    // 글은 30프레임 읽히고 나서야 게이지가 움직인다
    expect(beats[line]!.hold).toBe(30)
  })

  it('급소와 효과는 게이지가 움직인 뒤에 말한다', () => {
    // 쇼다운은 이 순서로 보낸다: 기술 → 급소 → 효과 → 데미지
    const beats = buildBeats([
      move(p1, 'Tackle'),
      { kind: 'crit', actor: p2 },
      { kind: 'effectiveness', actor: p2, level: 'super' },
      hit(p2, 4, 20),
    ], say)
    const drain = beats.findIndex((b) => b.events.some((e) => e.kind === 'damage'))
    const crit = beats.findIndex((b) => b.text === '급소에 맞았다!')
    const eff = beats.findIndex((b) => b.text === '효과가 굉장했다!')
    expect(drain).toBeGreaterThan(0)
    // 원작 스크립트가 UPDATE_HP → CRITICAL_HIT → MOVE_FOLLOWUP_MESSAGE 순이다
    expect(crit).toBeGreaterThan(drain)
    expect(eff).toBeGreaterThan(crit)
  })

  it('쓰러진 것은 화면이 먼저고 글이 나중이다', () => {
    const beats = buildBeats([hit(p2, 0, 20), { kind: 'faint', actor: p2 }], say)
    const fell = beats.findIndex((b) => b.events.some((e) => e.kind === 'faint'))
    const line = beats.findIndex((b) => b.text?.includes('쓰러졌다'))
    expect(fell).toBeGreaterThanOrEqual(0)
    expect(line).toBeGreaterThan(fell)
  })

  it('두 마리가 맞으면 체력이 동시에 안 닳는다', () => {
    const beats = buildBeats([
      enter(p1, 20), enter(p2, 20),
      move(p1, 'Tackle'), hit(p2, 12, 20),
      move(p2, 'Scratch'), hit(p1, 15, 20),
    ], say)
    const drains = beats
      .map((b, i) => (b.events.some((e) => e.kind === 'damage') ? i : -1))
      .filter((i) => i >= 0)
    expect(drains).toHaveLength(2)
    // 같은 박자에 들어가면 안 된다 — 사이에 상대 기술 줄이 끼어 있어야 한다
    expect(drains[1]! - drains[0]!).toBeGreaterThan(1)
    const between = beats.slice(drains[0]! + 1, drains[1]!).map((b) => b.text)
    expect(between).toContain('foe-0의 Scratch!')
  })

  it('사건이 하나도 안 새어 나간다', () => {
    const events: BattleEvent[] = [
      enter(p1, 20), enter(p2, 20),
      { kind: 'turn', turn: 1 },
      move(p1, 'Tackle'),
      { kind: 'crit', actor: p2 },
      hit(p2, 0, 20),
      { kind: 'faint', actor: p2 },
      { kind: 'win', winner: '나' },
    ]
    const played = buildBeats(events, say).flatMap((b) => b.events)
    // 순서는 바뀔 수 있어도(급소가 뒤로 밀린다) 빠지는 것은 없어야 한다
    expect(played).toHaveLength(events.length)
    // 기술에 맞은 데미지에는 `hit`이 붙는다 — 그것만 벗기면 들어온 것과 같아야 한다
    const bare = played.map((e) => (e.kind === 'damage' ? { ...e, hit: undefined } : e))
    expect(new Set(bare)).toEqual(new Set(events.map(
      (e) => (e.kind === 'damage' ? { ...e, hit: undefined } : e),
    )))
  })

  it('같은 줄이 연달아 나오면 다시 안 찍는다', () => {
    // 연타 기술은 데미지가 여러 번 오고 기술 줄은 하나다
    const beats = buildBeats([
      move(p1, 'Fury Attack'), hit(p2, 16, 20), hit(p2, 12, 20), hit(p2, 8, 20),
    ], say)
    expect(beats.filter((b) => b.text?.includes('Fury Attack'))).toHaveLength(1)
    expect(beats.filter((b) => b.events.some((e) => e.kind === 'damage'))).toHaveLength(3)
  })

  it('사건이 뒤에 붙어도 앞의 박자는 한 칸도 안 흔들린다', () => {
    // ⚠️ **재생기가 다 만든 목록을 한 번 훑는 것이 아니다.** 배틀이 도는 동안
    // 사건이 계속 붙고, 화면은 그때마다 이 함수를 **처음부터 다시** 부른다.
    // 재생기는 "몇 번째 박자까지 틀었나"만 들고 있으므로, 앞부분이 한 칸이라도
    // 달라지면 그 자리의 사건이 통째로 안 틀린다.
    //
    // 실제로 그랬다 — 조용한 박자를 뒤엣것과 합치는 코드가 있어서, 턴 끝의
    // `turn`에 다음 턴의 `switch`가 빨려 들어갔다. **교체해도 화면에는 앞
    // 마리가 계속 서 있었다** (기술 목록만 바뀌어서 더 헷갈렸다)
    const chunk1: BattleEvent[] = [enter(p1, 20), enter(p2, 20), { kind: 'turn', turn: 1 }]
    const chunk2: BattleEvent[] = [swap(p1, 405, 'Luxray'), { kind: 'turn', turn: 2 }]
    const before = buildBeats(chunk1, say)
    const after = buildBeats([...chunk1, ...chunk2], say)
    expect(after.slice(0, before.length)).toEqual(before)
    // 그리고 뒤에 붙은 사건은 **틀지 않은 박자에** 실려 있어야 한다
    const late = after.slice(before.length).flatMap((b) => b.events)
    expect(late.filter((e) => e.kind === 'switch')).toHaveLength(1)
  })

  it('여러 줄짜리 보상은 창 하나에 한 줄씩 나온다', () => {
    const beats = buildBeats(
      [{ kind: 'reward', key: 'party-0', exp: 24, levels: [6], learned: [], pending: [] }],
      () => '모부기는 경험치를 24 얻었다!\n모부기의 레벨이 올랐다! (Lv.6)',
    )
    const lines = beats.map((b) => b.text).filter((t) => t !== null)
    expect(lines).toEqual([
      '모부기는 경험치를 24 얻었다!',
      '모부기의 레벨이 올랐다! (Lv.6)',
    ])
  })
})

describe('기술 연출 자리', () => {
  it('기술 사건이 연출만큼 쉰다 — 무대와 같은 상수를 본다', () => {
    // 이 자리가 0이면 기술 이름이 뜨자마자 게이지가 닳아서, 무엇이 무엇을
    // 때렸는지가 화면에서 안 이어진다
    const beats = buildBeats([move(p1, '몸통박치기'), hit(p2, 8, 20)], say)
    const at = beats.findIndex((b) => b.events.some((e) => e.kind === 'move'))
    expect(at, '기술 박자가 없다').toBeGreaterThanOrEqual(0)
    expect(beats[at]!.hold).toBe(MOVE_FRAMES)
    // 그리고 그 뒤에 게이지가 온다. 순서가 뒤집히면 안 된다
    expect(beats.slice(at + 1).some((b) => b.events.some((e) => e.kind === 'damage'))).toBe(true)
  })

  it('뷰가 기술을 내밀고, 같은 기술이 이어져도 순번이 는다', () => {
    // 순번이 없으면 몸통박치기를 두 턴 연속 쓸 때 두 번째 연출이 안 돈다
    const one = applyEvents(emptyView(), [move(p1, '몸통박치기')])
    expect(one.lastMove).toEqual({ by: 'p1', to: null, move: 33, seq: 1 })
    const two = applyEvents(one, [move(p1, '몸통박치기')])
    expect(two.lastMove?.seq).toBe(2)
  })
})

describe('타격 정보 — 소리가 이걸 보고 난다', () => {
  /** 박자에 실린 데미지 사건에서 `hit`만 뽑는다 */
  const hits = (events: BattleEvent[]) =>
    buildBeats(events, say)
      .flatMap((b) => b.events)
      .filter((e) => e.kind === 'damage')
      .map((e) => e.hit)

  it('효과 줄이 없으면 보통이다 — 쇼다론은 보통일 때 아무 줄도 안 보낸다', () => {
    // 이게 안 되면 **대부분의 타격이 조용해진다.** 가장 흔한 경우가 보통이다
    expect(hits([enter(p2, 40), move(p1, '몸통박치기'), hit(p2, 30, 40)]))
      .toEqual([{ level: 'normal', crit: false }])
  })

  it('데미지보다 먼저 온 효과·급소를 얹는다', () => {
    const events: BattleEvent[] = [
      enter(p2, 40), move(p1, '불꽃세례'),
      { kind: 'effectiveness', actor: p2, level: 'super' },
      { kind: 'crit', actor: p2 },
      hit(p2, 10, 40),
    ]
    expect(hits(events)).toEqual([{ level: 'super', crit: true }])
  })

  it('연타는 맞을 때마다 소리가 난다', () => {
    const events: BattleEvent[] = [
      enter(p2, 40), move(p1, '연속자르기'),
      hit(p2, 34, 40), hit(p2, 28, 40), hit(p2, 22, 40),
    ]
    expect(hits(events)).toHaveLength(3)
    expect(hits(events).every((h) => h?.level === 'normal')).toBe(true)
  })

  it('독·모래바람은 타격이 아니다 — `from`이 차 있다', () => {
    const poison: BattleEvent = {
      kind: 'damage', actor: p2, condition: { hp: 20, maxHp: 40, status: 'psn' },
      from: { kind: 'status', id: null, name: 'psn' },
    }
    expect(hits([enter(p2, 40), move(p1, '독가루'), poison])).toEqual([undefined])
  })

  it('기술 없이 온 데미지도 타격이 아니다', () => {
    // 턴 시작의 잔류 데미지가 그렇다. 기술이 돌지 않았는데 맞는 소리가 나면 안 된다
    expect(hits([enter(p2, 40), { kind: 'turn', turn: 2 }, hit(p2, 30, 40)]))
      .toEqual([undefined])
  })

  it('뷰가 그것을 받아 번호를 매긴다 — 같은 타격이 두 번 울리지 않는다', () => {
    const beats = buildBeats(
      [enter(p2, 40), move(p1, '연속자르기'), hit(p2, 34, 40), hit(p2, 28, 40)],
      say,
    )
    let view = emptyView()
    const seqs: number[] = []
    for (const beat of beats) {
      view = applyEvents(view, beat.events)
      if (view.lastHit) seqs.push(view.lastHit.seq)
    }
    // 두 번 맞았으니 번호가 두 번 바뀐다
    expect(new Set(seqs).size).toBe(2)
  })
})
