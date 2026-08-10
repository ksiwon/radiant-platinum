// 메시지 디코더 — 브라우저에서 (DATA.md §2.11)
//
// `tools/extract/message.js`가 하던 일을 옮긴 것이다. 규칙은 한 줄도 안 바꾼다 —
// 갈리면 개발판과 공개판의 대사가 달라지고, 그 차이는 화면에서만 보인다.
// `message.test.ts`가 노드 쪽 산출물과 통째로 대조한다.
//
// 다른 점은 담는 그릇뿐이다: `Buffer` 대신 `DataView`.
import type { Charmap } from './charmap'

/** 메시지 끝 */
export const TERMINATOR = 0xffff
/** 제어 코드 시작 — 다음이 명령 코드, 그 다음이 인자 개수 */
export const CONTROL = 0xfffe
/** 트레이너 이름은 9비트로 눌러 담는다 (배틀 뱅크에서만 쓴다) */
const TRAINER_NAME = 0xf100

/** 4세대 메시지 아카이브의 상수들 */
const ALLOC_MUL = 765
const CHAR_MUL = 596947
const CHAR_ADD = 18749

export class BankError extends Error {
  constructor(message: string) { super(message); this.name = 'BankError' }
}

/**
 * 뱅크 하나를 코드 배열들로 푼다.
 *
 * 뱅크마다 키가 있고 메시지마다 다른 키로 한 번 더 감싸여 있다.
 *
 * ⚠️ **자리와 길이를 믿지 않는다.** 둘 다 복호화해서 나오는 값이라, 키가 틀리면
 * 4GB짜리 길이가 나온다 — 노드에서는 예외가 났지만 브라우저에서는 그 자리에서
 * 탭이 죽는다. 범위를 벗어나면 던진다
 */
export function decodeBank(bank: Uint8Array): Uint16Array[] {
  if (bank.byteLength < 4) throw new BankError('뱅크가 4바이트도 안 된다')
  const view = new DataView(bank.buffer, bank.byteOffset, bank.byteLength)
  const count = view.getUint16(0, true)
  const key = view.getUint16(2, true)
  if (4 + count * 8 > bank.byteLength) {
    throw new BankError(`뱅크가 메시지 ${String(count)}개를 담을 크기가 아니다`)
  }
  const messages: Uint16Array[] = []
  for (let i = 1; i <= count; i++) {
    const allocKey = (ALLOC_MUL * i * key) & 0xffff
    const full = (allocKey | (allocKey << 16)) >>> 0
    const off = (view.getUint32(4 + (i - 1) * 8, true) ^ full) >>> 0
    const len = (view.getUint32(8 + (i - 1) * 8, true) ^ full) >>> 0
    if (off + len * 2 > bank.byteLength) {
      throw new BankError(`메시지 ${String(i)}가 뱅크 밖을 가리킨다 — 키가 틀렸다`)
    }
    const codes = new Uint16Array(len)
    let ck = (i * CHAR_MUL) & 0xffff
    for (let j = 0; j < len; j++) {
      codes[j] = view.getUint16(off + j * 2, true) ^ ck
      ck = (ck + CHAR_ADD) & 0xffff
    }
    messages.push(codes)
  }
  return messages
}

/**
 * 코드 배열 하나를 문자열로.
 *
 * 제어 코드는 디컴프와 같은 모양으로 적는다 — `{STRVAR_1 3, 0, 0}`, `{SIZE 200}`.
 * STRVAR는 명령 코드의 **아래 바이트가 첫 인자**다 (`0x0103` → `STRVAR_1 3`).
 */
export function codesToString(codes: Uint16Array, map: Charmap): string {
  const { chars, commands } = map
  let out = ''
  for (let j = 0; j < codes.length; j++) {
    const c = codes[j]!
    if (c === TERMINATOR) break
    if (c === TRAINER_NAME) {
      // 9비트 압축. 대사 뱅크에는 안 나온다 — 나오면 알고 싶으니 표시만 남긴다
      out += '{TRNAME}'
      break
    }
    if (c !== CONTROL) {
      out += chars.get(c) ?? `{?${c.toString(16)}}`
      continue
    }
    const code = codes[++j] ?? 0
    const nargs = codes[++j] ?? 0
    // 아래 바이트를 첫 인자로 먹는 것은 **STRVAR 계열뿐이다**. 이 규칙을 모든
    // 명령에 적용하면 0xFF01(SIZE)이 0xFF00(COLOR)으로 읽힌다
    const prefixed = commands.get(code & 0xff00)
    const strvar = prefixed?.startsWith('STRVAR_') === true ? prefixed : undefined
    const args: number[] = []
    if (strvar !== undefined) args.push(code & 0xff)
    for (let k = 0; k < nargs; k++) args.push(codes[j + 1 + k] ?? 0)
    j += nargs
    const name = strvar ?? commands.get(code) ?? `UNK_${code.toString(16).toUpperCase()}`
    out += args.length ? `{${name} ${args.join(', ')}}` : `{${name}}`
  }
  return out
}
