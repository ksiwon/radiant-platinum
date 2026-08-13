// 현재 맵과 워프 전이 (DATA.md §2.3, §4.1)
//
// 존 전환은 두 종류다. 마을에서 도로로 걸어 나가는 것은 **전환이 아니다** —
// 같은 행렬 안에서 좌표가 이어질 뿐이라 아무것도 할 일이 없다. 문·계단만 전환이고,
// 그것이 여기서 다루는 워프다.
//
// 이 모듈은 React를 모른다. 워프를 감지하면 pending에 올려 두기만 하고, 실제 격자
// 교체(비동기 fetch가 필요하다)는 씬이 가져간다.
import type { MapGrid } from './grid'
import { worldState } from '../../state/worldState'
import { pushDirection } from '../input/move'

export interface MapHeader {
  id: number
  /** 영역 번호. `world.areas`가 텍스처·건물 모델 묶음을 준다 */
  area: number
  name: string
  matrix: number
  events: number
  /** pl_enc_data 인덱스. 야생이 없으면 null */
  encounters: number | null
  /** 지역명 인덱스 (names/locations.*.json) */
  label: number
  bgmDay: number
  bgmNight: number
  scripts: number
  /**
   * 맵 초기화 표의 파일 번호 (`engine/script/initScripts`).
   *
   * 스크립트와 **같은 NARC**이고 파일만 다르다. 이 표가 맵에 들어설 때·매
   * 프레임 무엇을 돌릴지를 정한다
   */
  initScripts: number
  msg: number
  /**
   * 맵 날씨 (`MapHeader.weather`). 0이 없음.
   *
   * 모래숨기·눈숨기가 이 값을 보고 출현률을 반으로 깎는다
   * (`engine/battle/encounterLead`)
   */
  weather: number
  /**
   * 맵 갈래 (`MapHeader.mapType`, 7비트).
   *
   * 0 없음 · 1 마을/도시 · 2 야외 · 3 동굴 · 4 실내 · 5 포켓몬센터 · 6 지하.
   * 실측으로 실내 334개 · 동굴 166개 · 야외 71개 · 마을 20개 · 지하 1개다.
   *
   * **하늘을 세울지 말지를 이 값이 정한다** (`MapHeader_IsOutdoors`)
   */
  mapType: number
  /**
   * 배틀 배경 번호 (`MapHeader.battleBG`, 5비트).
   *
   * 원작 DS는 이 번호로 배틀 2D 배경을 고른다. 593개 맵이 열여덟 가지를 쓴다 —
   * 실내가 232개로 제일 많고 동굴·도시·물가가 그 뒤다.
   *
   * **이 값이 배틀 무대를 고른다** (`battle/arena`의 `ARENA`). 열여덟 가지가
   * BDSP 무대 열여덟 벌로 이어진다 — 그 이음은 BDSP 롬이 적어 둔 것이다
   */
  battleBg: number
  /**
   * 이 맵에서 자전거를 탈 수 있는가 (`MapHeader_IsBikeAllowed`, 1비트).
   *
   * 593개 맵 중 실내·굴이 대부분 0이다 — 원작이 그렇게 찍어 두었다
   */
  bike: number
  /**
   * 이 맵에서 동굴탈출로프를 쓸 수 있는가 (`MapHeader_IsEscapeRopeAllowed`, 1비트).
   *
   * ⚠️ **동굴이라고 다 되는 것이 아니다.** `CanUseEscapeRope`가 갈래(동굴)와
   * 이 칸을 **둘 다** 본다 — 나가면 안 되는 굴이 있다
   */
  escapeRope: number
}

export interface Warp {
  x: number
  z: number
  /** 목적지 맵 헤더 id */
  to: number
  /** 목적지 맵의 몇 번째 워프로 나오는지 */
  anchor: number
}

/**
 * NPC 배치. 디컴프의 `ObjectEvent` 그대로다 (DATA.md §2.3).
 * raw에 원시 16워드가 그대로 있으니 필드를 잘못 읽어도 자료는 잃지 않는다.
 */
