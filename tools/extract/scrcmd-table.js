// 스크립트 명령 서명표 (DATA.md §2.10) — 디컴프의 어셈블러 매크로에서 기계적으로 뽑는다.
//
// **손으로 적지 않는다.** 840개 명령의 피연산자 폭을 사람이 옮기면 반드시 틀리고,
// 틀려도 티가 안 난다 — 폭이 하나 어긋나면 그 뒤가 전부 밀리는데, 대개 다음 명령이
// 우연히 유효해서 조용히 이상한 스크립트가 나온다. 디컴프의
// `asm/macros/scrcmd.inc`가 이미 기계가 읽는 형태의 표다:
//
//   .macro Message messageID
//   .short SCRCMD_MESSAGE
//   .byte \messageID
//   .endm
//
// 여기서 "opcode 0x2C 뒤에 u8 하나"가 그대로 읽힌다. 이 파일은 그것을 옮기는
// 일만 한다. 옮긴 결과는 실제 scr_seq 1124개를 되짚어 디컴프 원본 .s와
// 대조해서 검증한다 (scripts-verify.js).
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
// 자리는 어댑터가 정한다 (`tools/raw/sources`) — raw를 정리해도 여기가 안 바뀐다
const DECOMP = require('../raw/sources.cjs').requireDir('references.decomp')
const OUT = require('../raw/sources.cjs').sourceDir('references.decompDerived')
  ?? path.join(ROOT, 'raw/decomp-derived')

/** `.macro` 안에서 바이트를 내보내는 지시어와 그 폭 */
const WIDTH = { '.byte': 1, '.short': 2, '.hword': 2, '.long': 4, '.word': 4 }

/**
 * 어셈블러 상수표.
 *
 * 두 곳에서 온다. `generated/*.txt`는 이름만 한 줄씩 적힌 열거형이라 **줄 번호가
 * 곧 값**이고(빌드가 이 파일로 헤더를 만든다), `include/**\/*.h`는 평범한
 * `#define`이다. 길이가 조건부인 명령 6개의 `.if`를 풀려면 이 값들이 필요하다.
 *
 * 열거형 줄에 `NAME = 254`처럼 값이 박혀 있으면 거기서부터 번호가 다시 매겨진다.
 */
function readConstants() {
  const map = new Map()
  const gen = path.join(DECOMP, 'generated')
  for (const file of fs.readdirSync(gen)) {
    if (!file.endsWith('.txt')) continue
    let next = 0
    for (const line of fs.readFileSync(path.join(gen, file), 'utf8').split('\n')) {
      const text = line.replace(/#.*$/, '').trim()
      if (!text) continue
      const m = /^(\w+)(?:\s*=\s*(\S+))?$/.exec(text)
      if (!m) throw new Error(`${file}: 못 읽는 열거형 줄 — ${text}`)
      if (m[2] !== undefined) {
        // 값이 다른 이름을 가리키는 경우가 있다. 못 풀면 그 파일의 그 뒤는
        // 번호를 확신할 수 없으니 **아예 기록하지 않는다** — 틀린 값을 넣느니 없는 게 낫다
        next = /^-?(0x[0-9a-fA-F]+|\d+)$/.test(m[2]) ? Number(m[2]) : map.get(m[2])
        if (next === undefined) break
      }
      map.set(m[1], next)
      next++
    }
  }
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.name.endsWith('.h')) {
        const text = fs.readFileSync(full, 'utf8')
        for (const m of text.matchAll(/^#define\s+(\w+)\s+\(?(-?(?:0x[0-9a-fA-F]+|\d+))\)?\s*$/gm)) {
          if (!map.has(m[1])) map.set(m[1], Number(m[2]))
        }
      }
    }
  }
  walk(path.join(DECOMP, 'include'))
  return map
}

/** @typedef {{name: string, params: string[], body: string[]}} Macro */

/**
 * `.macro ... .endm` 덩어리를 모은다.
 * @returns {Macro[]}
 */
