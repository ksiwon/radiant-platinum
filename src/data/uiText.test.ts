// 메뉴 글의 뱅크 번호 고정 (DATA.md §2.11)
//
// `uiText.ts`는 미국 롬 기준 뱅크 번호를 손으로 적어 둔다. 그 번호가 맞는지는
// **뱅크 이름 순서에서 계산한 자리**와 맞대 본다 (`import/platinum/textBanks.ts`).
// 번호가 하나 어긋나면 "가방" 자리에 엉뚱한 낱말이 뜨는데, 글자가 나오긴 하므로
// 눈으로는 넘어가기 쉽다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bankIndex, type TextBankName } from '../import/platinum/textBanks'
import {
  fillMenuText, MAIN_MENU, OPTIONS_TEXT, POKEDEX_TEXT, SAVE_TEXT, START_MENU, UI_BANK,
} from './uiText'
import { withData } from './romData.testkit'

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
  options: 'options_menu',
  saveInfo: 'save_info_window',
  mainMenu: 'main_menu_options',
  common: 'common_strings',
  intro: 'rowan_intro',
  naming: 'naming_screen',
  moveDescriptions: 'move_descriptions',
  storageSystem: 'pokemon_storage_system',
  boxMessages: 'box_messages',
  summary: 'pokemon_summary_screen',
  specialMetLocations: 'special_met_location_names',
  monthNames: 'month_names',
  townMap: 'town_map',
  journal: 'journal_entries',
  gymNames: 'gym_names',
  timesOfDay: 'times_of_day',
  poketchApps: 'poketch_app_names',
  poketchMoveTester: 'poketch_move_tester',
  diploma: 'diploma',
  berryTags: 'berry_tags',
  berryNames: 'berry_names',
  berryText: 'berry_descriptions',
  hallOfFame: 'hall_of_fame',
  pcHallOfFame: 'pc_hall_of_fame',
  natureNames: 'nature_names',
  accessoryNames: 'contest_accessory_names',
  itemNamesWithArticles: 'item_names_with_articles',
  itemNamesPlural: 'item_names_plural',
  speciesNamesWithArticles: 'species_name_with_articles',
  trainerClassNamesWithArticles: 'trainer_class_names_with_articles',
  shop: 'unk_0543',
  trade: 'trade',
  npcTradeNames: 'npc_trade_names',
  credits: 'unk_0548',
}

/**
 * 한국·일본 롬에 짝이 없는 뱅크. 「싣는 뱅크에 빠짐이 없다」가 이것을 빼고 센다 —
 * 미국 롬에만 있는 표라 안 실리는 것이 맞다
 */
const EN_ONLY: readonly (keyof typeof UI_BANK)[] = [
  'itemNamesWithArticles', 'itemNamesPlural',
  'speciesNamesWithArticles', 'trainerClassNamesWithArticles',
]

describe('메뉴 글', () => {
  for (const [key, name] of Object.entries(NAMED) as [keyof typeof UI_BANK, TextBankName][]) {
    it(`${key}가 ${name} 뱅크를 가리킨다`, () => {
      expect(UI_BANK[key]).toBe(bankIndex(name, 'us'))
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

  it('조사·복수형 뱅크는 한국어 판에 없다', () => {
    // 없는 것이 맞다는 것을 못 박아 둔다 — 어느 날 실리기 시작하면 맨 이름표로
    // 떨어뜨리는 길(`orPlain`)이 죽은 코드가 되므로 그때 알아야 한다
    if (!existsSync(resolve(DATA, `${String(UI_BANK.startMenu)}.json`))) return
    for (const key of EN_ONLY) {
      expect(existsSync(resolve(DATA, `${String(UI_BANK[key])}.json`))).toBe(false)
    }
  })
})

const DATA = resolve(__dirname, '../../public/data/dialogue/ko')
const maybe = withData(`dialogue/ko/${String(UI_BANK.startMenu)}.json`)

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

  it('설정 항목과 고를 값이 원작 자리에 있다', () => {
    const opt = bank(UI_BANK.options)
    expect(opt[OPTIONS_TEXT.labels.speed]).toBe('이야기의 속도')
    expect(OPTIONS_TEXT.speed.map((i) => opt[i])).toEqual(['느리게', '보통', '빠르게'])
    expect(OPTIONS_TEXT.battleScene.map((i) => opt[i])).toEqual(['본다', '보지 않는다'])
    expect(OPTIONS_TEXT.sound.map((i) => opt[i])).toEqual(['스테레오', '모노'])
    expect(opt[OPTIONS_TEXT.help.speed]).toContain('메시지의 속도')
  })

  it('리포트 흐름의 물음과 대답이 제자리다', () => {
    const common = bank(UI_BANK.common)
    expect(common[SAVE_TEXT.ask]).toContain('리포트로 작성할까요?')
    expect(common[SAVE_TEXT.overwrite]).toContain('덮어써도')
    // 16번은 이름 자리가 있는 글이다. 안 채우면 부호가 그대로 화면에 뜬다
    expect(common[SAVE_TEXT.done]).toMatch(/^\{STRVAR_1 /)
    expect(fillMenuText(common[SAVE_TEXT.done]!, ['빛나'])).toBe('빛나는\n리포트를 꼼꼼히 기록했다!')
  })

  it('타이틀의 두 갈래가 원작 글이다', () => {
    const menu = bank(UI_BANK.mainMenu)
    expect(menu[MAIN_MENU.continue_]).toBe('모험을 계속한다')
    expect(menu[MAIN_MENU.newGame]).toBe('새로운 모험을 시작한다')
  })

  it('모부기의 도감 자료가 종족 번호로 색인된다', () => {
    // 도감 순서(신오 1번)로 색인하면 안 된다. 이 넷은 전부 **종족 번호**다
    expect(bank(UI_BANK.speciesCategory)[387]).toBe('어린잎포켓몬')
    expect(bank(UI_BANK.speciesHeight)[387]?.trim()).toBe('0.4m')
    expect(bank(UI_BANK.speciesWeight)[387]?.trim()).toBe('10.2kg')
    expect(bank(UI_BANK.dexEntry)[387]).toContain('등껍질')
  })
})
