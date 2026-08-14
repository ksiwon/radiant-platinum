// 장막백화점 4층의 진화 창구 (PARITY §12.1)
//
// ⚠️ **원작은 여기서 별장 가구를 판다** (`PokeMartDecor` → `MART_TYPE_DECOR` →
// `VeilstoneDeptStoreDecorationStocks`). 그 별장이 §9로 나가면서 **창구가
// 비었다** — 문도 대사도 계산대 소리도 전부 롬 것 그대로인데 팔 물건만 없다.
//
// ⚠️ **왜 하필 여기인가.** 지하통로(§9)가 원작에서 화석·진화의돌·조각을
// 캐던 밭이었다. 그것을 접었으니 그 넷이 갈 데가 없어졌는데, **새 사람을 세우면
// 롬에 없는 대사를 지어내야 한다.** 이미 있는 계산대에 재고만 얹으면 지어낼 글이
// 하나도 없다.
//
// ⚠️ **리본신드롬이 아니다.** 거기가 비긴 했지만(리본이 §9로 나갔다) 그 건물
// 스크립트에는 `PokeMart`가 한 줄도 없다 — 돈을 받고 **리본을 붙이는** 제 스크립트를
// 쓴다. 가게로 바꾸려면 스크립트와 대사를 새로 써야 해서 안 한다.
import { ITEM_LINKING_CORD, ITEM_PRISM_SCALE } from './extraItems'

/**
 * 원작이 이 명령에 넘기는 두 값 (`MART_DECOR_ID_VEILSTONE_4F_UP` · `_DOWN`).
 *
 * 4층에 계산대가 둘인데 재고가 같다 — 원작도 둘 다 같은 표를 본다
 */
export const DECOR_MART_IDS = [0, 1] as const

/**
 * 화석 일곱 (`ITEM_ROOT_FOSSIL` … `ITEM_SKULL_FOSSIL`).
 *
 * ⚠️ **차례는 도구 번호순이다.** 되살리는 쪽의 표(`world/fossil`)는 차례가
 * 다른데 그쪽은 목록의 줄 차례라서 그렇다 — 여기는 진열이라 번호순으로 둔다
 */
export const FOSSILS = [99, 100, 101, 102, 103, 104, 105] as const

/**
 * 진화의 돌 아홉.
 *
 * ⚠️ **원작은 이 돌들을 어디서도 안 판다** — 특산 표 스무 벌을 다 훑어도 없고,
 * 숨은 도구가 종류마다 한두 곳뿐이다(빛·어둠·각성은 **각 1곳**). 계속 캐던 곳이
 * 지하통로였다
 */
export const EVOLUTION_STONES = [80, 81, 82, 83, 84, 85, 107, 108, 109] as const

/**
 * 이 창구가 파는 것.
 *
 * ⚠️ **값은 롬의 도구 자료에 있는 것을 쓴다** — 우리가 정하지 않는다.
 * 롬 밖의 둘만 값이 없어서 진화의돌과 같은 2,100원으로 적어 두었다
 * (`bag/extraItems`)
 */
export const EVOLUTION_COUNTER_STOCK: readonly number[] = [
  ...FOSSILS,
  ...EVOLUTION_STONES,
  ITEM_LINKING_CORD,
  ITEM_PRISM_SCALE,
]

/** 그 번호가 이 창구인가. 원작이 넘기는 값은 둘뿐이다 */
export function isDecorMart(martID: number): boolean {
  return (DECOR_MART_IDS as readonly number[]).includes(martID)
}
