'use strict'
// 크레딧이 흐르는 차례 → src/engine/world/creditsTable.ts (PARITY §8.12)
//
//     pnpm gen:credits
//
// ⚠️ **왜 소스에 굽는가.** 이 표는 롬 자료가 아니라 **코드 안의 표**다
// (`overlay099/ov99_021D3E78.c`의 `Unk_ov99_021D4CE4`). 어느 줄이 몇 픽셀째에
// 뜨는지, 어느 줄이 가운데 정렬인지가 어느 NARC에도 안 적혀 있다.
//
// ⚠️ **여기 담기는 것은 번호와 수뿐이다.** 이름도 글도 한 바이트도 안 담는다 —
// 크레딧 문장 237줄은 사용자의 롬에서 대사 뱅크 548로 온다.
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/engine/world/creditsTable.ts')

const SRC = 'src/overlay099/ov99_021D3E78.c'
const TABLE = 'Unk_ov99_021D4CE4'

/** `{ 0x1, 0x10, 0x1 },` 꼴 세 값을 차례대로 */
function rows(src) {
  const at = src.indexOf(`${TABLE}[] = {`)
  if (at < 0) throw new Error(`${TABLE}을 못 찾는다`)
  const close = src.indexOf('\n};', at)
  const body = src.slice(at, close)
  const out = []
  for (const m of body.matchAll(/\{\s*(0x[0-9A-Fa-f]+|\d+)\s*,\s*(0x[0-9A-Fa-f]+|\d+)\s*,\s*(0x[0-9A-Fa-f]+|\d+)\s*\}/g)) {
    out.push([Number(m[1]), Number(m[2]), Number(m[3])])
  }
  if (out.length === 0) throw new Error(`${TABLE}이 비어 있다`)
  return out
}

function main() {
  const src = fs.readFileSync(path.join(DECOMP, SRC), 'utf8')
  const table = rows(src)

  // 줄 번호가 0부터 하나씩 는다는 것을 여기서 확인한다 — 어긋나면 뱅크의
  // 어느 줄을 띄울지가 표의 첫 칸이 아니라 자리 번호가 되어 조용히 밀린다
  for (const [i, [line]] of table.entries()) {
    if (line !== i) throw new Error(`${i}번째 줄의 번호가 ${line}이다 — 차례가 아니다`)
  }
  for (let i = 1; i < table.length; i++) {
    if (table[i][1] < table[i - 1][1]) throw new Error(`${i}번째 자리가 앞보다 위다`)
  }

  const centered = table.filter(([, , c]) => c).length
  const last = table[table.length - 1][1]

  const out = `// 크레딧이 흐르는 차례 — \`pnpm gen:credits\`가 만든다. 손으로 고치지 않는다.
//
// 원본: \`${SRC}\`의 \`${TABLE}\` (PARITY §8.12)

/**
 * 한 줄이 **어디에 서고 가운데인가**.
 *
 * 자리(\`at\`)는 프레임이 아니라 **흐르는 띠 위의 픽셀 y**다. 두루마리가
 * 1프레임에 1픽셀씩 오르고, 그 값이 이 자리를 지나는 순간 줄이 그려진다
 */
export interface CreditRow {
  /** 띠 위의 y (픽셀). 0부터 ${last}까지 */
  at: number
  /**
   * 가운데 정렬인가. 아니면 왼쪽에서 32픽셀이다.
   *
   * ⚠️ **표지 두 줄만 가운데다.** 나머지는 다 32픽셀 들여쓰기라, 「제목이니까
   * 가운데」로 짐작하면 직함 줄까지 가운데로 몰린다
   */
  centered: boolean
}

/** 줄 수. 대사 뱅크 548의 줄 수와 같아야 한다 */
export const CREDIT_LINES = ${table.length}

/** 한 줄의 높이 (픽셀). 지우는 자리도 이 값으로 잰다 */
export const CREDIT_LINE_HEIGHT = 16

/** 왼쪽 들여쓰기 (픽셀). 가운데 정렬이 아닌 줄이 서는 자리다 */
export const CREDIT_INDENT = 32

/** 두루마리가 한 프레임에 오르는 픽셀 (\`ov99_021D3F6C(…, 1)\`) */
export const CREDIT_SCROLL_PER_FRAME = 1

/**
 * 두루마리가 시작하는 자리 (\`ov99_021D3E78(…, -240, …)\`).
 *
 * 첫 줄이 뜨기까지 240픽셀이 빈다 — 화면이 밝아지는 동안이다
 */
export const CREDIT_SCROLL_START = -240

/** 화면 높이 (픽셀). 줄이 뜨는 판정이 이만큼 앞선다 */
export const CREDIT_VIEW_HEIGHT = 192

/**
 * 자리와 정렬 ${table.length}줄.
 *
 * ⚠️ **차례가 곧 대사 뱅크의 줄 번호다.** 원작 표의 첫 칸이 0부터 하나씩 느는
 * 것을 굽는 쪽이 확인한다 — 어긋나면 여기서 선다
 */
export const CREDIT_ROWS: readonly CreditRow[] = [
${table.map(([, at, c]) => `  { at: ${at}, centered: ${c ? 'true' : 'false'} },`).join('\n')}
]
`
  fs.writeFileSync(OUT, out.replace(/\n/g, '\r\n'))
  console.log(`creditsTable.ts — 줄 ${table.length} · 가운데 정렬 ${centered} · 마지막 자리 ${last}px`)
  console.log(`  60fps에서 ${((last + 16 + 240) / 60).toFixed(1)}초`)
}

if (require.main === module) main()
