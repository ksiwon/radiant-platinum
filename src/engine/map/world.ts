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
  msg: number
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
  /** 등장 조건 플래그. **서 있으면 숨은 것**이다. 조건이 없으면 null */
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
}

export function mapById(id: number): MapHeader | null {
  return world.maps?.[id] ?? null
}

export function warpsOf(mapId: number): Warp[] {
  return eventsOf(mapId)?.warps ?? []
}

export function npcsOf(mapId: number): Npc[] {
  return eventsOf(mapId)?.npcs ?? []
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
export function resolveWarp(w: Warp): PendingWarp | null {
  const dest = mapById(w.to)
  if (!dest) return null
  const back = warpsOf(w.to)[w.anchor]
  if (!back) return null
  return { to: w.to, matrix: dest.matrix, x: back.x + 0.5, z: back.z + 0.5 }
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

/**
 * 워프 감지. 씬은 pending을 보고 격자를 갈아 끼운다.
 *
 * 도착 지점은 상대편 워프 타일 자체다 — 원작도 그렇다. 다만 그 칸이 문이면
 * 통행 불가라서 씬이 `walkOutOfDoor`로 한 칸 내려 세운다.
 */
export const warpSystem = {
  fixedUpdate() {
    if (world.mapId < 0 || world.pending) return
    const p = worldState.player.position
    const tx = Math.floor(p.x), tz = Math.floor(p.z)
    const here = warpsOf(world.mapId).find((w) => w.x === tx && w.z === tz)
    if (!here) { world.armed = true; return }
    if (!world.armed) return
    const target = resolveWarp(here)
    // 목적지가 없는 워프가 6개 있다(더미). 밟아도 아무 일도 일어나지 않는 게 맞다
    if (!target) return
    world.armed = false
    world.pending = target
  },
}
