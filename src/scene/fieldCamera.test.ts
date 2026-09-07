// 카메라가 **퇴화한 투영으로 태어나지 않는가** (REPAIR §41).
//
// ⚠️ **이 검사가 지키는 것은 화면 전체다.** aspect가 0이면 투영 행렬의 첫
// 성분이 무한대가 되고, 그 카메라로 그린 모든 정점의 clip x가 무한대·NaN이
// 된다 — 드로우는 나가는데 화면에는 한 픽셀도 안 남는다. 실제로 그렇게 됐고
// (R3F가 만든 둘째 카메라), 창을 한 번 흔들기 전까지 3D가 통째로 안 보였다.
import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three'
import { FIELD_FOV } from '../engine/actor/camera'
import { fieldCamera, makeFieldCamera } from './fieldCamera'

describe('필드 카메라', () => {
  it('투영이 유한하다 — 크기를 아직 모르는 채로도', () => {
    const camera = makeFieldCamera()
    expect(camera.aspect).toBeGreaterThan(0)
    expect(camera.projectionMatrix.elements.every((n) => Number.isFinite(n))).toBe(true)
  })

  it('**aspect가 0이면 투영이 무한대가 된다** — 우리가 막는 그 상태다', () => {
    const broken = new PerspectiveCamera(FIELD_FOV, 0, 0.1, 200)
    expect(broken.projectionMatrix.elements.every((n) => Number.isFinite(n))).toBe(false)
  })

  it('창 비율을 받은 뒤에도 유한하다', () => {
    const camera = makeFieldCamera()
    camera.aspect = 960 / 640
    camera.updateProjectionMatrix()
    expect(camera.projectionMatrix.elements.every((n) => Number.isFinite(n))).toBe(true)
    expect(camera.projectionMatrix.elements[0]).toBeGreaterThan(0)
  })

  it('앱이 쓰는 것은 **미리 만들어 둔 하나**다 — 부를 때마다 새로 안 만든다', () => {
    expect(fieldCamera.isPerspectiveCamera).toBe(true)
    expect(fieldCamera.fov).toBe(FIELD_FOV)
    expect(fieldCamera.projectionMatrix.elements.every((n) => Number.isFinite(n))).toBe(true)
    // 공장은 새것을 낸다 — 그래서 위의 것이 **하나로 고정된 신원**이라는 뜻이 산다
    expect(makeFieldCamera()).not.toBe(fieldCamera)
  })
})
