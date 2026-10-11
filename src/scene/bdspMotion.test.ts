// 움직임 실행 (`bdspMotion`) — 회전 · 재질 갈아 끼우기 · 가까운 것만 민다
import { describe, expect, it } from 'vitest'
import {
  AnimationClip, BoxGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Texture, Vector3, VectorKeyframeTrack,
} from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { MOTION_REACH, liveMotion, liveMotionMaterials, motionMaterial, motionOf, spinQuaternion } from './bdspMotion'

const q = new Quaternion()

describe('spinQuaternion', () => {
  const spin = { euler: [0, 0, 0], add: [360, 0, 0], secs: 6 }

  it('0초는 시작 자세이고 한 바퀴(6초)는 다시 그 자세다', () => {
    const a = spinQuaternion(spin, 0, new Quaternion()).clone()
    const b = spinQuaternion(spin, 6, new Quaternion()).clone()
    expect(Math.abs(a.dot(b))).toBeCloseTo(1, 9)
    expect(a.w).toBeCloseTo(1, 9)
  })

  it('x축 회전 — 1.5초(4분의 1)는 x로 90도다', () => {
    spinQuaternion(spin, 1.5, q)
    expect(q.x).toBeCloseTo(Math.sin(Math.PI / 4), 9)
    expect(q.w).toBeCloseTo(Math.cos(Math.PI / 4), 9)
  })

  it('x를 뒤집은 맵이라 y 오일러의 부호가 뒤집힌다 — 시작 자세 y 40도는 사원수 y가 −이다', () => {
    spinQuaternion({ euler: [0, 40, 0], add: [0, 0, 0], secs: 6 }, 0, q)
    expect(q.y).toBeLessThan(0)
    expect(q.y).toBeCloseTo(-Math.sin((40 * Math.PI / 180) / 2), 9)
  })

  it('음수 시각도 소수부로 접는다', () => {
    spinQuaternion(spin, -1.5, q)
    expect(q.x).toBeCloseTo(Math.sin(Math.PI * 3 / 4), 9)
  })
})

describe('motionOf · motionMaterial', () => {
  it('움직임 값이 없으면 null이다', () => {
    expect(motionOf(new MeshStandardMaterial())).toBeNull()
    expect(motionMaterial(new MeshStandardMaterial())).toBeNull()
  })

  it('그림이 없는 재질은 흐르지 않는다 — 흔들림만 있으면 노드 재질이 된다', () => {
    const flat = new MeshStandardMaterial()
    flat.userData.texVel = [0, 0.3]
    expect(motionMaterial(flat)).toBeNull()
    const leaf = new MeshStandardMaterial()
    leaf.userData.swing = { power: 2, speed: 1, dist: 1, uv: 0, scale: [0.01, 0, 0], dir: [1, 0, 0] }
    const made = motionMaterial(leaf)
    expect(made).toBeInstanceOf(MeshStandardNodeMaterial)
    expect(made!.positionNode).not.toBeNull()
    expect(made!.colorNode).toBeNull()
  })

  it('그림이 있는 흐름 재질은 colorNode를 얻고 색 · 불투명도 · 이름 · userData를 그대로 가진다', () => {
    const belt = new MeshStandardMaterial({ map: new Texture(), color: 0x336699, opacity: 0.5, transparent: true })
    belt.name = 'M_C_001_Belt_01'
    belt.userData.texVel = [0, 0.354]
    const made = motionMaterial(belt)!
    expect(made.colorNode).not.toBeNull()
    expect(made.map).toBe(belt.map)
    expect(made.color.getHex()).toBe(belt.color.getHex())
    expect(made.opacity).toBe(0.5)
    expect(made.transparent).toBe(true)
    expect(made.name).toBe('M_C_001_Belt_01')
    expect(made.userData.texVel).toEqual([0, 0.354])
  })
})

describe('liveMotionMaterials', () => {
  it('같은 재질을 나눠 쓰는 메시는 새 재질도 나눠 쓴다', () => {
    const m = new MeshStandardMaterial({ map: new Texture() })
    m.userData.scroll = [0, 0.05]
    const root = new Group()
    const a = new Mesh(new BoxGeometry(), m)
    const b = new Mesh(new BoxGeometry(), m)
    root.add(a, b)
    expect(liveMotionMaterials(root)).toBe(1)
    expect(a.material).toBe(b.material)
    expect(a.material).not.toBe(m)
  })
})

describe('liveMotion', () => {
  const spinNode = (at: Vector3): Group => {
    const g = new Group()
    g.userData.spin = { euler: [0, 0, 0], add: [360, 0, 0], secs: 6 }
    g.position.copy(at)
    return g
  }

  it('가까운 풍차는 돌고 먼 풍차는 안 민다', () => {
    const root = new Group()
    const near = spinNode(new Vector3(5, 0, 0))
    const far = spinNode(new Vector3(MOTION_REACH + 50, 0, 0))
    root.add(near, far)
    const motion = liveMotion(root)
    motion.update(1.5, new Vector3(0, 0, 0))
    expect(near.quaternion.x).toBeCloseTo(Math.sin(Math.PI / 4), 6)
    expect(far.quaternion.w).toBe(1)
  })

  it('클립은 맵당 믹서 하나가 돌린다 — 먼 것은 멈춘다', () => {
    const root = new Group()
    const coal = new Group()
    coal.name = 'coal'
    root.add(coal)
    const clip = new AnimationClip('coal', 2, [new VectorKeyframeTrack('coal.position', [0, 2], [0, 0, 0, 10, 0, 0])])
    const motion = liveMotion(root, [clip])
    motion.update(1, new Vector3(0, 0, 0))
    expect(coal.position.x).toBeCloseTo(5, 6)
    // 멀리 가서 반 초가 지나면 멈춘다
    motion.update(0.5, new Vector3(1000, 0, 0))
    const was = coal.position.x
    motion.update(1, new Vector3(1000, 0, 0))
    expect(coal.position.x).toBeCloseTo(was, 6)
    motion.dispose()
  })
})
