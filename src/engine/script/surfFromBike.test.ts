// 자전거를 탄 채 파도타기를 열면 자전거에서 내린다
// (`ov5_021DFB54.c:332` — 아바타 상태 하나를 `SURFING`으로 덮어 쓴다 · `FieldTask_UseSurf` state 0의 `FieldBGM_SetOverride(SEQ_NONE)`)
import { afterEach, describe, expect, it } from 'vitest'
import { runFieldMove } from './field'
import { world as mapWorld } from '../map/world'
import { worldState } from '../../state/worldState'
import { fieldBgm } from '../audio/songs'
import type { MapGrid } from '../map/grid'

/** `WATER_SEA` */
const WATER = 0x15

describe('자전거를 탄 채 파도타기', () => {
  afterEach(() => {
    const p = worldState.player
    p.cycling = false; p.surfing = false; p.pedalling = 0; p.hop.active = false
    fieldBgm.override = null
    mapWorld.grid = null
  })

  it('파도에 타면 자전거 상태와 자전거 곡 가로채기가 풀린다', () => {
    mapWorld.grid = { behavior: () => WATER, isBlocked: () => false } as unknown as MapGrid
    const p = worldState.player
    p.cycling = true; p.surfing = false; p.pedalling = 3; p.facing = 0
    fieldBgm.override = 1234
    expect(runFieldMove('surf', { x: 5, z: 6 })).toBe(true)
    expect(p.surfing).toBe(true)
    expect(p.cycling).toBe(false)
    expect(p.pedalling).toBe(0)
    expect(fieldBgm.override).toBeNull()
  })

  it('걸어서 타면 다른 곡 가로채기를 건드리지 않는다', () => {
    mapWorld.grid = { behavior: () => WATER, isBlocked: () => false } as unknown as MapGrid
    const p = worldState.player
    p.cycling = false; p.surfing = false; p.facing = 0
    fieldBgm.override = 77
    expect(runFieldMove('surf', { x: 5, z: 6 })).toBe(true)
    expect(p.surfing).toBe(true)
    expect(fieldBgm.override).toBe(77)
  })
})
