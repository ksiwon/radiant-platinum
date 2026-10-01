// 트레이너 카드 (`TrainerCard.tsx`)
//
// 카드 판 고르기 · 날짜 틀 · 플레이 시간 · 뒷면의 통신 세 줄, 그리고 글 자리 표가 롬 뱅크 차례와 맞는지.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { newGameRecords } from '../../engine/world/gameRecords'
import { withDecomp } from '../../data/romData.testkit'
import { cardDate, cardPlayTime, cardRow, linkRecords, TRAINER_CARD_TEXT } from './TrainerCard'

describe('cardRow — 카드 판 (`TrainerCase_LoadCardPalette`)', () => {
  it('도감을 받기 전에는 등급과 상관없이 「도감 없음」 판이다', () => {
    expect(cardRow(0, false)).toBe(6)
    expect(cardRow(3, false)).toBe(6)
  })

  it('받은 뒤에는 등급이 곧 줄이다 — 노멀 0 … 블랙 5', () => {
    for (let level = 0; level <= 5; level++) expect(cardRow(level, true)).toBe(level)
  })
})

describe('cardDate — 롬의 날짜 틀', () => {
  const at = new Date(2026, 9, 2, 7, 5)

  it('한국판 틀은 칸 3에 숫자를 받는다 — 달 이름(「10월」)을 넣으면 「10월월」이 된다', () => {
    const ko = '{STRVAR_1 51, 2, 0}년 {STRVAR_1 51, 3, 0}월 {STRVAR_1 51, 4, 0}일'
    expect(cardDate(ko, ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'], at))
      .toBe('26년 10월 02일')
  })

  it('미국판 틀은 칸 3에 달 이름을 받는다 (`StringTemplate_SetMonthName`)', () => {
    const en = '{STRVAR_1 74, 3, 0} {STRVAR_1 51, 4, 0}, 20{STRVAR_1 51, 2, 0}'
    const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']
    expect(cardDate(en, months, at)).toBe('Oct. 02, 2026')
  })

  it('달 이름 뱅크가 없으면(일본판) 숫자로 메운다 — 틀의 부호가 글자로 새지 않는다', () => {
    expect(cardDate('{STRVAR_1 74, 3, 0}', [], at)).toBe('10')
  })
})

describe('cardPlayTime', () => {
  it('시는 채우지 않고 분은 두 자리다', () => {
    expect(cardPlayTime(0)).toEqual({ hours: '0', minutes: '00' })
    expect(cardPlayTime((3 * 60 + 7) * 60000 + 59_999)).toEqual({ hours: '3', minutes: '07' })
  })

  it('999:59에서 멈춘다 (`PlayTime_Increment`)', () => {
    expect(cardPlayTime(2000 * 3_600_000)).toEqual({ hours: '999', minutes: '59' })
  })
})

describe('linkRecords — 뒷면의 통신 세 줄 (`TrainerCase_Init`)', () => {
  it('새 판은 다 0이다', () => {
    expect(linkRecords(newGameRecords())).toEqual({ linked: 0, wins: 0, losses: 0, trades: 0 })
  })

  it('횟수는 여섯 칸의 합이고, 교환은 그중 둘이다 · 상한에서 멈춘다', () => {
    const r = newGameRecords()
    r[91] = 1; r[19] = 2; r[24] = 3; r[20] = 4; r[25] = 5; r[32] = 6
    r[21] = 10_000; r[26] = 1; r[22] = 2; r[27] = 3
    expect(linkRecords(r)).toEqual({ linked: 21, wins: 9999, losses: 5, trades: 5 })
    r[19] = 999_999
    expect(linkRecords(r).linked).toBe(999_999)
    expect(linkRecords(r).trades).toBe(99_999)
  })
})

withDecomp('res/text/trainer_card.json')('TRAINER_CARD_TEXT — 뱅크 차례', () => {
  const bank = JSON.parse(readFileSync(resolve(__dirname, '../../../raw/decomp/res/text/trainer_card.json'), 'utf8')) as {
    messages: { id: string }[]
  }
  const id = (at: number): string => bank.messages[at]?.id ?? ''

  it('글 자리가 디컴프의 이름과 맞는다', () => {
    expect({
      idNo: id(TRAINER_CARD_TEXT.idNo), name: id(TRAINER_CARD_TEXT.name), money: id(TRAINER_CARD_TEXT.money),
      pokedex: id(TRAINER_CARD_TEXT.pokedex), score: id(TRAINER_CARD_TEXT.score), time: id(TRAINER_CARD_TEXT.time),
      adventureStarted: id(TRAINER_CARD_TEXT.adventureStarted), hallOfFameDebut: id(TRAINER_CARD_TEXT.hallOfFameDebut),
      timesLinked: id(TRAINER_CARD_TEXT.timesLinked), linkBattles: id(TRAINER_CARD_TEXT.linkBattles),
      linkTrades: id(TRAINER_CARD_TEXT.linkTrades), colon: id(TRAINER_CARD_TEXT.colon),
      twoDashes: id(TRAINER_CARD_TEXT.twoDashes), money$: id(TRAINER_CARD_TEXT.money$), hhmm: id(TRAINER_CARD_TEXT.hhmm),
      date: id(TRAINER_CARD_TEXT.date), win: id(TRAINER_CARD_TEXT.win), loss: id(TRAINER_CARD_TEXT.loss),
      blankDate: id(TRAINER_CARD_TEXT.blankDate), count: id(TRAINER_CARD_TEXT.count), times: id(TRAINER_CARD_TEXT.times),
    }).toEqual({
      idNo: 'TrainerCard_Text_IDNo', name: 'TrainerCard_Text_Name', money: 'TrainerCard_Text_Money',
      pokedex: 'TrainerCard_Text_Pokedex', score: 'TrainerCard_Text_Score', time: 'TrainerCard_Text_Time',
      adventureStarted: 'TrainerCard_Text_AdventureStarted', hallOfFameDebut: 'TrainerCard_Text_HallOfFameDebut',
      timesLinked: 'TrainerCard_Text_TimesLinked', linkBattles: 'TrainerCard_Text_LinkBattles',
      linkTrades: 'TrainerCard_Text_LinkTrades', colon: 'TrainerCard_Text_Colon',
      twoDashes: 'TrainerCard_Text_TwoDashes', money$: 'TrainerCard_Text_Format_Money',
      hhmm: 'TrainerCard_Text_Format_HHMMWithColon', date: 'TrainerCard_Text_Format_MMDD20YY',
      win: 'TrainerCard_Text_W', loss: 'TrainerCard_Text_L', blankDate: 'TrainerCard_Text_BlankDate',
      count: 'TrainerCard_Text_Format_Number_1', times: 'TrainerCard_Text_Format_Number_2',
    })
  })
})
