// 낱말 고르기 (PARITY §4.8) — `applications/easy_chat/`
//
// 키보드가 없던 시절의 입력이다. 미리 정해진 낱말 1,495개 중에서 골라 문장을
// 만든다. 우편의 세 줄이 이것으로 채워지고, 원작에서는 통신 인사말·방송·랭킹도
// 같은 화면을 쓴다 (그쪽은 §9라 안 만든다).
//
// 낱말 **글자**는 롬 뱅크 열하나에 있고 (`data/dialogue/<로케일>/*.json`),
// **어느 낱말이 어느 무리에 드는가**는 코드 안의 표라 굽는다
// (`easyChatTable.ts` · `pnpm gen:easychat`).
//
// ⚠️ **낱말 번호는 뱅크 열하나를 이어 붙인 통번호다.** 종족 낱말은 종족 번호와
// 같고 기술 낱말은 496 + 기술 번호다 — 뱅크 하나의 크기가 어긋나면 그 뒤가
// 통째로 밀린다 (`EasyChatWord_FromBankAndEntry`).
//
// ⚠️ **무리마다 여는 조건이 다르다.** 포켓몬은 도감에서 본 것만, 기술은
// **명예의 전당에 오른 뒤**에야 열린다 — 안 열린 무리는 화면에서 빈칸이 아니라
// 아예 안 보여야 한다 (`EasyChatWordList_InitGroups`가 개수를 0으로 만든다).
import {
  EASY_CHAT_BANKS, EASY_CHAT_GROUPS, EASY_CHAT_LAST_LANGUAGE_GREETING,
  EASY_CHAT_TOUGH_WORD_COUNT, EASY_CHAT_WORD_COUNT, EASY_CHAT_WORD_NONE,
  type EasyChatBankKey, type EasyChatGroup,
} from './easyChatTable'

export {
  EASY_CHAT_BANKS, EASY_CHAT_GROUPS, EASY_CHAT_TOUGH_WORD_COUNT,
  EASY_CHAT_WORD_COUNT, EASY_CHAT_WORD_NONE, type EasyChatGroup,
}

/** 한 문장에 들어가는 낱말 (`MAX_EASY_CHAT_WORDS`는 둘이지만 우편은 문장 셋이다) */
export const MAIL_WORDS_PER_LINE = 2

export interface WordSlot {
  readonly bank: EasyChatBankKey
  /** 그 뱅크 안의 몇 번째 글인가 */
  readonly entry: number
}

/**
 * 통번호 → 어느 뱅크의 몇 번째인가 (`EasyChatWord_GetLoaderIndexAndEntry`).
 *
 * ⚠️ **원작은 아래 12비트만 본다** (`word & 0xFFF`) — 통번호가 1,495까지라
 * 4,096 안에 들어가므로 뜻은 같다. 우리는 자르지 않고 범위를 벗어나면
 * `null`을 준다. 자르면 잘못된 번호가 **다른 낱말**로 조용히 바뀐다
 */
export function wordSlot(word: number): WordSlot | null {
  if (!Number.isInteger(word) || word < 0 || word >= EASY_CHAT_WORD_COUNT) return null
  for (const bank of EASY_CHAT_BANKS) {
    if (word < bank.base + bank.count) return { bank: bank.key, entry: word - bank.base }
  }
  return null
}

/** 뱅크 안의 자리 → 통번호 (`EasyChatWord_FromBankAndEntry`) */
export function wordId(bank: EasyChatBankKey, entry: number): number {
  const at = EASY_CHAT_BANKS.find((b) => b.key === bank)
  if (!at || entry < 0 || entry >= at.count) return EASY_CHAT_WORD_NONE
  return at.base + entry
}

/** 무엇을 열어 뒀는가 (`UnlockedEasyChatWords`) */
export interface EasyChatUnlocks {
  /** 다른 나라 말 인사. 비트 하나가 인사 하나다 */
  greetings: number
  /** 어려운 낱말 서른둘 */
  tough: number
}

export function newEasyChatUnlocks(): EasyChatUnlocks {
  return { greetings: 0, tough: 0 }
}

