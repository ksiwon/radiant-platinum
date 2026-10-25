// 상태 딱지 낱말 세 언어 — 롬 뱅크 361의 0~4번과 같은지, 틀이 같은지.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MATCH_WORDS } from '../../engine/battle/movePreview'
import { STATUS_ROM_AT, STATUS_WORDS } from './statusWords'

const LOCALES = ['ko', 'en', 'ja'] as const
const bankOf = (locale: string, n: number): string[] =>
  JSON.parse(readFileSync(`public/data/dialogue/${locale}/${n}.json`, 'utf8')) as string[]

describe('상태 딱지 낱말', () => {
  for (const locale of LOCALES) {
    it(`${locale} — 다섯은 롬 메뉴 뱅크 361의 줄과 같다`, () => {
      const bank = bankOf(locale, 361)
      for (const [key, at] of Object.entries(STATUS_ROM_AT)) {
        expect(STATUS_WORDS[locale][key], key).toBe(bank[at])
      }
    })
  }

  it('세 언어가 같은 키를 다 갖고 비지 않았다', () => {
    const keys = Object.keys(STATUS_WORDS.ko).sort()
    for (const locale of LOCALES) {
      expect(Object.keys(STATUS_WORDS[locale]).sort()).toEqual(keys)
      for (const v of Object.values(STATUS_WORDS[locale])) expect(v.trim().length).toBeGreaterThan(0)
    }
    expect(STATUS_WORDS.ja.slp).toBe('ねむり')
  })

  it('맹독 · 기절 · 포켓러스는 롬 줄에 그 낱말이 들어 있다', () => {
    const battle = (l: string, n: number) => bankOf(l, 368)[n]!
    expect(battle('ko', 79)).toContain(STATUS_WORDS.ko.tox)
    expect(battle('ja', 79)).toContain(STATUS_WORDS.ja.tox)
    expect(battle('en', 30).toLowerCase()).toContain(STATUS_WORDS.en.fnt!.toLowerCase())
    expect(bankOf('ja', 373)[3]).toContain(STATUS_WORDS.ja.fnt)
    expect(bankOf('ko', 373)[3]).toContain(STATUS_WORDS.ko.fnt)
    for (const l of LOCALES) expect(bankOf(l, 213)[10]).toContain(STATUS_WORDS[l].pkrs)
    // 영어 「badly poisoned」는 기술 설명(646:305)에 있다
    expect(bankOf('en', 646)[305]!.toLowerCase()).toContain(STATUS_WORDS.en.tox!.toLowerCase())
  })
})

describe('기술 상성 낱말', () => {
  it('세 언어가 같은 칸을 채우고 일본어는 롬처럼 전각 공백이다', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(MATCH_WORDS[locale]).sort()).toEqual(['immune', 'resisted', 'super'])
      for (const v of Object.values(MATCH_WORDS[locale])) expect(v.trim().length).toBeGreaterThan(0)
    }
    for (const v of Object.values(MATCH_WORDS.ja)) expect(v).not.toContain(' ')
  })

  it('영어·일본어는 롬 배틀 뱅크 368의 상성 문장에서 온 낱말이다', () => {
    const en = bankOf('en', 368)
    const ja = bankOf('ja', 368)
    expect(en[780]).toContain(MATCH_WORDS.en.super.toLowerCase())
    expect(en[779]).toContain(MATCH_WORDS.en.resisted.toLowerCase())
    expect(ja[780]).toContain('ばつぐん')
    expect(MATCH_WORDS.ja.super).toContain('ばつぐん')
    expect(ja[779]).toContain('いまひとつ')
    expect(MATCH_WORDS.ja.resisted).toContain('いまひとつ')
    expect(ja[27]).toContain(MATCH_WORDS.ja.immune.replace(/\u3000/g, '\u3000'))
  })
})
