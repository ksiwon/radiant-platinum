'use strict'
// 포켓치 지도 위의 자리 표 → src/engine/world/poketchMapTable.ts (DATA.md §2.28)
//
//     pnpm gen:poketchmap
//
// ⚠️ **왜 소스에 굽는가.** 지도 그림은 NARC에 있지만(`pnpm extract:poketchMap`)
// **그 위 어디에 무엇을 찍는가는 코드 안의 표**다. 어느 NARC에도 안 적혀 있다:
//
//   applications/poketch/poketch_map.c      격자 → 픽셀 (가로 30 · 세로 33)
//   applications/poketch/berry_searcher/    밭 118곳의 격자 자리
//   system_vars.c                           숨은 자리 넷의 확인 값
//
// ⚠️ **격자는 행렬 칸이다.** `PoketchMap_GetPlayerLocation`이 주인공 타일 좌표를
// `MAP_TILES_COUNT_X`(32)로 나눈다 — 지도 한 칸이 맵 한 장이다.
//
// ⚠️ **밭 118개가 자리 36곳으로 뭉친다.** 원작이 같은 자리가 이어지면 건너뛴다
// (`GetReadyBerryPatches`의 `while`) — 한 마을에 밭이 넷씩 있어서 안 뭉치면
// 같은 점을 네 번 찍는다.
//
// ⚠️ **여기 담기는 것은 번호뿐이다.** 이름도 글도 한 바이트도 안 담는다.
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/engine/world/poketchMapTable.ts')

const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')

/** `static const … name[] = { … };` 의 몸통 */
function arrayBody(src, name) {
  const at = src.indexOf(name)
  if (at < 0) throw new Error(`${name}을 못 찾았다`)
  const open = src.indexOf('{', at)
  let depth = 0, i = open
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) break
  }
  return src.slice(open + 1, i)
}

/** `generated/*.txt`를 줄 차례대로 푼다 */
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

const mapSrc = read('src/applications/poketch/poketch_map.c')
const berrySrc = read('src/applications/poketch/berry_searcher/main.c')
const varsSrc = read('src/system_vars.c')

/** 격자 한 칸 → 화면 픽셀 */
const numbers = (body) => [...body.matchAll(/-?\d+/g)].map((m) => Number(m[0]))
const posX = numbers(arrayBody(mapSrc, 'mapPositionsX[]'))
const posY = numbers(arrayBody(mapSrc, 'mapPositionsY[]'))

// 자리표가 한 칸 6픽셀로 고르게 놓였는지 잰다 — 손으로 옮기다 한 줄 빠지면 여기서 걸린다
const STEP = 6
for (let i = 1; i < posX.length; i++) {
  if (posX[i] - posX[i - 1] !== STEP) throw new Error(`가로 ${i}칸째가 ${posX[i] - posX[i - 1]}픽셀 뛴다`)
}
// 세로는 앞 다섯 칸이 0이다(지도 위쪽 밖) — 그 뒤부터 재야 한다
const firstY = posY.findIndex((v) => v !== 0)
for (let i = firstY + 1; i < posY.length; i++) {
  if (posY[i] - posY[i - 1] !== STEP) throw new Error(`세로 ${i}칸째가 ${posY[i] - posY[i - 1]}픽셀 뛴다`)
}

/** 밭 118곳. 같은 자리가 이어지면 원작이 건너뛴다 */
const berryBody = arrayBody(berrySrc, 'sBerryPositions[]')
const patches = [...berryBody.matchAll(/\{\s*(\d+),\s*(\d+)\s*\}/g)].map((m) => [Number(m[1]), Number(m[2])])

/** 숨은 자리 넷 — 지도에 픽셀로 직접 적혀 있다 */
const hiddenBody = arrayBody(mapSrc, 'hiddenLocationPositions[]')
const hiddenPos = [...hiddenBody.matchAll(/\{\s*(\d+),\s*(\d+)\s*\}/g)].map((m) => [Number(m[1]), Number(m[2])])
const hiddenNames = [...enumValues('generated/hidden_locations.txt').keys()]
  .filter((n) => n !== 'HIDDEN_LOCATION_MAX')
const magicBody = arrayBody(varsSrc, 'sHiddenLocationMagicNumbers[]')
const magic = hiddenNames.map((name) => {
  const m = magicBody.match(new RegExp(`\\[${name}\\]\\s*=\\s*(0x[0-9a-fA-F]+|\\d+)`))
  if (!m) throw new Error(`${name}의 확인 값을 못 찾았다`)
  return Number(m[1])
})
if (hiddenPos.length !== hiddenNames.length) {
  throw new Error(`숨은 자리가 ${hiddenNames.length}개인데 좌표는 ${hiddenPos.length}개다`)
}

