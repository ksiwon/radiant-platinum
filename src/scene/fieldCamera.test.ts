// 카메라가 **퇴화한 투영으로 태어나지 않는가** (REPAIR §41).
//
// ⚠️ **이 검사가 지키는 것은 화면 전체다.** aspect가 0이면 투영 행렬의 첫
// 성분이 무한대가 되고, 그 카메라로 그린 모든 정점의 clip x가 무한대·NaN이
// 된다 — 드로우는 나가는데 화면에는 한 픽셀도 안 남는다. 실제로 그렇게 됐고
// (R3F가 만든 둘째 카메라), 창을 한 번 흔들기 전까지 3D가 통째로 안 보였다.
import { describe, expect, it, vi } from 'vitest'
import {
  AdditiveBlending, BoxGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera,
  PlaneGeometry, Scene, Vector3,
} from 'three'
import { cameraSystem, FIELD_FOV, FIELD_NEAR } from '../engine/actor/camera'
import { sceneRefs } from './sceneRefs'
import { fieldCamera, makeFieldCamera, probeEye } from './fieldCamera'

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
    expect(fieldCamera.near).toBe(FIELD_NEAR)
    expect(fieldCamera.projectionMatrix.elements.every((n) => Number.isFinite(n))).toBe(true)
    // 공장은 새것을 낸다 — 그래서 위의 것이 **하나로 고정된 신원**이라는 뜻이 산다
    expect(makeFieldCamera()).not.toBe(fieldCamera)
  })
})

