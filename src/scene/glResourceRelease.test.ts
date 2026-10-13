import { describe, expect, it } from 'vitest'
import { stillInScene, sweepDetached } from './glResourceRelease'

interface Node { parent: Node | null }
const node = (parent: Node | null = null): Node => ({ parent })

describe('떨어진 물체의 렌더 물체 치우기', () => {
  it('그려진 장면에 붙어 있으면 둔다 — 장면 자신도 붙은 것이다', () => {
    const scene = node(); const group = node(scene); const mesh = node(group)
    expect(stillInScene(mesh, scene)).toBe(true)
    expect(stillInScene(scene, scene)).toBe(true)
  })

  it('장면에서 빠진 가지의 물체만 치운다 · 다른 장면의 것은 그 장면으로 잰다', () => {
    const field = node(); const battle = node()
    const kept = node(field); const gone = node(node(null)); const other = node(battle)
    const disposed: string[] = []
    const ro = (name: string, object: Node, scene: Node) => ({ object, scene, onDispose: null, dispose: () => { disposed.push(name) } })
    const live = new Set([ro('kept', kept, field), ro('gone', gone, field), ro('other', other, battle)])
    expect(sweepDetached(live)).toBe(1)
    expect(disposed).toEqual(['gone'])
    expect([...live].map((r) => r.object)).toEqual([kept, other])
  })
})
