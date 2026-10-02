// 깊은 진흙에서 버둥거릴 때의 조우 (`WildEncounters_TryMudEncounter`, `wild_encounters.c` 559줄)
//
// 걷는 조우와 같은 관문 · 같은 유예를 쓰고, 셋이 다르다 — 레이더를 안 보고 · 배회를 관문 앞에서
// 묻고 · 유예는 배틀이 열릴 때만 다시 연다. 표는 손으로 만든다 — 자료 없이도 돈다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encounters, encounterSystem, resetEncounterTile } from './encounterSystem'
import { graceSteps, mudEncounter, type EncounterTable, type WildEncounter } from './encounter'
import { Behavior } from '../map/zone'
import { world, type MapHeader } from '../map/world'
import type { MapGrid } from '../map/grid'
import type { PatchStep } from '../world/pokeRadar'
import { worldState } from '../../state/worldState'

const RATE = 10
const GRACE = graceSteps(RATE)

function fakeTable(): EncounterTable {
  const land = Array.from({ length: 12 }, (_, i) => ({ level: 10 + i, species: 100 + i }))
  return {
    landRate: RATE, land, swarm: [0, 0], day: [0, 0], night: [0, 0], radar: [0, 0, 0, 0],
    forms: [0, 0], unownTable: 0,
    surf: { rate: 0, slots: [] }, oldRod: { rate: 0, slots: [] }, goodRod: { rate: 0, slots: [] }, superRod: { rate: 0, slots: [] },
  }
}

/** 늘 같은 값을 내고 몇 번 불렸는지 센다 */
let calls = 0
const always = (v: number) => () => { calls++; return v }
/**
 * 유예 안: 5% 관문에서 떨어진다(한 번) · 유예 밖: 평평한 관문은 지나고 출현률 10에서 떨어진다(두 번).
 * ⚠️ 기본 날짜가 1월 1일이라 평평한 관문이 40이 아니라 30이다(`dateGate`) — 20은 둘 다 지난다
 */
const MISS = 0.2

const roamer: WildEncounter = { species: 480, level: 50 } as WildEncounter

