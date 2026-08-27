// 걸음이 내는 소리 (`player_move.c`의 `PlayerAvatar_PlayWalkSE`, 285~325줄)
//
// **평지를 걷는 소리는 원작에 없다.** 표면에서만 난다 — 눈·웅덩이·얕은 물·
// 진흙·긴 풀 다섯이고, 그 밖의 칸에서는 한 소리도 안 낸다. 모래는 원작이
// `UNUSED(TileBehavior_IsSand(nextTile))`로 값만 버린다(313줄).
//
// ⚠️ **우리 이동은 격자가 아니라 연속이다** (`actor/player`의 반지름 0.3).
// 원작의 「한 걸음」에 해당하는 이산 사건이 우리에게 둘 있고 이 파일이 그 둘을
// 가른다:
//
//   ① 지나온 거리 1칸 = 한 걸음     `actor/stepTrace`가 이미 세고 있다
//   ② 밀었는데 못 간 걸음           원작의 `MOVEMENT_ACTION_WALK_ON_SPOT_SLOW`
//
// ②의 되풀이 주기는 짐작이 아니다. 원작이 막힌 걸음에 그 동작을 걸고
// (`player_move.c` 1031줄) 그 동작이 **16프레임**짜리다
// (`MovementAction_WalkOnSpotSlowNorth_Step0`이 `InitWalkOnSpot(…, 16, …)`을
// 부른다 — `unk_020655F4.c` 691줄). 그 16프레임이 지나야 `CheckStartMoveInternal`이
// 다시 참이 되고, 그때 `SetMovement_*`가 소리를 한 번 더 낸다. 곧 **벽에 대고
// 계속 밀면 16프레임마다 한 번**이고 그것이 원작의 소리 간격 그대로다.
import { SFX } from '../audio/sfx'
import {
  isMud, isDeepMud, isOnSnow, isPuddle, isShallowWater, isSnowWithShadows, isVeryTallGrass,
} from '../map/zone'
import { DIR, DIR_STEP } from '../script/movement'

/** 한 걸음이 딛는 자리. 원작이 `PlayWalkSE` 하나에 넘기는 것과 같은 것들이다 */
interface StepSurface {
  /** 닿는 칸의 거동값 (`MapObject_GetCurrTileBehavior`) */
  next: number
  /**
   * 떠나는 칸의 거동값 (`MapObject_GetTileBehaviorFromDir`).
   *
   * ⚠️ **긴 풀만 이걸 본다.** 나머지 넷은 닿는 칸만 보고, 원작이 그렇게
   * 갈라 적어 두었다 — 풀은 스치는 소리라 나가는 걸음에도 난다
   */
  cur: number
  /** 다리 **위**인가 (`MapObject_IsStatusOnElevatedBridge`). 눈 다리가 갈린다 */
  onBridge: boolean
  /**
   * 제자리걸음인가 (`MovementAction_IsWalkOnSpotSlow`) — 곧 벽에 막힌 걸음이다.
   *
   * ⚠️ **긴 풀만 이때 입을 다문다.** 눈·웅덩이·얕은 물·진흙은 막힌 걸음에도
   * 그대로 난다 — 원작이 `if (!IsWalkOnSpotSlow(code))`를 풀 하나에만 걸었다
   */
  walkOnSpotSlow: boolean
}

/**
 * 이 걸음이 낼 소리들. **차례가 원작의 줄 차례 그대로다** (301 → 305 → 309 →
 * 315 → 322줄).
 *
 * ⚠️ **여럿이 한꺼번에 날 수 있다.** 원작이 `if`를 다섯 번 잇달아 쓰고
 * `else if`가 하나도 없다 — 웅덩이가 긴 풀 위에 있으면 둘 다 난다
 */
export function walkEffects(s: StepSurface): number[] {
  const out: number[] = []
  if (isOnSnow(s.next, s.onBridge) || isSnowWithShadows(s.next)) out.push(SFX.SNOW_STEP)
  if (isPuddle(s.next)) out.push(SFX.PUDDLE_STEP)
  if (isShallowWater(s.next)) out.push(SFX.SHALLOW_WATER_STEP)
  if (isMud(s.next) && !isDeepMud(s.next)) out.push(SFX.MUD_STEP)
  if (!s.walkOnSpotSlow && (isVeryTallGrass(s.next) || isVeryTallGrass(s.cur))) {
    out.push(SFX.GRASS_BRUSH)
  }
  return out
}