/** 확인 변수의 첫 번호 */
const vars = enumValues('generated/vars_flags.txt')
const varFirst = vars.get('VAR_HIDDEN_LOCATION_FULL_MOON_ISLAND')
if (varFirst === undefined) throw new Error('VAR_HIDDEN_LOCATION_FULL_MOON_ISLAND가 없다')
for (const [i, name] of ['VAR_HIDDEN_LOCATION_NEW_MOON_ISLAND', 'VAR_HIDDEN_LOCATION_SPRING_PATH', 'VAR_HIDDEN_LOCATION_SEABREAK_PATH'].entries()) {
  if (vars.get(name) !== varFirst + i + 1) throw new Error(`${name}이 ${varFirst}에서 ${i + 1}칸 뒤가 아니다`)
}

/** 행렬 한 칸의 타일 수 (`MAP_TILES_COUNT_X`) */
const tilesMatch = read('include/constants/field/map.h').match(/#define\s+MAP_TILES_COUNT_X\s+(\d+)/)
if (!tilesMatch) throw new Error('MAP_TILES_COUNT_X를 못 찾았다')
const TILES = Number(tilesMatch[1])

const rows = patches.map(([x, y]) => `  [${x}, ${y}],`).join('\n')
const hidden = hiddenNames.map((name, i) =>
  `  { name: '${name.slice('HIDDEN_LOCATION_'.length).toLowerCase()}', x: ${hiddenPos[i][0]}, y: ${hiddenPos[i][1]}, magic: ${magic[i]} },`).join('\n')

const out = `// 포켓치 지도 위의 자리 — 자동 생성 (\`pnpm gen:poketchmap\`)
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 \`tools/extract/poketchMapModule.cjs\`가
// 다시 만든다. 근거와 재는 법은 DATA.md §2.28.

/** 격자 한 칸이 몇 픽셀 뛰는가. 가로세로가 같다 */
export const POKETCH_MAP_STEP = ${STEP}

/** 격자 한 칸 → 화면 픽셀 (\`mapPositionsX\`) */
export const POKETCH_MAP_X: readonly number[] = [${posX.join(', ')}]

/**
 * 격자 한 칸 → 화면 픽셀 (\`mapPositionsY\`).
 *
 * ⚠️ **앞 ${firstY}칸이 0이다** — 지도 위쪽 밖이라 안 쓴다. 0을 좌표로 믿으면
 * 신오 북쪽 맵이 전부 화면 맨 위에 겹친다
 */
export const POKETCH_MAP_Y: readonly number[] = [${posY.join(', ')}]

/** 그 앞칸은 안 쓴다 */
export const POKETCH_MAP_Y_FIRST = ${firstY}

/** 격자 한 칸이 맵 한 장이다 (\`MAP_TILES_COUNT_X\`) */
export const POKETCH_MAP_TILES = ${TILES}

/**
 * 나무열매 밭 ${patches.length}곳의 격자 자리 (\`sBerryPositions\`).
 *
 * ⚠️ **밭 번호 차례 그대로다.** 같은 자리가 이어지면 원작이 건너뛰므로
 * (\`GetReadyBerryPatches\`) 실제로 찍히는 점은 ${new Set(patches.map((p) => p.join(','))).size}곳이다
 */
export const POKETCH_BERRY_SPOTS: readonly (readonly [number, number])[] = [
${rows}
]

export interface PoketchHiddenSpot {
  readonly name: string
  /** 격자가 아니라 화면 픽셀이다 — 원작이 직접 적어 두었다 */
  readonly x: number
  readonly y: number
  /** 변수가 이 값일 때만 지도에 뜬다 (\`sHiddenLocationMagicNumbers\`) */
  readonly magic: number
}

/** 숨은 자리 넷 (\`PoketchMap_GetHiddenLocationPosition\`) */
export const POKETCH_HIDDEN_SPOTS: readonly PoketchHiddenSpot[] = [
${hidden}
]

/** 첫 확인 변수. 넷이 나란히 있다 */
export const VAR_HIDDEN_LOCATION_FIRST = ${varFirst}
`

fs.writeFileSync(OUT, out)
console.log(`poketchMapTable.ts — 격자 ${posX.length}×${posY.length} · 밭 ${patches.length}곳(자리 ${new Set(patches.map((p) => p.join(','))).size}) · 숨은 자리 ${hiddenNames.length}`)
console.log(`  한 칸 ${STEP}픽셀 · 세로 앞 ${firstY}칸은 안 쓴다 · 확인 변수 ${varFirst}부터`)
