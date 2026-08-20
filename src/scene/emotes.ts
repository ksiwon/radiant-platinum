// 머리 위 표시가 도는 자리 (PARITY §1.13 · §7.9)
//
// 규칙은 `engine/actor/emote`가 들고 있고 여기는 **지금 누구 위에 무엇이 떠
// 있는가**만 맡는다. 원작은 이걸 이동 동작으로 사람에게 걸지만
// (`MOVEMENT_ACTION_EMOTE_*`) 우리 이동 실행기는 좌표를 옮기는 것만 하므로
// 목록을 따로 둔다 — 대신 **사람이 사라지면 표시도 사라진다**.
import { emoteAlive, type EmoteKind } from '../engine/actor/emote'
import { npcActors } from '../engine/actor/npcs'

interface LiveEmote {
  localID: number
  kind: EmoteKind
  /** 뜬 지 몇 프레임 됐는가. 60fps 기준이다 */
  frame: number
}

let live: LiveEmote[] = []

/** 지금 떠 있는 표시들. 씬이 이걸 그린다 */
export function emotes(): readonly LiveEmote[] { return live }

/**
 * 한 사람 위에 표시를 띄운다.
 *
 * 같은 사람에게 두 번 걸면 **다시 처음부터** 뛴다 — 원작도 이동 동작을 새로
 * 걸면 앞엣것을 끝내고 다시 시작한다
 */
export function showEmote(localID: number, kind: EmoteKind): void {
  live = [...live.filter((e) => e.localID !== localID), { localID, kind, frame: 0 }]
}

/** 맵을 옮기면 통째로 사라진다 — 표시가 붙어 있던 사람이 이미 없다 */
export function clearEmotes(): void { live = [] }

/** 60fps로 센 프레임. 느린 기계에서도 같은 길이로 뜬다 */
const FPS = 60

/**
 * 한 프레임.
 *
 * ⚠️ **사람이 없어진 표시도 여기서 걷어낸다.** 스크립트가 사람을 지우거나
 * (`RemoveObject`) 배틀에 들어갔다 나오면 그 번호가 비는데, 그리는 쪽에서
 * 거르면 배틀 내내 떠 있던 표시가 돌아왔을 때 한 프레임 남는다
 */
export function emoteFrame(dt: number): void {
  if (live.length === 0) return
  const step = dt * FPS
  live = live.filter((e) => {
    e.frame += step
    return emoteAlive(e.frame) && npcActors.byLocalID.has(e.localID)
  })
}
