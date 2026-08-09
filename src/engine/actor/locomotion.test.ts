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
import { Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { createRig, resetRig, updateLocomotion } from './locomotion'
import { BIKE, pedalPoint } from './bike'
import { BDSP_TO_WORLD, PLAYER_HEIGHT } from '../model/normalize'

interface GlbNode {
  name?: string
  children?: number[]
  translation?: [number, number, number]
  rotation?: [number, number, number, number]
  scale?: [number, number, number]
}

const GLB = resolve(__dirname, '../../../public/models/dawn.glb')

/** glb의 JSON 청크와 BIN 청크 */
function chunks() {
  const buf = readFileSync(GLB)
  const jsonLen = buf.readUInt32LE(12)
  const binOff = 20 + jsonLen
  return {
    json: JSON.parse(buf.toString('utf8', 20, 20 + jsonLen)),
    bin: buf.subarray(binOff + 8, binOff + 8 + buf.readUInt32LE(binOff)),
  }
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

/**
 * 몸통 실루엣과 팔 굵기를 **메시에서 직접 잰다**.
 *
 * 팔을 얼마나 내릴지는 눈으로 정할 수 없다 — 덜 내리면 날개처럼 벌어지고 더 내리면
 * 옆구리를 파고든다. 둘 다 한 번씩 겪었다. 기준은 몸통 폭이고, 그건 모델이 안다.
 *
 * 바인드 포즈에서는 스키닝 행렬이 `본의 월드 × 역바인드`라 정점의 월드 위치를 그대로
 * 준다. 정점을 지배 본으로 갈라서 몸통/팔로 나눈다.
 */
function bodyProfile() {
  const { json: g, bin } = chunks()
  const CT: Record<number, [string, number]> = {
    5121: ['UInt8', 1], 5123: ['UInt16', 2], 5125: ['UInt32', 4], 5126: ['Float', 4],
  }
  const NC: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
  const read = (ai: number) => {
    const a = g.accessors[ai]
    const [ty, sz] = CT[a.componentType]!
    const n = NC[a.type]!
    const v = g.bufferViews[a.bufferView]
    const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const stride = v.byteStride || sz * n
    const fn = (sz === 1 ? `read${ty}` : `read${ty}LE`) as 'readFloatLE'
    const out: number[][] = []
    for (let k = 0; k < a.count; k++) {
      const o = base + k * stride
      const row: number[] = []
      for (let c = 0; c < n; c++) row.push(bin[fn](o + c * sz))
      out.push(row)
    }
    return out
  }

  const objs: Object3D[] = []
  const build = (i: number): Object3D => {
    const n = g.nodes[i] as GlbNode
    const o = new Object3D()
    if (n.translation) o.position.fromArray(n.translation)
    if (n.rotation) o.quaternion.fromArray(n.rotation)
    if (n.scale) o.scale.fromArray(n.scale)
    objs[i] = o
    for (const c of n.children ?? []) o.add(build(c))
    return o
  }
  const root = new Object3D()
  for (const i of g.scenes[0].nodes as number[]) root.add(build(i))
  root.updateMatrixWorld(true)

  const skin = g.skins[0]
  const ibm = read(skin.inverseBindMatrices)
  const names: string[] = skin.joints.map((i: number) => g.nodes[i].name)
  const bindMat = (skin.joints as number[]).map((ni, k) =>
    objs[ni]!.matrixWorld.clone().multiply(new Matrix4().fromArray(ibm[k]!)))

  const TORSO = new Set(['Waist', 'Spine1', 'Spine2', 'Spine3', 'Hips'])
  const ARM = new Set(['LArm', 'LArmEX', 'LForeArm', 'LForeArmEX'])
  const torso: Vector3[] = []
  const arm: Vector3[] = []
  for (const m of g.meshes) for (const p of m.primitives) {
    if (p.attributes.JOINTS_0 === undefined) continue
    const pos = read(p.attributes.POSITION)
    const jt = read(p.attributes.JOINTS_0)
    const wt = read(p.attributes.WEIGHTS_0)
    for (let k = 0; k < pos.length; k++) {
      let best = 0, bi = 0
      for (let c = 0; c < 4; c++) if (wt[k]![c]! > best) { best = wt[k]![c]!; bi = jt[k]![c]! }
      const nm = names[bi]!
      if (!TORSO.has(nm) && !ARM.has(nm)) continue
      const v = new Vector3().fromArray(pos[k]!).applyMatrix4(bindMat[bi]!)
      ;(TORSO.has(nm) ? torso : arm).push(v)
    }
  }

  // 팔 반지름: 바인드는 T포즈라 팔이 어깨 높이의 수평선이다. 그 축에서의 수직거리
  const sh = objs[skin.joints[names.indexOf('LArm')]!]!.matrixWorld
  const shoulder = new Vector3().setFromMatrixPosition(sh)
  const radii = arm
    .filter((p) => p.x > 0.20 && p.x < 0.70)
    .map((p) => Math.hypot(p.y - shoulder.y, p.z - shoulder.z))
    .sort((a, b) => a - b)

  return {
    armRadius: radii[Math.floor(radii.length * 0.75)]!,
    /** 팔이 있는 자리(높이·깊이)의 몸통 반폭 */
    halfWidth(y: number, z: number) {
      const near = torso.filter((p) => Math.abs(p.y - y) < 0.08 && Math.abs(p.z - z) < 0.10)
      return near.length ? Math.max(...near.map((p) => Math.abs(p.x))) : 0
    },
  }
}

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

  it('달릴수록 상체가 앞으로 기운다 — 뒤로 젖혀지면 부호가 틀린 것이다', () => {
    // 척추는 위로 뻗어 있어서 같은 월드 회전에 팔다리와 반대로 기운다.
    // 그래서 여기는 **머리의 월드 위치**로 잰다 — 본 축을 가정하지 않는 유일한 방법이다
    const headZ = (speed: number) => {
      const { root, nodes } = loadSkeleton()
      const rig = createRig(root, new Object3D())!
      const head = new Vector3(), hips = new Vector3()
      let sum = 0
      // 한 사이클 이상 돌려 앞뒤 스윙을 평균으로 지운다
      for (let i = 0; i < 400; i++) {
        updateLocomotion(rig, 1 / 400, speed, 4.5, 8)
        root.updateMatrixWorld(true)
        nodes.get('Head')!.getWorldPosition(head)
        nodes.get('Hips')!.getWorldPosition(hips)
        sum += head.z - hips.z
      }
      return sum / 400
    }
    const stand = headZ(0), walk = headZ(4.5), run = headZ(8)
    expect(walk, `걷기 ${walk.toFixed(4)} vs 정지 ${stand.toFixed(4)}`).toBeGreaterThan(stand)
    expect(run, `달리기 ${run.toFixed(4)} vs 걷기 ${walk.toFixed(4)}`).toBeGreaterThan(walk)
    expect(run - stand).toBeGreaterThan(0.05)
  })

  it('팔이 같은 쪽 다리와 반대로 흔들린다 — 월드 위치로 확인한다', () => {
    // gait.test.ts는 각도 부호만 본다. 축을 잘못 걸면 각도는 맞는데 실제로는
    // 같이 흔들릴 수 있으므로 여기서 손과 발의 실제 위치로 확인한다
    const { root, nodes } = loadSkeleton()
    const rig = createRig(root, new Object3D())!
    const hand = new Vector3(), toe = new Vector3(), hips = new Vector3()
    const at = (target: number) => {
      resetRig(rig)
      rig.phase = 0
      while (rig.phase < target) updateLocomotion(rig, 1 / 2000, 8, 4.5, 8)
      root.updateMatrixWorld(true)
      nodes.get('LHand')!.getWorldPosition(hand)
      nodes.get('LToe')!.getWorldPosition(toe)
      nodes.get('Hips')!.getWorldPosition(hips)
      return { hand: hand.z - hips.z, toe: toe.z - hips.z }
    }
    const front = at(Math.PI / 2) // 왼발이 앞
    const back = at((3 * Math.PI) / 2) // 왼발이 뒤
    expect(front.toe).toBeGreaterThan(back.toe)
    expect(front.hand, `왼발 앞 ${front.hand.toFixed(3)} / 뒤 ${back.hand.toFixed(3)}`)
      .toBeLessThan(back.hand)
  })

  it('팔꿈치가 실제로 접힌다 — 각도만 맞고 축이 틀리면 전완이 비틀릴 뿐이다', () => {
    // ⚠️ 이 테스트가 없어서 팔꿈치가 2.3°만 접힌 채 통과했다. gait이 내놓는 각은
    // 45°였는데 축이 팔과 나란해서 굽힘이 아니라 비틀림이 되고 있었다.
    // 그래서 **뼈 세 개의 실제 위치로 사잇각을 잰다** — 축을 가정할 여지가 없다
    const { root, nodes } = loadSkeleton()
    const rig = createRig(root, new Object3D())!
    const at = (side: 'L' | 'R') => {
      const sh = nodes.get(`${side}Arm`)!.getWorldPosition(new Vector3())
      const el = nodes.get(`${side}ForeArm`)!.getWorldPosition(new Vector3())
      const ha = nodes.get(`${side}Hand`)!.getWorldPosition(new Vector3())
      return { bend: el.clone().sub(sh).angleTo(ha.clone().sub(el)), forward: ha.z - el.z }
    }

    updateLocomotion(rig, 0, 0, 4.5, 8) // 정지 포즈
    root.updateMatrixWorld(true)
    for (const side of ['L', 'R'] as const) {
      const { bend, forward } = at(side)
      expect(bend, `${side} 정지 굽힘 ${(bend * 180 / Math.PI).toFixed(1)}°`).toBeGreaterThan(0.2)
      // 팔꿈치는 무릎과 반대로 **앞으로** 접힌다. 손이 팔꿈치보다 뒤면 부호가 틀렸다
      expect(forward, `${side} 손이 팔꿈치보다 ${forward > 0 ? '앞' : '뒤'}`).toBeGreaterThan(0)
    }
    // 좌우가 거울이라 굽힘량이 같아야 한다 — 한쪽만 축을 틀리면 여기서 갈라진다
    expect(at('L').bend).toBeCloseTo(at('R').bend, 4)

    let maxBend = 0
    for (let i = 0; i < 240; i++) {
      updateLocomotion(rig, 1 / 120, 8, 4.5, 8)
      root.updateMatrixWorld(true)
      maxBend = Math.max(maxBend, at('L').bend)
    }
    expect(maxBend, `달리기 최대 굽힘 ${(maxBend * 180 / Math.PI).toFixed(1)}°`)
      .toBeGreaterThan(Math.PI * 0.4)
  })

  it('달릴 때 팔이 몸 앞·옆으로 벌어지지 않는다 — 팔꿈치를 뒤로 당겨 친다', () => {
    // 굽힘 축이 팔에 고정된 경첩이 아니면 전완이 옆으로 벌어지고, 스윙 중심이
    // 앞에 있으면 팔꿈치가 앞에 머무른다. 둘 다 손의 실제 위치로만 잡힌다
    const { root, nodes } = loadSkeleton()
    const rig = createRig(root, new Object3D())!
    const w = (n: string) => nodes.get(n)!.getWorldPosition(new Vector3())
    let handOut = -Infinity, elbowFront = -Infinity, elbowBack = Infinity
    for (let i = 0; i < 480; i++) {
      updateLocomotion(rig, 1 / 240, 8, 4.5, 8)
      root.updateMatrixWorld(true)
      const sh = w('LArm'), el = w('LForeArm'), ha = w('LHand')
      handOut = Math.max(handOut, ha.x - sh.x)
      elbowFront = Math.max(elbowFront, el.z - sh.z)
      elbowBack = Math.min(elbowBack, el.z - sh.z)
    }
    // 상완 길이가 0.336이다. 손이 어깨선 바깥으로 그 절반 넘게 나가면 날개처럼 보인다
    expect(handOut, `손이 어깨선 바깥으로 ${handOut.toFixed(3)}`).toBeLessThan(0.17)
    // 팔꿈치는 어깨보다 앞으로 거의 안 나가고 뒤로는 크게 간다
    expect(elbowFront, `팔꿈치 최대 전방 ${elbowFront.toFixed(3)}`).toBeLessThan(0.10)
    expect(-elbowBack, `전방 ${elbowFront.toFixed(3)} 후방 ${(-elbowBack).toFixed(3)}`)
      .toBeGreaterThan(elbowFront * 2)
  })

  it('팔이 몸통을 파고들지도, 몸통에서 뜨지도 않는다', () => {
    // 팔 내림(armDrop)의 유일한 근거다. 덜 내리면 날개처럼 벌어지고 더 내리면
    // 옆구리를 파고든다 — 양쪽 다 실제로 한 번씩 나왔다.
    //
    // 기준은 모델이 안다: **팔꿈치가 몸통 표면에서 얼마나 떨어져 있나를 팔 반지름으로
    // 잰다.** 1이면 팔 겉면이 몸에 닿은 상태다. 절대 좌표 대신 이 비로 보면 모델이
    // 바뀌어도 뜻이 그대로 남는다
    const body = bodyProfile()
    const { root, nodes } = loadSkeleton()
    const rig = createRig(root, new Object3D())!

    const gap = (speed: number, frames: number) => {
      let min = Infinity
      let worst = ''
      for (let i = 0; i < frames; i++) {
        updateLocomotion(rig, 1 / 240, speed, 4.5, 8)
        root.updateMatrixWorld(true)
        const p = nodes.get('LForeArm')!.getWorldPosition(new Vector3())
        const half = body.halfWidth(p.y, p.z)
        const ratio = (p.x - half) / body.armRadius
        if (ratio < min) {
          min = ratio
          worst = `팔꿈치 x ${p.x.toFixed(3)} 몸통반폭 ${half.toFixed(3)}`
        }
      }
      return { min, worst }
    }

    const idle = gap(0, 2)
    expect(idle.min, `정지 ${idle.min.toFixed(2)}배 — 옆구리를 파고든다 (${idle.worst})`)
      .toBeGreaterThan(0.6)
    expect(idle.min, `정지 ${idle.min.toFixed(2)}배 — 날개처럼 벌어졌다 (${idle.worst})`)
      .toBeLessThan(1.4)

    // 스윙 중에도 파고들지 않는다. 벌어지는 쪽은 팔을 흔들면 당연히 커지므로 안 본다
    for (const speed of [4.5, 8]) {
      const { min, worst } = gap(speed, 480)
      expect(min, `speed ${speed} 최소 ${min.toFixed(2)}배 (${worst})`).toBeGreaterThan(0.5)
    }
  })

  it('쇄골이 어깨 동작의 일부를 나눠 진다 — 팔 하나에 몰면 삼각근이 파인다', () => {
    // ⚠️ 처음엔 월드 회전량의 비로 쟀는데, 쇄골은 가슴(Spine3)의 회전도 그대로
    // 물려받으므로 쇄골 몫을 0으로 만들어도 그 값이 남아 변이가 안 잡혔다.
    // **부모 기준 상대 회전**으로 재야 그 관절 자신이 얼마나 돌았는지가 나온다
    const { root, nodes } = loadSkeleton()
    const w = (n: string) => nodes.get(n)!.getWorldQuaternion(new Quaternion())
    const relative = (parent: string, child: string) =>
      w(parent).invert().multiply(w(child))

    const rig = createRig(root, new Object3D())!
    // 리그를 만든 직후가 바인드다. 상대 회전을 먼저 잡아 둔다
    const bindShoulder = relative('Spine3', 'LShoulder')
    const bindArm = relative('LShoulder', 'LArm')

    for (let i = 0; i < 40; i++) updateLocomotion(rig, 1 / 120, 4.5, 4.5, 8)
    root.updateMatrixWorld(true)

    const clavicle = bindShoulder.angleTo(relative('Spine3', 'LShoulder'))
    const shoulder = bindArm.angleTo(relative('LShoulder', 'LArm'))
    const share = clavicle / (clavicle + shoulder)
    expect(share, `쇄골 몫 ${share.toFixed(3)}`).toBeGreaterThan(0.08)
    expect(share, `쇄골 몫 ${share.toFixed(3)}`).toBeLessThan(0.30)
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

/**
 * 자전거 자세는 **닿았는가**로 잰다 (DATA.md §4.2.1).
 *
 * 각도를 눈으로 맞출 수가 없다 — 안장·페달·손잡이 자리는 번들이 정한 값이고
 * 팔다리 길이는 우리 모델이 정한 값이라, 맞았는지 아닌지는 "발이 페달 위에
 * 있는가"로만 답할 수 있다.
 *
 * ⚠️ **정규화한 리그로 재야 한다.** `dawn.glb`는 원본이 2.5095유닛이고 화면에
 * 서는 것은 1.5m로 줄인 것이다 — 안 줄이고 재면 다리가 자전거보다 커서 어떤
 * 각도로도 페달에 못 닿는다.
 */
function seated(speed: number, ticks: number) {
  const { root, nodes } = loadSkeleton()
  const group = new Object3D()
  const wrapper = new Object3D()
  // `normalizeModel`이 하는 일과 같다. 원본 키는 §4.3의 실측값이다
  wrapper.scale.setScalar(PLAYER_HEIGHT / 2.5095)
  group.add(wrapper)
  wrapper.add(root)
  const rig = createRig(root, wrapper)!
  for (let i = 0; i < ticks; i++) updateLocomotion(rig, 1 / 60, speed, 4.5, 8, null, true)
  group.updateMatrixWorld(true)
  const at = (name: string): Vector3 =>
    group.worldToLocal(nodes.get(name)!.getWorldPosition(new Vector3()))
  return { rig, at, nodes, group }
}

const bikePoint = (p: { x: number, y: number, z: number }): Vector3 =>
  new Vector3(p.x, p.y, p.z).multiplyScalar(BDSP_TO_WORLD)

describe('자전거 자세', () => {
  it('골반이 안장에 앉는다', () => {
    const { at } = seated(0, 1)
    const hips = at('LThigh')
    const seat = bikePoint({ x: 0, y: BIKE.saddle.y, z: BIKE.saddle.z })
    expect(Math.abs(hips.y - seat.y)).toBeLessThan(0.02)
    expect(Math.abs(hips.z - seat.z)).toBeLessThan(0.02)
  })

  it('두 발이 페달에서 안 떨어진다 — 한 바퀴 내내', () => {
    let worst = 0
    for (let k = 0; k < 12; k++) {
      const { rig, at } = seated(4, 0)
      rig.phase = (k / 12) * Math.PI * 2
      updateLocomotion(rig, 0, 0, 4.5, 8, null, true)
      rig.bobTarget.parent!.updateMatrixWorld(true)
      for (const [bone, side] of [['LFoot', 1], ['RFoot', -1]] as const) {
        const want = bikePoint(pedalPoint(rig.phase, side))
        // 앞뒤·위아래만 본다. 좌우는 페달 폭(9.5cm)이라 다리가 벌어질 수 없다
        const got = at(bone)
        worst = Math.max(worst, Math.hypot(got.y - want.y, got.z - want.z))
      }
    }
    // 발목에서 발바닥까지가 남으므로 0은 될 수 없다. 5cm면 페달 위다
    expect(worst).toBeLessThan(0.05)
  })

  it('두 손이 손잡이를 잡는다', () => {
    const { at } = seated(4, 1)
    const grip = bikePoint(BIKE.grip)
    for (const [bone, side] of [['LHand', 1], ['RHand', -1]] as const) {
      const got = at(bone)
      const d = Math.hypot(got.x - side * grip.x, got.y - grip.y, got.z - grip.z)
      expect(d).toBeLessThan(0.005)
    }
  })

  it('페달은 바퀴가 구른 만큼만 돈다 — 굴러가지 않으면 안 돈다', () => {
    const { rig } = seated(0, 60)
    expect(rig.phase).toBe(0)
    const moving = seated(4, 60)
    // 1초에 4m, 바퀴 반지름 0.254m → 15.7rad ≈ 2.5바퀴
    expect(moving.rig.phase).toBeGreaterThan(0)
  })

  it('내리면 걷기로 돌아온다 — 몸이 안장에 남지 않는다', () => {
    const { rig } = seated(4, 30)
    const seatDrop = rig.bobTarget.position.y
    for (let i = 0; i < 30; i++) updateLocomotion(rig, 1 / 60, 4, 4.5, 8)
    expect(rig.bobTarget.position.y).toBeGreaterThan(seatDrop + 0.1)
    expect(rig.bobTarget.position.z).toBe(rig.bobBaseZ)
  })
})
