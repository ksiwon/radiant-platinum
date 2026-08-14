// 배틀프런티어 교환 코너 — BP로 사는 가게 (PARITY §12.3)
//
// `ScrCmd_PokeMartFrontier`가 여는 두 창구다. 재고도 값도 **롬의 코드에 박혀
// 있고**(`scrcmd.c`의 `BattleFrontier…ExchangeServiceCorner`, `overlay007/
// shop_menu.c`의 `itemToBpPrice`) 아카이브에 없다 — 그래서 디컴프에서 옮긴다.
// 기술머신 표(`TM_MOVES`)를 옮긴 것과 같은 자리다.
//
// ⚠️ **조각 넷만 우리가 더한다** (PARITY §12.3). 원작에서 조각을 캐는 곳이
// 지하통로였는데 그쪽이 §9로 나갔다. 기술가르침이 조각으로 값을 받으므로
// (`PayShardCost`) 캘 곳이 없으면 그 계통이 통째로 막힌다.
//
// ⚠️ **BP를 벌 곳은 아직 없다.** 다섯 시설이 전부 §9라 `GiveBattlePoints`가
// 스크립트에 한 번도 안 나온다 — 원작도 시설 코드가 직접 준다. 그래서 이
// 가게는 **BP가 생기면 곧바로 도는** 배관이지 지금 열리는 길이 아니다.
// 되는 척하지 않으려고 여기 적어 둔다.
import { ITEM_RED_SHARD, ITEM_BLUE_SHARD, ITEM_YELLOW_SHARD, ITEM_GREEN_SHARD } from './shards'

/** 원작이 이 명령에 넘기는 두 값 — 0 오른쪽 창구 · 1 왼쪽 창구 */
export const FRONTIER_MART_IDS = [0, 1] as const

/** `WifiBattleTowerRecord_UpdateBattlePoints`의 상한 */
export const MAX_BATTLE_POINTS = 9999

/**
 * 오른쪽 창구 — 기술머신 열다섯.
 *
 * 차례가 원작 배열 그대로다. 값이 32·40·48·64·80으로 다섯 층이라
 * 뒤로 갈수록 비싸지는 것이 보인다
 */
export const FRONTIER_STOCK_RIGHT: readonly number[] = [
  333, 400, 388, 372, 367, 358, 335, 331, 408, 357, 380, 363, 386, 398, 353,
]

/**
 * 왼쪽 창구 — 영양제·파워 계열·지닌 도구, 그리고 **조각 넷**.
 *
 * ⚠️ **조각은 맨 뒤에 붙인다.** 앞의 스물여섯은 원작 차례라 손대지 않는다
 */
export const FRONTIER_STOCK_LEFT: readonly number[] = [
  46, 49, 47, 52, 48, 45,
  289, 290, 291, 292, 293, 294, 272, 273,
  214, 271,
  213, 220, 230, 232, 266, 275, 287, 326, 327, 50,
  ITEM_RED_SHARD, ITEM_BLUE_SHARD, ITEM_YELLOW_SHARD, ITEM_GREEN_SHARD,
]

/**
 * BP 값 (`Shop_GetItemBPPrice`). 표에 없는 도구는 0이고, 원작도 0을 준다.
 *
 * ⚠️ **조각 넷만 우리가 정했다 — 1 BP다.** 새 층을 만들지 않으려고 원작의
 * **제일 싼 층**(영양제 여섯)에 맞췄다. 지어낸 값을 최소로 두는 쪽이다
 */
export const BP_PRICE: Readonly<Record<number, number>> = {
  46: 1, 49: 1, 47: 1, 52: 1, 48: 1, 45: 1,
  289: 16, 290: 16, 291: 16, 292: 16, 293: 16, 294: 16, 272: 16, 273: 16,
  214: 32, 271: 32,
  213: 48, 220: 48, 230: 48, 232: 48, 266: 48, 275: 48, 287: 48, 326: 48, 327: 48, 50: 48,
  333: 32, 400: 32, 388: 32, 372: 32,
  367: 40, 358: 40,
  335: 48, 331: 48,
  408: 64, 357: 64, 380: 64,
  363: 80, 386: 80, 398: 80, 353: 80,
  [ITEM_RED_SHARD]: 1, [ITEM_BLUE_SHARD]: 1,
  [ITEM_YELLOW_SHARD]: 1, [ITEM_GREEN_SHARD]: 1,
}

/** 그 도구의 BP 값. 표에 없으면 0 — 원작도 0을 준다 */
export function bpPriceOf(item: number): number {
  return BP_PRICE[item] ?? 0
}

/** 그 창구의 재고. 번호는 둘뿐이다 */
export function frontierStock(martID: number): readonly number[] {
  if (martID === 0) return FRONTIER_STOCK_RIGHT
  if (martID === 1) return FRONTIER_STOCK_LEFT
  return []
}

/** 그 번호가 이 창구인가 */
export function isFrontierMart(martID: number): boolean {
  return (FRONTIER_MART_IDS as readonly number[]).includes(martID)
}

/** BP를 더한다. 상한에서 멈춘다 */
export function addBattlePoints(have: number, amount: number): number {
  return Math.min(have + amount, MAX_BATTLE_POINTS)
}

/** BP를 깎는다. 모자라면 0이 된다 — 원작이 그렇게 자른다 */
export function spendBattlePoints(have: number, amount: number): number {
  return have < amount ? 0 : have - amount
}
