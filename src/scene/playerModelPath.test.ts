import { describe, expect, it } from 'vitest'
import { playerModelPath } from './playerModelPath'

describe('playerModelPath', () => {
  it('남주인공은 BDSP Lucas 등신 모델을 쓴다', () => {
    expect(playerModelPath('boy')).toBe('models/npc/pc0001_00.glb')
  })

  it('여주인공은 Platinum 복장 Dawn 모델을 쓴다', () => {
    expect(playerModelPath('girl')).toBe('models/dawn.glb')
  })
})
