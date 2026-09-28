// 로토무의 방이 파티를 세는 두 길 (REPAIR §140)
//
// ⚠️ **둘이 세는 것이 다르다.** 가전 앞 메뉴·되돌리기·빈 가전 자리는 **가전에 든**
// 로토무만 세고(`ScrCmd_GetPartyRotomCountAndFirst` · `form != ROTOM_FORM_BASE`),
// 가전에 넣을 로토무를 고를 때는 폼과 상관없이 센다(`ScrCmd_CountRepeatedSpeciesInParty`)
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { fieldScripts } from '../engine/script/field'
import { createWild } from '../engine/pokemon/instance'
import { loadSpecies } from '../data/gameData'
import { installNodeAssets, withData } from '../data/romData.testkit'
import { createNewSave, useSaveStore } from '../state/saveStore'
import { installFieldServices } from './fieldServices'

const maybe = withData('species.json')
const ROTOM = 479
const PIPLUP = 393

maybe('로토무의 방이 파티를 센다', () => {
  let stop: (() => void) | null = null
  let restore: (() => void) | null = null
  beforeEach(() => {
    restore = installNodeAssets()
    useSaveStore.setState(createNewSave())
    stop = installFieldServices('ko')
  })
  afterEach(() => { stop?.(); restore?.() })

  async function mon(species: number, form = 0, isEgg = false) {
    const sp = (await loadSpecies()).get(species)
    return { ...createWild({ species: sp, level: 20, rng: Math.random, otId: 1, otSecretId: 1 }), form, isEgg }
  }

  it('맨 로토무는 가전에 든 로토무로 안 센다', async () => {
    const party = () => fieldScripts.services.party!
    useSaveStore.setState({ party: [await mon(PIPLUP), await mon(ROTOM)] })
    expect(party().rotomCount()).toEqual({ count: 0, first: 0xff })
    useSaveStore.setState({ party: [await mon(PIPLUP), await mon(ROTOM), await mon(ROTOM, 1), await mon(ROTOM, 3, true)] })
    expect(party().rotomCount()).toEqual({ count: 1, first: 2 })
  })

  it('고를 때는 폼과 상관없이 알 아닌 그 종을 센다 — 종이 0이면 겹침이 있는가', async () => {
    const party = () => fieldScripts.services.party!
    useSaveStore.setState({ party: [await mon(PIPLUP), await mon(ROTOM), await mon(ROTOM, 4, true)] })
    expect(party().countSpecies(ROTOM)).toBe(1)
    expect(party().countSpecies(0)).toBe(0)
    useSaveStore.setState({ party: [await mon(PIPLUP), await mon(ROTOM), await mon(ROTOM, 2)] })
    expect(party().countSpecies(ROTOM)).toBe(2)
    expect(party().countSpecies(0)).toBe(1)
  })
})
