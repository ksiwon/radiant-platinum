// 절차적 보행을 스켈레톤에 바른다 (PLAN §4.3)
//
// gait.ts가 "어떤 각도인가"를 정하고, 여기는 "그 각도를 어느 축에 거는가"를 정한다.
//
// **본 로컬 축을 하드코딩하지 않는다.** 리그마다 본의 로컬 좌표계가 제각각이다 —
// dawn.glb만 해도 본이 로컬 +X를 따라 뻗고 Hips가 180° 돌아 있다. "무릎은 X축"
// 식으로 박으면 다른 모델에서 팔이 몸통을 뚫는다.
//
// 대신 **월드 공간에서 회전을 만들고 본의 로컬 공간으로 켤레변환한다**:
//   새 월드 = R_w × 바인드 월드
//   ⇒ 새 로컬 = (부모월드⁻¹ × R_w × 부모월드) × 바인드 로컬
// 부모의 바인드 월드 회전만 알면 되고, 런타임에 부모가 움직인 것은 씬 그래프가
// 알아서 전파한다 — 그래서 무릎은 넓적다리에 대한 경첩으로 정확히 동작한다.
//
// ⚠️ 처음엔 로컬 축을 미리 뽑아 두고 본 회전에 뒤에서 곱했다. 축이 하나일 땐
// 같지만 **두 축을 겹치는 순간 깨진다** — 팔을 내린(roll) 뒤 스윙(pitch)하면
// 스윙 축이 내린 각만큼 함께 돌아가 앞뒤가 아니라 좌우로 흔들린다.
import { Object3D, Quaternion, Vector3 } from 'three'
import { idleBreath, phaseRate, sampleGait } from './gait'

/** 캐릭터는 +Z를 본다. 앞뒤 스윙은 월드 X축, 좌우 벌림은 Z축, 비틀림은 Y축이다 */
const AXIS_PITCH = new Vector3(1, 0, 0)
const AXIS_ROLL = new Vector3(0, 0, 1)
const AXIS_YAW = new Vector3(0, 1, 0)

/** 리그가 성립하려면 있어야 하는 본. 하나라도 없으면 절차적 보행을 포기한다 */
const REQUIRED = [
  'LThigh', 'RThigh', 'LLeg', 'RLeg', 'LFoot', 'RFoot',
  'LArm', 'RArm', 'LForeArm', 'RForeArm', 'Spine1', 'Hips',
] as const

/**
 * 스키닝 보정 헬퍼 본. 부모와 같은 자리에 길이 0으로 붙어 있고 실제로 가중치를
 * 지고 있다 — LArmEX만 해도 어깨 주변 가중치의 41%다(LArm 52.6 vs LArmEX 36.8).
 *
 * 씬 그래프상 부모의 자식이라 어깨 회전을 **100% 그대로** 물려받는데, 원본 리그는
 * 제약으로 절반만 받게 해서 변형을 두 본에 나눈다. 그 제약이 glTF에는 없으므로
 * 여기서 되살린다 — 안 하면 어깨·팔꿈치가 한 본에 몰려 뭉개진다.
 */
const HELPERS: [helper: string, joint: string][] = [
  ['LShoulderEX', 'LShoulder'], ['RShoulderEX', 'RShoulder'],
  ['LArmEX', 'LArm'], ['RArmEX', 'RArm'],
  ['LForeArmEX', 'LForeArm'], ['RForeArmEX', 'RForeArm'],
]

const OPTIONAL = [
  'LToe', 'RToe', 'Spine2', 'Spine3', 'Neck', 'Head',
  'LShoulder', 'RShoulder',
  ...HELPERS.map(([h]) => h),
] as const

interface Joint {
  node: Object3D
  /** 바인드 포즈의 로컬 회전. 모든 각도는 여기서 출발한다 */
  rest: Quaternion
  /** 부모의 바인드 월드 회전과 그 역 — 월드 회전을 로컬로 켤레변환할 때 쓴다 */
  parentQ: Quaternion
  parentInv: Quaternion
}

export interface Rig {
  joints: Record<string, Joint>
  /** bob을 걸 노드. 본이 아니라 정규화 래퍼라 스킨 바인드를 건드리지 않는다 */
  bobTarget: Object3D
  bobBase: number
  phase: number
  elapsed: number
}

const worldRot = new Quaternion()
const step = new Quaternion()
const delta = new Quaternion()
const identity = new Quaternion()
/** 관절별로 이번 프레임에 건 월드 회전. 헬퍼 본이 그 절반을 되돌릴 때 쓴다 */
const applied = new Map<string, Quaternion>()

