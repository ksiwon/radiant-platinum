// 스크립트 어셈블러 (DATA.md §2.10) — 디컴프의 `.s`를 롬과 같은 바이트로 조립한다.
//
// **이게 검증의 핵심이다.** 명령표(scrcmd-table.js)가 맞는지 확인하는 방법은
// 하나뿐이다 — 디컴프 원본을 조립해서 롬에서 꺼낸 바이트와 한 바이트도 다르지
// 않은지 보는 것. 폭이 하나만 틀려도 그 지점부터 전부 어긋나므로, 1124개가
// 전부 일치하면 표에 구멍이 없다는 뜻이다.
//
// 반대로 "디스어셈블이 오류 없이 끝났다"는 증거가 되지 못한다. 실제로 초기화
// 스크립트 549개를 코드로 잘못 읽었을 때도 예외 없이 통과했다 — 바이트 열이
// 우연히 유효한 명령으로 읽혔을 뿐이었다.
//
// GNU as 전체가 아니라 이 파일들이 실제로 쓰는 것만 구현한다:
// 라벨, `.byte/.short/.long`, `.balign`, `.set`, `.if/.else/.endif`, `.error`,
// 매크로 전개, 그리고 `심볼 - . - 4` 형태의 PC 상대 오프셋.
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
// 자리는 어댑터가 정한다 (`tools/raw/sources`) — raw를 정리해도 여기가 안 바뀐다
const DECOMP = require('../raw/sources.cjs').requireDir('references.decomp')

/**
 * `#include "..."`의 탐색 경로. 디컴프 빌드가 주는 `-I`와 같다 —
 * `macros/scrcmd.inc`는 `asm/` 밑, `constants/*.h`는 `include/` 밑,
 * `res/...`와 `generated/...`는 루트 기준이다.
 */
const INCLUDE_DIRS = ['asm', 'include', '.'].map((d) => path.join(DECOMP, d))

function resolveInclude(spec) {
  for (const dir of INCLUDE_DIRS) {
    const full = path.join(dir, spec)
    if (fs.existsSync(full)) return full
  }
  return null // generated/*.h는 빌드가 만드는 것이라 리포에 없다 (.txt로 대신 읽는다)
}

/**
 * 빌드가 만드는 헤더를 원본 JSON에서 되만든다.
 *
 * 스크립트가 쓰는 이름 중 둘은 리포에 헤더가 없다 — 빌드 때 생긴다:
 *
 *   res/text/bank/{맵}.h        메시지 이름 → 뱅크 안 번호   (msgenc)
 *   res/field/events/{맵}.h     LOCALID_*  → object_events 색인 (datagen_events)
 *
 * 둘 다 **JSON 배열의 순서가 곧 값**이다. 그 규칙은 디컴프의 생성기에서 읽었다
 * (`tools/datagen/datagen_events.cpp`, `tools/msgenc/Gmm.cpp`).
 */
function virtualDefines(spec) {
  const bank = /^res\/text\/bank\/(.+)\.h$/.exec(spec)
  if (bank) return jsonIndexes(`res/text/${bank[1]}.json`, 'messages')
  const events = /^res\/field\/events\/(.+)\.h$/.exec(spec)
  if (events) return jsonIndexes(`res/field/events/${events[1]}.json`, 'object_events')
  return null
}

/**
 * 빌드가 만드는 **어셈블러** 헤더 둘. 안에 든 것이 `#define`이 아니라
 * `ScriptEntry` 줄이라 그 자리에 그대로 펴 넣어야 한다.
 *
 * 개수는 데이터에서 센다 (`tools/dataproc/src/{itemproc,trainerproc}.c`):
 * 트레이너는 파일 수, 숨은 도구는 플래그 번호의 최댓값 + 1이다.
 */
