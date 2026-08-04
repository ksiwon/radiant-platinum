// 한국어 조사 선택.
//
// "찌르꼬이(가) 나타났다"처럼 병기형을 그대로 쓰면 읽기가 걸린다. 원작은
// 받침 유무로 골라 쓴다. 한글 음절은 U+AC00부터 (초성×21×28 + 중성×28 + 종성)
// 으로 배열되므로 (코드 - 0xAC00) % 28이 0이면 받침이 없다.
//
// 포켓몬 이름은 한글이 아닐 수 있다(로케일 전환, 미디코드 같은 특수 문자).
// 그럴 땐 병기형으로 돌아간다 — 틀린 조사보다 낫다.

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
/** 종성 개수. 이걸로 나눈 나머지가 0이면 받침이 없다 */
const FINAL_COUNT = 28

/** 받침이 있으면 true. 한글 음절이 아니면 null */
export function hasFinalConsonant(word: string): boolean | null {
  if (!word) return null
  const code = word.charCodeAt(word.length - 1)
  if (code < HANGUL_START || code > HANGUL_END) return null
  return (code - HANGUL_START) % FINAL_COUNT !== 0
}

function particle(word: string, withFinal: string, withoutFinal: string): string {
  const final = hasFinalConsonant(word)
  if (final === null) return `${withFinal}(${withoutFinal})`
  return final ? withFinal : withoutFinal
}

/** 주격 — 찌르꼬**가** / 비버니**가** / 팬텀**이** */
export const subject = (word: string) => particle(word, '이', '가')
/** 목적격 — 몸통박치기**를** / 저주**를** / 흡수**를** */
export const object = (word: string) => particle(word, '을', '를')
/** 보조사 — 모부기**는** / 팬텀**은** */
export const topic = (word: string) => particle(word, '은', '는')

/** 단어 + 조사를 붙여 돌려준다 */
export function withSubject(word: string) { return word + subject(word) }
export function withObject(word: string) { return word + object(word) }
export function withTopic(word: string) { return word + topic(word) }