function readMacros(text) {
  const out = []
  let cur = null
  for (const raw of text.split('\n')) {
    const line = raw.replace(/@.*$/, '').trim()
    if (!line) continue
    const open = /^\.macro\s+(\S+)\s*(.*)$/.exec(line)
    if (open) {
      const params = open[2]
        .split(',')
        .map((p) => p.trim().split('=')[0].trim())
        .filter(Boolean)
      cur = { name: open[1], params, body: [] }
      continue
    }
    if (line === '.endm') {
      if (cur) out.push(cur)
      cur = null
      continue
    }
    if (cur) cur.body.push(line)
  }
  return out
}

/** `.byte \foo` 한 줄을 피연산자로. `\arg-.-4`면 **상대 오프셋**이다 */
function operand(piece, size) {
  const rel = /-\s*\.\s*-\s*4$/.test(piece)
  const name = piece.replace(/-\s*\.\s*-\s*4$/, '').replace(/^\\/, '').trim()
  return { name, size, rel }
}

/**
 * `.if \sel == A || \sel == B` 을 셀렉터 이름과 값 목록으로.
 * 이 형태가 아니면 던진다 — 조용히 넘기면 길이가 틀린 채로 통과한다.
 */
function parseCondition(expr, consts, where) {
  let selector = null
  const values = []
  for (const clause of expr.split('||')) {
    const m = /^\s*\\(\w+)\s*==\s*(\w+)\s*$/.exec(clause)
    if (!m) throw new Error(`${where}: 못 읽는 조건 — ${clause.trim()}`)
    if (selector !== null && selector !== m[1]) {
      throw new Error(`${where}: 조건이 두 인자를 본다 (${selector}, ${m[1]})`)
    }
    selector = m[1]
    const raw = m[2]
    const value = /^\d+$/.test(raw) ? Number(raw) : consts.get(raw)
    if (value === undefined) throw new Error(`${where}: 모르는 상수 ${raw}`)
    values.push(value)
  }
  return { selector, values }
}

/**
 * 매크로 본문을 피연산자 서명으로 옮긴다.
 *
 * 첫 `.short SCRCMD_*`가 opcode이고 그 뒤의 `.byte`/`.short`/`.long`이 피연산자다.
 *
 * 명령 6개는 **길이가 고정이 아니다** — 첫 피연산자 값에 따라 뒤에 붙는 것이
 * 달라진다(HM 필드기술 함수, 유니온룸, TV, 신비한 선물). 그것을 `cases`로 옮긴다.
 * 이걸 빠뜨리면 그 명령을 만나는 순간 그 뒤 전체가 밀린다.
 *
 * @returns {{opcode: string, args: object[], cases: object|null}|null}
 *   opcode를 내보내지 않는 매크로(별칭·헬퍼)면 null
 */
