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
import { distortionHooks, distortionFloor, setState, state, toWorldTiles } from './distortionCore'
import { elevatorTicking } from './distortionElevator'

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
  }
  return true
}

/** 한 프레임 (`DistWorldFallingBoulder_Tick`) */
export function distortionBoulderTick(dt: number): void {
  if (falling === null) return
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
        falling = null
      }
      break

    case FALL_DEST.correctPit: {
      const k = Math.min(1, f / FALL_INTO_PIT_FRAMES)
      actor.y = falling.fromY - 2 * k
      actor.x += 0
      if (f >= FALL_INTO_PIT_FRAMES + PIT_SETTLE_FRAMES) {
        const after = fellIntoPit(state().puzzleFlags, falling.localID)
        if (after !== null) {
          setState({ puzzleFlags: after.flags })
          removeNpc(falling.localID)
          distortionHooks.addObject?.(after.localID)
          if (puzzleSolved(after.flags)) distortionHooks.setPuzzleFinished?.()
          distortionHooks.runScript?.(after.script)
        }
        falling = null
      }
      break
    }

    default:
      actor.y = falling.fromY - 10 * Math.min(1, f / FALL_WRONG_FRAMES)
      if (f >= FALL_WRONG_FRAMES) {
        setState({ puzzleFlags: fellIntoWrongPit(state().puzzleFlags, falling.localID) })
        removeNpc(falling.localID)
        falling = null
      }
      break
  }
}
