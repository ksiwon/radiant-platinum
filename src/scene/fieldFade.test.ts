// BDSP 지역 흐림 (`fieldFade`) — 카메라와 주인공 사이에 든 나무 · 건물
//
// ⚠️ **여기서 지키는 것은 「툭 바뀌지 않는다」와 「유령 집이 그림자를 안 남긴다」이다.** 한동안 집은 한 프레임에 25%가 됐고
// 그 유령 집이 짙은 그림자를 주인공 위에 드리웠으며, 나무는 0.05 단위 · 20Hz로 덜컥덜컥 작아졌다
import { describe, expect, it } from 'vitest'
import {
  BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3,
} from 'three'
import { easeStep, fieldFade, GHOST, isGround } from './fieldFade'
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

describe('BDSP 흐림 — 땅인지는 이름으로 (I-p04-1)', () => {
  /** 탄광 B1F 석탄 더미만 한 한 벌 (`d01r0102` 노드 3 · 20.3 × 3.0 × 9.1칸) — 카메라와 주인공 사이 */
  function heap(name: string): { root: Group, mat: () => MeshStandardMaterial } {
    const root = new Group()
    const mesh = new Mesh(new BoxGeometry(20.3, 3, 9.1), new MeshStandardMaterial({ name }))
    mesh.position.set(0, 1.5, 4)
    root.add(mesh)
    return { root, mat: () => mesh.material as MeshStandardMaterial }
  }
  const settle = (root: Group): void => {
    const fade = fieldFade(root)
    fade.aim(EYE, AIM, true)
    for (let i = 0; i < 120; i++) fade.step(FRAME)
  }

  it('16칸보다 넓은 석탄 더미도 흐린다 — 땅이 아니다', () => {
    const { root, mat } = heap('M_D_001_Coal_01')
    settle(root)
    expect(mat().opacity).toBe(GHOST)
  })

  it('같은 크기의 절벽 · 땅은 안 흐린다 — 발밑이 사라진다', () => {
    for (const name of ['M_D_001C_Cliff_01_01N', 'M_C_001_Ground_05_01', 'M_C_001_ComWall_09', 'M_C_001A_RockTop_01']) {
      const { root, mat } = heap(name)
      settle(root)
      expect(mat().opacity, name).toBe(1)
    }
  })

  it('40칸 넘는 한 벌은 땅이 아니어도 안 흐린다 — 상자가 늘 선분에 걸린다', () => {
    const root = new Group()
    const mesh = new Mesh(new BoxGeometry(41, 3, 9), new MeshStandardMaterial({ name: 'M_D_001_Coal_01' }))
    mesh.position.set(0, 1.5, 4)
    root.add(mesh)
    settle(root)
    expect((mesh.material as MeshStandardMaterial).opacity).toBe(1)
  })

  it('이름 갈래 — 재질이 다 땅이어야 땅이다', () => {
    const m = (name: string): MeshStandardMaterial => new MeshStandardMaterial({ name })
    expect(isGround([m('M_D_026_Floor_01'), m('M_D_028_Wall_01')])).toBe(true)
    expect(isGround([m('M_D_053_Ceil_01_C')])).toBe(true)
    expect(isGround([m('M_C_001_DungeonStair_01'), m('M_D_001_Stair_01')])).toBe(true)
    expect(isGround([m('M_C_001_Ground_05_01'), m('M_D_001_Coal_01')])).toBe(false)
    expect(isGround([m('M_D_048_Handrail_01')])).toBe(false)
    expect(isGround([])).toBe(false)
  })
})

describe('BDSP 흐림 — 바위 뚜껑 (I-p13-1)', () => {
  /** 높이 `y`의 평평한 뚜껑 — x −4~4 · z `z0`~`z1` (카메라와 주인공 사이) */
  function cap(y: number, z0 = 2, z1 = 6): { root: Group, mesh: Mesh } {
    const root = new Group()
    const g = new PlaneGeometry(8, z1 - z0).rotateX(-Math.PI / 2).translate(0, y, (z0 + z1) / 2)
    const mesh = new Mesh(g, new MeshStandardMaterial({ name: 'M_C_001_Ground_05_02' }))
    mesh.userData.cap = true
    root.add(mesh)
    return { root, mesh }
  }
  const run = (root: Group, eye: Vector3, aim: Vector3): number => {
    const fade = fieldFade(root)
    fade.aim(eye, aim, true)
    for (let i = 0; i < 120; i++) fade.step(FRAME)
    const mesh = root.children[0] as Mesh
    return (mesh.material as MeshStandardMaterial).opacity
  }

  it('선분이 뚜껑 면을 지나면 흐린다 — 넓은 땅 이름이어도 뚜껑이면 잰다', () => {
    // 카메라 (0, 5.2, 8) → 겨눔점 (0, 1.2, 0): 높이 3을 z 3.6에서 지난다 — 뚜껑 위다
    const { root } = cap(3)
    expect(run(root, EYE, AIM)).toBe(GHOST)
  })

  it('선분이 그 높이를 뚜껑 밖에서 지나면 안 흐린다 — 상자가 아니라 면으로 잰다', () => {
    const { root } = cap(3)
    // 옆으로 비킨 주인공 — 높이 3을 x 10에서 지나서 뚜껑(x −4~4) 밖이다.
    expect(run(root, new Vector3(10, 5.2, 8), new Vector3(10, 1.2, 0))).toBe(1)
  })

  it('주인공보다 1.5칸 안쪽으로 높은 뚜껑은 안 흐린다 — 주인공이 선 단의 둘레다', () => {
    // 높이 1.4 — 선분이 z 0.4에서 지나고 그 자리도 뚜껑(z −1~6) 위지만 발에서 1.5칸이 안 된다
    const { root } = cap(1.4, -1, 6)
    expect(run(root, EYE, AIM)).toBe(1)
  })

  it('1인칭은 안 건드린다', () => {
    const { root, mesh } = cap(3)
    const fade = fieldFade(root)
    fade.aim(EYE, AIM, false)
    fade.step(FRAME)
    expect((mesh.material as MeshStandardMaterial).opacity).toBe(1)
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

  it('계단은 나무가 아니다 — 안 줄인다 (무쇠게이트 B1F 계단 · I-p04-8)', () => {
    // `d14r0102` 노드 11 — 단 테두리와 디딤판 두 재질이 인스턴스 넷으로 선다 (1.25칸)
    for (const name of ['M_C_001_DungeonStair_01', 'M_D_001_Stair_01']) {
      const { root, mesh } = tree()
      ;(mesh.material as MeshStandardMaterial).name = name
      const fade = fieldFade(root)
      fade.aim(EYE, AIM, true)
      for (let i = 0; i < 30; i++) fade.step(FRAME)
      expect(scaleOf(mesh), name).toBe(1)
    }
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
