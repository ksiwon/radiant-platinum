'use strict'
// 종별 아이콘 팔레트 번호 → src/import/platinum/pokeIconTable.ts (DATA.md §2.20)
//
//     pnpm gen:pokeIconTable
//
// ⚠️ **롬에 없는 표다.** 파티·박스 아이콘은 팔레트 열여섯 벌 중 세 벌을 돌려쓰는데,
// **어느 종이 몇 번을 쓰는지가 그림에 안 적혀 있다** — 코드에 박힌 배열
// (`sPokemonIconPaletteIndex`)이고 디컴프에는 종별 `data.json`의 `icon_palette`로
// 있다. 짐작으로 0번을 쓰면 풀색 포켓몬이 보라색이 된다.
//
// ⚠️ **여기 담기는 것은 0·1·2 세 값뿐이다.** 색도 그림도 이름도 없다 (COPYRIGHT.md §2).
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/import/platinum/pokeIconTable.ts')

/** 한 줄에 40개씩 — 494개를 한 줄로 쓰면 diff가 못 읽는다 */
const PER_LINE = 40

function main() {
  const species = fs.readFileSync(path.join(DECOMP, 'generated/species.txt'), 'utf8')
    .split(/\r?\n/).filter(Boolean)

  const palettes = species.map((constant) => {
    const dir = constant.replace('SPECIES_', '').toLowerCase()
    const raw = JSON.parse(
      fs.readFileSync(path.join(DECOMP, 'res/pokemon', dir, 'data.json'), 'utf8'),
    ).icon_palette
    if (typeof raw === 'number') return raw
    // "base,0,a,0,…" 꼴로 폼마다 적힌 것. 기본 폼을 집는다 — 우리 개체 자료에 폼이 없다
    const parts = String(raw).split(',')
    const at = parts.indexOf('base')
    if (at < 0) throw new Error(`${dir}: icon_palette에 base가 없다 — ${raw}`)
    const n = Number(parts[at + 1])
    if (!Number.isInteger(n)) throw new Error(`${dir}: 팔레트 번호가 숫자가 아니다 — ${raw}`)
    return n
  })

  const max = Math.max(...palettes)
  if (max > 2) throw new Error(`팔레트 번호가 ${max}까지 나온다 — 세 벌 가정이 깨졌다`)

  const rows = []
  for (let i = 0; i < palettes.length; i += PER_LINE) {
    rows.push(`  ${palettes.slice(i, i + PER_LINE).join(', ')},`)
  }

  const out = `// 종별 아이콘 팔레트 번호 (DATA.md §2.20)
//
// ⚠️ **손으로 고치지 않는다.** \`pnpm gen:pokeIconTable\`이 디컴프에서 다시 만든다
// (\`tools/extract/pokeIconTableModule.cjs\`).
//
// 파티·박스 아이콘은 공용 NCLR의 팔레트 열여섯 벌 중 **세 벌**을 돌려쓴다. 어느
// 종이 몇 번을 쓰는지는 그림에도 롬 어디에도 안 적혀 있고 코드에 박힌 배열이다
// (\`sPokemonIconPaletteIndex\`). 짐작으로 0번을 쓰면 풀색 포켓몬이 보라색이 된다.
// **여기 있는 것은 0·1·2 세 값뿐이다** — 색도 그림도 없다 (COPYRIGHT.md §2).

/** 자리 = 종 번호 (0 = \`SPECIES_NONE\`) */
export const ICON_PALETTE: readonly number[] = [
${rows.join('\n')}
]
`
  fs.writeFileSync(OUT, out)
  const spread = [0, 1, 2].map((p) => palettes.filter((v) => v === p).length).join('/')
  console.log(`종 ${palettes.length}개 · 팔레트 쓰임 ${spread} → ${path.relative(ROOT, OUT)}`)
}

main()
