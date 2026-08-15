import { describe, expect, it } from 'vitest'
import {
  EASY_CHAT_BANKS, EASY_CHAT_GROUPS, EASY_CHAT_TOUGH_WORD_COUNT, EASY_CHAT_WORD_COUNT,
  EASY_CHAT_WORD_NONE, allToughWordsUnlocked, groupWords, newEasyChatUnlocks,
  openGroups, unlockGreeting, unlockToughWord, wordId, wordSlot,
} from './easyChat'
import { EASY_CHAT_LAST_LANGUAGE_GREETING } from './easyChatTable'

const ctx = (over: Partial<Parameters<typeof groupWords>[1]> = {}) => ({
  seen: () => false,
  completed: false,
  unlocks: newEasyChatUnlocks(),
  ...over,
})

describe('낱말 번호', () => {
  it('뱅크 열하나를 이어 붙인 통번호다', () => {
    expect(EASY_CHAT_BANKS).toHaveLength(11)
    let base = 0
    for (const bank of EASY_CHAT_BANKS) {
      expect(bank.base).toBe(base)
      base += bank.count
    }
    expect(base).toBe(EASY_CHAT_WORD_COUNT)
  })

  it('종족 낱말은 종족 번호와 같다 — 첫 뱅크라 오프셋이 0이다', () => {
    expect(wordSlot(25)).toEqual({ bank: 'species', entry: 25 })
    expect(wordId('species', 25)).toBe(25)
  })

  it('⚠️ 범위 밖은 자르지 않고 null이다 — 자르면 다른 낱말로 조용히 바뀐다', () => {
    expect(wordSlot(EASY_CHAT_WORD_COUNT)).toBeNull()
    expect(wordSlot(EASY_CHAT_WORD_NONE)).toBeNull()
    expect(wordSlot(-1)).toBeNull()
    expect(wordId('toughWords', EASY_CHAT_TOUGH_WORD_COUNT)).toBe(EASY_CHAT_WORD_NONE)
  })

  it('뱅크와 자리를 오가면 제자리로 돌아온다', () => {
    for (const bank of EASY_CHAT_BANKS) {
      const id = wordId(bank.key, bank.count - 1)
      expect(wordSlot(id)).toEqual({ bank: bank.key, entry: bank.count - 1 })
    }
  })
})

describe('무리를 여는 조건', () => {
  it('무리가 열둘이고 포켓몬 둘의 합이 493이다', () => {
    expect(EASY_CHAT_GROUPS).toHaveLength(12)
    const mons = EASY_CHAT_GROUPS.filter((g) => g.gate === 'seen')
    expect(mons.reduce((n, g) => n + g.words.length, 0)).toBe(493)
  })

  it('⚠️ 포켓몬은 본 것만 뜬다', () => {
    const group = EASY_CHAT_GROUPS.find((g) => g.gate === 'seen')!
    expect(groupWords(group, ctx())).toHaveLength(0)
    const one = group.words[0]!
    expect(groupWords(group, ctx({ seen: (s) => s === one }))).toEqual([one])
  })

  it('⚠️ 기술은 전당에 오르기 전에는 하나도 안 열린다 — 절반쯤 여는 갈래가 없다', () => {
    const group = EASY_CHAT_GROUPS.find((g) => g.gate === 'completed')!
    expect(groupWords(group, ctx())).toHaveLength(0)
    expect(groupWords(group, ctx({ completed: true }))).toHaveLength(group.words.length)
  })

  it('⚠️ 인사는 앞쪽 몇 개만 잠긴다 — 무리를 통째로 잠그면 「…」조차 못 고른다', () => {
    const group = EASY_CHAT_GROUPS.find((g) => g.gate === 'greeting')!
    const open = groupWords(group, ctx())
    expect(open.length).toBeGreaterThan(0)
    expect(open.length).toBeLessThan(group.words.length)
    expect(open.every((w) => w > EASY_CHAT_LAST_LANGUAGE_GREETING)).toBe(true)
  })

  it('푼 인사 하나가 늘어난다', () => {
    const group = EASY_CHAT_GROUPS.find((g) => g.gate === 'greeting')!
    const before = groupWords(group, ctx()).length
    const base = EASY_CHAT_BANKS.find((b) => b.key === 'greetings')!.base
    const locked = group.words.find((w) => w <= EASY_CHAT_LAST_LANGUAGE_GREETING)!
    const unlocks = unlockGreeting(newEasyChatUnlocks(), locked - base)
    expect(groupWords(group, ctx({ unlocks }))).toHaveLength(before + 1)
  })

  it('나머지 무리는 늘 다 열려 있다', () => {
    for (const group of EASY_CHAT_GROUPS.filter((g) => g.gate === 'always')) {
      expect(groupWords(group, ctx())).toHaveLength(group.words.length)
    }
  })

  it('빈 무리는 목록에 안 뜬다', () => {
    const shown = openGroups(ctx())
    expect(shown.every((g) => g.words.length > 0)).toBe(true)
    expect(shown.some((g) => g.group.gate === 'completed')).toBe(false)
    expect(openGroups(ctx({ completed: true })).some((g) => g.group.gate === 'completed')).toBe(true)
  })
})

describe('어려운 낱말', () => {
  it('⚠️ 아직 안 풀린 것 중에서 고른다 — 다시 뽑으면 아무것도 안 는다', () => {
    let unlocks = newEasyChatUnlocks()
    const seen = new Set<number>()
    for (let i = 0; i < EASY_CHAT_TOUGH_WORD_COUNT; i++) {
      // 늘 첫 칸을 고르게 해도 서로 다른 낱말이 나와야 한다
      const got = unlockToughWord(unlocks, () => 0)
      expect(got).not.toBeNull()
      expect(seen.has(got!.entry)).toBe(false)
      seen.add(got!.entry)
      unlocks = got!.unlocks
    }
    expect(seen.size).toBe(EASY_CHAT_TOUGH_WORD_COUNT)
    expect(allToughWordsUnlocked(unlocks)).toBe(true)
    // 다 풀렸으면 null이다 — 0이 아니라 「더 없다」여야 그 사람이 닫는다
    expect(unlockToughWord(unlocks, () => 0)).toBeNull()
  })

  it('풀린 것만 무리에 뜬다', () => {
    const group = EASY_CHAT_GROUPS.find((g) => g.gate === 'tough')!
    expect(groupWords(group, ctx())).toHaveLength(0)
    const got = unlockToughWord(newEasyChatUnlocks(), () => 3)!
    expect(groupWords(group, ctx({ unlocks: got.unlocks }))).toHaveLength(1)
  })

  it('하나만 풀려도 「다 풀렸다」가 아니다', () => {
    const got = unlockToughWord(newEasyChatUnlocks(), () => 0)!
    expect(allToughWordsUnlocked(got.unlocks)).toBe(false)
  })
})
