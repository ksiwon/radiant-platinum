// 깨어진 세계를 세계에 이어 붙인다 (PARITY §6.10)
//
// **여기는 차례만 정한다.** 규칙은 `engine/world/distortion*`에 있고, 연출은
// 갈래마다 제 파일을 갖는다 — 공유하는 층 자료와 판은 `distortionCore`다:
//
//   맵에 들어선다   → 자료를 받고 발밑의 판을 잡는다 (`InitMapElements`)
//   한 칸 걸었다    → 방아쇠 · 카메라 · 뛰는 자리 · 폭포
//   칸에 닿았다     → 승강 발판 · 사건 · 스크립트 칸
//   맵을 나간다     → 돌던 것을 전부 버린다
//
// ⚠️ **밖에서는 이 파일 하나만 부른다.** 아래에서 갈래들을 그대로 다시 내보내
// 두었으므로 `scene/distortion`을 부르던 자리는 그대로 둔다 — 갈래 파일을
// 직접 부르면 이 차례를 건너뛰게 된다.
import { connectionOf, findPlatform, initialHiddenGroups, mapOf } from '../engine/world/distortion'
import { distortionBridge } from '../engine/world/distortion'
import { world as mapWorld } from '../engine/map/world'
import { initialPlatformFlags } from '../engine/world/distortionElevator'
import { initialPuzzleFlags } from '../engine/world/distortionBoulder'
import { applyCamera, distortionCameraSwing, seatCamera } from './distortionCamera'
import { applyCascade, distortionCascading } from './distortionCascade'
import {
  armSteppingStones, bindPlatform, distortionActive, distortionBehaviorAt, distortionBlockedAt, distortionData,
  distortionFloor, distortionFollowsGround, distortionFrame, distortionFrontTile, distortionGroundLift,
  distortionHooks, distortionJumpBlocked, platformIndex, setDistortionFloor, setHeightCalc,
  setPlatformIndex, setState, state, takeFloorLoad, tickSteppingStones, toWorldTiles, isDistortionFloor,
} from './distortionCore'
import { SFX } from '../engine/audio/sfx'
import { music } from '../engine/audio/music'
import { distortionRiding, resetDistortionRide, startRide } from './distortionElevator'
import { applyEvents, distortionEventRunning, resetDistortionEvents } from './distortionEvents'
import { applyJump, resetDistortionJump } from './distortionJump'
import { dropBoulder } from './distortionBoulder'
import {
  applyTeleport, distortionBoulderMoved, keepBoulderSpots, resetDistortionObjects, spawnFloorObjects,
} from './distortionObjects'

// ── 밖이 쓰는 것만 다시 내보낸다 ─────────────────────────────────────────────
//
// ⚠️ **`export *`로 두지 않는다.** 갈래끼리 쓰려고 연 이름(`applyCascade`·
// `bindPlatform`·`setDistortionFloor`…)까지 딸려 나가면 이 파일의 표면이
// 갈라 놓기 전보다 넓어진다 — 갈라 놓은 뜻이 없어진다. 여기 적힌 것이
// **밖에서 부를 수 있는 전부**이고, 실제로 부르는 자리를 세어서 적었다.
export type { DistortionPropPlace } from './distortionCore'
export {
  distortionActive, distortionFloor, distortionFloorLoading, distortionGroundY, distortionHooks,
  distortionKind, distortionLoaded, distortionPlayerPos, distortionPreload, distortionPropPlaces,
  distortionPropOpacity, distortionPropShown, distortionRebindPlatform, distortionSpawn,
  distortionUnavailable,
  groundYAt, isDistortionFloor, resetDistortionPersisted, romTileToLocal, takeCarried,
} from './distortionCore'
export {
  distortionCascadePose, distortionCascadeTick, distortionCascading,
} from './distortionCascade'
export { distortionCameraTick, distortionResetCamera } from './distortionCamera'
export { distortionJumpTick, distortionJumping } from './distortionJump'
export {
  distortionEventRunning, distortionEventTick, distortionSlideAt,
} from './distortionEvents'
export { distortionRideAt, distortionRideTick, distortionRiding } from './distortionElevator'
export { distortionBoulderFalling, distortionBoulderTick } from './distortionBoulder'
export {
  GIRATINA_SHADOW_KIND, distortionGhostRunning, distortionGhostTick, distortionShadowAt,
  distortionShadowTick, finishDistortionShadow, startDistortionShadow,
} from './distortionGiratina'
export { distortionAddObject, distortionRemoveObject } from './distortionObjects'

