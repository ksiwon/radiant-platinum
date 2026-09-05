import { describe, expect, test } from 'vitest'
import { InstancedMesh } from 'three'
import { setInstances } from './instances'

const mesh = (): InstancedMesh => new InstancedMesh(undefined, undefined, 8)

describe('인스턴스 개수', () => {
  test('0이면 숨긴다 — 빈 드로우콜이 안 나가야 한다', () => {
    const m = mesh()
    setInstances(m, 0)
    expect(m.count).toBe(0)
    expect(m.visible).toBe(false)
  })

  test('하나라도 있으면 보인다', () => {
    const m = mesh()
    m.visible = false
    setInstances(m, 3)
    expect(m.count).toBe(3)
    expect(m.visible).toBe(true)
  })

  test('0에서 N으로 돌아오면 다시 보인다 — 절두체가 오가는 자리다', () => {
    const m = mesh()
    setInstances(m, 0)
    setInstances(m, 5)
    expect(m.visible).toBe(true)
    expect(m.count).toBe(5)
  })

  // ⚠️ three의 `needsUpdate`는 **쓰기 전용**이라 읽으면 undefined다. 올렸는지는
  // `version`이 오른 것으로 잰다
  test('0일 때는 행렬을 안 올린다', () => {
    const m = mesh()
    const was = m.instanceMatrix.version
    setInstances(m, 0)
    expect(m.instanceMatrix.version).toBe(was)
  })

  test('N일 때는 행렬을 올린다', () => {
    const m = mesh()
    const was = m.instanceMatrix.version
    setInstances(m, 2)
    expect(m.instanceMatrix.version).toBe(was + 1)
  })

  test('한 번만 세우는 자리는 안 올리게 할 수 있다', () => {
    const m = mesh()
    const was = m.instanceMatrix.version
    setInstances(m, 2, false)
    expect(m.instanceMatrix.version).toBe(was)
    expect(m.visible).toBe(true)
  })
})
