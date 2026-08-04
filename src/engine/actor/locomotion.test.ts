// 리그 계층 검증 — **dawn.glb의 실제 노드 트리를 그대로 세워서** 확인한다.
//
// 처음엔 이름만 같은 합성 골격으로 테스트했는데 그건 아무것도 검증하지 못했다:
// 합성 본은 회전이 전부 항등이라 "월드 축을 본 로컬로 옮긴다"는 유도 자체가
// 항등 변환이 되어 버린다. 실제 리그는 본이 로컬 +X를 따라 뻗고 Hips가 180°
// 돌아 있어서, 축을 잘못 다루면 여기서 곧바로 깨진다.
//
// 잡으려는 것은 두 가지다:
//  ① 회전이 의도한 평면 안에서만 일어나는가 (다리가 옆으로 벌어지지 않는가)
//  ② 발이 **뜬 채로 앞으로, 붙은 채로 뒤로** 가는가. 이게 걷기의 정의다 —
//     반대면 뒤로 걷거나 땅에서 발을 끌게 된다. 타입도 린트도 못 잡는 종류다.
//
// 처음엔 ②를 "무릎이 굽으면 발이 높다"로 검사했는데 그건 판별력이 없었다.
// 무릎을 굽히면 위상과 무관하게 발이 올라가므로 굽힘 **방향**만 잡고 **시점**은
// 놓친다. 실제로 그 테스트를 통과한 상태에서 무릎이 입각기에 접히고 있었다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { Object3D, Quaternion, Vector3 } from 'three'
import { createRig, resetRig, updateLocomotion } from './locomotion'

interface GlbNode {
  name?: string
  children?: number[]
  translation?: [number, number, number]
  rotation?: [number, number, number, number]
  scale?: [number, number, number]
}

/** glb의 노드 트리를 Object3D로 그대로 복원한다 (메시·스킨은 빼고 변환만) */
function loadSkeleton() {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/dawn.glb'))
  const json = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12))) as {
    nodes: GlbNode[]; scenes: { nodes: number[] }[]; skins: { joints: number[] }[]
  }
  const nodes = new Map<string, Object3D>()
  const build = (i: number): Object3D => {
    const n = json.nodes[i]!
    const o = new Object3D()
    o.name = n.name ?? `node${i}`
    if (n.translation) o.position.fromArray(n.translation)
    if (n.rotation) o.quaternion.fromArray(n.rotation)
    if (n.scale) o.scale.fromArray(n.scale)
    if (!nodes.has(o.name)) nodes.set(o.name, o)
    for (const c of n.children ?? []) o.add(build(c))
    return o
  }
  const root = new Object3D()
  for (const i of json.scenes[0]!.nodes) root.add(build(i))
  root.updateMatrixWorld(true)
  const jointNames = json.skins[0]!.joints.map((i) => json.nodes[i]!.name!)
  return { root, nodes, jointNames }
}

const { jointNames } = loadSkeleton()

describe('dawn.glb 스켈레톤', () => {
  it('리그가 요구하는 본이 실제 모델에 전부 있다', () => {
    for (const n of ['LThigh', 'RThigh', 'LLeg', 'RLeg', 'LFoot', 'RFoot',
      'LArm', 'RArm', 'LForeArm', 'RForeArm', 'Spine1', 'Hips']) {
      expect(jointNames, `${n} 없음`).toContain(n)
    }
  })

  it('본이 항등 회전이 아니다 — 축 유도가 실제로 시험된다', () => {
    const { nodes } = loadSkeleton()
    const identity = new Quaternion()
    expect(nodes.get('Hips')!.quaternion.angleTo(identity)).toBeGreaterThan(1)
    expect(nodes.get('LArm')!.quaternion.angleTo(identity)).toBeGreaterThan(1)
  })
})

describe('리그 생성', () => {
  it('실제 트리로 만들어진다', () => {
    const { root } = loadSkeleton()
    expect(createRig(root, new Object3D())).not.toBeNull()
  })

  it('본이 하나라도 없으면 null — 이상한 포즈보다 바인드 포즈가 낫다', () => {
    const { root, nodes } = loadSkeleton()
    nodes.get('LForeArm')!.name = 'LForeArm_renamed'
    expect(createRig(root, new Object3D())).toBeNull()
  })
})

