// 살아 있는 NPC (DATA.md §2.3)
//
// `events.json`의 NPC는 **배치표**다 — 어디에 서서 어느 쪽을 보고 시작하는지.
// 스크립트가 걸어 다니게 만들려면 그것과 별개로 **지금 어디 있는가**를 들고
// 있어야 한다. 이 모듈이 그 자리다.
//
// 좌표는 타일 단위인데 정수가 아닐 수 있다 — 걸어가는 도중이라는 뜻이다.
// 씬은 매 프레임 이 목록을 읽어 인스턴스 행렬만 갈아 끼운다.
import { hideFlagOf, isCloneNpc, npcByLocalID, npcsOf, type Npc } from '../map/world'
import type { Movable } from '../script/movement'
import type { VarStore } from '../script/vars'
import type { AmbientState } from './ambient'

/**
 * 그림 번호가 **변수로 정해지는** 자리 (`OBJ_EVENT_GFX_VAR_0` ~ `VAR_F`).
 *
 * ⚠️ **이 번호에는 그림이 없다.** 자리표시자라, 실제로 무엇이 설 것인지는 맵
 * 초기화 스크립트가 정한다 — 201번 도로가 그렇다:
 *
 *     Route201_OnTransition:
 *       GetPlayerGender …
 *       SetVar VAR_OBJ_GFX_ID_0, OBJ_EVENT_GFX_PLAYER_F   (또는 PLAYER_M)
 *
 * 즉 **광휘/빛나 중 내가 아닌 쪽**이 이 자리에 선다. 안 풀면 그림 파일이 없어
 * (`data/npc/101.png`) 판때기가 통째로 안 서고, 컷신에서 사람 하나가 사라진다.
 * 배치 60건이 이 자리다.
 */
const VAR_GFX_FIRST = 101
const VAR_GFX_LAST = 116

/**
 * `OBJ_GFX_VARS_START`.
 *
 * `generated/vars_flags.txt`를 `VARS_START = 16384`부터 세면 지역 변수 32개
 * (`VAR_MAP_LOCAL_0x00`~`0x1F`) 뒤가 여기고, 다시 열여섯 뒤가 `VAR_PLAYER_STARTER`다.
 * **그 값이 이미 0x4030으로 확정되어 있어서**(`script/commands`) 이 자리가
 * 0x4020임이 되짚어진다 — 짐작이 아니다
 */
const OBJ_GFX_VARS_START = 0x4020

/**
 * 실제로 세울 그림 번호 (`MapObject_GetFieldSystemGraphicsID`).
 *
 * 원작도 객체를 만들 때 한 번 풀어서 들고 있는다. 그리는 쪽에서 매번 풀면
 * 변수가 바뀐 뒤에 옛 사람이 새 그림으로 갈리는데, 원작은 안 그런다
 */
export function resolveGfx(sprite: number, vars: VarStore): number {
  if (sprite < VAR_GFX_FIRST || sprite > VAR_GFX_LAST) return sprite
  return vars.get(OBJ_GFX_VARS_START + (sprite - VAR_GFX_FIRST))
}

export interface NpcActor extends Movable {
  /** 맵 안 번호. 스크립트가 이걸로 찾는다 */
  localID: number
  /** 배치표의 원본. 모델 번호·이동 유형이 여기 있다 */
  readonly info: Npc
  /**
   * 실제로 세울 그림 번호. 보통 `info.sprite`와 같다.
   *
   * ⚠️ **`info.sprite`를 그리면 안 된다** — `OBJ_EVENT_GFX_VAR_*`는 자리표시자라
   * 그 번호로는 그림이 없다 (`resolveGfx`)
   */
  readonly gfx: number
  /** 서 있는 층 (BDHC 높이) */
  y: number
  /**
   * 지금 이 사람의 이동 유형 (`MapObject_GetMovementType`).
   *
   * ⚠️ **읽기 전용이 아니다.** 스크립트가 `SetMovementType`으로 **서 있는
   * 사람**의 유형을 갈아 끼운다 (`MapObject_SwitchMovementType`) — 따라다니는
   * 동행이 그 길로 붙는다. 셰릴·리키·미라·마리·벅과 라이벌 여덟 자리가
   * 전부 그렇다. 배치표에는 그 유형이 한 명도 안 적혀 있다
   */
  movementType: number
  /** 배치표의 `data[3]`. `events.json`의 `raw[7..9]` 자리다 */
  readonly params: readonly number[]
  /**
   * 혼자 하는 짓의 진행 상태 (`actor/ambient`). 처음 굴릴 때 만든다.
   *
   * 자리를 여기 두는 이유: 이 사람이 **어디서 시작했는가**를 기억해야 하는
   * 갈래가 있다. 왔다 갔다 하는 사람은 시작 칸으로 돌아오는 것으로 방향을
   * 바꾸므로, 상태가 사람과 함께 나고 함께 사라져야 맞는다
   */
  ambient: AmbientState | null
}