export interface Npc {
  x: number
  z: number
  height: number
  /** 이 맵 안에서의 번호. 스크립트가 `VAR_LAST_TALKED`로 읽는다 */
  localID: number
  sprite: number
  move: number
  /** 트레이너전 대사 종류. 0이면 트레이너가 아니다 */
  trainerType: number
  facing: number
  /** 맵 이벤트의 scriptID. `NO_SCRIPT`(0xFFFF)면 말을 걸 수 없다 */
  script: number
  /**
   * 등장 조건 플래그. **서 있으면 숨은 것**이다. 조건이 없으면 null.
   *
   * ⚠️ **베껴 온 사람(`isCloneNpc`)은 여기가 플래그가 아니다.** 그 자리에
   * 원본이 있는 맵의 헤더 번호가 들어 있다 — 반드시 `hideFlagOf`로 읽는다
   */
  flag: number | null
  /** 돌아다니는 범위 (x, z) */
  range: [number, number]
  raw: number[]
}

/** `ObjectEvent_HasNoScript` — 말을 걸어도 아무 일이 없다 */
export const NO_SCRIPT = 0xffff

/**
 * 간판·숨은 도구 (`BgEvent`).
 *
 * 앞 타일에 이게 있으면 읽는다. `facing`이 `BG_EVENT_DIR.all`이 아니면
 * **그 방향으로 보고 있을 때만** 반응한다 — 벽에 붙은 간판을 옆에서 못 읽는다.
 */
export interface Sign {
  script: number
  type: number
  x: number
  z: number
  y: number
  facing: number
}

/**
 * 좌표 트리거 (`CoordEvent`).
 *
 * 상자 안에 발을 들이고 `vars[var] === value`면 스크립트가 돈다. 이야기
 * 진행을 좌표로 거는 장치다.
 */
export interface Trigger {
  script: number
  x: number
  z: number
  width: number
  length: number
  y: number
  value: number
  var: number
}

export interface EventFile {
  warps: Warp[]
  npcs: Npc[]
  signs: Sign[]
  triggers: Trigger[]
}

/** `generated/bg_event_types.txt` */
export const BG_EVENT_TYPE = { facing: 0, wallSign: 1, hiddenItem: 2 } as const

/** `generated/bg_event_dirs.txt` */
export const BG_EVENT_DIR = {
  north: 0, east: 1, west: 2, south: 3, all: 4, westEast: 5, northSouth: 6,
} as const

export interface PendingWarp {
  /** 목적지 맵 헤더 id */
  to: number
  /** 목적지 행렬 번호 */
  matrix: number
  /** 목적지 행렬 안의 타일 좌표 */
  x: number
  z: number
  /**
   * 도착해서 바라볼 방향 (원작 방향 번호). 워프 타일로 갈 때는 없다 —
   * 문·계단은 들어간 방향 그대로 나오는 것이 맞고, **스크립트 워프만** 방향을
   * 함께 준다 (`ScrCmd_Warp`)
   */
  facing?: number
  /**
   * 문으로 드나든 것인가. 계단이면 false다.
   *
   * 소리가 갈린다 — `field_map_change.c`가 계단에 `SEQ_SE_DP_KAIDAN2`를 쓰고
   * 문은 `ov5_021D431C.c`가 `SEQ_SE_DP_DOOR_OPEN`을 쓴다. 밟고 선 칸으로는 못
   * 가린다: 문은 **앞 칸**이라 발밑이 그냥 길이다
   */
  viaDoor: boolean
  /**
   * 도착 높이를 이쪽이 정한다. 없으면 격자의 바닥에 선다.
   *
   * 깨어진 세계의 승강 발판만 쓴다 — 층이 바뀌는 순간에도 발판은 허공을
   * 지나는 중이라, 바닥에 붙이면 한 프레임 뚝 떨어졌다가 도로 올라온다
   * (`scene/distortion`의 `rideTick`)
   */
  y?: number
  /** 문·계단 소리를 안 낸다. 승강 발판은 제 소리가 따로 있다 */
  silent?: boolean
}

/** `area_data.narc` — 영역이 어느 텍스처·소품 묶음을 쓰는가 */
export interface AreaData {
  props: number
  tex: number
  light: number
}

