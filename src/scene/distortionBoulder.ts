// 깨어진 세계 — 밀면 떨어지는 바위 (PARITY §6.10)
//
// 어디로 떨어지는가는 `engine/world/distortionBoulder`가 정하고, 여기서는
// 떨어지는 동안의 프레임을 센다. 미는 자리는 이동 시스템이 다리로 부른다
// (`distortionBridge.dropBoulder`).
import {
  FALL_DEST, fallDestination, fallLocationAt, fellIntoPit, fellIntoWrongPit, fellToB6F,
  puzzleSolved,
} from '../engine/world/distortionBoulder'
import { npcActors, removeNpc } from '../engine/actor/npcs'
import { MAP } from '../engine/world/distortion'
import { distortionHooks, distortionFloor, setState, state, toLocalTiles, toWorldTiles } from './distortionCore'
import { elevatorTicking } from './distortionElevator'
import { setBoulderSpot } from './distortionObjects'

/**
 * 떨어지는 중인 바위 (`DistWorldFallingBoulder`).
 *
 * 셋 다 프레임 수가 원작에 박혀 있다 — 맞는 웅덩이는 여덟 + 넷 프레임을
 * 떨어지고 서른둘을 튕기며, 틀린 웅덩이는 여덟 + 넷 + **마흔**을 그대로
 * 떨어져 사라진다. B6F로 내려가는 것은 열네 칸을 한 프레임에 반 칸씩이다
 */
interface FallingBoulder {
  localID: number
  dest: number
  flag: number
  frame: number
  /** 밀린 방향 */
  step: { x: number; z: number }
  fromY: number
  /** 떨어지는 자리 (세계 칸) — 바위가 밀려 들어간 칸이다 */
  at: { x: number; z: number }
  /**
   * 맞는 웅덩이의 스크립트가 끝나기를 기다린다 (`..._TickToCorrectPit`의 3단계).
   *
   * 원작은 스크립트를 떨어지는 바위 태스크의 하위로 걸고(`ScriptManager_Start(boulder->fieldTask, …)`),
   * 끝난 **뒤에** 웅덩이 셋이 다 찼는지 보고 `FLAG_DISTORTION_WORLD_PUZZLE_FINISHED`를 세운다
   */
  script: { id: number, started: boolean } | null
}

let falling: FallingBoulder | null = null

/** `..._TickToB6F` — 한 프레임에 반 칸씩, 열네 칸 */
const FALL_TO_B6F_FRAMES = 28

/** `..._TickToCorrectPit`의 0·1단계 */
const FALL_INTO_PIT_FRAMES = 12

/** 2단계의 튕김 */
const PIT_SETTLE_FRAMES = 32

/** `..._TickToWrongPit`의 0·1·2단계 */
const FALL_WRONG_FRAMES = 52

export function distortionBoulderFalling(): boolean {
  return falling !== null
}

/**
 * 밀면 떨어지는가 (`ov5_021DFB54.c` 527줄).
 *
 * ⚠️ **미는 쪽의 한 칸 앞을 본다.** 바위가 선 칸이 아니라 갈 칸이다
 */
export function dropBoulder(
  boulder: { localID: number; x: number; z: number }, step: { x: number; z: number },
): boolean {
  const floor = distortionFloor()
  if (floor === null || falling !== null || !elevatorTicking()) return false
  const [wx, , wz] = toWorldTiles(Math.round(boulder.x), 0, Math.round(boulder.z))
  const flag = fallLocationAt(floor.map, wx + step.x, wz + step.z)
  if (flag === null) return false
  const actor = npcActors.byLocalID.get(boulder.localID)
  falling = {
    localID: boulder.localID,
    dest: fallDestination(flag, state().puzzleFlags),
    flag,
    frame: 0,
    step,
    fromY: actor?.y ?? 0,
    at: { x: wx + step.x, z: wz + step.z },
    script: null,
  }
  return true
}

/** 한 프레임 (`DistWorldFallingBoulder_Tick`) */
export function distortionBoulderTick(dt: number): void {
  if (falling === null) return
  if (falling.script !== null) { tickPitScript(falling.script); return }
  const actor = npcActors.byLocalID.get(falling.localID)
  if (actor === undefined) { falling = null; return }
  falling.frame += dt * 60
  const f = falling.frame

  switch (falling.dest) {
    case FALL_DEST.b6f:
      actor.y = falling.fromY - 14 * Math.min(1, f / FALL_TO_B6F_FRAMES)
      if (f >= FALL_TO_B6F_FRAMES) {
        // 바위는 지워지는 게 아니라 **B6F 것이 된다.** 우리는 층이 다르면 안
        // 그리므로 이 층에서만 치운다
        setState({ puzzleFlags: fellToB6F(state().puzzleFlags, falling.localID) })
        removeNpc(falling.localID)
        // ⚠️ **떨어진 칸에 선다.** 원작은 바위의 x·z를 그대로 두고 층 번호만 B6F로 바꾼다
        // (`MapObject_SetMapHeaderID`) — B6F 배치표 자리(한 칸 옆)가 아니다
        setBoulderSpot(MAP.b5f, falling.localID, null)
        setBoulderSpot(MAP.b6f, falling.localID, falling.at.x, falling.at.z)
        falling = null
      }
      break

    case FALL_DEST.correctPit: {
      const k = Math.min(1, f / FALL_INTO_PIT_FRAMES)
      actor.y = falling.fromY - 2 * k
      actor.x += 0
      if (f >= FALL_INTO_PIT_FRAMES + PIT_SETTLE_FRAMES) {
        const after = fellIntoPit(state().puzzleFlags, falling.localID, falling.flag)
        if (after === null) { falling = null; break }
        setState({ puzzleFlags: after.flags })
        removeNpc(falling.localID)
        setBoulderSpot(MAP.b6f, falling.localID, null)
        // 웅덩이 속 바위는 떨어진 칸에서 **민 쪽으로 한 칸 더** 간 자리에 선다
        // (`boulderTileX += MapObject_GetDxFromDir(movingDir)`) — 웅덩이 한가운데다
        const pit = { x: falling.at.x + falling.step.x, z: falling.at.z + falling.step.z }
        setBoulderSpot(MAP.b6f, after.localID, pit.x, pit.z)
        distortionHooks.addObject?.(after.localID)
        const inPit = npcActors.byLocalID.get(after.localID)
        if (inPit !== undefined) {
          const [lx, , lz] = toLocalTiles(pit.x, 0, pit.z)
          inPit.x = lx
          inPit.z = lz
        }
        falling.script = { id: after.script, started: distortionHooks.runScript?.(after.script) === true }
      }
      break
    }

    default:
      actor.y = falling.fromY - 10 * Math.min(1, f / FALL_WRONG_FRAMES)
      if (f >= FALL_WRONG_FRAMES) {
        setState({ puzzleFlags: fellIntoWrongPit(state().puzzleFlags, falling.localID) })
        removeNpc(falling.localID)
        setBoulderSpot(MAP.b6f, falling.localID, null)
        falling = null
      }
      break
  }
}

/** 웅덩이의 스크립트가 끝났으면 수수께끼가 다 풀렸는지 본다 (`..._TickToCorrectPit`의 3단계) */
function tickPitScript(script: { id: number, started: boolean }): void {
  if (!script.started) {
    script.started = distortionHooks.runScript?.(script.id) === true
    return
  }
  if (distortionHooks.scriptRunning?.() === true) return
  if (puzzleSolved(state().puzzleFlags)) distortionHooks.setPuzzleFinished?.()
  falling = null
}
