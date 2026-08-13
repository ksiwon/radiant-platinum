import { describe, expect, it } from 'vitest'
import { Behavior } from '../engine/map/zone'
import { ledgeFacing } from './ledgeVisual'

describe('3D ledge facing', () => {
  it('turns the raised face toward the legal jump side', () => {
    expect(ledgeFacing(Behavior.LEDGE_SOUTH)).toMatchObject({ dx: 0, dz: 1, yaw: 0 })
    expect(ledgeFacing(Behavior.LEDGE_WEST)!.yaw).toBeCloseTo(-Math.PI / 2)
    expect(ledgeFacing(Behavior.LEDGE_EAST)!.yaw).toBeCloseTo(Math.PI / 2)
  })

  it('does not raise ordinary tiles', () => {
    expect(ledgeFacing(Behavior.NORMAL)).toBeNull()
  })
})
