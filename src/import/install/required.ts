// 게임을 시작하려면 무엇이 있어야 하는가 (IMPORT.md §8)
//
// ⚠️ **"구현된 그룹"과 "필수 그룹"을 혼동하지 않는다.** 한때 `runInstall`이
// `groupsReady()`(= 변환기가 있는 그룹)만 돌리고 `state: 'ready'`를 적었다.
// 그때 구현된 것은 `moves` 하나였으므로, 그 설치본은 기술 471개만 든 채
// "준비 완료"였다. 그걸로 게임을 켜면 첫 화면에서 종족 표가 없다.
//
// 두 목록은 **다른 것을 뜻하고 다른 속도로 자란다** — 구현 목록은 우리가
// 옮길수록 늘고, 필수 목록은 게임이 무엇을 읽는지에 따라 정해진다. 여기 있는
// 것은 후자다.

/** Platinum 롬에서 나와야 하는 것 */
export const REQUIRED_PLATINUM_GROUPS = [
  'text',      // 이름·대사. 없으면 첫 화면 글자가 없다
  'species',   // 종족 표. 없으면 파티도 배틀도 못 만든다
  'moves',     // 기술 표
  'maps',      // 맵 헤더·행렬. 없으면 설 자리가 없다
  'chunks',    // 지형 메시·프롭·텍스처
  'scripts',   // 이벤트·대화
  'marts',     // 상점 재고 (ARM9에서 읽는다 — DATA.md §2.13)
  'sound',     // 음악·효과음
  'pokegra',   // 포켓몬 도트
] as const

/**
 * BDSP에서 나와야 하는 것.
 *
 * ⚠️ **목록을 줄여서 `ready`에 도달하게 만들지 않는다.** 그러면 3D가 통째로 빈
 * 설치본이 "완료"가 된다. 셋 다 `bdsp/convert.ts`가 만든다
 */
export const REQUIRED_BDSP_GROUPS = [
  'npcModels',  // 사람 모델
  'monModels',  // 포켓몬 모델
  'arenas',     // 배틀 무대
] as const

export const REQUIRED_GROUPS: readonly string[] = [
  ...REQUIRED_PLATINUM_GROUPS,
  ...REQUIRED_BDSP_GROUPS,
]

/** 필수인데 아직 없는 것 */
export function missingRequired(have: Iterable<string>): string[] {
  const set = new Set(have)
  return REQUIRED_GROUPS.filter((g) => !set.has(g))
}
