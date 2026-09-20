// 체력이 닳는 동안에는 **입력이 다음 사건을 못 당긴다** (지시서 2026-09-20 §2 / R3).
//
// 결함은 이랬다. `playback.ts`가 damage·heal 박자를 그냥 쉼으로 적어서
// `BeatRunner.advance()`가 `holdLeft`를 0으로 만들었다. 20/20 → 0/20은 실제로
// 48프레임(800ms)을 요청하는데, 그 직후 A·Z·글창 클릭이 한 번 들어오면 다음
// 걸음(60Hz에서 16.67ms)에 기절이 접혔다 — 체력바가 아직 내려가는 중에 몸이
// 쓰러지고 「쓰러졌다!」가 떴다.
//
// ⚠️ **사건 순서만 보는 시험으로 대신하지 않는다.** 순서는 그때도 맞았다.
// 재는 것은 **damage와 faint 사이의 시간**이고, 견주는 값은 제품이 스스로
// 알려 준 게이지 길이다(`BeatSink.hold`) — 시험이 800을 손으로 적지 않는다.
import { describe, expect, it } from 'vitest'
import type { Actor, BattleEvent } from '../../engine/battle/events'
import { buildBeats, type Beat } from '../../engine/battle/playback'
import { BATTLE_PACE } from '../../state/optionsStore'
import { BeatRunner } from './beatRunner'

const p1: Actor = { slot: 'p1a', side: 'p1', name: '모부기' }
const p2: Actor = { slot: 'p2a', side: 'p2', name: '이상해씨' }

const move = (actor: Actor): BattleEvent => ({
  kind: 'move', actor, move: 33, moveName: '몸통박치기', target: null, miss: false, from: null,
})
const hit = (actor: Actor, hp: number): BattleEvent => ({
  kind: 'damage', actor, condition: { hp, maxHp: 20, status: 'ok' }, from: null,
})
const heal = (actor: Actor, hp: number): BattleEvent => ({
  kind: 'heal', actor, condition: { hp, maxHp: 20, status: 'ok' }, from: null,
})

const say = (e: BattleEvent): string | null =>
  (e.kind === 'move' ? `${e.actor.name}의 ${e.moveName}!`
    : e.kind === 'faint' ? `${e.actor.name}은(는) 쓰러졌다!` : null)

/** 정상 초기 상태 20/20에서 0/20으로. 그리고 기절 */
const KO: BattleEvent[] = [
  { kind: 'turn', turn: 1 }, move(p1), hit(p2, 0), { kind: 'faint', actor: p2 },
]

interface Seen {
  /** 사건이 접힌 **연출 시각**(ms) */
  at: Record<string, number>
  /** 그 박자가 알려 온 게이지 길이(ms). 사건 이름으로 적는다 */
  gauge: Record<string, number>
  order: string[]
}

/**
 * 걸음마다 `advance()`를 한 번 때린다 — 사람이 A를 연타하는 것과 같다.
 *
 * `press`가 거짓이면 입력 없이 도는 판이다. 둘을 견줘 「입력이 시간을 줄였나」를 본다
 */
function run(beats: readonly Beat[], hz: number, scale: number, press: boolean): Seen {
  const step = 1000 / hz
  const seen: Seen = { at: {}, gauge: {}, order: [] }
  let now = 0
  let hold = 0
  const runner = new BeatRunner({
    text: (line) => { seen.order.push(`글:${line}`) },
    hold: (ms) => { hold = ms },
    apply: (events) => {
      for (const e of events) {
        seen.order.push(`사건:${e.kind}`)
        seen.at[e.kind] ??= now
        seen.gauge[e.kind] ??= hold
      }
    },
    ask: () => { /* 이 판에는 물음이 없다 */ },
    caughtUp: () => { /* 걸음 수로 안다 */ },
  })
  for (let i = 0; i < Math.ceil(hz * 20); i++) {
    now += step
    runner.step(beats, step, scale)
    if (press) runner.advance(beats)
  }
  return seen
}

const RATES = [30, 60, 120, 144]

