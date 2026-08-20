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
import { findPlatform, initialHiddenGroups, mapOf } from '../engine/world/distortion'
import { distortionBridge } from '../engine/world/distortion'
import { initialPlatformFlags } from '../engine/world/distortionElevator'
import { initialPuzzleFlags } from '../engine/world/distortionBoulder'
import { applyCamera, distortionCameraSwing, seatCamera } from './distortionCamera'
import { applyCascade, distortionCascading } from './distortionCascade'
import {
  distortionActive, distortionBehaviorAt, distortionBlockedAt, distortionData, distortionFloor,
  distortionFrame, distortionFrontTile, distortionHooks, distortionJumpBlocked,
  setDistortionFloor, setPlatformIndex, setState, state, toWorldTiles,
} from './distortionCore'
import { distortionRiding, resetDistortionRide, startRide } from './distortionElevator'
import { applyEvents, distortionEventRunning, resetDistortionEvents } from './distortionEvents'
import { applyJump, resetDistortionJump } from './distortionJump'
import { dropBoulder } from './distortionBoulder'
import { applyTeleport, resetDistortionObjects, spawnFloorObjects } from './distortionObjects'

// ── 밖이 쓰는 것만 다시 내보낸다 ─────────────────────────────────────────────
//
// ⚠️ **`export *`로 두지 않는다.** 갈래끼리 쓰려고 연 이름(`applyCascade`·
// `bindPlatform`·`setDistortionFloor`…)까지 딸려 나가면 이 파일의 표면이
// 갈라 놓기 전보다 넓어진다 — 갈라 놓은 뜻이 없어진다. 여기 적힌 것이
// **밖에서 부를 수 있는 전부**이고, 실제로 부르는 자리를 세어서 적었다.
export type { DistortionPropPlace } from './distortionCore'
export {
  distortionActive, distortionFloor, distortionGroundY, distortionHooks, distortionKind,
  distortionLoaded, distortionPlayerPos, distortionPreload, distortionPropPlaces,
  distortionPropShown, distortionRebindPlatform, distortionSpawn, distortionUnavailable,
  groundYAt, isDistortionFloor,
} from './distortionCore'
export {
  distortionCascadePose, distortionCascadeTick, distortionCascading,
} from './distortionCascade'
export { distortionCameraTick, distortionResetCamera } from './distortionCamera'
export { distortionJumpTick, distortionJumping } from './distortionJump'
export {
  distortionEventRunning, distortionEventTick, distortionForgetEvents, distortionSlideAt,
} from './distortionEvents'
export { distortionRideAt, distortionRideTick, distortionRiding } from './distortionElevator'
export { distortionBoulderFalling, distortionBoulderTick } from './distortionBoulder'
export {
  GIRATINA_SHADOW_KIND, distortionGhostRunning, distortionGhostTick, distortionShadowAt,
  distortionShadowTick, finishDistortionShadow, startDistortionShadow,
} from './distortionGiratina'
export { distortionAddObject, distortionRemoveObject } from './distortionObjects'

export function distortionEnter(mapId: number, x: number, y: number, z: number): void {
  // 발판 자리 번호는 **층마다** 다시 센다 — 앞 층에서 밀려 있던 값을 들고
  // 오면 다음 층의 엉뚱한 판이 그만큼 옆으로 나가 서 있는다
  resetDistortionEvents()
  resetDistortionObjects()
  const data = distortionData()
  if (data === null) { setDistortionFloor(null); setPlatformIndex(-1); return }
  const floor = mapOf(data, mapId)
  setDistortionFloor(floor)
  if (floor === null) { setPlatformIndex(-1); return }
  const s = state()
  if (!s.valid) {
    const [wx, wy, wz] = toWorldTiles(x, y, z)
    const platform = findPlatform(floor.platforms, wx, wy, wz)
    setPlatformIndex(platform)
    // 처음 들어설 때 발판 자리와 바위 자리를 세운다 (`InitPersistedData`).
    // ⚠️ **들어선 층이 값을 바꾼다** — B7F로 들어오면 위로 갈 발판이 다 서 있다
    setState({
      valid: true,
      platformIndex: Math.max(0, platform),
      platformFlags: initialPlatformFlags(mapId),
      puzzleFlags: initialPuzzleFlags(distortionHooks.puzzleFinished?.() ?? false),
      hiddenGroups: initialHiddenGroups(floor.visibleGroups),
    })
    seatCamera()
    spawnFloorObjects(mapId)
    return
  }
  // 판 개수 이상이면 「어느 판도 아니다」다 — 보통 격자로 걷는다
  setPlatformIndex(s.platformIndex < floor.platforms.length ? s.platformIndex : -1)
  seatCamera()
  spawnFloorObjects(mapId)
  // ⚠️ **층을 갈아탈 때마다 소품 보임새를 그 층 기본값으로 되돌린다.**
  // 원작이 층을 바꿀 때 `SetPersistedHiddenGhostPropGroups(system, 0)` 뒤에
  // `InitActiveGhostPropManager(system, TRUE)`를 부른다 — 즉 이어받는 것이
  // 아니라 **다시 세운다**. 안 그러면 앞 층에서 켠 무리가 다음 층에서 켜진
  // 채로 남아, 아직 나오면 안 되는 발판이 미리 서 있는다
  if (s.hiddenGroups !== initialHiddenGroups(floor.visibleGroups)) {
    setState({ hiddenGroups: initialHiddenGroups(floor.visibleGroups) })
  }
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
distortionBridge.inWorld = distortionActive
distortionBridge.behaviorAt = distortionBehaviorAt
distortionBridge.jumpBlocked = distortionJumpBlocked
distortionBridge.dropBoulder = dropBoulder
