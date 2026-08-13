import type { PendingWarp } from '../engine/map/world'
import { world } from '../engine/map/world'
import { worldState } from '../state/worldState'

export type FlyPhase = 'off' | 'takeoff' | 'transit' | 'landing'

interface FlyTransitionState {
  phase: FlyPhase
  elapsed: number
  target: PendingWarp | null
}

const state: FlyTransitionState = { phase: 'off', elapsed: 0, target: null }

export interface FlyPose {
  visible: boolean
  playerLift: number
  birdLift: number
  wing: number
  ring: number
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function flyTransitionPose(phase: FlyPhase, elapsed: number): FlyPose {
  if (phase === 'off') return { visible: false, playerLift: 0, birdLift: 0, wing: 0, ring: 0 }
  const wing = Math.sin(elapsed * 18) * 0.62
  if (phase === 'takeoff') {
    const k = clamp01(elapsed / 0.9)
    return { visible: true, playerLift: k * 1.75, birdLift: k * 1.3, wing, ring: k }
  }
  if (phase === 'landing') {
    const k = clamp01(elapsed / 0.82)
    return {
      visible: true,
      playerLift: (1 - k) * 1.75,
      birdLift: (1 - k) * 1.3,
      wing,
      ring: 1 - k,
    }
  }
  return { visible: true, playerLift: 1.75, birdLift: 1.3, wing, ring: 1 }
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
  if (state.phase === 'takeoff' && state.elapsed >= 0.9) {
    if (state.target) world.pending = state.target
    state.phase = 'transit'
    state.elapsed = 0
  } else if (state.phase === 'transit' && world.pending === null) {
    state.phase = 'landing'
    state.elapsed = 0
  } else if (state.phase === 'landing' && state.elapsed >= 0.82) {
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