function virtualAsm(spec, generated) {
  if (spec === 'res/trainers/trainer_scripts.h') {
    const dir = path.join(DECOMP, 'res/trainers/data')
    const count = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length
    return [
      ...Array.from({ length: count }, () => 'ScriptEntry Battles_Trainer'),
      'ScriptEntry Battles_ApproachingTrainer',
      'ScriptEntryEnd',
    ]
  }
  if (spec === 'res/items/hidden_item_scripts.h') {
    const text = fs.readFileSync(path.join(DECOMP, 'include/data/field/hidden_items.h'), 'utf8')
    const base = generated.get('HIDDEN_ITEM_FLAGS_START')
    if (base === undefined) throw new Error('HIDDEN_ITEM_FLAGS_START를 못 찾았다')
    let max = -1
    for (const m of text.matchAll(/HIDDEN_ITEM_ENTRY\([^)]*?,\s*(FLAG_\w+)\s*\)/g)) {
      const flag = generated.get(m[1])
      if (flag === undefined) throw new Error(`모르는 플래그 ${m[1]}`)
      max = Math.max(max, flag - base)
    }
    return [
      ...Array.from({ length: max + 1 }, () => 'ScriptEntry HiddenItems_Item'),
      'ScriptEntryEnd',
    ]
  }
  return null
}

function jsonIndexes(rel, key) {
  const full = path.join(DECOMP, rel)
  if (!fs.existsSync(full)) return null
  const list = JSON.parse(fs.readFileSync(full, 'utf8'))[key] ?? []
  const out = new Map()
  list.forEach((entry, i) => {
    if (entry && typeof entry.id === 'string') out.set(entry.id, String(i))
  })
  return out
}

// ── 전처리 ───────────────────────────────────────────────────────────────────

/** `/* *\/`, `//`, `@` 주석을 걷어낸다. 블록 주석은 줄을 넘어간다 */
function stripComments(text) {
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2)
      // 주석 안의 줄바꿈은 살려야 줄 번호와 `.macro` 경계가 안 밀린다
      out += (end === -1 ? text.slice(i) : text.slice(i, end)).replace(/[^\n]/g, '')
      i = end === -1 ? text.length : end + 2
      continue
    }
    if (text.startsWith('//', i) || text[i] === '@') {
      const end = text.indexOf('\n', i)
      i = end === -1 ? text.length : end
      continue
    }
    const nl = text.indexOf('\n', i)
    const stop = Math.min(
      ...[text.indexOf('/*', i), text.indexOf('//', i), text.indexOf('@', i), nl]
        .map((x) => (x === -1 ? text.length : x))
        .filter((x) => x >= i),
    )
    if (stop === i) {
      out += text[i]
      i++
    } else {
      out += text.slice(i, stop)
      i = stop
    }
  }
  return out
}

/**
 * `#include`를 따라가며 `#define`을 모은다.
 *
 * **전부 한 통에 모으면 안 된다.** `LOCALID_GUITARIST` 같은 이름은 맵마다
 * 값이 다르다 — 실제로 쓰는 파일만 따라가야 한다.
 */
function collectDefines(entry, cache = new Map()) {
  const defines = new Map()
  const functions = new Map()
  const seen = new Set()
  const visit = (file) => {
    const full = path.resolve(file)
    if (seen.has(full)) return
    seen.add(full)
    let text = cache.get(full)
    if (text === undefined) {
      text = stripComments(fs.readFileSync(full, 'utf8'))
      cache.set(full, text)
    }
    for (const line of text.split('\n')) {
      const inc = /^\s*#include\s+"([^"]+)"/.exec(line)
      if (inc) {
        const target = resolveInclude(inc[1])
        if (target) visit(target)
        else for (const [k, v] of virtualDefines(inc[1]) ?? []) defines.set(k, v)
        continue
      }
      // 인자 있는 매크로도 쓰인다 — `RGB(0, 0, 0)`
      const fn = /^\s*#define\s+(\w+)\(([^)]*)\)\s+(.+?)\s*$/.exec(line)
      if (fn) {
        functions.set(fn[1], {
          params: fn[2].split(',').map((p) => p.trim()).filter(Boolean),
          body: fn[3].trim(),
        })
        continue
      }
      const def = /^\s*#define\s+(\w+)\s+(.+?)\s*$/.exec(line)
      if (def) defines.set(def[1], def[2].trim())
    }
    readEnums(text, defines)
  }
  visit(entry)
  return { defines, functions }
}

