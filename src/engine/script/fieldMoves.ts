// 비전머신 — 필드 기술 (DATA.md §2.10)
//
// 원작은 이 판단을 두 군데로 나눠 놓았다.
//
//  ① `FieldMoves_SetUsableMoves`가 **지금 여기서 무엇이 통하는가**를 정한다.
//     앞에 선 객체의 그림 번호, 앞 칸의 거동, 지금 날씨 셋만 본다.
//  ② `FieldMoves_Check*`가 **쓸 자격이 있는가**를 본다. 뱃지 하나와
//     `Party_HasMonWithMove` 하나다.
//
// 그 둘을 그대로 옮긴다. 뱃지도 기술 번호도 지어내지 않았다 —
// 뱃지는 `generated/badges.txt`의 줄 번호, 기술은 `generated/moves.txt`의
// 줄 번호이고, 기술 아홉은 우리 한국어 이름표(`names/moves.ko.json`)와도
// 아홉 개가 다 맞는다.
import { isSurfable } from '../map/zone'
import { OBSTACLE_MOVE } from '../actor/obstacles'

/** `generated/badges.txt`의 줄 번호. 순서가 곧 획득 순서다 */
export const BADGE = {
  /** 무쇠뱃지 — 무쇠시티 */
  coal: 0,
  /** 숲뱃지 — 영원시티 */
  forest: 1,
  /** 자갈뱃지 — 연고시티 */
  cobble: 2,
  /** 습지뱃지 — 장막시티 */
  fen: 3,
  /** 유물뱃지 — 나루시티 */
  relic: 4,
  /** 광산뱃지 — 운하시티 */
  mine: 5,
  /** 빙설뱃지 — 눈시티 */
  icicle: 6,
  /** 등대뱃지 — 안개시티 */
  beacon: 7,
} as const

export type FieldMoveId =
  | 'cut' | 'fly' | 'surf' | 'strength' | 'defog'
  | 'rockSmash' | 'waterfall' | 'rockClimb' | 'flash'

export interface FieldMoveSpec {
  /** 기술 번호 (`generated/moves.txt`) */
  move: number
  /** 요구 뱃지 (`FieldMoves_Check*`). 플래시만 뱃지를 안 본다 */
  badge: number | null
  label: string
}

/**
 * 필드 기술 아홉.
 *
 * 뱃지 짝은 `field_move_tasks.c`의 `PlayerHasRequiredBadge` 호출 그대로다.
 * 눈으로 짝지은 것이 하나도 없다 — 예컨대 괴력이 무쇠(광산일 것 같은 이름)가
 * 아니라 **광산뱃지**를 요구하고, 바위깨기가 **무쇠뱃지**다. 뒤집힌 것처럼
 * 보이지만 원작이 그렇다
 */
export const FIELD_MOVES: Readonly<Record<FieldMoveId, FieldMoveSpec>> = {
  cut: { move: 15, badge: BADGE.forest, label: '풀베기' },
  fly: { move: 19, badge: BADGE.cobble, label: '공중날기' },
  surf: { move: 57, badge: BADGE.fen, label: '파도타기' },
  strength: { move: 70, badge: BADGE.mine, label: '괴력' },
  defog: { move: 432, badge: BADGE.relic, label: '안개제거' },
  rockSmash: { move: 249, badge: BADGE.coal, label: '바위깨기' },
  waterfall: { move: 127, badge: BADGE.beacon, label: '폭포오르기' },
  rockClimb: { move: 431, badge: BADGE.icicle, label: '락클라임' },
  flash: { move: 148, badge: null, label: '플래시' },
}

/** `TILE_BEHAVIOR_WATERFALL`. 이름이 값을 안 담아서 앞뒤 `UNUSED_x12`·`x14`가 가둔다 */
export const TILE_BEHAVIOR_WATERFALL = 0x13
/** `TILE_BEHAVIOR_ROCK_CLIMB_N_S` · `_E_W`. 남북 벽과 동서 벽이 따로다 */
export const TILE_BEHAVIOR_ROCK_CLIMB_NS = 0x4b
export const TILE_BEHAVIOR_ROCK_CLIMB_EW = 0x4c

/**
 * 락클라임은 **벽의 방향과 보는 방향이 맞아야** 한다 (`PlayerAvatar_CanUseRockClimb`).
 *
 * 사분면은 `facing`을 90°로 나눈 것이다 — 0 +z(남) · 1 +x(동) · 2 −z(북) · 3 −x(서)
 */
export function canRockClimb(behavior: number, quarter: number): boolean {
  const northSouth = quarter === 0 || quarter === 2
  return behavior === (northSouth ? TILE_BEHAVIOR_ROCK_CLIMB_NS : TILE_BEHAVIOR_ROCK_CLIMB_EW)
}

/** 지금 서 있는 자리의 사정. 원작 `FieldMoveContext`가 모으는 것과 같다 */
export interface FieldSpot {
  /** 앞 칸의 타일 거동 */
  frontBehavior: number
  /** 앞 칸에 선 객체의 그림 번호. 없으면 null */
  frontSprite: number | null
  /** 보는 사분면 */
  quarter: number
  /** 이미 파도타기 중인가 (`FieldMoves_CheckSurf`가 상태를 본다) */
  surfing: boolean
  /** 안개가 꼈는가 (`OVERWORLD_WEATHER_FOG`) */
  fog?: boolean
  /** 캄캄한가 (`OVERWORLD_WEATHER_DARK_FLASH`) */
  dark?: boolean
}

/**
 * 여기서 통하는 기술 (`FieldMoves_SetUsableMoves`).
 *
 * 자격은 안 본다 — 뱃지와 파티는 `canUseHere`가 뒤에서 본다. 원작도 둘로
 * 나뉘어 있고, 그래서 "쓸 수는 있는데 뱃지가 없다"를 따로 말해 줄 수 있다
 */
export function movesUsableHere(spot: FieldSpot): FieldMoveId[] {
  const out: FieldMoveId[] = []
  const obstacle = spot.frontSprite === null ? undefined : OBSTACLE_MOVE[spot.frontSprite]
  if (obstacle) out.push(obstacle)
  // 파도타기는 **탄 채로는 안 뜬다** (`FieldMoves_CheckSurf`의 STATE 갈래)
  if (!spot.surfing && isSurfable(spot.frontBehavior)) out.push('surf')
  if (canRockClimb(spot.frontBehavior, spot.quarter)) out.push('rockClimb')
  if (spot.frontBehavior === TILE_BEHAVIOR_WATERFALL) out.push('waterfall')
  if (spot.fog) out.push('defog')
  if (spot.dark) out.push('flash')
  return out
}

/** 자격 (`FieldMoves_Check*`). 뱃지 하나와 파티 하나가 전부다 */
export interface Trainer {
  /** 뱃지 비트마스크 */
  badges: number
  /** 이 기술을 아는 파티원이 있는가 (`Party_HasMonWithMove`) */
  knows: (move: number) => boolean
}

export type FieldMoveDenial = 'badge' | 'party'

/** 못 쓰는 이유. 쓸 수 있으면 null */
export function whyNot(id: FieldMoveId, who: Trainer): FieldMoveDenial | null {
  const spec = FIELD_MOVES[id]
  if (spec.badge !== null && (who.badges & (1 << spec.badge)) === 0) return 'badge'
  if (!who.knows(spec.move)) return 'party'
  return null
}

/** 지금 여기서 실제로 나가는 기술. 없으면 null */
export function fieldMoveHere(spot: FieldSpot, who: Trainer): FieldMoveId | null {
  return movesUsableHere(spot).find((id) => whyNot(id, who) === null) ?? null
}
