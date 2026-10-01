// 문이 **원작 클립 길이로** 돈다.
//
// ⚠️ **한 값으로 두면 안 된다.** 오래 스무 종이 다 200ms였는데 롬을 재면
// 나무 여닫이가 8프레임(133ms) · 포켓몬센터 미닫이가 15프레임(250ms) ·
// 체육관 미닫이가 10프레임(167ms)이다. 그리고 미닫이는 **돌지 않는다** —
// 원작 클립이 문짝의 X 크기를 0으로 눌러 문틀 속에 넣는다 (DATA §2.31).
import { expect, it, describe } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { propAnimsSchema, type PropAnimsFile } from '../data/schema'
import { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { bdspDoorLeaves, doorClip, holdBdspDoors, isDoorLeaf, leafPose, pickDoor, progress } from './DoorAnimations'

const ROOT = resolve(__dirname, '../..')
const BAKED = resolve(ROOT, 'public/data/props/anims.json')

/** 아직 안 구운 트리에서는 표 없이 도는 길만 잰다 */
function baked(): PropAnimsFile | null {
  if (!existsSync(BAKED)) return null
  return propAnimsSchema.parse(JSON.parse(readFileSync(BAKED, 'utf8')))
}

describe('doorClip', () => {
  it('표가 없으면 지금까지의 한 벌로 간다', () => {
    const clip = doorClip(66, null)
    expect(clip.kind).toBe('hinged')
    expect(clip.openMs).toBe(200)
    expect(clip.shutMs).toBe(200)
  })

  it('문이 아닌 자리는 여닫이로 본다', () => {
    // `grid.propModelAt`이 못 찾으면 −1이다 — 그래도 화면이 서야 한다
    expect(doorClip(-1, null).kind).toBe('hinged')
  })

  it('미닫이 여섯과 백화점 종소리 하나를 가른다', () => {
    for (const id of [70, 75, 298, 427, 456, 484]) {
      expect(doorClip(id, null).kind, `소품 ${String(id)}`).toBe('sliding')
    }
    expect(doorClip(442, null).kind).toBe('chime')
    for (const id of [66, 67, 68, 69, 128, 246, 260, 312, 313, 438, 441, 444, 527]) {
      expect(doorClip(id, null).kind, `소품 ${String(id)}`).toBe('hinged')
    }
  })
})

describe('doorClip — 구운 표', () => {
  const table = baked()
  it.skipIf(table === null)('원작 프레임 수 그대로 돈다', () => {
    const ms = (frames: number): number => frames * (1000 / 60)
    // 나무 여닫이 여덟 프레임 — 200ms가 아니다
    expect(doorClip(66, table).openMs).toBeCloseTo(ms(8), 6)
    expect(doorClip(66, table).shutMs).toBeCloseTo(ms(8), 6)
    // 포켓몬센터 미닫이 열다섯 · 체육관 열
    expect(doorClip(70, table).openMs).toBeCloseTo(ms(15), 6)
    expect(doorClip(298, table).openMs).toBeCloseTo(ms(10), 6)
    // 백화점 아홉
    expect(doorClip(442, table).openMs).toBeCloseTo(ms(9), 6)
  })

  it.skipIf(table === null)('스무 종이 다 표에 있다', () => {
    for (const id of [66, 67, 68, 69, 70, 75, 128, 246, 260, 298,
      312, 313, 427, 438, 441, 442, 444, 456, 484, 527]) {
      const clip = doorClip(id, table)
      // 표에 없으면 여기서 200ms가 나온다 — 그러면 배선이 끊긴 것이다
      expect(clip.openMs, `소품 ${String(id)}`).not.toBe(200)
      expect(clip.openMs).toBeGreaterThan(0)
    }
  })
})

describe('BDSP 문짝 (`holdBdspDoors` · `leafPose`)', () => {
  /** 떡잎마을 집 문짝 — `M_T_001_DoorOuter_01`이 (116.52, 1.9, 875.53)에 1.2 × 1.8 × 0.25로 선다 (area001 실측) */
  function town(): { root: Group, leaf: InstancedMesh } {
    const root = new Group()
    const geometry = new BoxGeometry(1.2, 1.8, 0.25)
    const leaf = new InstancedMesh(geometry, new MeshStandardMaterial({ name: 'M_T_001_DoorOuter_01' }), 1)
    leaf.setMatrixAt(0, new Matrix4().makeTranslation(116.52, 1.9, 875.53))
    const wall = new Mesh(new BoxGeometry(6, 4, 4), new MeshStandardMaterial({ name: 'M_T_001_House_01' }))
    wall.position.set(116.5, 2, 873)
    root.add(leaf, wall)
    return { root, leaf }
  }

  it('문짝 재질만 고른다 — 게이트 · 문 앞 빛은 문짝이 아니다', () => {
    const is = (name: string): boolean => isDoorLeaf(new MeshStandardMaterial({ name }))
    for (const n of ['M_T_001_DoorOuter_01', 'M_C_001_DoorOuter_02_01', 'M_C_001_DoorInner_01', 'M_C_001_AutoDoor_01',
      'M_C_001_DoorElv_01', 'M_RO_059_Door_01', 'M_D_040_Door_01']) expect(is(n), n).toBe(true)
    for (const n of ['M_C_001_GateLight_01', 'M_C_001_BarrierGate_01', 'M_R_221_PalGate_01', 'M_T_001_House_01']) {
      expect(is(n), n).toBe(false)
    }
  })

  it('문 칸 둘레의 문짝만 찾고, 떼면 놓는다', () => {
    const { root } = town()
    const release = holdBdspDoors(root)
    // 원작 워프 (116, 875) · 땅 높이 1
    expect(bdspDoorLeaves(116, 875, 1)).toHaveLength(1)
    // 이웃 집 문 (105, 875)은 다른 문이다
    expect(bdspDoorLeaves(105, 875, 1)).toHaveLength(0)
    // 위층(땅 높이 8)의 같은 칸은 아니다
    expect(bdspDoorLeaves(116, 875, 8)).toHaveLength(0)
    release()
    expect(bdspDoorLeaves(116, 875, 1)).toHaveLength(0)
  })

  it('여닫이는 경첩 모서리를 축으로 안쪽(+z)으로 돈다 — 경첩은 제자리다', () => {
    // 주인공이 남쪽에 서서 북쪽 문을 연다 — `doorYaw`가 π를 준다
    const box = new Box3(new Vector3(-0.6, 0, -0.1), new Vector3(0.6, 1.8, 0.1))
    const yaw = Math.PI
    const pose = leafPose(box, new Vector3(0, 0.9, 0), yaw, 'hinged', 1)
    // 문의 가로축 (cos π, 0, −sin π) = (−1, 0, 0) — 왼쪽(−x) 모서리는 월드 +x 쪽이다
    const hinge = new Vector3(0.6, 0.9, 0).applyMatrix4(pose)
    expect(hinge.x).toBeCloseTo(0.6, 6)
    expect(hinge.z).toBeCloseTo(0, 6)
    // 반대 끝은 안쪽(주인공에서 먼 쪽 = −z)으로 간다
    const free = new Vector3(-0.6, 0.9, 0).applyMatrix4(pose)
    expect(free.z).toBeLessThan(-0.9)
  })

  it('미닫이는 돌지 않고 가로로 눌린다 — 두 짝 자동문은 저마다 바깥 모서리로', () => {
    const left = new Box3(new Vector3(-0.75, 0, -0.03), new Vector3(0, 1.8, 0.03))
    const right = new Box3(new Vector3(0, 0, -0.03), new Vector3(0.75, 1.8, 0.03))
    const middle = new Vector3(0, 0.9, 0)
    const l = leafPose(left, middle, 0, 'sliding', 1)
    const r = leafPose(right, middle, 0, 'sliding', 1)
    // 다 열리면 가운데 이음매가 저마다 바깥 모서리로 들어간다
    expect(new Vector3(0, 0.9, 0).applyMatrix4(l).x).toBeCloseTo(-0.75, 2)
    expect(new Vector3(0, 0.9, 0).applyMatrix4(r).x).toBeCloseTo(0.75, 2)
    // 깊이 방향은 그대로다
    expect(new Vector3(0, 0.9, 0.03).applyMatrix4(l).z).toBeCloseTo(0.03, 6)
    // 닫힌 문은 그대로다
    expect(leafPose(left, middle, 0, 'sliding', 0).equals(new Matrix4())).toBe(true)
  })

  it('문이 다 열리고 닫히는 데 원작 클립 길이가 걸린다', () => {
    const clip = doorClip(70, null)
    const door = { tag: 1, x: 0, z: 0, yaw: 0, phase: 'opening' as const, since: 1000 }
    expect(progress(door, clip, 1000)).toBe(0)
    expect(progress(door, clip, 1000 + clip.openMs / 2)).toBeCloseTo(0.5, 6)
    expect(progress(door, clip, 1000 + clip.openMs)).toBe(1)
    expect(progress({ ...door, phase: 'closing' }, clip, 1000 + clip.shutMs)).toBe(0)
  })
})

describe('문 하나를 누가 돌리나 (`pickDoor`)', () => {
  /** 나무 여닫이(소품 66)가 클립 표에 있다 */
  const anims = { props: { 66: [0, 1] }, members: [{ frames: 8 }, { frames: 8 }] } as unknown as PropAnimsFile

  it('구운 BDSP 문짝을 찾았으면 그것이 돈다', () => {
    expect(pickDoor(1, 66, anims, true)).toBe('bdsp')
    expect(pickDoor(2, -1, null, false)).toBe('bdsp')
  })

  it('BDSP 위에서는 문짝을 못 찾아도 우리 문틀을 안 세운다 — BDSP 벽 앞에 상자 문이 하나 더 선다', () => {
    expect(pickDoor(0, -1, anims, true)).toBe(null)
    expect(pickDoor(0, 66, anims, true)).toBe(null)
  })

  it('원작 그림 위에서는 원작 문 모델이 클립으로 돌고, 모델이 없는 자리에만 우리 문짝이 선다', () => {
    expect(pickDoor(0, 66, anims, false)).toBe(null)
    expect(pickDoor(0, -1, anims, false)).toBe('ours')
    // 클립 표가 없으면 원작 모델도 못 돈다 — 우리 문짝이 대신한다
    expect(pickDoor(0, 66, null, false)).toBe('ours')
  })
})
