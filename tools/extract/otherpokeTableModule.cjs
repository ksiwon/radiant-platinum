'use strict'
// 폼 그림이 `pl_otherpoke.narc` 어디에 있는가 → src/import/platinum/otherpokeTable.ts
//
//     pnpm gen:otherpokeTable
//
// ⚠️ **롬에 없는 표다.** 원작은 종족마다 `BuildPokemonSpriteTemplate`이 산술로
// 자리를 낸다 — `72 + (face / 2) + form * 2` 같은 식이 열셋이고, 그 식의 **밑수**가
// 코드에 박혀 있다. 여기서는 그 밑수를 짐작하지 않고 **세어서 낸다**:
//
//   · 등록 차례(`res/pokemon/form_registry.json`)대로 폼 수만큼 자리를 쌓는다
//   · `__last_sprite`가 붙은 종(기라티나)만 맨 뒤로 보낸다
//   · 그 누적합이 곧 밑수다
//
// 그 결과가 원작 식의 밑수와 **하나도 안 틀리고** 맞고, 마지막 합이 248이 되어
// 공용 그림 다섯(대타출동 앞·뒤·팔레트, 그림자·팔레트)을 얹으면 아카이브 파일
// 수 253과 정확히 떨어진다. 다른 배치로는 253이 안 나온다.
//
// ⚠️ **여기 담기는 것은 색인 번호뿐이다.** 그림도 색도 이름도 없다 (COPYRIGHT.md §2).
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/import/platinum/otherpokeTable.ts')

/** 공용 그림 다섯이 뒤에 붙는다 (`form_sprites_shared`) */
const SHARED_TAIL = 5
/** 아카이브 파일 수. 이 수가 안 맞으면 배치를 잘못 센 것이다 */
const TOTAL_FILES = 253

/**
 * 폼 그림 배치.
 *
 * 등록부의 `__` 표식 넷이 그대로 배치가 된다 — 우리가 이름 붙인 것이 아니다
 */
function rows() {
  const registry = JSON.parse(
    fs.readFileSync(path.join(DECOMP, 'res/pokemon/form_registry.json'), 'utf8'),
  )
  const species = fs.readFileSync(path.join(DECOMP, 'generated/species.txt'), 'utf8')
    .split(/\r?\n/).filter(Boolean)

  const order = Object.keys(registry)
  // ⚠️ 기라티나만 그림이 **맨 뒤**다 (`__last_sprite`). 등록 차례대로 쌓으면
  // 쉐이미·로토무가 네 칸씩 밀려서 로토무 팬이 기라티나로 뜬다
  const last = order.filter((d) => registry[d].__last_sprite === true)
  const walk = [...order.filter((d) => !last.includes(d)), ...last]

  const out = []
  let chars = 0
  let pals = 0
  for (const dir of walk) {
    const spec = registry[dir]
    const forms = 1 + Object.keys(spec).filter((k) => !k.startsWith('__')).length
    const frontOnly = spec.__front_only === true
    const shared = spec.__shared_palette === true
    out.push({
      dir,
      id: species.indexOf(`SPECIES_${dir.toUpperCase()}`),
      forms,
      chars,
      pals,
      frontOnly,
      shared,
      backsThenFronts: spec.__all_back_then_front === true,
      normalsThenShinies: spec.__all_normal_then_shiny === true,
    })
    chars += forms * (frontOnly ? 1 : 2)
    // 색이 다른 벌이 폼마다 하나씩. 폼이 색을 나눠 쓰면 두 벌뿐이고,
    // 알은 색이 다른 벌이 아예 없다
    pals += shared ? 2 : forms * (frontOnly ? 1 : 2)
  }
  for (const r of out) r.pals += chars
  if (chars + pals + SHARED_TAIL !== TOTAL_FILES) {
    throw new Error(`그림 ${chars} + 팔레트 ${pals} + 공용 ${SHARED_TAIL} ≠ ${TOTAL_FILES}`)
  }
  return { rows: out, chars, pals }
}