/**
 * 헤더의 C 열거형. `#define`만 보면 놓친다 —
 * `PADDING_MODE_ZEROES` 같은 것이 `enum { ... }` 안에 있다.
 */
function readEnums(text, defines) {
  for (const block of text.matchAll(/\benum\s+\w*\s*\{([^}]*)\}/g)) {
    let next = 0
    for (const piece of block[1].split(',')) {
      const m = /^\s*(\w+)\s*(?:=\s*(.+?)\s*)?$/.exec(piece)
      if (!m) continue
      if (m[2] !== undefined) {
        const v = /^-?(0x[0-9a-fA-F]+|\d+)$/.test(m[2])
          ? Number(m[2])
          : Number(defines.get(m[2]))
        if (!Number.isFinite(v)) break // 못 푸는 값이 나오면 그 뒤 번호를 확신할 수 없다
        next = v
      }
      if (!defines.has(m[1])) defines.set(m[1], String(next))
      next++
    }
  }
}

/**
 * `generated/*.txt` 열거형 — 줄 번호가 값이다 (`NAME = 5`면 거기서 다시 매긴다).
 *
 * **넷은 비트마스크다.** `generated/meson.build`가 열거형마다 종류를 적어 두는데,
 * `'type': 'mask'`면 값이 `1 << 줄번호`다. 이것을 모르면 `SetPlayerState`가
 * 8이 나올 자리에 3이 들어간다 — 크기는 같아서 조립은 통과하고 동작만 틀린다.
 */
function readMaskEnums() {
  const meson = fs.readFileSync(path.join(DECOMP, 'generated/meson.build'), 'utf8')
  const out = new Set()
  for (const m of meson.matchAll(/'(\w+)':\s*\{[^}]*'type':\s*'mask'/g)) out.add(m[1])
  return out
}

