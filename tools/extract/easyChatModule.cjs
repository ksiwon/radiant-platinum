'use strict'
// 낱말 고르기의 낱말 표 → src/engine/world/easyChatTable.ts (DATA.md §2.29)
//
//     pnpm gen:easychat
//
// ⚠️ **왜 소스에 굽는가.** 낱말 **글자**는 롬 뱅크 열하나에 있지만
// (`pnpm extract:dialogue`가 싣는다) **어느 낱말이 어느 무리에 드는가**는
// 코드 안의 표다 (`easy_chat_word_list.c`의 `sGroupData`). 어느 NARC에도 없다.
//
// 낱말 번호는 **뱅크 열하나를 이어 붙인 통번호**다 (`EasyChatWord_FromBankAndEntry`):
//
//     종족명 → 기술명 → 타입 → 특성 → 트레이너 → 사람 → 인사
//            → 생활 → 기분 → 어려운말 → 유니언
//
// 그래서 종족 낱말은 종족 번호와 같고, 기술 낱말은 496 + 기술 번호다.
//
// ⚠️ **무리마다 여는 조건이 다르다** (`EasyChatWordList_Process*`):
//
//     포켓몬·포켓몬2   도감에서 **본 적이 있는** 종만
//     기술·기술2       **명예의 전당에 오른 뒤**에 통째로 열린다
//     어려운말         하나씩 풀린다 (32비트)
//     인사             다른 나라 말 인사만 풀어야 뜬다
//     나머지           늘 열려 있다
//
// ⚠️ **무리 표의 끝은 `WORD_NONE`이다.** 원작이 길이를 `NELEMS(…) - 1`로
// 넘기기 때문인데, 그 칸을 못 알아보고 뒤에서 하나 잘라 내면 **진짜 낱말이
// 하나 사라진다** — 실제로 유니언 낱말이 스물셋인데 스물둘이 나왔다.
// 지금은 포켓몬 무리 둘의 합이 **정확히 493**인 것이 이 파싱의 증거다.
//
// ⚠️ **가나다 차례표는 안 굽는다.** 원작의 것은 알파벳 26칸이고
// (`sWordsByAlphabet`) 한국어 롬은 그 자리가 「가나다 모드」다 — 영어 첫 글자로
// 묶은 표를 한국어 화면에 올릴 수가 없다. 우리는 **화면에서 그 로케일 이름으로**
// 정렬한다.
//
// ⚠️ **여기 담기는 것은 번호뿐이다.** 낱말 글자는 한 자도 안 담는다.
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/engine/world/easyChatTable.ts')

const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')
const readJson = (p) => JSON.parse(read(p))

/** `generated/*.txt`를 줄 차례대로 푼다 */
function enumValues(file) {
  const out = new Map()
  let next = 0
  for (const raw of read(file).split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('//')) continue
    const eq = line.indexOf('=')
    if (eq < 0) { out.set(line, next); next++; continue }
    const name = line.slice(0, eq).trim()
    const expr = line.slice(eq + 1).trim()
    const value = /^-?\d+$/.test(expr) ? Number(expr)
      : /^0x/i.test(expr) ? Number.parseInt(expr, 16)
        : out.get(expr)
    if (value === undefined) throw new Error(`열거형을 못 푼다: ${line}`)
    out.set(name, value)
    next = value + 1
  }
  return out
}

/** `static const u16 name[] = { … };` 의 몸통 */
function arrayBody(src, name) {
  const at = src.indexOf(`${name}[] = {`)
  if (at < 0) throw new Error(`${name}을 못 찾았다`)
  const open = src.indexOf('{', at)
  let depth = 0, i = open
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) break
  }
  return src.slice(open + 1, i)
}

// ── 뱅크 열하나를 이어 붙인다 ────────────────────────────────────────────────
const speciesValues = enumValues('generated/species.txt')
const moveValues = enumValues('generated/moves.txt')
const abilityValues = enumValues('generated/abilities.txt')
const typeValues = enumValues('generated/pokemon_types.txt')

// ⚠️ **항목 수는 롬에서 잰 것이 정본이다** (`raw/work/textBanks.json`) —
// `sTextBankEntryCounts`가 곧 그 수이고, 한 칸이라도 어긋나면 낱말 번호가
// 통째로 밀린다. 디컴프의 원문 json이 있는 뱅크는 그것과도 맞대 본다.
const romBanks = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/work/textBanks.json'), 'utf8'))
const romCount = (name) => {
  const hit = Object.values(romBanks).find((b) => b.name === name)
  if (!hit) throw new Error(`롬 뱅크 표에 ${name}이 없다`)
  return hit.entries.us
}
const BANKS = [
  { key: 'species', rom: 'species_name' },
  { key: 'move', rom: 'move_names_uppercase' },
  { key: 'type', rom: 'pokemon_type_names', res: 'pokemon_type_names' },
  { key: 'ability', rom: 'ability_names_uppercase', res: 'ability_names_uppercase' },
  { key: 'trainerWords', rom: 'trainer_words', res: 'trainer_words' },
  { key: 'peopleWords', rom: 'people_words', res: 'people_words' },
  { key: 'greetings', rom: 'greetings', res: 'greetings' },
  { key: 'lifestyleWords', rom: 'lifestyle_words', res: 'lifestyle_words' },
  { key: 'feelings', rom: 'feelings', res: 'feelings' },
  { key: 'toughWords', rom: 'tough_words', res: 'tough_words' },
  { key: 'unionWords', rom: 'union_words', res: 'union_words' },
]
let base = 0
for (const bank of BANKS) {
  bank.count = romCount(bank.rom)
  if (bank.res) {
    const inDecomp = readJson(`res/text/${bank.res}.json`).messages.length
    if (inDecomp !== bank.count) {
      throw new Error(`${bank.key}가 롬은 ${bank.count}개, 디컴프는 ${inDecomp}개다`)
    }
  }
  bank.base = base
  base += bank.count
}
const WORD_COUNT = base