interface Frame { phase: number; footY: number; footZ: number; thighZ: number; thighX: number }

/** 한 사이클을 돌며 프레임마다 왼발의 월드 위치와 넓적다리 방향을 모은다 */
function sampleCycle(speed: number): Frame[] {
  const { root, nodes } = loadSkeleton()
  const rig = createRig(root, new Object3D())!
  const q = new Quaternion()
  const foot = new Vector3()
  const hips = new Vector3()
  const frames: Frame[] = []
  for (let i = 0; i < 240; i++) {
    updateLocomotion(rig, 1 / 120, speed, 4.5, 8)
    root.updateMatrixWorld(true)
    nodes.get('LToe')!.getWorldPosition(foot)
    nodes.get('Hips')!.getWorldPosition(hips)
    nodes.get('LThigh')!.getWorldQuaternion(q)
    // 넓적다리가 가리키는 월드 방향. 본은 로컬 +X를 따라 뻗는다
    const dir = new Vector3(1, 0, 0).applyQuaternion(q)
    // 발 위치는 골반 기준이다 — 캐릭터가 제자리에 서 있는 상태로 보기 위해
    frames.push({ phase: rig.phase, footY: foot.y, footZ: foot.z - hips.z, thighZ: dir.z, thighX: dir.x })
  }
  return frames
}

