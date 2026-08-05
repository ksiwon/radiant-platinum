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

export interface NpcActor extends Movable {
  /** 맵 안 번호. 스크립트가 이걸로 찾는다 */
  localID: number
  /** 배치표의 원본. 모델 번호·이동 유형이 여기 있다 */
  readonly info: Npc
  /** 서 있는 층 (BDHC 높이) */
  y: number
  /** 배치표의 이동 유형. 변장한 트레이너를 가려내는 데 쓴다 */
  readonly movementType: number
}

export const npcActors = {
  /** 지금 맵의 NPC. 맵이 바뀌면 통째로 갈린다 */
  list: [] as NpcActor[],
  byLocalID: new Map<number, NpcActor>(),
}

/**
 * 맵 하나의 NPC를 세운다.
 *
 * 숨김 플래그가 서 있는 NPC는 **아예 안 만든다** — 원작도 그 조건일 때만
 * 객체를 만든다(`MapObjectMan_AddMapObjectFromHeader`)
 */
export function spawnNpcs(mapId: number, vars: VarStore): void {
  npcActors.list = []
  npcActors.byLocalID.clear()
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
    }
    npcActors.list.push(actor)
    // 같은 번호가 둘이면 먼저 것이 이긴다 — 원작의 조회도 앞에서부터 찾는다
    if (!npcActors.byLocalID.has(actor.localID)) npcActors.byLocalID.set(actor.localID, actor)
  }
}

export function clearNpcs(): void {
  npcActors.list = []
  npcActors.byLocalID.clear()
}
