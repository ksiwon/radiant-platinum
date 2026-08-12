// 도감의 정렬·거르기 목록 (PARITY §5 `pokedex`)
//
// 원작 도감은 순서를 **계산하지 않는다.** `zukan_data.narc`에 정렬된 목록
// 마흔여섯 벌이 통째로 구워져 있고, 화면은 그것과 「본 적 있는 종」의 교집합만
// 낸다 (`pokedex_sort.c`의 `PokedexFromNARC` → `IntersectPokedexes`).
//
// 우리가 무게·키로 다시 정렬하면 **같은 값끼리의 차례가 달라진다** — 493종
// 중에 몸무게가 같은 짝이 여럿이고, 원작 목록은 그 동률까지 정해 두었다.
// 그래서 계산하지 않고 목록을 그대로 옮긴다.
//
// ⚠️ **로케일마다 다르다.** 가나다순과 첫 글자 거르기 아홉이 언어에 매인다 —
// 미국판은 ABC·DEF…, 한국판은 가·나·다… 순이다. 세 롬에서 각각 뽑는다.
'use strict'
const { openRom, writeJson, LOCALES } = require('./rom')
const sources = require('../raw/sources.cjs')

const NARC = '/application/zukanlist/zkn_data/zukan_data.narc'
/** `pokedex_sort.c`의 `NUMSTATFILES` — 앞쪽 열한 칸은 키·몸무게 표다 */
const NUMSTATFILES = 11

/**
 * `enum PokedexDataSortIndex` 그대로. 자리가 곧 NARC 멤버 번호 − 11이다.
 *
 * ⚠️ **이름 거르기 아홉 칸의 이름은 미국판 기준이다.** 한국 롬에서는 같은
 * 자리가 가·나·다… 뭉치를 가리킨다 — 뜻이 아니라 **자리**가 규약이라 그대로 둔다
 */
const SORTS = [
  'national', 'sinnoh',
  'alphabetical', 'heaviest', 'lightest', 'tallest', 'smallest',
  'nameAbc', 'nameDef', 'nameGhi', 'nameJkl', 'nameMno',
  'namePqr', 'nameStu', 'nameVwx', 'nameYz',
  'typeNormal', 'typeFighting', 'typeFlying', 'typePoison', 'typeGround',
  'typeRock', 'typeBug', 'typeGhost', 'typeSteel', 'typeFire',
  'typeWater', 'typeGrass', 'typeElectric', 'typePsychic', 'typeIce',
  'typeDragon', 'typeDark',
  'shapeQuadruped', 'shapeBipedalTailless', 'shapeBipedalTailed', 'shapeSerpentine',
  'shapeMultiWinged', 'shapeWinged', 'shapeInsectoid', 'shapeHeadBase',
  'shapeHeadArms', 'shapeHeadLegs', 'shapeTentacles', 'shapeFins',
  'shapeHead', 'shapeMultiBody',
]

/** 몸 모양 열넷. 거르기 목록의 자리와 짝이 맞는다 */
const SHAPE_FIRST = SORTS.indexOf('shapeQuadruped')
const SHAPE_COUNT = 14

function readLists(rom) {
  const narc = rom.narc(NARC)
  const out = {}
  for (const [i, name] of SORTS.entries()) {
    const buf = narc[NUMSTATFILES + i]
    if (!buf) throw new Error(`${NARC}에 ${String(NUMSTATFILES + i)}번 멤버가 없다`)
    out[name] = Array.from({ length: buf.length / 2 }, (_, k) => buf.readUInt16LE(k * 2))
  }
  return out
}

/**
 * 종족 → 몸 모양 (0~13).
 *
 * 원작은 이 표를 안 갖고 목록 열넷을 그냥 쓰지만, 우리 화면은 고른 종의
 * 모양을 되물을 일이 있어서 역표를 같이 낸다. 두 벌이 어긋나지 않게
 * **목록에서 만들어 낸다**
 */
function shapeOf(lists) {
  const out = new Array(494).fill(-1)
  for (let s = 0; s < SHAPE_COUNT; s++) {
    for (const species of lists[SORTS[SHAPE_FIRST + s]]) out[species] = s
  }
  return out
}

function main() {
  const written = {}
  for (const locale of LOCALES) {
    const rom = openRom(sources.requirePlatinumRom(locale === 'en' ? 'en' : locale))
    const lists = readLists(rom)
    // 몸 모양은 언어와 무관하다 — 세 롬이 같아야 한다
    const shapes = shapeOf(lists)
    const file = writeJson(`pokedexSort.${locale}.json`, { lists, shapes })
    written[locale] = file

    // 국가도감이 493, 신오가 210이 아니면 멤버 번호가 밀린 것이다
    if (lists.national.length !== 493) {
      throw new Error(`${locale}: 전국도감 목록이 ${String(lists.national.length)}칸이다`)
    }
    if (lists.sinnoh.length !== 210) {
      throw new Error(`${locale}: 신오도감 목록이 ${String(lists.sinnoh.length)}칸이다`)
    }
    // 몸 모양 열넷이 493종을 빠짐없이 나눠 갖는다
    const unshaped = shapes.slice(1).filter((v) => v < 0).length
    if (unshaped) throw new Error(`${locale}: 몸 모양이 없는 종이 ${String(unshaped)}개다`)

    console.log(`도감 정렬 ${locale}: 목록 ${SORTS.length}벌 → ${file.rel} (${file.kb}KB)`)
  }
  const en = written.en
  console.log(`  전국 493 · 신오 210 · 몸 모양 ${SHAPE_COUNT}갈래 (${en.kb}KB × ${LOCALES.length})`)
}

if (require.main === module) main()
module.exports = { SORTS, SHAPE_COUNT, readLists }
