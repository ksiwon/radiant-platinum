'use strict'
// 기술가르침(조각 교사) 표 → src/engine/world/tutorMoves.ts (PARITY §5)
//
//     pnpm gen:tutorMoves
//
// ⚠️ **왜 소스에 굽는가.** 배울 수 있는 기술과 조각 값은 NARC이 아니라
// **빌드 때 헤더로 굽히는 표**다 — `res/pokemon/move_tutors.json`이 값과 장소를,
// 종마다의 `data.json`의 `learnset.by_tutor`가 「이 종이 무엇을 배우는가」를 든다.
// 롬 안에서는 그 둘이 `sTeachableMoves`와 `sSpeciesLearnsetsByTutor`(비트마스크)로
// 굳는다 (`overlay005/scrcmd_move_tutor.c`).
//
// ⚠️ **폼이 따로 있다.** `Pokemon_ReadMovesetMaskByte`가 종만이 아니라 **폼**을
// 보고 표의 다른 줄로 간다 — 데오키시스 셋 · 도롱마담 둘 · 기라티나 오리진 ·
// 쉐이미 스카이 · 로토무 다섯이다. 종으로만 찾으면 오리진 기라티나가 알트드
// 기술표를 받는다.
//
// ⚠️ **여기 담기는 것은 번호와 수뿐이다.** 기술 이름도 대사도 한 바이트도 안 담는다.
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/engine/world/tutorMoves.ts')

const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')
const readJson = (p) => JSON.parse(read(p))

/** `generated/*.txt`를 줄 차례대로 푼다 (`vsSeekerModule`과 같은 셈) */
function enumValues(file) {
  const out = new Map()
  let next = 0
  for (const raw of read(file).split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('//')) continue
    const eq = line.indexOf('=')
    if (eq < 0) { out.set(line, next); next++; continue }
    const name = line.slice(0, eq).trim()
    const text = line.slice(eq + 1).trim()
    const value = out.has(text) ? out.get(text)
      : text.startsWith('0x') ? Number.parseInt(text, 16) : Number(text)
    if (!Number.isFinite(value)) throw new Error(`${file}: ${line}`)
    out.set(name, value)
    next = value + 1
  }
  return out
}

/**
 * 폼이 따로 줄을 갖는 열둘 (`Pokemon_ReadMovesetMaskByte`의 `switch`).
 *
 * 차례가 `constants/forms.h`의 `MOVESET_FORM_*` 차례 그대로다 — 그 값이
 * `NATIONAL_DEX_COUNT + n`이라 여기서는 **자리로 그 n을 센다**
 */
const FORM_ROWS = [
  ['deoxys', 'attack', 1], ['deoxys', 'defense', 2], ['deoxys', 'speed', 3],
  ['wormadam', 'sandy', 1], ['wormadam', 'trash', 2],
  ['giratina', 'origin', 1],
  ['shaymin', 'sky', 1],
  ['rotom', 'heat', 1], ['rotom', 'wash', 2], ['rotom', 'frost', 3],
  ['rotom', 'fan', 4], ['rotom', 'mow', 5],
]

