// 4세대 타입 상성 (PLAN §7.7)
//
// **판정은 안 한다.** 실제 배틀은 @pkmn/sim이 재고, 여기 있는 표는 결과가 나오기
// 전에 "이 기술이 통할까"를 미리 재 보는 쪽이 쓴다 — AI(`ai/score`)와 기술 칸의
// 상성 표시(`movePreview`) 둘이다. sim과 조금이라도 어긋나면 화면이 말하는 것과
// 실제로 벌어지는 일이 갈리므로, `typeChart.test.ts`가 324쌍 전부를
// `Dex.forGen(4)`와 대조해 그것을 막는다.
//
// 색인은 롬 타입 번호다. 우리 기술·종족 데이터가 전부 이 번호로 돌기 때문에
// 이름으로 오갈 일이 없다.

/** 롬 타입 번호. 9번은 표에만 있고 아무도 안 쓰는 자리다(???) */
export const TYPE = {
  NORMAL: 0,
  FIGHTING: 1,
  FLYING: 2,
  POISON: 3,
  GROUND: 4,
  ROCK: 5,
  BUG: 6,
  GHOST: 7,
  STEEL: 8,
  MYSTERY: 9,
  FIRE: 10,
  WATER: 11,
  GRASS: 12,
  ELECTRIC: 13,
  PSYCHIC: 14,
  ICE: 15,
  DRAGON: 16,
  DARK: 17,
} as const

export const TYPE_COUNT = 18

/**
 * 표준(1배)이 아닌 칸만 적는다.
 *
 * 324칸을 다 적으면 1배가 306칸이라 오타가 숨는다. 예외만 적으면 눈으로 읽히고,
 * 빠뜨린 칸은 1배가 되어 테스트에서 바로 걸린다
 */
