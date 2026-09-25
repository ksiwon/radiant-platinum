// 깨어진 세계 — 벽·천장으로 건너뛴다 (PARITY §6.10)
//
// 뛸 자리는 층 자료의 `jumps`에 있고, 여기서는 **몇 프레임에 걸쳐 옮기고
// 언제 판을 갈아 끼우는가**를 정한다.
import { jumpAt } from '../engine/world/distortion'
import { SFX } from '../engine/audio/sfx'
import { music } from '../engine/audio/music'
import { worldState } from '../state/worldState'
import {
  FACING_YAW, bindPlatform, distortionFloor, markCarried, setHeightCalc, toLocalTiles,
} from './distortionCore'

/**
 * 벽·천장으로 건너뛰는 자리 (`HandleFloatingPlatformJumpPointAt`).
 *
 * ⚠️ **한 프레임에 옮기면 안 된다.** 원작은 `steps`프레임에 걸쳐 조금씩 밀고
 * (`TickJumpOnFloatingPlatformMovementAnimation`), **다 옮긴 뒤에야** 판을
 * 갈아 끼운다 (`PrepareNewCurrentFloatingPlatform`은 `..._MOVE_PLAYER`의
 * 끝에 있다). 즉시 갈아 끼우면 중력 축이 그 프레임에 뒤집혀 **화면이 뚝
 * 끊기며 돌아간다** — 실제로 그렇게 보였다. 표의 `steps`가 16이다
 */
interface PlatformJump {
  /** 남은 프레임 */
  frames: number
  total: number
  from: [number, number, number]
  to: [number, number, number]
  platformIndex: number
  /** 다 뛰고 나서 보는 쪽 (`finalFacingDir`) */
  facing: number
}

let jumping: PlatformJump | null = null

/** 층을 나갈 때 뛰던 것을 버린다 (`distortionLeave`) */
export function resetDistortionJump(): void {
  jumping = null
}

/** 판을 건너뛰는 중인가. 그동안은 조작이 안 먹는다 */
export function distortionJumping(): boolean {
  return jumping !== null
}

export function applyJump(wx: number, wy: number, wz: number, dir: number): boolean {
  const floor = distortionFloor()
  if (floor === null || jumping !== null) return false
  const jump = jumpAt(floor.jumps, wx, wy, wz, dir)
  if (jump === null) return false

  const p = worldState.player
  const [lx, ly, lz] = toLocalTiles(wx + jump.dx, wy + jump.dy, wz + jump.dz)
  jumping = {
    frames: 0,
    total: Math.max(1, jump.steps),
    from: [p.position.x, p.position.y, p.position.z],
    to: [lx + 0.5, ly, lz + 0.5],
    platformIndex: jump.platformIndex,
    facing: jump.facing,
  }
  p.velocity.set(0, 0, 0)
  return true
}

/** 한 프레임 (`TickJumpOnFloatingPlatformMovementAnimation`) */
export function distortionJumpTick(dt: number): void {
  const j = jumping
  if (j === null) return
  j.frames = Math.min(j.total, j.frames + dt * 60)
  const k = j.frames / j.total
  const p = worldState.player
  p.position.set(
    j.from[0] + (j.to[0] - j.from[0]) * k,
    j.from[1] + (j.to[1] - j.from[1]) * k,
    j.from[2] + (j.to[2] - j.from[2]) * k,
  )
  p.prevPosition.copy(p.position)
  p.velocity.set(0, 0, 0)
  // 뛰는 것은 걸음이 아니다 — 원작은 필드 태스크가 옮긴다(`JumpOnFloatingPlatform`)
  markCarried()
  if (j.frames < j.total) return
  // 다 옮긴 자리에서 판을 갈아 끼운다 — 여기서 중력 축이 바뀐다
  bindPlatform(j.platformIndex)
  // ⚠️ **높이 계산은 늘 끈다.** 원작이 `floatingPlatformIndex < 0`이면 켜려 했지만 그 칸이 `u16`이라
  // 0xFFFF(판 밖)도 음수가 아니다 (`ov9_02249960.c:2869-2873`) — 벽에서 판 밖으로 뛰어내려도 지형을 안 딛는다
  setHeightCalc(false)
  // 내려설 때 소리가 난다 (`Sound_PlayEffect(SEQ_SE_DP_SUTYA2)`)
  void music.playEffect(SFX.DISTORTION_LAND)
  p.facing = FACING_YAW[j.facing] ?? p.facing
  jumping = null
}
