// 키를 **사람이 읽는 이름**으로.
//
// ⚠️ **이름을 손으로 적는 자리를 하나로 둔다.** 오프닝의 조작 설명
// (`engine/intro/controlText`)과 화면 구석의 조작 쪽지(`ui/hud/ControlHint`)가
// 같은 키를 말하는데, 자리가 둘이면 한쪽만 고쳐진다.
//
// `event.code`는 `KeyZ`·`ShiftLeft`처럼 자판을 가리키는 이름이라 그대로 보여
// 주면 못 읽는다. 그 대응표와, 같은 일을 하는 키 여럿을 한 줄로 적는 규칙이
// 여기 있다.
import { BINDINGS } from './keys'

export type KeyLocale = 'ko' | 'en' | 'ja'

/**
 * 화면에 적을 키 이름.
 *
 * `event.code`는 `KeyZ`·`ShiftLeft`처럼 자판을 가리키는 이름이라 그대로 보여
 * 주면 못 읽는다. 왼쪽·오른쪽 Shift처럼 **같은 글자로 적히는 것**은 아래
 * `keyList`가 하나로 줄인다
 */
const LABEL: Readonly<Record<string, string>> = {
  KeyA: 'A', KeyD: 'D', KeyE: 'E', KeyQ: 'Q', KeyR: 'R', KeyS: 'S',
  KeyV: 'V', KeyW: 'W', KeyX: 'X', KeyY: 'Y', KeyZ: 'Z',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'Shift', ShiftRight: 'Shift',
  Space: 'Space', Enter: 'Enter', Backspace: 'Backspace', Escape: 'Esc',
}

/** 그 키를 사람이 읽는 이름으로. 모르는 자판이면 `event.code` 그대로다 */
export function keyLabel(code: string): string {
  return LABEL[code] ?? code
}

/** 「또는」 — 같은 일을 하는 키가 여럿일 때 사이에 넣는다 */
const OR: Readonly<Record<KeyLocale, string>> = {
  ko: ' 또는 ', en: ' or ', ja: ' または ',
}

/** 화살표 넷을 하나로 부르는 말 */
const ARROWS: Readonly<Record<KeyLocale, string>> = {
  ko: '화살표 키', en: 'the arrow keys', ja: '矢印キー',
}

/** 같은 일을 하는 키들을 「A 또는 B」로. 같은 이름은 한 번만 적는다 */
export function keyList(codes: readonly string[], locale: KeyLocale): string {
  const seen: string[] = []
  for (const code of codes) {
    const label = keyLabel(code)
    if (!seen.includes(label)) seen.push(label)
  }
  return seen.join(OR[locale])
}

/**
 * 걷는 키. 글자 자판은 나란히 적고 화살표 넷은 한 마디로 줄인다.
 *
 * ⚠️ 「W 또는 ↑ 또는 A 또는 ←…」로 늘어놓으면 여덟 개짜리 목록이 된다 —
 * 읽히는 쪽이 이긴다
 */
export function moveKeys(locale: KeyLocale): string {
  const codes = [...BINDINGS.up, ...BINDINGS.left, ...BINDINGS.down, ...BINDINGS.right]
  const letters = codes.filter((c) => c.startsWith('Key')).map(keyLabel)
  const parts: string[] = []
  if (letters.length > 0) parts.push(letters.join(' '))
  if (codes.some((c) => c.startsWith('Arrow'))) parts.push(ARROWS[locale])
  return parts.join(OR[locale])
}

