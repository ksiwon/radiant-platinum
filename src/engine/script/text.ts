// 대사 문자열 해석 (DATA.md §2.11)
//
// 추출기가 내놓는 글에는 세 가지가 섞여 있다:
//
//   \n \r \f      줄 바꿈 · 창 비우고 새로 · 한 줄 올리고 이어서
//   {NAME 인자…}   제어 부호. 원본의 `0xFFFE 종류 개수 인자…`를 이름으로 푼 것
//   나머지         그대로 찍을 글자
//
// `{STRVAR_1 종류, 칸, 조사}`가 대사의 절반을 차지한다. **칸**은 스크립트가
// `BufferPlayerName` 같은 명령으로 채워 넣는 8칸짜리 자리다(`StringTemplate_New(8, 64)`).
// **조사**는 한국어판에만 있는 것이라 따로 다룬다 — 아래 참조.

/** `StringTemplate_New(8, 64, …)` — 스크립트가 채울 수 있는 칸 수 */
export const MESSAGE_SLOTS = 8

export type MessageToken =
  | { kind: 'text', text: string }
  /** `line`은 그 자리에서 줄만 바꾸고, 나머지 둘은 **버튼을 기다린다** */
  | { kind: 'break', how: 'line' | 'clear' | 'scroll' }
  | { kind: 'arg', slot: number, particle: number, afterNext: boolean }
  | { kind: 'pause', frames: number }
  | { kind: 'color', color: number }
  | { kind: 'size', percent: number }
  | { kind: 'cursorX', x: number }
  | { kind: 'callback', param: number }
  | { kind: 'screen', which: number }

const MARKER = /\{([A-Z_0-9]+)((?:\s+-?\d+(?:,\s*-?\d+)*)?)\}/g

/**
 * 글 하나를 토큰으로 나눈다.
 *
 * 모르는 제어 부호는 **버리지 않고 글자로 남긴다**. 조용히 사라지면 그 자리에
 * 무엇이 있었는지 화면에서도 테스트에서도 안 보인다.
 */
export function parseMessage(raw: string): MessageToken[] {
  const out: MessageToken[] = []
  const push = (text: string): void => {
    if (text === '') return
    const last = out[out.length - 1]
    if (last?.kind === 'text') last.text += text
    else out.push({ kind: 'text', text })
  }

  let at = 0
  for (const m of raw.matchAll(MARKER)) {
    pushBreaks(raw.slice(at, m.index), push, out)
    at = m.index + m[0].length
    const args = m[2]!.trim() === '' ? [] : m[2]!.split(',').map((s) => Number(s.trim()))
    const token = marker(m[1]!, args)
    if (token) out.push(token)
    else push(m[0])
  }
  pushBreaks(raw.slice(at), push, out)
  return out
}

function pushBreaks(text: string, push: (s: string) => void, out: MessageToken[]): void {
  for (const [i, part] of text.split(/([\n\r\f])/).entries()) {
    if (i % 2 === 0) push(part)
    else out.push({ kind: 'break', how: part === '\n' ? 'line' : part === '\r' ? 'clear' : 'scroll' })
  }
}

function marker(name: string, args: number[]): MessageToken | null {
  const a = args[0] ?? 0
  switch (name) {
    // `{STRVAR_1 종류, 칸, 조사}`. 첫 인자는 부호의 하위 바이트고 **칸이 아니다** —
    // `CharCode_FormatArgParam(c, 0)`이 가리키는 것은 두 번째다.
    //
    // ⚠️ **칸을 채우는 부호가 셋이다.** `CharCode_IsFormatArg`가 부호의 상위
    // 바이트를 0x01·0x05·0x06 셋과 맞대 본다 — 0x0600(광장 미니게임 이름)도
    // 같은 자리다. 0x0300은 그 셋에 없어서 원작도 **안 채운다** (일본 롬
    // 뱅크 366의 광장 줄이 그렇게 비어 있다)
    case 'STRVAR_5':
    case 'STRVAR_6':
    case 'STRVAR_1':
      return args.length < 2
        ? null
        : { kind: 'arg', slot: args[1]!, particle: (args[2] ?? 0) & 0xf, afterNext: ((args[2] ?? 0) & 0x10) !== 0 }
    case 'PAUSE': return { kind: 'pause', frames: a }
    case 'COLOR': return { kind: 'color', color: a }
    case 'SIZE': return { kind: 'size', percent: a }
    case 'CURSOR_X': return { kind: 'cursorX', x: a }
    case 'CALLBACK': return { kind: 'callback', param: a }
    case 'SCREEN': return { kind: 'screen', which: a }
    default: return null
  }
}