/** `PEOPLE_WORD(PeopleWords_Text_Adult)` 같은 이름을 통번호로 */
const bankOf = (key) => BANKS.find((b) => b.key === key)
const entryIndex = {}
for (const [key, file] of Object.entries({
  trainerWords: 'trainer_words', peopleWords: 'people_words', greetings: 'greetings',
  lifestyleWords: 'lifestyle_words', feelings: 'feelings', toughWords: 'tough_words',
  unionWords: 'union_words',
})) {
  const map = new Map()
  for (const [i, m] of readJson(`res/text/${file}.json`).messages.entries()) map.set(m.id, i)
  entryIndex[key] = map
}

const MACRO = {
  MOVE_WORD: (arg) => bankOf('move').base + must(moveValues, arg),
  TYPE_WORD: (arg) => bankOf('type').base + must(typeValues, arg),
  ABILITY_WORD: (arg) => bankOf('ability').base + must(abilityValues, arg),
  TRAINER_WORD: (arg) => bankOf('trainerWords').base + mustEntry('trainerWords', arg),
  PEOPLE_WORD: (arg) => bankOf('peopleWords').base + mustEntry('peopleWords', arg),
  GREETING_WORD: (arg) => bankOf('greetings').base + mustEntry('greetings', arg),
  LIFESTYLE_WORD: (arg) => bankOf('lifestyleWords').base + mustEntry('lifestyleWords', arg),
  FEELINGS_WORD: (arg) => bankOf('feelings').base + mustEntry('feelings', arg),
  TOUGH_WORD: (arg) => bankOf('toughWords').base + mustEntry('toughWords', arg),
  UNION_WORD: (arg) => bankOf('unionWords').base + mustEntry('unionWords', arg),
}

function must(map, name) {
  const v = map.get(name)
  if (v === undefined) throw new Error(`상수 ${name}을 못 푼다`)
  return v
}
function mustEntry(key, id) {
  const v = entryIndex[key].get(id)
  if (v === undefined) throw new Error(`${key} 뱅크에 ${id}가 없다`)
  return v
}

/**
 * 낱말 배열 하나를 통번호 목록으로.
 *
 * ⚠️ **마지막 칸은 `WORD_NONE`이고 그것이 곧 길이다** — 원작이 `NELEMS(…) - 1`을
 * 넘긴다. 그 칸을 못 알아보면 진짜 낱말 하나를 잘라 먹는다 (유니언 낱말이
 * 스물셋인데 스물둘이 나왔던 자리다).
 */
function words(name, body) {
  const out = []
  for (const m of body.matchAll(/\bWORD_NONE\b|\bDUPLICATE_WORDS\b|(\w+)\s*\(\s*(\w+)\s*\)|\b(SPECIES_\w+)\b/g)) {
    if (m[0] === 'WORD_NONE') break
    // ⚠️ **무리 표에는 같은 뜻 묶음이 없다** — `DUPLICATE_WORDS`는 가나다
    // 차례표에만 나오고 우리는 그쪽을 안 굽는다. 나오면 가정이 깨진 것이다
    if (m[0] === 'DUPLICATE_WORDS') throw new Error(`${name}에 같은 뜻 묶음이 있다 — 접는 규칙이 필요하다`)
    if (m[3] !== undefined) { out.push(must(speciesValues, m[3])); continue }
    const fn = MACRO[m[1]]
    if (!fn) throw new Error(`모르는 매크로 ${m[1]}`)
    out.push(fn(m[2]))
  }
  if (out.length === 0) throw new Error(`${name}이 비어 있다`)
  return out
}

const listSrc = read('src/easy_chat_word_list.c')
const defs = read('include/applications/easy_chat/defs.h')

