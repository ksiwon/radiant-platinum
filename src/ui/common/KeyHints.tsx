// 바닥 조작 안내 — 키 글자만 키캡으로 감싼다 (SYSTEM §2.2 `KeyHints`).
//
// ⚠️ **문자열은 그대로 둔다.** 화면이 `'Z 결정 · X 닫기'` 한 줄을 넘기고, 여기서 키 토큰만 `<kbd>`로 감싼다.
// 키캡은 글자 둘레에 여백만 더하므로 `textContent`가 넘긴 문자열과 **한 글자도 안 다르다** —
// 시험(`menuFootText.test` 등)이 문자열을 맞대는 자리가 안 바뀐다. `splitKeys`가 그 보장을 시험한다.
import { Fragment } from 'react'
import * as css from './parts.css'

/**
 * 키 토큰. 화살표 묶음은 긴 것을 먼저 잡는다(`↑↓←→`가 `↑↓` + `←→`로 갈리지 않게).
 * 한 글자 키는 앞뒤가 글자나 숫자가 아닐 때만 키다 — 「EXP」의 E나 「Lv」의 L이 키캡이 되면 안 된다
 */
const KEY = /(?<![\p{L}\p{N}])(↑↓←→|↑↓|←→|↑|↓|←|→|Tab|Shift|Space|Enter|Esc|[ZXCFSQE])(?![\p{L}\p{N}])/gu

export interface KeyPart {
  /** 키캡으로 감쌀 토큰이면 참 */
  key: boolean
  text: string
}

/** 문자열을 키 토큰과 나머지로 가른다. `parts.map(p => p.text).join('')`이 입력과 같다 */
export function splitKeys(text: string): KeyPart[] {
  const parts: KeyPart[] = []
  let last = 0
  for (const match of text.matchAll(KEY)) {
    const at = match.index
    if (at > last) parts.push({ key: false, text: text.slice(last, at) })
    parts.push({ key: true, text: match[0] })
    last = at + match[0].length
  }
  if (last < text.length) parts.push({ key: false, text: text.slice(last) })
  return parts
}

export function KeyHints(
  { text, tone = 'light' }: {
    text: string
    /** `dark`: 3D 무대나 덮개 같은 어두운 판 위. 키캡을 `scrim.deep` 바탕에 `ink.onDark` 글로 그린다 */
    tone?: 'light' | 'dark'
  },
) {
  return (
    <>
      {splitKeys(text).map((part, i) => (
        <Fragment key={i}>
          {part.key
            ? <kbd className={tone === 'dark' ? css.keycapDark : css.keycap}>{part.text}</kbd>
            : part.text}
        </Fragment>
      ))}
    </>
  )
}