// ── 조사 ─────────────────────────────────────────────────────────────────────
//
// 한국어판은 이름을 끼워 넣은 **뒤에 붙일 조사**를 부호에 담아 둔다. 미국판은
// 이 자리가 전부 0이고 한국어판만 0~7과 18이 나온다. 디컴프는 미국판이라 표가
// 없어서, 4392개 전부를 훑어 **바로 뒤에 오는 글**로 뜻을 정했다:
//
//   1  "{아이템}1\n지니게 할 수 없습니다!"      → 은/는
//   2  "{아이템}2\n어떻게 할까요?"               → 을/를
//   3  "안에는 {기술}3\n기록되어 있다!"          → 이/가
//   4  "{이름}4 콘테스트에 대해 이야기 한 적"    → 와/과
//   5  "{아이템}5로 교환하시겠습니까?"           → 으/∅  (14개 중 12개가 뒤에 '로')
//   6  "{이름}6구나!" "{이름}6가" "{이름}6에게"  → 이/∅  (받침 있는 이름 뒤 접미사)
//   7  "빛나: {이름}7!\n포켓몬 잡고 있어?"       → 아/야  (부르는 말)
//
// 18(0x12)은 12개뿐인데 **전부** `{…, 18}{COLOR 0} 손에 넣었다!` 꼴이다.
// 하위 4비트가 2(을/를)이고, 0x10은 조사를 **다음 제어 부호 뒤로** 미룬다 —
// 그래야 이름만 색이 들어가고 조사는 본문 색으로 남는다.

/** 받침 유무로 갈리는 조사 쌍. 번호가 곧 부호의 하위 4비트다 */
const PARTICLES: readonly (readonly [string, string] | null)[] = [
  null,         // 0  없음
  ['은', '는'], // 1
  ['을', '를'], // 2
  ['이', '가'], // 3
  ['과', '와'], // 4
  ['으', ''],   // 5  뒤에 오는 '로'와 붙어 '으로/로'가 된다
  ['이', ''],   // 6
  ['아', '야'], // 7
]

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
/** 초성 하나에 딸린 (중성 × 종성) 가짓수. 나머지가 0이면 받침이 없다 */
const JONGSEONG_COUNT = 28
/** 종성 표에서 ㄹ의 자리. '으로'만 ㄹ을 받침 없는 것처럼 다룬다 */
const JONGSEONG_RIEUL = 8

/** 숫자를 읽었을 때의 종성. 3은 '삼'이라 ㅁ, 6은 '육'이라 ㄱ이다 */
const DIGIT_JONGSEONG: Record<string, number> = {
  '0': 21, '1': JONGSEONG_RIEUL, '2': 0, '3': 16, '4': 0,
  '5': 0, '6': 1, '7': JONGSEONG_RIEUL, '8': JONGSEONG_RIEUL, '9': 0,
}

/**
 * 마지막 글자의 종성 번호. 받침이 없으면 0이고 모르면 `null`이다.
 *
 * 한글과 숫자만 안다. 칸에 들어가는 것이 사람 이름·포켓몬 이름·도구 이름·숫자라
 * 이 둘로 덮인다
 */
