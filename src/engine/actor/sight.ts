// 트레이너의 시선과 말 걸 상대 (DATA.md §2.3)
//
// 지금까지 트레이너는 **내가 먼저 말을 걸어야만** 싸웠다. 원작은 반대다 —
// 눈이 마주치면 저쪽이 다가온다. 그것이 4세대 필드의 긴장 절반이라, 없으면
// 길에 서 있는 사람이 배경이 된다.
//
// 규칙은 `trainer_encounter.c`가 그대로 적어 두고 있다:
//
//   `GetTrainerDistToPlayer` — 보는 방향으로 `sightRange`칸까지 **직선**만 본다.
//   `IsPathInterrupted`      — 그 사이가 막혀 있으면 못 본다. 거리 0도 못 본다.
//   `GetTrainerType`         — 옆을 보든 도는 유형이든 판정은 **지금 보는 방향** 하나다.
//
// ⚠️ 시야 거리는 배치표의 `data[0]`(원시 7번 워드)다. 이름이 없는 칸이라
// 실측으로 확인했다 — 트레이너 446명에서 0~6에만 떨어지고, 트레이너가 아닌
// 3109명에서는 117까지 아무 값이나 나온다. 같은 칸을 다른 뜻으로 쓴다는 뜻이다.
import type { Npc } from '../map/world'

/** `generated/trainer_types.txt` 순서 그대로 */
export const TRAINER_TYPE = {
  none: 0,
  normal: 1,
  viewAllDirections: 2,
  unk3: 3,
  faceSides: 4,
  faceCounterclockwise: 5,
  faceClockwise: 6,
  spinCounterclockwise: 7,
  spinClockwise: 8,
  /** 말을 걸어도 제 스크립트가 안 돈다. `field_control.c`가 이 값만 따로 막는다 */
  noTalk: 9,
} as const

/**
 * 시선 판정을 하는 유형.
 *
 * `GetTrainerType`이 옆보기·회전 다섯을 전부 `NORMAL`로 접는다 — **어느 쪽을
 * 보고 있느냐만 남는다.** 그래서 도는 트레이너도 판정은 한 방향뿐이다
 */
const RAY_TYPES = new Set<number>([
  TRAINER_TYPE.normal,
  TRAINER_TYPE.faceSides,
  TRAINER_TYPE.faceCounterclockwise,
  TRAINER_TYPE.faceClockwise,
  TRAINER_TYPE.spinCounterclockwise,
  TRAINER_TYPE.spinClockwise,
])

/** `facing` 값이 가리키는 한 칸. 0이 +z(남)이고 시계 방향이다 */
const STEP = [
  { x: 0, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
] as const

/** 배치표의 `data[0]`. 이름이 없는 칸이라 원시 워드로 읽는다 */
export function sightRange(npc: Npc): number {
  return npc.raw[7] ?? 0
}

export interface Sighted {
  npc: Npc
  /** 트레이너가 보고 있던 방향 (`facing` 규약) */
  facing: number
  /** 몇 칸 떨어져 있는가. 1이면 바로 앞이다 */
  distance: number
}

export interface SightWorld {
  /** 그 칸이 통행 불가인가 */
  blocked(x: number, z: number): boolean
}

/**
 * 이 트레이너가 지금 나를 보고 있는가.
 *
 * 보이면 몇 칸인지 돌려준다. 대각선은 안 본다 — 원작도 네 방향 직선뿐이다.
 */
export function seesPlayer(
  npc: Npc, facing: number, px: number, pz: number, world: SightWorld,
): number | null {
  const range = sightRange(npc)
  const step = STEP[((facing % 4) + 4) % 4]
  if (!step) return null

  // 거리는 1부터 센다. 그래서 시야 0인 트레이너(446명 중 56명)는 이 고리를
  // 한 번도 안 돈다 — 원작에서도 `IsPathInterrupted`가 거리 0을 곧바로 막는다
  let x = npc.x, z = npc.z
  for (let d = 1; d <= range; d++) {
    x += step.x
    z += step.z
    if (x === px && z === pz) return d
    // 사람이 서 있기 **전에** 막힌 칸이 있으면 못 본다. 마지막 칸은 사람이
    // 서 있는 자리라 검사에서 빠진다 — 원작이 마지막 한 칸을 따로 다루는 이유다
    if (world.blocked(x, z)) return null
  }
  return null
}

/**
 * 지금 나를 본 트레이너 하나.
 *
 * 여럿이 동시에 볼 수 있는데 원작은 **먼저 찾은 쪽**이 이긴다
 * (`TrainerEncounter_...`가 목록을 앞에서부터 훑고 첫 번째에서 반환한다)
 */
export function trainerInSight(
  npcs: readonly { npc: Npc; facing: number }[],
  px: number, pz: number,
  world: SightWorld,
  defeated: (npc: Npc) => boolean,
): Sighted | null {
  for (const { npc, facing } of npcs) {
    if (!RAY_TYPES.has(npc.trainerType)) {
      if (npc.trainerType !== TRAINER_TYPE.viewAllDirections) continue
      // 사방을 보는 유형은 네 방향을 차례로 본다. 남 → 동 → 북 → 서 순이다
      for (let dir = 0; dir < 4; dir++) {
        const d = seesPlayer(npc, dir, px, pz, world)
        if (d !== null && !defeated(npc)) return { npc, facing: dir, distance: d }
      }
      continue
    }
    const d = seesPlayer(npc, facing, px, pz, world)
    if (d !== null && !defeated(npc)) return { npc, facing, distance: d }
  }
  return null
}
