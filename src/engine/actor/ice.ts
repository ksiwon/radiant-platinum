// 얼음 위의 강제 이동 (`PlayerAvatar_TileMove_Ice`)
//
// 선단시티 체육관의 기믹이 이것 하나다 — 밟으면 조작이 안 먹고, 부딪힐 때까지
// 미끄러진다. 눈덩이 열아홉을 어디에 두고 어느 쪽에서 들어가느냐가 곧 퍼즐이다.
//
// ⚠️ **없는 동안 그 체육관은 그냥 넓은 방이었다.** 눈덩이는 §1.28이 붙으면서
// 길을 막게 됐지만(`actor/obstacles`), 막기만 하고 미끄러지지 않으면 퍼즐이
// 아니라 장애물이다 — 관장에게 걸어서 곧장 갔다. 실측: 이 거동값이 깔린 자리가
// 선단 체육관 497칸 · 선단신전 여섯 층 338칸으로 **835칸**이고, 그 전에는
// 코드 어디에서도 0x20을 안 봤다.
//
// 원작 상태 기계는 칸에 잠겨 있고 우리는 3D 자유 이동이라, **한 칸에 한 번**
// 도는 판정을 「칸 경계를 넘을 때」로 옮긴다. 그 밖은 그대로다.
import { Behavior } from '../map/zone'

/** `TILE_BEHAVIOR_ICE`. 값과 그 근거는 `map/zone`의 거동표 한 자리에 있다 */
export const TILE_BEHAVIOR_ICE = Behavior.ICE

/**
 * 미끄러지는 속도. `AVATAR_MOVE_SPEED_0`~`_3`에 걸리는 이동 동작이 정한다.
 *
 * 원작은 프레임 수로 말한다 (`unk_020655F4.c`의 `InitWalk`·`InitWalkUneven`):
 *
 * | 속도 | 이동 동작 | 한 칸에 | 걷기 대비 |
 * |---|---|---|---|
 * | 0 | `WALK_FAST` | 4프레임 | 1.5배 |
 * | 1 | `WALK_SLIGHTLY_FASTER` | 3프레임 | 2배 |
 * | 2·3 | `WALK_FASTER` | 2프레임 | 3배 |
 *
 * 걷기가 `WALK_SLIGHTLY_FAST`(6프레임)이고 **달리기가 `WALK_FAST`로 속도 0과
 * 같은 동작**이라, 얼음의 첫 단은 곧 달리는 빠르기다. 그래서 여기서는 우리
 * 달리기 속도에 매달고 나머지를 프레임 비(4:3:2)로 올린다 — 걷기·달리기 값을
 * 손보면 얼음도 같이 따라간다
 */
export const ICE_SPEED_RATIO: readonly number[] = [1, 4 / 3, 2, 2]

/** `AVATAR_MOVE_SPEED_3` — 더 못 올라간다 */
export const ICE_MAX_SPEED = 3

/** 한 번 미끄러질 때 훑어볼 칸 수의 상한. 선단 체육관이 32칸 폭이다 */
const MAX_RUN = 64

/** `enum PlayerHeightChange` */
type HeightChange = 'none' | 'increase' | 'decrease'

/** 얼음 판정이 세계에 묻는 것 전부. 시험이 이 모양만 채우면 된다 */
export interface IceView {
  /** 칸의 거동값 (`BEHAVIOR_MASK`를 씌운 값) */
  behaviorAt: (tileX: number, tileZ: number) => number
  /** 그 칸 한가운데로 들어갈 수 있는가 */
  blockedAt: (tileX: number, tileZ: number) => boolean
  /**
   * 그 **점**의 지면 높이. 좌표는 칸 단위 실수다 — 칸 한가운데는 `(tx + 0.5, tz + 0.5)`.
   * 비탈 칸 안에서 높이가 달라지는 것까지 읽어야 한다 (`heightChange`)
   */
  heightAt: (x: number, z: number) => number
  /**
   * 그 칸에 **눈덩이**가 서 있으면 깨고 참 (`ov5_021E06A8`). 없으면 거짓.
   * 눈덩이가 없는 맵·시험은 안 채워도 된다
   */
  breakAt?: (tileX: number, tileZ: number) => boolean
  /**
   * 그 칸에서 (dx, dz)로 한 칸 가는 걸음을 **가장자리가** 막는가 (`actor/edgeBlock`).
   * 선단 체육관의 0x49·0x4A가 그렇다. 없는 맵·시험은 안 채워도 된다
   */
  edgeBlockedAt?: (tileX: number, tileZ: number, dx: number, dz: number) => boolean
}