export const npcActors = {
  /** 지금 맵의 NPC. 맵이 바뀌면 통째로 갈린다 */
  list: [] as NpcActor[],
  byLocalID: new Map<number, NpcActor>(),
  /**
   * 이 목록이 **어느 맵의 것인가.** −1이면 아직 안 세웠다.
   *
   * 목록만 보고는 알 수 없다 — 맵을 옮겼는데 아직 안 세운 사이에는 앞 맵의
   * 사람들이 그대로 들어 있고, 그때 좌표로 사람을 찾으면 엉뚱한 자리에서 걸린다
   */
  mapId: -1,
  /**
   * 모두 멈춰 있는가 (`MapObjectMan_PauseAllMovement`).
   *
   * 스크립트가 `LockAll`로 세우고 `ReleaseAll`로 놓는다. 실측으로 필드 스크립트가
   * 이 둘을 4,334번 쓴다 — 대화·컷신이 시작할 때마다 한 번씩이다.
   *
   * 세우는 대상은 **혼자 하는 짓**이다 (`actor/ambient`). 배회하던 사람이
   * 대화 중에 걸어 나가면 말을 걸던 칸이 비므로, 이 깃발이 없으면 대화가
   * 상대 없이 이어진다
   */
  paused: false,
}

/**
 * 맵 하나의 NPC를 세운다.
 *
 * 숨김 플래그가 서 있는 NPC는 **아예 안 만든다** — 원작도 그 조건일 때만
 * 객체를 만든다(`MapObjectMan_AddMapObjectFromHeader`)
 */
/**
 * 이번 맵 방문 동안만 사는 배치표 수정 (`MapHeaderData_SetObjectEvent*`).
 *
 * ⚠️ 배치표 자체(`events.json`)를 고치면 안 된다 — 그건 롬에서 뽑은 자료고 온
 * 신오가 함께 읽는다. 원작도 **불러 둔 맵 헤더**만 고치므로 맵을 다시 들어오면
 * 원래 자리로 돌아간다.
 *
 * 이게 쓰이는 자리는 둘이다. `AddObject`로 나중에 세우는 사람이 하나고,
 * 다른 하나가 **맵 초기화 스크립트**다(`OnTransition`) — 그쪽은 사람을 세우기
 * 전에 돌아서 시작 자리를 바꿔 놓는다. 그래서 `spawnNpcs`도 여기를 본다
 */
const placement = new Map<number, { x?: number; z?: number; dir?: number; move?: number }>()

export function setNpcPlacement(
  localID: number, patch: { x?: number; z?: number; dir?: number; move?: number },
): void {
  placement.set(localID, { ...placement.get(localID), ...patch })
}

/**
 * 배치표 수정을 버린다. **맵을 옮길 때 초기화 스크립트보다 먼저** 불러야 한다 —
 * `spawnNpcs`가 지우면 그 앞에 돈 `OnTransition`의 자리 지정이 함께 날아간다
 */
export function clearNpcPlacement(): void {
  placement.clear()
}

/**
 * 배치표의 `ObjectEvent.data[3]`.
 *
 * 구조체가 `… u16 script; s16 dir; u16 data[3]; …`이라 `raw`의 7·8·9번이다
 * (`tools/extract/events.js`). 뜻은 객체마다 다르다 — 간판이면 `data[0]`이
 * 판에 붙는 그림 번호다
 */
function paramsOf(info: Npc): readonly number[] {
  return [info.raw[7] ?? 0, info.raw[8] ?? 0, info.raw[9] ?? 0]
}

/**
 * 배치표에 없는 사람을 세운다 (`DistWorld_AddMapObjectWithLocalID`).
 *
 * 깨어진 세계의 시로나·태홍·기라티나가 그렇다 — 층이 끊김 없이 이어지는
 * 세계라 맵 배치표에 자리가 없고, 스크립트와 사건이 번호로 불러다 세운다.
 * 여기 오는 `info`는 그 세계의 전용 표(`distortion.json`)에서 온다
 */
export function addNpcFrom(info: Npc, vars: VarStore): void {
  if (npcActors.byLocalID.has(info.localID)) return
  const actor: NpcActor = {
    localID: info.localID,
    info,
    gfx: resolveGfx(info.sprite, vars),
    x: info.x,
    z: info.z,
    y: info.height,
    dir: info.facing,
    visible: true,
    movementType: info.move,
    params: paramsOf(info),
    ambient: null,
  }
  npcActors.list.push(actor)
  npcActors.byLocalID.set(info.localID, actor)
}

