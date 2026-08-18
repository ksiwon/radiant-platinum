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
  'npcTrades', // NPC 교환 넷. 없으면 교환해 주는 사람 넷이 다 그 자리에서 죽는다
  'sound',     // 음악·효과음
  'pokegra',   // 포켓몬 도트
  'encounters', // 야생 출현표. 없으면 풀숲에서 아무것도 안 나온다
  'trainers',  // 트레이너 파티·상금. 없으면 트레이너 배틀이 안 열린다
  'spawns',    // 부활 지점·공중날기. 전멸은 첫 배틀부터 날 수 있다
  'items',     // 도구 표·이름·설명. 가방과 상점이 이걸 읽는다
  'npcSprites', // 오버월드 사람 판때기. 없으면 마을이 빈 땅이다
  'itemIcons',  // 가방 그림
  'pokeIcons',  // 파티·박스 아이콘
  'boxWallpapers', // 박스 벽지
  'poketchMap', // 포켓치 지도 화면과 액정 팔레트
  'signposts',  // 마을 이름표·도로 표지판 그림
  'starterScene', // 파트너 고르는 장면. 새 게임이 여기서 막힌다
  // ⚠️ **없으면 깨어진 세계를 못 지난다.** 그 세계의 발판은 지형이 아니라
  // 소품이라, 이 그룹이 비면 밟아야 할 판이 하나도 안 보인다 (PARITY §6.10)
  'distortionProps',
  // ⚠️ **이것 하나로 게임이 안 끝난다.** 판과 통행 격자가 없으면 그 세계에 발을
  // 디딜 자리 자체가 없다 — 밟을 판이 하나도 안 서고, 챔피언로드로 가는 길이
  // 거기서 끊긴다 (REPAIR §1.3). 나머지 여덟(도감·타운맵·나무열매·프런티어·
  // 크레딧…)은 비어도 게임이 끝나므로 필수가 아니다
  'distortion',
  'trainerSprites', // 트레이너 그림. 명예의 전당이 주인공을 여기서 꺼낸다
] as const

/**
 * BDSP에서 나와야 하는 것.
 *
 * ⚠️ **목록을 줄여서 `ready`에 도달하게 만들지 않는다.** 그러면 3D가 통째로 빈
 * 설치본이 "완료"가 된다. 넷 다 `bdsp/convert.ts`가 만든다
 */
export const REQUIRED_BDSP_GROUPS = [
  'npcModels',  // 사람 모델
  'monModels',  // 포켓몬 모델
  'arenas',     // 배틀 무대
  'motionTiming', // 종마다 다른 타격 프레임. 없으면 배틀이 첫 수에서 멈춘다
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