/** 미끄러지는 동안의 상태. 한 번에 하나뿐이라 모듈에 둔다 */
interface IceSlide {
  active: boolean
  /** 잠긴 방향. 사방 중 하나라 한 축만 ±1이다 */
  dx: number
  dz: number
  /** `AVATAR_MOVE_SPEED_*` */
  speed: number
  /** 마지막으로 한 칸 판정을 돌린 칸 */
  tileX: number
  tileZ: number
  /** 멈출 칸 한가운데 */
  toX: number
  toZ: number
  /**
   * 오르막에서 되밀리는 한 걸음인가. 원작은 그 걸음에 `SetIgnoreTileBehavior`를
   * 걸어 얼음을 안 본다 — 칸을 넘어도 다시 미끄러지지 않고 그 한 칸에서 선다
   */
  bouncing: boolean
}

export const iceSlide: IceSlide = {
  active: false, dx: 0, dz: 0, speed: 0, tileX: 0, tileZ: 0, toX: 0, toZ: 0, bouncing: false,
}

/** 맵을 옮기거나 배틀이 열리면 푼다 */
export function clearIceSlide(): void {
  iceSlide.bouncing = false
  iceSlide.active = false
  iceSlide.dx = 0
  iceSlide.dz = 0
  iceSlide.speed = 0
}

/**
 * 속도 벡터를 사방 하나로 잠근다.
 *
 * 원작은 십자키라 방향이 애초에 넷이다. 우리는 아날로그라 **우세한 축**을
 * 고른다 — 대각으로 들어가도 얼음은 한 축으로만 민다
 */
export function lockDirection(vx: number, vz: number): { dx: number; dz: number } | null {
  if (Math.abs(vx) < 1e-3 && Math.abs(vz) < 1e-3) return null
  if (Math.abs(vx) >= Math.abs(vz)) return { dx: Math.sign(vx), dz: 0 }
  return { dx: 0, dz: Math.sign(vz) }
}

/**
 * 층으로 칠 최소 높이 차(타일).
 *
 * ⚠️ **똑같은지 그대로 비교하면 안 된다.** 원작 높이는 fx32 정수라 층이
 * 딱 떨어지지만 우리는 BDHC 판을 보간해서 읽으므로 **같은 단의 이웃 칸끼리도
 * 소수점 아래가 다르다.** 선단 체육관을 실측한 값이 그것을 보여 준다
 * (`.audit/probe/iceHeights.mjs`):
 *
 * - 평평한 단은 정확히 1 · 2 · 3이다 (57 · 106 · 217칸)
 * - 단과 단 사이 비탈만 흔들린다 — 2.5짜리 56칸이 2.4989 · 2.4994 · 2.4995 ·
 *   2.4999 넷으로 갈린다. 제일 크게 벌어지는 폭이 **0.0012타일**이다
 *
 * 그걸 층으로 읽으면 비탈을 지날 때마다 없는 오르막이 잡히고, 속도 0에서
 * 걸리면 **되밀리기가 튀어 나온다.** 관문은 원작 좌표의 최소 눈금인 1/16타일로
 * 둔다 — 잡음의 50배이고 진짜 단(0.5타일)의 8분의 1이라 양쪽에서 넉넉하다
 */
export const ICE_HEIGHT_EPSILON = 1 / 16

