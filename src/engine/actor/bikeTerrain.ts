// 자전거만 지나가는 지형 둘 — **도약대**와 **진흙 비탈** (PARITY §1.9)
//
// 원작의 자전거가 하는 일은 빨라지는 것만이 아니다. 자전거를 타야만 지나갈 수
// 있는 칸이 두 갈래 있고, 그 둘이 길을 가른다:
//
//   `BIKE_RAMP_EASTWARD`·`WESTWARD` (0xD7·0xD8)  스물넷 — 옆으로 날아 넘는다
//   `BIKE_SLOPE_TOP`·`BOTTOM`      (0xD9·0xDA)  서른넷 — 북쪽은 전속력만 오른다
//
// ⚠️ **둘 다 우리 화면에서는 없는 것이었다.** 도약대 스물넷은 격자에서 전부
// 통행 불가라 **영영 못 넘는 벽**이었고(굴다래동굴 `m_dun2102_`가 그 벽 열로
// 갈려 있다), 비탈 서른넷은 전부 그냥 걸어지는 바닥이라 **걸어서 올라갔다.**
// 앞엣것은 길을 막고 뒤엣것은 막아야 할 길을 연다 — 방향이 반대인 같은 구멍이다.
//
// **거리도 시간도 원작 값이다.** 도약은 `MovementAction_InitJump(…, 거리, 프레임)`
// 꼴이라 한 칸(16px)으로 나누면 몇 칸인지가 그대로 나온다
// (`unk_020655F4.c`):
//
//   `JumpFartherEast`  4px × 12프레임 = 48px = **3칸**을 0.20초에 (4단 전속력)
//   `JumpNearSlowEast` 1px × 16프레임 = 16px = **1칸**을 0.27초에 (그 밖)
//
// ⚠️ **자료가 그 둘을 확인해 준다.** 도약대 스물넷을 다 훑으면 1칸 착지와 3칸
// 착지가 **스물넷 다** 걸을 수 있는 칸이고, 도약대 자신과 그 너머 두 칸째는
// 막혀 있다. 짐작한 거리였다면 여기서 어긋난다.
import { SFX } from '../audio/sfx'
import { Behavior } from '../map/zone'

/**
 * 이번 틱에 자전거가 낼 소리들. **씬이 비워 간다** (`scene/walkSound`).
 *
 * ⚠️ **엔진이 SDAT를 울리지 않는다.** 규칙은 여기, 울리는 일은 씬이다 —
 * `actor/footstep`과 `scene/walkSound`가 나눈 것과 같은 나눔이고, 엔진이
 * 씬을 들여오면 three가 값으로 딸려 온다
 */
const cues: number[] = []

/** 자전거가 낼 소리를 쌓는다 (`actor/bikeGear`도 쓴다) */
export function pushBikeCue(id: number): void { cues.push(id) }

/** 쌓인 소리를 가져가고 비운다 */
export function drainBikeCues(): readonly number[] {
  if (cues.length === 0) return cues
  return cues.splice(0, cues.length)
}

/** 도약대가 받는 방향 — **그 쪽으로 밀 때만** 걸린다 (`PlayerAvatar_WillHitBikeRamp`) */
const RAMP_DIR: Readonly<Record<number, number>> = {
  [Behavior.BIKE_RAMP_EAST]: 1,
  [Behavior.BIKE_RAMP_WEST]: -1,
}

/** 4단 전속력의 먼 도약 (`MOVEMENT_ACTION_JUMP_FARTHER_*`) */
export const RAMP_FAR_TILES = 3
const RAMP_FAR_TIME = 12 / 60
/** 그 밖의 도약 (`MOVEMENT_ACTION_JUMP_NEAR_SLOW_*`) */
export const RAMP_NEAR_TILES = 1
const RAMP_NEAR_TIME = 16 / 60

/** 이 값이 진흙 비탈인가 (`TileBehavior_IsBikeSlope`) */
export function isBikeSlope(behavior: number): boolean {
  return behavior === Behavior.BIKE_SLOPE_TOP || behavior === Behavior.BIKE_SLOPE_BOTTOM
}

/** 이 값이 도약대인가 (`TileBehavior_IsBikeRamp*`) */
export function isBikeRamp(behavior: number): boolean {
  return behavior === Behavior.BIKE_RAMP_EAST || behavior === Behavior.BIKE_RAMP_WEST
}

/** 도약대 판정에 필요한 것의 전부 — 턱(`ledgeHop`)이 쓰는 것과 같은 꼴이다 */
interface RampGrid {
  behavior: (tileX: number, tileZ: number) => number
  isBlocked: (tileX: number, tileZ: number) => boolean
}

/**
 * 지금 자리에서 이 방향으로 가면 도약대를 타는가. 타면 **착지할 칸 한가운데**와
 * 걸리는 시간을, 아니면 `null`을 돌려준다.
 *
 * ⚠️ **자전거가 아니면 그냥 벽이다.** 원작에서도 도약대 칸은 통행 불가고,
 * 도약을 여는 것은 `SetMovement_Bike*`의 갈래뿐이다 — 걸어온 사람은
 * `CheckCollision`의 보통 충돌로 떨어져 부딪히는 소리를 낸다.
 *
 * ⚠️ **먼 도약은 4단 전속력에서만 난다.** 3단은 늘 `SPEED_2`라 그 자리에
 * 영영 못 닿고(`bike.ts`의 `THIRD_GEAR_LEVEL`), 4단이라도 아직 못 올린
 * 속도면 가까운 도약이다. 두 착지 칸 다 걸을 수 있는 자리라 갇히지 않는다
 * (자료로 스물넷을 다 확인했다)
 */