/** `sGroupData`의 차례가 곧 무리 번호다 */
const groupTable = arrayBody(listSrc, 'sGroupData')
const GATE = {
  EasyChatWordList_ProcessPokemon: 'seen',
  EasyChatWordList_ProcessMoves: 'completed',
  EasyChatWordList_ProcessToughWords: 'tough',
  EasyChatWordList_ProcessGreetings: 'greeting',
  EasyChatWordList_ProcessGeneric: 'always',
}
const groups = []
for (const m of groupTable.matchAll(/\[(GROUP_\w+)\]\s*=\s*\{\s*(\w+),\s*(\w+),/g)) {
  const gate = GATE[m[2]]
  if (!gate) throw new Error(`모르는 거르개 ${m[2]}`)
  groups.push({ name: m[1], gate, array: m[3] })
}

const groupEnum = defs.slice(defs.indexOf('enum EasyChatGroup'))
const groupOrder = [...groupEnum.slice(0, groupEnum.indexOf('};')).matchAll(/^\s*(GROUP_\w+)/gm)]
  .map((m) => m[1]).filter((n) => n !== 'GROUP_MODE_CANCEL_INDEX')
if (groupOrder.length !== groups.length) {
  throw new Error(`무리가 열거형에는 ${groupOrder.length}개, 표에는 ${groups.length}개다`)
}
for (const [i, name] of groupOrder.entries()) {
  if (groups[i].name !== name) throw new Error(`무리 ${i}번이 ${groups[i].name}인데 열거형은 ${name}이다`)
}

for (const g of groups) {
  g.words = words(g.array, arrayBody(listSrc, g.array))
  for (const w of g.words) {
    if (!Number.isInteger(w) || w < 0 || w >= WORD_COUNT) {
      throw new Error(`${g.name}에 범위 밖 낱말 ${w}가 있다 (0~${WORD_COUNT - 1})`)
    }
  }
}

/** 다른 나라 말 인사는 여기까지가 풀어야 뜨는 것이다 */
const HOLA = bankOf('greetings').base + mustEntry('greetings', 'Greetings_Text_Hola')

const bankLines = BANKS.map((b) => `  { key: '${b.key}', base: ${b.base}, count: ${b.count} },`).join('\n')
const groupLines = groups.map((g) =>
  `  {\n    name: '${g.name.slice('GROUP_'.length).toLowerCase()}',\n    gate: '${g.gate}',\n    words: [${g.words.join(', ')}],\n  },`).join('\n')

const out = `// 낱말 고르기의 낱말 표 — 자동 생성 (\`pnpm gen:easychat\`)
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 \`tools/extract/easyChatModule.cjs\`가
// 다시 만든다. 근거와 재는 법은 DATA.md §2.29.

/** 아무 낱말도 아님 (\`WORD_NONE\`) */
export const EASY_CHAT_WORD_NONE = 0xffff

/** 낱말 번호의 위쪽 끝. 뱅크 열하나를 이어 붙인 길이다 */
export const EASY_CHAT_WORD_COUNT = ${WORD_COUNT}

export type EasyChatBankKey =
${BANKS.map((b) => `  | '${b.key}'`).join('\n')}

interface EasyChatBank {
  readonly key: EasyChatBankKey
  /** 이 뱅크의 첫 낱말 번호 */
  readonly base: number
  readonly count: number
}

/**
 * 낱말 번호를 나누는 뱅크 열하나 (\`sTextBanks\`).
 *
 * ⚠️ **차례가 곧 번호다.** 종족 낱말은 종족 번호와 같고, 기술 낱말은
 * ${bankOf('move').base} + 기술 번호다 — 한 칸이라도 밀리면 낱말이 통째로 어긋난다
 */
export const EASY_CHAT_BANKS: readonly EasyChatBank[] = [
${bankLines}
]

/** 무리를 여는 조건 (\`EasyChatWordList_Process*\`) */
type EasyChatGate = 'always' | 'seen' | 'completed' | 'tough' | 'greeting'

export interface EasyChatGroup {
  readonly name: string
  readonly gate: EasyChatGate
  readonly words: readonly number[]
}

/**
 * 무리 ${groups.length}개 (\`sGroupData\`).
 *
 * ⚠️ **차례가 원작 그대로다** — 영어 알파벳 차례로 적혀 있다. 화면은 그
 * 로케일 이름으로 다시 정렬한다 (한국어 롬의 두 번째 모드가 「가나다 모드」다)
 */
export const EASY_CHAT_GROUPS: readonly EasyChatGroup[] = [
${groupLines}
]

/**
 * 다른 나라 말 인사의 마지막 낱말 번호.
 *
 * ⚠️ **여기까지만 풀어야 뜬다** (\`EasyChatWordList_ProcessGreetings\`) — 그 뒤의
 * 인사는 처음부터 열려 있다. 인사 무리를 통째로 잠그면 「…」조차 못 고른다
 */
export const EASY_CHAT_LAST_LANGUAGE_GREETING = ${HOLA}

/** 어려운 낱말은 32비트 하나로 하나씩 풀린다 (\`unlockedToughWordBits\`) */
export const EASY_CHAT_TOUGH_WORD_COUNT = ${bankOf('toughWords').count}
`

fs.writeFileSync(OUT, out)
console.log(`easyChatTable.ts — 낱말 ${WORD_COUNT}칸 · 무리 ${groups.length}개 · 뱅크 ${BANKS.length}개`)
for (const g of groups) console.log(`  ${g.name.padEnd(18)} ${String(g.words.length).padStart(4)}개  ${g.gate}`)