export const world = {
  maps: null as MapHeader[] | null,
  areas: null as AreaData[] | null,
  events: null as Record<string, EventFile> | null,
  grid: null as MapGrid | null,
  /** 현재 서 있는 맵 헤더 id */
  mapId: -1,
  /**
   * 지금 선 격자의 행렬 번호. 오버월드가 0이고 실내는 저마다 다르다.
   *
   * 리포트가 이것까지 적어 둬야 실내에서 저장하고 껐을 때 그 방으로 돌아온다 —
   * 맵 번호만으로는 어느 격자를 받아야 하는지 알 수 없다
   */
  matrix: 0,
  /** 씬이 처리해야 할 전이. 처리 후 씬이 null로 되돌린다 */
  pending: null as PendingWarp | null,
  /**
   * 워프 타일 위에서 시작했을 때 즉시 되돌아가는 것을 막는다.
   * 워프로 도착한 직후엔 해제돼 있고, 워프 타일에서 발을 떼면 다시 걸린다.
   */
  armed: false,
  /**
   * 이 맵에 **들어선 칸** (`fieldSystem->location`의 x·z).
   *
   * ⚠️ **선 자리와 다를 수 있다.** 문 타일은 통행 불가라 씬이 한 칸 내려
   * 세우고(`walkOutOfDoor`), 그 뒤로는 걸어 다니면 계속 달라진다. 원작이
   * `location`을 따로 들고 있는 이유가 그것이다.
   *
   * 승강판이 이 값으로 층을 가른다 — 아래층 문의 z로 들어왔으면 아래층이다
   * (`PersistedMapFeatures_InitForPlatformLift`)
   */
  enteredX: 0,
  enteredZ: 0,
}

export function mapById(id: number): MapHeader | null {
  return world.maps?.[id] ?? null
}

/**
 * 하늘이 보이는 맵인가 (`MapHeader_IsOutdoors`).
 *
 * ⚠️ **잣대를 지어내지 않는다.** 원작이 `map_header.c`에 그대로 적어 두었다 —
 * 마을/도시(1)와 야외(2)만 실외고 동굴(3)·실내(4)·포켓몬센터(5)·지하(6)는 아니다.
 *
 * 이것이 필요한 이유: 원작 카메라는 고정 부감이라 맵 바깥을 볼 일이 없어서
 * 배경이 무엇이든 상관없었다. 우리 3인칭 카메라는 **맵 가장자리 너머를 본다** —
 * 챔피언로드가 파란 하늘에 뜬 널판으로 찍혔고 천관산 위쪽에도 하늘이 걸렸다
 */
export function isOutdoors(header: MapHeader | null): boolean {
  return header?.mapType === 1 || header?.mapType === 2
}

/**
 * 이번 맵 방문 동안만 사는 워프 자리 수정 (`MapHeaderData_SetWarpEventPos`).
 *
 * ⚠️ **워프를 지우는 데 쓴다.** 예진호수 입구가 그렇다 — 물이 마른 호수로 가는
 * 문과 아닌 쪽 문이 **같은 자리에 둘 다** 놓여 있고, 맵이 올라올 때
 * (`VerityLakefront_OnLoad`) 안 쓸 쪽을 맵 바깥 좌표(80, 840)로 밀어 버린다.
 * 이걸 안 하면 한 문에서 목적지 둘이 겹쳐 앞엣것이 늘 이긴다.
 *
 * `events.json`을 고치면 안 된다 — 온 신오가 같은 배열을 읽는다
 */
const warpMoved = new Map<number, { x: number, z: number }>()

export function setWarpEventPos(index: number, x: number, z: number): void {
  warpMoved.set(index, { x, z })
}

/**
 * 워프의 **목적지 맵**을 갈아 끼운다 (`MapHeaderData_SetWarpEventDestHeaderID`).
 *
 * 귀혼동굴이 이걸로 방을 굴린다 — 문은 그대로 두고 그 너머만 바꾼다
 */
const warpRetargeted = new Map<number, { to: number; anchor?: number }>()

export function setWarpDestination(index: number, to: number, anchor?: number): void {
  warpRetargeted.set(index, { to, anchor })
}

/**
 * 그 칸에 놓인 워프의 번호 (`MapHeaderData_GetIndexOfWarpEventAtPos`).
 *
 * 연고시티 체육관이 이걸로 **틀린 문들만** 골라 되돌린다
 */
export function warpIndexAt(mapId: number, x: number, z: number): number {
  return (eventsOf(mapId)?.warps ?? []).findIndex((w) => w.x === x && w.z === z)
}

