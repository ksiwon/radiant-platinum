'use strict'
// 게임 기록 표와 트레이너 스코어 표 → src/engine/world/gameRecordsTable.ts (PARITY §7.5)
//
//     pnpm gen:records
//
// ⚠️ **왜 소스에 굽는가.** 둘 다 롬 자료가 아니라 **코드 안의 표**다
// (`game_records.c`의 `sUsesHighLimit`와 `sTrainerScoreIncrements`). 어느 기록이
// 999,999에서 멈추고 어느 것이 999,999,999까지 가는지, 어떤 일이 스코어를 몇
// 올리는지가 어느 NARC에도 안 적혀 있다.
//
// ⚠️ **여기 담기는 것은 번호와 수뿐이다.** 이름도 글도 한 바이트도 안 담는다.
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/engine/world/gameRecordsTable.ts')

const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')

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
    const value = Number(line.slice(eq + 1).trim())
    out.set(name, value)
    next = value + 1
  }
  return out
}

/** `#define NAME 값` */
function defineValue(src, name) {
  const m = new RegExp(`#define\\s+${name}\\s+(\\S+)`).exec(src)
  if (!m) throw new Error(`#define ${name}이 없다`)
  return Number(m[1])
}

/** `static ... sName[...] = { [KEY] = 값, ... };` — 지정 초기화만 읽는다 */
function designated(src, name, names, fill = 0) {
  const at = src.indexOf(`${name}[`)
  if (at < 0) throw new Error(`${name}을 못 찾는다`)
  const open = src.indexOf('{', at)
  const close = src.indexOf('};', open)
  const body = src.slice(open + 1, close)
  const out = new Array(names.size).fill(fill)
  for (const m of body.matchAll(/\[([A-Z0-9_]+)\]\s*=\s*([A-Za-z0-9_]+)/g)) {
    const id = names.get(m[1])
    if (id === undefined) throw new Error(`${name}: 모르는 이름 ${m[1]}`)
    out[id] = m[2] === 'TRUE' ? 1 : m[2] === 'FALSE' ? 0 : Number(m[2])
  }
  return out
}

function main() {
  const records = enumValues('generated/game_records.txt')
  const events = enumValues('generated/trainer_score_events.txt')
  const src = read('src/game_records.c')
  const header = read('include/game_records.h')

  const maxRecords = records.get('MAX_RECORDS')
  const numU32 = defineValue(header, 'NUM_U32_RECORDS')
  const limits = { u32: [defineValue(header, 'LOW_LIMIT_U32'), defineValue(header, 'HIGH_LIMIT_U32')],
    u16: [defineValue(header, 'LOW_LIMIT_U16'), defineValue(header, 'HIGH_LIMIT_U16')] }

  // 이름표에서 `MAX_RECORDS`를 뺀 것이 실제 기록 수다
  const recordNames = new Map([...records].filter(([k]) => k !== 'MAX_RECORDS'))
  const maxEvents = events.get('MAX_TRAINER_SCORE_EVENTS') ?? events.size
  const eventNames = new Map([...events].filter(([k]) => !k.startsWith('MAX_')))

  const high = designated(src, 'sUsesHighLimit', recordNames)
  const increments = designated(src, 'sTrainerScoreIncrements', eventNames)

  if (high.length !== maxRecords) throw new Error(`상한 표가 ${high.length}칸이다 — ${maxRecords}이어야 한다`)

  const out = `// 게임 기록과 트레이너 스코어의 표 (PARITY §7.5)
//
// ⚠️ **손으로 고치지 않는다** — \`pnpm gen:records\`가 디컴프에서 다시 만든다
// (\`tools/extract/gameRecordsModule.cjs\`).

/** 기록 칸 수 (\`MAX_RECORDS\`) */
export const MAX_RECORDS = ${maxRecords}

/**
 * 앞 ${numU32}칸이 u32고 나머지가 u16이다 (\`NUM_U32_RECORDS\`).
 *
 * ⚠️ **상한이 그 폭에서 갈린다** — u32는 ${limits.u32[0].toLocaleString('en-US')}이나
 * ${limits.u32[1].toLocaleString('en-US')}, u16은 ${limits.u16[0].toLocaleString('en-US')}이나 ${limits.u16[1]}이다
 */
export const NUM_U32_RECORDS = ${numU32}

export const LOW_LIMIT_U32 = ${limits.u32[0]}
export const HIGH_LIMIT_U32 = ${limits.u32[1]}
export const LOW_LIMIT_U16 = ${limits.u16[0]}
export const HIGH_LIMIT_U16 = ${limits.u16[1]}

/**
 * 기록마다 높은 상한을 쓰는가 (\`sUsesHighLimit\`).
 *
 * 자리가 곧 기록 번호다. ⚠️ **폭과 따로다** — u16 칸인데 높은 상한(0xFFFF)을
 * 쓰는 것도, u32 칸인데 낮은 상한(999,999)을 쓰는 것도 있다
 */
export const USES_HIGH_LIMIT: readonly boolean[] = [
${chunk(high.map((v) => (v ? 'true' : 'false')), 8)}
]

/** 트레이너 스코어 사건 수 (\`MAX_TRAINER_SCORE_EVENTS\`) */
export const MAX_TRAINER_SCORE_EVENTS = ${maxEvents}

/**
 * 그 일이 스코어를 몇 올리는가 (\`sTrainerScoreIncrements\`).
 *
 * 자리가 곧 사건 번호다. 1(나무열매 수확)부터 10,000(전국도감 상장)까지 있다
 */
export const TRAINER_SCORE_INCREMENT: readonly number[] = [
${chunk(increments.map(String), 12)}
]
`
  fs.writeFileSync(OUT, out.replace(/\n/g, '\r\n'))

  const kinds = new Map()
  for (const v of increments) kinds.set(v, (kinds.get(v) ?? 0) + 1)
  console.log(`gameRecordsTable.ts — 기록 ${maxRecords}칸 (u32 ${numU32} · u16 ${maxRecords - numU32})`)
  console.log(`  높은 상한 ${high.filter(Boolean).length}칸 · 낮은 상한 ${high.filter((v) => !v).length}칸`)
  console.log(`  스코어 사건 ${maxEvents} · 값 ${[...kinds.keys()].sort((a, b) => a - b).join('·')}`)
}

/** 한 줄에 n개씩 */
function chunk(values, n) {
  const lines = []
  for (let i = 0; i < values.length; i += n) lines.push('  ' + values.slice(i, i + n).join(', ') + ',')
  return lines.join('\n')
}

if (require.main === module) main()
