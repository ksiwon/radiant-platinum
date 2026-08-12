// 도감의 정렬과 거르기 (PARITY §5) — `applications/pokedex/pokedex_sort.c`
//
// ⚠️ **차례를 계산하지 않는다.** 원작은 정렬된 목록 마흔일곱 벌을 롬에 구워
// 두고 「본 적 있는 종」과 교집합만 낸다. 무게로 다시 정렬하면 **같은 무게끼리의
// 차례**가 달라지는데, 493종 중에 그런 짝이 여럿이다.
//
// 규칙의 요점 셋:
//
//   ① 정렬은 **목록 차례**로 훑는다 — 그래서 결과가 그 목록의 순서가 된다
//   ② 거르기는 **지금 차례**로 훑는다 — 그래서 앞서 고른 정렬이 살아남는다
//   ③ ⚠️ **가나다순 말고는 「본 적만 있는」 종이 빠진다** — 무게도 키도
//      잡아 봐야 아는 것이라, 원작이 `keepUncaught`를 가나다순에만 켠다

/** `enum SortOrder` */
export const SortOrder = {
  NUMERICAL: 0, ALPHABETICAL: 1, HEAVIEST: 2, LIGHTEST: 3, TALLEST: 4, SMALLEST: 5,
} as const
export const SORT_ORDER_COUNT = 6

/** `enum FilterName` — 0은 「안 거른다」 */
export const FILTER_NAME_COUNT = 10
/** `enum FilterType` — 0은 「안 거른다」, 그다음이 노말이다 */
export const FILTER_TYPE_COUNT = 18
/** `enum FilterForm` — 원작이 form이라 부르지만 실은 **몸 모양**이다 */
export const FILTER_SHAPE_COUNT = 15

/** `zukan_data.narc`에서 뽑은 목록들. 이름은 `tools/extract/pokedexSort.js`가 준다 */
export interface DexLists {
  readonly [name: string]: readonly number[] | undefined
}

/** 정렬 갈래 → 목록 이름. 0(번호순)은 목록이 없다 */
const SORT_LIST: readonly (string | null)[] = [
  null, 'alphabetical', 'heaviest', 'lightest', 'tallest', 'smallest',
]

/** 이름 뭉치 아홉. 0은 「안 거른다」 */
const NAME_LIST: readonly (string | null)[] = [
  null, 'nameAbc', 'nameDef', 'nameGhi', 'nameJkl', 'nameMno',
  'namePqr', 'nameStu', 'nameVwx', 'nameYz',
]

const TYPE_LIST: readonly (string | null)[] = [
  null, 'typeNormal', 'typeFighting', 'typeFlying', 'typePoison', 'typeGround',
  'typeRock', 'typeBug', 'typeGhost', 'typeSteel', 'typeFire',
  'typeWater', 'typeGrass', 'typeElectric', 'typePsychic', 'typeIce',
  'typeDragon', 'typeDark',
]

const SHAPE_LIST: readonly (string | null)[] = [
  null, 'shapeQuadruped', 'shapeBipedalTailless', 'shapeBipedalTailed', 'shapeSerpentine',
  'shapeMultiWinged', 'shapeWinged', 'shapeInsectoid', 'shapeHeadBase',
  'shapeHeadArms', 'shapeHeadLegs', 'shapeTentacles', 'shapeFins',
  'shapeHead', 'shapeMultiBody',
]

/**
 * ⚠️ **타입 거르기의 자리가 타입 번호와 다르다.** 거르기 표는 ???(9번)을
 * 빼고 강철을 여덟째에 붙여 놨다 — 그대로 타입 번호로 쓰면 강철을 고르면
 * 불꽃이 나온다. 화면이 그 사이를 옮길 때 이 표를 본다
 */
export const FILTER_TYPE_OF: readonly number[] = [
  1,  // 노말 0
  2,  // 격투 1
  3,  // 비행 2
  4,  // 독 3
  5,  // 땅 4
  6,  // 바위 5
  7,  // 벌레 6
  8,  // 고스트 7
  9,  // 강철 8
  0,  // ??? 9 — 거르기 표에 없다
  10, // 불꽃 10
  11, // 물 11
  12, // 풀 12
  13, // 전기 13
  14, // 에스퍼 14
  15, // 얼음 15
  16, // 드래곤 16
  17, // 악 17
]

export interface DexQuery {
  /** 전국도감인가 */
  national: boolean
  sort: number
  name: number
  type1: number
  type2: number
  shape: number
}

export const NO_FILTER: DexQuery = {
  national: false, sort: SortOrder.NUMERICAL, name: 0, type1: 0, type2: 0, shape: 0,
}

/** 정렬도 거르기도 안 걸었는가 — 그때만 빈 칸이 남는다 */
export function isPlain(q: DexQuery): boolean {
  return q.sort === SortOrder.NUMERICAL && q.name === 0 && q.type1 === 0 && q.type2 === 0
    && q.shape === 0
}

export interface DexEntry {
  species: number
  /** 안 본 자리. 번호순일 때만 생긴다 */
  blank: boolean
}

/**
 * 도감 목록 한 벌 (`PokedexSort_Sort`).
 *
 * `seen`·`caught`는 종족 번호를 받는 물음이다
 */
export function dexList(
  lists: DexLists, q: DexQuery,
  seen: (species: number) => boolean, caught: (species: number) => boolean,
): DexEntry[] {
  const full = lists[q.national ? 'national' : 'sinnoh'] ?? []
  // ① 본 적 있는 것만 남긴다. 차례는 아직 도감 번호순이다
  let now = full.filter((s) => seen(s))

  // ② 정렬 — **목록 차례로** 훑는다. 그래서 결과가 그 목록의 순서가 된다
  const sortName = SORT_LIST[q.sort] ?? null
  if (sortName !== null) {
    const order = lists[sortName] ?? []
    const keepUncaught = q.sort === SortOrder.ALPHABETICAL
    const have = new Set(now)
    now = order.filter((s) => have.has(s) && (keepUncaught || caught(s)))
  }

  // ③ 거르기 셋 — **지금 차례로** 훑는다. 앞서 고른 정렬이 살아남는다
  for (const [table, at] of [
    [NAME_LIST, q.name], [TYPE_LIST, q.type1], [TYPE_LIST, q.type2], [SHAPE_LIST, q.shape],
  ] as const) {
    const listName = table[at] ?? null
    if (listName === null) continue
    const allow = new Set(lists[listName] ?? [])
    now = now.filter((s) => allow.has(s))
    if (!now.length) return []
  }

  // ④ 아무것도 안 걸었으면 **빈 칸을 남긴다** — 번호가 어긋나면 안 된다
  if (!isPlain(q)) return now.map((species) => ({ species, blank: false }))
  const have = new Set(now)
  return full.map((species) => ({ species, blank: !have.has(species) }))
}