function main() {
  const { rows: list, chars, pals } = rows()
  for (const r of list) {
    if (r.id <= 0) throw new Error(`${r.dir}이 종 열거형에 없다`)
  }

  const body = list.map((r) => {
    const flags = [
      r.frontOnly ? 'frontOnly: true' : null,
      r.shared ? 'sharedPalette: true' : null,
      r.backsThenFronts ? 'backsThenFronts: true' : null,
      r.normalsThenShinies ? 'normalsThenShinies: true' : null,
    ].filter(Boolean)
    return `  { species: ${r.id}, forms: ${r.forms}, char: ${r.chars}, pal: ${r.pals}`
      + `${flags.length ? `, ${flags.join(', ')}` : ''} }, // ${r.dir}`
  }).join('\n')

  const out = `// 폼 그림이 \`pl_otherpoke.narc\` 어디에 있는가 (DATA.md §2.17.1)
//
// ⚠️ **손으로 고치지 않는다.** \`pnpm gen:otherpokeTable\`이 디컴프에서 다시 만든다
// (\`tools/extract/otherpokeTableModule.cjs\`).
//
// 원작은 종족마다 산술로 자리를 낸다 (\`BuildPokemonSpriteTemplate\`). 그 식의
// **밑수**가 여기 있는 \`char\`·\`pal\`이고, 등록 차례대로 폼 수만큼 쌓아서 센 값이다.
// **여기 담기는 것은 색인 번호뿐이다** — 그림도 색도 이름도 없다 (COPYRIGHT.md §2).

export interface OtherpokeRow {
  species: number
  /** 기본형까지 센 폼 수 */
  forms: number
  /** 그림 첫 칸 */
  char: number
  /** 팔레트 첫 칸 */
  pal: number
  /** 앞모습만 있다 (알) */
  frontOnly?: boolean
  /** 폼이 팔레트를 나눠 쓴다 (테오키스·안농) */
  sharedPalette?: boolean
  /** 뒷모습을 다 놓고 앞모습을 다 놓는다 (캐스퐁·조개무지·트리토돈·체리버) */
  backsThenFronts?: boolean
  /** 보통색을 다 놓고 색이 다른 것을 다 놓는다 (캐스퐁·체리버) */
  normalsThenShinies?: boolean
}

/** 그림 ${chars}칸 + 팔레트 ${pals}칸 + 공용 ${SHARED_TAIL}칸 = ${TOTAL_FILES}칸 */
export const OTHERPOKE: readonly OtherpokeRow[] = [
${body}
]

/** 아카이브 파일 수. 안 맞으면 롬이 다른 판이다 */
export const OTHERPOKE_FILES = ${TOTAL_FILES}

/**
 * 그 폼의 그림 칸. 없으면 null (알의 뒷모습).
 *
 * 원작 식을 표로 푼 것이다 — \`72 + (face / 2) + form * 2\`에서 \`face\`는
 * 뒤 0 · 앞 2다 (\`FACE_BACK\`·\`FACE_FRONT\`)
 */
export function otherpokeChar(row: OtherpokeRow, form: number, front: boolean): number | null {
  if (row.frontOnly) return front ? row.char + form : null
  if (row.backsThenFronts) return row.char + (front ? row.forms : 0) + form
  return row.char + form * 2 + (front ? 1 : 0)
}

/** 그 폼의 팔레트 칸. 색이 다른 벌은 안 쓴다 — 추출기가 보통색만 굽는다 */
export function otherpokePalette(row: OtherpokeRow, form: number): number {
  if (row.sharedPalette) return row.pal
  if (row.frontOnly || row.normalsThenShinies) return row.pal + form
  return row.pal + form * 2
}
`
  fs.writeFileSync(OUT, out)
  console.log(
    `폼 그림 ${list.length}종 · 그림 ${chars}칸 · 팔레트 ${pals}칸 → ${path.relative(ROOT, OUT)}`,
  )
}

module.exports = { rows, TOTAL_FILES }

if (require.main === module) main()
