// 메뉴 글의 뱅크 번호 고정 (DATA.md §2.11)
//
// `uiText.ts`는 미국 롬 기준 뱅크 번호를 손으로 적어 둔다. 그 번호가 맞는지는
// **뱅크 이름 순서에서 계산한 자리**와 맞대 본다 (`import/platinum/textBanks.ts`).
// 번호가 하나 어긋나면 "가방" 자리에 엉뚱한 낱말이 뜨는데, 글자가 나오긴 하므로
// 눈으로는 넘어가기 쉽다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bankIndex } from '../import/platinum/textBanks'
import {
  BAG_MENU, BOX_TEXT, FACTORY_TEXT, fillMenuText, FRONTIER_TEXT, MAILBOX_TEXT, MAIN_MENU, MART_TEXT,
  MOVE_REMINDER_TEXT, OPTIONS_TEXT, PARTY_GIVE, PARTY_MENU_TEXT, partyHeader, POKEDEX_TEXT, SAVE_TEXT, SELL_TEXT,
  START_MENU, SUMMARY_TEXT, TOWN_MAP_TEXT, UI_BANK, YES_NO,
} from './uiText'
import { withData, withDecomp } from './romData.testkit'

/**
 * uiText의 키 → textBanks의 이름.
 *
 * ⚠️ 값 타입이 `TextBankName`이 아니라 `string`이다 — `battleParty` · `moveReminder` · `factoryApp` ·
 * `frontierRecords`는 굽는 쪽의 `TEXT_BANK_NAMES`(브라우저 변환기)에 아직 없을 수 있다. 그 목록은 P0b의 몫이고,
 * 여기서는 뱅크 **번호**가 이름 순서와 맞는지만 잰다 (`싣는 뱅크에 빠짐이 없다`가 실린 것을 잰다)
 */
const NAMED: Record<keyof typeof UI_BANK, string> = {
  startMenu: 'start_menu',
  bagPockets: 'bag_pocket_names',
  bag: 'bag',
  partyMenu: 'party_menu',
  battleParty: 'battle_party',
  moveReminder: 'move_reminder',
  factoryApp: 'battle_factory_app',
  frontierRecords: 'battle_frontier_records',
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
  accessoryNamesWithArticles: 'contest_accessory_names_with_articles',
  ballSealNames: 'ball_seal_names',
  ballSealNamesPlural: 'ball_seal_names_plural',
  backdropNames: 'contest_backdrop_names',
  itemNamesPlural: 'item_names_plural',
  speciesNamesWithArticles: 'species_name_with_articles',
  trainerClassNamesWithArticles: 'trainer_class_names_with_articles',
  shop: 'unk_0543',
  trade: 'trade',
  npcTradeNames: 'npc_trade_names',
  credits: 'unk_0548',
  mail: 'mail',
  mailbox: 'mailbox',
  capsuleEditor: 'unk_0008',
  easyChat: 'easy_chat',
  easyChatGroups: 'easy_chat_groups',
  trainerWords: 'trainer_words',
  peopleWords: 'people_words',
  greetings: 'greetings',
  lifestyleWords: 'lifestyle_words',
  feelings: 'feelings',
  toughWords: 'tough_words',
  unionWords: 'union_words',
}

/**
 * 한국·일본 롬에 짝이 없는 뱅크. 「싣는 뱅크에 빠짐이 없다」가 이것을 빼고 센다 —
 * 미국 롬에만 있는 표라 안 실리는 것이 맞다
 */
const EN_ONLY: readonly (keyof typeof UI_BANK)[] = [
  'itemNamesWithArticles', 'itemNamesPlural', 'accessoryNamesWithArticles',
  'speciesNamesWithArticles', 'trainerClassNamesWithArticles',
]