export function spawnNpcs(mapId: number, vars: VarStore): void {
  npcActors.list = []
  npcActors.byLocalID.clear()
  npcActors.mapId = mapId
  npcActors.paused = false
  for (const info of npcsOf(mapId)) {
    const hide = hideFlagOf(info)
    if (hide !== null && vars.checkFlag(hide)) continue
    // 초기화 스크립트가 자리를 바꿔 놨을 수 있다. 예진호수의 마박사가 그렇다 —
    // 이야기 단계에 따라 세 자리 중 하나에 선다.
    //
    // 사본은 안 본다 — 그 번호는 저쪽 맵의 것이라, 이 맵의 같은 번호에 걸린
    // 자리 지정이 엉뚱한 사람을 옮긴다 (`isCloneNpc`)
    const fix = isCloneNpc(info) ? {} : placement.get(info.localID) ?? {}
    const actor: NpcActor = {
      localID: info.localID,
      info,
      gfx: resolveGfx(info.sprite, vars),
      x: fix.x ?? info.x,
      z: fix.z ?? info.z,
      y: info.height,
      dir: fix.dir ?? info.facing,
      visible: true,
      movementType: fix.move ?? info.move,
      params: paramsOf(info),
      ambient: null,
    }
    npcActors.list.push(actor)
    // 베껴 온 사람은 번호표에 안 올린다 — 그 번호는 **저쪽 맵의 번호**라
    // 이 맵의 같은 번호를 가로챈다 (`isCloneNpc`)
    if (isCloneNpc(info)) continue
    // 같은 번호가 둘이면 먼저 것이 이긴다 — 원작의 조회도 앞에서부터 찾는다
    if (!npcActors.byLocalID.has(actor.localID)) npcActors.byLocalID.set(actor.localID, actor)
  }
}

export function clearNpcs(): void {
  npcActors.list = []
  npcActors.byLocalID.clear()
  npcActors.mapId = -1
  npcActors.paused = false
  placement.clear()
}

/**
 * 배치표에서 한 명을 **새로 세운다** (`ScrCmd_AddObject`).
 *
 * 숨김 플래그 때문에 안 세워진 사람이다 — 컷신에서 갑자기 나타나는 사람이 전부
 * 이 길로 온다. 이미 서 있으면 아무 일도 안 한다
 *
 * ⚠️ **변수를 받아야 한다.** 여기로 오는 사람 중에 그림이 변수로 정해지는
 * 자리가 있다 (201번 도로의 `LOCALID_COUNTERPART` — `AddObject`로 나타난다)
 *
 * @returns 세웠으면 true. 배치표에 그 번호가 없으면 false
 */
export function addNpc(localID: number, vars: VarStore): boolean {
  if (npcActors.byLocalID.has(localID)) return true
  const info = npcByLocalID(npcActors.mapId, localID)
  if (!info) return false
  const fix = placement.get(localID) ?? {}
  const actor: NpcActor = {
    localID,
    info,
    gfx: resolveGfx(info.sprite, vars),
    x: fix.x ?? info.x,
    z: fix.z ?? info.z,
    y: info.height,
    dir: fix.dir ?? info.facing,
    visible: true,
    movementType: fix.move ?? info.move,
    params: paramsOf(info),
    ambient: null,
  }
  npcActors.list.push(actor)
  npcActors.byLocalID.set(localID, actor)
  return true
}

/**
 * 서 있는 사람의 이동 유형을 갈아 끼운다 (`MapObject_SwitchMovementType`).
 *
 * ⚠️ **배치표를 고치는 것과 다른 일이다.** `SetObjectEventMovementType`은 다음에
 * 세울 사람에게 먹고, 이쪽은 **지금 그 자리에 선 사람**에게 먹는다. 둘을 같이
 * 두면 동행이 붙는 순간이 「맵을 한 번 나갔다 들어와야」로 밀린다 —
 * 영원의숲 셰릴이 그 자리에서 굳어 있었다.
 *
 * 굴리던 상태도 버린다. 유형이 바뀌면 「어디서 시작했는가」가 새로 잡혀야 한다
 */
export function switchMovementType(localID: number, type: number): boolean {
  const actor = npcActors.byLocalID.get(localID)
  if (!actor) return false
  actor.movementType = type
  actor.ambient = null
  return true
}

/** 그 이동 유형으로 서 있는 첫 사람 (`MapObjMan_GetLocalMapObjByMovementType`) */
export function npcByMovementType(type: number): NpcActor | null {
  return npcActors.list.find((a) => a.movementType === type) ?? null
}

/**
 * 한 명을 지운다 (`ScrCmd_RemoveObject`).
 *
 * ⚠️ 원작은 **숨김 플래그도 함께 세운다** (`MapObject_SetFlagAndDeleteObject`).
 * 그래서 맵을 다시 들어와도 안 나타난다 — 플래그를 안 세우면 문 한 번 여닫는
 * 것으로 사라진 사람이 되살아난다. 플래그는 부르는 쪽이 세운다(스크립트 변수는
 * 이 모듈이 안 들고 있다)
 *
 * @returns 그 사람의 숨김 플래그. 없으면 null
 */
export function removeNpc(localID: number): number | null {
  const actor = npcActors.byLocalID.get(localID)
  if (!actor) return null
  npcActors.byLocalID.delete(localID)
  const at = npcActors.list.indexOf(actor)
  if (at >= 0) npcActors.list.splice(at, 1)
  return hideFlagOf(actor.info)
}
