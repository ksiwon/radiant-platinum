// 시설 · 진화 · 기록 바닥 안내 조각 — 세 언어가 같은 칸을 채우고 키 글자가 같다
import { describe, expect, it } from 'vitest'
import { FOOT_WORDS } from './footWords'

describe('바닥 안내 조각', () => {
  it('세 언어가 같은 칸을 가진다', () => {
    const keys = Object.keys(FOOT_WORDS.ko).sort()
    expect(Object.keys(FOOT_WORDS.en).sort()).toEqual(keys)
    expect(Object.keys(FOOT_WORDS.ja).sort()).toEqual(keys)
  })

  it('en · ja에는 한글이 없다', () => {
    for (const lang of ['en', 'ja'] as const) {
      for (const [key, text] of Object.entries(FOOT_WORDS[lang])) expect(text, `${lang}.${key}`).not.toMatch(/[가-힣]/)
    }
  })

  it('언어가 달라도 키 글자는 같다', () => {
    for (const key of Object.keys(FOOT_WORDS.ko) as (keyof typeof FOOT_WORDS.ko)[]) {
      const keycaps = (t: string): string[] => t.match(/\b[ZXQE]\b|↑↓|←→|Tab|Shift/g) ?? []
      expect(keycaps(FOOT_WORDS.en[key]), key).toEqual(keycaps(FOOT_WORDS.ko[key]))
      expect(keycaps(FOOT_WORDS.ja[key]), key).toEqual(keycaps(FOOT_WORDS.ko[key]))
    }
  })
})
