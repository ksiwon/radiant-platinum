'use strict'
// 처음부터 심겨 있는 밭 118 → src/engine/world/berryInit.ts (DATA.md §2.12.1)
//
//     pnpm gen:berryInit
//
// ⚠️ **왜 소스에 굽는가.** 이 표는 롬 자료가 아니라 **코드 안의 표**다
// (`include/data/berry_init.h`의 `sBerryInitTable`). 배치표에는 밭 객체 118개가
// 있고 저마다 밭 번호를 들고 있지만, 「그 밭에 무엇이 얼마나 열려 있는가」는
// 어디에도 안 적혀 있다 — 트레이너 조우곡이 그랬던 자리와 같다
// (`trainerBgmModule.cjs`).
//
// ⚠️ **여기 담기는 것은 번호 두 줄뿐이다.** 이름도 글도 한 바이트도 안 담는다.
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/engine/world/berryInit.ts')

const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')

/**
 * `generated/*.txt`를 C 열거형으로 푼다.
 *
 * ⚠️ **줄 번호가 값이 아니다.** `NAME = 값` 줄이 뒤의 번호를 통째로 옮긴다
 */
function enumValues(file) {
  const out = new Map()
  let next = 0
  for (const raw of read(file).split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('//')) continue
    const eq = line.indexOf('=')
    if (eq < 0) {
      out.set(line, next)
      next++
      continue
    }
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

function main() {
  const items = enumValues('generated/items.txt')

  const need = (name) => {
    const v = items.get(name)
    if (v === undefined) throw new Error(`모르는 도구: ${name}`)
    return v
  }

  // `constants/items.h`의 네 경계. 세는 법이 어긋나면 여기서 걸린다
  const firstBerry = need('ITEM_CHERI_BERRY')
  const lastBerry = need('ITEM_ROWAP_BERRY')
  const firstMulch = need('ITEM_GROWTH_MULCH')
  const lastMulch = need('ITEM_GOOEY_MULCH')
  const berryCount = lastBerry - firstBerry + 1
  const mulchCount = lastMulch - firstMulch + 1
  if (berryCount !== 64) throw new Error(`나무열매가 ${String(berryCount)}가지다 — 64여야 한다`)
  if (mulchCount !== 4) throw new Error(`비료가 ${String(mulchCount)}가지다 — 4여야 한다`)

  // 열매마다의 성장 값. **롬이 아니라 디컴프의 도구 자료**에서 온다
  // (`res/items/data/*.json`의 `berryData`) — 그래서 리포트를 만드는 순간
  // 자료 내려받기를 기다리지 않아도 된다. `berries.json`과 같은 값이어야 하고
  // 그건 `berryPatches.test.ts`가 지킨다
  const growth = new Array(berryCount).fill(null)
  for (const file of fs.readdirSync(path.join(DECOMP, 'res/items/data'))) {
    if (!file.endsWith('.json')) continue
    const json = JSON.parse(read(`res/items/data/${file}`))
    if (json.berryData === undefined) continue
    const name = `ITEM_${file.replace(/\.json$/, '').toUpperCase()}`
    const item = items.get(name)
    if (item === undefined || item < firstBerry || item > lastBerry) continue
    const d = json.berryData
    growth[item - firstBerry] = [d.stageDuration, d.moistureDrainRate, d.baseYield]
  }
  const missing = growth.findIndex((g) => g === null)
  if (missing >= 0) throw new Error(`열매 ${missing + 1}의 성장 값이 없다`)

  const body = read('include/data/berry_init.h')
  const table = body.match(/sBerryInitTable\[\] = \{([\s\S]*?)\n\};/)
  if (table === null) throw new Error('sBerryInitTable을 못 찾았다')

  const rows = []
  for (const m of table[1].matchAll(/\.berryItemID = (ITEM_\w+),\s*\.yield = (\d+)/g)) {
    const item = need(m[1])
    if (item < firstBerry || item > lastBerry) throw new Error(`나무열매가 아니다: ${m[1]}`)
    // 밭이 드는 것은 도구 번호가 아니라 **1부터 세는 열매 번호**다
    // (`BerryPatches_ConvertItemIDToTagNumber`). 0이 「빈 밭」이라 1이 체리열매다
    rows.push([item - firstBerry + 1, Number(m[2])])
  }
  if (rows.length === 0) throw new Error('표가 비었다')

  const lines = rows.map((r) => `  [${String(r[0])}, ${String(r[1])}],`)
  const kinds = new Set(rows.map((r) => r[0])).size

  const out = `// 처음부터 심겨 있는 밭 ${String(rows.length)} (DATA.md §2.12.1)
//
// 새 리포트를 만들 때 밭마다 열매가 하나씩 심겨 **이미 열려 있는 채로**
// 시작한다 (\`BerryPatches_Init\`). 배치표의 밭 객체 ${String(rows.length)}개가 각자
// \`data[0]\`에 밭 번호를 들고 있고, 그 번호가 이 표의 자리다.
//
// ⚠️ **손으로 고치지 않는다** — \`pnpm gen:berryInit\`이 디컴프에서 다시 만든다
// (\`tools/extract/berryInitModule.cjs\`).
//
// 밭 ${String(rows.length)}곳에 열매 ${String(kinds)}가지가 심겨 있다.

/** \`[열매 번호(1부터), 열린 개수]\`. 차례가 곧 밭 번호다 */
export const BERRY_PATCH_INIT: readonly (readonly [number, number])[] = [
${lines.join('\n')}
]

/**
 * 열매 ${String(berryCount)}가지의 \`[단계 시간, 시간당 마름, 기본 개수]\`. **차례가 열매 번호 − 1**이다.
 *
 * ⚠️ **\`berries.json\`과 같은 값인데 왜 또 두는가.** 리포트를 처음 만들 때
 * (\`newBerryPatches\`) 밭 ${String(rows.length)}곳의 남은 분이 이 값에서 나오는데, 그 순간은
 * 자료 파일이 아직 안 와 있다 — 원작은 롬에서 바로 읽지만 우리 자료는 비동기다.
 * 두 벌이 어긋나지 않는 것은 \`berryPatches.test.ts\`가 지킨다
 */
export const BERRY_GROWTH: readonly (readonly [number, number, number])[] = [
${growth.map((g) => `  [${g.join(', ')}],`).join('\n')}
]

/** \`FIRST_BERRY_IDX\` — 체리열매의 도구 번호. 열매 번호 1이 이것이다 */
export const FIRST_BERRY_ITEM = ${String(firstBerry)}

/** \`NUM_BERRIES\` */
export const BERRY_KINDS = ${String(berryCount)}

/** \`FIRST_MULCH_IDX\` — 성장비료의 도구 번호. 비료 종류 1이 이것이다 */
export const FIRST_MULCH_ITEM = ${String(firstMulch)}

/** \`NUM_MULCHS\` */
export const MULCH_KINDS = ${String(mulchCount)}
`
  fs.writeFileSync(OUT, out)
  console.log(`${path.relative(ROOT, OUT)} — 밭 ${rows.length}곳 · 열매 ${kinds}가지`)
}

main()
