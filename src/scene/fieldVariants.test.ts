// 이야기가 갈아 끼우는 지역 물체 (`fieldVariants`) — 224번도로 `R224b`
import { describe, expect, it } from 'vitest'
import { Group, Mesh } from 'three'
import { FLAG_WROTE_ON_ROUTE_224_TABLET } from '../engine/script/vars'
import { applyVariants, variantNodes, variantVisible, VARIANT_FLAGS } from './fieldVariants'

/** 판 표식이 달린 메시 — GLTFLoader가 노드 `extras`를 `userData`로 옮긴 꼴 */
function marked(variant: string, mode: 'show' | 'hide'): Mesh {
  const m = new Mesh()
  m.userData = { variant, mode }
  return m
}

describe('판 표식 — 노드 extras로 접어 둔 물체', () => {
  it('표식 있는 노드만 모은다 — 표식 없는 물체는 두 상태 모두에 한 번씩 서 있다', () => {
    const root = new Group()
    const show = marked('r224b', 'show'), hide = marked('r224b', 'hide')
    const plain = new Mesh()
    const odd = new Mesh()
    odd.userData = { variant: 'r224b', mode: 'both' }
    root.add(show, hide, plain, odd)
    expect(variantNodes(root).map((n) => n.object)).toEqual([show, hide])
  })

  it('판이 꺼졌으면 `hide`만 보이고, 켜지면 `show`만 보인다', () => {
    expect(variantVisible('show', false)).toBe(false)
    expect(variantVisible('hide', false)).toBe(true)
    expect(variantVisible('show', true)).toBe(true)
    expect(variantVisible('hide', true)).toBe(false)
  })

  it('⚠️ 깃발이 안 선 기본 상태는 전과 같다 — `R224b`는 접혀 있고 짝은 선다', () => {
    const root = new Group()
    const show = marked('r224b', 'show'), hide = marked('r224b', 'hide')
    root.add(show, hide)
    applyVariants(variantNodes(root), () => false)
    expect([show.visible, hide.visible]).toEqual([false, true])
  })

  it('224번도로 비석에 이름을 적은 깃발이 서면 판이 바뀌고, 지워지면 돌아온다 — 지역을 다시 받지 않는다', () => {
    expect(VARIANT_FLAGS.r224b).toBe(FLAG_WROTE_ON_ROUTE_224_TABLET)
    const root = new Group()
    const show = marked('r224b', 'show'), hide = marked('r224b', 'hide')
    root.add(show, hide)
    const nodes = variantNodes(root)
    const flags = new Set<number>()
    // 처음 맞출 때 `show`가 접히고, 다시 맞추면 바뀐 것이 없다
    expect(applyVariants(nodes, (id) => flags.has(id))).toBe(true)
    expect(applyVariants(nodes, (id) => flags.has(id))).toBe(false)
    flags.add(FLAG_WROTE_ON_ROUTE_224_TABLET)
    expect(applyVariants(nodes, (id) => flags.has(id))).toBe(true)
    expect([show.visible, hide.visible]).toEqual([true, false])
    // 같은 깃발로 또 맞춰도 바뀐 것이 없다
    expect(applyVariants(nodes, (id) => flags.has(id))).toBe(false)
    flags.clear()
    expect(applyVariants(nodes, (id) => flags.has(id))).toBe(true)
    expect([show.visible, hide.visible]).toEqual([false, true])
  })

  it('깃발표에 없는 판 이름은 안 켜진 것으로 본다', () => {
    const m = marked('모르는판', 'show')
    applyVariants([{ object: m, variant: '모르는판', mode: 'show' }], () => true)
    expect(m.visible).toBe(false)
  })
})