/**
 * 이 세계의 맵에 들어섰다 (`DistWorld_DynamicMapFeaturesInit` · 층 갈이면 `PrepareLoadingActiveFloor`).
 *
 * 들어서는 길이 셋이고 원작이 셋을 다르게 다룬다:
 *
 *   워프로 들어섰다   `OnTransition`이 세이브 자리를 비웠다(`resetDistortionPersisted`) → `valid`가 0이라
 *                    `InitPersistedData`를 하고 **발밑에서 판을 찾는다** (`InitMapElements`)
 *   이어하기          `valid`가 서 있다 → 적어 둔 판 번호를 그대로 잡고(`PrepareNewCurrentFloatingPlatform`),
 *                    유령 소품 무리도 적어 둔 대로 세운다(`InitActiveGhostPropManager(…, FALSE)`)
 *   층 갈이           세계는 그대로 서 있고 층만 갈아 싣는다 — **판은 풀리고**(`FreeFloatingPlatformManagerTerrainAttrs`
 *                    — 판 번호가 「판 개수」가 된다) 유령 소품은 그 층 기본값이다(`SetPersistedHiddenGhostPropGroups(0)`
 *                    → `InitActiveGhostPropManager(…, TRUE)`). 카메라와 높이 계산은 **건드리지 않는다** — 도는 중이면
 *                    이어 돈다(`ov9_02249960.c:3944-3984`)
 */
export function distortionEnter(mapId: number, x: number, y: number, z: number): void {
  const floorLoad = takeFloorLoad()
  resetDistortionEvents()
  resetDistortionObjects()
  const data = distortionData()
  if (data === null) { setDistortionFloor(null); setPlatformIndex(-1); return }
  const floor = mapOf(data, mapId)
  setDistortionFloor(floor)
  if (floor === null) { setPlatformIndex(-1); return }
  armSteppingStones(mapId)
  const s = state()
  if (!s.valid) {
    const [wx, wy, wz] = toWorldTiles(x, y, z)
    // 처음 들어설 때 발판 자리와 바위 자리를 세운다 (`InitPersistedData`).
    // ⚠️ **들어선 층이 값을 바꾼다** — B7F로 들어오면 위로 갈 발판이 다 서 있다
    setState({
      valid: true,
      platformFlags: initialPlatformFlags(mapId),
      puzzleFlags: initialPuzzleFlags(distortionHooks.puzzleFinished?.() ?? false),
      hiddenGroups: initialHiddenGroups(floor.visibleGroups),
    })
    // 판이 없으면 「판 개수」가 적힌다 — 0을 적으면 다음에 판이 있는 층에서 판 0이 잡힌다
    bindPlatform(findPlatform(floor.platforms, wx, wy, wz))
    seatCamera()
    initPlayer()
    spawnFloorObjects(mapId)
    return
  }
  if (floorLoad) {
    bindPlatform(-1)
    // 지금 층과 다음 층의 물체만 남는다 — 밀어 둔 바위도 그 둘 밖이면 배치표 자리로 돌아간다
    keepBoulderSpots([mapId, connectionOf(data, mapId)?.next ?? -1])
    if (s.hiddenGroups !== initialHiddenGroups(floor.visibleGroups)) {
      setState({ hiddenGroups: initialHiddenGroups(floor.visibleGroups) })
    }
    spawnFloorObjects(mapId)
    return
  }
  // 판 개수 이상이면 「어느 판도 아니다」다 — 보통 격자로 걷는다
  setPlatformIndex(s.platformIndex < floor.platforms.length ? s.platformIndex : -1)
  seatCamera()
  initPlayer()
  spawnFloorObjects(mapId)
}

/**
 * 세계가 설 때 주인공의 높이 계산을 정한다 (`InitPlayer`).
 *
 * 판 밖(`AVATAR_DISTORTION_STATE_ACTIVE`)이면 켜고 판 위면 끈다 (`ov9_02249960.c:2672-2680`)
 */
function initPlayer(): void {
  setHeightCalc(platformIndex() < 0)
}

/**
 * 소품 한 프레임 — B6F의 B7F행 발판이 깃발(2423)을 보고 나타난다 (`DistWorldMovingPlatformProp_AnimTick`).
 * 처음 비치는 프레임에 소리를 낸다 (`PlaySoundIfNotActive(SEQ_SE_PL_SYUWA3)`)
 */
export function distortionPropTick(dt: number): void {
  if (tickSteppingStones(dt)) void music.playEffect(SFX.DISTORTION_APPEAR)
}

/** 깨어진 세계를 나갔다 */
export function distortionLeave(): void {
  setDistortionFloor(null)
  setPlatformIndex(-1)
  resetDistortionRide()
  resetDistortionJump()
  resetDistortionEvents()
  resetDistortionObjects()
}

