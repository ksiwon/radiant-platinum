// 오프닝의 조작 설명 — **우리 키다** (PARITY §1.18 · COPYRIGHT §11)
//
// 원작 `rowan_intro` 2~5번은 **DS 하드웨어 이야기**다. 십자키와 A·B·X·Y,
// 그리고 「아래 화면은 터치스크린이라 부릅니다」. 우리에게는 십자키도 아래
// 화면도 없으니 그대로 읽어 주면 **거짓말**이다 — 그 자리에 실제로 묶여 있는
// 키를 말한다.
//
// ⚠️ **키 이름을 손으로 적지 않는다.** `engine/input/keys`의 `BINDINGS`에서
// 뽑아 문장에 끼운다. 그래야 키를 바꾼 날 설명이 같이 바뀐다 —
// `controlText.test`가 둘이 어긋나면 선다.
//
// ⚠️ **여기와 `welcomeText`·`world/siwonText` 말고는 글을 짓지 않는다.**
// CODEMAP §2.6의 「한 글자도 짓지 않는다」는 그대로 산다. 그 규칙이 막으려는
// 것은 **원작인 척하는 문장**이고, 이 글은 원작에 없던 우리 키를 말한다.
//
// 글 모양은 원작 대사창 규칙 그대로다 — `\n`이 줄 바꿈, `\r`이 「눌러서 창을
// 비우고 다음 쪽」이다. 마박사의 말투(~하게/~일세 · ~じゃ)를 따른다.
import { BINDINGS } from '../input/keys'

type IntroLocale = 'ko' | 'en' | 'ja'

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
const OR: Readonly<Record<IntroLocale, string>> = {
  ko: ' 또는 ', en: ' or ', ja: ' または ',
}

/** 화살표 넷을 하나로 부르는 말 */
const ARROWS: Readonly<Record<IntroLocale, string>> = {
  ko: '화살표 키', en: 'the arrow keys', ja: '矢印キー',
}

/** 같은 일을 하는 키들을 「A 또는 B」로. 같은 이름은 한 번만 적는다 */
export function keyList(codes: readonly string[], locale: IntroLocale): string {
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
export function moveKeys(locale: IntroLocale): string {
  const codes = [...BINDINGS.up, ...BINDINGS.left, ...BINDINGS.down, ...BINDINGS.right]
  const letters = codes.filter((c) => c.startsWith('Key')).map(keyLabel)
  const parts: string[] = []
  if (letters.length > 0) parts.push(letters.join(' '))
  if (codes.some((c) => c.startsWith('Arrow'))) parts.push(ARROWS[locale])
  return parts.join(OR[locale])
}

/** 문장에 끼울 키 이름들 */
function keys(locale: IntroLocale) {
  const list = (codes: readonly string[]): string => keyList(codes, locale)
  return {
    move: moveKeys(locale),
    run: list(BINDINGS.run),
    confirm: list(BINDINGS.interact),
    cancel: list(BINDINGS.cancel),
    menu: list(BINDINGS.menu),
    register: list(BINDINGS.register),
    poketch: list(BINDINGS.poketch),
    poketchStep: list([...BINDINGS.poketchPrev, ...BINDINGS.poketchNext]),
    view: list(BINDINGS.view),
  }
}

/**
 * 마박사가 조작을 설명하는 쪽들.
 *
 * 원작은 두 쪽이다 — 앞쪽이 「움직이기·결정·취소」, 뒤쪽이 「메뉴·등록한 도구」.
 * 그 나눔을 그대로 따르고 우리에게만 있는 것(포켓치를 펼치는 키·시점)을
 * 뒤쪽 끝에 붙인다
 */
export function controlPages(locale: string): readonly string[] {
  const at: IntroLocale = locale === 'en' ? 'en' : locale === 'ja' ? 'ja' : 'ko'
  const k = keys(at)
  if (at === 'en') {
    return [
      'To move about, use\n' + `${k.move}.\r`
      + `Hold ${k.run} and you will run.\r`
      + 'To decide, to examine, to carry a\n'
      + `conversation onward — that is ${k.confirm}.\r`
      + `To step back or give up, press ${k.cancel}.`,
      `The menu opens with ${k.menu}.\r`
      + 'An item you registered in your Bag\n'
      + `can be used on the spot with ${k.register}.\r`
      + `Your Pokétch opens with ${k.poketch},\n`
      + `and ${k.poketchStep} turn its apps.\r`
      + `Press ${k.view} and you will see this\n`
      + 'world at your own eye height.',
    ]
  }
  if (at === 'ja') {
    return [
      'まえ うしろ ひだり みぎへ うごくには\n' + `${k.move}じゃ。\r`
      + `${k.run}を おしたままなら はしれる。\r`
      + 'きめる しらべる はなしを すすめる —\n'
      + `それが ${k.confirm}じゃ。\r`
      + `もどる やめるときは ${k.cancel}を おすのじゃ。`,
      `メニューは ${k.menu}で ひらく。\r`
      + 'バッグで とうろくした どうぐは\n'
      + `${k.register}で その ばで つかえる。\r`
      + `ポケッチは ${k.poketch}で ひらき\n`
      + `${k.poketchStep}で アプリを めくる。\r`
      + `${k.view}を おせば じぶんの めのたかさで\n`
      + 'この せかいを みられるぞ。',
    ]
  }
  return [
    '전후좌우로 주인공을 움직이려면\n' + `${k.move}를 쓰게.\r`
    + `${k.run} 키를 누르고 있으면 달린다네.\r`
    + '결정하거나 조사하거나 이야기를\n'
    + `진행할 때는 ${k.confirm} 키일세.\r`
    + `되돌아가거나 그만두려면\n${k.cancel} 키를 누르게.`,
    `메뉴는 ${k.menu} 키로 연다네.\r`
    + '가방에서 등록해 둔 도구는\n'
    + `${k.register} 키로 그 자리에서 쓸 수 있네.\r`
    + `포켓치는 ${k.poketch} 키로 펼치고\n`
    + `${k.poketchStep} 키로 앱을 넘긴다네.\r`
    + `${k.view} 키를 누르면 자네 눈높이에서\n`
    + '이 세계를 볼 수 있을 걸세.',
  ]
}