function makeJoint(node: Object3D): Joint {
  node.updateWorldMatrix(true, false)
  const parentQ = new Quaternion()
  if (node.parent) node.parent.getWorldQuaternion(parentQ)
  return {
    node,
    rest: node.quaternion.clone(),
    parentQ,
    parentInv: parentQ.clone().invert(),
  }
}

/**
 * 스켈레톤에서 리그를 만든다. 필요한 본이 없으면 null —
 * 모델을 갈아 끼웠을 때 조용히 이상한 포즈가 나오는 것보다 아무것도 안 하는 편이 낫다.
 */
export function createRig(root: Object3D, bobTarget: Object3D): Rig | null {
  const found = new Map<string, Object3D>()
  root.updateMatrixWorld(true)
  root.traverse((o) => { if (o.name && !found.has(o.name)) found.set(o.name, o) })

  if (REQUIRED.some((n) => !found.has(n))) return null

  const joints: Record<string, Joint> = {}
  for (const name of [...REQUIRED, ...OPTIONAL]) {
    const node = found.get(name)
    if (node) joints[name] = makeJoint(node)
  }
  return { joints, bobTarget, bobBase: bobTarget.position.y, phase: 0, elapsed: 0 }
}

/** 관절을 바인드 포즈로 되돌린다 */
export function resetRig(rig: Rig) {
  for (const j of Object.values(rig.joints)) j.node.quaternion.copy(j.rest)
  rig.bobTarget.position.y = rig.bobBase
}

/** 월드 회전을 본의 로컬로 켤레변환해 건다. Δ = 부모월드⁻¹ × R_w × 부모월드 */
function applyWorld(j: Joint, rot: Quaternion) {
  delta.copy(j.parentInv).multiply(rot).multiply(j.parentQ)
  j.node.quaternion.copy(delta).multiply(j.rest)
}

/**
 * 월드 축 회전을 본에 건다. roll → yaw → pitch 순서로 합성한다 —
 * 팔은 먼저 옆구리로 내린(roll) 뒤 그 자세에서 앞뒤로 흔들어야(pitch) 하기 때문이다.
 */
function apply(j: Joint | undefined, name: string, pitch: number, roll = 0, yaw = 0) {
  if (!j) return
  worldRot.identity()
  if (roll) worldRot.multiply(step.setFromAxisAngle(AXIS_ROLL, roll))
  if (yaw) worldRot.multiply(step.setFromAxisAngle(AXIS_YAW, yaw))
  if (pitch) worldRot.premultiply(step.setFromAxisAngle(AXIS_PITCH, pitch))
  applyWorld(j, worldRot)
  let slot = applied.get(name)
  if (!slot) { slot = new Quaternion(); applied.set(name, slot) }
  slot.copy(worldRot)
}

/**
 * 헬퍼 본이 관절 회전의 `fraction`만 받게 만든다.
 *
 * 헬퍼는 부모의 회전 R을 그대로 물려받으므로, 자기 로컬에 R⁻¹·slerp(I, R, f)를
 * 걸면 최종 월드 회전이 slerp(I, R, f)가 된다. 축·순서를 손으로 맞추는 대신
 * slerp을 쓰는 이유는 "회전의 절반"이 정확히 그것이기 때문이다.
 */
function applyHelper(rig: Rig, helper: string, joint: string, fraction = 0.5) {
  const j = rig.joints[helper]
  const rot = applied.get(joint)
  if (!j || !rot) return
  worldRot.copy(identity).slerp(rot, fraction)
  worldRot.premultiply(step.copy(rot).invert())
  applyWorld(j, worldRot)
}

/**
 * gait.ts는 "양수가 앞"을 약속한다. 그 규약을 리그 쪽에서 맞춰 준다 —
 * gait이 리그를 몰라야 씬 없이 테스트할 수 있기 때문이다.
 *
 * ⚠️ 부호를 눈으로 유도하지 말 것. 본이 로컬 +X로 뻗고 Hips가 180° 돌아 있는
 * 리그에서는 "월드 X 양의 회전이 아래를 -Z로 보낸다"까지 맞아도 최종 부호가
 * 뒤집힌다.
 *
 * ⚠️⚠️ 이 상수는 한 번 +1로 잘못 박힌 채 테스트를 통과했다. "발은 뜬 채로 앞으로"
 * 테스트가 근거였는데, 발 **높이**를 넓적다리가 아니라 무릎이 지배하기 때문에
 * 그 테스트는 무릎 굽힘이 만든 앞뒤 이동을 넓적다리의 것으로 착각하고 통과했다.
 * 이제 `넓적다리 방향` 테스트가 무릎과 무관하게 이 부호만 직접 못박는다.
 */