// 1인칭 눈이 문 앞에서 문틀 · 바깥문 속에 들지 않게, 머리에서 시선으로 쏘는 레이 (`cameraSystem.eyeProbe`)
describe('1인칭 눈 앞을 막은 것', () => {
  const head = new Vector3(305.5, 8.38, 531.5)
  const north = new Vector3(0, 0, -1)
  const out = new Vector3()

  /** 남쪽을 보는 문 판 — z = `z`에 선다. 레이가 북쪽에서 앞면을 맞는다 */
  const door = (z: number, material = new MeshBasicMaterial()): Mesh => {
    const m = new Mesh(new PlaneGeometry(1.75, 2.6), material)
    m.position.set(305.5, 8.3, z)
    return m
  }
  const sceneOf = (...kids: Mesh[]): Scene => {
    const s = new Scene()
    for (const k of kids) s.add(k)
    s.updateMatrixWorld(true)
    return s
  }

  it('머리 0.20 앞 문 판을 맞힌다 (영원시티 센터 문 앞 칸의 area002 바깥문)', () => {
    const hit = probeEye(sceneOf(door(531.3)), null, head, north, 0.52, out)
    expect(hit?.z).toBeCloseTo(531.3, 6)
  })

  it('레이 길이 밖이면 null — 배틀프런티어 문 판은 머리 0.75 앞이다', () => {
    expect(probeEye(sceneOf(door(530.75)), null, head, north, 0.52, out)).toBeNull()
  })

  it('제일 가까운 것을 낸다', () => {
    const hit = probeEye(sceneOf(door(531.1), door(531.3)), null, head, north, 0.52, out)
    expect(hit?.z).toBeCloseTo(531.3, 6)
  })

  it('⚠️ 더해지는 빛 판은 안 막는다 — BDSP 문 앞마다 입구 빛이 선다', () => {
    const glow = new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false, transparent: true })
    expect(probeEye(sceneOf(door(531.3, glow)), null, head, north, 0.52, out)).toBeNull()
  })

  it('주인공 그룹은 안 본다 — 몸 · 탄 것 · 든 것', () => {
    const s = new Scene()
    const player = new Group()
    player.add(door(531.3))
    s.add(player)
    s.updateMatrixWorld(true)
    expect(probeEye(s, player, head, north, 0.52, out)).toBeNull()
  })

  it('꺼진 것은 안 본다', () => {
    const d = door(531.3)
    d.visible = false
    expect(probeEye(sceneOf(d), null, head, north, 0.52, out)).toBeNull()
  })

  it('레이 토막의 상자에 안 걸치는 메시는 삼각형을 안 훑는다', () => {
    const far = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    far.position.set(320, 8, 531)
    far.geometry.computeBoundingSphere()
    const spy = vi.spyOn(far.geometry, 'getAttribute')
    probeEye(sceneOf(far, door(531.3)), null, head, north, 0.52, out)
    expect(spy).not.toHaveBeenCalled()
  })

  // three의 `raycast`는 경계 구가 머리를 품으면 삼각형을 다 훑는다 — 마을 하나를 덮는 바닥이 그렇다
  it('머리를 품는 넓은 바닥이 있어도 앞의 문 판을 맞힌다', () => {
    const ground = new Mesh(new PlaneGeometry(200, 200, 100, 100), new MeshBasicMaterial())
    ground.rotation.x = -Math.PI / 2
    ground.position.set(305, 7, 531)
    expect(probeEye(sceneOf(ground, door(531.3)), null, head, north, 0.52, out)?.z).toBeCloseTo(531.3, 6)
    expect(probeEye(sceneOf(ground), null, head, north, 0.52, out)).toBeNull()
  })

  it('면의 쪽은 three와 같다 — 앞면 재질은 등을 보인 판을 지나간다', () => {
    const back = door(531.3)
    back.rotation.y = Math.PI
    expect(probeEye(sceneOf(back), null, head, north, 0.52, out)).toBeNull()
    const both = door(531.3, new MeshBasicMaterial({ side: DoubleSide }))
    both.rotation.y = Math.PI
    expect(probeEye(sceneOf(both), null, head, north, 0.52, out)?.z).toBeCloseTo(531.3, 6)
  })

  it('여러 재질 메시는 맞은 면의 재질로 가린다', () => {
    const geo = new PlaneGeometry(1.75, 2.6)
    geo.clearGroups()
    geo.addGroup(0, 6, 1)
    const glow = new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false, transparent: true })
    const m = new Mesh(geo, [new MeshBasicMaterial(), glow])
    m.position.set(305.5, 8.3, 531.3)
    expect(probeEye(sceneOf(m), null, head, north, 0.52, out)).toBeNull()
    geo.clearGroups()
    geo.addGroup(0, 6, 0)
    expect(probeEye(sceneOf(m), null, head, north, 0.52, out)?.z).toBeCloseTo(531.3, 6)
  })

  it('인스턴스 메시도 맞힌다 — BDSP 지역은 건물을 인스턴스로 세운다', () => {
    const inst = new InstancedMesh(new PlaneGeometry(1.75, 2.6), new MeshBasicMaterial(), 2)
    inst.setMatrixAt(0, new Matrix4().makeTranslation(290, 8.3, 520))
    inst.setMatrixAt(1, new Matrix4().makeTranslation(305.5, 8.3, 531.3))
    const s = new Scene()
    s.add(inst)
    s.updateMatrixWorld(true)
    const hit = probeEye(s, null, head, north, 0.52, out)
    // 인스턴스 행렬은 float32다
    expect(hit?.z).toBeCloseTo(531.3, 4)
  })

  it('씬이 아직 없으면 null', () => {
    expect(probeEye(null, null, head, north, 0.52, out)).toBeNull()
  })

  it('이 모듈이 서면 카메라에 레이가 꽂힌다 — 지금 그리는 씬을 본다', () => {
    expect(cameraSystem.eyeProbe).not.toBeNull()
    const was = sceneRefs.stage.scene
    sceneRefs.stage.scene = sceneOf(door(531.3))
    try {
      expect(cameraSystem.eyeProbe!(head, north, 0.52)?.z).toBeCloseTo(531.3, 6)
    } finally {
      sceneRefs.stage.scene = was
    }
  })
})
