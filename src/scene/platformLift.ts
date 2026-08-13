// 승강판을 실제로 태운다 (`platform_lift.c`의 필드 태스크 둘)
//
// 규칙은 `engine/world/platformLift`가 들고 있고, 여기는 **프레임**을 맡는다 —
// 판을 한 걸음씩 올리고, 사람을 그 위에 붙여 두고, 다 닿으면 높이판을 그
// 자리에 세운다.
//
// 원작의 상태 넷 그대로다:
//
//   START_MOVING   높이 계산을 끄고 소리를 켠다
//   MOVE           걸음마다 판과 사람의 y를 같이 올린다
//   FINISH_MOVING  높이판을 목표에 세우고 높이 계산을 **다시 켠다**
//   END            끝
//
// ⚠️ **높이판을 도중에 세우면 안 된다.** 원작이 마지막에 한 번만 세운다 —
// 가는 도중에 세우면 판 밑을 지나던 사람도 같이 끌려 올라간다
import { setHeightPlate, setHeightPlateHeight, clearHeightPlates } from '../engine/map/dynamicHeight'
import {
  LIFT_FLOOR, LIFT_MODEL, LIFT_PLATE, LIFT_SIZE_X, LIFT_SIZE_Z, LIFT_KIND, LIFT_SFX,
  liftCanMove, liftForMap, liftMoveSfx, liftPropTile, liftRiseStep, liftStateOnEnter,
  LIFT_FALL_STEP, type LiftState, type PlatformLift,
} from '../engine/world/platformLift'
import { MAP_FEATURE, setMapFeature } from '../engine/world/mapFeatures'
import { worldState } from '../state/worldState'

interface Active {
  lift: PlatformLift
  state: LiftState
  /** 판이 지금 서 있는 높이(칸) */
  propY: number
}

interface Ride {
  targetY: number
  /** 한 프레임에 가는 거리(칸). 오를 때와 내릴 때가 다르다 */
  step: number
  up: boolean
  /** 판이 목표에 닿았고 뒤처리만 남았는가 */
  landed: boolean
}

let active: Active | null = null
let ride: Ride | null = null

/** 소리를 내는 자리. 씬이 꽂아 준다 — 엔진에서 오디오를 직접 안 부른다 */
export const liftSound: {
  play: ((seq: number) => void) | null
  stop: ((seq: number) => void) | null
} = { play: null, stop: null }

/**
 * 맵에 들어설 때 (`PersistedMapFeatures_InitForPlatformLift`
 * + `PlatformLift_DynamicMapFeaturesInit`).
 *
 * 층은 **들어온 z**가 정한다. 판을 그 층 높이에 세우고 높이판도 같이 세운다
 */
export function initPlatformLift(map: number, enterZ: number): boolean {
  const lift = liftForMap(map)
  if (lift === null) return false
  setMapFeature(MAP_FEATURE.platformLift)
  const state: LiftState = liftStateOnEnter(lift, enterZ)
  const propY = lift.floorHeights[state.floorID === LIFT_FLOOR.top ? 1 : 0]
  active = { lift, state, propY }
  ride = null
  setHeightPlate(LIFT_PLATE, lift.startTileX, lift.startTileZ, LIFT_SIZE_X, LIFT_SIZE_Z, propY)
  return true
}

/** `PlatformLift_WasNotUsedWhenEnteredMap` */
export function platformLiftNotUsedWhenEnteredMap(): boolean {
  return active?.state.notUsedWhenEnteredMap ?? true
}

/**
 * 밟았다 (`PlatformLift_Trigger`).
 *
 * @returns 실제로 움직이기 시작했으면 true. 리그 판은 이미 위면 거짓이다
 */
export function triggerPlatformLift(): boolean {
  if (active === null || ride !== null) return false
  const { lift, state } = active
  if (!liftCanMove(lift, state.floorID)) return false

  const up = state.floorID === LIFT_FLOOR.bottom
  state.floorID = up ? LIFT_FLOOR.top : LIFT_FLOOR.bottom
  ride = {
    targetY: lift.floorHeights[up ? 1 : 0],
    step: up ? liftRiseStep(lift.kind) : LIFT_FALL_STEP,
    up,
    landed: false,
  }
  liftSound.play?.(liftMoveSfx(lift.kind))
  return true
}

/**
 * 타고 있는가.
 *
 * 스크립트가 이 값으로 기다리고, 씬이 같은 값을 `player.riding`에 넣는다 —
 * 그 한 값이 조작·조우·지면 따라가기를 한꺼번에 멈춘다. 원작이 필드 태스크로
 * 같은 것을 한다 (`PlayerAvatar_SetHeightCalculationEnabled(…, FALSE)` 포함)
 */
export function platformLiftBusy(): boolean {
  return ride !== null
}

/** 판이 지금 그리는 자리. 이 맵에 판이 없으면 null */
export function platformLiftProp():
{ model: number; x: number; y: number; z: number } | null {
  if (active === null) return null
  const tile = liftPropTile(active.lift)
  return {
    model: active.lift.kind === LIFT_KIND.pokemonLeague
      ? LIFT_MODEL.pokemonLeague
      : LIFT_MODEL.ironIsland,
    x: tile.x, y: active.propY, z: tile.z,
  }
}

/**
 * 한 프레임 (`FieldTask_PlatformLiftGoUp` · `..._GoDown`).
 *
 * 원작이 프레임마다 한 걸음이므로 60분의 1초를 한 프레임으로 센다 — 화면이
 * 몇 헤르츠든 걸리는 시간이 같다
 */
export function platformLiftTick(dt: number): void {
  if (active === null || ride === null) return
  if (ride.landed) {
    // FINISH_MOVING — 여기서야 높이판이 목표로 간다
    setHeightPlateHeight(LIFT_PLATE, ride.targetY)
    liftSound.play?.(LIFT_SFX.arrive)
    ride = null
    return
  }

  const frames = dt * 60
  const next = ride.up
    ? active.propY + ride.step * frames
    : active.propY - ride.step * frames
  const done = ride.up ? next >= ride.targetY : next <= ride.targetY
  active.propY = done ? ride.targetY : next

  // 사람은 판에 붙어 간다 (`Player_SetYPos`). 높이 계산은 꺼져 있다
  worldState.player.position.y = active.propY
  worldState.player.prevPosition.y = active.propY

  if (done) {
    liftSound.stop?.(liftMoveSfx(active.lift.kind))
    ride.landed = true
  }
}

/** 맵을 옮기면 판도 높이판도 없어진다 */
export function resetPlatformLift(): void {
  active = null
  ride = null
  clearHeightPlates()
}