const EXCEPTIONS: Record<number, [number, number][]> = {
  [TYPE.NORMAL]: [[TYPE.ROCK, 0.5], [TYPE.GHOST, 0], [TYPE.STEEL, 0.5]],
  [TYPE.FIGHTING]: [
    [TYPE.NORMAL, 2], [TYPE.FLYING, 0.5], [TYPE.POISON, 0.5], [TYPE.ROCK, 2],
    [TYPE.BUG, 0.5], [TYPE.GHOST, 0], [TYPE.STEEL, 2], [TYPE.PSYCHIC, 0.5],
    [TYPE.ICE, 2], [TYPE.DARK, 2],
  ],
  [TYPE.FLYING]: [
    [TYPE.FIGHTING, 2], [TYPE.ROCK, 0.5], [TYPE.BUG, 2], [TYPE.STEEL, 0.5],
    [TYPE.GRASS, 2], [TYPE.ELECTRIC, 0.5],
  ],
  [TYPE.POISON]: [
    [TYPE.POISON, 0.5], [TYPE.GROUND, 0.5], [TYPE.ROCK, 0.5], [TYPE.GHOST, 0.5],
    [TYPE.STEEL, 0], [TYPE.GRASS, 2],
  ],
  [TYPE.GROUND]: [
    [TYPE.FLYING, 0], [TYPE.POISON, 2], [TYPE.ROCK, 2], [TYPE.BUG, 0.5],
    [TYPE.STEEL, 2], [TYPE.FIRE, 2], [TYPE.GRASS, 0.5], [TYPE.ELECTRIC, 2],
  ],
  [TYPE.ROCK]: [
    [TYPE.FIGHTING, 0.5], [TYPE.FLYING, 2], [TYPE.GROUND, 0.5], [TYPE.BUG, 2],
    [TYPE.STEEL, 0.5], [TYPE.FIRE, 2], [TYPE.ICE, 2],
  ],
  [TYPE.BUG]: [
    [TYPE.FIGHTING, 0.5], [TYPE.FLYING, 0.5], [TYPE.POISON, 0.5], [TYPE.GHOST, 0.5],
    [TYPE.STEEL, 0.5], [TYPE.FIRE, 0.5], [TYPE.GRASS, 2], [TYPE.PSYCHIC, 2],
    [TYPE.DARK, 2],
  ],
  [TYPE.GHOST]: [
    [TYPE.NORMAL, 0], [TYPE.GHOST, 2], [TYPE.STEEL, 0.5], [TYPE.PSYCHIC, 2],
    [TYPE.DARK, 0.5],
  ],
  [TYPE.STEEL]: [
    [TYPE.ROCK, 2], [TYPE.STEEL, 0.5], [TYPE.FIRE, 0.5], [TYPE.WATER, 0.5],
    [TYPE.ELECTRIC, 0.5], [TYPE.ICE, 2],
  ],
  [TYPE.MYSTERY]: [],
  [TYPE.FIRE]: [
    [TYPE.ROCK, 0.5], [TYPE.BUG, 2], [TYPE.STEEL, 2], [TYPE.FIRE, 0.5],
    [TYPE.WATER, 0.5], [TYPE.GRASS, 2], [TYPE.ICE, 2], [TYPE.DRAGON, 0.5],
  ],
  [TYPE.WATER]: [
    [TYPE.GROUND, 2], [TYPE.ROCK, 2], [TYPE.FIRE, 2], [TYPE.WATER, 0.5],
    [TYPE.GRASS, 0.5], [TYPE.DRAGON, 0.5],
  ],
  [TYPE.GRASS]: [
    [TYPE.FLYING, 0.5], [TYPE.POISON, 0.5], [TYPE.GROUND, 2], [TYPE.ROCK, 2],
    [TYPE.BUG, 0.5], [TYPE.STEEL, 0.5], [TYPE.FIRE, 0.5], [TYPE.WATER, 2],
    [TYPE.GRASS, 0.5], [TYPE.DRAGON, 0.5],
  ],
  [TYPE.ELECTRIC]: [
    [TYPE.FLYING, 2], [TYPE.GROUND, 0], [TYPE.WATER, 2], [TYPE.GRASS, 0.5],
    [TYPE.ELECTRIC, 0.5], [TYPE.DRAGON, 0.5],
  ],
  [TYPE.PSYCHIC]: [
    [TYPE.FIGHTING, 2], [TYPE.POISON, 2], [TYPE.STEEL, 0.5], [TYPE.PSYCHIC, 0.5],
    [TYPE.DARK, 0],
  ],
  [TYPE.ICE]: [
    [TYPE.FLYING, 2], [TYPE.GROUND, 2], [TYPE.STEEL, 0.5], [TYPE.FIRE, 0.5],
    [TYPE.WATER, 0.5], [TYPE.GRASS, 2], [TYPE.ICE, 0.5], [TYPE.DRAGON, 2],
  ],
  [TYPE.DRAGON]: [[TYPE.STEEL, 0.5], [TYPE.DRAGON, 2]],
  [TYPE.DARK]: [
    // 강철이 악을 반감하는 것은 6세대에 없어진다. 4세대에는 있다
    [TYPE.FIGHTING, 0.5], [TYPE.GHOST, 2], [TYPE.STEEL, 0.5], [TYPE.PSYCHIC, 2],
    [TYPE.DARK, 0.5],
  ],
}

/** 공격 타입 × 방어 타입 한 칸. 색인 계산은 한 번만 하고 나머지는 이걸 본다 */
const CHART = ((): Float64Array => {
  const t = new Float64Array(TYPE_COUNT * TYPE_COUNT).fill(1)
  for (const [atk, rows] of Object.entries(EXCEPTIONS)) {
    for (const [def, mult] of rows) t[Number(atk) * TYPE_COUNT + def] = mult
  }
  return t
})()

/** 한 타입 대 한 타입. 0 / 0.5 / 1 / 2 */
export function typeMultiplier(moveType: number, defenderType: number): number {
  if (moveType < 0 || moveType >= TYPE_COUNT) return 1
  if (defenderType < 0 || defenderType >= TYPE_COUNT) return 1
  return CHART[moveType * TYPE_COUNT + defenderType]!
}

/**
 * 기술 타입 대 상대 타입 전부. 0 / 0.25 / 0.5 / 1 / 2 / 4.
 *
 * 같은 타입을 두 번 들고 있는 종족이 있으므로(단일 타입은 두 칸이 같다) 중복은
 * 한 번만 곱한다 — 안 그러면 강철톤이 격투에 4배를 맞는다
 */
export function effectivenessOf(moveType: number, defenderTypes: readonly number[]): number {
  let mult = 1
  const seen = new Set<number>()
  for (const t of defenderTypes) {
    if (seen.has(t)) continue
    seen.add(t)
    mult *= typeMultiplier(moveType, t)
  }
  return mult
}