/**
 * 높이를 견줄 앞 점 — 칸 한가운데에서 **4분의 1칸** (`((16 << FX) >> 1) / 2` = 4/16칸)
 */
export const ICE_LOOK_AHEAD = 1 / 4

/**
 * 높이가 오르는가 내리는가 (`PlayerAvatar_CheckIceHeightChange`).
 *
 * 원작은 선 칸 한가운데와 **4분의 1칸 앞**의 높이를 견준다. 그 점은 **아직 선 칸 안**이다 —
 * 그래서 비탈은 **비탈 칸 위에서 한 번만** 잡힌다. 평평한 칸에서는 앞 칸이 비탈이어도
 * 「그대로」다.
 *
 * ⚠️ **이웃 칸 한가운데와 견주면 비탈 하나를 두 번 센다** — 평평한 칸 → 비탈 칸에서 한 번,
 * 비탈 칸 → 다음 평평한 칸에서 또 한 번. 전에 그렇게 옮겨서 선단 체육관의 무청 앞 턱
 * (11,5)에 못 올랐다: (11,6)은 평평한 3단이라 원작은 속도 0 그대로 턱으로 미끄러져 서는데,
 * 우리는 턱 칸 한가운데(3.5)를 보고 「오르막」으로 읽어 되밀었다(REPAIR §80)
 */
export function heightChange(view: IceView, tileX: number, tileZ: number,
  dx: number, dz: number): HeightChange {
  const here = view.heightAt(tileX + 0.5, tileZ + 0.5)
  const next = view.heightAt(tileX + 0.5 + dx * ICE_LOOK_AHEAD, tileZ + 0.5 + dz * ICE_LOOK_AHEAD)
  if (Math.abs(here - next) < ICE_HEIGHT_EPSILON) return 'none'
  return here > next ? 'decrease' : 'increase'
}

/**
 * 한 칸 지나고 나서의 속도 (`PlayerAvatar_UpdateIceSpeedFromHeightChange`).
 *
 * 내리막이면 빨라지고 오르막이면 느려진다. **0에서 더 느려질 수 없으면
 * `null`** — 원작은 그때 미끄러지기를 풀고 한 칸 되걸어 나온다
 */
export function iceSpeedAfter(speed: number, change: HeightChange): number | null {
  if (change === 'increase') {
    const slower = speed - 1
    return slower < 0 ? null : slower
  }
  if (change === 'decrease') return Math.min(speed + 1, ICE_MAX_SPEED)
  return speed
}

/**
 * 이 방향으로 미끄러지면 어느 칸에서 멈추는가.
 *
 * 두 가지로 끝난다 — **막힌 칸 앞**에서 서거나, **얼음이 아닌 첫 칸**에 올라서서
 * 선다. 뒤엣것이 원작의 「그 칸에서는 강제 이동 함수가 안 걸린다」다
 * (`sTileBehaviorCheckTable`이 지금 밟은 칸의 거동값을 본다).
 *
 * 칸을 넘을 때마다 다시 부른다 — 눈덩이는 밀리고 사람은 걸어 다닌다
 */
export function iceRunEnd(view: IceView, tileX: number, tileZ: number,
  dx: number, dz: number): { tileX: number; tileZ: number } {
  let x = tileX
  let z = tileZ
  for (let i = 0; i < MAX_RUN; i += 1) {
    const nx = x + dx
    const nz = z + dz
    if (view.blockedAt(nx, nz) || view.edgeBlockedAt?.(x, z, dx, dz) === true) break
    x = nx
    z = nz
    if (view.behaviorAt(x, z) !== TILE_BEHAVIOR_ICE) break
  }
  return { tileX: x, tileZ: z }
}

/** 얼음이 지금 이 걸음을 가져갔는가, 가져갔으면 어떤 속도인가 */
interface IceStep {
  /** 미끄러지는 속도 벡터(타일/초). 둘 다 0이면 멈춘 것이다 */
  vx: number
  vz: number
}

