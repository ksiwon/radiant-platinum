// 배틀이 열리는 순간의 **땅 이펙트** (PARITY §7.13)
//
// 풀숲을 밟으면 컷인이 돌고(`encounterCutIn`), 그 다음 배틀 화면이 서면서
// 발밑에서 풀·물·모래가 터진다. 그 터짐이 여기다.
//
// 원작은 배틀 대본의 **첫 명령**에서 튼다 — `subscript_start_encounter.s`의
// `PlayEncounterAnimation` 뒤에 `WaitTime 122`가 붙어 있고, 그 명령이
// `BattleDisplay_InitTaskSetupUI` → `SysTask_SetupUI`로 간다
// (`battle/battle_display.c` 5284줄).
//
//     프레임  1   자원 A를 세운다 · `SEQ_SE_DP_PASA2`
//            10   화면이 흰색으로 물들기 시작한다 (열여섯 걸음)
//            20   자원 B를 세운다
//            23   `SEQ_SE_DP_PASA3`
//            28   흰색이 도로 걷힌다 (열여섯 걸음)
//            50   배경 팔레트를 어둡게 물린다
//            이후 **B의 이미터가 다 죽을 때까지** 기다린다
//
// ⚠️ **자원 두 벌이 한 쌍이다.** 표가 주는 번호가 `_a`고 그 **다음 번호**가
// `_b`다 (`sTerrainFlashAnimIDs[terrain]`과 `+ 1`). `_a`는 짧게 터지고
// `_b`는 길게 흩어진다 — 실측 수명이 25프레임 대 60프레임이다.
//
// ⚠️ **이미터 수를 따로 안 싣는다.** 원작에 `resourceID - 5`로 찾는 표가
// 하나 더 있는데(`ov12_02238088`), 스물둘이 스물둘 다 그 `.spa`의 **자원
// 수와 같다**. 곧 「파일에 든 것을 다 세운다」가 그 표다 (시험이 지킨다)
import type { TerrainId } from './terrain'

/**
 * 땅 → 첫 자원 번호 (`sTerrainFlashAnimIDs`, `battle_display.c` 5231줄).
 *
 * 번호는 `waza` 묶음(`battle_particles.order`) 안의 멤버 번호다 — 기술 연출과
 * 같은 묶음이라 따로 받을 것이 없다.
 *
 * ⚠️ **다리와 시설은 실내 것을 쓴다.** 원작 표가 11번 이후를 거의 다
 * `encounter_building`(11)로 몰아넣었고 대습원 대신 **얼음**(21)이 오는 자리가
 * 하나(17 = 깨어진 세계) 있다
 */
export const TERRAIN_BURST: readonly number[] = [
  9, // 0 평지 encounter_plain_a
  23, // 1 모래 encounter_sand_a
  5, // 2 풀숲 encounter_grass_a
  19, // 3 웅덩이 encounter_puddle_a
  13, // 4 산 encounter_mountain_a
  17, // 5 굴 encounter_cave_a
  15, // 6 눈 encounter_snow_a
  7, // 7 물 encounter_water_a
  21, // 8 얼음 encounter_ice_a
  11, // 9 실내 encounter_building_a
  25, // 10 대습원 encounter_great_marsh_a
  11, // 11 다리
  11, 11, 11, 11, 11, // 12~16 사천왕 넷과 챔피언
  21, // 17 깨어진 세계 — 여기만 얼음이다
  11, 11, 11, 11, 11, 11, // 18~23 배틀 시설과 기라티나
]

/** `SysTask_SetupUI`의 마디 (프레임) */
export const BURST = {
  /** 둘째 자원이 서는 프레임 */
  second: 20,
  /** 흰색이 차기 시작하는 프레임 */
  whiteIn: 10,
  /** 흰색이 걷히기 시작하는 프레임 */
  whiteOut: 28,
  /** `PaletteData_StartFade(..., 16, ...)` — 열여섯 걸음 */
  fade: 16,
  /** 대본이 기다리는 길이 (`WaitTime 122`) */
  hold: 122,
} as const

/** 이 땅에서 쓸 자원 두 벌 */
export function burstMembers(terrain: TerrainId): [number, number] {
  const first = TERRAIN_BURST[terrain] ?? TERRAIN_BURST[0]!
  return [first, first + 1]
}

/**
 * 이 프레임에 화면이 얼마나 하얀가 (0~1).
 *
 * 열 프레임째부터 열여섯 걸음에 걸쳐 차고, 스물여덟째부터 열여섯 걸음에 걸쳐
 * 걷힌다 — 두 구간이 겹치지 않으므로 꼭대기에서 두 프레임 머문다
 */
export function burstWhite(frame: number): number {
  if (frame < BURST.whiteIn) return 0
  if (frame < BURST.whiteOut) return Math.min(1, (frame - BURST.whiteIn) / BURST.fade)
  return Math.max(0, 1 - (frame - BURST.whiteOut) / BURST.fade)
}
