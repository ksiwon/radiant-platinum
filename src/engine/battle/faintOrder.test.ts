// 게이지가 다 닳은 **뒤에** 몸이 진다 (지시서 R3).
//
// 예전에는 무대가 `mon.hp <= 0`을 보고 사라지기 시작했다. 그 값은 `damage`
// 사건에서 이미 참이라, 게이지가 `holdMs` 동안 CSS로 내려가는 **도중에** 몸이
// 먼저 없어졌다. 숫자 HP(`fainted`)와 화면 상태(`presence`)를 나눈다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Actor, BattleEvent } from './events'
import { buildBeats } from './playback'
import { BODY_FADE_SECONDS, FRAME_SECONDS } from './presentationClock'
import { applyEvents, emptyView } from './view'

const me: Actor = { slot: 'p1a', side: 'p1', name: '모부기' }
const foe: Actor = { slot: 'p2a', side: 'p2', name: '꼬링크' }

const out = (actor: Actor, hp: number): BattleEvent => ({
  kind: 'switch', actor, species: 387, speciesName: actor.name, level: 5,
  gender: 'male', shiny: false, form: 0, forced: false,
  condition: { hp, maxHp: 20, status: 'ok' },
})
const hurt = (actor: Actor, hp: number): BattleEvent => ({
  kind: 'damage', actor, condition: { hp, maxHp: 20, status: 'ok' }, from: null,
})
const down = (actor: Actor): BattleEvent => ({ kind: 'faint', actor })

const say = (e: BattleEvent): string | null =>
  (e.kind === 'faint' ? `${e.actor.name}는 쓰러졌다!` : null)

describe('숫자 HP와 화면 상태를 나눈다', () => {
  it('HP가 0이어도 기절 사건 전까지는 서 있다', () => {
    const view = applyEvents(emptyView(), [out(foe, 20), hurt(foe, 0)])
    const mon = view.active.p2a
    expect(mon?.hp, '피해가 안 접혔다').toBe(0)
    // 규칙이 보는 값은 이미 참이다 — 그것은 그대로 둔다
    expect(mon?.fainted).toBe(true)
    // ⚠️ **화면은 아직 살아 있다.** 게이지가 이 사이에 내려간다
    expect(mon?.presence, 'HP 0만으로 몸이 지기 시작했다').toBe('alive')
  })

  it('기절 사건에서 비로소 진다', () => {
    const view = applyEvents(emptyView(), [out(foe, 20), hurt(foe, 0), down(foe)])
    expect(view.active.p2a?.presence).toBe('down')
  })

  it('등판하는 마리는 늘 서 있다', () => {
    const view = applyEvents(emptyView(), [out(me, 20)])
    expect(view.active.p1a?.presence).toBe('alive')
  })
})

describe('차례는 게이지 → 기절 → 글 → 교체다', () => {
  const beats = buildBeats([hurt(foe, 0), down(foe), out(foe, 20)], say)
  const shape = beats.map((b) =>
    b.events.some((e) => e.kind === 'damage') ? '게이지'
      : b.events.some((e) => e.kind === 'faint') ? '기절'
        : b.events.some((e) => e.kind === 'switch') ? '교체'
          : b.text !== null ? '글' : '조용')

  it('그 순서로 한 번씩만 일어난다', () => {
    expect(shape.filter((s) => s !== '조용')).toEqual(['게이지', '기절', '글', '교체'])
  })

  it('기절 박자가 몸이 지는 시간만큼 쉰다', () => {
    const faint = beats.find((b) => b.events.some((e) => e.kind === 'faint'))
    expect(faint, '기절 박자가 없다').toBeDefined()
    // ⚠️ `HOLD_FAINT 7`은 **체력창이 빠지는** 값이다. 몸 동작 완료 시간으로
    // 쓰면 안 된다 — 그 위에 몸이 지는 시간을 얹는다
    expect(faint!.hold * FRAME_SECONDS, '몸이 지기도 전에 다음 글이 뜬다')
      .toBeGreaterThanOrEqual(BODY_FADE_SECONDS)
    expect(faint!.presentation, '기절 박자를 A·Z로 건너뛸 수 있다').toBe(true)
  })

  it('게이지가 다 닳는 시간이 기절 앞에 있다', () => {
    const gauge = beats.find((b) => b.events.some((e) => e.kind === 'damage'))
    // 20 → 0이면 `drainFrames`가 48프레임을 낸다. 0이면 게이지가 순간이동한다
    expect(gauge!.hold).toBeGreaterThan(0)
  })
})

describe('무대가 화면 상태를 본다', () => {
  it('BattleStage가 hp로 몸을 지우지 않는다', () => {
    const src = readFileSync(
      resolve(__dirname, '../../scene/battle/BattleStage.tsx'), 'utf8')
    expect(src, '무대가 다시 숫자 HP로 몸을 지운다').toContain("mon.presence === 'down'")
    expect(src).not.toContain('const fainted = mon !== null && mon.hp <= 0')
    // 퇴장에 등판 클립을 다시 쓰면 쓰러지는 포켓몬이 착지 동작을 한다
    expect(src, '퇴장에 등판 클립이 다시 걸렸다').toContain('leaving.current')
  })

  it('기절 소리도 화면 상태를 본다', () => {
    const src = readFileSync(
      resolve(__dirname, '../../ui/battle/BattleSound.tsx'), 'utf8')
    expect(src).toContain("mon.presence === 'down'")
  })
})
