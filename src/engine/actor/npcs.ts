// 살아 있는 NPC (DATA.md §2.3)
//
// `events.json`의 NPC는 **배치표**다 — 어디에 서서 어느 쪽을 보고 시작하는지.
// 스크립트가 걸어 다니게 만들려면 그것과 별개로 **지금 어디 있는가**를 들고
// 있어야 한다. 이 모듈이 그 자리다.
//
// 좌표는 타일 단위인데 정수가 아닐 수 있다 — 걸어가는 도중이라는 뜻이다.
// 씬은 매 프레임 이 목록을 읽어 인스턴스 행렬만 갈아 끼운다.
import { npcsOf, type Npc } from '../map/world'
import type { Movable } from '../script/movement'
import type { VarStore } from '../script/vars'
import type { AmbientState } from './ambient'

export interface NpcActor extends Movable {
  /** 맵 안 번호. 스크립트가 이걸로 찾는다 */
  localID: number
  /** 배치표의 원본. 모델 번호·이동 유형이 여기 있다 */
  readonly info: Npc
  /** 서 있는 층 (BDHC 높이) */
  y: number
  /** 배치표의 이동 유형. 변장한 트레이너를 가려내는 데 쓴다 */
  readonly movementType: number
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
 * 이게 쓰이는 자리는 정해져 있다: `SetObjectEventPos`로 자리를 적어 두고
 * `AddObject`로 그 사람을 세운다. 그래서 세울 때 여기를 본다
 */
const placement = new Map<number, { x?: number; z?: number; dir?: number; move?: number }>()

export function setNpcPlacement(
  localID: number, patch: { x?: number; z?: number; dir?: number; move?: number },
): void {
  placement.set(localID, { ...placement.get(localID), ...patch })
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

export function spawnNpcs(mapId: number, vars: VarStore): void {
  npcActors.list = []
  npcActors.byLocalID.clear()
  npcActors.mapId = mapId
  npcActors.paused = false
  placement.clear()
  for (const info of npcsOf(mapId)) {
    if (info.flag !== null && vars.checkFlag(info.flag)) continue
    const actor: NpcActor = {
      localID: info.localID,
      info,
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
    // 같은 번호가 둘이면 먼저 것이 이긴다 — 원작의 조회도 앞에서부터 찾는다
    if (!npcActors.byLocalID.has(actor.localID)) npcActors.byLocalID.set(actor.localID, actor)
  }
}

export function clearNpcs(): void {
  npcActors.list = []
  npcActors.byLocalID.clear()
  npcActors.mapId = -1
  npcActors.paused = false
}

/**
 * 배치표에서 한 명을 **새로 세운다** (`ScrCmd_AddObject`).
 *
 * 숨김 플래그 때문에 안 세워진 사람이다 — 컷신에서 갑자기 나타나는 사람이 전부
 * 이 길로 온다. 이미 서 있으면 아무 일도 안 한다
 *
 * @returns 세웠으면 true. 배치표에 그 번호가 없으면 false
 */
export function addNpc(localID: number): boolean {
  if (npcActors.byLocalID.has(localID)) return true
  const info = npcsOf(npcActors.mapId).find((n) => n.localID === localID)
  if (!info) return false
  const fix = placement.get(localID) ?? {}
  const actor: NpcActor = {
    localID,
    info,
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
  return actor.info.flag
}
