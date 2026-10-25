import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VarStore } from './vars'
import { FieldWorld } from './world'
import { YESNO_AT, YESNO_BANK, YESNO_FALLBACK } from './field'
import { introUiText } from '../intro/introUiText'

const bankOf = (locale: string, n: number): string[] =>
  JSON.parse(readFileSync(`public/data/dialogue/${locale}/${n}.json`, 'utf8')) as string[]

describe('필드 예/아니오 글은 롬 줄이다', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    it(`${locale} — 내림 값이 공용 뱅크 7의 82·83번 줄과 같다`, () => {
      const bank = bankOf(locale, YESNO_BANK)
      expect(YESNO_FALLBACK[locale]).toEqual([bank[YESNO_AT[0]], bank[YESNO_AT[1]]])
    })
  }

  it('openYesNo는 월드가 든 두 줄을 그대로 선택지로 건다', () => {
    const world = new FieldWorld({ vars: new VarStore() })
    world.openYesNo(0x8000)
    expect(world.menu?.entries.map((e) => e.text)).toEqual(['예', '아니오'])
    world.yesNoTexts = YESNO_FALLBACK.en
    world.openYesNo(0x8000)
    expect(world.menu?.entries.map((e) => e.text)).toEqual(['Yes', 'No'])
    world.yesNoTexts = YESNO_FALLBACK.ja
    world.openYesNo(0x8000)
    expect(world.menu?.entries.map((e) => e.text)).toEqual(['はい', 'いいえ'])
  })
})

describe('오프닝 화면 글', () => {
  it('성별 칸 낱말은 롬 사람 낱말 뱅크 440의 7·16번, 결정은 메일 뱅크 409의 0번에 세 언어 다 있다', () => {
    const pairs = { ko: ['남자', '여자', '결정'], en: ['BOY', 'GIRL', 'CONFIRM'], ja: ['おとこのこ', 'おんなのこ', 'けってい'] }
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const people = bankOf(locale, 440)
      const mail = bankOf(locale, 409)
      expect([people[7], people[16], mail[0]]).toEqual(pairs[locale])
    }
  })

  it('안내 줄은 세 언어가 같은 칸을 다 채운다 · 일본어는 롬처럼 전각 공백과 －', () => {
    for (const locale of ['ko', 'en', 'ja']) {
      const t = introUiText(locale)
      for (const v of Object.values(t)) {
        const text = typeof v === 'function' ? v(7) : v
        expect(text.length).toBeGreaterThan(0)
      }
    }
    const ja = introUiText('ja')
    expect(ja.ballHint.includes('ー')).toBe(false)
    expect(ja.choiceHint.includes('\u3000')).toBe(true)
    expect(introUiText('en').nameHint(7)).toContain('7')
  })
})
