// 모습 이름 (`formmain.c:1029-1109`) — 롬 도감 뱅크의 줄을 종마다 갈라 읽는다.
//
//   초록도롱 · 도롱마담   17 + 모습  (초목도롱 · 모래땅도롱 · 슈레도롱)
//   조개두 · 트리토돈     15 + 모습  (서쪽바다 · 동쪽바다)
//   안농                 20 「형태별 모습」 — 스물여덟이 다 같은 글이다
//   테오키스             111 + 모습  (노말폼 · 어택폼 · 디펜스폼 · 스피드폼)
//   쉐이미               115 + 모습  (랜드폼 · 스카이폼)
//   기라티나             117 + 모습  (어나더폼 · 오리진폼)
//   로토무               119 + 모습  (로토무 · 히트 · 워시 · 프로스트 · 스핀 · 커트)
//
// 캐스퐁 · 벚꼬리 · 아르세우스는 원작에도 이름이 없다(빈 줄) — 지어 붙이지 않는다.
import {
  SPECIES_BURMY, SPECIES_DEOXYS, SPECIES_GASTRODON, SPECIES_GIRATINA, SPECIES_ROTOM, SPECIES_SHAYMIN,
  SPECIES_SHELLOS, SPECIES_UNOWN, SPECIES_WORMADAM,
} from '../../../engine/pokemon/form'

/** 종 → 그 종의 첫 모습 이름이 있는 롬 줄 (모습 번호를 더한다). 안농은 모습과 상관없이 한 줄이라 따로다 */
const FIRST_LINE: ReadonlyMap<number, number> = new Map([
  [SPECIES_BURMY, 17],
  [SPECIES_WORMADAM, 17],
  [SPECIES_SHELLOS, 15],
  [SPECIES_GASTRODON, 15],
  [SPECIES_DEOXYS, 111],
  [SPECIES_SHAYMIN, 115],
  [SPECIES_GIRATINA, 117],
  [SPECIES_ROTOM, 119],
])

/** 안농의 「형태별 모습」 (`UnownFormMessage`) */
const UNOWN_LINE = 20

/** 그 모습의 이름이 있는 롬 줄. 이름이 없는 종이면 null */
export function formLine(species: number, form: number): number | null {
  if (species === SPECIES_UNOWN) return UNOWN_LINE
  const first = FIRST_LINE.get(species)
  return first === undefined ? null : first + form
}

/** 모습 이름. 이름이 없거나 뱅크가 아직 안 왔으면 빈 글이다 */
export function formName(species: number, form: number, ui: readonly string[]): string {
  const at = formLine(species, form)
  return at === null ? '' : (ui[at] ?? '').trim()
}