function signature(macro, consts, opcodeNames) {
  let opcode = null
  const args = []
  /** `.if` 안쪽을 만나면 여기에 쌓는다 */
  let cases = null
  /** 중첩 `.if`/`.else` 상태 — 지금 어느 갈래에 방출 중인가 */
  const branch = []

  const emit = (piece, size) => {
    if (opcode === null) {
      if (!opcodeNames.has(piece)) return false // 첫 방출이 opcode가 아니면 별칭이다
      if (size !== 2) throw new Error(`${macro.name}: opcode 폭이 2가 아니다`)
      opcode = piece
      return true
    }
    const arg = operand(piece, size)
    if (branch.length === 0) args.push(arg)
    else branch[branch.length - 1].args.push(arg)
    return true
  }

  for (const line of macro.body) {
    const cond = /^\.if\s+(.*)$/.exec(line)
    if (cond) {
      if (opcode === null) return null // 조건부 별칭 — 손대지 않는다
      const { selector, values } = parseCondition(cond[1], consts, macro.name)
      const on = args.findIndex((a) => a.name === selector)
      if (on === -1) throw new Error(`${macro.name}: 셀렉터 ${selector}가 앞에 없다`)
      if (cases === null) cases = { on, when: [], otherwise: [] }
      else if (cases.on !== on) throw new Error(`${macro.name}: 셀렉터가 두 개다`)
      branch.push({ values, args: [] })
      continue
    }
    if (line === '.else' || line === '.endif') {
      if (branch.length === 0) throw new Error(`${macro.name}: 짝 없는 ${line}`)
      // `.else` 안의 중첩 `.if`가 다음 갈래가 된다. 여기서는 갈래를 닫기만 하면
      // 되는데, 닫는 시점이 `.else`인지 `.endif`인지는 결과에 영향이 없다 —
      // 이 파일의 모든 조건이 "셀렉터 값 → 뒤따르는 피연산자" 하나의 사슬이다
      if (line === '.endif') {
        const done = branch.pop()
        if (done.args.length) cases.when.push(done)
      }
      continue
    }
    const m = /^(\.\w+)\s+(.*)$/.exec(line)
    if (!m) return null // .set 등 — 단순 방출이 아니면 손대지 않는다
    const size = WIDTH[m[1]]
    if (size === undefined) return null
    for (const piece of m[2].split(',').map((s) => s.trim())) {
      if (!emit(piece, size)) return null
    }
  }
  if (branch.length) throw new Error(`${macro.name}: 안 닫힌 .if`)
  return opcode === null ? null : { opcode, args, cases }
}

/** `data/scripts/scrcmd.h`의 나열 순서가 곧 opcode 번호다 */
function readOpcodeOrder() {
  const text = fs.readFileSync(path.join(DECOMP, 'include/data/scripts/scrcmd.h'), 'utf8')
  return [...text.matchAll(/^ScriptCommand\(\s*(\w+)\s*,/gm)].map((m) => m[1])
}

function buildTable() {
  const macros = readMacros(
    fs.readFileSync(path.join(DECOMP, 'asm/macros/scrcmd.inc'), 'utf8'),
  )
  const order = readOpcodeOrder()
  const byOpcode = new Map(order.map((id, i) => [id, i]))
  const consts = readConstants()

  const table = order.map((id) => ({ id, name: null, args: null, cases: null }))
  const dupes = []
  for (const macro of macros) {
    // 별칭 매크로는 null로 조용히 넘어가지만, opcode를 내보내는데 본문을 못
    // 읽는 것은 표에 구멍이 생긴다는 뜻이라 던진다
    const sig = signature(macro, consts, byOpcode)
    if (!sig) continue
    const code = byOpcode.get(sig.opcode)
    if (table[code].name) {
      dupes.push({ id: sig.opcode, kept: table[code].name, dropped: macro.name })
      continue
    }
    table[code].name = macro.name
    table[code].args = sig.args
    table[code].cases = sig.cases
  }
  return { table, dupes }
}

function main() {
  const { table, dupes } = buildTable()
  const covered = table.filter((e) => e.args).length
  const missing = table
    .map((e, i) => (e.args ? null : { i, id: e.id }))
    .filter(Boolean)

  console.log(`명령 ${table.length}개 중 서명 확보 ${covered}개`)
  if (dupes.length) {
    console.log(`중복 매크로 ${dupes.length}개 (앞의 것을 쓴다):`)
    for (const d of dupes) console.log(`  ${d.id}: ${d.kept} ← ${d.dropped}`)
  }
  if (missing.length) {
    console.log(`매크로 없음 ${missing.length}개:`)
    for (const m of missing) {
      console.log(`  0x${m.i.toString(16).padStart(3, '0')} ${m.id}`)
    }
  }

  fs.mkdirSync(OUT, { recursive: true })
  const dest = path.join(OUT, 'scrcmd-table.json')
  fs.writeFileSync(dest, `${JSON.stringify({ commands: table }, null, 1)}\n`)
  console.log(`→ ${path.relative(ROOT, dest)}`)
}

if (require.main === module) main()
module.exports = { buildTable, readOpcodeOrder }