const FORWARD = -1

/**
 * 쇄골이 가져가는 어깨 동작의 몫.
 *
 * 사람의 팔은 어깨 관절 하나로 움직이지 않는다 — 팔을 앞으로 내밀면 쇄골이 따라
 * 나오고, 팔을 내리면 어깨가 함께 내려앉는다. 전부 LArm 하나에 걸면 삼각근이
 * 제자리에서 접히면서 어깨가 파인다.
 *
 * 나머지 몫은 LArm이 받는다. 두 본의 월드 회전은 곱해지므로(자식이 부모 회전을
 * 그대로 물려받는다) 같은 축이면 합이 정확히 보존된다 — 팔이 내려오는 총량은
 * 이 값을 바꿔도 변하지 않고, 변형만 두 관절에 나뉜다.
 */
const SHOULDER_SHARE = 0.15

/**
 * @param dt    렌더 델타(초). 시뮬레이션이 아니라 표현이라 렌더 레이트로 돌린다
 * @param speed 현재 수평 속도(m/s)
 * @param walkSpeed / runSpeed  player.ts의 값. 이동/달리기 혼합 비율을 여기서 만든다
 */
export function updateLocomotion(
  rig: Rig, dt: number, speed: number, walkSpeed: number, runSpeed: number,
) {
  rig.elapsed += dt
  // 아주 느린 속도까지 걷게 하면 제자리에서 발을 떠는 것처럼 보인다
  const moving = Math.min(1, speed / (walkSpeed * 0.55))
  const run = Math.max(0, Math.min(1, (speed - walkSpeed) / Math.max(1e-3, runSpeed - walkSpeed)))
  // 보폭이 달리기에서 늘어나므로 run을 먼저 구해야 위상 속도를 정할 수 있다
  rig.phase = (rig.phase + phaseRate(speed, run) * dt) % (Math.PI * 2)

  const g = sampleGait(rig.phase, moving, run)
  const j = rig.joints

  apply(j.LThigh, 'LThigh', FORWARD * g.thighL)
  apply(j.RThigh, 'RThigh', FORWARD * g.thighR)
  // 무릎은 뒤로만 접힌다 — FORWARD를 곱하지 않는다
  apply(j.LLeg, 'LLeg', g.kneeL)
  apply(j.RLeg, 'RLeg', g.kneeR)
  apply(j.LFoot, 'LFoot', FORWARD * g.footL)
  apply(j.RFoot, 'RFoot', FORWARD * g.footR)

  // 팔: T포즈에서 옆구리로 내린 뒤(roll) 그 자세에서 앞뒤로 흔든다(pitch).
  // 좌우가 거울이라 내리는 방향의 부호가 반대다.
  // armForward는 상수 오프셋이라 서 있을 때도 팔이 몸통보다 조금 앞에 온다
  const swingL = FORWARD * (g.armL + g.armForward)
  const swingR = FORWARD * (g.armR + g.armForward)
  const arm = 1 - SHOULDER_SHARE
  apply(j.LShoulder, 'LShoulder', swingL * SHOULDER_SHARE, -g.armDrop * SHOULDER_SHARE)
  apply(j.RShoulder, 'RShoulder', swingR * SHOULDER_SHARE, g.armDrop * SHOULDER_SHARE)
  apply(j.LArm, 'LArm', swingL * arm, -g.armDrop * arm)
  apply(j.RArm, 'RArm', swingR * arm, g.armDrop * arm)
  // 팔꿈치도 뒤로만 접힌다
  apply(j.LForeArm, 'LForeArm', g.forearmL)
  apply(j.RForeArm, 'RForeArm', g.forearmR)

  // 어깨·팔꿈치 변형을 헬퍼 본과 나눈다 (원본 리그의 제약을 되살린 것)
  for (const [helper, joint] of HELPERS) applyHelper(rig, helper, joint)

  // 상체는 팔과 반대로 비틀어 어깨가 따라 돌지 않게 한다
  apply(j.Spine1, 'Spine1', 0, 0, g.torsoYaw * 0.4)
  apply(j.Spine3, 'Spine3', 0, 0, g.torsoYaw * 0.6)
  // 정지 중 호흡. 가슴만 아주 조금 젖힌다
  apply(j.Spine2, 'Spine2', idleBreath(rig.elapsed, moving))
  // 머리는 상체 비틀림을 되받아 정면을 본다
  apply(j.Neck, 'Neck', 0, 0, -g.torsoYaw * 0.5)

  rig.bobTarget.position.y = rig.bobBase + g.bob
}
