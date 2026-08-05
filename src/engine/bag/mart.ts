// 상점 재고 (DATA.md §2.12)
//
// 포켓몬센터 옆 상점은 **뱃지를 딸수록 물건이 늘어난다.** 재고표의
// `requiredBadges`는 뱃지 개수가 아니라 계단 번호고, 그 계단은
// `ScrCmd_PokeMartCommon`이 뱃지 수에서 만든다:
//
//     뱃지 0개 → 1 · 1~2 → 2 · 3~4 → 3 · 5~6 → 4 · 7 → 5 · 8 → 6
//
// 뱃지 두 개를 따야 슈퍼볼이 들어오고, 세 개째에 하이퍼볼이 들어온다.
// 이 사다리를 잘못 옮기면 첫 상점에 회복약이 다 깔린다.
import type { MartTable } from '../../data/schema'

/**
 * 뱃지 수 → 재고 계단.
 *
 * 원작의 `switch (badgeNum)`를 그대로 편 것이다. 9개 이상은 못 나오지만
 * 원작도 `default: 1`로 받으므로 같이 둔다
 */
export function stockTier(badges: number): number {
  if (badges < 0 || badges > 8) return 1
  return [1, 2, 2, 3, 3, 4, 4, 5, 6][badges]!
}

/** 뱃지 비트마스크에서 개수를 센다. 원작도 8칸을 하나씩 훑는다 */
export function badgeCount(mask: number): number {
  let n = 0
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) n++
  return n
}

/** 지금 살 수 있는 일반 상점 물건. 표에 적힌 순서를 지킨다 */
export function commonStock(table: MartTable, badgeMask: number): number[] {
  const tier = stockTier(badgeCount(badgeMask))
  return table.common.filter((c) => tier >= c.tier).map((c) => c.item)
}

/** 지역 상점. 번호는 `generated/mart_specialties_id.txt`의 줄 순서다 */
export function specialtyStock(table: MartTable, martID: number): number[] {
  return table.specialties[martID] ?? []
}
