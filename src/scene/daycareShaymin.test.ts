// 육성가에 맡기면 쉐이미가 랜드로 돌아간다 (`daycare.c`의 `BoxPokemon_SetShayminForm(LAND)` — decomp 112줄)
//
// `fieldServices.daycare.store`가 `landShayminForDeposit`을 거치는가 — 거치지 않으면 스카이 쉐이미가 맡겨진 채로 남는다.
// 같은 변환이 PC 박스(`pc_boxes.c` 83 · 103줄 · `boxes.ts`)에도 걸려 있고 이 시험은 육성가 쪽 배선만 본다
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installNodeAssets } from '../data/romData.testkit'
import { SHAYMIN_LAND, SPECIES_ROTOM, SPECIES_SHAYMIN } from '../engine/pokemon/form'
import type { PokemonInstance } from '../engine/pokemon/instance'
import { fieldScripts } from '../engine/script/field'
import { useSaveStore } from '../state/saveStore'
import { installFieldServices } from './fieldServices'

const SHAYMIN_SKY = 1

/** 필요한 칸만 든 개체 — 이 배선은 종족 · 폼 · 레벨만 읽는다 */
const mon = (species: number, form: number): PokemonInstance => ({
  species, form, level: 40, hp: 100, status: 'ok', exp: 0, heldItem: 0, isEgg: false, pid: 1,
} as unknown as PokemonInstance)

describe('육성가 맡기기 × 쉐이미', () => {
  let stop: () => void
  let unassets: () => void
  const before = useSaveStore.getState()

  beforeAll(() => {
    unassets = installNodeAssets()
    stop = installFieldServices()
  })
  afterEach(() => { useSaveStore.setState({ party: before.party, daycare: before.daycare }) })
  afterAll(() => { stop(); unassets() })

  const store = (m: PokemonInstance): PokemonInstance => {
    useSaveStore.setState({ party: [m], daycare: { ...before.daycare, slots: before.daycare.slots.map(() => null) } })
    const daycare = fieldScripts.services.daycare
    expect(daycare, '`daycare` 손잡이가 안 붙었다').toBeDefined()
    daycare!.store(0)
    const s = useSaveStore.getState()
    expect(s.party).toHaveLength(0)
    const held = s.daycare.slots.find((x) => x !== null)
    expect(held, '맡긴 자리가 비었다').toBeTruthy()
    return held!.mon
  }

  it('스카이 쉐이미는 랜드로 돌아가 맡겨진다', () => {
    expect(store(mon(SPECIES_SHAYMIN, SHAYMIN_SKY)).form).toBe(SHAYMIN_LAND)
  })

  it('랜드 쉐이미는 그대로다', () => {
    expect(store(mon(SPECIES_SHAYMIN, SHAYMIN_LAND)).form).toBe(SHAYMIN_LAND)
  })

  it('다른 종족의 폼은 안 건드린다 — 로토무 폼 1은 그대로', () => {
    expect(store(mon(SPECIES_ROTOM, 1)).form).toBe(1)
  })
})
