// BDSP 지역 흐림 (`fieldFade`) — 카메라와 주인공 사이에 든 나무 · 건물
//
// ⚠️ **여기서 지키는 것은 「툭 바뀌지 않는다」와 「유령 집이 그림자를 안 남긴다」이다.** 한동안 집은 한 프레임에 25%가 됐고
// 그 유령 집이 짙은 그림자를 주인공 위에 드리웠으며, 나무는 0.05 단위 · 20Hz로 덜컥덜컥 작아졌다
import { describe, expect, it } from 'vitest'
import {
  BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3,
} from 'three'
import { easeStep, fieldFade, GHOST } from './fieldFade'
import { EASE } from './PropFade'

/** 3인칭 카메라 — 주인공 뒤 8칸 · 위 4칸 */
const EYE = new Vector3(0, 5.2, 8)
const AIM = new Vector3(0, 1.2, 0)
const FRAME = 1 / 60

/** 카메라와 주인공 사이에 선 집 한 채 (3칸 사방 · 3칸 높이) */
function house(): { root: Group, mesh: Mesh, mat: () => MeshStandardMaterial } {
  const root = new Group()
  const mesh = new Mesh(new BoxGeometry(3, 3, 3), new MeshStandardMaterial({ name: 'M_T_001_House_01' }))
  mesh.position.set(0, 1.5, 4)
  mesh.castShadow = true
  root.add(mesh)
  return { root, mesh, mat: () => mesh.material as MeshStandardMaterial }
}

describe('BDSP 흐림 — 건물', () => {
  it('한 프레임에 `GHOST`로 뛰지 않는다 — `PropFade`의 비율로 다가간다', () => {
    const { root, mat } = house()
    const fade = fieldFade(root)
    fade.aim(EYE, AIM, true)
    fade.step(FRAME)
    expect(mat().opacity).toBeCloseTo(1 - (1 - GHOST) * EASE, 6)
    for (let i = 0; i < 120; i++) fade.step(FRAME)
    expect(mat().opacity).toBe(GHOST)
  })

  it('흐려지기 시작하면 그림자부터 떼고, 다 돌아와야 되돌린다', () => {
    const { root, mesh } = house()
    const fade = fieldFade(root)
    fade.aim(EYE, AIM, true)
    fade.step(FRAME)
    expect(mesh.castShadow).toBe(false)
    fade.aim(EYE, AIM, false)
    fade.step(FRAME)
    // 돌아오는 중에는 아직 반투명이다 — 그림자도 아직이다
    expect(mesh.castShadow).toBe(false)
    for (let i = 0; i < 120; i++) fade.step(FRAME)
    expect(mesh.castShadow).toBe(true)
    expect((mesh.material as MeshStandardMaterial).transparent).toBe(false)
    expect((mesh.material as MeshStandardMaterial).depthWrite).toBe(true)
  })

  it('원래 그림자를 안 지던 것은 돌아와도 안 진다', () => {
    const { root, mesh } = house()
    mesh.castShadow = false
    const fade = fieldFade(root)
    fade.aim(EYE, AIM, true)
    for (let i = 0; i < 120; i++) fade.step(FRAME)
    fade.aim(EYE, AIM, false)
    for (let i = 0; i < 120; i++) fade.step(FRAME)
    expect(mesh.castShadow).toBe(false)
  })

  it('반투명 깃발은 뒤집힐 때만 세운다 — 매 프레임 파이프라인을 다시 굽지 않는다', () => {
    const { root, mat } = house()
    const fade = fieldFade(root)
    fade.aim(EYE, AIM, true)
    fade.step(FRAME)
    const v = mat().version
    fade.step(FRAME)
    fade.step(FRAME)
    expect(mat().version).toBe(v)
  })

  it('1인칭은 안 건드린다', () => {
    const { root, mat } = house()
    const fade = fieldFade(root)
    fade.aim(EYE, AIM, false)
    fade.step(FRAME)
    expect(mat().opacity).toBe(1)
  })

  it('따라가는 몫은 시간으로 잰다 — 30Hz 한 프레임이 60Hz 두 프레임과 같다', () => {
    const two = 1 - (1 - easeStep(FRAME)) ** 2
    expect(easeStep(2 * FRAME)).toBeCloseTo(two, 9)
    expect(easeStep(FRAME)).toBeCloseTo(EASE, 9)
  })
})

describe('BDSP 흐림 — 나무', () => {
  /** 카메라와 주인공 사이에 선 소나무 한 그루 (4칸 높이) */
  function tree(): { root: Group, mesh: InstancedMesh } {
    const root = new Group()
    const geometry = new BoxGeometry(1, 4, 1).translate(0, 2, 0)
    const mesh = new InstancedMesh(geometry, new MeshStandardMaterial({ name: 'M_C_001_Tree_01' }), 1)
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, 4))
    root.add(mesh)
    return { root, mesh }
  }
  const scaleOf = (mesh: InstancedMesh): number => {
    const m = new Matrix4()
    mesh.getMatrixAt(0, m)
    return new Vector3().setFromMatrixScale(m).y
  }

  it('선분에 걸린 나무는 매 프레임 조금씩 줄어든다 — 0.05 계단이 아니다', () => {
    const { root, mesh } = tree()
    const fade = fieldFade(root)
    fade.aim(EYE, AIM, true)
    fade.step(FRAME)
    const first = scaleOf(mesh)
    expect(first).toBeCloseTo(1 - EASE, 5)
    // 0.05 단위로 끊던 값이 아니다
    expect(Math.abs(first * 20 - Math.round(first * 20))).toBeGreaterThan(1e-3)
    fade.step(FRAME)
    expect(scaleOf(mesh)).toBeLessThan(first)
    for (let i = 0; i < 120; i++) fade.step(FRAME)
    expect(scaleOf(mesh)).toBeCloseTo(0, 6)
  })

  it('비키면 원래 행렬로 그대로 돌아온다', () => {
    const { root, mesh } = tree()
    const before = Float32Array.from(mesh.instanceMatrix.array)
    const fade = fieldFade(root)
    fade.aim(EYE, AIM, true)
    for (let i = 0; i < 30; i++) fade.step(FRAME)
    fade.aim(EYE, AIM, false)
    for (let i = 0; i < 200; i++) fade.step(FRAME)
    expect(Array.from(mesh.instanceMatrix.array)).toEqual(Array.from(before))
  })

  it('문짝은 나무가 아니다 — 안 줄인다', () => {
    const { root, mesh } = tree()
    ;(mesh.material as MeshStandardMaterial).name = 'M_T_001_DoorOuter_01'
    const fade = fieldFade(root)
    fade.aim(EYE, AIM, true)
    for (let i = 0; i < 30; i++) fade.step(FRAME)
    expect(scaleOf(mesh)).toBe(1)
  })
})
