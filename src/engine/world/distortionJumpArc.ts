// 깨어진 세계 — 판을 건너뛸 때의 **포물선** (PARITY §6.10)
//
// 원작은 건너뛰는 동안 주인공을 직선으로 옮기면서 **그림만** 따로 띄운다
// (`MapObject_GetSpriteJumpOffset1`). 띄우는 값은 표 하나고, 칸 좌표는 건드리지 않는다.

/**
 * 뛰는 그림의 높이 표 (`sFloatingPlatformJumpOffsets`, `ov9_02249960.c:9765-9782`).
 *
 * 단위는 `FX32_ONE`이고 한 칸이 16이다 — 정점 12는 **0.75칸**이다.
 * ⚠️ **표는 열여섯 개고 앞의 4(0번)는 한 번도 안 읽힌다.** 인덱스를 틱을 **더한 뒤** 읽어서 첫 틱이
 * 곧 1번(6)이다 (`ctx->jumpOffsetIndex += positionIncrement` 다음 `/ FX32_ONE`,
 * `TickJumpOnFloatingPlatformMovementAnimation` 2991-2998). 그리고 마지막 틱은 표를 안 읽고 0을 쓴다
 * (3003-3005) — 열여섯 번째 틱이 표 밖(16번)을 읽는 일은 없다
 */
export const JUMP_ARC_OFFSETS: readonly number[] = [
  4, 6, 8, 10, 11, 12, 12, 12, 11, 10, 9, 8, 6, 4, 0, 0,
]

/** 한 칸이 몇 조각인가 (`MAP_OBJECT_TILE_SIZE / FX32_ONE`) */
const TILE_UNITS = 16
/** `FX32_ONE` */
const FX32_ONE = 0x1000

/**
 * `tick`번째 틱이 읽는 표 번호 (`jumpOffsetIndex / FX32_ONE`).
 *
 * 한 틱에 `16 · FX32_ONE / steps`씩 더하고 **정수 나눗셈**으로 읽는다 — `steps`가 16이 아니어도
 * 같은 식이다 (자료의 스무 곳은 전부 16이다)
 */
export function jumpArcIndex(tick: number, steps: number): number {
  const increment = Math.trunc((TILE_UNITS * FX32_ONE) / steps)
  return Math.trunc((tick * increment) / FX32_ONE)
}

/**
 * 정수 틱 `tick`(1부터)에서 그림이 뜬 높이 (칸).
 *
 * 0번 틱(아직 한 번도 안 돈 때)과 마지막 틱(`stepsRemaining <= 0`)은 0이다
 */
export function jumpArcLiftAtTick(tick: number, steps: number): number {
  if (tick <= 0 || tick >= steps) return 0
  const units = JUMP_ARC_OFFSETS[jumpArcIndex(tick, steps)] ?? 0
  return units / TILE_UNITS
}

/**
 * 지난 프레임 수(소수 가능)에서 그림이 뜬 높이 (칸).
 *
 * 원작은 60Hz 틱마다 표가 계단으로 바뀐다. 우리는 화면 프레임이 60Hz가 아닐 수 있어 **틱 사이를
 * 이어 준다** — 정수 틱에서는 표 값 그대로다
 */
export function jumpArcLift(frames: number, steps: number): number {
  const total = Math.max(1, steps)
  const f = Math.min(total, Math.max(0, frames))
  const a = Math.floor(f)
  const b = Math.min(total, a + 1)
  const lift = jumpArcLiftAtTick(a, total)
  return lift + (jumpArcLiftAtTick(b, total) - lift) * (f - a)
}

/**
 * 뛰는 축 (`template->jumpAxis`) — 0 = X · 1 = Y · 2 = Z. 우리 좌표도 세계 x · y · z가 그대로다.
 * `inverted`면 부호를 뒤집는다 (`invertedJump`). 자료의 스무 곳은 전부 Y · 정방향이다
 */
export function jumpArcOffset(
  frames: number, steps: number, axis: number, inverted: number,
): [number, number, number] {
  const lift = jumpArcLift(frames, steps) * (inverted === 1 ? -1 : 1)
  const out: [number, number, number] = [0, 0, 0]
  if (axis >= 0 && axis <= 2) out[axis] = lift
  return out
}
