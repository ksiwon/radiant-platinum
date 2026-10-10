// 만든 사람 화면의 글 (`CreditsScreen.tsx`의 `MAKER`)
//
// 다른 게임 둘이 타이틀의 「이런 게임은 어떠세요?」(`screens/gameLinks`)와 다르게 적혀
// 있었다 — 같은 게임이 「Pokerhythm」·「PokeRhythm」으로, 소개도 딴말로. 감사 줄은
// 저장소 경로(`pret/pokeplatinum`) 그대로였고, 고지에는 줄임말 「BYOR」가 찍혔다.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MAKER, MAKER_TEXT } from './CreditsScreen'
import { OTHER_GAMES } from '../screens/gameLinks'

const host = (url: string): string => new URL(url).host

describe('다른 게임', () => {
  it('타이틀의 목록과 이름·소개·주소가 글자까지 같다', () => {
    const credits = MAKER.games.map((g) => ({ name: g.title, line: g.about, host: host(g.href) }))
    const title = OTHER_GAMES.map((g) => ({ name: g.name, line: g.line, host: host(g.url) }))
    expect(credits).toEqual(title)
  })

  it('딱지는 그 주소의 호스트다', () => {
    for (const g of MAKER.games) expect(g.label).toBe(host(g.href))
  })
})

describe('감사 줄', () => {
  it('저장소 경로가 아니라 사람 말이다', () => {
    expect(MAKER.thanks).not.toContain('/')
    expect(MAKER.thanks).toContain('pret')
    expect(MAKER.thanks).toContain('pokeplatinum')
  })
})

describe('고지', () => {
  it('줄임말 BYOR를 안 쓴다', () => {
    for (const n of MAKER.notice) expect(n).not.toMatch(/BYOR/i)
  })

  it('타이틀 화면의 고지와 같은 문장이다 (COPYRIGHT §11)', () => {
    // 타이틀은 JSX 글이라 줄바꿈·들여쓰기를 접어서 잰다
    const titleSrc = readFileSync(resolve(import.meta.dirname, '../screens/TitleScreen.tsx'), 'utf8')
    const flat = titleSrc.replace(/\s+/g, ' ')
    for (const n of MAKER.notice) expect(flat).toContain(n.replace(/,$/, ''))
  })
})

describe('만든 사람 글 세 언어', () => {
  it('한국어는 MAKER 그대로다', () => {
    expect(MAKER_TEXT.ko.tagline).toBe(MAKER.tagline)
    expect(MAKER_TEXT.ko.notice).toEqual(MAKER.notice)
  })

  it('en · ja에는 한글이 없다', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = MAKER_TEXT[lang]
      const all = [t.tagline, t.about, t.labelMaker, t.labelGames, t.labelThanks, t.thanks, ...t.gameAbouts, ...t.notice]
      for (const text of all) expect(text, lang).not.toMatch(/[가-힣]/)
    }
  })

  it('감사 줄은 어느 언어에서도 pret · pokeplatinum이다', () => {
    for (const t of Object.values(MAKER_TEXT)) {
      expect(t.thanks).toContain('pret')
      expect(t.thanks).toContain('pokeplatinum')
    }
  })
})