function main() {
  const moves = enumValues('generated/moves.txt')
  const species = enumValues('generated/species.txt')
  const locations = enumValues('generated/tutor_locations.txt')

  const table = readJson('res/pokemon/move_tutors.json')
  if (!Array.isArray(table) || table.length === 0) throw new Error('move_tutors.json이 비었다')

  /** 표의 자리가 곧 비트 번호다 (`sTeachableMoves[offset * 8 + bit]`) */
  const rows = table.map((row, i) => {
    const move = moves.get(row.move)
    const location = locations.get(row.location)
    if (move === undefined) throw new Error(`${i}번 줄: 모르는 기술 ${row.move}`)
    if (location === undefined) throw new Error(`${i}번 줄: 모르는 장소 ${row.location}`)
    const cost = [row.redCost, row.blueCost, row.yellowCost, row.greenCost]
    if (cost.some((c) => !Number.isInteger(c) || c < 0)) throw new Error(`${i}번 줄의 값이 수가 아니다`)
    if (cost.every((c) => c === 0)) throw new Error(`${i}번 줄이 공짜다 — 표를 잘못 읽었다`)
    return { move, cost, location, name: row.move }
  })
  const byName = new Map(table.map((row, i) => [row.move, i]))
  if (byName.size !== rows.length) throw new Error('같은 기술이 두 줄이다')

  /** 한 `data.json`의 `learnset.by_tutor` → 표 자리 목록 (오름차순) */
  function indicesOf(file) {
    const data = readJson(file)
    const list = data.learnset?.by_tutor ?? []
    const out = []
    for (const name of list) {
      const at = byName.get(name)
      // ⚠️ 디컴프의 `emit_tutorables`도 표에 없는 이름을 오류로 친다
      if (at === undefined) throw new Error(`${file}: ${name}은 어느 교사도 안 가르친다`)
      out.push(at)
    }
    return [...new Set(out)].sort((a, b) => a - b)
  }

  // 종 494 (0·알·이상한알 셋은 원작도 건너뛴다)
  const sets = new Map()
  for (const [name, id] of species) {
    if (name === 'SPECIES_NONE' || name === 'SPECIES_EGG' || name === 'SPECIES_BAD_EGG') continue
    if (!name.startsWith('SPECIES_')) continue
    const dir = name.slice('SPECIES_'.length).toLowerCase()
    const at = indicesOf(`res/pokemon/${dir}/data.json`)
    if (at.length > 0) sets.set(id, at)
  }

  // 폼 열둘. 열쇠는 `종*100 + 폼`이 아니라 **종과 폼을 그대로** 쓴다
  const formSets = []
  for (const [dir, form, index] of FORM_ROWS) {
    const id = species.get(`SPECIES_${dir.toUpperCase()}`)
    if (id === undefined) throw new Error(`모르는 종: ${dir}`)
    const at = indicesOf(`res/pokemon/${dir}/forms/${form}/data.json`)
    formSets.push({ species: id, form: index, at })
  }

  const locationNames = [...locations].filter(([n]) => n.startsWith('TUTOR_LOCATION_'))
  if (locationNames.length !== 3) throw new Error(`장소가 ${locationNames.length}개다`)
  const perLocation = locationNames.map(([, id]) => rows.filter((r) => r.location === id).length)

  const rowLines = rows.map((r) => (
    `  { move: ${r.move}, cost: [${r.cost.join(', ')}], at: ${r.location} }, // ${r.name}`
  )).join('\n')

  const setLines = [...sets].sort((a, b) => a[0] - b[0])
    .map(([id, at]) => `  ${id}: [${at.join(', ')}],`).join('\n')

  const formLines = formSets
    .map((f) => `  { species: ${f.species}, form: ${f.form}, at: [${f.at.join(', ')}] },`)
    .join('\n')

  const out = `// 기술가르침(조각 교사) 표 (PARITY §5)
//
// 선단시티 동쪽 집 · 212번도로 집 · 서바이벌에리어 북쪽 집 셋이 이 표를 쓴다.
// 값은 돈이 아니라 **조각 넷**이고, 그 조각은 원작에서 지하통로에서만 캐는
// 것이라 우리는 배틀프런티어 BP 창구에 얹었다 (PARITY §12.3).
//
// ⚠️ **손으로 고치지 않는다** — \`pnpm gen:tutorMoves\`가 디컴프에서 다시 만든다
// (\`tools/extract/tutorMoveModule.cjs\`).

/** 교사가 서 있는 곳 (\`generated/tutor_locations.txt\`) */
export const TUTOR_LOCATION = {
${locationNames.map(([n, id]) => `  ${n.slice('TUTOR_LOCATION_'.length).toLowerCase().replace(/_(.)/g, (_, c) => c.toUpperCase())}: ${id},`).join('\n')}
} as const

/** 값 넷의 차례 — 빨강 · 파랑 · 노랑 · 초록 (\`sTeachableMoves\`의 칸 차례) */
type ShardCost = readonly [number, number, number, number]

interface TutorMove {
  /** 기술 번호 */
  move: number
  cost: ShardCost
  /** 어느 교사가 가르치는가 */
  at: number
}

/**
 * 가르칠 수 있는 기술 ${rows.length}가지 (\`sTeachableMoves\`).
 *
 * ⚠️ **자리가 뜻을 가진다.** 종마다의 학습표가 이 표의 **자리를 비트로** 들고
 * 있어서(\`sSpeciesLearnsetsByTutor\`), 줄을 옮기면 온 신오가 다른 기술을 배운다.
 *
 * 장소별로 ${perLocation.join(' · ')}가지다
 */
export const TUTOR_MOVES: readonly TutorMove[] = [
${rowLines}
]

/**
 * 종 → 배울 수 있는 기술의 **표 자리**. 하나도 없는 종은 아예 안 적혀 있다.
 *
 * 열쇠는 전국도감 번호다 (\`generated/species.txt\`의 줄 차례)
 */
const BY_SPECIES: Readonly<Record<number, readonly number[]>> = {
${setLines}
}

/**
 * 폼이 따로 줄을 갖는 열둘 (\`Pokemon_ReadMovesetMaskByte\`의 \`switch\`).
 *
 * ⚠️ **종으로만 찾으면 안 된다** — 오리진 기라티나와 알트드 기라티나가 배우는
 * 것이 다르다
 */
const BY_FORM: readonly { species: number, form: number, at: readonly number[] }[] = [
${formLines}
]

/** 그 종·폼이 배울 수 있는 기술의 표 자리 */
function slotsOf(species: number, form: number): readonly number[] {
  const special = BY_FORM.find((f) => f.species === species && f.form === form)
  return special?.at ?? BY_SPECIES[species] ?? []
}

/**
 * 그 자리에서 이 마리가 **아직 안 배운** 교사 기술 (\`ShowMoveTutorMoveSelectionMenu\`).
 *
 * 원작은 마스크를 비트 차례로 훑으므로 목록이 표 차례로 나온다 — 그 차례가
 * 곧 메뉴에 뜨는 차례라 여기서도 지킨다.
 *
 * @param known 이미 아는 기술 번호들
 */
export function learnableTutorMoves(
  species: number, form: number, known: readonly number[], at: number,
): number[] {
  const out: number[] = []
  for (const slot of slotsOf(species, form)) {
    const row = TUTOR_MOVES[slot]
    if (!row || row.at !== at) continue
    if (known.includes(row.move)) continue
    out.push(row.move)
  }
  return out
}

/** 그 자리의 교사가 가르치는 모든 기술. 파티를 안 고르고 값만 볼 때 쓴다 */
export function tutorMovesAt(at: number): number[] {
  return TUTOR_MOVES.filter((row) => row.at === at).map((row) => row.move)
}

/** 그 기술의 조각 값. 어느 교사도 안 가르치면 \`null\` */
export function shardCostOf(move: number): ShardCost | null {
  return TUTOR_MOVES.find((row) => row.move === move)?.cost ?? null
}
`
  fs.writeFileSync(OUT, out)
  process.stdout.write(`${path.relative(ROOT, OUT)} — 기술 ${rows.length} · 종 ${sets.size} · 폼 ${formSets.length}\n`)
}

main()
