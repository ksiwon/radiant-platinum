// 배틀 안 화면의 우리 글 표 — 세 언어가 같은 칸을 다 채우고, 한국어가 다른 언어에 새지 않는다
import { describe, expect, it } from 'vitest'
import { BATTLE_WORDS } from './battleWords'

describe('배틀 글 표', () => {
  it('세 언어가 같은 칸을 가진다', () => {
    const keys = Object.keys(BATTLE_WORDS.ko).sort()
    expect(Object.keys(BATTLE_WORDS.en).sort()).toEqual(keys)
    expect(Object.keys(BATTLE_WORDS.ja).sort()).toEqual(keys)
  })

  it('en · ja에는 한글이 없다', () => {
    for (const lang of ['en', 'ja'] as const) {
      for (const [key, text] of Object.entries(BATTLE_WORDS[lang])) expect(text, `${lang}.${key}`).not.toMatch(/[가-힣]/)
    }
  })

  it('안내 끝의 닫기는 close와 같은 말이다', () => {
    for (const w of Object.values(BATTLE_WORDS)) expect(w.back).toBe(` · ${w.close}`)
  })
})