/**
 * 한 프레임.
 *
 * `null`이면 얼음이 안 잡은 것이라 평소 이동으로 내려간다. 값이 오면 **입력을
 * 무시하고** 그 속도로 간다 — 얼음 위에서 조작이 안 먹는 것이 이 한 줄이다
 */
export function iceStep(view: IceView, pos: { x: number; z: number },
  input: { vx: number; vz: number }, runSpeed: number): IceStep | null {
  const tx = Math.floor(pos.x)
  const tz = Math.floor(pos.z)

  // 얼음에서 내려섰으면 끝이다. 멈출 칸까지 미끄러져 온 뒤라 그 자리에 선다
  if (view.behaviorAt(tx, tz) !== TILE_BEHAVIOR_ICE) {
    if (!iceSlide.active) return null
    // 마지막 칸(얼음이 아닌 첫 칸) 한가운데까지는 마저 간다
    /**
     * ⚠️ **다 왔으면 그 프레임은 속도 0을 낸다 — `null`이 아니다.** `null`은 「얼음이 안 잡았다」라
     * 평소 이동이 미끄럼 속도(초당 8칸)를 이어받아 가감속으로 반 칸 넘게 흘러간다. 흘러서
     * 앞 칸이 얼음이면 **남은 속도로 새 미끄럼이 잡힌다** — 선단 체육관 (1,8)에서 멈춰야 할
     * 미끄럼이 (1,3)까지 갔다(탐침 추적 · REPAIR §81). 원작은 강제 이동이 칸 한가운데에서 끝난다
     */
    const done = reachedTarget(pos)
    if (done) { clearIceSlide(); return { vx: 0, vz: 0 } }
    return towardTarget(pos, runSpeed)
  }

  if (!iceSlide.active) {
    const dir = lockDirection(input.vx, input.vz)
    // 얼음 위에 가만히 서 있는 것은 원작에서도 된다. 걸음을 내디뎌야 잡힌다
    if (dir === null) return null
    iceSlide.active = true
    iceSlide.dx = dir.dx
    iceSlide.dz = dir.dz
    iceSlide.speed = 0
    iceSlide.tileX = tx
    iceSlide.tileZ = tz
    /**
     * ⚠️ **첫 걸음도 높이를 본다.** 원작 `TileMove_Ice`는 얼음 위 걸음마다 — 첫
     * 걸음도 — 높이 변화로 속도를 정한다. 비탈 꼭대기에서 내려서면 첫 걸음부터
     * 속도 1이고(그래서 바로 아래 눈덩이가 깨진다), 속도 0에서 오르막이면 되밀린다
     */
    const first = iceSpeedAfter(0, heightChange(view, tx, tz, dir.dx, dir.dz))
    if (first === null) return bounceBack(view, pos, tx, tz, runSpeed)
    iceSlide.speed = first
    retarget(view, tx, tz)
  } else if (iceSlide.bouncing) {
    // 되밀리는 걸음은 얼음을 안 본다 — 목표 칸까지 가서 선다
    iceSlide.tileX = tx
    iceSlide.tileZ = tz
  } else if (tx !== iceSlide.tileX || tz !== iceSlide.tileZ) {
    // 칸을 넘었다 — 원작이 한 칸에 한 번 돌리는 판정이 여기다
    iceSlide.tileX = tx
    iceSlide.tileZ = tz
    /**
     * **눈덩이는 부딪히면 깨진다** (`ov5_021E067C` → `ov5_021E06A8`). 원작은 강제
     * 이동 중 한 걸음이 끝날 때마다 가는 쪽 칸을 보고, 속도가 1 이상이고 거기
     * 선 물체가 눈덩이(118)면 지우고 `SEQ_SE_DP_FW291`을 낸다. 함수가 늘 0을
     * 돌려주므로 미끄럼은 그대로 이어진다 — 지운 뒤 다음 걸음의 충돌 판정에는
     * 이미 없다.
     *
     * ⚠️ **속도는 방금 지나온 걸음의 것이다.** 판정이 `TileMove_Ice`의 속도
     * 갱신보다 먼저 돈다. 평평한 얼음은 속도 0이라 안 깨지고, **비탈을 내려와
     * 속도가 붙어야** 깨진다 — 안내원이 「얼음 위를 달려 기세 좋게 부수는 거야」
     * 라고 하는 그것이다. 걸어서 밀면 강제 이동이 아니라 안 깨진다
     */
    if (iceSlide.speed >= 1) view.breakAt?.(tx + iceSlide.dx, tz + iceSlide.dz)
    const next = iceSpeedAfter(iceSlide.speed,
      heightChange(view, tx, tz, iceSlide.dx, iceSlide.dz))
    if (next === null) return bounceBack(view, pos, tx, tz, runSpeed)
    iceSlide.speed = next
    retarget(view, tx, tz)
  }

  if (reachedTarget(pos)) { clearIceSlide(); return { vx: 0, vz: 0 } }
  return towardTarget(pos, runSpeed * ICE_SPEED_RATIO[iceSlide.speed]!)
}

