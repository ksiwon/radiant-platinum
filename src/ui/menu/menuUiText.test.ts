// 가방 · 상점 · 리포트 · 박스 화면의 세 언어 글 (`menuUiText.ts`) — 구조와 롬 줄과의 맞대기.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fillMenuText, MONEY_WINDOW_TEXT, partyHeader, START_MENU, SUMMARY_TEXT, YES_NO } from '../../data/uiText'
import { MENU_UI_TEXT, type BagFootMode, type BoxFootState } from './menuUiText'
import { bagFoot } from './BagScreen'
import { boxFoot, boxNote } from './box/boxMenus'

const LOCALES = ['ko', 'en', 'ja'] as const
const bankOf = (locale: string, n: number): string[] =>
  JSON.parse(readFileSync(`public/data/dialogue/${locale}/${n}.json`, 'utf8')) as string[]

const BAG_MODES: BagFootMode[] = ['normal', 'pick', 'give', 'menu', 'count', 'move']
const BOX_STATES: BoxFootState[] = [
  { say: true, menu: false, compare: false, items: false, held: false, heldItem: false, comparePage: 'P' },
  { say: false, menu: true, compare: false, items: false, held: false, heldItem: false, comparePage: 'P' },
  { say: false, menu: false, compare: true, items: false, held: false, heldItem: false, comparePage: 'P' },
  { say: false, menu: false, compare: false, items: true, held: false, heldItem: true, comparePage: 'P' },
  { say: false, menu: false, compare: false, items: true, held: false, heldItem: false, comparePage: 'P' },
  { say: false, menu: false, compare: false, items: false, held: true, heldItem: false, comparePage: 'P' },
  { say: false, menu: false, compare: false, items: false, held: false, heldItem: false, comparePage: 'P' },
]

/** 한 언어의 모든 글을 평평한 목록으로 — 함수는 본보기 값으로 부른다 */
function allTexts(locale: (typeof LOCALES)[number]): string[] {
  const t = MENU_UI_TEXT[locale]
  const out: string[] = []
  for (const v of Object.values(t)) {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) out.push(...(v as string[]))
  }
  for (const mode of BAG_MODES) for (const movable of [false, true]) out.push(t.bagFoot(mode, movable))
  const sample = locale === 'ja' ? 'ボ－ル' : locale === 'en' ? 'Poké Ball' : '몬스터볼'
  out.push(t.bagRegistered(sample, sample, 'Y'), t.bagUnregistered(sample), t.shopKinds(12))
  for (const s of BOX_STATES) out.push(t.boxFoot(s))
  out.push(t.boxNote(1, 30, 5, 540, 3, 6), t.partyFootUse(true), t.partyFootUse(false), partyHeader(5, 6, locale))
  return out
}

describe('세 언어가 같은 칸을 다 채운다', () => {
  it('키가 같고 글이 비지 않았다', () => {
    const keys = Object.keys(MENU_UI_TEXT.ko).sort()
    for (const locale of LOCALES) {
      expect(Object.keys(MENU_UI_TEXT[locale]).sort()).toEqual(keys)
      for (const text of allTexts(locale)) expect(text.trim().length, `${locale}: ${text}`).toBeGreaterThan(0)
    }
  })

  it('일본어는 롬처럼 전각 공백과 －다 — ASCII 공백도 ー도 없다', () => {
    for (const text of allTexts('ja')) {
      expect(text, text).not.toContain(' ')
      expect(text, text).not.toContain('ー')
    }
    expect(MENU_UI_TEXT.ja.bagFoot('pick', false)).toContain('\u3000')
  })

  it('일본어에는 한자가 없다', () => {
    for (const text of allTexts('ja')) expect(/[一-鿿]/.test(text), text).toBe(false)
  })

  it('영어는 한글을, 한국어는 일본 글자를 안 섞는다', () => {
    for (const text of allTexts('en')) expect(/[가-힣぀-ヿ]/.test(text), text).toBe(false)
    for (const text of allTexts('ko')) expect(/[぀-ヿ]/.test(text), text).toBe(false)
  })
})

