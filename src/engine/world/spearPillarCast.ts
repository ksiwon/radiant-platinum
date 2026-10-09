// 창기둥 영상의 사람 넷 — 걸음 무늬에서 **보는 쪽과 몸짓**을 뽑는다 (PARITY §8.15 · `engine/world/spearPillarMovie`)
//
// 원작은 사람을 2D 판때기로 그리고, 걸음 무늬(`Unk_ov100_021D5344` · `ov100_021D4510`)가 그림을 한 장씩 갈아 끼운다.
// 그림은 네 장씩 한 묶음이다(`pic = floor(BTP0 프레임 / 4)` — `o.frame[0] = pic * 4`):
//
//   묶음 0 (그림 0~3)    위 보기 (뒷모습)   북 −z
//   묶음 1 (그림 4~7)    아래 보기 (앞모습) 남 +z   — 카메라가 +z에 있다 (`ov100_021D1C44`의 각 −0x29fe · 0 · 0)
//   묶음 2 (그림 8~11)   왼쪽               서 −x
//   묶음 3 (그림 12~15)  오른쪽             동 +x
//
// 걸음 무늬 1~4는 묶음 0~3을 걷고(그림 1 · 2 · 3 · 2), 5~8은 그 묶음에 서서 멈추고(0 · 4 · 10 · 14),
// 9~12는 묶음 0~3을 0 · 1 · 2 · 3으로 돈다. **보는 쪽은 무늬가 아니라 지금 그려진 그림이 정한다** — 걸음이 끝나면
// 무늬는 0이 되지만 그림은 마지막 장에 남아 그쪽을 본다(태홍이 돌아서 서 있는 것이 그것이다).
// ⚠️ 장면 2의 걸음(`Unk_ov100_021D54B8` · `54A0`)은 **위 보기 그림으로 +z(카메라 쪽)로 옮긴다** — 뒷걸음이다.
// 몸은 그림이 정한 쪽을 보고, 옮기는 방향은 원작대로 따로 간다
//
// 걷는지는 걸음 줄이 도는 동안(`active`)의 이동 무늬(1~4 · 9~12)로 안다. 5~8은 제자리 돌기다

type Facing = 'north' | 'south' | 'west' | 'east'

const GROUPS: readonly Facing[] = ['north', 'south', 'west', 'east']

/** 모델이 +z를 볼 때 그 쪽을 보려면 y축으로 돌릴 각 (라디안) */
export const FACING_YAW: Readonly<Record<Facing, number>> = {
  south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2,
}

/** 그림 번호(0부터)가 보는 쪽 */
export function pictureFacing(picture: number): Facing {
  return GROUPS[Math.max(0, Math.min(3, Math.floor(picture / 4)))]!
}

/** BTP0 프레임(정수)에서 그림 번호 — 한 그림이 네 프레임 */
export const pictureOf = (frame: number): number => Math.floor(Math.max(0, frame) / 4)

/** 걸음 무늬가 발을 옮기는가 (1~4 걷기 · 9~12 미끄러짐). 5~8은 제자리에서 서고 0은 걸음이 없다 */
export function isStepPattern(pattern: number): boolean {
  return (pattern >= 1 && pattern <= 4) || (pattern >= 9 && pattern <= 12)
}

interface PersonPose {
  facing: Facing
  /** y축 각 (라디안) */
  yaw: number
  /** 발을 옮기는가 — 아니면 서 있는다 */
  walking: boolean
}

/** 사람 하나의 한 장 — 무늬 · 걸음 줄이 도는가 · BTP0 프레임(정수) */
export function personPose(pattern: number, active: boolean, frame: number): PersonPose {
  const facing = pictureFacing(pictureOf(frame))
  return { facing, yaw: FACING_YAW[facing], walking: active && isStepPattern(pattern) }
}

/** 두 각 사이를 가까운 쪽으로 최대 `step`만큼 돈다 (라디안) */
export function turnToward(from: number, to: number, step: number): number {
  const TAU = Math.PI * 2
  const d = ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI
  return Math.abs(d) <= step ? to : from + Math.sign(d) * step
}
