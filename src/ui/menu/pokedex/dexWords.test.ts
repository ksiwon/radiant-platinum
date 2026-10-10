// 도감 글 표 — 세 언어가 같은 칸을 채우고, 한국어 바닥 안내는 예전 글 그대로다
import { describe, expect, it } from 'vitest'
import { DEX_WORDS, type DexWords } from './dexWords'

const texts = (w: DexWords): string[] => [
  ...Object.values(w).filter((v): v is string => typeof v === 'string'),
  w.tuneFoot('A', 'B'), w.listFoot('P'),
]

describe('도감 글 표', () => {
  it('세 언어가 같은 칸을 가진다', () => {
    const keys = Object.keys(DEX_WORDS.ko).sort()
    expect(Object.keys(DEX_WORDS.en).sort()).toEqual(keys)
    expect(Object.keys(DEX_WORDS.ja).sort()).toEqual(keys)
  })

  it('en · ja에는 한글이 없다', () => {
    for (const lang of ['en', 'ja'] as const) {
      for (const t of texts(DEX_WORDS[lang])) expect(t, lang).not.toMatch(/[가-힣]/)
    }
  })

  it('한국어 바닥 안내는 그대로다', () => {
    expect(DEX_WORDS.ko.listFoot('쪽')).toBe('↑↓ 고르기 · Q/E 한 쪽씩 · ←→ 쪽 · Tab 검색 · Z 울음소리 · X 닫기')
    expect(DEX_WORDS.ko.tuneFoot('코러스', '팬')).toBe('←→ 볼 · ↑↓ 높낮이 · Q/E 코러스·팬 · Z 재생 · Shift X 나가기')
  })
})
