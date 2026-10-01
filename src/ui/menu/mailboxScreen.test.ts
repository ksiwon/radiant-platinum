// 메일박스의 갈래 메뉴와 지니게 하기 (`MailboxScreen.tsx`)
//
// Z가 묻지도 않고 첫 빈손 마리에게 메일을 주었고, 등록 키 한 번에 확인 없이 내용이
// 지워졌다. 원작은 롬 `mailbox` 뱅크의 갈래 넷을 띄우고 지우기를 두 번 묻는다
// (`unk_020722AC.c`).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAILBOX_TEXT, UI_BANK } from '../../data/uiText'
import { withData } from '../../data/romData.testkit'

const { MAILBOX_ACTIONS, mailGiveVerdict, mailboxFoot } = await import('./MailboxScreen')

describe('지니게 할 마리 (`PartyMenu_GiveMail`)', () => {
  it('알은 못 고르고, 무엇을 든 마리는 물러난다', () => {
    expect(mailGiveVerdict({ isEgg: true, heldItem: 0 })).toBe('egg')
    expect(mailGiveVerdict({ isEgg: false, heldItem: 17 })).toBe('held')
    expect(mailGiveVerdict({ isEgg: false, heldItem: 0 })).toBe('ok')
  })
})

describe('바닥 안내', () => {
  it('지우기를 키 하나로 걸지 않는다 — 등록 키를 안 적는다', () => {
    for (const open of [null, 'menu', 'read', 'eraseAsk', 'erasedGive', 'pick'] as const) {
      expect(mailboxFoot(open)).not.toMatch(/\b[YF]\b/)
      expect(mailboxFoot(open)).not.toContain('닫는다')
    }
    expect(mailboxFoot(null)).toContain('Z 결정')
  })
})

withData(`dialogue/ko/${String(UI_BANK.mailbox)}.json`)('메일박스 뱅크의 글', () => {
  const bank = (): string[] => JSON.parse(readFileSync(
    resolve(__dirname, `../../../public/data/dialogue/ko/${String(UI_BANK.mailbox)}.json`), 'utf8',
  )) as string[]

  it('갈래 넷이 원작 차례다', () => {
    const text = bank()
    expect(MAILBOX_ACTIONS.map((a) => text[MAILBOX_TEXT[a]]))
      .toEqual(['메일을 읽는다', '메일을 지운다', '지니게 한다', '그만둔다'])
  })

  it('지우기는 「지워져 버립니다」를 먼저 묻는다', () => {
    const text = bank()
    expect(text[MAILBOX_TEXT.eraseAsk]).toContain('괜찮겠습니까?')
    expect(text[MAILBOX_TEXT.erasedGive]).toContain('지니게 하겠습니까?')
    expect(text[MAILBOX_TEXT.notGiven]).toBe('메일을 지니게 하지 않았습니다')
  })
})