describe('HP 이동이 끝나기 전에는 다음 사건이 안 접힌다', () => {
  const beats = buildBeats(KO, say)

  for (const hz of RATES) {
    for (const scale of BATTLE_PACE) {
      it(`${String(hz)}Hz · 빠르기 ${String(scale)}: 연타해도 기절이 게이지를 안 앞지른다`, () => {
        const step = 1000 / hz
        const hammered = run(beats, hz, scale, true)
        expect(hammered.at.damage, '피해가 안 왔다').toBeDefined()
        expect(hammered.at.faint, '기절이 안 왔다').toBeDefined()
        const moved = hammered.gauge.damage!
        expect(moved, '게이지 길이가 0이면 이 시험이 아무것도 안 잰다').toBeGreaterThan(0)
        // 한 걸음 오차는 준다 — 걸음이 게이지 끝을 딱 맞게 밟을 수는 없다
        expect(hammered.at.faint! - hammered.at.damage!).toBeGreaterThanOrEqual(moved - step)
      })
    }
  }

  it('연타가 게이지 길이를 안 줄인다 — 안 누른 판과 같다', () => {
    for (const hz of RATES) {
      const step = 1000 / hz
      const quiet = run(beats, hz, 1, false)
      const hammered = run(beats, hz, 1, true)
      const a = quiet.at.faint! - quiet.at.damage!
      const b = hammered.at.faint! - hammered.at.damage!
      // 한 걸음. 뒤의 1e-6은 걸음을 스무 번 더한 부동소수 찌꺼기다
      expect(Math.abs(a - b), `${String(hz)}Hz에서 연타가 게이지를 줄였다`)
        .toBeLessThanOrEqual(step + 1e-6)
    }
  })

  it('빠르기 설정은 그대로 먹는다 — 잠갔다고 배율까지 잃지 않는다', () => {
    // `presentation`으로 잠그면 여기가 깨진다. 그쪽은 빠르기도 무시하는 값이다
    const full = run(beats, 60, 1, true).gauge.damage!
    const half = run(beats, 60, 0.5, true).gauge.damage!
    const quarter = run(beats, 60, 0.25, true).gauge.damage!
    expect(half).toBeLessThan(full)
    expect(quarter).toBeLessThan(half)
    expect(half / full).toBeCloseTo(0.5, 1)
  })

  it('순서는 게이지 → 몸 퇴장 → 기절 문구다', () => {
    const order = run(beats, 60, 1, true).order
    const damage = order.indexOf('사건:damage')
    const faint = order.indexOf('사건:faint')
    const line = order.findIndex((o) => o.startsWith('글:') && o.includes('쓰러졌다'))
    expect(damage).toBeGreaterThanOrEqual(0)
    expect(faint).toBeGreaterThan(damage)
    expect(line).toBeGreaterThan(faint)
  })
})

describe('회복과 연속 공격에서도 앞 이동을 안 건너뛴다', () => {
  it('회복 게이지도 연타로 안 줄어든다', () => {
    const beats = buildBeats(
      [{ kind: 'turn', turn: 1 }, hit(p1, 2), heal(p1, 20), { kind: 'turn', turn: 2 }],
      say,
    )
    const step = 1000 / 60
    const seen = run(beats, 60, 1, true)
    const events = seen.order.filter((o) => o.startsWith('사건:'))
    expect(events).toContain('사건:heal')
    // 회복이 접힌 뒤 다음 턴까지 게이지 길이만큼 서 있어야 한다
    expect(seen.at.turn).toBeDefined()
    const after = run(beats, 60, 1, false)
    expect(Math.abs((seen.at.turn! - seen.at.heal!) - (after.at.turn! - after.at.heal!)))
      .toBeLessThanOrEqual(step)
  })

  it('연타로 맞아도 각 이동이 제 시간을 받는다', () => {
    // 연속 공격 — 데미지가 세 번 온다
    const beats = buildBeats(
      [{ kind: 'turn', turn: 1 }, move(p1), hit(p2, 14), hit(p2, 8), hit(p2, 2)],
      say,
    )
    const step = 1000 / 60
    const times: number[] = []
    let hold = 0
    const holds: number[] = []
    let now = 0
    const runner = new BeatRunner({
      text: () => { /* 글은 안 본다 */ },
      hold: (ms) => { hold = ms },
      apply: (events) => {
        for (const e of events) if (e.kind === 'damage') { times.push(now); holds.push(hold) }
      },
      ask: () => { /* 없다 */ },
      caughtUp: () => { /* 없다 */ },
    })
    for (let i = 0; i < 60 * 20; i++) {
      now += step
      runner.step(beats, step, 1)
      runner.advance(beats)
    }
    expect(times).toHaveLength(3)
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!, `${String(i)}번째 타격이 앞 게이지를 앞질렀다`)
        .toBeGreaterThanOrEqual(holds[i - 1]! - step)
    }
  })
})
