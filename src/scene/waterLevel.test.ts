import { afterEach, describe, expect, it } from 'vitest'
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Scene } from 'three'
import { trackWater, trackedWaterCount, untrackWater, waterLevelAt } from './waterLevel'

const made: Mesh[] = []
/** 눕힌 판 하나 — x 0~w · z 0~d · 높이 y */
function pane(scene: Scene, w: number, d: number, y: number, x = 0, z = 0): Mesh {
  const m = new Mesh(new PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(w / 2, 0, d / 2), new MeshBasicMaterial())
  m.position.set(x, y, z)
  scene.add(m)
  made.push(m)
  trackWater(m)
  return m
}

describe('BDSP 수면 높이 (`waterLevelAt`)', () => {
  // 모듈이 판을 들고 있으므로 시험마다 장면에서 떼어 둔다
  afterEach(() => { for (const m of made.splice(0)) m.removeFromParent() })

  it('판 위의 칸은 그 판의 높이를 준다 — 운하시티 바다 0.98', () => {
    const s = new Scene()
    pane(s, 28, 10, 0.98)
    expect(waterLevelAt(5, 5, 0.5)).toBeCloseTo(0.98, 6)
    expect(waterLevelAt(40, 5, 0.5)).toBeNull()
  })

  it('판이 옮겨 가면(던전 들어올림) 다시 잰다 · 장면에서 떨어지면 빠진다', () => {
    const s = new Scene()
    const m = pane(s, 10, 10, -1.52)
    expect(waterLevelAt(2, 2, 1)).toBeCloseTo(-1.52, 6)
    m.position.y += 1
    expect(waterLevelAt(2, 2, 1)).toBeCloseTo(-0.52, 6)
    s.remove(m)
    expect(waterLevelAt(2, 2, 1)).toBeNull()
  })

  it('판이 겹치면 서 있는 높이에 가까운 쪽이다', () => {
    const s = new Scene()
    pane(s, 10, 10, 0.5)
    const hi = pane(s, 10, 10, 3)
    expect(waterLevelAt(1, 1, 0.4)).toBeCloseTo(0.5, 6)
    expect(waterLevelAt(1, 1, 2.8)).toBeCloseTo(3, 6)
    s.remove(hi)
  })
})

describe('지역을 버릴 때 장부에서 뺀다', () => {
  afterEach(() => { for (const m of made.splice(0)) m.removeFromParent() })

  it('파도타기를 안 해도 `untrackWater`가 장부를 비운다 — 안 비우면 방문한 지역마다 glb 그래프가 힙에 남는다', () => {
    const before = trackedWaterCount()
    const s = new Scene()
    const zone = new Group()
    s.add(zone)
    for (const x of [0, 20]) {
      const m = new Mesh(new PlaneGeometry(10, 10).rotateX(-Math.PI / 2), new MeshBasicMaterial())
      m.position.set(x, 0.5, 0)
      zone.add(m)
      trackWater(m)
    }
    expect(trackedWaterCount()).toBe(before + 2)
    untrackWater(zone)
    expect(trackedWaterCount()).toBe(before)
  })

  it('쥐고 있는 지역은 장면에서 잠깐 떨어져도 장부에 남아 다시 붙이면 수면을 찾는다', () => {
    const s = new Scene()
    const zone = new Group()
    const m = new Mesh(new PlaneGeometry(10, 10).rotateX(-Math.PI / 2).translate(5, 0, 5), new MeshBasicMaterial())
    m.position.y = 0.5
    zone.add(m)
    s.add(zone)
    trackWater(m)
    expect(waterLevelAt(2, 2, 0.5)).toBeCloseTo(0.5, 6)
    s.remove(zone)
    expect(waterLevelAt(2, 2, 0.5)).toBeNull()
    s.add(zone)
    expect(waterLevelAt(2, 2, 0.5)).toBeCloseTo(0.5, 6)
    untrackWater(zone)
    expect(waterLevelAt(2, 2, 0.5)).toBeNull()
  })
})
