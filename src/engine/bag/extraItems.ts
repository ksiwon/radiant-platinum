// 롬에 없는 도구 둘 (PARITY §12)
//
// ⚠️ **이 파일만 롬 밖이다.** 나머지 468종은 전부 `pl_item_data.narc`에서 뽑는데
// (DATA.md §2.12) 여기 둘은 플래티넘에 없는 물건이라 우리가 적는다.
//
// ⚠️ **왜 더하는가.** 원작이 열어 두었던 진화 길 둘이 §9 때문에 막혔다 —
// 교환 진화 열둘은 통신이, 빈티나는 콘테스트가 열던 것이다. **문턱을 낮추거나
// 없애는 대신** 시리즈가 나중에 같은 문제에 내놓은 답을 빌린다. 원작에 없던
// 재미를 보태는 것이 아니다.
//
// ⚠️ **번호는 롬 표 뒤에 잇는다.** 468종이 0~467을 쓰므로 468부터다 — 롬 번호를
// 덮어쓰면 그 자리의 진짜 도구가 사라진다.
import type { Item } from '../../data/schema'

/** `pl_item_data.narc`가 채우는 마지막 번호 다음 */
export const FIRST_EXTRA_ITEM = 468

/** 교환 진화를 대신 여는 도구 (레전드 아르세우스) */
export const ITEM_LINKING_CORD = 468

/** 빈티나를 밀로틱으로 (5세대) */
export const ITEM_PRISM_SCALE = 469

/**
 * 이름과 설명. **롬이 준 글이 아니라 우리가 적은 것**이라 여기 둔다 —
 * `names/items.*.json`에 끼워 넣으면 어느 줄이 롬 것인지 구별이 사라진다.
 *
 * 일본어는 시리즈가 쓰는 표기를 그대로 적었다 (つながりのヒモ · きれいなウロコ)
 */
export const EXTRA_ITEM_NAMES: Readonly<Record<string, readonly string[]>> = {
  ko: ['연결의끈', '고운비늘'],
  en: ['Linking Cord', 'Prism Scale'],
  ja: ['つながりのヒモ', 'きれいなウロコ'],
}

export const EXTRA_ITEM_DESCRIPTIONS: Readonly<Record<string, readonly string[]>> = {
  ko: [
    '통신교환을 했을 때처럼\n포켓몬을 진화시키는 끈.',
    '무지개색으로 빛나는\n아주 아름다운 비늘.',
  ],
  en: [
    'A cord that evolves a POKéMON\nas if it had been traded.',
    'A scale that shines a rainbow\nof colors. Very beautiful.',
  ],
  ja: [
    'つうしんこうかんしたときのように\nポケモンを しんかさせる ヒモ。',
    'にじいろに かがやく\nとても うつくしい ウロコ。',
  ],
}

/**
 * 두 도구의 자료.
 *
 * ⚠️ **아이콘은 빌린 것이다.** 롬 아틀라스에 이 둘의 그림이 없으므로 뜻이 가까운
 * 것을 쓴다 — 연결의 끈은 이상한사탕 자리(끈 그림이 없다), 고운 비늘은
 * **하트비늘**(93번)의 것이다. 새 그림을 그리지 않는다.
 *
 * ⚠️ **`fieldUseFunc`가 진화의돌과 같다** (`FieldUse.EVO_STONE` = 20). 그래야
 * 가방에서 고르면 파티 화면이 열리고, 그 자리에서 걸리는 마리에게 쓴다
 */
export const EXTRA_ITEMS: readonly Item[] = [
  {
    name: 'linking_cord',
    constant: 'ITEM_LINKING_CORD',
    dataID: ITEM_LINKING_CORD,
    // 이상한사탕(50)의 아이콘·팔레트를 빌린다
    icon: 90,
    palette: 91,
    price: 2100,
    holdEffect: 0,
    effectParam: 0,
    pluckEffect: 0,
    flingEffect: 0,
    flingPower: 30,
    naturalGiftPower: 0,
    naturalGiftType: 31,
    preventToss: 0,
    canRegister: 0,
    // 0 = 일반 도구 주머니. 진화의돌이 사는 곳이다
    pocket: 0,
    battlePocket: 0,
    fieldUseFunc: 20,
    battleUseFunc: 0,
    partyUse: 0,
    param: null,
  },
  {
    name: 'prism_scale',
    constant: 'ITEM_PRISM_SCALE',
    dataID: ITEM_PRISM_SCALE,
    // 하트비늘(93)의 아이콘·팔레트를 빌린다
    icon: 138,
    palette: 139,
    price: 2100,
    holdEffect: 0,
    effectParam: 0,
    pluckEffect: 0,
    flingEffect: 0,
    flingPower: 30,
    naturalGiftPower: 0,
    naturalGiftType: 31,
    preventToss: 0,
    canRegister: 0,
    pocket: 0,
    battlePocket: 0,
    fieldUseFunc: 20,
    battleUseFunc: 0,
    partyUse: 0,
    param: null,
  },
]

/**
 * 어느 도구의 아이콘 칸을 빌리는가.
 *
 * ⚠️ **아틀라스는 도구 번호로 찾는다** (`ui/menu/itemIcon`). 468·469 칸에는
 * 그림이 없으므로 그리는 자리에서 이 표로 갈아 끼운다 — 자료의 `icon` 칸을
 * 고치는 것으로는 안 된다
 */
export const ICON_BORROWED_FROM: Readonly<Record<number, number>> = {
  [ITEM_LINKING_CORD]: 50, // 이상한사탕
  [ITEM_PRISM_SCALE]: 93, // 하트비늘
}

/** 롬 표 뒤에 두 줄을 잇는다. 앞의 468줄은 손대지 않는다 */
export function withExtraItems<T>(rom: readonly T[], extra: readonly T[]): T[] {
  return [...rom, ...extra]
}
