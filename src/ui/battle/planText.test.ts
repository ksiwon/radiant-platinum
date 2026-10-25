// 배틀 가방의 우리 글 세 벌 (`planText.ts`) — 구조 · 일본어 표기 · 능력 이름과의 이음.
import { describe, expect, it } from 'vitest'
import { PLAN_TEXT, type PlanText } from './planText'

const LOCALES = ['ko', 'en', 'ja'] as const

function texts(t: PlanText): string[] {
  return [
    t.revive, t.heal(30), ...Object.values(t.cure), t.cureOther('x'), t.clearConfusion, t.clearInfatuation, t.mist,
    t.boost('STAT'), t.focus, t.pp(10), t.notNow, t.empty, t.page(1, 3),
  ]
}

describe('배틀 가방 글 세 벌', () => {
  it('같은 키를 다 갖고 비지 않았다', () => {
    const cureKeys = Object.keys(PLAN_TEXT.ko.cure).sort()
    for (const locale of LOCALES) {
      expect(Object.keys(PLAN_TEXT[locale]).sort()).toEqual(Object.keys(PLAN_TEXT.ko).sort())
      expect(Object.keys(PLAN_TEXT[locale].cure).sort()).toEqual(cureKeys)
      for (const text of texts(PLAN_TEXT[locale])) expect(text.trim().length).toBeGreaterThan(0)
    }
  })

  it('일본어는 전각 공백과 －, 한자 없음 · 영어에는 한글이 없다', () => {
    for (const text of texts(PLAN_TEXT.ja)) {
      expect(text.replace(/ \/ /g, '')).not.toContain(' ')
      expect(text).not.toContain('ー')
      expect(/[一-鿿]/.test(text)).toBe(false)
    }
    for (const text of texts(PLAN_TEXT.en)) expect(/[가-힣぀-ヿ]/.test(text)).toBe(false)
  })

  it('한국어는 화면에 있던 문장 그대로다', () => {
    expect(PLAN_TEXT.ko.heal(50)).toBe('체력 50 회복')
    expect(PLAN_TEXT.ko.boost('공격')).toBe('공격이 올라간다')
    expect(PLAN_TEXT.ko.page(2, 3)).toBe('2 / 3쪽')
    expect(PLAN_TEXT.ko.cure.slp).toBe('잠에서 깬다')
  })
})