/** 맵을 옮길 때 버린다. 초기화 스크립트가 돌기 **전**이어야 한다 */
export function clearWarpOverrides(): void {
  warpMoved.clear()
  warpRetargeted.clear()
}

export function warpsOf(mapId: number): Warp[] {
  const list = eventsOf(mapId)?.warps ?? []
  // 수정은 **지금 서 있는 맵**에만 걸린다. 원작도 불러 둔 맵 헤더만 고친다
  if ((warpMoved.size === 0 && warpRetargeted.size === 0) || mapId !== world.mapId) return list
  return list.map((w, i) => {
    const at = warpMoved.get(i)
    const to = warpRetargeted.get(i)
    if (at === undefined && to === undefined) return w
    return {
      ...w,
      x: at?.x ?? w.x, z: at?.z ?? w.z,
      to: to?.to ?? w.to, anchor: to?.anchor ?? w.anchor,
    }
  })
}

export function npcsOf(mapId: number): Npc[] {
  return eventsOf(mapId)?.npcs ?? []
}

/**
 * **옆 맵에서 베껴 온 사람인가** (`ObjectEvent_HasNoScript`).
 *
 * 경계에 걸친 맵은 옆 맵의 사람이 시야에 들어온다. 원작은 그 사람을 이쪽
 * 배치표에도 한 줄 넣어 두는데, 그 줄은 **원본이 아니라 사본**이라 두 자리가
 * 다른 뜻으로 쓰인다:
 *
 * · `script`가 `NO_SCRIPT` — 이게 사본이라는 표시다. 말을 걸 수 없다
 * · `flag`에는 **원본이 있는 맵의 헤더 번호**가 들어 있다 (숨김 플래그가 아니다)
 * · `localID`에는 **저쪽 맵에서의 번호**가 들어 있다 (이 맵의 번호가 아니다)
 *
 * ⚠️ 마지막 줄이 조용한 함정이다. 201번 도로에는 잔모래마을 간판이 사본으로
 * 있는데 그 번호가 5고, 이 맵의 5번은 **마박사**다. 번호로 사람을 찾을 때
 * 사본을 안 걸러 내면 `AddObject LOCALID_PROF_ROWAN`이 간판을 보고 "이미
 * 서 있다"며 그냥 돌아간다 — 컷신에서 박사가 끝까지 안 나타난다.
 * 원작도 그래서 조회에서 사본을 건너뛴다 (`sub_020631A4`)
 */
export function isCloneNpc(npc: Npc): boolean {
  return npc.script === NO_SCRIPT
}

/**
 * 실제 숨김 플래그. 사본이면 null이다 — 원작도 사본은 플래그를 안 보고
 * 무조건 세운다 (`sub_020620C4`: `HasNoScript || !CheckFlag`)
 */
export function hideFlagOf(npc: Npc): number | null {
  return isCloneNpc(npc) ? null : npc.flag
}

/** 번호로 사람 찾기 (`sub_020631A4`). 사본은 건너뛴다 */
export function npcByLocalID(mapId: number, localID: number): Npc | null {
  return npcsOf(mapId).find((n) => !isCloneNpc(n) && n.localID === localID) ?? null
}

export function signsOf(mapId: number): Sign[] {
  return eventsOf(mapId)?.signs ?? []
}

export function triggersOf(mapId: number): Trigger[] {
  return eventsOf(mapId)?.triggers ?? []
}

function eventsOf(mapId: number): EventFile | null {
  const m = mapById(mapId)
  if (!m || !world.events) return null
  return world.events[String(m.events)] ?? null
}

/** 목적지 워프가 가리키는 도착 지점. 목적지가 실재하지 않으면 null */
export function resolveWarp(w: Warp, viaDoor = false): PendingWarp | null {
  const dest = mapById(w.to)
  if (!dest) return null
  const back = warpsOf(w.to)[w.anchor]
  if (!back) return null
  return { to: w.to, matrix: dest.matrix, x: back.x + 0.5, z: back.z + 0.5, viaDoor }
}

/** `TILE_BEHAVIOR_DOOR`. 이름이 16진수를 담고 있어 값이 확정된다 (`UNUSED_x68` 다음) */
export const TILE_BEHAVIOR_DOOR = 0x69