/**
 * **떠나려는 칸에서** 도는 것 (`DistWorld_HandlePlayerMoved`).
 *
 * ⚠️ **도착한 칸이 아니라 서 있던 칸이다.** 원작은 걸음을 시작하는 순간
 * (`ov5_021DFE68`, 이동 상태가 `AVATAR_MOVE_STATE_MOVING`일 때) 지금 서 있는
 * 칸과 **누른 방향**으로 이 셋을 돌린다. 도착한 칸에서 돌리면 「제자리에서
 * 돌아서서 걷기」가 통째로 빠진다 — 방아쇠 칸에 서서 아래를 보고 걸으면
 * 발판이 나타나야 하는데, 다음 칸에는 방아쇠가 없어서 아무 일도 안 일어난다.
 * 실제로 그래서 밟아도 블록이 안 생겼다.
 *
 * 차례도 원작 그대로다 — 유령 소품 → 카메라 → 뛰는 자리. 뛰면 거기서 끝난다
 */
export function distortionMoved(x: number, y: number, z: number, dir: number): void {
  if (!distortionActive() || distortionRiding() || distortionEventRunning()
    || distortionCascading()) return
  const [wx, wy, wz] = toWorldTiles(x, y, z)
  applyTriggers(wx, wy, wz, dir)
  applyCamera(wx, wy, wz, dir)
  if (applyJump(wx, wy, wz, dir)) return
  applyCascade(wx, wy, wz, dir)
}

/**
 * **닿은 칸에서** 도는 것 (`DistWorld_HandlePlayerPositionChanged`).
 *
 * 승강 발판 → 사건 → 스크립트 칸. 발판이 걸리면 거기서 끝난다 —
 * 원작이 그것을 제일 먼저 본다
 */
export function distortionStepped(x: number, y: number, z: number, dir: number): void {
  if (!distortionActive() || distortionRiding() || distortionEventRunning()) return
  const [wx, wy, wz] = toWorldTiles(x, y, z)
  if (startRide(wx, wy, wz)) return
  applyEvents(wx, wy, wz)
  applyTeleport(wx, wy, wz, dir)
}

/**
 * 선 자리에서 **막힌 쪽을 밀고 있다** (`DistWorld_CheckMapTransition`).
 *
 * 원작은 멈춰 선 채 보는 쪽 키를 누르고 있으면(`input->mapTransition` · `transitionDir`,
 * `field_control.c:144-170, 318-320`) 스크립트 칸 둘을 다시 본다 — B7F (89,65,57)에서 북쪽, 기라티나 방
 * (15,1,25)에서 남쪽. 그 앞 칸은 막혀 있어서(`distortionBlockedAt`) 밀면 부딪히는 걸음이 된다. 기라티나 방에서
 * 남쪽을 보고 B7F (89,57)에 내려선 뒤 북쪽으로 돌아서 밀면 그대로 다시 넘어간다
 */
export function distortionBumped(x: number, y: number, z: number, dir: number): void {
  if (!distortionActive() || distortionRiding() || distortionEventRunning()) return
  const [wx, wy, wz] = toWorldTiles(x, y, z)
  applyTeleport(wx, wy, wz, dir)
}

function applyTriggers(wx: number, wy: number, wz: number, dir: number): void {
  const floor = distortionFloor()
  if (floor === null) return
  const s = state()
  let hidden = s.hiddenGroups
  for (const t of floor.triggers) {
    if (t.dir !== dir) continue
    if (!inBoundsOf(t.bounds, wx, wy, wz)) continue
    if (t.show) hidden &= ~(1 << t.group)
    else hidden |= 1 << t.group
  }
  if (hidden !== s.hiddenGroups) setState({ hiddenGroups: hidden })
}

function inBoundsOf(
  b: { x: number; y: number; z: number; sx: number; sy: number; sz: number },
  x: number, y: number, z: number,
): boolean {
  return y >= b.y && y <= b.y + b.sy && z >= b.z && z <= b.z + b.sz
    && x >= b.x && x <= b.x + b.sx
}

// 이동 시스템이 볼 수 있게 다리를 꽂는다 (`engine/world/distortion`의 머리말)
distortionBridge.blockedAt = distortionBlockedAt
distortionBridge.frontTile = distortionFrontTile
distortionBridge.cameraSwing = distortionCameraSwing
distortionBridge.frame = distortionFrame
/**
 * ⚠️ **층 자료가 오기 전에도 이 세계다** (REPAIR §119) — 이어하기는 자료를 받는 동안 몇 프레임을 판 없이 돈다. 그 사이에
 * 「세계 밖」으로 읽으면 주인공이 보통 맵처럼 격자 지면을 따라가, B2F 위층(지역 9)에서 쓴 리포트가 바닥(지역 1)으로 끌려
 * 내려간 뒤에 판을 골라 **사방이 막혔다**(탐침 p19)
 */
distortionBridge.inWorld = () => distortionActive() || isDistortionFloor(mapWorld.mapId)
distortionBridge.followsGround = distortionFollowsGround
distortionBridge.groundLift = distortionGroundLift
distortionBridge.behaviorAt = distortionBehaviorAt
distortionBridge.jumpBlocked = distortionJumpBlocked
distortionBridge.dropBoulder = dropBoulder
distortionBridge.boulderMoved = distortionBoulderMoved
