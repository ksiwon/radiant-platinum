// 카메라와 사람 사이에 든 소품을 비켜 주는 자 (`PropFade`).
//
// ⚠️ **여기서 지키는 것은 「배경을 지우지 않는다」이다.** 상자 하나로 재는
// 일이라, 큰 건물이 광장을 통째로 덮으면 그 건물이 사라진다 — 실제로
// 배틀프런티어의 배틀타워와 배틀파크가 그렇게 없어져 있었고, 화면에는 따로
// 배치된 문짝만 파란 판으로 떠 있었다.
import { afterEach, describe, expect, it } from 'vitest'
import { Box3, Object3D, Vector3 } from 'three'
import { blockedBy, castShadowFor, clearsBlockers } from './PropFade'
import { cameraSystem } from '../engine/actor/camera'
import { worldState } from '../state/worldState'

/** 3인칭 카메라는 사람 뒤 8타일·위 4타일이다 */
const EYE = new Vector3(48.5, 13, 26.5)
const AIM = new Vector3(48.5, 10.2, 18.5)

describe('가리는 소품 고르기', () => {
  it('사람을 품은 상자는 안 건드린다 — 배틀타워가 통째로 사라졌다', () => {
    // 실측한 배틀타워 상자 (`.audit/probe/fadeBox.mjs`) — 17.3 × 21.6 × 20.4타일
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

describe('흐림이 그림자를 되돌린다 (`castShadowFor`)', () => {
  it('원래 안 지던 반투명 무리는 흐림을 겪어도 안 진다 — 집 밑 그림자 판이 검은 사각형을 찍었다', () => {
    const saved = new WeakMap<Object3D, boolean>()
    const solid = new Object3D()
    solid.castShadow = true
    const soft = new Object3D()
    soft.castShadow = false
    for (const o of [solid, soft]) castShadowFor(o, false, saved)
    expect(solid.castShadow).toBe(false)
    expect(soft.castShadow).toBe(false)
    for (const o of [solid, soft]) castShadowFor(o, true, saved)
    expect(solid.castShadow).toBe(true)
    expect(soft.castShadow).toBe(false)
  })

  it('적어 둔 것이 없는 것(흐리는 사이 새로 붙은 메시)은 안 건드린다', () => {
    const saved = new WeakMap<Object3D, boolean>()
    const late = new Object3D()
    late.castShadow = false
    castShadowFor(late, true, saved)
    expect(late.castShadow).toBe(false)
  })

  it('두 번째 흐림도 그때의 값을 다시 적는다', () => {
    const saved = new WeakMap<Object3D, boolean>()
    const o = new Object3D()
    o.castShadow = true
    castShadowFor(o, false, saved)
    castShadowFor(o, true, saved)
    o.castShadow = false
    castShadowFor(o, false, saved)
    castShadowFor(o, true, saved)
    expect(o.castShadow).toBe(false)
  })
})

// ⚠️ **설정 시점이 아니라 지금 렌즈로 가른다** (`firstPersonView`). 스크립트 카메라
// 동안은 1인칭 설정이어도 3인칭 렌즈인데, 설정을 보던 동안은 그 컷신 내내 앞을
// 가리는 집이 안 흐려졌다 (L-map-streamer-camera 4)
describe('비켜 줄 차례인가', () => {
  afterEach(() => {
    worldState.camera.mode = 'third'
    worldState.player.hidden = false
    cameraSystem.free = null
  })

  it('3인칭이면 비켜 준다', () => {
    expect(clearsBlockers()).toBe(true)
  })

  it('1인칭 렌즈면 안 비킨다 — 코앞의 벽이 사라진다', () => {
    worldState.camera.mode = 'first'
    expect(clearsBlockers()).toBe(false)
  })

  it('1인칭 설정이어도 스크립트가 카메라를 쥐면 비켜 준다', () => {
    worldState.camera.mode = 'first'
    cameraSystem.free = { x: 3, z: 4 }
    expect(clearsBlockers()).toBe(true)
  })

  it('숨긴 주인공은 드러내지 않는다', () => {
    worldState.player.hidden = true
    expect(clearsBlockers()).toBe(false)
  })
})