describe('메뉴 글', () => {
  for (const [key, name] of Object.entries(NAMED) as [keyof typeof UI_BANK, string][]) {
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
    for (const [key, bank] of Object.entries(UI_BANK)) {
      expect(shipped.has(bank), key).toBe(true)
    }
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

  it('예·아니오는 메뉴 뱅크 41·42다 — 리포트 뱅크에는 없다', () => {
    // 리포트 화면이 한동안 `common_strings` 82·83을 예·아니오로 읽었다. 그 두 줄은
    // 센터 지하 안내원과 포켓치 설명원의 대사라, 물음 밑에 대사 두 벌이 답으로 떴다
    // (실측 2026-09-21). 글자가 나오기는 하므로 눈으로는 넘어가기 쉬운 자리다
    const menu = bank(UI_BANK.menuEntries)
    expect(menu[YES_NO.yes]).toBe('예')
    expect(menu[YES_NO.no]).toBe('아니오')
    const common = bank(UI_BANK.common)
    expect(common.findIndex((s) => s.trim() === '예')).toBe(-1)
    expect(common[82]).not.toBe('예')
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

/**
 * 줄 번호를 디컴프의 이름과 맞댄다 (`res/text/*.json`의 `messages[].id`).
 *
 * 줄 번호 하나가 어긋나면 「버린다」 자리에 「등록」이 뜨는데, 글자가 나오기는
 * 하므로 눈으로 넘어가기 쉽다. 원작 이름은 지어낸 것이 아니라 그 자리의 뜻이다
 */
const TEXT_DIR = resolve(__dirname, '../../raw/decomp/res/text')
const decompIds = (name: string): string[] =>
  (JSON.parse(readFileSync(resolve(TEXT_DIR, `${name}.json`), 'utf8')) as { messages: { id: string }[] })
    .messages.map((m) => m.id)

withDecomp('res/text/bag.json', 'res/text/party_menu.json', 'res/text/box_messages.json', 'res/text/start_menu.json')(
  '줄 번호가 디컴프의 이름과 맞는다', () => {
    it('가방 갈래와 버리기 (`Bag_Text_*`)', () => {
      const ids = decompIds('bag')
      const want: Record<keyof typeof BAG_MENU, string> = {
        use: 'Use', trash: 'Trash', register: 'Register', give: 'Give', checkTag: 'CheckTag', walk: 'Walk',
        cancel: 'Cancel', check: 'Check', deselect: 'Deselect', plant: 'Plant', open: 'Open',
        selected: 'ItemIsSelected', cantHold: 'ItemCantBeHeld', trashHowMany: 'ThrowAwayHowMany',
        trashed: 'ThrewAwayItem', trashOk: 'ThrowAwayOK', trashCount: 'ThrowAwayCount',
      }
      for (const [key, id] of Object.entries(want)) {
        expect(ids[BAG_MENU[key as keyof typeof BAG_MENU]]).toBe(`Bag_Text_${id}`)
      }
    })

    it('건네줄 때의 파티 메뉴 줄 (`PartyMenu_Text_*`)', () => {
      const ids = decompIds('party_menu')
      const want: Record<keyof typeof PARTY_GIVE, string> = {
        which: 'GiveToWhichMon', mustRemoveMail: 'MustRemoveMail',
        swapAsk: 'MonAlreadyHoldingItemsSwitchItems', swapped: 'ItemWasTakenAndReplacedWithItem',
        given: 'MonWasGivenItem', mailMoved: 'MailWasTransferredFromMailbox',
        mailHeld: 'MonHoldingItemCannotHoldMail', cannotHold: 'MonCannotHoldItem',
      }
      for (const [key, id] of Object.entries(want)) {
        expect(ids[PARTY_GIVE[key as keyof typeof PARTY_GIVE]]).toBe(`PartyMenu_Text_${id}`)
      }
    })

    it('박스의 놓아주기 줄 (`BoxText_*`)', () => {
      const ids = decompIds('box_messages')
      const want: Partial<Record<keyof typeof BOX_TEXT, string>> = {
        monSelected: 'MonSelected', markMon: 'MarkMon', releaseAsk: 'ReleaseMon', released: 'MonReleased',
        releasedBye: 'GoodbyeForever', lastMon: 'LastMon', releaseEgg: 'CantReleaseEgg',
        releaseMail: 'RemoveMail', releaseCapsule: 'DetachBallCapsule', releaseReturned: 'MonReturned',
        releaseWorried: 'MonWasWorried', partyFull: 'PartyFull', boxFull: 'BoxFull', noItem: 'NoItem',
      }
      for (const [key, id] of Object.entries(want)) {
        expect(ids[BOX_TEXT[key as keyof typeof BOX_TEXT]]).toBe(`BoxText_${id}`)
      }
    })

    it('사파리의 남은 볼 (`StartMenu_Text_*`)', () => {
      const ids = decompIds('start_menu')
      expect(ids[START_MENU.retire]).toBe('StartMenu_Text_Retire')
      expect(ids[START_MENU.safariBalls]).toBe('StartMenu_Text_SafariBalls')
      expect(ids[START_MENU.parkBalls]).toBe('StartMenu_Text_ParkBalls')
      expect(ids[START_MENU.ballStock]).toBe('StartMenu_Text_BallStock')
    })
  },
)

maybe('한국어 판의 새 줄', () => {
  const bank = (at: number): string[] => JSON.parse(readFileSync(resolve(DATA, `${String(at)}.json`), 'utf8'))

  it('사파리볼 남은 수는 0번 칸에 수를 넣는다', () => {
    // 부호의 51은 「수」라는 종류고 칸이 아니다 — 51번 칸에 넣으면 빈 글이 나온다
    expect(fillMenuText(bank(UI_BANK.startMenu)[START_MENU.ballStock]!, ['12'])).toBe('12개 남음')
  })

  it('버리기 물음에 도구 이름과 조사가 붙는다', () => {
    const bag = bank(UI_BANK.bag)
    expect(fillMenuText(bag[BAG_MENU.trashOk]!, ['상처약', '3'])).toBe('상처약을\n3개 버려도 괜찮겠습니까?')
    expect(fillMenuText(bag[BAG_MENU.trashed]!, ['몬스터볼', '2'])).toBe('몬스터볼을\n2개 버렸습니다')
  })

  it('메일박스의 물음에 주인 이름이 들어간다', () => {
    expect(fillMenuText(bank(UI_BANK.mailbox)[MAILBOX_TEXT.ask]!, ['빛나']))
      .toBe('빛나의\n메일을 어떻게 하겠습니까?')
  })

  it('상점의 확인 줄이 도구 · 개수 · 값 칸을 받는다', () => {
    const shop = bank(UI_BANK.shop)
    expect(fillMenuText(shop[MART_TEXT.confirm]!, ['몬스터볼', '10', '2,000']))
      .toBe('몬스터볼 10개로군요\n총 2,000원입니다.')
    expect(fillMenuText(shop[MART_TEXT.bpConfirm]!, ['기합의띠', '1', '48']))
      .toBe('기합의띠 1개로군요\n총 48BP입니다')
    // 기술머신은 기술 이름이 3번 칸이다
    expect(fillMenuText(shop[MART_TEXT.tmConfirm]!, ['기술머신01', '1', '3,000', '힘껏펀치']))
      .toContain('힘껏펀치')
    expect(fillMenuText(shop[MART_TEXT.thanks]!, ['몬스터볼', '볼'])).toContain('볼 포켓에 넣었다')
  })

  it('상점의 거절 줄 셋이 롬 글이다', () => {
    const shop = bank(UI_BANK.shop)
    expect(shop[MART_TEXT.noMoney]).toBe('돈이 부족하시군요!')
    expect(shop[MART_TEXT.noRoom]).toContain('가지고 다닐 수 없어요!')
    expect(shop[MART_TEXT.noBP]).toContain('BP가 부족한 것 같습니다')
  })
})

describe('파티 머리 글', () => {
  it('숫자를 명사구 뒤에 두고 동사 뒤에 매달지 않는다', () => {
    expect(partyHeader(5, 6, 'ko')).toBe('전투 가능 5마리 · 파티 6/6')
    expect(partyHeader(1, 3, 'ko')).not.toMatch(/있다/)
  })
})

maybe('메뉴 개편이 더한 롬 글 자리', () => {
  const bank = (at: number): string[] => JSON.parse(readFileSync(resolve(DATA, `${String(at)}.json`), 'utf8'))

  it('파티 메뉴(453)의 안내문과 모드 줄', () => {
    const party = bank(UI_BANK.partyMenu)
    expect(party[PARTY_MENU_TEXT.choose]).toBe('포켓몬을 선택해 주십시오')
    expect(party[PARTY_MENU_TEXT.give]).toBe('어느 포켓몬에게 건네줄까?')
    expect(party[PARTY_MENU_TEXT.use]).toBe('어느 포켓몬에게 사용할까?')
    expect(party[PARTY_MENU_TEXT.teach]).toBe('어느 포켓몬에게 가르칠까?')
    expect([PARTY_MENU_TEXT.canLearn, PARTY_MENU_TEXT.cannotLearn, PARTY_MENU_TEXT.alreadyKnows]
      .map((i) => party[i])).toEqual(['배울 수 있다!', '배울 수 없다', '이미 알고 있다'])
    expect([PARTY_MENU_TEXT.canUse, PARTY_MENU_TEXT.cannotUse].map((i) => party[i]))
      .toEqual(['쓸 수 있습니다', '쓸 수 없습니다'])
    expect(party[PARTY_MENU_TEXT.chooseEgg]).toBe('알을 선택해 주십시오')
    expect(party[PARTY_MENU_TEXT.eggAsk]).toBe('알을\n어떻게 할까?')
  })

  it('요약(455)의 이름표 — 능력 여섯 · PP · 위력 · 명중 · 「--」 · 「---」', () => {
    const summary = bank(UI_BANK.summary)
    expect(SUMMARY_TEXT.stats.map((i) => summary[i])).toEqual(['HP', '공격', '방어', '특수공격', '특수방어', '스피드'])
    expect(summary[SUMMARY_TEXT.pp]).toBe('PP')
    expect(summary[SUMMARY_TEXT.power]).toBe('위력')
    expect(summary[SUMMARY_TEXT.accuracy]).toBe('명중')
    expect(summary[SUMMARY_TEXT.swap]).toBe('교체')
    expect(summary[SUMMARY_TEXT.noPp]).toBe('--')
    expect(summary[SUMMARY_TEXT.noValue]).toBe('---')
  })

  it('팩토리(364)와 프런티어 기록(16)', () => {
    const factory = bank(UI_BANK.factoryApp)
    expect(factory[FACTORY_TEXT.pickMon]).toContain('번째 포켓몬을')
    expect(factory[FACTORY_TEXT.rent]).toBe('대여받는다')
    expect(factory[FACTORY_TEXT.close]).toBe('닫는다')
    expect(factory[FACTORY_TEXT.stopTrade]).toContain('교환을')
    const records = bank(UI_BANK.frontierRecords)
    expect(records[FRONTIER_TEXT.single]).toBe('싱글')
    expect(records[FRONTIER_TEXT.level50]).toBe('레벨 50')
    expect(records[FRONTIER_TEXT.openLevel]).toBe('오픈 레벨')
    expect(records[FRONTIER_TEXT.streak]).toMatch(/연승$/)
  })

  it('가이드맵(615) · 설정(220) · 리포트(213) · 상점(7 · 543)', () => {
    const map = bank(UI_BANK.townMap)
    expect(map[TOWN_MAP_TEXT.title]).toBe('가이드맵')
    expect(map[TOWN_MAP_TEXT.ask]).toBe('어디로 날아갈까요?')
    const opt = bank(UI_BANK.options)
    expect(opt[OPTIONS_TEXT.confirmChanges]).toBe('선택하신 설정으로 변경하시겠습니까?')
    expect(opt[OPTIONS_TEXT.closeHelp]).toBe('게임으로 돌아갑니다')
    const common = bank(UI_BANK.common)
    expect(common[SAVE_TEXT.writingFull]).toContain('많은 내용을 기록 중')
    const bag = bank(UI_BANK.bag)
    expect(bag[SELL_TEXT.cannot]).toContain('파실 수 없습니다')
    expect(bag[SELL_TEXT.howMany]).toContain('몇 개 파시겠습니까?')
    expect(bag[SELL_TEXT.ask]).toContain('쳐 드리겠습니다')
    expect(bag[SELL_TEXT.done]).toContain('원을 받았다')
    const shop = bank(UI_BANK.shop)
    expect(shop[MART_TEXT.closeRow]).toBe('그만둔다')
    expect(shop[MART_TEXT.bye]).toBe('또 오세요!')
    expect(shop[MART_TEXT.more]).toContain('도와드릴 건 없습니까?')
    expect(shop[MART_TEXT.byeBP]).toContain('BP를 모아서')
  })

  it('박스(19)의 이름표와 알림 줄', () => {
    const box = bank(UI_BANK.boxMessages)
    expect([BOX_TEXT.nature, BOX_TEXT.level, BOX_TEXT.hp, BOX_TEXT.moves].map((i) => box[i]))
      .toEqual(['성격', 'Lv.', 'HP', '기술'])
    expect(box[BOX_TEXT.pickWithdraw]).toContain('데리고 갈 포켓몬')
    expect(box[BOX_TEXT.holding]).toBe('포켓몬을 쥐고 있습니다!')
    expect(box[BOX_TEXT.bagFull]).toBe('가방이 가득 찼습니다!')
  })

  it('타이틀(550)의 줄 2 이름표 넷이 있다', () => {
    const menu = bank(UI_BANK.mainMenu)
    expect([MAIN_MENU.player, MAIN_MENU.playtime, MAIN_MENU.dex, MAIN_MENU.badges].map((i) => menu[i]))
      .toEqual(['주인공', '플레이 시간', '포켓몬 도감', '가지고 있는 배지'])
  })

  it('배틀 파티(3)의 기술 정보 이름표 — 위력 · 명중 · 분류 · 물리 · 변화 · 특수 · 「---」', () => {
    const party = bank(UI_BANK.battleParty)
    expect(party).toHaveLength(96)
    expect(party[48]).toBe('위력')
    expect(party[51]).toBe('명중')
    expect(party[53]).toBe('분류')
    // 차례가 물리 · 변화 · 특수다 (엔진은 물리 · 특수 · 변화)
    expect([54, 55, 56].map((i) => party[i])).toEqual(['물리', '변화', '특수'])
    expect(party[50]).toBe('---')
  })

  it('기술 되살리기(645)는 굽는 쪽이 싣기 전이면 없다 — 번호표만 잠근다', () => {
    expect(UI_BANK.moveReminder).toBe(645)
    expect(MOVE_REMINDER_TEXT.askTeachWhichToMon).toBe(0)
    expect(MOVE_REMINDER_TEXT.tutorOffset).toBe(11)
    expect(MOVE_REMINDER_TEXT.cancel).toBe(32)
    expect(MOVE_REMINDER_TEXT.dashes).toBe(33)
  })
})
