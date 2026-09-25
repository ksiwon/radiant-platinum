// 싸울 수 있는 마리 수 (REPAIR §122 · `Pokemon_CanBattle` · `unk_02054884.c` 22)
//
// ⚠️ **알은 안 센다.** 알은 체력이 가득 찬 채로 만들어진다 — 체력만 세면 한 마리와
// 알 하나가 「두 마리」가 되어, 더블 트레이너가 다가오고 VS2 시선이 열리고 창기둥의
// 「두 마리 필요하다」가 안 막는다
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { fieldScripts } from '../engine/script/field'
import { createWild, statsOf } from '../engine/pokemon/instance'
import { loadSpecies } from '../data/gameData'
import { installNodeAssets, withData } from '../data/romData.testkit'
import { createNewSave, useSaveStore } from '../state/saveStore'
import { installFieldServices } from './fieldServices'

const maybe = withData('species.json')

maybe('싸울 수 있는 마리 수', () => {
  let stop: (() => void) | null = null
  let restore: (() => void) | null = null
  beforeEach(() => {
    restore = installNodeAssets()
    useSaveStore.setState(createNewSave())
    stop = installFieldServices('ko')
  })
  afterEach(() => { stop?.(); restore?.() })

  it('한 마리와 알 하나는 한 마리다', async () => {
    const species = await loadSpecies()
    const sp = species.get(387)
    const mon = createWild({ species: sp, level: 20, rng: Math.random, otId: 1, otSecretId: 1 })
    mon.hp = statsOf(mon, sp).hp
    const egg = { ...createWild({ species: sp, level: 1, rng: Math.random, otId: 1, otSecretId: 1 }) }
    egg.hp = statsOf(egg, sp).hp
    egg.isEgg = true
    useSaveStore.setState({ party: [mon, egg] })
    expect(fieldScripts.services.aliveMons?.()).toBe(1)
    useSaveStore.setState({ party: [mon, { ...egg, isEgg: false }] })
    expect(fieldScripts.services.aliveMons?.()).toBe(2)
  })
})