describe('깊은 진흙의 조우', () => {
  const saved = {
    maps: world.maps, mapId: world.mapId, grid: world.grid, pending: world.pending,
    tables: encounters.tables, mods: encounters.mods, rng: encounters.rng,
    radarStep: encounters.radarStep, roamerHere: encounters.roamerHere, partner: encounters.partner,
  }

  beforeEach(() => {
    world.maps = [{ encounters: 0 } as unknown as MapHeader]
    world.mapId = 0
    world.grid = { behavior: () => Behavior.MUD_DEEP_WITH_GRASS } as unknown as MapGrid
    world.pending = null
    encounters.tables = [fakeTable()]
    encounters.pending = null
    encounters.suspended = false
    encounters.partner = 0
    worldState.player.cycling = false
    worldState.player.position.set(5.5, 0, 5.5)
    resetEncounterTile()
    calls = 0
  })

  afterEach(() => {
    Object.assign(world, { maps: saved.maps, mapId: saved.mapId, grid: saved.grid, pending: saved.pending })
    Object.assign(encounters, {
      tables: saved.tables, mods: saved.mods, rng: saved.rng, radarStep: saved.radarStep,
      roamerHere: saved.roamerHere, partner: saved.partner, pending: null, suspended: false,
    })
  })

  const roll = () => mudEncounter.roll!()

  it('걷는 조우를 쥔 쪽이 다리를 채운다', () => {
    expect(mudEncounter.roll).not.toBeNull()
  })

  it('관문을 지나면 표에서 뽑아 `pending`에 담고 참을 낸다', () => {
    encounters.rng = always(0)
    expect(roll()).toBe(true)
    expect(encounters.pending).not.toBeNull()
    expect(encounters.pending!.species).toBeGreaterThanOrEqual(100)
  })

  it('레이더를 안 본다 — 무더기가 답해도 관문을 그대로 탄다', () => {
    const radar = vi.fn(() => ({ shake: 1 }) as unknown as PatchStep)
    encounters.radarStep = radar
    encounters.rng = always(0.99)
    expect(roll()).toBe(false)
    expect(encounters.pending).toBeNull()
    expect(radar).not.toHaveBeenCalled()
  })

  it('이미 조우가 걸렸거나 · 판정이 멈췄거나 · 워프가 걸렸으면 아무것도 안 굴린다', () => {
    encounters.rng = always(0)
    const held = { species: 1, level: 1 } as WildEncounter
    encounters.pending = held
    expect(roll()).toBe(false)
    expect(encounters.pending).toBe(held)
    encounters.pending = null
    encounters.suspended = true
    expect(roll()).toBe(false)
    encounters.suspended = false
    world.pending = { to: 411, matrix: 0, x: 0, z: 0, viaDoor: false }
    expect(roll()).toBe(false)
    expect(calls).toBe(0)
    expect(encounters.pending).toBeNull()
  })

  it('출현률 0인 맵에서는 배회도 안 묻는다', () => {
    encounters.tables = [{ ...fakeTable(), landRate: 0 }]
    const ask = vi.fn(() => roamer)
    encounters.roamerHere = ask
    expect(roll()).toBe(false)
    expect(ask).not.toHaveBeenCalled()
  })

  it('⚠️ 유예가 걷는 조우와 하나다 — 버둥거린 수가 걷는 쪽 유예를 깎는다', () => {
    encounters.rng = always(MISS)
    for (let i = 0; i < GRACE - 1; i++) expect(roll()).toBe(false)
    expect(calls).toBe(GRACE - 1) // 유예 안 — 한 번씩
    // 이제 걷는다. 남은 유예는 하나뿐이다
    world.grid = { behavior: () => Behavior.TALL_GRASS } as unknown as MapGrid
    const p = worldState.player.position
    calls = 0
    p.x += 1
    encounterSystem.fixedUpdate()
    expect(calls).toBe(1)
    calls = 0
    p.x += 1
    encounterSystem.fixedUpdate()
    expect(calls).toBe(2) // 유예 밖
  })

  it('⚠️ 배회는 관문 앞에서 묻는다 — 관문에서 떨어져도 나온다', () => {
    encounters.rng = always(0.99)
    encounters.roamerHere = () => roamer
    expect(roll()).toBe(true)
    expect(encounters.pending).toBe(roamer)
  })

  it('⚠️ 배회가 나온 판은 유예를 안 연다', () => {
    encounters.rng = always(MISS)
    for (let i = 0; i < GRACE; i++) roll()
    encounters.roamerHere = () => roamer
    expect(roll()).toBe(true)
    encounters.pending = null
    encounters.roamerHere = null
    calls = 0
    expect(roll()).toBe(false)
    expect(calls).toBe(2) // 여전히 유예 밖
  })

  it('리펠이 배회를 막으면 그 누름은 아무 일도 없다', () => {
    encounters.rng = always(0)
    encounters.mods = { ...encounters.mods, repelLevel: 100 }
    encounters.roamerHere = () => roamer
    expect(roll()).toBe(false)
    expect(encounters.pending).toBeNull()
  })

  it('⚠️ 관문을 지나도 리펠이 막으면 유예를 안 연다 — 걷는 조우와 다르다', () => {
    encounters.rng = always(MISS)
    for (let i = 0; i < GRACE; i++) roll()
    encounters.rng = always(0)
    encounters.mods = { ...encounters.mods, repelLevel: 100 }
    expect(roll()).toBe(false)
    expect(encounters.pending).toBeNull()
    encounters.rng = always(MISS)
    calls = 0
    roll()
    expect(calls).toBe(2) // 여전히 유예 밖
  })

  it('배틀이 열리면 유예를 다시 연다', () => {
    encounters.rng = always(MISS)
    for (let i = 0; i < GRACE; i++) roll()
    encounters.rng = always(0)
    expect(roll()).toBe(true)
    encounters.pending = null
    encounters.rng = always(MISS)
    calls = 0
    roll()
    expect(calls).toBe(1) // 유예 안으로 돌아왔다
  })
})
