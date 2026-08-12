// 기술 칸의 상성 표시 (PARITY §2.22)
import { describe, expect, it } from 'vitest'
import { hiddenPowerType, MATCH_LABEL, moveMatch, shownType } from './movePreview'
import { TYPE } from './ai/typeChart'
import type { Move, Stats } from '../../data/schema'

/** hp·atk·def·spa·spd·spe 차례로 적는다 — 화면에서 보는 그 차례다 */
function ivs(hp: number, atk: number, def: number, spa: number, spd: number, spe: number): Stats {
  return { hp, atk, def, spa, spd, spe }
}

const MOVE_HIDDEN_POWER = 237
const MOVE_STRUGGLE = 165

function move(over: Partial<Move> = {}): Move {
  return {
    id: 33, effect: 0, category: 'physical', power: 50, type: TYPE.NORMAL,
    accuracy: 100, alwaysHits: false, pp: 35, effectChance: 0, target: 0,
    priority: 0, flags: 0, contact: true, protectable: true,
    ...over,
  }
}

describe('잠재파워의 타입', () => {
  /**
   * ⚠️ **자릿수 차례가 hp·atk·def·spe·spa·spd다** — 능력치를 적는 흔한 차례와
   * 특공·스피드가 뒤바뀌어 있다 (`BtlCmd_CalcHiddenPowerParams`). 그대로 옮기면
   * 얼음이 전기로 나오므로, 그 자리를 실제로 가르는 값으로 잰다
   */
  it('개체값이 다 홀수면 악, 다 짝수면 격투다', () => {
    expect(hiddenPowerType(ivs(31, 31, 31, 31, 31, 31))).toBe(TYPE.DARK)
    expect(hiddenPowerType(ivs(30, 30, 30, 30, 30, 30))).toBe(TYPE.FIGHTING)
  })

  it('31/30/30/31/31/31은 얼음이다', () => {
    expect(hiddenPowerType(ivs(31, 30, 30, 31, 31, 31))).toBe(TYPE.ICE)
  })

  /** 특공과 스피드를 맞바꾸면 다른 타입이 나온다. 차례가 실제로 재어진다 */
  it('특공과 스피드의 자리가 다르다', () => {
    expect(hiddenPowerType(ivs(30, 30, 30, 31, 30, 30)))
      .not.toBe(hiddenPowerType(ivs(30, 30, 30, 30, 30, 31)))
  })

  /** 롬은 9번(???)을 건너뛴다. 8번 뒤가 곧바로 10번이어야 한다 */
  it('타입 번호에 ???가 안 끼어든다', () => {
    const all = new Set<number>()
    for (let n = 0; n < 64; n++) {
      const bit = (at: number) => 30 + ((n >> at) & 1)
      all.add(hiddenPowerType(ivs(bit(0), bit(1), bit(2), bit(4), bit(5), bit(3))))
    }
    expect(all.has(TYPE.MYSTERY)).toBe(false)
    expect(all.has(TYPE.NORMAL)).toBe(false)
    expect(all.size).toBe(16)
  })

  it('화면에 뜨는 타입도 그 값이다', () => {
    const hp = move({ id: MOVE_HIDDEN_POWER, category: 'special', type: TYPE.NORMAL })
    expect(shownType(hp, ivs(31, 30, 30, 31, 31, 31))).toBe(TYPE.ICE)
    // 개체값을 모르면 적힌 값 그대로다 — 지어내지 않는다
    expect(shownType(hp, null)).toBe(TYPE.NORMAL)
    expect(shownType(move({ type: TYPE.WATER }), ivs(31, 31, 31, 31, 31, 31))).toBe(TYPE.WATER)
  })
})

describe('무엇을 적을지', () => {
  const known = true

  it('약점·반감·무효를 가른다', () => {
    const water = move({ type: TYPE.WATER })
    expect(moveMatch(water, [TYPE.FIRE], null, known)).toBe('super')
    expect(moveMatch(water, [TYPE.GRASS], null, known)).toBe('resisted')
    expect(moveMatch(move({ type: TYPE.NORMAL }), [TYPE.GHOST], null, known)).toBe('immune')
  })

  it('1배에는 아무 말도 안 한다', () => {
    expect(moveMatch(move({ type: TYPE.NORMAL }), [TYPE.WATER], null, known)).toBeNull()
  })

  it('두 타입이면 곱한다 — 4분의 1도 「별로임」이다', () => {
    // 불꽃 → 벌레/강철은 4배
    expect(moveMatch(move({ type: TYPE.FIRE }), [TYPE.BUG, TYPE.STEEL], null, known)).toBe('super')
    // 풀 → 불꽃/비행은 4분의 1
    expect(moveMatch(move({ type: TYPE.GRASS }), [TYPE.FIRE, TYPE.FLYING], null, known))
      .toBe('resisted')
    // 한쪽이 0이면 곱해도 0이다
    expect(moveMatch(move({ type: TYPE.ELECTRIC }), [TYPE.WATER, TYPE.GROUND], null, known))
      .toBe('immune')
  })

  /** ⚠️ **처음 보는 종의 약점을 공짜로 주지 않는다** — BDSP의 규칙이다 */
  it('상대해 본 적 없는 종에는 안 뜬다', () => {
    expect(moveMatch(move({ type: TYPE.WATER }), [TYPE.FIRE], null, false)).toBeNull()
  })

  it('변화 기술과 발버둥에는 안 뜬다', () => {
    expect(moveMatch(move({ category: 'status', type: TYPE.ELECTRIC }), [TYPE.GROUND], null, known))
      .toBeNull()
    expect(moveMatch(move({ id: MOVE_STRUGGLE, type: TYPE.NORMAL }), [TYPE.GHOST], null, known))
      .toBeNull()
  })

  it('상대의 타입을 모르면 안 뜬다', () => {
    expect(moveMatch(move({ type: TYPE.WATER }), null, null, known)).toBeNull()
    expect(moveMatch(undefined, [TYPE.FIRE], null, known)).toBeNull()
  })

  it('잠재파워는 개체값이 정한 타입으로 잰다', () => {
    const hp = move({ id: MOVE_HIDDEN_POWER, category: 'special', type: TYPE.NORMAL })
    const ice = ivs(31, 30, 30, 31, 31, 31)
    // 적힌 타입(노말)으로 재면 드래곤에게 1배라 아무 말도 안 나온다
    expect(moveMatch(hp, [TYPE.DRAGON], null, known)).toBeNull()
    expect(moveMatch(hp, [TYPE.DRAGON], ice, known)).toBe('super')
  })

  it('BDSP 한국어판의 말 그대로다', () => {
    expect(MATCH_LABEL.super).toBe('효과가 굉장함')
    expect(MATCH_LABEL.resisted).toBe('효과가 별로임')
    expect(MATCH_LABEL.immune).toBe('효과가 없음')
  })
})
