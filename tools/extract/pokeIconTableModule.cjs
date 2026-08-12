'use strict'
// 아이콘 칸별 팔레트 번호 → src/import/platinum/pokeIconTable.ts (DATA.md §2.20)
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

/** 한 줄에 40개씩 — 540개를 한 줄로 쓰면 diff가 못 읽는다 */
const PER_LINE = 40

/**
 * 기본 모습 아이콘 수.
 *
 * `species.txt`는 496줄인데 아이콘은 495장이다 — 마지막 `SPECIES_BAD_EGG`만
 * `icon.png`가 없다(`ls res/pokemon/*​/icon.png` = 495). 그 뒤가 폼 아이콘이다
 */
const BASE_ICONS = 495

/**
 * 폼 아이콘 차례 (`res/pokemon/meson.build`의 `poke_icon_files`).
 *
 * `form_registry.json`에서 **자기 아이콘이 있는 폼**(`icon`·`data`)만 남기면 그
 * 차례가 그대로 나온다. 다만 손대야 할 곳이 둘이다:
 *
 *   ① 마나피 알이 맨 앞이다 — 등록부에서는 `egg.manaphy`가 `sprite`라 안 걸리고,
 *      차례도 기라티나 앞이 아니라 첫 칸이다
 *   ② 안농은 `a`가 한 번 더 들어간다 (`__dupe_base_icon`) — 기본 아이콘과 같은
 *      그림이지만 아카이브에는 칸이 따로 있다
 *
 * 이 둘을 빼면 등록부 차례 = 아카이브 차례다. 그래서 여기서 지어내지 않고
 * 등록부를 읽어 만든 뒤 수(45)를 맞춰 본다
 */
function formIcons(registry) {
  const out = [{ dir: 'bad_egg', form: null, what: 'manaphy_egg' }]
  for (const [dir, forms] of Object.entries(registry)) {
    for (const [form, kind] of Object.entries(forms)) {
      if (form.startsWith('__')) continue
      if (kind !== 'icon' && kind !== 'data') continue
      if (dir === 'unown' && form === 'b') out.push({ dir, form: 'a', what: 'unown_a' })
      out.push({ dir, form, what: `${dir}_${form}` })
    }
  }
  return out
}

/** 종 폴더의 `icon_palette`. 폼마다 다르면 `[["base",0],["sandy",1],…]` 꼴이다 */
function paletteOf(dir, form) {
  const raw = JSON.parse(
    fs.readFileSync(path.join(DECOMP, 'res/pokemon', dir, 'data.json'), 'utf8'),
  ).icon_palette
  if (typeof raw === 'number') return raw
  const at = raw.find(([name]) => name === (form ?? 'base'))
  if (!at) throw new Error(`${dir}: icon_palette에 ${form ?? 'base'}가 없다`)
  return at[1]
}

/**
 * 아이콘 칸 540개의 팔레트 번호.
 *
 * ⚠️ **뽑기 도구(`pokeIcons.js`)도 이걸 쓴다.** 같은 표를 두 군데서 만들면
 * 한쪽만 폼을 늘렸을 때 두 아틀라스가 조용히 달라진다
 */
function iconPalettes() {
  const species = fs.readFileSync(path.join(DECOMP, 'generated/species.txt'), 'utf8')
    .split(/\r?\n/).filter(Boolean)
  if (species.length !== BASE_ICONS + 1) {
    throw new Error(`종 ${species.length}개인데 기본 아이콘을 ${BASE_ICONS}장으로 잡고 있다`)
  }

  const palettes = species.slice(0, BASE_ICONS)
    .map((constant) => paletteOf(constant.replace('SPECIES_', '').toLowerCase(), null))

  const registry = JSON.parse(
    fs.readFileSync(path.join(DECOMP, 'res/pokemon/form_registry.json'), 'utf8'),
  )
  const forms = formIcons(registry)
  for (const { dir, form } of forms) palettes.push(paletteOf(dir, form))

  const max = Math.max(...palettes)
  if (max > 2) throw new Error(`팔레트 번호가 ${max}까지 나온다 — 세 벌 가정이 깨졌다`)
  return { palettes, forms }
}

function main() {
  const { palettes, forms } = iconPalettes()

  const rows = []
  for (let i = 0; i < palettes.length; i += PER_LINE) {
    rows.push(`  ${palettes.slice(i, i + PER_LINE).join(', ')},`)
  }

  const out = `// 아이콘 칸별 팔레트 번호 (DATA.md §2.20)
//
// ⚠️ **손으로 고치지 않는다.** \`pnpm gen:pokeIconTable\`이 디컴프에서 다시 만든다
// (\`tools/extract/pokeIconTableModule.cjs\`).
//
// 파티·박스 아이콘은 공용 NCLR의 팔레트 열여섯 벌 중 **세 벌**을 돌려쓴다. 어느
// 칸이 몇 번을 쓰는지는 그림에도 롬 어디에도 안 적혀 있고 코드에 박힌 배열이다
// (\`sPokemonIconPaletteIndex\`). 짐작으로 0번을 쓰면 풀색 포켓몬이 보라색이 된다.
// **여기 있는 것은 0·1·2 세 값뿐이다** — 색도 그림도 없다 (COPYRIGHT.md §2).

/**
 * 자리 = 아이콘 칸 번호 (\`engine/pokemon/form.iconSlot\`).
 *
 * 앞 ${BASE_ICONS}칸이 종 번호 그대로고(494 = 알), 그 뒤 ${forms.length}칸이 폼이다.
 * ⚠️ 495는 **마나피 알**이지 나쁜알이 아니다 — 나쁜알은 아이콘이 없고, 그
 * 폴더의 팔레트 번호가 마나피 알 것으로 쓰인다 (\`speciesproc.c\`)
 */
export const ICON_PALETTE: readonly number[] = [
${rows.join('\n')}
]
`
  fs.writeFileSync(OUT, out)
  const spread = [0, 1, 2].map((p) => palettes.filter((v) => v === p).length).join('/')
  console.log(
    `아이콘 ${palettes.length}칸 (기본 ${BASE_ICONS} + 폼 ${forms.length})`
    + ` · 팔레트 쓰임 ${spread} → ${path.relative(ROOT, OUT)}`,
  )
}

module.exports = { iconPalettes, BASE_ICONS }

if (require.main === module) main()
