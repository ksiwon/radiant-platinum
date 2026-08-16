import { describe, expect, it } from 'vitest'
import { playerModelPath } from './playerModelPath'

describe('playerModelPath', () => {
  it('남주인공은 BDSP Lucas 등신 모델을 쓴다', () => {
    expect(playerModelPath('boy')).toBe('models/npc/pc0001_00.glb')
  })

  it('여주인공도 BDSP Dawn 등신 모델을 쓴다 — 남자와 같은 계통이다', () => {
    // ⚠️ 한동안 여자만 `models/dawn.glb`였다. 그것은 받아 온 `.dae`를 Blender로
    // 물린 개발 전용 파일이고, **사용자는 그 몸을 한 번도 못 봤다** — 브라우저는
    // 처음부터 이 번들에서 구웠다 (`import/bdsp/convert.ts`)
    expect(playerModelPath('girl')).toBe('models/npc/pc0002_00.glb')
  })
})
