// 다가오는 트레이너 (PARITY §1.13) — `trainer_encounter.c`
//
// 눈이 마주치면 **저쪽이 걸어온다.** 지금까지는 마주친 자리에서 그 사람의
// 스크립트가 곧바로 돌았는데, 원작은 느낌표가 뜨고 → 이쪽을 보고 → 한 칸씩
// 걸어와 → 바로 앞에 서고 → 그제야 말을 건다. 그 사이가 4세대 필드의 긴장이다.
//
// 상태 기계는 `sApproachingTrainerTask` 열여덟 칸인데, **화면에 보이는 것**만
// 남기면 다섯이다:
//
//   ① 주인공 쪽을 본다                (`ApproachingTrainerTask_FaceDirection`)
//   ② 머리 위에 느낌표를 띄우고 **끝날 때까지 기다린다**
//                                     (`..._Unk_05`의 `ov5_021F5D8C` · `..._Unk_06`)
//   ③ 30프레임 쉰다                   (`..._DelayCheckNextToPlayer`)
//   ④ `sightRange − 1`칸 걸어온다      (`..._StepTowardsPlayer`)
//   ⑤ 8프레임 쉬고 주인공이 돌아본다   (`..._DelayNextToPlayer` · `..._TryPlayerFaceTrainer`)
//
// ⚠️ **②를 빼면 안 된다.** 그리는 장치(`scene/EmoteMarks`)는 진작 있었는데
// 시선 쪽에서 아무도 안 불러서, 눈이 마주친 트레이너가 **말없이 걸어왔다.**
// 원작은 느낌표가 다 뜨고 사라진 **뒤에** 걷기 시작한다.
//
// ⚠️ **한 칸을 남긴다.** `sightRange <= 1`이면 걸음이 0이다 — 바로 앞에서 눈이
// 마주쳤으면 안 움직인다. 안 남기면 주인공 칸으로 걸어 들어간다.
//
// ⚠️ **주인공은 첫 사람만 돌아본다.** 둘이 동시에 볼 때(VS2·더블) 두 번째
// 사람에게는 안 돌아본다 — 원작이 `approachNum == 0 || VS2`로 거른다.
import { DIR } from '../script/movement'
import { EMOTE_FRAMES } from './emote'

/** `enum ApproachType` */
export const APPROACH_TYPE = { singles: 0, doubles: 1, vs2: 2 } as const

/** 이쪽을 보고 나서 걷기 시작할 때까지 (`data->delay >= 30`) */
export const APPROACH_TURN_DELAY = 30
/** 다 와서 주인공이 돌아볼 때까지 (`data->delay < 8`) */
export const APPROACH_ARRIVE_DELAY = 8

/** `movements` 표의 번호. 방향 넷이 나란히 있다 */
export const MOVEMENT_FACE_NORTH = 0
export const MOVEMENT_WALK_NORMAL_NORTH = 12
/** `DELAY_32`·`DELAY_8` — 원작의 30·8과 가장 가까운 칸이다 */
export const MOVEMENT_DELAY_32 = 66
export const MOVEMENT_DELAY_8 = 63

/**
 * 쉬는 동작과 그 프레임 수 (`movements` 표의 `DELAY_*`), 긴 것부터.
 *
 * 표에 있는 값은 이 일곱뿐이라 아무 길이나 못 쉰다 — 원하는 프레임을 이
 * 값들의 합으로 쪼갠다. 없는 칸을 지어내는 것보다 낫다
 */
const DELAYS: readonly (readonly [frames: number, action: number])[] = [
  [32, MOVEMENT_DELAY_32], [16, 65], [15, 64], [8, MOVEMENT_DELAY_8],
  [4, 62], [2, 61], [1, 60],
]

/**
 * `frames`프레임을 쉬는 동작 목록.
 *
 * 큰 칸부터 욕심껏 담는다. 표에 1이 있으니 어떤 수든 정확히 떨어진다
 */
export function delaySteps(frames: number): MovementStepLike[] {
  const out: MovementStepLike[] = []
  let left = Math.max(0, Math.trunc(frames))
  for (const [size, action] of DELAYS) {
    const n = Math.floor(left / size)
    if (n > 0) { out.push({ action, count: n }); left -= n * size }
  }
  return out
}

/**
 * 방향 하나에 맞는 동작 번호 (`MovementAction_TurnActionTowardsDir`).
 *
 * ⚠️ **표가 북·남·서·동 차례로 붙어 있다** — 원작이 기준 동작에 방향 번호를
 * 그냥 더한다. 그래서 「북쪽 것 + 방향」이 곧 그 방향의 동작이다
 */
export function actionTowards(base: number, dir: number): number {
  return base + (((dir % 4) + 4) % 4)
}

/** 두 자리 사이의 방향 (`GetDirectionBetweenPoints`) */
export function dirBetween(fromX: number, fromZ: number, toX: number, toZ: number): number {
  const dx = toX - fromX, dz = toZ - fromZ
  // 가로세로 중 먼 쪽이 이긴다. 같으면 세로다 — 원작도 z를 먼저 본다
  if (Math.abs(dz) >= Math.abs(dx)) return dz < 0 ? DIR.north : DIR.south
  return dx < 0 ? DIR.west : DIR.east
}

export interface MovementStepLike { action: number, count: number }

/**
 * 다가오는 한 사람의 동작 목록.
 *
 * @param dir        걸어올 방향 (트레이너가 보는 쪽)
 * @param sightRange 눈이 닿은 거리. 1이면 바로 앞이라 안 걷는다
 */
export function approachMovements(dir: number, sightRange: number): MovementStepLike[] {
  const steps: MovementStepLike[] = [
    { action: actionTowards(MOVEMENT_FACE_NORTH, dir), count: 1 },
    // ⚠️ **느낌표가 다 뜨고 사라질 때까지 걷지 않는다** (`..._Unk_06`이
    // `ov5_021F5C4C`로 기다린다). 표시를 띄우는 것은 `trySight`가 하고,
    // 여기서는 그 길이(37프레임)만큼 멈춰 선다 — 안 멈추면 느낌표가
    // 걸어오는 사람을 따라다닌다
    ...delaySteps(EMOTE_FRAMES),
    // 30프레임 = DELAY_32 하나로는 두 프레임이 남는다. 표에 30이 없어서
    // 32를 쓴다 — 눈으로는 못 가르는 차이고, 없는 칸을 지어내는 것보다 낫다
    { action: MOVEMENT_DELAY_32, count: 1 },
  ]
  const walk = Math.max(0, sightRange - 1)
  if (walk > 0) steps.push({ action: actionTowards(MOVEMENT_WALK_NORMAL_NORTH, dir), count: walk })
  steps.push({ action: MOVEMENT_DELAY_8, count: 1 })
  return steps
}

/** 몇 칸 걸어오는가. 화면을 안 켜고도 잴 수 있게 따로 둔다 */
export function approachSteps(sightRange: number): number {
  return Math.max(0, sightRange - 1)
}

/** 지금 다가오고 있는 사람 하나 (`ApproachingTrainer`) */
export interface ApproachingTrainer {
  localID: number
  trainerID: number
  /** 트레이너가 보고 있던 방향 = 걸어올 방향 */
  direction: number
  /** 눈이 닿은 거리 */
  sightRange: number
  /** `APPROACH_TYPE.*` */
  type: number
}
