// PLAN §3.2 ①의 핵심 주장을 고정한다: 도감 비트필드(Uint8Array)가 영속화를 견딘다.
// createJSONStorage로 회귀하면 이 테스트가 깨진다 — 그게 이 파일의 존재 이유다.
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { get, set, createStore } from 'idb-keyval'
import { DEX_BYTES, createNewSave, dexHas, dexSet, useSaveStore } from './saveStore'
import type { PokemonInstance } from '../engine/pokemon/instance'

describe('도감 비트필드', () => {
  it('세트한 번호만 켜진다', () => {
    let f = new Uint8Array(DEX_BYTES)
    expect(dexHas(f, 387)).toBe(false)
    f = dexSet(f, 387) // 모부기
    expect(dexHas(f, 387)).toBe(true)
    expect(dexHas(f, 386)).toBe(false)
    expect(dexHas(f, 388)).toBe(false)
  })

  it('경계값 1번과 493번을 담는다', () => {
    let f = new Uint8Array(DEX_BYTES)
    f = dexSet(f, 1)
    f = dexSet(f, 493)
    expect(dexHas(f, 1)).toBe(true)
    expect(dexHas(f, 493)).toBe(true)
  })

  it('원본을 변형하지 않는다 — 구독자가 변화를 감지해야 한다', () => {
    const before = new Uint8Array(DEX_BYTES)
    const after = dexSet(before, 25)
    expect(dexHas(before, 25)).toBe(false)
    expect(after).not.toBe(before)
  })
})

describe('IndexedDB 영속화', () => {
  it('structured clone이 Uint8Array를 원형 그대로 보존한다', async () => {
    const store = createStore('radiant-platinum-test', 'save')
    const save = createNewSave()
    save.pokedex.seen = dexSet(save.pokedex.seen, 387)
    save.pokedex.caught = dexSet(save.pokedex.caught, 387)

    await set('save', { state: save, version: save.version }, store)
    const back = await get<{ state: typeof save }>('save', store)

    expect(back).toBeDefined()
    expect(back!.state.pokedex.seen).toBeInstanceOf(Uint8Array)
    expect(back!.state.pokedex.seen.length).toBe(DEX_BYTES)
    expect(dexHas(back!.state.pokedex.seen, 387)).toBe(true)
    expect(dexHas(back!.state.pokedex.caught, 387)).toBe(true)
  })

  it('JSON 직렬화는 같은 데이터를 파괴한다 — createJSONStorage를 쓰면 안 되는 이유', () => {
    const save = createNewSave()
    save.pokedex.seen = dexSet(save.pokedex.seen, 387)

    const viaJson = JSON.parse(JSON.stringify(save)) as typeof save

    // Uint8Array가 숫자 키를 가진 평범한 객체로 뭉개진다.
    // 값 자체는 남아 있어서 읽기는 우연히 동작한다 — 그래서 더 위험하다.
    expect(viaJson.pokedex.seen).not.toBeInstanceOf(Uint8Array)
    expect(dexHas(viaJson.pokedex.seen, 387)).toBe(true)

    // 파손은 다음 쓰기에서 조용히 터진다. new Uint8Array(평범한객체)는 length가 없어
    // 빈 배열을 만들고, 그 순간 기존 도감 기록이 통째로 사라진다.
    const afterWrite = dexSet(viaJson.pokedex.seen, 25)
    expect(afterWrite.length).toBe(0)
    expect(dexHas(afterWrite, 387)).toBe(false) // 387번 기록 소실
  })
})

/**
 * 맡기기·꺼내기의 두 제한.
 *
 * 원작이 막는 자리가 정확히 둘이고, 둘 다 **마릿수가 아니라 살아 있는 수**로
 * 판단한다 (`BoxAppMan_OnLastAliveMon`). 마릿수로 세면 다섯이 기절한 파티에서
 * 남은 하나를 맡길 수 있게 되고, 그 판은 필드에 나가는 순간 끝난다
 */
describe('박스에 맡기고 꺼내기', () => {
  const mon = (species: number, hp = 20): PokemonInstance => ({
    species, pid: species, nickname: null, exp: 0, level: 5,
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: [], hp, status: 'ok', statusTurns: 0, heldItem: 0,
    friendship: 70, otId: 0, otSecretId: 0, ball: 0,
  })

  const reset = (party: PokemonInstance[], currentBox = 0): void => {
    useSaveStore.setState({ ...createNewSave(), party, currentBox })
  }

  it('싸울 수 있는 마지막 한 마리는 못 맡긴다', () => {
    reset([mon(387)])
    expect(useSaveStore.getState().depositMon(0)).toBeNull()
    expect(useSaveStore.getState().party).toHaveLength(1)
  })

  it('다섯이 기절해 있으면 남은 하나도 못 맡긴다', () => {
    reset([mon(387), mon(390, 0), mon(393, 0), mon(396, 0), mon(399, 0), mon(400, 0)])
    expect(useSaveStore.getState().depositMon(0)).toBeNull()
    // 기절한 마리는 하나뿐이어도 맡길 수 있다 — 원작이 옮기려는 마리의 HP까지 본다
    expect(useSaveStore.getState().depositMon(1)).toEqual({ box: 0, slot: 0 })
    expect(useSaveStore.getState().party).toHaveLength(5)
  })

  it('맡긴 것은 지금 열려 있는 박스로 간다', () => {
    reset([mon(387), mon(390)], 7)
    expect(useSaveStore.getState().depositMon(1)).toEqual({ box: 7, slot: 0 })
    expect(useSaveStore.getState().boxes[7]![0]?.species).toBe(390)
    expect(useSaveStore.getState().boxes[0]![0]).toBeNull()
  })

  it('파티가 여섯이면 못 꺼낸다', () => {
    reset(Array.from({ length: 6 }, (_, i) => mon(400 + i)))
    useSaveStore.setState({
      boxes: useSaveStore.getState().boxes.map((box, i) =>
        (i === 0 ? [mon(387), ...box.slice(1)] : box)),
    })
    expect(useSaveStore.getState().withdrawMon({ box: 0, slot: 0 })).toBe(false)
    // 한 자리 비우면 들어온다
    useSaveStore.setState({ party: useSaveStore.getState().party.slice(0, 5) })
    expect(useSaveStore.getState().withdrawMon({ box: 0, slot: 0 })).toBe(true)
    expect(useSaveStore.getState().party.at(-1)?.species).toBe(387)
    expect(useSaveStore.getState().boxes[0]![0]).toBeNull()
  })

  it('빈 칸은 못 꺼낸다', () => {
    reset([mon(387)])
    expect(useSaveStore.getState().withdrawMon({ box: 3, slot: 12 })).toBe(false)
  })
})