function jongseong(text: string): number | null {
  const last = text.at(-1)
  if (last === undefined) return null
  if (last in DIGIT_JONGSEONG) return DIGIT_JONGSEONG[last]!
  const code = last.codePointAt(0)!
  if (code < HANGUL_START || code > HANGUL_END) return null
  return (code - HANGUL_START) % JONGSEONG_COUNT
}

/**
 * 값 뒤에 붙일 조사.
 *
 * 받침을 못 읽는 글자(로마자 등)면 **받침이 없는 쪽**을 준다 — 원본에 그런
 * 자료가 안 들어가므로 여기 걸리면 자료 쪽이 잘못된 것이다
 */
export function particleFor(selector: number, value: string): string {
  const pair = PARTICLES[selector]
  if (!pair) return ''
  const jong = jongseong(value)
  const hasBatchim = selector === 5
    ? jong !== null && jong !== 0 && jong !== JONGSEONG_RIEUL
    : jong !== null && jong !== 0
  return hasBatchim ? pair[0] : pair[1]
}

// ── 칸 채우기 ────────────────────────────────────────────────────────────────

/**
 * 스크립트가 `Buffer…` 명령으로 채우는 8칸.
 *
 * ⚠️ **화면마다 표가 다르다.** 8은 필드 스크립트의 값이고
 * (`StringTemplate_New(8, 64, HEAP_ID_FIELD2)`), 요약 화면의 트레이너 메모는
 * 9칸이라(`StringTemplate_New(9, 32, …)`) 알 자리가 8번 칸에 들어간다.
 * 기본값으로 두면 그 칸이 조용히 버려져 알 자리가 빈 채로 찍힌다
 */
export class MessageSlots {
  private readonly values: string[]

  constructor(private readonly size: number = MESSAGE_SLOTS) {
    this.values = Array<string>(size).fill('')
  }

  set(slot: number, value: string): void {
    if (slot >= 0 && slot < this.size) this.values[slot] = value
  }

  get(slot: number): string {
    return this.values[slot] ?? ''
  }

  clear(): void {
    this.values.fill('')
  }
}

/**
 * 칸을 채우고 조사를 붙인 토큰.
 *
 * `afterNext`가 선 조사는 **다음 토큰 뒤로** 민다. 그 다음 토큰은 글자를 안 내는
 * 제어 부호({COLOR} 같은 것)라, 조사만 그 바깥으로 빠져나온다
 */
export function fillSlots(tokens: readonly MessageToken[], slots: MessageSlots): MessageToken[] {
  const out: MessageToken[] = []
  let pending: string | null = null
  const push = (token: MessageToken): void => {
    if (token.kind === 'text' && out[out.length - 1]?.kind === 'text') {
      (out[out.length - 1] as { text: string }).text += token.text
      return
    }
    out.push(token)
  }
  for (const token of tokens) {
    if (token.kind !== 'arg') {
      push(token)
      if (pending !== null) {
        push({ kind: 'text', text: pending })
        pending = null
      }
      continue
    }
    if (pending !== null) {
      push({ kind: 'text', text: pending })
      pending = null
    }
    const value = slots.get(token.slot)
    push({ kind: 'text', text: value })
    const particle = particleFor(token.particle, value)
    if (particle === '') continue
    if (token.afterNext) pending = particle
    else push({ kind: 'text', text: particle })
  }
  if (pending !== null) push({ kind: 'text', text: pending })
  return out
}

/** 토큰을 다시 글로. 제어 부호는 빠지고 줄 바꿈만 남는다 */
export function tokensToText(tokens: readonly MessageToken[]): string {
  return tokens
    .map((t) => (t.kind === 'text' ? t.text
      : t.kind === 'break' ? (t.how === 'line' ? '\n' : t.how === 'clear' ? '\r' : '\f')
        : ''))
    .join('')
}

/** 편의 — 해석 · 칸 채우기 · 글로 되돌리기를 한 번에 */
export function formatMessage(raw: string, slots: MessageSlots): string {
  return tokensToText(fillSlots(parseMessage(raw), slots))
}
