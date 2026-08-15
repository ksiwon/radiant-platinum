// 낱말 번호 → 그 로케일의 글자 (PARITY §4.8)
//
// 낱말 1,495개가 롬 뱅크 열하나에 흩어져 있는데 **넷은 우리가 이미 다른
// 이름으로 싣고 있다** — 종족명·기술명·타입·특성. 나머지 일곱만 뱅크에서
// 그대로 받는다.
//
// ⚠️ **원작은 그 넷을 대문자 뱅크로 읽는다** (`move_names_uppercase` 따위).
// **한국어·일본어 롬에는 그 뱅크가 아예 없다** — 대문자가 없는 글자라 롬이
// 표를 안 들고 있다. 그래서 세 로케일 다 보통 이름표를 쓴다. 로케일마다 다른
// 낱말 목록이 생기는 편이 훨씬 나쁘다.
import { loadLabels, loadMoveNames, loadSpeciesNames, type DataLocale } from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import { wordSlot, EASY_CHAT_WORD_NONE } from '../../engine/world/easyChat'

export type WordLookup = (word: number) => string

const BANK_TEXT = {
  trainerWords: 'trainerWords',
  peopleWords: 'peopleWords',
  greetings: 'greetings',
  lifestyleWords: 'lifestyleWords',
  feelings: 'feelings',
  toughWords: 'toughWords',
  unionWords: 'unionWords',
} as const

/**
 * 낱말을 글자로 바꾸는 함수 하나를 만든다.
 *
 * ⚠️ **한 번에 다 받는다.** 낱말 하나씩 받으면 무리 하나를 그리는 데 이백 번
 * 왕복한다 — 뱅크가 열하나뿐이라 통째로 받는 편이 훨씬 싸다
 */
export async function loadWordLookup(locale: DataLocale): Promise<WordLookup> {
  const empty: string[] = []
  const [species, moves, labels, ...banks] = await Promise.all([
    loadSpeciesNames(locale),
    loadMoveNames(locale),
    loadLabels(locale),
    ...Object.values(BANK_TEXT).map((key) => loadUiText(key, locale).catch(() => empty)),
  ])
  const [trainer, people, greetings, lifestyle, feelings, tough, union] = banks

  return (word: number): string => {
    if (word === EASY_CHAT_WORD_NONE) return ''
    const slot = wordSlot(word)
    if (!slot) return ''
    switch (slot.bank) {
      case 'species': return species[slot.entry] ?? ''
      case 'move': return moves[slot.entry] ?? ''
      case 'type': return labels.types[slot.entry] ?? ''
      case 'ability': return labels.abilities[slot.entry] ?? ''
      case 'trainerWords': return trainer?.[slot.entry] ?? ''
      case 'peopleWords': return people?.[slot.entry] ?? ''
      case 'greetings': return greetings?.[slot.entry] ?? ''
      case 'lifestyleWords': return lifestyle?.[slot.entry] ?? ''
      case 'feelings': return feelings?.[slot.entry] ?? ''
      case 'toughWords': return tough?.[slot.entry] ?? ''
      case 'unionWords': return union?.[slot.entry] ?? ''
      default: return ''
    }
  }
}
