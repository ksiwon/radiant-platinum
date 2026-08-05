// 메시지 디코더 (DATA.md §2.11) — pl_msg.narc의 뱅크 하나를 문자열 배열로.
//
// `spike/gen4text.js`에도 디코더가 있지만 그것은 **이름표용**이다. 제어 코드를
// `{103:2}`처럼 뭉뚱그려 인자를 버리는데, 이름에는 제어 코드가 안 들어가서
// 문제가 안 됐다. 대사는 다르다:
//
//   {STRVAR_1 3, 0, 0}  주인공 이름
//   {STRVAR_1 3, 1, 0}  라이벌 이름
//
// 둘 다 `{103:2}`가 되면 누구 이름인지 알 수 없다. 여기서는 디컴프의
// `tools/msgenc/MessagesDecoder.cpp`와 같은 규칙으로 인자까지 살린다.
//
// **문자표는 우리 것을 쓴다.** 디컴프의 charmap은 한글 구역 0x400~0x40F가
// 한 칸 밀려 있다 — 미국·일본 롬용이라 한국어 표가 권위가 아니다. 실측으로
// 갈랐다: 가디안(282)이 우리 표로는 `가디안`, 디컴프 표로는 `각디안`이 된다.
// 함수 코드 19개는 두 쪽이 완전히 같다.
'use strict'
const fs = require('fs')

/** 메시지 끝 */
const TERMINATOR = 0xffff
/** 제어 코드 시작 — 다음이 명령 코드, 그 다음이 인자 개수 */
const CONTROL = 0xfffe
/** 트레이너 이름은 9비트로 눌러 담는다 (배틀 뱅크에서만 쓴다) */
const TRAINER_NAME = 0xf100

/**
 * charmap.txt를 문자표와 함수표로 나눠 읽는다.
 *
 * **한 맵에 합치면 안 된다.** 함수 코드는 `0xFFFE` 뒤에서만 의미가 있는데
 * 같이 넣으면 문자를 덮어쓴다 — 0x600/0x602/0x603의 됨·됩·됫이 실제로
 * `{STRVAR_6}`·`{UNK_602}`에 가려진 적이 있다.
 */
function loadCharmap(file) {
  const chars = new Map()
  const commands = new Map()
  let inCommands = false
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const text = line.replace(/\r$/, '')
    if (!text) continue
    if (text.startsWith('//')) {
      if (/function codes/i.test(text)) inCommands = true
      continue
    }
    const eq = text.indexOf('=')
    if (eq < 0) continue
    const code = Number.parseInt(text.slice(0, eq).trim(), 16)
    if (Number.isNaN(code)) continue
    let value = text.slice(eq + 1)
    if (value === '\\x0000') value = ''
    if (inCommands) {
      commands.set(code, value.replace(/^\{|\}$/g, ''))
      continue
    }
    // 줄바꿈은 표에 `\n`처럼 **글자 두 개**로 적혀 있다. 진짜 제어문자로 바꿔 둔다 —
    // 4세대는 셋이 다 다르다: `\n` 줄바꿈 · `\r` 스크롤(입력 대기) · `\f` 새 쪽
    chars.set(code, value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\f/g, '\f'))
  }
  return { chars, commands }
}

/**
 * 뱅크 하나를 코드 배열들로 푼다.
 *
 * 뱅크마다 키가 있고 메시지마다 다른 키로 한 번 더 감싸여 있다. 상수 765·596947·
 * 18749는 4세대 메시지 아카이브의 것이다.
 */
function decodeBank(bank) {
  const count = bank.readUInt16LE(0)
  const key = bank.readUInt16LE(2)
  const messages = []
  for (let i = 1; i <= count; i++) {
    const allocKey = (765 * i * key) & 0xffff
    const full = (allocKey | (allocKey << 16)) >>> 0
    const off = (bank.readUInt32LE(4 + (i - 1) * 8) ^ full) >>> 0
    const len = (bank.readUInt32LE(8 + (i - 1) * 8) ^ full) >>> 0
    const codes = new Uint16Array(len)
    let ck = (i * 596947) & 0xffff
    for (let j = 0; j < len; j++) {
      codes[j] = bank.readUInt16LE(off + j * 2) ^ ck
      ck = (ck + 18749) & 0xffff
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
function toString_(codes, { chars, commands }) {
  let out = ''
  for (let j = 0; j < codes.length; j++) {
    const c = codes[j]
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
    const code = codes[++j]
    const nargs = codes[++j]
    // 아래 바이트를 첫 인자로 먹는 것은 **STRVAR 계열뿐이다**. 이 규칙을 모든
    // 명령에 적용하면 0xFF01(SIZE)이 0xFF00(COLOR)으로 읽힌다
    const prefixed = commands.get(code & 0xff00)
    const strvar = prefixed?.startsWith('STRVAR_') === true ? prefixed : undefined
    const args = []
    if (strvar !== undefined) args.push(code & 0xff)
    for (let k = 0; k < nargs; k++) args.push(codes[j + 1 + k])
    j += nargs
    const name = strvar ?? commands.get(code) ?? `UNK_${code.toString(16).toUpperCase()}`
    out += args.length ? `{${name} ${args.join(', ')}}` : `{${name}}`
  }
  return out
}

module.exports = { loadCharmap, decodeBank, toString: toString_, TERMINATOR, CONTROL }