/**
 * ⚠️ **오르막에서 힘이 다하면 되밀린다** — 원작은 반대 방향으로 한 칸을
 * 느리게 걷고 얼음을 한 번 안 본다(`SetIgnoreTileBehavior`). 우리도
 * 방향을 뒤집고 그 한 칸까지만 간다.
 *
 * ⚠️ **뒤가 막혔으면 되밀리지 않고 선다** — 원작이 되밀리기 전에 반대쪽 충돌을 보고
 * 막혔으면 `FALSE`로 돌아간다(`TileMove_Ice`의 두 갈래)
 */
function bounceBack(view: IceView, pos: { x: number; z: number }, tx: number, tz: number,
  runSpeed: number): IceStep {
  const bx = -iceSlide.dx, bz = -iceSlide.dz
  if (view.blockedAt(tx + bx, tz + bz) || view.edgeBlockedAt?.(tx, tz, bx, bz) === true) {
    clearIceSlide()
    return { vx: 0, vz: 0 }
  }
  iceSlide.dx = -iceSlide.dx
  iceSlide.dz = -iceSlide.dz
  iceSlide.speed = 0
  iceSlide.bouncing = true
  iceSlide.toX = tx + iceSlide.dx + 0.5
  iceSlide.toZ = tz + iceSlide.dz + 0.5
  return towardTarget(pos, runSpeed)
}

function retarget(view: IceView, tx: number, tz: number): void {
  const end = iceRunEnd(view, tx, tz, iceSlide.dx, iceSlide.dz)
  iceSlide.toX = end.tileX + 0.5
  iceSlide.toZ = end.tileZ + 0.5
}

/** 목표 칸 한가운데를 지났는가. 진행 축만 본다 */
function reachedTarget(pos: { x: number; z: number }): boolean {
  const left = (iceSlide.toX - pos.x) * iceSlide.dx + (iceSlide.toZ - pos.z) * iceSlide.dz
  return left <= 0
}

function towardTarget(pos: { x: number; z: number }, speed: number): IceStep {
  // 남은 거리보다 빨리 가지 않는다 — 넘어가면 목표를 지나쳐 되돌아온다
  const left = Math.max(0, (iceSlide.toX - pos.x) * iceSlide.dx
    + (iceSlide.toZ - pos.z) * iceSlide.dz)
  const v = Math.min(speed, left * 60)
  return { vx: iceSlide.dx * v, vz: iceSlide.dz * v }
}

/**
 * 얼음이 잡고 있는가. 걷기 자세를 멈추는 쪽(`locomotion`)이 이걸 본다 —
 * 원작도 미끄러지는 동안 `MAP_OBJ_STATUS_PAUSE_ANIMATION`으로 그림을 세운다
 */
export function isSliding(): boolean {
  return iceSlide.active
}

/** 얼음 거동값인가. 거동표를 두 벌로 두지 않으려고 여기서만 판정한다 */
export function isIce(behavior: number): boolean {
  return behavior === TILE_BEHAVIOR_ICE
}
