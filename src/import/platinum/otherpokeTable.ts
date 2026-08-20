// 폼 그림이 `pl_otherpoke.narc` 어디에 있는가 (DATA.md §2.17.1)
//
// ⚠️ **손으로 고치지 않는다.** `pnpm gen:otherpokeTable`이 디컴프에서 다시 만든다
// (`tools/extract/otherpokeTableModule.cjs`).
//
// 원작은 종족마다 산술로 자리를 낸다 (`BuildPokemonSpriteTemplate`). 그 식의
// **밑수**가 여기 있는 `char`·`pal`이고, 등록 차례대로 폼 수만큼 쌓아서 센 값이다.
// **여기 담기는 것은 색인 번호뿐이다** — 그림도 색도 이름도 없다 (COPYRIGHT.md §2).

interface OtherpokeRow {
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

/** 그림 154칸 + 팔레트 94칸 + 공용 5칸 = 253칸 */
export const OTHERPOKE: readonly OtherpokeRow[] = [
  { species: 386, forms: 4, char: 0, pal: 154, sharedPalette: true }, // deoxys
  { species: 201, forms: 28, char: 8, pal: 156, sharedPalette: true }, // unown
  { species: 351, forms: 4, char: 64, pal: 158, backsThenFronts: true, normalsThenShinies: true }, // castform
  { species: 412, forms: 3, char: 72, pal: 166 }, // burmy
  { species: 413, forms: 3, char: 78, pal: 172 }, // wormadam
  { species: 422, forms: 2, char: 84, pal: 178, backsThenFronts: true }, // shellos
  { species: 423, forms: 2, char: 88, pal: 182, backsThenFronts: true }, // gastrodon
  { species: 421, forms: 2, char: 92, pal: 186, backsThenFronts: true, normalsThenShinies: true }, // cherrim
  { species: 493, forms: 18, char: 96, pal: 190 }, // arceus
  { species: 494, forms: 2, char: 132, pal: 226, frontOnly: true }, // egg
  { species: 492, forms: 2, char: 134, pal: 228 }, // shaymin
  { species: 479, forms: 6, char: 138, pal: 232 }, // rotom
  { species: 487, forms: 2, char: 150, pal: 244 }, // giratina
]

/** 아카이브 파일 수. 안 맞으면 롬이 다른 판이다 */
export const OTHERPOKE_FILES = 253

/**
 * 그 폼의 그림 칸. 없으면 null (알의 뒷모습).
 *
 * 원작 식을 표로 푼 것이다 — `72 + (face / 2) + form * 2`에서 `face`는
 * 뒤 0 · 앞 2다 (`FACE_BACK`·`FACE_FRONT`)
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
