'use strict'
// 아이템 이름표와 아이콘 색인 → src/import/platinum/itemTable.ts (DATA.md §2.12)
//
//     pnpm gen:itemTable
//
// ⚠️ **왜 소스에 굽는가.** 아이템 자료 34바이트는 전부 롬에 있다. 그런데 **어느
// 자리가 어느 아이템인지**와 **가방에 뜨는 그림이 아이콘 아카이브 몇 번인지**는
// 롬 어디에도 안 적혀 있다 — 열거형 순서(`generated/items.txt`)와 파일 순서
// (`res/items/item_icon.order`), 그리고 아이템마다의 `icon.sprite`/`icon.palette`
// 세 가지를 겹쳐야 나오고, 셋 다 디컴프에만 있다. 공개 Importer는 사용자의 롬만
// 받으므로 그 다리를 브라우저가 들고 있어야 한다 (`spriteTable`과 같은 자리).
//
// ⚠️ **여기 담기는 것은 이름표와 색인 번호뿐이다.** 값·글·그림은 한 바이트도 안
// 담는다 — 가격도 회복량도 설명문도 전부 사용자 롬에서 나온다 (COPYRIGHT.md §2).
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const { fixTmPalette, checkTmPalette } = require('./tmPalette.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/import/platinum/itemTable.ts')

const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')
const lines = (p) => read(p).split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '' && !s.startsWith('//'))

function main() {
  // 마지막 줄 `MAX_ITEMS`는 개수를 세는 표지지 아이템이 아니다
  const names = lines('generated/items.txt').filter((n) => n.startsWith('ITEM_'))
  // `potion_NCGR` ← `potion.NCGR`
  const order = lines('res/items/item_icon.order')
  const iconIndex = new Map(order.map((f, i) => [f.replace(/\./g, '_'), i]))

  // 기술머신이 무엇을 가르치는가 (`sTMHMMoves`). 롬의 아이템 자료에는 **없고**
  // 디컴프의 `teachesMove`에만 있다 — 아이콘 색인과 같은 이유로 여기 굽는다.
  // 담기는 것은 기술 **번호**뿐이고 이름도 위력도 안 담는다 (COPYRIGHT.md §2)
  const moves = lines('generated/moves.txt')
  const tmMoves = []

  const rows = []
  let withData = 0
  const repalette = []
  for (const constant of names) {
    const stem = constant.slice('ITEM_'.length).toLowerCase()
    // ⚠️ 되돌아가야 한다. 브라우저 쪽은 이름표에서 `stem`을 다시 만들어 쓴다
    if (`ITEM_${stem.toUpperCase()}` !== constant) throw new Error(`이름표가 안 되돌아간다: ${constant}`)
    if (constant.startsWith('ITEM_UNUSED_')) { rows.push([constant, null, null]); continue }

    const src = JSON.parse(read(`res/items/data/${stem}.json`))
    const icon = iconIndex.get(src.icon.sprite)
    let palette = iconIndex.get(src.icon.palette)
    if (icon === undefined || palette === undefined) {
      throw new Error(`${constant}: 아이콘 ${src.icon.sprite}/${src.icon.palette}이 순서 파일에 없다`)
    }
    if (src.fieldUseFunc === 'ITEM_USE_FUNC_TM_HM') {
      const move = moves.indexOf(src.teachesMove)
      if (move < 0) throw new Error(`${constant}: ${src.teachesMove}가 기술 목록에 없다`)
      tmMoves.push(move)
      // 기술머신 팔레트는 기술 타입이 정한다 (BUGS.md §1.1). 노드 추출기와
      // **같은 모듈**을 쓴다 — 따로 계산하면 두 파이프라인이 어긋난다
      palette = fixTmPalette(DECOMP, iconIndex, constant, src.teachesMove, palette, repalette)
    }
    rows.push([constant, icon, palette])
    withData++
  }

  const body = rows
    .map(([c, i, p]) => `  [${JSON.stringify(c)}, ${i === null ? 'null' : i}, ${p === null ? 'null' : p}],`)
    .join('\n')

  const out = `// 아이템 이름표와 아이콘 색인 (DATA.md §2.12)
//
// ⚠️ **손으로 고치지 않는다.** \`pnpm gen:itemTable\`이 디컴프에서 다시 만든다
// (\`tools/extract/itemTableModule.cjs\`).
//
// 아이템 자료 34바이트는 사용자 롬의 \`pl_item_data.narc\`에서 나온다. 여기 있는
// 것은 그 자료가 **몇 번 아이템인지**(열거형 순서)와 **가방 그림이 아이콘
// 아카이브 몇 번인지**(\`item_icon.order\` 줄 번호)뿐이다 — 둘 다 롬에 안 적혀
// 있고 디컴프에만 있다. **값·글·그림은 한 바이트도 없다** (COPYRIGHT.md §2).

/**
 * \`[이름표, 아이콘 멤버, 팔레트 멤버]\`.
 *
 * 아이콘이 \`null\`이면 자료가 없는 자리다(\`ITEM_UNUSED_*\`) — NARC에 파일이
 * 아예 없어서 뒤 아이템들의 번호가 그만큼 당겨진다
 */
export type ItemRow = readonly [constant: string, icon: number | null, palette: number | null]

export const ITEM_TABLE: readonly ItemRow[] = [
${body}
]

/** 아이콘 아카이브 멤버 수. 표가 가리키는 번호가 이 안에 들어야 한다 */
export const ITEM_ICON_COUNT = ${order.length}

/**
 * 기술머신 92 + 비전머신 8이 가르치는 기술 번호 (\`sTMHMMoves\`).
 *
 * 차례는 아이템 열거형 순서(TM01…TM92, HM01…HM08)이고, 종족표의 128비트
 * 학습 필드가 **같은 차례**를 쓴다. 롬의 아이템 자료에는 안 들어 있다
 */
export const TM_MOVES: readonly number[] = [
${tmMoves.join(', ')},
]
`
  fs.writeFileSync(OUT, out)
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1)
  if (tmMoves.length !== 100) throw new Error(`기술머신 ${tmMoves.length}개 ≠ 100`)
  checkTmPalette(repalette)
  console.log(`아이템 ${rows.length}종 (자료 ${withData}개) · 아이콘 ${order.length}칸`
    + ` · 기술머신 ${tmMoves.length}개`)
  for (const line of repalette) console.log(`  팔레트 고침 — ${line}`)
  console.log(`  → ${path.relative(ROOT, OUT)} (${kb}KB)`)
}

main()
