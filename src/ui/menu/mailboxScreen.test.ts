// 메일박스의 갈래 메뉴와 지니게 하기 (`MailboxScreen.tsx`)
//
// Z가 묻지도 않고 첫 빈손 마리에게 메일을 주었고, 등록 키 한 번에 확인 없이 내용이
// 지워졌다. 원작은 롬 `mailbox` 뱅크의 갈래 넷을 띄우고 지우기를 두 번 묻는다
// (`unk_020722AC.c`). 「메일을 읽는다」는 메일박스 안에 줄 셋을 펴기만 했는데 원작은 메일 앱의 읽기 화면을
// 연다 — 그 화면이 파티 자리만 받아서 메일박스 칸을 못 열었다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { MAILBOX_TEXT, UI_BANK } from '../../data/uiText'
import { withData } from '../../data/romData.testkit'
import { MAIL_ITEM_FIRST, newMail, type Mail } from '../../engine/world/mail'
import { useMenuStore } from '../../state/menuStore'

const { MAILBOX_ACTIONS, mailGiveVerdict, mailboxFoot } = await import('./MailboxScreen')
const { readingMail } = await import('./MailScreen')
const { MailSheet, mailSheetIcons, slotText } = await import('./MailSheet')
const { POCKET_MAIL } = await import('./BagScreen')

describe('지니게 할 마리 (`PartyMenu_GiveMail`)', () => {
  it('알은 못 고르고, 무엇을 든 마리는 물러난다', () => {
    expect(mailGiveVerdict({ isEgg: true, heldItem: 0 })).toBe('egg')
    expect(mailGiveVerdict({ isEgg: false, heldItem: 17 })).toBe('held')
    expect(mailGiveVerdict({ isEgg: false, heldItem: 0 })).toBe('ok')
  })
})

describe('바닥 안내', () => {
  it('지우기를 키 하나로 걸지 않는다 — 등록 키를 안 적는다', () => {
    for (const open of [null, 'menu', 'eraseAsk', 'erasedGive', 'pick'] as const) {
      expect(mailboxFoot(open)).not.toMatch(/\b[YF]\b/)
      expect(mailboxFoot(open)).not.toContain('닫는다')
    }
    expect(mailboxFoot(null)).toContain('Z 결정')
  })
})

describe('읽기 화면이 여는 편지 (`FieldSystem_LaunchMailApp_Read`)', () => {
  const from = (name: string): Mail => ({ ...newMail(), trainerName: name })

  it('파티 자리면 그 마리가 지닌 것, 메일박스 칸이면 그 칸이다', () => {
    const party = [{ mail: null }, { mail: from('빛나') }]
    const box = [from('난천'), newMail(), from('홍엽')]
    expect(readingMail({ from: 'party', slot: 1 }, party, box)?.trainerName).toBe('빛나')
    expect(readingMail({ from: 'mailbox', slot: 2 }, party, box)?.trainerName).toBe('홍엽')
    expect(readingMail({ from: 'party', slot: 0 }, party, box)).toBeNull()
    expect(readingMail({ from: 'mailbox', slot: 9 }, party, box)).toBeNull()
  })
})

describe('메일 화면과 메일박스 사이 (`menuStore`)', () => {
  afterEach(() => { useMenuStore.getState().closeAll(); useMenuStore.getState().setMailboxNotice(null) })

  it('메일박스에서 읽으면 메일 화면이 그 위에 쌓이고 물러나면 메일박스다', () => {
    const store = useMenuStore.getState()
    store.open('mailbox')
    store.openMail({ mode: 'read', from: 'mailbox', slot: 3 })
    expect(useMenuStore.getState().stack).toEqual(['mailbox', 'mail'])
    useMenuStore.getState().back()
    expect(useMenuStore.getState().top).toBe('mailbox')
  })

  it('돌아와 띄울 말을 맡기고 비운다', () => {
    useMenuStore.getState().setMailboxNotice({ kind: 'given', slot: 0, item: 137 })
    expect(useMenuStore.getState().mailboxNotice).toEqual({ kind: 'given', slot: 0, item: 137 })
    useMenuStore.getState().setMailboxNotice(null)
    expect(useMenuStore.getState().mailboxNotice).toBeNull()
  })
})

withData('items.json')('편지지가 드나드는 주머니', () => {
  it('편지지는 도구 주머니가 아니라 메일 주머니다 — 지우고 넣는 것도 빼는 것도 그 주머니다', () => {
    const items = (JSON.parse(readFileSync(resolve(__dirname, '../../../public/data/items.json'), 'utf8')) as
      { items: { pocket?: number }[] }).items
    expect(items[MAIL_ITEM_FIRST]?.pocket).toBe(POCKET_MAIL)
    expect(POCKET_MAIL).not.toBe(0)
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

describe('편지지 (`MailSheet`)', () => {
  const words = (w: number): string => `낱말${String(w)}`

  it('칸 글은 낱말 번호를 글자로 바꾸고 비면 빈 글이다', () => {
    const lines = [[3, 0xffff], [], [7, 8]]
    expect(slotText(lines, 0, 0, words)).toBe('낱말3')
    expect(slotText(lines, 0, 1, words)).toBe('')
    expect(slotText(lines, 1, 0, words)).toBe('')
    expect(slotText(lines, 2, 1, words)).toBe('낱말8')
    expect(slotText(lines, 0, 0, null)).toBe('')
  })

  it('새겨질 아이콘은 고른 자리부터 최대 셋이다 — 0부터 세지 않는다', () => {
    const party = Array.from({ length: 6 }, (_, i) => ({ species: i + 1, form: 0, isEgg: false, nickname: 'x' }))
    expect(mailSheetIcons(party, 0).map((m) => m.species)).toEqual([1, 2, 3])
    expect(mailSheetIcons(party, 4).map((m) => m.species)).toEqual([5, 6])
    expect(mailSheetIcons(party, 5)[0]).toEqual({ species: 6, form: 0, isEgg: false })
  })

  it('그림이 없어도 낱말 여섯 칸과 서명이 선다 · 빈 칸은 「…」', () => {
    const out = renderToStaticMarkup(createElement(MailSheet, {
      lines: [[3, 4], [5, 0xffff], []], lookup: words, type: 2, signer: '빛나', at: 3,
    }))
    const text = out.replace(/<[^>]+>/g, '|')
    expect(text).toContain('낱말3')
    expect(text).toContain('낱말5')
    expect(text.match(/…/g)).toHaveLength(3)
    expect(text).toContain('빛나')
  })
})

describe('낱말 위치 글 (`positionText`)', () => {
  it('세 언어로 쓴다 — 한국어 문장이 en · ja에 새지 않는다', async () => {
    const { positionText } = await import('./EasyChatFrame')
    expect(positionText(47, 17, 'ko')).toBe('47개 중 17번째')
    expect(positionText(47, 17, 'en')).toBe('17 of 47')
    expect(positionText(47, 17, 'ja')).toBe('47件中 17番目')
  })
})