function readGenerated() {
  const map = new Map()
  const gen = path.join(DECOMP, 'generated')
  const masks = readMaskEnums()
  for (const file of fs.readdirSync(gen)) {
    if (!file.endsWith('.txt')) continue
    const isMask = masks.has(file.slice(0, -4))
    let next = 0
    for (const line of fs.readFileSync(path.join(gen, file), 'utf8').split('\n')) {
      const text = line.replace(/#.*$/, '').trim()
      if (!text) continue
      const m = /^(\w+)(?:\s*=\s*(\S+))?$/.exec(text)
      if (!m) throw new Error(`${file}: 못 읽는 열거형 줄 — ${text}`)
      if (m[2] !== undefined) {
        next = /^-?(0x[0-9a-fA-F]+|\d+)$/.test(m[2]) ? Number(m[2]) : map.get(m[2])
        if (next === undefined) break
      }
      map.set(m[1], isMask ? 1 << next : next)
      next++
    }
  }
  return map
}

// ── 매크로 ───────────────────────────────────────────────────────────────────

/** @typedef {{name: string, params: {name: string, def: string|null}[], body: string[]}} Macro */

/**
 * 매크로 정의와, 매크로 **바깥**의 `.set`.
 *
 * 바깥의 `.set`도 챙겨야 한다 — `ScriptEntry`가 보는 `F_ACCEPT_SCRIPT_ENTRIES`가
 * 거기서 초기화된다. 빠뜨리면 첫 진입점에서 바로 막힌다.
 *
 * @returns {{macros: Map<string, Macro>, presets: [string, string][]}}
 */
function readMacros(file, cache = new Map()) {
  const out = new Map()
  const presets = []
  const seen = new Set()
  const visit = (f) => {
    const full = path.resolve(f)
    if (seen.has(full) || !fs.existsSync(full)) return
    seen.add(full)
    let text = cache.get(full)
    if (text === undefined) {
      text = stripComments(fs.readFileSync(full, 'utf8'))
      cache.set(full, text)
    }
    // 명령 이름 → opcode. 어셈블러 쪽에서는 `data/scripts/scrcmd.h`가 열거형이다
    for (const entry of readScriptCommandEnum(text)) presets.push(entry)

    let cur = null
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      const inc = /^#include\s+"([^"]+)"/.exec(line)
      if (inc && !cur) {
        const target = resolveInclude(inc[1])
        if (target) visit(target)
        continue
      }
      const open = /^\.macro\s+(\S+)\s*(.*)$/.exec(line)
      if (open) {
        // 매개변수도 쉼표 대신 공백으로 나눈 것이 있다 (`.macro GoToIfBadgeAcquired badge label`)
        const params = splitArgs(open[2]).map((p) => {
          const eq = p.indexOf('=')
          return eq === -1
            ? { name: p, def: null }
            : { name: p.slice(0, eq).trim(), def: p.slice(eq + 1).trim() }
        })
        cur = { name: open[1], params, body: [] }
        continue
      }
      if (line === '.endm') {
        if (cur) out.set(cur.name, cur)
        cur = null
        continue
      }
      if (cur) {
        cur.body.push(line)
        continue
      }
      const set = /^\.set\s+(\w+)\s*,\s*(.*)$/.exec(line)
      if (set) presets.push([set[1], set[2].trim()])
    }
  }
  visit(file)
  return { macros: out, presets }
}

// ── 식 ───────────────────────────────────────────────────────────────────────

/**
 * 식 계산기.
 *
 * 온전한 파서가 필요하다. `SetVar`·`CompareVar` 같은 매크로가 **두 번째 인자가
 * 변수 ID 범위 안인지**를 보고 다른 명령으로 갈라지기 때문이다:
 *
 *   .if ((\v >= VARS_START && \v <= VARS_END) || (\v >= SCRIPT_LOCAL_VARS_START && ...))
 *
 * 그래서 `&&`·`||`·비교·괄호를 다 계산할 줄 알아야 한다. `.`은 그 필드가 놓이는
 * 주소이고, 그래서 `라벨 - . - 4`가 PC 상대 오프셋이 된다.
 */
const PRECEDENCE = [
  ['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='],
  ['<=', '>=', '<', '>'], ['<<', '>>'], ['+', '-'], ['*', '/', '%'],
]

/**
 * 인자 있는 `#define`을 펼친다. `RGB(0, 0, 0)` → `(((0) << 10) | ((0) << 5) | (0))`.
 * 펼친 결과가 또 다른 호출을 담을 수 있어서 더 이상 안 바뀔 때까지 돈다.
 */
function expandCalls(expr, functions, depth = 0) {
  if (!functions || functions.size === 0) return expr
  if (depth > 16) throw new Error(`매크로가 계속 돈다: ${expr}`)
  let changed = false
  const out = expr.replace(/\b(\w+)\s*\(([^()]*)\)/g, (whole, name, argText) => {
    const fn = functions.get(name)
    if (!fn) return whole
    const given = argText.split(',').map((s) => s.trim())
    if (given.length !== fn.params.length) return whole
    changed = true
    const bound = new Map(fn.params.map((p, i) => [p, given[i]]))
    return `(${fn.body.replace(/\b\w+\b/g, (w) => bound.get(w) ?? w)})`
  })
  return changed ? expandCalls(out, functions, depth + 1) : out
}

