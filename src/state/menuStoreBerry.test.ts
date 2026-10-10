// 나무열매 태그를 여는 길 (`menuStore.openBerryTag(item, list?)` · `berryList`)
//
// 가방이 열매 목록(주머니의 차례)을 같이 넘기면 태그가 ↑↓로 이웃 열매를 넘겨 본다 (결정 — 원작). 스크립트가 여는
// 태그는 목록이 없고(빈 배열) 그때는 한 열매만 본다. `berryList`가 비어도 화면이 안 터져야 한다.
import { beforeEach, describe, expect, it } from 'vitest'
import { useMenuStore } from './menuStore'

beforeEach(() => { useMenuStore.getState().closeAll() })

describe('openBerryTag', () => {
  it('열매 하나만 주면 목록이 비어 있다', () => {
    useMenuStore.getState().openBerryTag(149)
    const s = useMenuStore.getState()
    expect(s.top).toBe('berryTag')
    expect(s.berryItem).toBe(149)
    expect(s.berryList).toEqual([])
  })

  it('목록을 주면 그대로 든다', () => {
    useMenuStore.getState().openBerryTag(150, [149, 150, 151])
    const s = useMenuStore.getState()
    expect(s.berryItem).toBe(150)
    expect(s.berryList).toEqual([149, 150, 151])
  })

  it('다음에 목록 없이 열면 앞의 목록이 안 남는다', () => {
    useMenuStore.getState().openBerryTag(150, [149, 150, 151])
    useMenuStore.getState().closeAll()
    useMenuStore.getState().openBerryTag(152)
    expect(useMenuStore.getState().berryList).toEqual([])
  })

  it('가방 위에 쌓이고 한 단 물러나면 가방으로 돌아간다', () => {
    const store = useMenuStore.getState()
    store.open('bag')
    store.openBerryTag(149, [149])
    expect(useMenuStore.getState().stack).toEqual(['bag', 'berryTag'])
    useMenuStore.getState().back()
    expect(useMenuStore.getState().top).toBe('bag')
  })
})
