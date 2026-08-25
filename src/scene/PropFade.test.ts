// 카메라와 사람 사이에 든 소품을 비켜 주는 자 (`PropFade`).
//
// ⚠️ **여기서 지키는 것은 「배경을 지우지 않는다」이다.** 상자 하나로 재는
// 일이라, 큰 건물이 광장을 통째로 덮으면 그 건물이 사라진다 — 실제로
// 배틀프런티어의 배틀타워와 배틀파크가 그렇게 없어져 있었고, 화면에는 따로
// 배치된 문짝만 파란 판으로 떠 있었다.
import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { blockedBy } from './PropFade'

/** 3인칭 카메라는 사람 뒤 8타일·위 4타일이다 */
const EYE = new Vector3(48.5, 13, 26.5)
const AIM = new Vector3(48.5, 10.2, 18.5)

describe('가리는 소품 고르기', () => {
  it('사람을 품은 상자는 안 건드린다 — 배틀타워가 통째로 사라졌다', () => {
    // 실측한 배틀타워 상자 (`.audit/fadeBox.mjs`) — 17.3 × 21.6 × 20.4타일
    const tower = new Box3(new Vector3(41.6, 6.4, 6.4), new Vector3(58.9, 28, 26.8))
    expect(tower.containsPoint(AIM)).toBe(true)
    expect(blockedBy(tower, EYE, AIM)).toBe(1)
  })

  it('사이에 든 집은 그대로 비켜 준다', () => {
    // 카메라와 사람 사이 한가운데 선 4타일짜리 집
    const house = new Box3(new Vector3(47.5, 9, 21.5), new Vector3(51.5, 13, 24.5))
    expect(house.containsPoint(AIM)).toBe(false)
    expect(blockedBy(house, EYE, AIM)).toBe(0)
  })

  it('사람 너머에 선 집은 안 건드린다 — 마주 보고 선 집이 비쳤다', () => {
    const beyond = new Box3(new Vector3(46, 9, 12), new Vector3(51, 14, 16))
    expect(blockedBy(beyond, EYE, AIM)).toBe(1)
  })

  it('옆으로 비껴선 것은 거리만큼만 흐려진다', () => {
    const aside = new Box3(new Vector3(50.2, 9, 21.5), new Vector3(53, 13, 24.5))
    const at = blockedBy(aside, EYE, AIM)
    expect(at).toBeGreaterThan(0)
    expect(at).toBeLessThan(1)
  })
})
