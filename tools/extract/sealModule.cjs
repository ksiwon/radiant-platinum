'use strict'
// 볼 씰의 표 둘 → src/engine/world/sealTables.ts
//
//     pnpm gen:seals
//
// ⚠️ **왜 소스에 굽는가.** 값과 재고가 롬 자료가 아니라 **코드 안의 표**다(`unk_02097B18.c`의 `Unk_020F64D0` ·
// `mart_items.h`의 `SunyshoreMarket*`). 담기는 것은 번호와 값뿐이고 이름은 롬 글 뱅크 12 · 13이 든다.
// ⚠️ **손으로 고치지 않는다.**
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/engine/world/sealTables.ts')
const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')

function main() {
  const names = read('generated/seals.txt').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const id = new Map(names.map((n, i) => [n, i]))
  const max = id.get('SEAL_ID_MAX')
  if (max === undefined) throw new Error('SEAL_ID_MAX를 못 찾았다')

  // 값 — `{ 0xB8, 0x0, 0x125, 0x25, 0x0, 0x3E7, 0x0 }`의 **여섯째**가 값이다 (`sub_020981D0` = `unk_06`, 구조체 여섯째 칸)
  const src = read('src/unk_02097B18.c')
  const body = src.match(/Unk_020F64D0\[SEAL_ID_MAX\] = \{([\s\S]*?)\n\};/)
  if (body === null) throw new Error('Unk_020F64D0을 못 찾았다')
  const rows = [...body[1].matchAll(/\{([^}]*)\}/g)].map((m) => m[1].split(',').map((v) => Number(v.trim())))
  if (rows.length !== max) throw new Error(`줄이 ${rows.length}개다 — ${max}이어야 한다`)
  const price = rows.slice(1).map((r) => r[5])
  // 터지는 입자 — 넷째가 `ball.bin`의 멤버 번호(`sub_02098188`), 다섯째가 「한 자리에 고정」 깃발(`sub_020981AC`)
  const fxRes = rows.slice(1).map((r) => r[3])
  const fxFixed = rows.slice(1).map((r) => r[4])
  // 그림 — 첫째가 `cb_data.narc`의 글자(NCGR) 멤버 번호다 (`sub_02098140`)
  const iconMember = rows.slice(1).map((r) => r[0])

  // 재고 — 요일마다 일곱
  const stocks = []
  for (const day of ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']) {
    const name = `SunyshoreMarketStock${day[0]}${day.slice(1).toLowerCase()}`
    const m = read('include/data/mart_items.h').match(new RegExp(String.raw`${name}\[\] = \{([\s\S]*?)SHOP_ITEM_END`))
    if (m === null) throw new Error(`${day} 재고를 못 찾았다`)
    const list = [...m[1].matchAll(/(\w+_SEAL_\w+),/g)].map((x) => {
      const v = id.get(x[1])
      if (v === undefined) throw new Error(`모르는 씰: ${x[1]}`)
      return v
    })
    if (list.length !== 7) throw new Error(`${day}에 ${list.length}종이다 — 일곱이어야 한다`)
    stocks.push(list)
  }

  const out = `// 볼 씰의 표 둘 (PARITY §4.11)
//
// ⚠️ **손으로 고치지 않는다** — \`pnpm gen:seals\`가 디컴프에서 다시 만든다 (\`tools/extract/sealModule.cjs\`).
// 번호는 \`generated/seals.txt\`의 열거 값이고 **1부터**다(0은 없음). 이름은 롬 글 뱅크 12(단수) · 13(복수)이 든다.

/** 씰 종류 수 (\`SEAL_ID_MAX - 1\`) */
export const SEAL_KINDS = ${max - 1}

/** 한 종류를 가질 수 있는 끝 (\`MAX_SEALS_PER_TYPE\`) */
export const MAX_SEALS_PER_TYPE = 99

/** 씰 한 장의 값 — 차례가 씰 번호 − 1이다 (\`Unk_020F64D0\`의 여섯째 칸) */
export const SEAL_PRICE: readonly number[] = [${price.join(', ')}]

/** 씰마다 터지는 입자 — \`ball.bin\`의 멤버 번호 (\`sub_02098188\`, 넷째 칸) */
export const SEAL_FX_RES: readonly number[] = [${fxRes.join(', ')}]

/** 입자 시차를 위치로 가르지 않고 늘 같게 두는 씰인가 (\`sub_020981AC\`, 다섯째 칸) */
export const SEAL_FX_FIXED: readonly number[] = [${fxFixed.join(', ')}]

/** 씰마다 그림 글자 판 — \`cb_data.narc\`의 멤버 번호 (\`sub_02098140\`, 첫째 칸). 24×24 · 16색 한 장씩이다 */
export const SEAL_ICON_MEMBER: readonly number[] = [${iconMember.join(', ')}]

/** 해님시티 시장의 요일별 씰 가게 — 월요일부터 일곱 날, 날마다 일곱 종 (\`SunyshoreMarketStock*\`) */
export const SUNYSHORE_SEAL_STOCKS: readonly (readonly number[])[] = [
${stocks.map((s) => `  [${s.join(', ')}],`).join('\n')}
]
`
  fs.writeFileSync(OUT, out)
  console.log(`${OUT} — 씰 ${max - 1}종 · 재고 ${stocks.length}일`)
}

main()
