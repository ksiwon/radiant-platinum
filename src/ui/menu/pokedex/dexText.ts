// 도감의 롬 글 줄 번호와 글을 읽는 작은 규칙들 — 도감 뱅크 697 (`TEXT_BANK_POKEDEX`).
//
// 우리가 한 글자도 안 짓는다. 줄 번호는 `res/text/bank/pokedex.h`의 `pl_msg_pokedex_*` 차례다.
import { wrapCursor } from '../useMenuKeys'
import { FILTER_NAME_COUNT } from '../../../engine/pokemon/dexSort'

/** 도감 뱅크의 줄 번호 */
export const DEX_LINE = {
  /** 「서식지 불명」 (`pl_msg_pokedex_areaunknown`) — 원작이 분포 지도 위에 띄운다 */
  areaUnknown: 35,
  /** 아침 · 낮 · 밤 (`pl_msg_pokedex_morning` …) */
  timeFirst: 36,
  chorus: 41,
  pan: 42,
  heightCheck: 43,
  weightCheck: 44,
  /** 검색 줄 이름표: 이름 · 타입 · 형태 · 순서 */
  searchName: 47,
  searchType: 48,
  searchForm: 49,
  searchOrder: 50,
  /** 「-」 — 안 거른 칸 */
  none: 53,
  /** 「조건을 충족하는 포켓몬이 발견되지 않았습니다…」 */
  noResult: 93,
  /** 주인공 키 · 몸무게 (루카스 · 쿠미) */
  lucasHeight: 95,
  dawnHeight: 96,
  lucasWeight: 97,
  dawnWeight: 98,
  /** 안 본 칸의 이름 「-----」 */
  blank: 99,
  /** 검색 중 결과 수 「발견한 수」 */
  found: 109,
} as const

/**
 * 정렬 여섯의 이름표 — 도감 뱅크 81~86 (`pl_msg_pokedex_numerical` … `_smallest`).
 * 원작이 `pl_msg_pokedex_numerical + sortOrder`로 읽는다 (`pokedex_search.c`의 `SortOrderMessage`) —
 * 그래서 자리가 `SortOrder` 차례 그대로다
 */
const SORT_TEXT_FIRST = 81

/**
 * 검색 줄마다의 설명 — 도감 뱅크 87~90 (`pokedex_search.c`의 `DescriptionMessage`).
 * 원작의 갈래는 넷(`enum FilterMethod`)이라 차례 · 이름 · 타입 · 모양에 하나씩이고,
 * 타입 두 줄은 같은 설명을 쓴다. 맨 위 「도감」 줄은 원작 검색에 없는 우리 줄이라
 * 롬 설명이 없다 — 지어 붙이지 않는다
 */
const SEARCH_HELP_TEXT: readonly (number | null)[] = [
  null,
  90, // FM_ORDER  `pl_msg_pokedex_listing_description`
  87, // FM_NAME   `pl_msg_pokedex_alphabetical_description`
  88, // FM_TYPE   `pl_msg_pokedex_type_description`
  88,
  89, // FM_FORM   `pl_msg_pokedex_body_description`
]

/** 정렬 이름표. 뱅크가 아직 안 왔으면 빈 글이다 */
export function sortLabel(sort: number, ui: readonly string[]): string {
  return ui[SORT_TEXT_FIRST + sort] ?? ''
}

/** 검색 창 그 줄의 설명. 롬에 없는 줄이거나 뱅크가 아직 안 왔으면 빈 글이다 */
export function searchHelp(row: number, ui: readonly string[]): string {
  const at = SEARCH_HELP_TEXT[row] ?? null
  return at === null ? '' : ui[at] ?? ''
}

/**
 * 이름 뭉치 아홉의 이름표 자리 — 도감 뱅크 54~62 (`pl_msg_pokedex_abc` … `_yz`,
 * `FilterNameMessage`).
 *
 * ⚠️ **글자도 뭉치 수도 로케일마다 다르다.** 미국판은 ABC … YZ 아홉, 일본판은
 * あいうえお … らりるれろ 아홉인데, 한국판은 ᄀᄂ · ᄃᄅ · ᄆᄇ · ᄉᄋ · ᄌᄎ · ᄏᄐ · ᄑᄒ
 * **일곱**이고 61·62는 빈 줄이다. 목록도 맞춰서 `nameVwx`·`nameYz`가 0종이다
 * (실측 · 한국 롬 `zukan_data.narc`). 각 뭉치 첫 음절의 초성이 이름표와 맞는지는
 * `pokedexNameGroups.test.ts`가 지킨다
 */
export const NAME_TEXT_FIRST = 54

/**
 * 첫소리 자모(U+1100~) → 홀로 쓰는 자모. 롬은 첫소리 자모를 쓰는데, 글꼴이
 * 그것을 음절 조각으로 그려 「ᄀᄂ」가 깨져 보인다
 */
const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'

/**
 * 롬의 이름 뭉치 이름표를 화면 글로. 한국판 「ᄀᄂ」는 「ㄱ·ㄴ」이 된다 —
 * 붙여 쓰면 「ㄱㄴ」이 줄임말처럼 읽힌다. 다른 로케일은 그대로다
 */
export function nameGroupLabel(raw: string): string {
  const out: string[] = []
  let jamo = false
  for (const ch of raw.trim()) {
    const at = ch.charCodeAt(0) - 0x1100
    const isJamo = at >= 0 && at < CHOSEONG.length
    if (isJamo && jamo) out.push('·')
    out.push(isJamo ? CHOSEONG[at]! : ch)
    jamo = isJamo
  }
  return out.join('')
}

/**
 * 이름 거르기를 한 칸 옮긴다. ⚠️ **이름표가 빈 자리는 건너뛴다** — 한국판의
 * 여덟째·아홉째는 이름표도 목록도 비어 있어서, 고르면 빈 칸에 빈 결과가 뜬다.
 * `ui`가 아직 안 왔으면 아홉 자리를 다 돈다
 */
export function stepNameFilter(at: number, delta: number, ui: readonly string[]): number {
  const slots = [0]
  for (let i = 1; i < FILTER_NAME_COUNT; i++) {
    if (!ui.length || (ui[NAME_TEXT_FIRST + i - 1] ?? '').trim() !== '') slots.push(i)
  }
  const here = Math.max(0, slots.indexOf(at))
  return slots[wrapCursor(here, delta, slots.length)]!
}
