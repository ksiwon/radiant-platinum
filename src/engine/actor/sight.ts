// 트레이너의 시선 (DATA.md §2.3 · `trainer_encounter.c`)
//
// 원작은 내가 말을 걸기 전에 저쪽이 온다 — 눈이 마주치면 다가와서 싸운다.
// 그것이 4세대 필드의 긴장 절반이라, 없으면 길에 서 있는 사람이 배경이 된다.
//
// 규칙은 `trainer_encounter.c`가 그대로 적어 두고 있다:
//
//   `GetTrainerDistToPlayer` — 보는 방향으로 `sightRange`칸까지 **직선**만 본다.
//   `IsPathInterrupted`      — 그 사이가 막혀 있으면 못 본다. 거리 0도 못 본다.
//   `GetTrainerType`         — 옆을 보든 도는 유형이든 판정은 **지금 보는 방향** 하나다.
//
// ⚠️ **묻는 자리는 「지금 선 칸」이지 배치표가 아니다.** 원작이
// `MapObject_GetX(mapObj)`를 읽는다 — 배회·순회 유형은 걸어 다니므로 배치표의
// 자리에는 이미 없다. 217번도로 아홉 명 중 넷이 30칸 넘게 떠나 있었다.
//
// ⚠️ 시야 거리는 배치표의 `data[0]`(원시 7번 워드)다. 이름이 없는 칸이라
// 실측으로 확인했다 — 트레이너 446명에서 0~6에만 떨어지고, 트레이너가 아닌
// 3109명에서는 117까지 아무 값이나 나온다. 같은 칸을 다른 뜻으로 쓴다는 뜻이다.
import type { Npc } from '../map/world'
import { DIR_STEP } from '../script/movement'

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

/**
 * 시선이 넘지 못하는 단차 (`GetVerticalDirection`의 `20 * FX32_ONE`).
 *
 * ⚠️ **눈으로 정한 값이 아니다.** 원작은 한 칸을 16으로 세고(`MAP_OBJECT_TILE_SIZE`)
 * 높이 차가 20 이상이면 `VERTICAL_DIRECTION`이 서서 `WILL_COLLIDE`가 된다 —
 * 20/16 = 1.25칸이다. 한 칸짜리 턱은 못 막고 두 칸부터 막는다는 뜻이고,
 * 그래서 언덕 위 트레이너가 아래를 못 본다
 */
export const SIGHT_STEP_LIMIT = 20 / 16

/** 배치표의 `data[0]`. 이름이 없는 칸이라 원시 워드로 읽는다 */
export function sightRange(npc: Npc): number {
  return npc.raw[7] ?? 0
}

/**
 * 지금 서 있는 사람 하나 (`MapObject`).
 *
 * ⚠️ **배치표(`Npc`)와 따로 받는다.** 배치표는 「어디서 시작했는가」고 이쪽이
 * 「지금 어디 있는가」다. 둘을 섞으면 걸어 다니는 트레이너가 처음 섰던 자리에서
 * 허공을 본다
 */
export interface Watcher {
  npc: Npc
  /** 지금 선 칸 (`MapObject_GetX`·`MapObject_GetZ`) */
  x: number
  z: number
  /** 지금 보는 방향 (`MapObject_GetFacingDir`). `DIR` 규약이다 */
  facing: number
}

interface Sighted {
  npc: Npc
  /** 트레이너가 보고 있던 방향 (`DIR` 규약) */
  facing: number
  /** 몇 칸 떨어져 있는가. 1이면 바로 앞이다 */
  distance: number
}

interface SightWorld {
  /**
   * 그 칸이 막혀 있는가 (`sub_02063E94`의 1·2번 비트).
   *
   * 지형만이 아니다 — **사람도 물체도 막는다**. 원작이 `sub_02063F00`으로
   * 같은 칸의 다른 객체를 세므로, 앞에 누가 서 있으면 그 뒤는 못 본다
   */
  blocked(x: number, z: number): boolean
  /**
   * 그 칸의 바닥 높이 (타일 단위).
   *
   * ⚠️ **기준도 이 함수로 받아 온다** — 보는 사람이 선 칸의 높이를 같은
   * 함수에 물어서 그것과 견준다. 배치표가 들고 있는 `height`는 층 번호도
   * 타일 높이도 아닌 값이 섞여 있어서(같은 체육관에서 0·10·20), 그걸 세계
   * 높이와 빼면 **평지에서도 늘 시선이 끊긴다** — 실제로 그랬다.
   *
   * 판이 겹치는 자리(다리와 그 밑)에서 어느 판을 읽을지는 부르는 쪽이
   * 이미 골라 둔다 (`heightAtWorld`의 `near`)
   */
  heightAt(x: number, z: number): number
}

/**
 * 이 트레이너가 지금 나를 보고 있는가.
 *
 * 보이면 몇 칸인지 돌려준다. 대각선은 안 본다 — 원작도 네 방향 직선뿐이다.
 */
export function seesPlayer(
  who: Watcher, px: number, pz: number, world: SightWorld,
): number | null {
  const range = sightRange(who.npc)
  const step = DIR_STEP[((who.facing % 4) + 4) % 4]
  if (!step) return null

  // 단차의 기준은 **보는 사람이 선 칸의 바닥**이다 (`objectPosition->y`)
  const base = world.heightAt(who.x, who.z)

  // 거리는 1부터 센다. 그래서 시야 0인 트레이너(446명 중 56명)는 이 고리를
  // 한 번도 안 돈다 — 원작에서도 `IsPathInterrupted`가 거리 0을 곧바로 막는다
  let x = who.x, z = who.z
  for (let d = 1; d <= range; d++) {
    x += step.x
    z += step.z
    const rise = Math.abs(world.heightAt(x, z) - base)
    // ⚠️ **사람이 선 칸도 단차는 본다.** 원작이 마지막 칸에서
    // `collisionFlags == (1 << 2)`를 요구한다 — 「사람만 있고 지형도 단차도
    // 없다」는 뜻이라, 턱 위에서 아래를 내려다보는 것은 시선이 아니다
    if (x === px && z === pz) return rise >= SIGHT_STEP_LIMIT ? null : d
    // 사람이 서 있기 **전에** 막힌 칸이 있으면 못 본다
    if (world.blocked(x, z) || rise >= SIGHT_STEP_LIMIT) return null
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
  watchers: readonly Watcher[],
  px: number, pz: number,
  world: SightWorld,
  defeated: (npc: Npc) => boolean,
): Sighted | null {
  for (const who of watchers) {
    const { npc } = who
    if (!RAY_TYPES.has(npc.trainerType)) {
      if (npc.trainerType !== TRAINER_TYPE.viewAllDirections) continue
      // 사방을 보는 유형은 네 방향을 차례로 본다. `DIR` 차례라 북 → 남 → 서 → 동이다
      for (let dir = 0; dir < 4; dir++) {
        const d = seesPlayer({ ...who, facing: dir }, px, pz, world)
        if (d !== null && !defeated(npc)) return { npc, facing: dir, distance: d }
      }
      continue
    }
    const d = seesPlayer(who, px, pz, world)
    if (d !== null && !defeated(npc)) return { npc, facing: who.facing, distance: d }
  }
  return null
}
