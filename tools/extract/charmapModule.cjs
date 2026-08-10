'use strict'
// charmap.txt → src/import/platinum/charmap.ts (연속 구간을 한 문자열로 눌러 담는다)
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')

const lines = fs.readFileSync(path.join(ROOT, 'tools/spike/charmap.txt'), 'utf8').split('\n')
let inCmd = false
const chars = new Map()
const cmds = new Map()
for (const raw of lines) {
  const t = raw.replace(/\r$/, '')
  if (!t) continue
  if (t.startsWith('//')) { if (/function codes/i.test(t)) inCmd = true; continue }
  const eq = t.indexOf('=')
  if (eq < 0) continue
  const code = Number.parseInt(t.slice(0, eq).trim(), 16)
  if (Number.isNaN(code)) continue
  let v = t.slice(eq + 1)
  if (v === '\\x0000') v = ''
  if (inCmd) { cmds.set(code, v.replace(/^\{|\}$/g, '')); continue }
  chars.set(code, v.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\f/g, '\f'))
}

const codes = [...chars.keys()].sort((a, b) => a - b)
// 값이 딱 UTF-16 한 칸인 것만 구간에 담는다. 나머지는 따로 적는다
const odd = new Map()
const runs = []
let cur = null
for (const c of codes) {
  const v = chars.get(c)
  if ([...v].length !== 1 || v.length !== 1) { odd.set(c, v); cur = null; continue }
  if (cur && cur.start + cur.text.length === c) { cur.text += v; continue }
  cur = { start: c, text: v }
  runs.push(cur)
}

const esc = (s) => JSON.stringify(s)
const out = `// Platinum 문자표 — 롬 코드 → 유니코드 (DATA.md §2.11)
//
// \`tools/spike/charmap.txt\`를 눌러 담은 것이다. 그 파일은 사람이 읽는 정본이고
// 여기 있는 것은 브라우저가 읽는 같은 표다 — \`charmap.test.ts\`가 둘을 대조한다.
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 \`tools/spike/charmap.txt\`이고,
// \`pnpm gen:charmap\`이 이 파일을 다시 만든다.
//
// 한글 구역 0x400~0x40F는 디컴프 표와 한 칸 다르다. 실측으로 갈랐다 —
// 가디안(282)이 우리 표로는 \`가디안\`, 디컴프 표로는 \`각디안\`이 된다.

/** 연속한 코드 구간: [시작 코드, 그 자리부터 한 글자씩] */
const RUNS: readonly (readonly [number, string])[] = [
${runs.map((r) => `  [${r.start}, ${esc(r.text)}],`).join('\n')}
]

/** 한 글자가 아닌 것 (빈 값·줄바꿈 종류) */
const ODD: readonly (readonly [number, string])[] = [
${[...odd].map(([c, v]) => `  [${c}, ${esc(v)}],`).join('\n')}
]

/** \`0xFFFE\` 뒤에서만 뜻이 있는 함수 코드 */
const COMMANDS: readonly (readonly [number, string])[] = [
${[...cmds].map(([c, v]) => `  [${c}, ${esc(v)}],`).join('\n')}
]

export interface Charmap {
  chars: ReadonlyMap<number, string>
  commands: ReadonlyMap<number, string>
}

let cached: Charmap | null = null

/**
 * 표를 편다. 한 번만 편다 — 2,876칸이라 매번 펴면 그룹마다 되풀이한다.
 *
 * ⚠️ **문자표와 함수표를 한 맵에 합치지 않는다.** 함수 코드는 \`0xFFFE\` 뒤에서만
 * 의미가 있는데 같이 넣으면 문자를 덮어쓴다 — 0x600/0x602/0x603의 됨·됩·됫이
 * 실제로 \`{STRVAR_6}\`·\`{UNK_602}\`에 가려진 적이 있다.
 */
export function charmap(): Charmap {
  if (cached) return cached
  const chars = new Map<number, string>()
  for (const [start, text] of RUNS) {
    for (let i = 0; i < text.length; i++) chars.set(start + i, text[i]!)
  }
  for (const [code, value] of ODD) chars.set(code, value)
  cached = { chars, commands: new Map(COMMANDS) }
  return cached
}

/** 표에 든 문자 수. 시험이 이걸로 표가 다 실렸는지 본다 */
export const CHAR_COUNT = ${chars.size}
`
fs.writeFileSync(path.join(ROOT, 'src/import/platinum/charmap.ts'), out, 'utf8')
console.log(`chars ${chars.size} · runs ${runs.length} · odd ${odd.size} · cmds ${cmds.size} · ${(out.length / 1024).toFixed(1)}KB`)