function tokenize(expr) {
  const out = []
  const re = /\s*(0x[0-9a-fA-F]+|\d+|\w+|\|\||&&|<<|>>|[=!<>]=|[-+*/%&|^~!()<>.])/g
  let at = 0
  for (let m = re.exec(expr); m; m = re.exec(expr)) {
    if (m.index !== at) throw new Error(`못 읽는 식: ${expr}`)
    at = re.lastIndex
    out.push(m[1])
  }
  if (expr.slice(at).trim() !== '') throw new Error(`못 읽는 식: ${expr}`)
  return out
}

/**
 * @param resolve 심볼 → 값. 못 풀면 undefined
 * @param here `.`의 값. null이면 `.`을 쓸 수 없다
 * @param lenient 1패스 — 아직 모르는 라벨을 0으로 본다
 */
function evaluate(expr, resolve, here, lenient = false) {
  const tokens = tokenize(expr)
  let i = 0
  const peek = () => tokens[i]

  const atom = () => {
    const t = tokens[i++]
    if (t === undefined) throw new Error(`식이 끊겼다: ${expr}`)
    if (t === '(') {
      const v = binary(0)
      if (tokens[i++] !== ')') throw new Error(`괄호가 안 닫혔다: ${expr}`)
      return v
    }
    if (t === '-') return -atom()
    if (t === '+') return atom()
    if (t === '~') return ~atom()
    if (t === '!') return atom() === 0 ? 1 : 0
    if (t === '.') {
      if (here === null) throw new Error(`여기서는 .을 쓸 수 없다: ${expr}`)
      return here
    }
    if (/^0x[0-9a-fA-F]+$/.test(t)) return Number.parseInt(t, 16)
    if (/^\d+$/.test(t)) return Number(t)
    const v = resolve(t)
    if (v !== undefined) return v
    if (lenient) return 0 // 앞을 내다보는 라벨 — 1패스에서는 폭만 맞으면 된다
    throw new Error(`모르는 심볼: ${t}`)
  }

  const binary = (level) => {
    if (level >= PRECEDENCE.length) return atom()
    let left = binary(level + 1)
    while (PRECEDENCE[level].includes(peek())) {
      const op = tokens[i++]
      const right = binary(level + 1)
      switch (op) {
        case '||': left = left || right ? 1 : 0; break
        case '&&': left = left && right ? 1 : 0; break
        case '==': left = left === right ? 1 : 0; break
        case '!=': left = left !== right ? 1 : 0; break
        case '<': left = left < right ? 1 : 0; break
        case '>': left = left > right ? 1 : 0; break
        case '<=': left = left <= right ? 1 : 0; break
        case '>=': left = left >= right ? 1 : 0; break
        case '|': left |= right; break
        case '^': left ^= right; break
        case '&': left &= right; break
        case '<<': left <<= right; break
        case '>>': left >>= right; break
        case '+': left += right; break
        case '-': left -= right; break
        case '*': left *= right; break
        case '%': left %= right; break
        default: left = Math.trunc(left / right)
      }
    }
    return left
  }

  const value = binary(0)
  if (i !== tokens.length) throw new Error(`식이 남았다: ${expr}`)
  return value
}

// ── 조립 ─────────────────────────────────────────────────────────────────────

const WIDTH = { '.byte': 1, '.short': 2, '.hword': 2, '.long': 4, '.word': 4 }

/**
 * `.s` 하나를 바이트로.
 *
 * 2패스다. 1패스에서 라벨 주소를 정하고(상대 오프셋은 폭만 알면 되니 0으로 둔다),
 * 2패스에서 실제 값을 채운다.
 *
 * @returns {{bytes: Buffer, labels: Map<string, number>}}
 */