export function bikeRampHop(
  grid: RampGrid, x: number, z: number, vx: number, vz: number,
  cycling: boolean, atTopSpeed: boolean,
): { x: number; z: number; time: number } | null {
  if (!cycling) return null
  // 미는 쪽이 뚜렷해야 한다 — 도약대는 동서로만 받는다
  const dx = Math.abs(vx) > Math.abs(vz) ? Math.sign(vx) : 0
  if (dx === 0) return null

  const tx = Math.floor(x), tz = Math.floor(z)
  const ramp = RAMP_DIR[grid.behavior(tx + dx, tz)]
  // 받는 쪽에서 와야 한다. 반대쪽에서 밀면 그냥 벽이다 — 그래서 **한 방향 문**이다
  if (ramp !== dx) return null

  const tiles = atTopSpeed ? RAMP_FAR_TILES : RAMP_NEAR_TILES
  const landX = tx + dx * (1 + tiles)
  // 착지가 막혔으면 안 뛴다 — 턱과 같은 규칙이다. 자료에는 그런 자리가 없지만,
  // 사용자의 롬이 우리 롬이 아닐 수 있다 (REPAIR §24)
  if (grid.isBlocked(landX, tz)) return null
  // ⚠️ **먼 도약에만 소리가 붙는다.** 가까운 쪽은 `InitJump`가 기본으로 내는
  // 뛰는 소리라 여기서 따로 안 낸다
  if (atTopSpeed) cues.push(SFX.BIKE_RAMP_FAR)
  return {
    x: landX + 0.5,
    z: tz + 0.5,
    time: atTopSpeed ? RAMP_FAR_TIME : RAMP_NEAR_TIME,
  }
}

/**
 * 비탈을 흘러내리는 속도 (걷기의 몇 배).
 *
 * · 내려가는 쪽은 `MOVEMENT_ACTION_WALK_FASTER_SOUTH`(8px × 2프레임)라 **4배**다
 * · 못 오르고 미끄러지는 쪽은 `MOVEMENT_ACTION_WALK_SLOW_*`(1px × 16프레임)라
 *   **0.5배**다 — 원작이 그 갈래에만 `WALK_SLOW`를 쓴다
 */
export const SLOPE_DESCENT = 4
export const SLOPE_SLIP = 0.5

/**
 * 못 오르고 미끄러지는 중인가.
 *
 * ⚠️ **원작도 상태로 든다** (`PlayerAvatar_SetMoveThroughMudFlag`). 한 번
 * 미끄러지기 시작하면 비탈에서 내려설 때까지 조작이 안 먹는다 — 그 사이에
 * 다시 위를 누를 수 있으면 비탈 한복판에서 버틸 수 있게 된다
 */
let slipping = false

/**
 * 소리를 낸 비탈 칸. **칸마다 한 번**이다 — 원작이 걸음마다
 * `TileMove_BikeSlope`를 부르고 그 첫 줄이 `SUNA`라, 두 칸짜리 비탈을 내려오면
 * 두 번 난다
 */
let soundedAt = ''

export function clearBikeSlip(): void { slipping = false; soundedAt = '' }
export function isSlippingDownSlope(): boolean { return slipping }

/** 비탈 판정이 세계에 묻는 것 */
interface SlopeView {
  behaviorAt: (tileX: number, tileZ: number) => number
}

/**
 * 진흙 비탈 위의 걸음 (`PlayerAvatar_TileMove_BikeSlope`).
 *
 * 비탈 위가 아니면 `null`이라 보통 걸음이 그대로 간다. 비탈 위면 속도를
 * 통째로 갈아 끼운다 — 얼음(`iceStep`)과 같은 자리다.
 *
 * 원작의 차례 그대로다:
 *
 * · **북쪽(오르막)** — 자전거로 **전속력일 때만** 오른다. 그 밖에는 미끄러져
 *   내려간다. 걸어서는 어떤 속도로도 못 오른다
 * · **남쪽(내리막)** — 4배로 흘러내린다. 걷든 타든 같다
 * · **동서** — 원작 `TileMove`가 남북만 다루고 나머지는 `FALSE`를 준다.
 *   보통 걸음이다
 *
 * ⚠️ **비탈은 늘 위(0xD9) 한 칸 · 아래(0xDA) 한 칸씩 짝이다** (실측 열일곱 짝
 * 전부). 그래서 「비탈 위인가」만 보면 되고 어느 쪽 칸인지는 안 묻는다
 */
export function bikeSlopeStep(
  view: SlopeView, pos: { x: number; z: number },
  input: { vx: number; vz: number }, walkSpeed: number, atTopSpeedOnBike: boolean,
): { vx: number; vz: number } | null {
  const tx = Math.floor(pos.x), tz = Math.floor(pos.z)
  const here = view.behaviorAt(tx, tz)
  if (!isBikeSlope(here)) { slipping = false; soundedAt = ''; return null }

  const north = input.vz < -1e-6
  const south = input.vz > 1e-6
  // 원작은 `TileMove`가 도는 걸음마다 소리를 내고, 그 함수는 남북으로 갈 때만
  // 일을 한다 — 가만히 선 걸음에는 안 난다
  if (slipping || north || south) {
    const at = `${String(tx)},${String(tz)}`
    if (at !== soundedAt) { soundedAt = at; cues.push(SFX.BIKE_SLOPE) }
  }

  // 미끄러지는 동안은 조작이 통째로 안 먹는다 (`MAP_OBJ_STATUS_LOCK_DIR`)
  if (slipping) return { vx: 0, vz: walkSpeed * SLOPE_SLIP }
  if (north) {
    if (atTopSpeedOnBike) return null
    slipping = true
    return { vx: 0, vz: walkSpeed * SLOPE_SLIP }
  }
  if (south) return { vx: 0, vz: walkSpeed * SLOPE_DESCENT }
  return null
}
