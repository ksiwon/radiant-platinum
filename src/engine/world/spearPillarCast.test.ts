import { describe, expect, it } from 'vitest'
import { FACING_YAW, isStepPattern, personPose, pictureFacing, pictureOf, turnToward } from './spearPillarCast'

describe('창기둥 영상의 사람 — 걸음 무늬에서 보는 쪽과 몸짓', () => {
  it('그림 묶음이 보는 쪽을 정한다 — 위 · 아래 · 왼 · 오른', () => {
    expect([0, 3, 4, 7, 8, 11, 12, 15].map(pictureFacing)).toEqual(
      ['north', 'north', 'south', 'south', 'west', 'west', 'east', 'east'])
  })

  it('BTP0 프레임 네 장이 그림 한 장이다', () => {
    expect([0, 3, 4, 16, 17, 60].map(pictureOf)).toEqual([0, 0, 1, 4, 4, 15])
  })

  it('이동 무늬만 발을 옮긴다 — 1~4 · 9~12', () => {
    expect([0, 1, 4, 5, 8, 9, 12, 13].map(isStepPattern)).toEqual([false, true, true, false, false, true, true, false])
  })

  it('태홍의 장면 2 — 앞으로 돌아섰다 다시 뒤돌아서고 물러난다', () => {
    // 6: 아래 보기 그림 4에 서서 돈다 → 걸음이 끝나면 그림이 그 자리에 남는다
    expect(personPose(6, true, 16)).toMatchObject({ facing: 'south', walking: false })
    expect(personPose(0, false, 16)).toMatchObject({ facing: 'south', walking: false })
    // 5: 위 보기로 돌아선다
    expect(personPose(5, true, 0)).toMatchObject({ facing: 'north', walking: false })
    // 1 · 9: 위 보기 그림으로 발을 옮긴다 (원작은 +z로 물러난다)
    expect(personPose(1, true, 4 * 2)).toMatchObject({ facing: 'north', walking: true })
    expect(personPose(9, true, 4 * 3)).toMatchObject({ facing: 'north', walking: true })
  })

  it('걸음이 안 도는 동안은 무늬가 이동이어도 선다', () => {
    expect(personPose(1, false, 8).walking).toBe(false)
  })

  it('보는 쪽의 각 — 모델은 +z가 앞이다', () => {
    expect(FACING_YAW.south).toBe(0)
    expect(Math.sin(FACING_YAW.east)).toBeCloseTo(1)
    expect(Math.cos(FACING_YAW.north)).toBeCloseTo(-1)
    expect(Math.sin(FACING_YAW.west)).toBeCloseTo(-1)
  })

  it('가까운 쪽으로 돈다', () => {
    expect(turnToward(0, Math.PI / 2, 0.1)).toBeCloseTo(0.1)
    expect(turnToward(Math.PI - 0.05, -Math.PI + 0.05, 0.1)).toBeCloseTo(-Math.PI + 0.05)
    expect(turnToward(-Math.PI + 0.05, Math.PI - 0.05, 0.02)).toBeCloseTo(-Math.PI + 0.05 - 0.02)
  })
})
