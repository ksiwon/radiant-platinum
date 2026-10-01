// 작은 메뉴들의 문구 (`FlyScreen`의 `flyCaption` · `MoveReminderScreen`의 `reminderNote`·`reminderFoot` ·
// `MailScreen`의 `mailPaperName`·`mailFoot` · `NameScreen`의 `NAME_HINT`)
//
// 타운맵 도구로 보기만 할 때도 지도 아래에 「Z · 여기로 날아간다」가 떴다. 기술 떠올리기 머리는
// 별명이 없으면 「 Lv.15」만 남았다. 메일 화면은 롬이 「메일」·「단어」라 부르는 것을
// 「편지」·「낱말」로 불렀고 편지지 이름을 「편지지 N」으로 지어 붙였다. 바닥 안내는
// 「닫는다」·「Q E」·「← →」로 화면마다 갈렸고, 이름 짓기에는 Enter·Esc 안내가 없었다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withData } from '../../data/romData.testkit'
import { MAIL_ITEM_FIRST } from '../../engine/world/mail'

const { flyCaption } = await import('./FlyScreen')
const { reminderFoot, reminderNote } = await import('./MoveReminderScreen')
const { mailFoot, mailPaperName } = await import('./MailScreen')
const { NAME_HINT } = await import('./NameScreen')

const source = (file: string): string => readFileSync(resolve(__dirname, file), 'utf8')

describe('타운맵 아래 날기 줄', () => {
  it('날기 자리가 아니면 아무것도 안 띄운다', () => {
    expect(flyCaption(false, false, false)).toBeNull()
    expect(flyCaption(false, false, true)).toBeNull()
  })

  it('날 수 있는 자리에서만 Z를 말한다', () => {
    expect(flyCaption(true, true, false)).toBe('Z · 여기로 날아간다')
  })

  it('보기만 하는 지도에서는 Z를 안 말한다', () => {
    expect(flyCaption(true, true, true)).toBe('날 수 있는 곳')
    expect(flyCaption(true, true, true)).not.toContain('Z')
  })

  it('안 가 본 자리는 어느 쪽이든 같다', () => {
    expect(flyCaption(true, false, false)).toBe('아직 가 본 적이 없다')
    expect(flyCaption(true, false, true)).toBe('아직 가 본 적이 없다')
  })
})

describe('기술 떠올리기 머리', () => {
  const names = ['', '이상해씨', '이상해풀']

  it('별명이 없으면 종족 이름이다', () => {
    expect(reminderNote({ nickname: null, species: 2, level: 15 }, names)).toBe('이상해풀 Lv.15')
  })

  it('별명이 있으면 별명이다', () => {
    expect(reminderNote({ nickname: '풀돌이', species: 2, level: 15 }, names)).toBe('풀돌이 Lv.15')
  })

  it('이름표가 아직 안 왔으면 레벨만 남는다', () => {
    expect(reminderNote({ nickname: null, species: 2, level: 7 }, [])).toBe(' Lv.7')
  })

  it('바닥은 명사형이다', () => {
    expect(reminderFoot(true)).toBe('↑↓ 잊을 기술 · Z 결정 · X 뒤로')
    expect(reminderFoot(false)).toBe('↑↓ 고르기 · Z 가르친다 · X 그만둔다')
  })
})

describe('메일 화면', () => {
  it('편지지 이름은 도구 이름표의 메일 도구다', () => {
    const items: string[] = []
    items[MAIL_ITEM_FIRST] = '잔디메일'
    items[MAIL_ITEM_FIRST + 11] = '브릭메일'
    expect(mailPaperName(0, items)).toBe('잔디메일')
    expect(mailPaperName(11, items)).toBe('브릭메일')
    expect(mailPaperName(0, [])).toBe('')
  })

  it('바닥은 롬 말(단어)과 조작 쪽지 말(화살표 키)을 쓴다', () => {
    expect(mailFoot(true)).toBe('화살표 키 자리 · Z 단어 · 마지막 칸에서 Z 결정 · X 그만둔다')
    expect(mailFoot(false)).toBe('X 닫기')
  })

  it('제목은 메일이다', () => {
    const text = source('MailScreen.tsx')
    expect(text).toContain(`title={writing ? '메일' : held?.trainerName ?? '메일'}`)
    expect(text).not.toMatch(/'편지지 |'편지'/)
  })
})

withData('names/items.ko.json')('롬 도구 이름표', () => {
  it('메일 열두 장의 이름이 다 「…메일」이다', () => {
    const items = JSON.parse(readFileSync(
      resolve(__dirname, '../../../public/data/names/items.ko.json'), 'utf8',
    )) as string[]
    for (let type = 0; type < 12; type++) expect(mailPaperName(type, items)).toMatch(/메일$/)
    expect(mailPaperName(0, items)).toBe('잔디메일')
  })
})

describe('이름 짓기 안내', () => {
  it('Enter와 Esc를 말한다 — 글자를 치는 자리라 Z·X가 아니다', () => {
    expect(NAME_HINT).toBe('Enter 결정 · Esc 그대로 두기')
    expect(source('NameScreen.tsx')).toContain('{NAME_HINT}')
  })
})

describe('바닥 안내 표기', () => {
  it('닫기는 명사형이다', () => {
    for (const file of ['BerryTagScreen.tsx', 'DiplomaScreen.tsx', 'MailScreen.tsx']) {
      expect(source(file)).not.toContain('닫는다')
    }
    expect(source('BerryTagScreen.tsx')).toContain('Z · X 닫기')
    expect(source('DiplomaScreen.tsx')).toContain('Z · X 닫기')
  })

  it('쪽 넘기기는 Q/E, 화살표는 붙여 쓴다', () => {
    for (const file of ['EasyChatScreen.tsx', 'EasyChatAskScreen.tsx']) {
      const text = source(file)
      expect(text).not.toContain('Q E')
      expect(text).toContain('↑↓ 단어 · Q/E 한 쪽씩')
      expect(text).not.toMatch(/'[^'\n]*낱말[^'\n]*'/)
    }
    expect(source('JournalScreen.tsx')).toContain('←→ 쪽 넘기기')
    expect(source('JournalScreen.tsx')).not.toContain('← →')
  })
})
