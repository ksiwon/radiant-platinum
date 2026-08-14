'use strict'
// 눈이 마주칠 때 나오는 곡 → src/engine/world/trainerEncounterBgm.ts (DATA.md §2.18)
//
//     pnpm gen:trainerBgm
//
// ⚠️ **왜 소스에 굽는가.** 이 짝은 롬 자료가 아니라 **코드 안의 표**다
// (`field_bgm.c`의 `sTrainerEncounterBGMs`). 트레이너 자료 파일에는 갈래만 있고
// 「그 갈래에 어느 곡이 붙는가」는 어디에도 안 적혀 있다 — 아이템 아이콘 색인이
// 그랬던 것과 같은 자리다 (`itemTableModule.cjs`).
//
// ⚠️ **여기 담기는 것은 번호 두 줄뿐이다.** 곡도 이름도 한 바이트도 안 담는다 —
// 실제 소리는 사용자 롬의 SDAT에서 나온다 (COPYRIGHT.md §2).
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/engine/world/trainerEncounterBgm.ts')

const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')

/**
 * `generated/*.txt`를 C 열거형으로 푼다.
 *
 * ⚠️ **줄 번호가 값이 아니다.** `NAME = 다른이름` 꼴의 별명 줄은 값을 안 늘린다
 */
function enumValues(file) {
  const lines = read(file).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const out = new Map()
  let next = 0
  for (const line of lines) {
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

/**
 * SDAT 이름 → 번호.
 *
 * ⚠️ **줄 번호에 상수를 더하면 안 된다.** `sdat.txt`는 `이름 = 숫자` 닻을 두고
 * 그 뒤로 하나씩 올라가는 목록이라, SE 구간에서 어긋난다 (`engine/audio/sfx` 머리말)
 */
function sdatIds() {
  const out = new Map()
  let next = 0
  for (const raw of read('generated/sdat.txt').split(/\r?\n/)) {
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
    if (value === undefined) throw new Error(`SDAT 이름을 못 푼다: ${line}`)
    out.set(name, value)
    next = value + 1
  }
  return out
}

function main() {
  const classes = enumValues('generated/trainer_classes.txt')
  const seq = sdatIds()

  // 이미 못 박아 둔 번호들과 맞는지 본다. 하나라도 어긋나면 세는 법이 틀린 것이다
  const ANCHORS = { SEQ_SE_CONFIRM: 1500, SEQ_SE_DP_DOOR_OPEN: 1541, SEQ_TITLE01: 1173 }
  for (const [name, want] of Object.entries(ANCHORS)) {
    const got = seq.get(name)
    if (got !== want) throw new Error(`SDAT 닻이 틀렸다: ${name} = ${String(got)} (${String(want)}이어야 한다)`)
  }

  const body = read('src/field_bgm.c')
  const table = body.match(/sTrainerEncounterBGMs\[\]\[2\] = \{([\s\S]*?)\n\};/)
  if (table === null) throw new Error('sTrainerEncounterBGMs를 못 찾았다')

  const rows = []
  for (const m of table[1].matchAll(/\{\s*(TRAINER_CLASS_\w+)\s*,\s*(SEQ_\w+)\s*\}/g)) {
    const cls = classes.get(m[1])
    const bgm = seq.get(m[2])
    if (cls === undefined) throw new Error(`모르는 갈래: ${m[1]}`)
    if (bgm === undefined) throw new Error(`모르는 곡: ${m[2]}`)
    rows.push({ cls, bgm, clsName: m[1], bgmName: m[2] })
  }
  if (rows.length === 0) throw new Error('표가 비었다')

  // 기본값은 표에 없는 갈래가 받는다 (`bgmID = SEQ_EYE_KID`으로 시작한다)
  const fallback = seq.get('SEQ_EYE_KID')
  if (fallback === undefined) throw new Error('SEQ_EYE_KID를 못 찾았다')

  const lines = rows.map((r) => `  [${String(r.cls)}, ${String(r.bgm)}],`)
  const kinds = [...new Set(rows.map((r) => r.bgmName))].sort()

  const out = `// 눈이 마주칠 때 나오는 곡 (DATA.md §2.18)
//
// 트레이너 갈래마다 다른 곡이 붙는다 (\`field_bgm.c\`의 \`sTrainerEncounterBGMs\`).
// 스크립트가 배틀 앞에서 \`PlayTrainerEncounterBGM\`으로 이걸 튼다 — 사천왕 넷과
// 챔피언 앞의 다섯 자리가 그것이다.
//
// ⚠️ **손으로 고치지 않는다** — \`pnpm gen:trainerBgm\`이 디컴프에서 다시 만든다
// (\`tools/extract/trainerBgmModule.cjs\`).
//
// 갈래 ${String(rows.length)}개가 곡 ${String(kinds.length)}가지로 뭉친다.

/** \`[갈래, 곡]\`. 표에 없는 갈래는 \`TRAINER_ENCOUNTER_BGM_DEFAULT\`다 */
const TABLE: readonly (readonly [number, number])[] = [
${lines.join('\n')}
]

/** \`SEQ_EYE_KID\`. 표에 없는 갈래가 받는다 — 원작이 그 값으로 시작한다 */
export const TRAINER_ENCOUNTER_BGM_DEFAULT = ${String(fallback)}

const BY_CLASS = new Map(TABLE)

/** 그 갈래의 곡 (\`FieldBGM_GetEyesMeetForTrainer\`) */
export function trainerEncounterBgm(trainerClass: number): number {
  return BY_CLASS.get(trainerClass) ?? TRAINER_ENCOUNTER_BGM_DEFAULT
}
`
  fs.writeFileSync(OUT, out)
  console.log(`${path.relative(ROOT, OUT)} — 갈래 ${rows.length}개 · 곡 ${kinds.length}가지`)
}

main()
