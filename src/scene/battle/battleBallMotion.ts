import type { SlotId } from '../../engine/battle/events'
// 볼 연출의 자리 — 볼이 어디서 날아오는가 · 앞 몸을 거두는가.
//
// 볼의 움직임 자체는 BDSP 시퀀스가 정한다(`engine/battle/fx/ballPlans` · `fx/sequence`의 `modelAt`) — 여기에는
// 시퀀스가 모르는 것(배틀에 서지 않는 트레이너의 자리)과 무대가 볼 연출을 걸지 말지 가르는 규칙만 남는다.

type Point3 = readonly [number, number, number]

/** 볼이 손을 떠나는 높이(m) */
const HAND = 1.65

/**
 * 볼이 날아오는 자리 — 화면 밖이다. 배틀에 사람이 서지 않아 (사용자 결정 2026-10-04 — 제
 * 포켓몬 맞은편에 선 사람이 트레이너가 포켓몬과 싸우는 것으로 읽혔다) 등장 볼도 교체·포획 볼도
 * 여기서 들어온다. 고정 카메라(`shots.CAMERA`)에서 우리 쪽은 왼쪽 앞, 상대 쪽은 오른쪽 뒤의 바깥이다.
 * 시퀀스의 `DprModelAttachTrainer`(트레이너 손)가 이 자리로 온다
 */
export function trainerThrowOrigin(slot: SlotId): Point3 {
  return slot.startsWith('p1') ? [-4.4, HAND, 6.2] : [4.6, HAND, -6.4]
}

/**
 * 자리의 마리가 바뀔 때 **앞 몸을 볼로 거두는가** (`RecallPokemon` — BDSP `ee610`).
 *
 * 서 있던 **다른 마리**로 바뀔 때만이다. ⚠️ **열쇠(`key`)로 가른다 — 종으로 가르지 않는다.**
 * 변신(`transform`)과 폼 변화는 같은 마리라 열쇠가 그대로고 종만 바뀐다 (`engine/battle/view`)
 * — 종을 보면 변신에 거두는 빔이 쏜다. 쓰러진 뒤의 교체는 몸이 이미 졌으므로 거두지 않는다 —
 * 원작도 쓰러진 마리는 거두지 않는다. 무대의 몸(`BattleStage`)과 빔(`BattleBallEffects`)이
 * 이 한 함수를 본다
 */
export function recallsBody(before: { key: string | null; alive: boolean }, next: string | null): boolean {
  return before.key !== null && before.alive && before.key !== next
}