describe('한국어는 화면에 있던 문장 그대로다', () => {
  it('가방', () => {
    expect(bagFoot('normal', true, 'ko')).toBe('←→ 주머니 · ↑↓ 고르기 · Z 메뉴 · Shift 옮기기 · X 닫기')
    expect(bagFoot('count', false, 'ko')).toBe('↑↓ 하나씩 · ←→ 열씩 · Z 결정 · X 그만둔다')
    expect(MENU_UI_TEXT.ko.bagUnregistered('몬스터볼')).toBe('몬스터볼의 등록을 해제했다.')
  })

  it('박스', () => {
    expect(boxNote(2, 3, 4, 6, 540, 'ko')).toBe('박스 2/30 · 전체 3/540 · 파티 4/6')
    expect(boxFoot({ ...BOX_STATES[6]!, mode: 2, locale: 'ko' }, { compare: 4, items: 3 }))
      .toBe('↑↓←→ 고르기 · Z 메뉴 · Tab 파티/박스 · Q/E 박스 · X 닫기')
  })

  it('영어·일본어 박스 안내도 언어를 따라간다', () => {
    const state = { say: false, menu: false, mode: 2, held: false, heldItem: false, comparePage: 'Stats' }
    expect(boxFoot({ ...state, locale: 'en' }, { compare: 4, items: 3 })).toContain('Q/E Box')
    expect(boxFoot({ ...state, locale: 'ja' }, { compare: 4, items: 3 })).toContain('ボックス')
    expect(boxNote(2, 3, 4, 6, 540, 'en')).toBe('Box 2/30 · Total 3/540 · Party 4/6')
  })
})

describe('롬 줄과 같은 것', () => {
  for (const locale of LOCALES) {
    it(`${locale} — 예/아니오는 메뉴 뱅크 361의 줄이다`, () => {
      const menu = bankOf(locale, 361)
      expect(MENU_UI_TEXT[locale].yes).toBe(menu[YES_NO.yes])
      expect(MENU_UI_TEXT[locale].no).toBe(menu[YES_NO.no])
    })
  }

  it('영어·일본어 비교표의 능력 이름은 롬 요약 화면(455:110~115) 그대로다', () => {
    for (const locale of ['en', 'ja'] as const) {
      const bank = bankOf(locale, 455)
      expect([...MENU_UI_TEXT[locale].compareStats]).toEqual(SUMMARY_TEXT.stats.map((at) => bank[at]))
    }
    // 한국어는 좁은 칸용 줄임말이라 롬 「특수공격」과 다르다 — 앞 셋과 끝은 같다
    const ko = bankOf('ko', 455)
    const stats = MENU_UI_TEXT.ko.compareStats
    expect([stats[0], stats[1], stats[2], stats[5]]).toEqual([ko[110], ko[111], ko[112], ko[115]])
  })

  it('영어 BUY/SELL은 상점 뱅크 543의 15·16번이다', () => {
    const shop = bankOf('en', 543)
    expect(MENU_UI_TEXT.en.buy.toUpperCase()).toBe(shop[15])
    expect(MENU_UI_TEXT.en.sell.toUpperCase()).toBe(shop[16])
    // 한국어·일본어는 「사러 왔다/팔러 왔다」 · 「かいに\u3000きた/うりに\u3000きた」의 줄기다
    expect(bankOf('ja', 543)[15]).toContain('かい')
    expect(bankOf('ja', 543)[16]).toContain('うり')
    expect(MENU_UI_TEXT.ja.buy).toBe('かう')
    expect(MENU_UI_TEXT.ja.sell).toBe('うる')
  })

  for (const locale of LOCALES) {
    it(`${locale} — 가방 제목(367:2)과 소지금 틀(543:19)이 롬에 있다`, () => {
      expect(bankOf(locale, 367)[START_MENU.bag]!.length).toBeGreaterThan(0)
      const money = bankOf(locale, 543)[MONEY_WINDOW_TEXT.amount]!
      expect(fillMenuText(money, ['1,200'])).toContain('1,200')
    })
  }
})
