// PP 글자 단 (`ppTone.ts`) — 원작 `GetPPTextColor` (`battle_subscreen.c:2890`)의 네 단과 작은 최대치 규칙.
//
// ⚠️ **비율로 견주면 틀리는 자리다.** PP 5짜리 기술은 3이 아니라 **1일 때** 쪽빛(quarter)이고, 2일 때 half다.
// PP 40짜리는 10 이하가 quarter, 20 이하가 half다 (정수 나눗셈).
import { describe, expect, it } from 'vitest'
import { PP_TONE_COLOR, ppTone, type PpTone } from './ppTone'

/** 0부터 최대까지 단을 한 줄로 */
function line(max: number): PpTone[] {
  return Array.from({ length: max + 1 }, (_, now) => ppTone(now, max))
}

describe('GetPPTextColor의 단', () => {
  it('0이면 늘 out이다', () => {
    for (const max of [1, 5, 10, 40]) expect(ppTone(0, max)).toBe('out')
  })

  it('가득이면 늘 normal이다', () => {
    for (const max of [1, 2, 5, 8, 40]) expect(ppTone(max, max)).toBe('normal')
  })

  it('최대 1~2는 현재 1만 quarter다', () => {
    expect(line(1)).toEqual(['out', 'normal'])
    expect(line(2)).toEqual(['out', 'quarter', 'normal'])
  })

  it('최대 3~7은 1이 quarter, 2가 half, 나머지는 normal이다 — 비율이 아니다', () => {
    expect(line(5)).toEqual(['out', 'quarter', 'half', 'normal', 'normal', 'normal'])
    expect(line(7)).toEqual(['out', 'quarter', 'half', 'normal', 'normal', 'normal', 'normal', 'normal'])
    expect(line(3)).toEqual(['out', 'quarter', 'half', 'normal'])
  })

  it('최대 8 이상은 최대/4 이하가 quarter, 최대/2 이하가 half다 (정수 나눗셈)', () => {
    // 8 → 8/4 = 2, 8/2 = 4
    expect(line(8)).toEqual(['out', 'quarter', 'quarter', 'half', 'half', 'normal', 'normal', 'normal', 'normal'])
    // 40 → 10, 20
    const forty = line(40)
    expect(forty.slice(1, 11).every((t) => t === 'quarter')).toBe(true)
    expect(forty.slice(11, 21).every((t) => t === 'half')).toBe(true)
    expect(forty.slice(21, 40).every((t) => t === 'normal')).toBe(true)
    // 15 → 15/4 = 3, 15/2 = 7
    const fifteen = line(15)
    expect(fifteen.indexOf('half')).toBe(4)
    expect(fifteen.lastIndexOf('half')).toBe(7)
  })

  it('단이 넷이고 글자색이 모두 실측 토큰이다', () => {
    expect(Object.keys(PP_TONE_COLOR).sort()).toEqual(['half', 'normal', 'out', 'quarter'])
    expect(new Set(Object.values(PP_TONE_COLOR)).size).toBe(4)
  })
})
