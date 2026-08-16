// 발판이 통째로 미끄러진다 (`EVENT_CMD_MOVE_PLATFORM`) — PARITY §6.10
//
// B2F의 길은 이 발판이 낸다. 정해진 칸을 밟으면 판이 잠깐 떨다가 여덟·아홉·
// 열일곱 칸을 미끄러져 가고, 주인공은 그 위에 실려 간다. 다 가면 주인공만
// 한 번 뛰어 내리고 판은 제자리로 돌아온다 — 사건 하나가 그 셋을 차례로 든다:
//
//     movePlatform(움직임 1, movePlayer=참)   태우고 간다
//     setMapObjectAnimation(주인공, 뛰기)      내려선다
//     movePlatform(움직임 1, movePlayer=거짓)  빈 판이 돌아온다
//
// 규칙은 전부 원작의 상수다. **한 프레임에 옮기면 안 된다** — 그러면 판은
// 가만히 있고 사람만 여덟 칸 순간이동한다 (실제로 그랬다).
import { DIR } from '../script/movement'

/** 한 칸이 고정소수점으로 얼마인가 (`MAP_OBJECT_TILE_SIZE` = `FX32_ONE << 4`) */
export const TILE_FX = 4096 * 16

/**
 * 미끄러지기 전에 떠는 폭, 프레임마다 (**타일** 단위).
 *
 * 원작은 `MOVING_PLATFORM_VIBRATION_Y_DELTA`(= `FX32_ONE * 3`, 곧 3/16타일)에서
 * 시작해 부호를 뒤집으며 한 바퀴마다 1/16씩 줄이고, 1/16에 닿으면 네 번 더
 * 떨고 멈춘다 (`EventCmdMovePlatform_Vibrate`). 그 열두 프레임을 그대로 편 표다 —
 * ±3 ±2 ±1 ±1 ±1 ±1 하고 제자리
 */
export const VIBRATION: readonly number[] =
  [3, -3, 2, -2, 1, -1, 1, -1, 1, -1, 1, 0].map((n) => n / 16)

/**
 * 판이 다 가는 데 걸리는 프레임.
 *
 * 원작은 프레임마다 `posDelta`를 더하고 `finalPosOffset`과 **같아질 때** 멈춘다.
 * 자료의 `posDelta`가 늘 `FX32_ONE * 4`(= 1/4타일)이라 여덟 칸이면 서른두
 * 프레임이다. 축이 여럿이면 제일 오래 걸리는 축이 정한다
 */
export function platformFrames(
  offset: readonly [number, number, number], delta: readonly [number, number, number],
): number {
  let frames = 0
  for (let i = 0; i < 3; i += 1) {
    const want = Math.abs((offset[i] ?? 0) * TILE_FX)
    const step = Math.abs(delta[i] ?? 0)
    if (want === 0 || step === 0) continue
    frames = Math.max(frames, Math.ceil(want / step))
  }
  return frames
}

/**
 * 내려서는 뜀 (`MOVEMENT_ACTION_JUMP_DISTORTION_WORLD_*`).
 *
 * `MovementAction_InitJumpCustomSound(dir, FX32_CONST(2), 8 * 3, …)` — 프레임마다
 * 2/16타일씩 스물네 프레임이라 **정확히 세 칸**이다. B2F에서 판이 멎는 자리와
 * 건너편 턱 사이가 그 세 칸이다 (실측: 사건이 서는 칸 z=25와 판이 멎는 z=28)
 */
export const HOP_FRAMES = 24
export const HOP_TILES = 3

/** 뛰는 방향 표. 없는 동작이면 null */
export function hopDirOf(action: number): number | null {
  switch (action) {
    case 117: return DIR.north
    case 118: return DIR.south
    case 119: return DIR.west
    case 120: return DIR.east
    default: return null
  }
}

/**
 * 뜀의 높이 표 (`sJumpHeights_High`, 타일 단위).
 *
 * 원작은 프레임마다 `0xA0`씩 더한 값을 `0x100`으로 나눈 것을 자리로 쓰고
 * `0xF00`에서 막는다 — 스물네 프레임 × `0xA0` = `0xF00`이라 마지막 칸에 딱 닿는다.
 * 값은 고정소수점 정수 단위(1 = 1/16타일)라 16으로 나눈다
 */
const HOP_ARC: readonly number[] =
  [4, 6, 8, 10, 11, 12, 12, 12, 11, 10, 9, 8, 6, 4, 0, 0].map((n) => n / 16)
const HOP_STEP = 0xa0
const HOP_CAP = 0xf00

/** 뛰는 중 `frame`프레임째의 발 높이 (타일). `frame`은 1부터 센다 */
export function hopLift(frame: number): number {
  if (frame <= 0) return 0
  const at = Math.min(HOP_CAP, Math.floor(frame) * HOP_STEP) >> 8
  return HOP_ARC[Math.min(HOP_ARC.length - 1, at)] ?? 0
}