export interface EasyChatContext {
  /** 도감에서 본 적이 있는가 */
  seen: (species: number) => boolean
  /** 명예의 전당에 올랐는가 */
  completed: boolean
  unlocks: EasyChatUnlocks
}

/**
 * 어려운 낱말 하나를 무작위로 푼다 (`EasyChatWords_TryUnlockRandomToughWord`).
 *
 * ⚠️ **아직 안 풀린 것 중에서 고른다** — 이미 풀린 것을 다시 뽑으면 「새 낱말을
 * 배웠다」는 말만 뜨고 아무것도 안 늘어난다. 다 풀렸으면 `null`이다
 */
export function unlockToughWord(
  unlocks: EasyChatUnlocks, roll: (n: number) => number,
): { unlocks: EasyChatUnlocks, entry: number } | null {
  const left: number[] = []
  for (let i = 0; i < EASY_CHAT_TOUGH_WORD_COUNT; i++) {
    if ((unlocks.tough & (1 << i)) === 0) left.push(i)
  }
  if (left.length === 0) return null
  const entry = left[roll(left.length)] ?? left[0]!
  return { unlocks: { ...unlocks, tough: unlocks.tough | (1 << entry) }, entry }
}

/** 어려운 낱말이 다 풀렸는가 (`EasyChatWords_AreAllToughWordsUnlocked`) */
export function allToughWordsUnlocked(unlocks: EasyChatUnlocks): boolean {
  const full = EASY_CHAT_TOUGH_WORD_COUNT >= 32 ? -1 >>> 0 : (1 << EASY_CHAT_TOUGH_WORD_COUNT) - 1
  return (unlocks.tough >>> 0) === (full >>> 0)
}

/** 다른 나라 말 인사 하나를 푼다 (`EasyChatWords_UnlockGreeting`) */
export function unlockGreeting(unlocks: EasyChatUnlocks, entry: number): EasyChatUnlocks {
  if (entry < 0 || entry >= 32) return unlocks
  return { ...unlocks, greetings: unlocks.greetings | (1 << entry) }
}

/**
 * 지금 고를 수 있는 낱말 (`EasyChatWordList_Process*`).
 *
 * ⚠️ **차례를 안 바꾼다.** 원작 표 차례 그대로 돌려주고 화면이 그 로케일
 * 이름으로 다시 정렬한다 — 표는 영어 알파벳 차례라 한국어 화면에서는 뜻이 없다
 */
export function groupWords(group: EasyChatGroup, ctx: EasyChatContext): number[] {
  switch (group.gate) {
    case 'seen':
      return group.words.filter((w) => ctx.seen(w))
    case 'completed':
      // ⚠️ **전당에 오르기 전에는 하나도 안 열린다** — 절반쯤 여는 갈래가 없다
      return ctx.completed ? [...group.words] : []
    case 'tough': {
      const base = EASY_CHAT_BANKS.find((b) => b.key === 'toughWords')?.base ?? 0
      return group.words.filter((w) => (ctx.unlocks.tough & (1 << (w - base))) !== 0)
    }
    case 'greeting': {
      const base = EASY_CHAT_BANKS.find((b) => b.key === 'greetings')?.base ?? 0
      // ⚠️ **잠긴 것은 앞쪽 몇 개뿐이다.** 무리를 통째로 잠그면 「…」조차 못 고른다
      return group.words.filter((w) => (
        w > EASY_CHAT_LAST_LANGUAGE_GREETING
        || (ctx.unlocks.greetings & (1 << (w - base))) !== 0
      ))
    }
    default:
      return [...group.words]
  }
}

/** 낱말이 하나라도 있는 무리만. 빈 무리는 화면에 아예 안 뜬다 */
export function openGroups(ctx: EasyChatContext): { group: EasyChatGroup, index: number, words: number[] }[] {
  return EASY_CHAT_GROUPS
    .map((group, index) => ({ group, index, words: groupWords(group, ctx) }))
    .filter((g) => g.words.length > 0)
}
