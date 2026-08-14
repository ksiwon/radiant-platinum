// 상호교류광장의 표 둘 (DATA.md §2.12.2)
//
// ⚠️ **손으로 고치지 않는다** — `pnpm gen:amity`가 디컴프에서 다시 만든다
// (`tools/extract/amityModule.cjs`).

/**
 * 따라다니는 포켓몬이 주워 오는 장식 (`sMonFindableAccessories`).
 *
 * 무리 여섯에 열 자리씩이고, **자리가 곧 확률**이다 — 앞의 넷이 15%,
 * 다음 둘이 10%, 그다음 8%·5%·5%·2%다
 */
export const AMITY_FIND: readonly (readonly number[])[] = [
  [0, 5, 21, 6, 26, 13, 25, 31, 16, 33],
  [2, 19, 20, 24, 17, 0, 23, 29, 28, 15],
  [9, 8, 3, 6, 22, 30, 17, 7, 14, 32],
  [12, 18, 21, 13, 31, 8, 25, 24, 27, 7],
  [5, 3, 26, 19, 20, 1, 11, 16, 22, 15],
  [12, 30, 2, 20, 29, 4, 9, 27, 14, 10],
]

/** 자리마다의 확률(백분율). 합이 100이다 */
export const AMITY_FIND_WEIGHTS: readonly number[] = [15, 15, 15, 15, 10, 10, 8, 5, 5, 2]

/**
 * 종족 → 무리 번호. **표에 없는 종족은 0번 무리**다 (원작의 `default`).
 *
 * 상호교류광장에 들어갈 수 있는 스무 종이 여섯 무리로 갈린다
 */
export const AMITY_POOL_OF: readonly (readonly [number, number])[] = [
  [25, 4],
  [35, 4],
  [39, 5],
  [54, 3],
  [255, 5],
  [285, 5],
  [300, 5],
  [387, 2],
  [388, 2],
  [389, 2],
  [390, 0],
  [391, 0],
  [392, 0],
  [393, 1],
  [394, 1],
  [395, 1],
  [417, 4],
  [425, 3],
  [427, 3],
  [440, 4],
]

/**
 * 열매와 장식 아저씨가 주는 열여섯 (`sBerryAndAccessoryManOptions`).
 *
 * ⚠️ **앞의 아홉이 열매고 뒤의 일곱이 장식이다.** 원작이 `< 9`로만 가르므로
 * 차례를 바꾸면 열매를 장식으로 주게 된다
 */
export const AMITY_GIFTS: readonly number[] = [176, 175, 177, 178, 179, 180, 181, 182, 183, 11, 7, 10, 16, 27, 32, 33]

/** 이 번호보다 작으면 열매다 (`ScrCmd_CheckAmitySquareManGiftIsAccessory`) */
export const AMITY_FIRST_ACCESSORY_GIFT = 9
