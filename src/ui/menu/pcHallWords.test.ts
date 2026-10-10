// PC 전당의 우리 글 — 세 언어, 한글이 en · ja에 새지 않는다
import { describe, expect, it } from 'vitest'

const { PC_HALL_WORDS } = await import('./PCHallOfFameScreen')

describe('PC 전당 글', () => {
  it('en · ja에는 한글이 없다', () => {
    for (const lang of ['en', 'ja'] as const) {
      for (const [key, text] of Object.entries(PC_HALL_WORDS[lang])) expect(text, `${lang}.${key}`).not.toMatch(/[가-힣]/)
    }
  })

  it('바닥 안내는 세 언어 모두 ←→ ↑↓ Z X를 말한다', () => {
    for (const w of Object.values(PC_HALL_WORDS)) {
      for (const key of ['←→', '↑↓', 'Z', 'X']) expect(w.foot).toContain(key)
    }
  })
})
