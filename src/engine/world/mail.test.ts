import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  MAIL_ICONS, MAIL_ITEM_CONSTANTS, MAIL_ITEM_FIRST, MAIL_LINES, MAIL_TYPE_COUNT,
  MAIL_TYPE_NONE, MAILBOX_SIZE, clearMailAt, emptyMailSlot, fromMailbox, hasMail,
  mailHasWords, mailItemOfType, mailTypeOfConstant, mailTypeOfItem, mailboxCount,
  newMail, newMailbox, toMailbox, writeMail,
} from './mail'
import { EASY_CHAT_WORD_NONE } from './easyChatTable'

const writer = {
  trainerId: 1234, trainerName: '시원', trainerGender: 0,
  party: Array.from({ length: 6 }, (_, i) => ({ species: 100 + i, form: 0, isEgg: false })),
}

describe('편지지', () => {
  it('열두 장이고 137번부터다', () => {
    expect(MAIL_ITEM_CONSTANTS).toHaveLength(MAIL_TYPE_COUNT)
    expect(mailTypeOfItem(MAIL_ITEM_FIRST)).toBe(0)
    expect(mailTypeOfItem(MAIL_ITEM_FIRST + MAIL_TYPE_COUNT - 1)).toBe(MAIL_TYPE_COUNT - 1)
    expect(mailTypeOfItem(MAIL_ITEM_FIRST - 1)).toBeNull()
    expect(mailTypeOfItem(MAIL_ITEM_FIRST + MAIL_TYPE_COUNT)).toBeNull()
    expect(mailItemOfType(0)).toBe(MAIL_ITEM_FIRST)
  })

  it('⚠️ 이름표와 번호가 도구표에서 같은 것을 가리킨다 — 한 칸만 밀려도 엉뚱한 편지지다', () => {
    const path = resolve(__dirname, '../../../public/data/items.json')
    let file: { items: { constant: string }[] }
    try {
      file = JSON.parse(readFileSync(path, 'utf8')) as { items: { constant: string }[] }
    } catch {
      return // 도구표가 아직 안 붙은 기계에서는 건너뛴다
    }
    for (const [type, constant] of MAIL_ITEM_CONSTANTS.entries()) {
      expect(file.items[mailItemOfType(type)]?.constant).toBe(constant)
      expect(mailTypeOfConstant(constant)).toBe(type)
    }
    expect(mailTypeOfConstant('ITEM_POTION')).toBeNull()
  })
})

describe('편지 한 장', () => {
  it('빈 편지는 편지가 아니다', () => {
    const mail = newMail()
    expect(mail.type).toBe(MAIL_TYPE_NONE)
    expect(hasMail(mail)).toBe(false)
    expect(hasMail(null)).toBe(false)
    expect(mail.lines).toHaveLength(MAIL_LINES)
    expect(mail.lines.every((l) => l.every((w) => w === EASY_CHAT_WORD_NONE))).toBe(true)
  })

  it('⚠️ 글이 비어도 편지지 번호가 있으면 편지다 — 원작이 번호만 본다', () => {
    const mail = writeMail(3, writer, [])
    expect(hasMail(mail)).toBe(true)
    expect(mailHasWords(mail)).toBe(false)
  })

  it('⚠️ 아이콘은 고른 자리부터 파티 끝까지 셋이다 — 0부터 세면 늘 선두다', () => {
    const from2 = writeMail(0, { ...writer, party: writer.party.slice(2) }, [])
    expect(from2.icons.map((i) => i.species)).toEqual([102, 103, 104])
    const from5 = writeMail(0, { ...writer, party: writer.party.slice(5) }, [])
    expect(from5.icons).toHaveLength(1)
    expect(from5.icons.length).toBeLessThanOrEqual(MAIL_ICONS)
  })

  it('쓴 사람이 새겨진다', () => {
    const mail = writeMail(1, writer, [[7, 8]])
    expect(mail.trainerId).toBe(1234)
    expect(mail.trainerName).toBe('시원')
    expect(mail.lines[0]).toEqual([7, 8])
    // 안 채운 줄은 빈 낱말로 메운다 — 길이가 늘 셋이라야 스키마가 통과한다
    expect(mail.lines[1]).toEqual([EASY_CHAT_WORD_NONE, EASY_CHAT_WORD_NONE])
    expect(mailHasWords(mail)).toBe(true)
  })
})

describe('우편함 스무 칸', () => {
  it('빈 우편함', () => {
    const box = newMailbox()
    expect(box).toHaveLength(MAILBOX_SIZE)
    expect(mailboxCount(box)).toBe(0)
    expect(emptyMailSlot(box)).toBe(0)
  })

  it('넣고 꺼낸다', () => {
    const mail = writeMail(2, writer, [[5, EASY_CHAT_WORD_NONE]])
    const put = toMailbox(newMailbox(), mail)
    expect(put?.slot).toBe(0)
    expect(mailboxCount(put!.box)).toBe(1)
    const got = fromMailbox(put!.box, 0)
    expect(got?.mail.type).toBe(2)
    expect(mailboxCount(got!.box)).toBe(0)
    expect(fromMailbox(newMailbox(), 0)).toBeNull()
  })

  it('⚠️ 꽉 차면 안 넣는다 — 넣는 척하고 잃어버리지 않는다', () => {
    const full = newMailbox().map(() => writeMail(0, writer, []))
    expect(emptyMailSlot(full)).toBe(-1)
    expect(toMailbox(full, writeMail(1, writer, []))).toBeNull()
    expect(mailboxCount(full)).toBe(MAILBOX_SIZE)
  })

  it('⚠️ 내용을 지우면 편지지 도구로 되돌아온다', () => {
    const box = toMailbox(newMailbox(), writeMail(4, writer, [[1, 2]]))!.box
    const cleared = clearMailAt(box, 0)
    expect(cleared?.item).toBe(mailItemOfType(4))
    expect(mailboxCount(cleared!.box)).toBe(0)
    expect(clearMailAt(newMailbox(), 0)).toBeNull()
  })

  it('빈 칸을 앞에서부터 찾는다', () => {
    const box = newMailbox()
    box[0] = writeMail(0, writer, [])
    box[1] = writeMail(0, writer, [])
    expect(emptyMailSlot(box)).toBe(2)
  })
})
