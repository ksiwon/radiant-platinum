// 지역 · 방 파티클 표식 (`FieldFx`) — 표식 모으기 · 가까운 것만 고르기
import { describe, expect, it } from 'vitest'
import { Group, Object3D } from 'three'
import { FX_MAX_LIVE, FX_REACH, markersOf, pickMarkers } from './FieldFx'

describe('markersOf', () => {
  it('userData.fx가 있는 노드를 월드 자리 · 배율과 함께 모은다', () => {
    const root = new Group()
    root.position.set(10, 0, 20)
    const a = new Object3D()
    a.userData.fx = 8
    a.position.set(1, 2, 3)
    a.scale.set(2, 2, 2)
    const plain = new Object3D()
    root.add(a, plain)
    const marks = markersOf(root)
    expect(marks).toHaveLength(1)
    expect(marks[0]!.id).toBe(8)
    expect(marks[0]!.pos).toEqual([11, 2, 23])
    expect(marks[0]!.scale[0]).toBeCloseTo(2, 9)
  })
})

describe('pickMarkers', () => {
  const at = (id: number, x: number, z: number) => ({ id, pos: [x, 0, z] as [number, number, number], rot: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] })

  it('범위 밖은 빼고 가까운 것부터 줄 세운다', () => {
    const picked = pickMarkers([at(1, 50, 0), at(2, 5, 0), at(3, FX_REACH + 10, 0)], 0, 0)
    expect(picked.map((m) => m.id)).toEqual([2, 1])
  })

  it('한 번에 `FX_MAX_LIVE`개까지만', () => {
    const many = Array.from({ length: FX_MAX_LIVE + 5 }, (_, i) => at(i, i, 0))
    const picked = pickMarkers(many, 0, 0)
    expect(picked).toHaveLength(FX_MAX_LIVE)
    expect(picked[0]!.id).toBe(0)
  })
})
