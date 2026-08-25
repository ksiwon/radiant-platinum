// 공중날기의 뜨고 내리는 사이 — **원작 길을 그대로 간다** (`scene/pcParts`).
//
// ⚠️ **오래 지어낸 값 넷으로 돌고 있었다** — 새를 1.3칸, 사람을 1.75칸 들고
// 0.9초·0.82초를 썼다. 지금은 넷 다 원작 클립(`fly_on_f`·`fly_off_f`)이 새와
// 사람을 실제로 옮기는 자리에서 온다. 길이도 원작 그대로 0.6667초다.
import type { PendingWarp } from '../engine/map/world'
import { world } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { BDSP_TO_WORLD } from '../engine/model/normalize'
import { FLY_MOUNT, FLY_PATH, flyAt, flyTurnAt, type FlyKey, type FlyTurn } from './pcParts'

export type FlyPhase = 'off' | 'takeoff' | 'transit' | 'landing'

interface FlyTransitionState {
  phase: FlyPhase
  elapsed: number
  target: PendingWarp | null
}

const state: FlyTransitionState = { phase: 'off', elapsed: 0, target: null }

/** 한 자리 (게임 단위, 사람이 선 자리 기준 로컬) */
export interface FlySpot { x: number, y: number, z: number }

interface FlyPose {
  visible: boolean
  /** 새의 `Origin_mf`가 갈 자리 */
  bird: FlySpot
  /** 사람이 옮겨 갈 자리 */
  rider: FlySpot
  /** 새가 도는 각 (`Waist_mf`에 그대로 얹는다) */
  turn: FlyTurn
  /**
   * 자리표시자 새의 날갯짓.
   *
   * ⚠️ **원작 새는 날갯짓을 안 한다** (`pcParts`의 `FLY_PATH` 머리말). 이 값은
   * 원작 몸을 못 읽었을 때 서는 자리표시자에만 쓴다
   */
  wing: number
  /** 발밑 고리가 퍼진 정도 */
  ring: number
}

const REST: FlySpot = { x: 0, y: 0, z: 0 }
const NO_TURN: FlyTurn = { t: 0, x: 0, y: 0, z: 0, w: 1 }
const OFF: FlyPose = { visible: false, bird: REST, rider: REST, turn: NO_TURN, wing: 0, ring: 0 }

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** 번들 단위 키를 게임 단위 자리로. 새는 바인드 높이만큼 위에서 시작한다 */
function spot(key: FlyKey, lift: number): FlySpot {
  return { x: key.x * BDSP_TO_WORLD, y: (key.y + lift) * BDSP_TO_WORLD, z: key.z * BDSP_TO_WORLD }
}

export function flyTransitionPose(phase: FlyPhase, elapsed: number): FlyPose {
  if (phase === 'off') return OFF
  // 갈아타는 사이(`transit`)에는 뜬 끝자리를 붙든다 — 그때 지도가 바뀐다
  const t = phase === 'transit' ? FLY_MOUNT.clip : elapsed
  const rising = phase !== 'landing'
  const key = flyAt(rising ? FLY_PATH.onBird : FLY_PATH.offBird, t)
  const bird = spot(key, FLY_MOUNT.hover)
  // 탈 때는 채인 뒤부터, 내릴 때는 내려놓기 전까지 새에 붙어 간다
  const riding = rising ? t >= FLY_MOUNT.pick : t <= FLY_MOUNT.pick
  return {
    visible: true,
    bird,
    rider: riding
      ? {
        x: bird.x + FLY_MOUNT.seat.x * BDSP_TO_WORLD,
        y: bird.y + FLY_MOUNT.seat.y * BDSP_TO_WORLD,
        z: bird.z + FLY_MOUNT.seat.z * BDSP_TO_WORLD,
      }
      : REST,
    turn: flyTurnAt(rising ? FLY_PATH.onTurn : FLY_PATH.offTurn, t),
    wing: Math.sin(elapsed * 18) * 0.62,
    // 고리는 사람이 뜬 만큼 퍼진다 — 원작에는 없고 우리가 더한 것이다
    ring: clamp01(riding ? key.y / FLY_PATH.onBird[FLY_PATH.onBird.length - 1]!.y : 0),
  }
}

export function beginFlyTransition(target: PendingWarp): boolean {
  if (state.phase !== 'off') return false
  state.phase = 'takeoff'
  state.elapsed = 0
  state.target = { ...target, silent: true }
  worldState.player.flying = true
  return true
}

export function tickFlyTransition(delta: number): FlyPose {
  if (state.phase === 'off') return flyTransitionPose('off', 0)
  state.elapsed += delta
  if (state.phase === 'takeoff' && state.elapsed >= FLY_MOUNT.clip) {
    if (state.target) world.pending = state.target
    state.phase = 'transit'
    state.elapsed = 0
  } else if (state.phase === 'transit' && world.pending === null) {
    state.phase = 'landing'
    state.elapsed = 0
  } else if (state.phase === 'landing' && state.elapsed >= FLY_MOUNT.clip) {
    state.phase = 'off'
    state.elapsed = 0
    state.target = null
    worldState.player.flying = false
  }
  return flyTransitionPose(state.phase, state.elapsed)
}

export function resetFlyTransition(): void {
  state.phase = 'off'
  state.elapsed = 0
  state.target = null
  worldState.player.flying = false
}

export function flyTransitionPhase(): FlyPhase {
  return state.phase
}
