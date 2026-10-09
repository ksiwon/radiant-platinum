// 주인공 몸이 목표 자세로 도는 법 (`scene/EngineDriver`가 프레임마다 부른다)
import type { Quaternion } from 'three'

/**
 * 몸이 도는 빠르기(rad/s) — 180°를 0.15초에 돈다. 우리 값이다: 원작은 한 칸 걸음 하나(`WALK_ON_SPOT_FASTER` 2프레임)에
 * 장을 바꿀 뿐이라 각속도가 없다. 사람이 걷다 뒤로 도는 데 한 발(조깅 걸음 0.36초의 절반)을 넘기지 않게 잡았다 —
 * 엔진의 감속이 0을 지나는 데 0.06초라(`actor/player`의 `lerp` 12) 몸이 70°쯤 돈 뒤에 새 방향으로 나간다
 */
export const PLAYER_TURN_RATE = Math.PI / 0.15

/** 다음 프레임에 몸을 목표로 **돌리지 말고 앉힌다** (맵 갈이 · 이어하기) */
let snapPending = false

/**
 * 맵이 갈리거나 저장에서 이어서 시작할 때 부른다 — `cameraSystem.snap()`과 짝이다.
 *
 * ⚠️ **몸도 카메라처럼 앉혀야 한다.** 카메라 기울기는 그대로 앉는데 몸이 이전 자세에서 0.15초 돌아 오면,
 * 벽 · 천장에서 이어한 첫 프레임들에 몸이 한 번 돌아 앉고, 벽에서 보통 맵으로 나설 때는 눕다 일어선다
 */
export function snapPlayerPose(): void {
  snapPending = true
}

/** 앉히라는 부탁이 걸려 있나 — 읽으면 풀린다 */
export function takePlayerPoseSnap(): boolean {
  const was = snapPending
  snapPending = false
  return was
}

/**
 * 몸을 목표로 한 프레임 돌린다 — 일정한 빠르기다 (`PLAYER_TURN_RATE`).
 *
 * 예전의 `slerp(…, delta · 12)`는 지수로 다가가서 처음은 빠르고 끝이 길게 늘어졌다 — 90%까지 0.19초,
 * 나머지가 꼬리로 남아 몸이 새 방향으로 「흘러」 들어갔다. `snap`이면 돌리지 않고 곧바로 앉는다
 */
export function stepBodyRotation(
  current: Quaternion, target: Quaternion, delta: number, snap: boolean,
): void {
  if (snap) { current.copy(target); return }
  const left = current.angleTo(target)
  current.slerp(target, left < 1e-4 ? 1 : Math.min(1, (PLAYER_TURN_RATE * delta) / left))
}