function assemble(file, { macros, presets }, generated) {
  const text = stripComments(fs.readFileSync(file, 'utf8'))
  const { defines, functions } = collectDefines(file)
  const labels = new Map()
  /** `.set`으로 만드는 어셈블러 변수 */
  let vars = new Map()

  /** 인자 있는 매크로를 먼저 펼치고 계산한다 */
  const evalExpr = (expr, here, lenient) =>
    evaluate(expandCalls(expr, functions), lookup, here, lenient)

  const lookup = (name) => {
    if (vars.has(name)) return vars.get(name)
    if (labels.has(name)) return labels.get(name)
    if (generated.has(name)) return generated.get(name)
    const d = defines.get(name)
    // `#define`은 다른 이름을 가리킬 수 있다 (LOCAL_VAR_X → VAR_0x8002)
    if (d !== undefined) return evaluate(expandCalls(d, functions), lookup, null)
    return undefined
  }

  const run = (emitting) => {
    vars = new Map([['TRUE', 1], ['FALSE', 0]])
    for (const [name, value] of presets) vars.set(name, evaluate(value, lookup, null, true))
    const bytes = emitting ? [] : null
    let at = 0
    const put = (value, size) => {
      if (emitting) {
        for (let k = 0; k < size; k++) bytes.push((value >> (k * 8)) & 0xff)
      }
      at += size
    }

    /** `.if` 중첩 상태. false가 하나라도 있으면 방출하지 않는다 */
    const cond = []
    const live = () => cond.every((c) => c.emit)

    const exec = (line, args) => {
      // 매크로 인자 치환. `\name`을 그대로 갈아끼운다
      const src = args
        ? line.replace(/\\(\w+)/g, (_, n) => (n in args ? args[n] : `\\${n}`))
        : line
      const trimmed = src.trim()
      if (!trimmed) return

      // `.ifnb`/`.ifb` — 인자가 넘어왔는지만 본다. 값은 계산하지 않는다
      const blank = /^\.if(n?)b\s*(.*)$/.exec(trimmed)
      if (blank) {
        const given = blank[2].trim() !== ''
        const taken = live() ? (blank[1] === 'n' ? given : !given) : false
        cond.push({ emit: live() && taken, taken })
        return
      }
      const ifm = /^\.if\s+(.*)$/.exec(trimmed)
      if (ifm) {
        // 죽은 갈래의 조건은 계산하지 않는다 — 거기 있는 심볼은 유효하지 않을 수 있다
        const taken = live() ? test(ifm[1]) : false
        cond.push({ emit: live() && taken, taken })
        return
      }
      if (trimmed === '.else') {
        const top = cond[cond.length - 1]
        if (!top) throw new Error('짝 없는 .else')
        top.emit = !top.taken && cond.slice(0, -1).every((c) => c.emit)
        return
      }
      if (trimmed === '.endif') {
        if (!cond.pop()) throw new Error('짝 없는 .endif')
        return
      }
      if (!live()) return

      if (trimmed.startsWith('.error')) throw new Error(`.error 도달: ${trimmed}`)

      const setm = /^\.(?:set|equiv)\s+(\w+)\s*,\s*(.*)$/.exec(trimmed)
      if (setm) {
        vars.set(setm[1], evalExpr(setm[2], null, !emitting))
        return
      }
      const align = /^\.balign\s+(\d+)/.exec(trimmed)
      if (align) {
        const n = Number(align[1])
        while (n > 0 && at % n !== 0) put(0, 1)
        return
      }
      const label = /^(\w+):$/.exec(trimmed)
      if (label) {
        labels.set(label[1], at)
        return
      }
      const emit = /^(\.\w+)\s+(.*)$/.exec(trimmed)
      if (emit && WIDTH[emit[1]] !== undefined) {
        const size = WIDTH[emit[1]]
        for (const piece of splitArgs(emit[2])) {
          put(emitting ? evalExpr(piece, at, false) : 0, size)
        }
        return
      }

      const call = /^(\w+)\s*(.*)$/.exec(trimmed)
      if (!call) throw new Error(`못 읽는 줄: ${trimmed}`)
      const macro = macros.get(call[1])
      if (!macro) throw new Error(`모르는 매크로: ${call[1]}`)
      const given = splitArgs(call[2])
      const bound = {}
      // 안 넘긴 인자는 GNU as에서 **빈 문자열**이다 (`.ifnb`가 그걸 본다).
      // 실제로 값이 필요한 자리면 나중에 식 계산에서 걸린다
      macro.params.forEach((p, i) => {
        const v = given[i] !== undefined && given[i] !== '' ? given[i] : p.def
        bound[p.name] = v ?? ''
      })
      for (const bodyLine of macro.body) exec(bodyLine, bound)
    }

    const test = (expr) => evalExpr(expr, null, !emitting) !== 0

    for (const line of text.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#define')) continue
      if (t.startsWith('#include')) {
        // 대부분의 include는 이름표라 위에서 이미 모았다. 둘만 어셈블러 내용이다
        const spec = /^#include\s+"([^"]+)"/.exec(t)
        for (const asmLine of (spec && virtualAsm(spec[1], generated)) ?? []) {
          exec(asmLine, null)
        }
        continue
      }
      exec(t, null)
    }
    if (cond.length) throw new Error('안 닫힌 .if')
    return { bytes: emitting ? Buffer.from(bytes) : null, size: at }
  }

  run(false) // 1패스 — 라벨 주소
  const { bytes } = run(true)
  return { bytes, labels }
}