// 워프 거동값 (`map_tile_behaviors.h`) — `PlayerAvatar_WillWarp`가 보는 것들
const WARP_ENTRANCE_EAST = 0x62
const WARP_ENTRANCE_WEST = 0x63
const WARP_ENTRANCE_NORTH = 0x64
const WARP_ENTRANCE_SOUTH = 0x65
/** `TILE_BEHAVIOR_DOOR`. `map/world`의 `TILE_BEHAVIOR_DOOR`와 같은 값이다 */
const DOOR = 0x69

/**
 * 막힌 걸음이 **워프였는가** (`PlayerAvatar_WillWarp`, `player_move.c` 2043줄).
 *
 * 참이면 부딪히는 소리를 안 낸다 — 아홉 자리가 다 그 조건을 앞세운다.
 * ⚠️ **문 타일은 우리 격자에서 통행 불가다** (`actor/player`의 주석). 이 갈래가
 * 없으면 원작이 조용히 들어가는 문마다 벽 소리가 난다
 */
export function isWarpStep(cur: number, ahead: number, dir: number): boolean {
  if (dir === DIR.north && cur === WARP_ENTRANCE_NORTH) return true
  if (dir === DIR.south && cur === WARP_ENTRANCE_SOUTH) return true
  if (dir === DIR.west && cur === WARP_ENTRANCE_WEST) return true
  if (dir === DIR.east && cur === WARP_ENTRANCE_EAST) return true
  return ahead === DOOR
}

/** 그 방향으로 한 칸 (`MapObject_GetDxFromDir` · `..._GetDzFromDir`) */
export const stepOf = (dir: number): { x: number, z: number } =>
  DIR_STEP[dir] ?? { x: 0, z: 0 }

/**
 * 막힌 걸음이 되풀이되는 프레임 수 (`MovementAction_WalkOnSpotSlow*_Step0`).
 *
 * 원작 프레임이 60Hz다 — 우리 고정 스텝도 그렇게 잡혀 있다 (`engine/loop`)
 */
export const BUMP_FRAMES = 16
/** 그 16프레임을 초로 */
export const BUMP_PERIOD = BUMP_FRAMES / 60

/**
 * 「밀었는데 못 갔다」를 원작의 걸음 주기로 자르는 자.
 *
 * 우리는 프레임마다 충돌을 보므로 그대로 소리를 내면 초당 60번이 된다.
 * 원작은 막힌 걸음 하나가 16프레임을 먹고 그 끝에서야 다음 걸음을 시도하므로,
 * **처음 막힌 프레임에 한 번 내고 그 다음은 16프레임마다** 한 번이다.
 *
 * ⚠️ **안 막히면 그 자리에서 다시 채워진다** — 원작도 걸음이 통하면
 * 제자리걸음 동작이 끝나고 다음 충돌이 곧바로 새 걸음이 된다
 */
export class BumpGate {
  private wait = 0

  /**
   * 이 프레임에 소리를 낼 것인가. `blocked`는 「밀고 있는데 못 간다」다.
   *
   * ⚠️ **초가 아니라 프레임으로 센다.** 원작의 값이 프레임 수고(16), 초로 바꿔
   * 더하고 빼면 뜨는 소수가 쌓여 **열일곱 프레임마다**가 된다 — 실제로 그랬다.
   * 고정 스텝이 60Hz라(`engine/loop`) 한 번 부름이 곧 한 프레임이다
   */
  push(blocked: boolean): boolean {
    if (!blocked) { this.wait = 0; return false }
    // ⚠️ **깎고 나서 본다.** 보고 나서 깎으면 첫 프레임이 주기를 통째로 얹고
    // 시작해서 한 프레임이 남는다
    this.wait -= 1
    if (this.wait > 0) return false
    this.wait = BUMP_FRAMES
    return true
  }

  /** 워프·맵 갈아타기 다음에 부른다 — 새 맵의 첫 충돌은 첫 충돌이다 */
  reset(): void { this.wait = 0 }
}