/**
 * `TILE_BEHAVIOR_TABLE`. 계산대·탁자.
 *
 * 값은 앞뒤 이름이 가둔다 — `UNUSED_x7F` **다음**이고 `UNUSED_x81` **앞**이라
 * 0x80 말고는 될 수가 없다. 이 칸을 앞에 두고 말을 걸면 원작은 **한 칸 더**
 * 본다(`sub_0203C9D4`). 간호사와 점원이 전부 이 너머에 선다
 */
export const TILE_BEHAVIOR_TABLE = 0x80

/**
 * `TILE_BEHAVIOR_PC`. 보관 시스템을 여는 칸.
 *
 * 값은 앞뒤 이름이 가둔다 — `UNUSED_x82` 다음, `UNUSED_x84` 앞이다. 실내
 * 격자에 **30칸** 있고 바깥 격자에는 하나도 없다.
 *
 * ⚠️ 30칸이 PC 30대가 아니다 — **세로 두 칸이 한 대**다(책상과 그 위 화면).
 * 기둥 16개 중 14개가 두 칸짜리다. 말이 걸리는 것은 밑동뿐이라, 칸 수로 PC를
 * 세면 두 배로 샌다
 */
export const TILE_BEHAVIOR_PC = 0x83

/**
 * 말을 걸 칸.
 *
 * 앞 칸이 계산대면 **한 칸 더** 본다 (`sub_0203C9D4`). 이게 없으면 계산대 뒤에
 * 선 사람에게 영영 못 닿는다 — 포켓몬센터 간호사와 마트 점원이 전부 그 자리다.
 *
 * 한 번만 뛴다. 원작도 한 번이라, 탁자 두 칸이 이어지면 그 너머는 못 닿는다
 */
export function talkTile(
  grid: { behavior(tx: number, tz: number): number },
  front: { x: number; z: number },
  step: { x: number; z: number },
): { x: number; z: number } {
  if (grid.behavior(front.x, front.z) !== TILE_BEHAVIOR_TABLE) return front
  return { x: front.x + step.x, z: front.z + step.z }
}

/**
 * 문에서 나온 자리를 한 칸 아래로 옮긴다.
 *
 * 원작은 도착 좌표가 **워프 타일 그 자체**다(`FieldMapChange`가
 * `location->x = warpEvent->x`). 그런데 문 타일은 통행 불가로 찍혀 있다 —
 * 실외 워프 293개 중 145개가 막힌 칸이고 그중 141개가 문이다. 원작은 도착한 뒤
 * **문에서 걸어 나오는 연출**로 그 칸을 벗어난다(`transitionType = 1`).
 *
 * 우리는 그 연출이 없어서 막힌 칸 한가운데에 서게 되고, 반지름 판정 때문에
 * 어느 쪽으로도 못 나간다 — 영영 갇힌다.
 *
 * 어느 쪽으로 내보낼지는 지어내지 않았다. 문 **177개(실외 141 · 실내 36)**를
 * 전부 재 보면 **177개가 남쪽이 열려 있고 동·서가 열린 것은 0개**다. 만장일치다.
 */
export function walkOutOfDoor(
  grid: { behavior(x: number, z: number): number; isBlocked(x: number, z: number): boolean },
  x: number, z: number,
): { x: number; z: number } {
  const tx = Math.floor(x)
  const tz = Math.floor(z)
  if (grid.behavior(tx, tz) !== TILE_BEHAVIOR_DOOR) return { x, z }
  if (grid.isBlocked(tx, tz + 1)) return { x, z } // 남쪽마저 막혔으면 손대지 않는다
  return { x, z: z + 1 }
}

/** 바라보는 방향의 단위 벡터. `facing`은 `atan2(vx, vz)`라 0이 +z다 */
const FACING_STEP = [
  { x: 0, z: 1 }, { x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 },
] as const

export function quarterOf(facing: number): number {
  return ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4
}

