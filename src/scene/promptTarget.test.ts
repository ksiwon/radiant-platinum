import { describe, expect, it } from 'vitest'
import { promptNpcAt } from './promptTarget'

describe('world interaction prompt', () => {
  const npcs = [
    { id: 'hidden', x: 4, z: 3, visible: false, script: 8 },
    { id: 'decoration', x: 4, z: 3, visible: true, script: 0xffff },
    { id: 'talker', x: 4.2, z: 3.1, visible: true, script: 9 },
  ]

  it('uses the same rounded placement rule as field talk lookup', () => {
    expect(promptNpcAt(npcs, 4, 3, 0xffff)?.id).toBe('talker')
  })

  it('ignores hidden and non-scripted objects', () => {
    expect(promptNpcAt(npcs.slice(0, 2), 4, 3, 0xffff)).toBeNull()
  })
})
