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

interface FieldMoveSpec {
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

/**
 * 파티에 그 기술을 아는 마리가 있는가 (`Party_HasMonWithMove`, `unk_02054884.c` 86–101).
 *
 * ⚠️ **알은 건너뛴다** — `MON_DATA_IS_EGG`를 먼저 보고 `continue`한다
 */
export function partyHasMonWithMove(
  party: readonly { isEgg?: boolean; moves: readonly { move: number }[] }[], move: number,
): boolean {
  return party.some((mon) => !mon.isEgg && mon.moves.some((s) => s.move === move))
}

/** 자격 (`FieldMoves_Check*`). 뱃지 하나와 파티 하나가 전부다 */
export interface Trainer {
  /** 뱃지 비트마스크 */
  badges: number
  /** 이 기술을 아는 파티원이 있는가 (`Party_HasMonWithMove`) */
  knows: (move: number) => boolean
}

type FieldMoveDenial = 'badge' | 'party'

/** 못 쓰는 이유. 쓸 수 있으면 null */
export function whyNot(id: FieldMoveId, who: Trainer): FieldMoveDenial | null {
  const spec = FIELD_MOVES[id]
  if (spec.badge !== null && (who.badges & (1 << spec.badge)) === 0) return 'badge'
  if (!who.knows(spec.move)) return 'party'
  return null
}

/** 파티 화면에서 비전기술을 못 쓰는 까닭 (`FIELD_MOVE_ERROR_*`). `state`는 「이미 파도타기 중」이다 */
type MenuFieldDenial = FieldMoveDenial | 'notHere' | 'partner' | 'state'

/**
 * 파티 화면에서 앞 칸 기술을 쓸 수 있는가 (`FieldMoves_CheckSurf` · `_CheckRockSmash` · `_CheckRockClimb` 따위, `field_move_tasks.c`).
 *
 * 차례가 자료다 — 뱃지 → (기술마다 다른 상태) → **자리** → 동행:
 * - 파도타기 408–431: 뱃지 → **이미 탐 = `STATE`** → 자리 → 동행
 * - 바위깨기 539–560: 뱃지 → **탄 채 = `LOCATION`**(상태 줄이 따로 없다) → 자리
 * - 락클라임 625–648: 뱃지 → 자리 → **동행**
 * - 나머지: 뱃지 → 자리
 *
 * ⚠️ 파티(`party`)는 원작 검사에 없다 — 원작은 그 기술을 아는 마리의 갈래에만 줄을 띄운다. 맨 앞에서 본다
 */
export function menuFieldMoveDenial(
  id: FieldMoveId, who: Trainer, spot: FieldSpot, hasPartner: boolean,
): MenuFieldDenial | null {
  const denial = whyNot(id, who)
  if (denial !== null) return denial
  if (id === 'surf' && spot.surfing) return 'state'
  if (id === 'rockSmash' && spot.surfing) return 'notHere'
  if (!movesUsableHere(spot).includes(id)) return 'notHere'
  if ((id === 'surf' || id === 'rockClimb') && hasPartner) return 'partner'
  return null
}

/**
 * 공중날기를 못 쓰는 까닭 (`FieldMoves_CheckFly`의 `FIELD_MOVE_ERROR_*`).
 *
 * `notHere`가 `LOCATION`(「여기서는 쓸 수 없습니다」), `partner`가 `PARTNER`
 * (「함께 걷고 있을 때는 쓸 수 없습니다!」)다
 */
export type FlyDenial = FieldMoveDenial | 'notHere' | 'partner'

/** 날려는 자리의 사정 — 원작 검사가 보는 셋이다 */
interface FlyPlace {
  /** 맵 헤더의 `isFlyAllowed` (`MapHeader_IsFlyAllowed`) */
  flyAllowed: boolean
  /** 누가 따라다니는가 (`SystemFlag_CheckHasPartner`) */
  hasPartner: boolean
  /** 사파리 놀이 중인가 (`SystemFlag_CheckSafariGameActive`) */
  inSafari: boolean
}

/**
 * 공중날기를 쓸 수 있는가 (`FieldMoves_CheckFly`, `field_move_tasks.c` 367).
 *
 * 원작 차례 그대로다 — 뱃지 → **맵 헤더** → 동행 → 사파리·팔파크. 헤더가
 * 막는 곳이 593개 맵 중 515곳이다: 실내·굴·깨어진 세계 열한 층이 다 그렇다.
 * 이것이 없으면 깨어진 세계 한복판에서도 날아서 빠져나간다 (REPAIR §91).
 *
 * ⚠️ 파티(`party`)는 원작 검사에 없다 — 원작은 그 기술을 아는 마리의 갈래
 * 메뉴에만 「공중날기」를 띄우므로 물을 일이 없다. 우리 시작 메뉴의 지름길이
 * 그 자리를 대신 본다. 팔파크는 우리에게 없다
 */
export function flyDenial(who: Trainer, place: FlyPlace): FlyDenial | null {
  const denial = whyNot('fly', who)
  if (denial !== null) return denial
  if (!place.flyAllowed) return 'notHere'
  if (place.hasPartner) return 'partner'
  if (place.inSafari) return 'notHere'
  return null
}

/**
 * 앞 칸에 대고 A를 눌렀을 때 걸리는 기술 (`Field_TileBehaviorToScript`, `field_control.c` 650–698).
 *
 * ⚠️ **폭포와 락클라임 벽은 자격을 안 본다.** 폭포는 **무조건** 스크립트 6, 벽은 방향만 맞으면 **무조건** 3이다 —
 * 뱃지나 기술이 없으면 그 스크립트가 「물의 벽이다」(`WallOfWater`) · 「바위 벽…」(`RockyWallWillMoveScale`)를 띄운다.
 * 순서도 원작 그대로 **폭포 → 락클라임 → 파도타기**다. 파도타기만 뱃지와 파티를 보고, 모자라면 아무 반응이 없다.
 * 나머지(나무·바위·큰바위)는 객체가 제 스크립트를 건다
 */
export function tileMoveFor(spot: FieldSpot, who: Trainer): FieldMoveId | null {
  const usable = movesUsableHere({ ...spot, fog: false, dark: false })
  if (usable.includes('waterfall')) return 'waterfall'
  if (usable.includes('rockClimb')) return 'rockClimb'
  return fieldMoveHere({ ...spot, fog: false, dark: false }, who)
}

/**
 * 헤엄치며 남쪽으로 폭포에 부딪치면 묻지도 않고 **내려간다** (`ov5_021E04A8`, `ov5_021DFB54.c` 843–859).
 *
 * ⚠️ **오르는 것이 아니다.** 원작 검사는 `dir != DIR_SOUTH`(1)이면 돌아가고, 내려가는 쪽 태스크
 * (`sWaterfallTasksDescend`, 컷인 없이 96프레임)로 간다. 오르는 쪽(북)은 A 키 스크립트 6번뿐이다.
 * 조건은 탄 채 · 앞 칸이 폭포 · **파티에 폭포오르기가 있을 것** 셋이고 뱃지는 안 본다
 * (`field_control.c` 214의 `Party_HasMonWithMove(MOVE_WATERFALL)`)
 */
export function autoDescendsWaterfall(spot: FieldSpot, partyKnowsWaterfall: boolean): boolean {
  return spot.surfing
    && partyKnowsWaterfall
    && spot.frontBehavior === TILE_BEHAVIOR_WATERFALL
    // 사분면 0이 +z(남)다
    && spot.quarter === 0
}

/**
 * 이동 쪽(`actor/player`)이 장면 쪽(`script/field`)을 부르는 다리. 이동 코드가 스크립트 엔진을 불러들이면 순환이라
 * 장면 쪽이 올라올 때 여기에 걸어 둔다
 */
export const fieldMoveBridge: { waterfallDescent: (() => boolean) | null } = { waterfallDescent: null }

/** 지금 여기서 실제로 나가는 기술. 없으면 null */
export function fieldMoveHere(spot: FieldSpot, who: Trainer): FieldMoveId | null {
  return movesUsableHere(spot).find((id) => whyNot(id, who) === null) ?? null
}

/**
 * 뱃지가 없는 필드 기술 — **기술 창에서만** 나간다 (`field_move_tasks.c`의 `FIELD_MOVE_TELEPORT` 이후).
 *
 * 기술 번호는 `generated/moves.txt`의 줄 번호다. 파티 화면이 기술 칸에 이 여섯을 비전기술과 **같은 줄에**
 * 띄운다 (`sFieldMoves`). 수다는 녹음이다 — 마이크가 없으면 게임 소리를 배운다(`audio/chatotRecord`)
 */
export type MenuMoveId = 'teleport' | 'dig' | 'sweetScent' | 'milkDrink' | 'softboiled' | 'chatter'

export const MENU_MOVES: Readonly<Record<MenuMoveId, { move: number }>> = {
  teleport: { move: 100 },
  dig: { move: 91 },
  sweetScent: { move: 230 },
  milkDrink: { move: 208 },
  softboiled: { move: 135 },
  chatter: { move: 448 },
}

/** `MAP_TYPE_TOWN_CITY` (`data/map_headers.h`의 `enum MapType`) */
const MAP_TYPE_TOWN_CITY = 1
/** `MAP_TYPE_CAVE` */
const MAP_TYPE_CAVE = 3

/** 뱃지 없는 기술이 보는 자리의 사정 */
interface MenuMovePlace {
  /** `MapHeader_IsFlyAllowed` */
  flyAllowed: boolean
  /** `MapHeader_GetMapType` */
  mapType: number
  /** `MapHeader_IsEscapeRopeAllowed` */
  escapeRopeAllowed: boolean
  hasPartner: boolean
  inSafari: boolean
  /** 깨어진 세계인가 (`PersistedMapFeatures_IsCurrentDynamicMap(…, DYNAMIC_MAP_FEATURES_DISTORTION_WORLD)`) */
  inDistortion: boolean
}

/**
 * 못 쓰는 까닭 (`FieldMoves_CheckTeleport` · `_CheckDig` · `_CheckSweetScent`). 쓸 수 있으면 null.
 *
 * - 순간이동: 헤더가 날기를 허락하고 **마을이 아니어야** 한다(`MapHeader_IsTeleportAllowed`) → 동행 → 사파리
 * - 구멍파기: **굴이고 탈출로프를 허락해야** 한다 → 동행
 * - 달콤한향기: 통신방·팔파크만 막는다. 날씨는 쓴 **뒤에** 본다 (`ov5_021F0438`)
 * - 우유마시기·알낳기: 검사가 없다 — 체력은 파티 화면이 본다 (`PartyMenu_StartFieldMoveHPTransfer`)
 * - 수다: 통신방과 **깨어진 세계**만 막는다 (`FieldMoves_CheckChatter`)
 */
export function menuMoveDenial(id: MenuMoveId, place: MenuMovePlace): 'notHere' | 'partner' | null {
  switch (id) {
    case 'teleport':
      if (!place.flyAllowed || place.mapType === MAP_TYPE_TOWN_CITY) return 'notHere'
      if (place.hasPartner) return 'partner'
      if (place.inSafari) return 'notHere'
      return null
    case 'dig':
      if (place.mapType !== MAP_TYPE_CAVE || !place.escapeRopeAllowed) return 'notHere'
      if (place.hasPartner) return 'partner'
      return null
    case 'chatter':
      return place.inDistortion ? 'notHere' : null
    default:
      return null
  }
}

/** 기술 번호 → 뱃지 없는 기술. 아니면 null */
export function menuMoveOf(move: number): MenuMoveId | null {
  return (Object.keys(MENU_MOVES) as MenuMoveId[]).find((k) => MENU_MOVES[k].move === move) ?? null
}