/**
 * 매크로 호출의 인자 나누기.
 *
 * GNU as는 쉼표뿐 아니라 **공백으로도** 인자를 나눈다. 매크로 파일이 실제로
 * 그렇게 쓴다:
 *
 *   DrawSignpostInstantMessage \messageID SIGNPOST_TYPE_MAP   ← 쉼표가 없다
 *
 * 그런데 산술식은 공백을 품는다:
 *
 *   CheckMetFurnitureRequirements VILLA_FURNITURE_WALL_CLOCK + 1, VAR_RESULT
 *
 * 그래서 공백은 나누되 **연산자에 붙은 공백은 안 나눈다**. 이 규칙이 맞는지는
 * 추측으로 두지 않는다 — 1124개를 조립해 롬 바이트와 맞춰서 확인한다 (scripts.js).
 */
function splitArgs(text) {
  const out = []
  let cur = ''
  let pendingBreak = false
  /** 방금 본 것이 이항 연산자였나 — 그러면 다음 공백은 나누지 않는다 */
  let afterOperator = false
  /** `RGB(0, 0, 0)` 안의 쉼표는 인자 구분이 아니다 */
  let depth = 0

  const flush = () => {
    if (cur.trim() !== '') out.push(cur.trim())
    cur = ''
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      flush()
      pendingBreak = false
      afterOperator = false
      continue
    }
    if (ch === ' ' || ch === '\t') {
      if (cur.trim() !== '') pendingBreak = true
      continue
    }
    // `=`도 붙여 둔다 — 기본값 있는 매개변수를 공백으로 띄워 쓴다
    // (`.macro FadeScreenOut frames = FADE_SCREEN_SPEED_FAST, color = COLOR_BLACK`)
    const isOperator = '+-*/='.includes(ch)
    if (pendingBreak && !isOperator && !afterOperator) flush()
    pendingBreak = false
    afterOperator = isOperator
    cur += ch
  }
  flush()
  return out
}

/**
 * `data/scripts/scrcmd.h`의 `ScriptCommand(NAME, ...)` 나열.
 * 어셈블러에서는 `inc_enum`으로 0부터 번호가 붙는다 — 그게 곧 opcode다.
 */
function readScriptCommandEnum(text) {
  const out = []
  let next = 0
  for (const m of text.matchAll(/^ScriptCommand\(\s*(\w+)\s*,/gm)) out.push([m[1], String(next++)])
  return out
}

module.exports = { assemble, readMacros, readGenerated, stripComments, DECOMP }
