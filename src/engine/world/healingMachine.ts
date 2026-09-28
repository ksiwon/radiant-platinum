// 회복기 위에 볼이 놓이는 연출의 박자 (`overlay006/healing_machine_animation/` · PARITY §8.11)
//
// 원작은 필드 작업 하나로 여섯 걸음을 밟고, 스크립트는 **그 작업이 끝날 때까지 선다**
// (`ScrCmd_PlayPokecenterHealingAnimation`이 TRUE를 돌린다):
//
//   START                 틱 0 — 미니 몬스터볼(517)과 화면(124)의 클립을 한 번짜리로 싣는다
//   ADD_POKEBALL          볼 하나를 얹는다 · `SEQ_SE_DP_BOWA` (센터만)
//   WAIT_FOR_POKEBALL     `pokeballTicks < 15`면 하나 센다 — 열다섯 틱을 세고 열여섯째 틱에 다음 볼로 넘긴다
//   PLAY_FINAL_ANIMATION  볼과 화면의 클립을 튼다 · 팡파르 `SEQ_ASA` (센터만)
//   WAIT_FOR_FINAL        두 클립이 한 바퀴를 다 돌고 팡파르가 끝나야 볼을 치운다
//   CLEAN_UP              다음 틱에 작업이 끝난다
//
// 그래서 볼 i는 틱 `1 + 17i`에 놓이고, 마지막 볼 뒤 열여섯 틱을 기다린 다음 틱(`17n + 1`)에 클립이 돈다.
// 명예의 전당(`hall_of_fame.c`)은 같은 박자에 **소리와 화면이 없다**.
//
// ⚠️ **볼이 없어도 하나는 얹는다.** `ADD_POKEBALL`은 마릿수를 보기 전에 먼저 돈다 — 알만 있는 파티는
// 원작도 볼 하나를 얹는다

/** `pokecenter_healing_machine_nsbmd` */
export const HEALING_MACHINE_MODEL = 123
/** `pokecenter_healing_machine_tv_nsbmd` — 회복기 옆 화면. 클립이 미룬 적재라 저절로 안 돈다 */
export const HEALING_SCREEN_MODEL = 124
/** `pokemon_league_hall_of_fame_machine_nsbmd` */
export const HALL_OF_FAME_MACHINE_MODEL = 507
/** `pokecenter_healing_machine_mini_pokeball_nsbmd` */
export const HEALING_BALL_MODEL = 517

/** `SEQ_SE_DP_BOWA` — 볼 하나가 놓일 때 */
export const SFX_HEAL_BALL = 1534
/** `SEQ_ASA` — 회복 팡파르 */
export const SEQ_HEAL_FANFARE = 1166

/** 센터 · 명예의 전당. 명예의 전당은 소리도 화면도 없다 */
export type HealingKind = 'center' | 'hallOfFame'

/** `HEALING_MACHINE_ANIMATION_POKEBALL_MAX_TICKS` */
const POKEBALL_MAX_TICKS = 15
/** 볼 하나에 드는 틱 — 얹는 틱 하나 + 세는 열다섯 + 넘기는 하나 */
export const HEAL_BALL_TICKS = POKEBALL_MAX_TICKS + 2

/** 얹을 볼 수 — 적어도 하나, 많아야 여섯 */
export function healBallCount(count: number): number {
  return Math.min(6, Math.max(1, Math.floor(count)))
}

/** 볼 i가 놓이는 틱 */
export function healBallTick(i: number): number {
  return 1 + HEAL_BALL_TICKS * i
}

/** 볼과 화면의 클립이 도는 틱 */
export function healFinalTick(count: number): number {
  return HEAL_BALL_TICKS * healBallCount(count) + 1
}

/** 이 틱까지 놓인 볼 수 */
export function healBallsPlaced(count: number, tick: number): number {
  const n = healBallCount(count)
  if (tick < healBallTick(0)) return 0
  return Math.min(n, Math.floor((tick - 1) / HEAL_BALL_TICKS) + 1)
}

/** 유닛 → 칸 (소품 정점이 타일이다) */
const UNITS_PER_TILE = 16
/** `HEALING_MACHINE_ANIMATION_POKEBALL_OFFSET_POSITIVE` — 4.5유닛 */
const SIDE = 4.5 / UNITS_PER_TILE
/** `..._OFFSET_Y_ALL` — 12유닛 */
const RISE = 12 / UNITS_PER_TILE

/**
 * 볼 i가 회복기 자리에서 얼마나 떨어져 있나(칸). 원작 표 차례 그대로다 —
 * 위 왼쪽 · 위 오른쪽 · 가운데 왼쪽 · 가운데 오른쪽 · 아래 왼쪽 · 아래 오른쪽
 */
export function healBallOffset(i: number): readonly [x: number, y: number, z: number] {
  const x = i % 2 === 0 ? -SIDE : SIDE
  const z = [-SIDE, 0, SIDE][Math.floor(i / 2)] ?? 0
  return [x, RISE, z]
}
