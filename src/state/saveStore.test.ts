// PLAN §3.2 ①의 핵심 주장을 고정한다: 도감 비트필드(Uint8Array)가 영속화를 견딘다.
// createJSONStorage로 회귀하면 이 테스트가 깨진다 — 그게 이 파일의 존재 이유다.
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { get, set, createStore } from 'idb-keyval'
import { DEX_BYTES, createNewSave, dexHas, dexSet } from './saveStore'

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