/**
 * 문으로 들어간다.
 *
 * ⚠️ **문 타일은 밟을 수 없다.** 실외 문 141개가 141개 다 통행 불가로 찍혀 있다 —
 * 밟고 서기를 기다리면 건물에 영영 못 들어간다. 실제로 못 들어갔다.
 *
 * 원작은 밟는 게 아니라 **밀고 들어간다.** `Field_CheckMapTransition`이
 * 그대로 이 순서다:
 *
 * ```c
 * Field_Step(fieldSystem, &playerX, &playerZ);              // 앞 칸
 * if (TerrainCollisionManager_CheckCollision(...) == FALSE)  // 막혀 있어야 한다
 *     return FALSE;
 * if (Field_MapConnection(...) && input->transitionDir != DIR_NONE) {
 *     if (TileBehavior_IsDoor(tileBehavior)) { ... }
 * }
 * ```
 *
 * 막혀 있어야 한다는 조건이 뒤집혀 있는 게 아니다 — **막힌 것이 곧 문을 가르는
 * 잣대다.** 걸어 들어갈 수 있는 칸이면 그건 문이 아니라 그냥 길이다.
 *
 * `transitionDir`은 **보는 쪽과 미는 쪽이 같을 때만** 선다(`FieldInput` 166줄:
 * `playerDir == DIR_NORTH && heldKeys & PAD_KEY_UP` …). 옆으로 스치면 안 열린다.
 */
export function doorEntry(
  grid: { behavior(tx: number, tz: number): number; isBlocked(tx: number, tz: number): boolean },
  warps: readonly Warp[],
  at: { x: number; z: number; facing: number },
  push: { x: number; z: number },
): Warp | null {
  if (Math.hypot(push.x, push.z) < 0.1) return null
  if (quarterOf(Math.atan2(push.x, push.z)) !== quarterOf(at.facing)) return null
  const step = FACING_STEP[quarterOf(at.facing)]!
  const fx = Math.floor(at.x) + step.x, fz = Math.floor(at.z) + step.z
  if (!grid.isBlocked(fx, fz)) return null
  if (grid.behavior(fx, fz) !== TILE_BEHAVIOR_DOOR) return null
  return warps.find((w) => w.x === fx && w.z === fz) ?? null
}

/**
 * 워프 감지. 씬은 pending을 보고 격자를 갈아 끼운다.
 *
 * 두 갈래다 — **밟고 선 칸**(계단·워프판)과 **밀고 들어간 앞 칸**(문). 원작도
 * 둘로 갈라 놓았다(`Field_CheckMapTransition`).
 *
 * 도착 지점은 상대편 워프 타일 자체다 — 원작도 그렇다. 다만 그 칸이 문이면
 * 통행 불가라서 씬이 `walkOutOfDoor`로 한 칸 내려 세운다.
 */
/**
 * 방금 도착했다 — 발을 떼기 전에는 워프가 안 걸린다.
 *
 * ⚠️ **맵에 들어서는 모든 길이 여기를 지나야 한다.** 워프로 들어온 경우엔
 * `warpSystem`이 이미 풀어 두지만, **확인 지점으로 뛰어드는 길**은 안 풀고
 * 있었다 — 체육관 안 워프판 위에 내려서자마자 도로 시내로 튕겨 나갔고, 그래서
 * 체육관 배틀이 시내 풀밭에서 열렸다. 세이브 자리가 워프판일 때도 같은 일이 난다
 */
export function disarmWarp(): void {
  world.armed = false
}

export const warpSystem = {
  fixedUpdate() {
    if (world.mapId < 0 || world.pending) return
    const p = worldState.player
    const tx = Math.floor(p.position.x), tz = Math.floor(p.position.z)
    const warps = warpsOf(world.mapId)

    // ① 앞 칸이 문이다. 밟을 수 없는 칸이라 밟기를 기다리면 안 열린다
    const door = world.grid
      ? doorEntry(world.grid, warps, { x: p.position.x, z: p.position.z, facing: p.facing },
        pushDirection())
      : null
    // ② 밟고 선 칸이다 — 계단·워프판이 그렇다
    const here = warps.find((w) => w.x === tx && w.z === tz)

    // 워프에서 손을 떼야 다시 걸린다. 북쪽 문으로 들어가면 도착하자마자 **그 문을
    // 다시 마주 보고 서게 되므로**, 이게 없으면 안팎을 무한히 오간다
    if (!door && !here) { world.armed = true; return }
    if (!world.armed) return
    const target = door
      ? resolveWarp(door, true)
      : resolveWarp(here!, world.grid?.behavior(tx, tz) === TILE_BEHAVIOR_DOOR)
    // 목적지가 없는 워프가 6개 있다(더미). 밟아도 아무 일도 일어나지 않는 게 맞다
    if (!target) return
    world.armed = false
    world.pending = target
  },
}
