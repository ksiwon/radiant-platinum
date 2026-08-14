// 머리 위에 뜨는 표시 (PARITY §1.13 · §7.9) — `ov5_021F5A10.c`
//
// 원작은 이것을 **이동 동작**으로 낸다 (`MOVEMENT_ACTION_EMOTE_*`). 사람에게
// 걸음 목록을 걸듯 느낌표를 걸고, 그 동작이 끝날 때까지 다음 걸음이 안 간다 —
// 눈이 마주친 트레이너가 잠깐 멈춰 서는 것이 그래서다.
//
// ⚠️ **오래 서 있는 표시가 아니다.** 통통 튀어 올랐다 내려앉고 서른 프레임을
// 서 있다 사라진다 — 0.6초쯤이다. VS시커가 세운 트레이너를 나중에 알아보는
// 것은 이 표시가 아니라 **그 사람이 도는 것**이다 (`MOVEMENT_TYPE_VS_SEEKER_SPIN`).

/** 무엇이 뜨는가 */
export type EmoteKind =
  /** 느낌표 하나 (`sisen_ef`) — 눈이 마주쳤거나, 아직 안 싸운 사람이 가까이 있다 */
  | 'exclaim'
  /** 느낌표 둘 (`saisen_ef`) — 재대결에 응했다 */
  | 'rematch'

/** 그림 한 줄(`data/npc/emote.png`)에서 이 표시가 몇 번째 칸인가 */
export const EMOTE_CELL: Record<EmoteKind, number> = { exclaim: 0, rematch: 1 }

/**
 * 튀어 오르는 높이, 프레임마다 (`ov5_021F5CD4`의 상태 0).
 *
 * 원작이 속도 하나로 만든다 — 처음 속도가 `FX32_ONE * 6`이고 **오른 자리가 0이
 * 아닌 동안** 프레임마다 `FX32_ONE * 2`씩 깎는다. 그 되풀이를 그대로 풀면 이
 * 일곱 값이고, 마지막에 정확히 0으로 떨어지면서 다음 상태로 넘어간다.
 *
 * 단위는 **16분의 1칸**이다 — 원작의 한 칸이 16이라(`InitWalk`의 거리×프레임)
 * 꼭대기 12는 4분의 3칸이다
 */
export const EMOTE_RISE: readonly number[] = [6, 10, 12, 12, 10, 6, 0]

/** 내려앉은 뒤 서 있는 프레임 (`ov5_021F5CD4`의 상태 1) */
export const EMOTE_HOLD = 30

/** 한 칸이 몇인가 (`tools/extract/movement-table.js`의 `UNITS_PER_TILE`) */
const UNITS_PER_TILE = 16

/** 표시 하나가 사는 프레임 */
export const EMOTE_FRAMES = EMOTE_RISE.length + EMOTE_HOLD

/**
 * `frame`번째 프레임에 얹히는 높이 (칸).
 *
 * ⚠️ **밑자리는 여기 없다.** 원작은 판때기 모델이 제 높이를 들고 있어 이 값이
 * 0이어도 머리 위에 뜨는데, 우리는 사람 그림의 키가 제각각이라 그리는 쪽이
 * 정수리를 밑자리로 잡는다. 여기 있는 것은 **거기서 얼마나 더 튀는가**다
 */
export function emoteRise(frame: number): number {
  if (frame < 0 || frame >= EMOTE_FRAMES) return 0
  return (EMOTE_RISE[frame] ?? 0) / UNITS_PER_TILE
}

/** 아직 떠 있는가 */
export function emoteAlive(frame: number): boolean {
  return frame >= 0 && frame < EMOTE_FRAMES
}
