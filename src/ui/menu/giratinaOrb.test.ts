// 깨어진 세계 안에서는 백금옥을 주고받아도 기라티나의 모습이 안 바뀐다 · 세계를 나갈 때 도감에 적힌다
// (REPAIR §94)
//
// 원작 파티 화면의 두 갈래(가방에서 쥐여 주기 `UpdatePokemonWithItem` · 빼앗기 `PartyMenuCB_TakeItem`)가
// 맵 번호 573~583이면 `Pokemon_SetGiratinaFormByHeldItem`을 건너뛴다. 맞바꾸기(`SwapPokemonItem`)는 안 건너뛴다.
// `ScrCmd_SetPartyGiratinaForm`은 모습을 정한 뒤 알이 아닌 기라티나마다 `Pokedex_Capture`를 부른다.
import 'fake-indexeddb/auto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadMoves, loadSpecies } from '../../data/gameData'
import { installNodeAssets, withData } from '../../data/romData.testkit'
import {
  GIRATINA_ALTERED, GIRATINA_ORIGIN, heldItemKeepsGiratinaForm, ITEM_GRISEOUS_ORB, SPECIES_GIRATINA,
} from '../../engine/pokemon/form'
import { createWild, type PokemonInstance } from '../../engine/pokemon/instance'
import { fieldScripts } from '../../engine/script/field'
import { dexHas, createNewSave, useSaveStore } from '../../state/saveStore'
import { installFieldServices } from '../../scene/fieldServices'
import { withHeldItem } from './formChange'

describe('모습을 붙드는 맵', () => {
  it('깨어진 세계 1F(573)부터 귀혼동굴 방(583)까지다 — 빈 578도 범위 안이다', () => {
    expect(heldItemKeepsGiratinaForm(572)).toBe(false)
    for (let id = 573; id <= 583; id++) expect(heldItemKeepsGiratinaForm(id), `맵 ${String(id)}`).toBe(true)
    expect(heldItemKeepsGiratinaForm(584)).toBe(false)
    // 귀혼동굴 기라티나 방은 세계 밖이다
    expect(heldItemKeepsGiratinaForm(270)).toBe(false)
  })
})

withData('species.json', 'moves.json')('백금옥과 기라티나', () => {
  let restore: (() => void) | null = null
  let stop: (() => void) | null = null
  beforeAll(() => { restore = installNodeAssets() })
  afterAll(() => {
    stop?.()
    restore?.()
  })

  async function origin(): Promise<{ mon: PokemonInstance, species: Awaited<ReturnType<typeof loadSpecies>>, moves: Awaited<ReturnType<typeof loadMoves>> }> {
    const [species, moves] = await Promise.all([loadSpecies(), loadMoves()])
    const mon = createWild({ species: species.get(SPECIES_GIRATINA), level: 47, rng: Math.random, otId: 1, otSecretId: 1 })
    return { mon: { ...mon, form: GIRATINA_ORIGIN, heldItem: ITEM_GRISEOUS_ORB }, species, moves }
  }

  it('깨어진 세계 안에서 빼앗으면 오리진 그대로다', async () => {
    const { mon, species, moves } = await origin()
    const taken = withHeldItem({ ...mon, heldItem: 0 }, species, moves, heldItemKeepsGiratinaForm(582))
    expect(taken.form).toBe(GIRATINA_ORIGIN)
    expect(taken.heldItem).toBe(0)
  })

  it('밖에서 빼앗으면 어나더로 돌아간다', async () => {
    const { mon, species, moves } = await origin()
    const taken = withHeldItem({ ...mon, heldItem: 0 }, species, moves, heldItemKeepsGiratinaForm(270))
    expect(taken.form).toBe(GIRATINA_ALTERED)
  })

  it('`SetPartyGiratinaForm`이 파티의 기라티나를 도감에 잡은 것으로 적는다', async () => {
    const { mon } = await origin()
    useSaveStore.setState({ ...createNewSave(), party: [{ ...mon, heldItem: 0 }] })
    stop = installFieldServices('ko')
    expect(dexHas(useSaveStore.getState().pokedex.caught, SPECIES_GIRATINA)).toBe(false)
    fieldScripts.services.party!.giratinaForm(false)
    expect(dexHas(useSaveStore.getState().pokedex.caught, SPECIES_GIRATINA)).toBe(true)
  })

  it('알인 기라티나는 안 적는다', async () => {
    const { mon } = await origin()
    useSaveStore.setState({ ...createNewSave(), party: [{ ...mon, isEgg: true }] })
    fieldScripts.services.party!.giratinaForm(true)
    expect(dexHas(useSaveStore.getState().pokedex.caught, SPECIES_GIRATINA)).toBe(false)
  })
})
