// 조각 넷 (PARITY §12.3)
//
// 기술가르침이 값으로 받는 물건이다 (`PayShardCost`) — 선단시티·212번도로·
// 서바이벌에리어의 셋이 이것을 센다.
//
// ⚠️ **번호를 여기 한 번만 적는다.** 가게 재고와 값 표 두 곳에서 쓰는데
// 각자 적으면 한쪽만 고쳐도 아무도 모른다

/** `ITEM_RED_SHARD` — 빨강조각 */
export const ITEM_RED_SHARD = 72
/** `ITEM_BLUE_SHARD` — 파랑조각 */
export const ITEM_BLUE_SHARD = 73
/** `ITEM_YELLOW_SHARD` — 노랑조각 */
export const ITEM_YELLOW_SHARD = 74
/** `ITEM_GREEN_SHARD` — 초록조각 */
export const ITEM_GREEN_SHARD = 75

/** 넷. 도구 번호순이고 원작 열거형 차례와 같다 */
export const SHARDS: readonly number[] = [
  ITEM_RED_SHARD, ITEM_BLUE_SHARD, ITEM_YELLOW_SHARD, ITEM_GREEN_SHARD,
]
