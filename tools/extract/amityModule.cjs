'use strict'
// 우호광장의 표 둘 → src/engine/world/amityTables.ts (DATA.md §2.12.2)
//
//     pnpm gen:amity
//
// ⚠️ **왜 소스에 굽는가.** 둘 다 롬 자료가 아니라 **코드 안의 표**다
// (`scrcmd_amity_square.c`의 `sMonFindableAccessories`와
// `sBerryAndAccessoryManOptions`). 어느 포켓몬이 무엇을 주워 오는지도, 아저씨가
// 무엇을 주는지도 어느 NARC에도 안 적혀 있다.
//
// ⚠️ **여기 담기는 것은 번호뿐이다.** 이름도 글도 한 바이트도 안 담는다.
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/engine/world/amityTables.ts')

const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')

/** `generated/*.txt`를 줄 차례대로 푼다 (`= 값` 줄이 번호를 옮긴다) */
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

/** `10 15 15 15 15 10 10 8 5 5 2` — 자리마다의 확률 (`ScrCmd_CalcAmitySquareFoundAccessory`) */
const FIND_WEIGHTS = [15, 15, 15, 15, 10, 10, 8, 5, 5, 2]

function main() {
  const items = enumValues('generated/items.txt')
  const species = enumValues('generated/species.txt')
  const accessories = enumValues('generated/accessories.txt')

  const src = read('src/scrcmd_amity_square.c')

  // ① 포켓몬이 주워 오는 장식 여섯 무리 × 열
  const findBody = src.match(/sMonFindableAccessories\[[^\]]*\]\[[^\]]*\] = \{([\s\S]*?)\n\};/)
  if (findBody === null) throw new Error('sMonFindableAccessories를 못 찾았다')
  const pools = []
  for (const group of findBody[1].split('},')) {
    const names = [...group.matchAll(/ACCESSORY_(\w+)/g)].map((m) => `ACCESSORY_${m[1]}`)
    if (names.length === 0) continue
    if (names.length !== FIND_WEIGHTS.length) {
      throw new Error(`무리에 장식이 ${names.length}개다 — ${FIND_WEIGHTS.length}이어야 한다`)
    }
    pools.push(names.map((n) => {
      const v = accessories.get(n)
      if (v === undefined) throw new Error(`모르는 장식: ${n}`)
      return v
    }))
  }
  if (pools.length !== 6) throw new Error(`무리가 ${pools.length}개다 — 여섯이어야 한다`)

  // ② 무리를 정하는 종족. `switch`의 `case SPECIES_X:` 묶음을 차례대로 읽는다
  const calcBody = src.split('BOOL ScrCmd_CalcAmitySquareFoundAccessory')[1].split('\n}')[0]
  const groups = []
  let pending = []
  for (const line of calcBody.split('\n')) {
    const c = /case (SPECIES_\w+):/.exec(line)
    if (c) { pending.push(c[1]); continue }
    const p = /findableAccessoryPool = (\d+);/.exec(line)
    if (p && pending.length > 0) {
      groups.push([Number(p[1]), pending])
      pending = []
    }
  }
  if (groups.length !== 6) throw new Error(`종족 묶음이 ${groups.length}개다 — 여섯이어야 한다`)
  const byMon = []
  for (const [pool, names] of groups) {
    for (const n of names) {
      const v = species.get(n)
      if (v === undefined) throw new Error(`모르는 종족: ${n}`)
      byMon.push([v, pool])
    }
  }
  byMon.sort((a, b) => a[0] - b[0])

  // ③ 아저씨가 주는 열매 아홉과 장식 일곱
  const manBody = src.match(/sBerryAndAccessoryManOptions\[\] = \{([\s\S]*?)\n\};/)
  if (manBody === null) throw new Error('sBerryAndAccessoryManOptions를 못 찾았다')
  const gifts = []
  for (const m of manBody[1].matchAll(/(ITEM_\w+|ACCESSORY_\w+)/g)) {
    const isItem = m[1].startsWith('ITEM_')
    const v = (isItem ? items : accessories).get(m[1])
    if (v === undefined) throw new Error(`모르는 선물: ${m[1]}`)
    gifts.push(v)
  }
  if (gifts.length !== 16) throw new Error(`선물이 ${gifts.length}개다 — 열여섯이어야 한다`)

  const out = `// 우호광장의 표 둘 (DATA.md §2.12.2)
//
// ⚠️ **손으로 고치지 않는다** — \`pnpm gen:amity\`가 디컴프에서 다시 만든다
// (\`tools/extract/amityModule.cjs\`).

/**
 * 따라다니는 포켓몬이 주워 오는 장식 (\`sMonFindableAccessories\`).
 *
 * 무리 여섯에 열 자리씩이고, **자리가 곧 확률**이다 — 앞의 넷이 15%,
 * 다음 둘이 10%, 그다음 8%·5%·5%·2%다
 */
export const AMITY_FIND: readonly (readonly number[])[] = [
${pools.map((p) => `  [${p.join(', ')}],`).join('\n')}
]

/** 자리마다의 확률(백분율). 합이 100이다 */
export const AMITY_FIND_WEIGHTS: readonly number[] = [${FIND_WEIGHTS.join(', ')}]

/**
 * 종족 → 무리 번호. **표에 없는 종족은 0번 무리**다 (원작의 \`default\`).
 *
 * 우호광장에 들어갈 수 있는 스무 종이 여섯 무리로 갈린다
 */
export const AMITY_POOL_OF: readonly (readonly [number, number])[] = [
${byMon.map(([s, p]) => `  [${s}, ${p}],`).join('\n')}
]

/**
 * 열매와 장식 아저씨가 주는 열여섯 (\`sBerryAndAccessoryManOptions\`).
 *
 * ⚠️ **앞의 아홉이 열매고 뒤의 일곱이 장식이다.** 원작이 \`< 9\`로만 가르므로
 * 차례를 바꾸면 열매를 장식으로 주게 된다
 */
export const AMITY_GIFTS: readonly number[] = [${gifts.join(', ')}]

/** 이 번호보다 작으면 열매다 (\`ScrCmd_CheckAmitySquareManGiftIsAccessory\`) */
export const AMITY_FIRST_ACCESSORY_GIFT = 9
`
  fs.writeFileSync(OUT, out)
  console.log(`${path.relative(ROOT, OUT)} — 무리 ${pools.length} · 종족 ${byMon.length} · 선물 ${gifts.length}`)
}

main()