describe('포즈 적용', () => {
  it('다리가 시상면(앞뒤)에서만 흔들린다 — 옆으로 벌어지면 축이 틀린 것이다', () => {
    const frames = sampleCycle(4.5)
    const swingZ = Math.max(...frames.map((f) => Math.abs(f.thighZ)))
    const spreadX = Math.max(...frames.map((f) => f.thighX)) - Math.min(...frames.map((f) => f.thighX))
    expect(swingZ).toBeGreaterThan(0.2)
    expect(spreadX).toBeLessThan(0.08)
  })

  it('넓적다리가 gait의 부호를 그대로 따른다 — 양수가 앞이다', () => {
    // ⚠️ 이 테스트가 없어서 FORWARD가 반대로 박힌 채 통과했다. 아래 "발은 뜬 채로
    // 앞으로"는 발 **높이**를 무릎이 지배하기 때문에 넓적다리 부호를 못 잡는다.
    // 여기서는 넓적다리 본이 가리키는 월드 방향만 본다 — 무릎이 개입할 여지가 없다
    const { root, nodes } = loadSkeleton()
    const rig = createRig(root, new Object3D())!
    const q = new Quaternion()
    const at = (target: number) => {
      resetRig(rig)
      rig.phase = 0
      // 위상만 원하는 값으로 밀어 놓고 한 프레임 적용한다
      while (rig.phase < target) updateLocomotion(rig, 1 / 2000, 4.5, 4.5, 8)
      root.updateMatrixWorld(true)
      nodes.get('LThigh')!.getWorldQuaternion(q)
      return new Vector3(1, 0, 0).applyQuaternion(q).z
    }
    // sin(π/2)=+1 → 최대 전방, sin(3π/2)=-1 → 최대 후방
    expect(at(Math.PI / 2), '최대 전방에서 넓적다리가 뒤를 본다').toBeGreaterThan(0.3)
    expect(at((3 * Math.PI) / 2), '최대 후방에서 넓적다리가 앞을 본다').toBeLessThan(-0.3)
  })

  it('발은 뜬 채로 앞으로, 붙은 채로 뒤로 간다 — 걷기의 정의다', () => {
    const frames = sampleCycle(4.5)
    const ys = frames.map((f) => f.footY)
    const lo = Math.min(...ys), hi = Math.max(...ys)
    expect(hi - lo, '발이 아예 안 뜬다').toBeGreaterThan(0.02)

    // 발 높이 상하위 30%로 유각기/입각기를 가른다
    const cutHigh = lo + (hi - lo) * 0.7
    const cutLow = lo + (hi - lo) * 0.3
    let lifted = 0, planted = 0
    for (let i = 1; i < frames.length; i++) {
      const dz = frames[i]!.footZ - frames[i - 1]!.footZ
      if (frames[i]!.footY > cutHigh) lifted += dz
      else if (frames[i]!.footY < cutLow) planted += dz
    }
    // 뜬 동안은 앞(+Z)으로, 붙은 동안은 뒤(-Z)로 순이동해야 한다
    expect(lifted, `유각기 순이동 ${lifted.toFixed(4)}`).toBeGreaterThan(0)
    expect(planted, `입각기 순이동 ${planted.toFixed(4)}`).toBeLessThan(0)
  })

  it('발이 지면 아래로 파고들지 않는다', () => {
    const frames = sampleCycle(4.5)
    // 골반 기준 최저점이 바인드 포즈보다 크게 내려가면 다리가 과신전된 것이다
    const lowest = Math.min(...frames.map((f) => f.footY))
    const rest = sampleCycle(0)[0]!.footY
    expect(lowest).toBeGreaterThan(rest - 0.02)
  })

  it('무릎이 뒤로 접힌다 — 앞으로 꺾이면 과신전이다', () => {
    const { root, nodes } = loadSkeleton()
    const rig = createRig(root, new Object3D())!
    const knee = new Vector3(), ankle = new Vector3()
    let worstBend = 0, ankleBehind = 0
    for (let i = 0; i < 240; i++) {
      updateLocomotion(rig, 1 / 120, 4.5, 4.5, 8)
      root.updateMatrixWorld(true)
      nodes.get('LLeg')!.getWorldPosition(knee)
      nodes.get('LFoot')!.getWorldPosition(ankle)
      const behind = knee.z - ankle.z // 양수면 발목이 무릎보다 뒤
      if (Math.abs(behind) > worstBend) { worstBend = Math.abs(behind); ankleBehind = behind }
    }
    expect(worstBend, '무릎이 아예 안 접힌다').toBeGreaterThan(0.02)
    expect(ankleBehind, `최대 굽힘에서 발목이 무릎보다 ${ankleBehind > 0 ? '뒤' : '앞'}`).toBeGreaterThan(0)
  })

  it('팔이 T포즈에서 옆구리로 내려온다 — 좌우 대칭으로', () => {
    const { root, nodes } = loadSkeleton()
    const rig = createRig(root, new Object3D())!
    updateLocomotion(rig, 0, 0, 4.5, 8) // 정지 포즈
    root.updateMatrixWorld(true)

    const q = new Quaternion()
    nodes.get('LArm')!.getWorldQuaternion(q)
    const l = new Vector3(1, 0, 0).applyQuaternion(q)
    nodes.get('RArm')!.getWorldQuaternion(q)
    const r = new Vector3(1, 0, 0).applyQuaternion(q)

    // 바인드에서 팔은 수평이다. 내려오면 아래를 향해야 한다
    expect(l.y, `왼팔 y=${l.y.toFixed(3)}`).toBeLessThan(-0.7)
    expect(r.y, `오른팔 y=${r.y.toFixed(3)}`).toBeLessThan(-0.7)
    // 좌우가 거울이다 — 한쪽 부호만 틀리면 그 팔이 몸통을 뚫는다
    expect(l.x).toBeCloseTo(-r.x, 4)
    expect(l.z).toBeCloseTo(r.z, 4)
  })

  it('쇄골이 어깨 동작의 일부를 나눠 진다 — 팔 하나에 몰면 삼각근이 파인다', () => {
    const { root, nodes } = loadSkeleton()
    const bind = new Map<string, Quaternion>()
    for (const n of ['LShoulder', 'LArm']) {
      const q = new Quaternion()
      nodes.get(n)!.getWorldQuaternion(q)
      bind.set(n, q)
    }
    const rig = createRig(root, new Object3D())!
    for (let i = 0; i < 40; i++) updateLocomotion(rig, 1 / 120, 4.5, 4.5, 8)
    root.updateMatrixWorld(true)

    const moved = (n: string) => {
      const q = new Quaternion()
      nodes.get(n)!.getWorldQuaternion(q)
      return bind.get(n)!.angleTo(q)
    }
    // 팔의 회전에는 쇄골 몫이 이미 포함돼 있다(자식이라 곱해진다). 그 비율을 본다
    const ratio = moved('LShoulder') / moved('LArm')
    expect(ratio, `쇄골 몫 ${ratio.toFixed(3)}`).toBeGreaterThan(0.05)
    expect(ratio, `쇄골 몫 ${ratio.toFixed(3)}`).toBeLessThan(0.35)
  })

  it('헬퍼 본이 관절 회전의 절반만 받는다 — 어깨가 한 본에 몰리지 않게', () => {
    const { root, nodes } = loadSkeleton()
    // 바인드 월드 회전을 먼저 잡아 둔다
    const bind = new Map<string, Quaternion>()
    for (const n of ['LArm', 'LArmEX', 'LForeArm', 'LForeArmEX']) {
      const q = new Quaternion()
      nodes.get(n)!.getWorldQuaternion(q)
      bind.set(n, q)
    }
    const rig = createRig(root, new Object3D())!
    for (let i = 0; i < 40; i++) updateLocomotion(rig, 1 / 120, 4.5, 4.5, 8)
    root.updateMatrixWorld(true)

    const swing = (n: string) => {
      const q = new Quaternion()
      nodes.get(n)!.getWorldQuaternion(q)
      return bind.get(n)!.angleTo(q)
    }
    const arm = swing('LArm')
    expect(arm, '팔이 아예 안 움직인다').toBeGreaterThan(0.5)
    // 정확히 절반은 아니다 — 팔은 상체 비틀림(Spine3)도 함께 물려받는데
    // 헬퍼는 어깨 회전분만 줄이기 때문이다. 그래도 절반 언저리여야 한다
    const ratio = swing('LArmEX') / arm
    expect(ratio, `어깨 헬퍼 비율 ${ratio.toFixed(3)}`).toBeGreaterThan(0.4)
    expect(ratio, `어깨 헬퍼 비율 ${ratio.toFixed(3)}`).toBeLessThan(0.6)

    // 팔꿈치 헬퍼는 팔꿈치 회전분만 줄인다 — 팔에서 물려받은 몫은 그대로 남는다
    const fore = swing('LForeArm')
    expect(fore).toBeGreaterThan(0.5)
    expect(swing('LForeArmEX')).toBeLessThan(fore)
    expect(swing('LForeArmEX')).toBeGreaterThan(0)
  })

  it('정지 상태에서는 위상이 진행하지 않는다', () => {
    const { root } = loadSkeleton()
    const rig = createRig(root, new Object3D())!
    for (let i = 0; i < 30; i++) updateLocomotion(rig, 1 / 60, 0, 4.5, 8)
    expect(rig.phase).toBe(0)
  })

  it('bob은 래퍼에만 걸린다 — 스킨 바인드를 건드리지 않는다', () => {
    const { root } = loadSkeleton()
    const bob = new Object3D()
    bob.position.y = 0.42
    const rig = createRig(root, bob)!
    for (let i = 0; i < 40; i++) updateLocomotion(rig, 1 / 60, 6, 4.5, 8)
    expect(bob.position.y).toBeLessThanOrEqual(0.42)
    expect(bob.position.y).toBeGreaterThan(0.39)
    resetRig(rig)
    expect(bob.position.y).toBe(0.42)
  })

  it('되돌리면 바인드 포즈 그대로다', () => {
    const { root, nodes } = loadSkeleton()
    const rig = createRig(root, new Object3D())!
    const before = nodes.get('LThigh')!.quaternion.clone()
    for (let i = 0; i < 20; i++) updateLocomotion(rig, 1 / 60, 5, 4.5, 8)
    expect(nodes.get('LThigh')!.quaternion.angleTo(before)).toBeGreaterThan(0.01)
    resetRig(rig)
    expect(nodes.get('LThigh')!.quaternion.angleTo(before)).toBeCloseTo(0, 10)
  })
})
