import { afterEach, describe, expect, it } from 'vitest'
import type { PendingWarp } from '../engine/map/world'
import { world } from '../engine/map/world'
import { worldState } from '../state/worldState'
import {
  beginFlyTransition,
  flyTransitionPhase,
  flyTransitionPose,
  resetFlyTransition,
  tickFlyTransition,
} from './flyTransition'

const TARGET: PendingWarp = { to: 411, matrix: 0, x: 10, z: 12, viaDoor: false }

describe('3D fly transition', () => {
  afterEach(() => {
    world.pending = null
    resetFlyTransition()
  })

  it('lifts the rider and flaps a visible mount during takeoff', () => {
    expect(flyTransitionPose('off', 0).visible).toBe(false)
    const pose = flyTransitionPose('takeoff', 0.45)
    expect(pose.playerLift).toBeGreaterThan(0.8)
    expect(pose.ring).toBeCloseTo(0.5)
  })

  it('queues the warp after takeoff and lands after the map consumes it', () => {
    expect(beginFlyTransition(TARGET)).toBe(true)
    expect(worldState.player.flying).toBe(true)
    tickFlyTransition(0.91)
    expect(flyTransitionPhase()).toBe('transit')
    expect(world.pending).toMatchObject({ to: 411, silent: true })
    world.pending = null
    tickFlyTransition(0.01)
    expect(flyTransitionPhase()).toBe('landing')
    tickFlyTransition(0.83)
    expect(flyTransitionPhase()).toBe('off')
    expect(worldState.player.flying).toBe(false)
  })
})
