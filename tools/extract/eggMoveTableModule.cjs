'use strict'
// 알 기술표 → src/import/platinum/eggMoveTable.ts (DATA.md §2.4)
//
//     pnpm gen:eggMoveTable
//
// ⚠️ **왜 소스에 굽는가.** 종족 자료 44바이트에 알 그룹과 부화 걸음은 있는데
// **알 기술 목록은 없다.** 원작은 그것을 `sEggMoves`라는 배열로 오버레이 5에
// 컴파일해 넣는다 (`overlay005/daycare.c`의 `LoadSpeciesEggMoves`) — 아카이브가
// 아니라 코드라, 사용자 롬에서 꺼내려면 오버레이 안의 자리를 손으로 짚어야 한다.
// 기술머신표(`itemTable.ts`의 `TM_MOVES`)와 같은 자리다.
//
// ⚠️ **담기는 것은 기술 번호뿐이다.** 이름도 위력도 설명도 한 바이트도 안
// 담는다 — 그것은 전부 사용자 롬에서 나온다 (COPYRIGHT.md §2).
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/import/platinum/eggMoveTable.ts')

const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')
const lines = (p) => read(p).split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '')

/**
 * 종족마다의 알 기술 번호. 색인이 곧 종족 번호다.
 *
 * 폴더 이름이 `SPECIES_` 뒤를 소문자로 한 것과 정확히 1:1이다 (496개 전부 맞다).
 * 알 기술이 없는 종은 빈 배열이다
 */
function eggMovesBySpecies() {
  const species = lines('generated/species.txt')
  const moves = lines('generated/moves.txt')
  const moveId = new Map(moves.map((n, i) => [n, i]))
  const out = []
  for (const constant of species) {
    const stem = constant.slice('SPECIES_'.length).toLowerCase()
    const file = path.join(DECOMP, 'res/pokemon', stem, 'data.json')
    if (!fs.existsSync(file)) throw new Error(`${constant}: ${stem}/data.json이 없다`)
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const names = data.learnset?.egg_moves ?? []
    out.push(names.map((name) => {
      const id = moveId.get(name)
      if (id === undefined) throw new Error(`${constant}: ${name}이 기술 목록에 없다`)
      return id
    }))
  }
  return out
}

function main() {
  const table = eggMovesBySpecies()
  const withMoves = table.filter((m) => m.length > 0).length
  const total = table.reduce((n, m) => n + m.length, 0)
  // 원작 상한 (`MAX_EGG_MOVES`). 넘으면 우리가 표를 잘못 읽은 것이다
  const longest = Math.max(...table.map((m) => m.length))
  if (longest > 16) throw new Error(`알 기술이 ${longest}개인 종이 있다 — 상한 16`)

  const body = table.map((m) => `  [${m.join(', ')}],`).join('\n')
  const out = `// 알 기술표 (DATA.md §2.4)
//
// ⚠️ **손으로 고치지 않는다.** \`pnpm gen:eggMoveTable\`이 디컴프에서 다시 만든다
// (\`tools/extract/eggMoveTableModule.cjs\`).
//
// 종족 자료 44바이트에 알 그룹과 부화 걸음은 있지만 **알 기술 목록은 없다** —
// 원작이 그것만 코드(\`sEggMoves\`)로 들고 있다. 여기 있는 것은 **기술 번호**뿐이고
// 이름도 위력도 없다 (COPYRIGHT.md §2).

/** 종족 번호로 색인한다. 알 기술이 없는 종은 빈 배열 */
export const EGG_MOVES: readonly (readonly number[])[] = [
${body}
]
`
  fs.writeFileSync(OUT, out)
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1)
  console.log(`알 기술: ${withMoves}종 ${total}개 (제일 많은 종 ${longest}개)`)
  console.log(`  → ${path.relative(ROOT, OUT)} (${kb}KB)`)
}

module.exports = { eggMovesBySpecies }

if (require.main === module) main()
