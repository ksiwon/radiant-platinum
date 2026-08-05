// 메뉴 글의 뱅크 번호 고정 (DATA.md §2.11)
//
// `uiText.ts`는 뱅크 번호를 손으로 적어 둔다 — 724개짜리 표(111KB)를 앱에 싣지
// 않으려고. 그 대신 여기서 표와 맞대 본다. 번호가 하나 어긋나면 "가방" 자리에
// 엉뚱한 낱말이 뜨는데, 글자가 나오긴 하므로 눈으로는 넘어가기 쉽다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getBank, type TextBankName } from './textBanks'
import { POKEDEX_TEXT, START_MENU, UI_BANK } from './uiText'

/** uiText의 키 → textBanks의 이름 */
const NAMED: Record<keyof typeof UI_BANK, TextBankName> = {
  startMenu: 'start_menu',
  bagPockets: 'bag_pocket_names',
  bag: 'bag',
  partyMenu: 'party_menu',
  pokedex: 'pokedex',
  menuEntries: 'menu_entries',
  speciesCategory: 'species_category',
  dexEntry: 'species_pokedex_entry_diamond',
  speciesHeight: 'species_height',
  speciesWeight: 'species_weight',
}

describe('메뉴 글', () => {
  for (const [key, name] of Object.entries(NAMED) as [keyof typeof UI_BANK, TextBankName][]) {
    it(`${key}가 ${name} 뱅크를 가리킨다`, () => {
      expect(UI_BANK[key]).toBe(getBank(name).bank.us)
    })
  }

  it('싣는 뱅크에 빠짐이 없다', () => {
    // 번호가 맞아도 그 뱅크를 안 실었으면 화면이 빈다
    const index = resolve(__dirname, '../../public/data/dialogue/index.json')
    if (!existsSync(index)) return
    const shipped = new Set(
      (JSON.parse(readFileSync(index, 'utf8')) as { banks: { index: number }[] })
        .banks.map((b) => b.index),
    )
    for (const bank of Object.values(UI_BANK)) expect(shipped.has(bank)).toBe(true)
  })
})

const DATA = resolve(__dirname, '../../public/data/dialogue/ko')
const present = existsSync(resolve(DATA, `${String(UI_BANK.startMenu)}.json`))
const maybe = present ? describe : describe.skip

maybe('한국어 글이 제자리에 있다', () => {
  const bank = (at: number): string[] => JSON.parse(readFileSync(resolve(DATA, `${String(at)}.json`), 'utf8'))

  it('시작 메뉴 항목이 원작 순서다', () => {
    // 3번은 `{STRVAR_1 3, 0, 0}` — 주인공 이름 자리다. 그래서 글자가 아니라
    // 제어 부호가 들어 있다
    const menu = bank(UI_BANK.startMenu)
    expect(menu[START_MENU.pokedex]).toBe('도감')
    expect(menu[START_MENU.party]).toBe('포켓몬')
    expect(menu[START_MENU.bag]).toBe('가방')
    expect(menu[START_MENU.trainerCard]).toMatch(/^\{STRVAR_1 /)
    expect(menu[START_MENU.save]).toBe('리포트')
    expect(menu[START_MENU.options]).toBe('설정')
    expect(menu[START_MENU.exit]).toBe('닫는다')
  })

  it('주머니 이름 8개가 가방 순서와 같다', () => {
    // 순서가 곧 POCKET_* 번호다. 뒤섞이면 볼이 회복 주머니에 들어간다
    expect(bank(UI_BANK.bagPockets)).toEqual([
      '도구', '회복', '볼', '기술머신', '나무열매', '메일', '배틀용', '중요한 물건',
    ])
  })

  it('도감 화면의 글자리가 맞다', () => {
    const dex = bank(UI_BANK.pokedex)
    expect(dex[POKEDEX_TEXT.seen]).toBe('발견한 수')
    expect(dex[POKEDEX_TEXT.caught]).toBe('잡은 수')
    expect(dex[POKEDEX_TEXT.height]).toBe('키')
    expect(dex[POKEDEX_TEXT.weight]).toBe('몸무게')
  })

  it('모부기의 도감 자료가 종족 번호로 색인된다', () => {
    // 도감 순서(신오 1번)로 색인하면 안 된다. 이 넷은 전부 **종족 번호**다
    expect(bank(UI_BANK.speciesCategory)[387]).toBe('어린잎포켓몬')
    expect(bank(UI_BANK.speciesHeight)[387]?.trim()).toBe('0.4m')
    expect(bank(UI_BANK.speciesWeight)[387]?.trim()).toBe('10.2kg')
    expect(bank(UI_BANK.dexEntry)[387]).toContain('등껍질')
  })
})
