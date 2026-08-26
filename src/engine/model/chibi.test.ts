// 치비 보정 — **머리를 줄여도 몸이 굵어지지 않고, 손에 든 물건은 안 줄어드는가.**
//
// 실제 번들 대신 BDSP와 같은 규칙의 뼈대를 하나 세워서 잰다:
//   · 머리뼈의 로컬 X가 월드 +Y를 본다 (그래서 `scale.x`가 키를 누른다)
//   · 손뼈 아래에 손가락뼈와 **든 물건**이 나란히 달린다
//     (웨이트리스 `fc1026_00`의 `Tray`, 아이돌 `fc1085_00`의 `Mike`가 그렇다)
import {
  Bone, BufferGeometry, Float32BufferAttribute, Group, Skeleton, SkinnedMesh,
  Uint16BufferAttribute, Vector3,
} from 'three'
import { describe, expect, it } from 'vitest'
import { CHIBI_GROW, CHIBI_HAND, CHIBI_HEAD, isChibi, shapeChibi } from './chibi'

/** 발밑 0 · 목 1 · 머리끝 2인 사람 하나. 머리는 목 관절을 원점으로 줄어든다 */
const NATIVE = 2

function rig() {
  const hips = new Bone(); hips.name = 'Hips'
  const neck = new Bone(); neck.name = 'Neck'; neck.position.y = 1
  const head = new Bone(); head.name = 'Head'
  // ⚠️ 머리뼈의 로컬 X가 월드 +Y다 — 번들에서 잰 규칙이다
  head.rotation.z = Math.PI / 2
  // 팔 사슬 — 어깨에서 가로로 뻗는다. 굵기 누름이 여기서 길이를 가져간다
  const arm = new Bone(); arm.name = 'LArm'; arm.position.set(0.15, 0.9, 0)
  const fore = new Bone(); fore.name = 'LForeArm'; fore.position.set(0.15, 0, 0)
  // ⚠️ 팔은 **가로로** 뻗어야 한다 — 실제 리그가 그렇고, 세로로 뻗게 두면
  // 마디를 늘였을 때 손이 발밑으로 내려가 상자 높이가 달라진다
  const hand = new Bone(); hand.name = 'LHand'; hand.position.set(0.12, 0, 0)
  const finger = new Bone(); finger.name = 'LFingerA1'; finger.position.x = 0.05
  const held = new Bone(); held.name = 'Tray'; held.position.x = 0.06
  hips.add(neck); neck.add(head)
  hips.add(arm); arm.add(fore); fore.add(hand); hand.add(finger); hand.add(held)

  const pos = [
    0.15, 0, 0.15, -0.15, 1, -0.15,        // 몸 — Hips
    0.25, 1, 0.25, -0.25, NATIVE, -0.25,   // 머리 — Head
    0.45, 0.55, 0.05, 0.35, 0.45, -0.05,   // 손 — LHand
  ]
  const bones = [hips, neck, head, arm, fore, hand, finger, held]
  // 정점 여섯: 몸 둘(Hips=0) · 머리 둘(Head=2) · 손 둘(LHand=5)
  const idx = [0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0]
  const w = [1, 0, 0, 0]
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4))
  geo.setAttribute('skinWeight', new Float32BufferAttribute([...w, ...w, ...w, ...w, ...w, ...w], 4))

  const mesh = new SkinnedMesh(geo)
  mesh.add(hips)
  const body = new Group()
  body.add(mesh)
  const inner = new Group()
  inner.add(body)
  inner.updateMatrixWorld(true)
  mesh.bind(new Skeleton(bones))
  return { inner, body, head, arm, fore, hand, finger, held }
}


describe('shapeChibi', () => {
  it('치비 번들만 고른다', () => {
    expect(isChibi('fc2005_00')).toBe(true)
    expect(isChibi('fc2033_01')).toBe(true)
    expect(isChibi('tr1006_00')).toBe(false)
    expect(isChibi('pc0001_00')).toBe(false)
  })

  // ⚠️ **키를 부르는 쪽이 안 정한다.** 상자 높이는 머리카락이 절반을 넘게
  // 차지해서 키로 못 쓴다 — 쪽찐 할머니가 제일 큰 사람이 됐다 (`CHIBI_GROW`)
  it('머리를 줄인 뒤의 키에 상수를 곱해 선다', () => {
    const { inner, body } = rig()
    expect(measure(inner, body)).toBeCloseTo(NATIVE, 4)
    const stood = shapeChibi(inner, body, NATIVE)
    // 머리를 줄이고 잰 키 × CHIBI_GROW. 돌려준 값과 실제로 선 키가 같아야 한다
    expect(measure(inner, body)).toBeCloseTo(stood, 4)
    expect(stood).toBeGreaterThan(NATIVE)
  })

  it('⚠️ 굵기는 원본보다 가늘다 — 늘림이 키에만 가고 거기서 더 눌린다', () => {
    // 머리를 줄이면 키가 줄고 정규화가 몸을 통째로 키운다. 그 늘림을 굵기에
    // 그대로 두면 「몸이 주인공보다 굵다」가 된다
    const { inner, body } = rig()
    shapeChibi(inner, body, NATIVE)
    expect(inner.scale.z).toBeCloseTo(inner.scale.x, 6)
    expect(inner.scale.y).toBeGreaterThan(inner.scale.x * 1.5)
  })

  // ⚠️ **가로로 뻗은 것은 굵기 누름을 맞는다.** 다리는 세로라 키 늘림을 받는데
  // 팔은 T자세에서 누워 있어 짧아진다 — 실측으로 어깨~손이 키의 30.0%여야
  // 하는데 20.0%였다 (`.audit/armSpan.mjs`)
  it('팔 마디를 늘여 굵기 누름이 가져간 길이를 되돌린다', () => {
    const { inner, body, arm, fore, hand } = rig()
    const was = { arm: arm.position.clone(), fore: fore.position.x, hand: hand.position.x }
    shapeChibi(inner, body, NATIVE)
    const reach = inner.scale.y / inner.scale.x
    expect(reach).toBeGreaterThan(1.5)
    // ⚠️ **어깨 관절 자리는 그대로다** — 그것까지 늘이면 어깨가 밀려 올라간다
    expect(arm.position.x).toBeCloseTo(was.arm.x, 6)
    expect(arm.position.y).toBeCloseTo(was.arm.y, 6)
    // 늘어나는 것은 위팔 길이와 아래팔 길이다
    expect(fore.position.x).toBeCloseTo(was.fore * reach, 6)
    expect(hand.position.x).toBeCloseTo(was.hand * reach, 6)
  })

  // ⚠️ **길이만 늘이면 소매가 굵은 채로 남는다.** 가로로 누운 팔은 단면이
  // 세로·앞뒤라 세로 쪽이 키 늘림을 그대로 맞는다 — 실측으로 소매 세로가 키의
  // 13.2%였다(등신 5.6~7.2%). 팔뼈 로컬 Y를 눌러 월드에서 둥글게 만든다
  it('팔 단면을 되돌린다 — 소매가 세로로 늘어나지 않는다', () => {
    const { inner, body, arm, fore } = rig()
    shapeChibi(inner, body, NATIVE)
    inner.updateMatrixWorld(true)
    const world = arm.getWorldScale(new Vector3())
    expect(world.y).toBeCloseTo(world.x, 6)
    expect(world.z).toBeCloseTo(world.x, 6)
    expect(world.x).toBeCloseTo(inner.scale.x, 6)
    // 아래팔은 자식이라 물려받는다 — 마디마다 걸면 제곱으로 눌린다
    expect(fore.scale.y).toBeCloseTo(1, 6)
    const below = fore.getWorldScale(new Vector3())
    expect(below.y).toBeCloseTo(below.x, 6)
  })

  // ⚠️ **손에서 멈춘다.** 손가락까지 늘이면 `CHIBI_HAND`로 줄어든 손 안에서
  // 도로 길어져 거미손이 된다
  it('손가락 마디는 안 늘인다', () => {
    const { inner, body, finger, held } = rig()
    const was = { finger: finger.position.x, held: held.position.x }
    shapeChibi(inner, body, NATIVE)
    expect(finger.position.x).toBeCloseTo(was.finger, 6)
    expect(held.position.x).toBeCloseTo(was.held, 6)
  })

  it('머리는 눌린 만큼 도로 편다 — 세로 배율과 가로 배율이 같다', () => {
    const { inner, body, head } = rig()
    shapeChibi(inner, body, NATIVE)
    expect(head.scale.x).toBeCloseTo(CHIBI_HEAD, 6)
    expect(head.scale.x * inner.scale.y).toBeCloseTo(head.scale.y * inner.scale.x, 6)
    expect(head.scale.y).toBeCloseTo(head.scale.z, 6)
  })

  it('손은 줄이고 손가락은 따라간다', () => {
    const { inner, body, hand, finger } = rig()
    shapeChibi(inner, body, NATIVE)
    expect(hand.scale.x).toBeCloseTo(CHIBI_HAND, 6)
    // 손가락은 손의 자식이라 제 배율은 1이어야 한다 — 건드리면 두 번 줄어든다
    expect(finger.scale.x).toBeCloseTo(1, 6)
  })

  it('⚠️ 손에 든 물건은 안 줄어든다 (웨이트리스의 쟁반·아이돌의 마이크)', () => {
    const { inner, body, held } = rig()
    shapeChibi(inner, body, NATIVE)
    inner.updateMatrixWorld(true)
    // 손뼈의 배율을 되돌려서, 월드에서는 몸통과 같은 굵기 배율로 남는다
    const world = held.getWorldScale(new Vector3())
    expect(world.x).toBeCloseTo(inner.scale.x, 6)
    expect(world.z).toBeCloseTo(inner.scale.z, 6)
  })

  it('두 번 불러도 같은 값이다 — 앞 결과가 쌓이지 않는다', () => {
    const { inner, body, head, hand, held, arm, fore } = rig()
    const stood = shapeChibi(inner, body, NATIVE)
    const first = { girth: inner.scale.x, tall: inner.scale.y, head: head.scale.y }
    expect(shapeChibi(inner, body, NATIVE)).toBeCloseTo(stood, 6)
    expect(inner.scale.x).toBeCloseTo(first.girth, 6)
    expect(inner.scale.y).toBeCloseTo(first.tall, 6)
    expect(head.scale.y).toBeCloseTo(first.head, 6)
    expect(hand.scale.x).toBeCloseTo(CHIBI_HAND, 6)
    expect(held.scale.x).toBeCloseTo(1 / CHIBI_HAND, 6)
    // ⚠️ **마디 늘이기가 제일 쌓이기 쉽다** — 배율과 달리 덮어쓰는 것이 아니라
    // 곱하는 것이라, 안 막으면 두 번째에 팔이 두 배로 길어진다
    const reach = inner.scale.y / inner.scale.x
    expect(arm.position.x).toBeCloseTo(0.15, 6)
    expect(fore.position.x).toBeCloseTo(0.15 * reach, 6)
  })

  it('상수가 정한 자리에 있다', () => {
    expect(CHIBI_HEAD).toBeGreaterThan(0.2)
    expect(CHIBI_GROW).toBeGreaterThan(1.5)
  })
})

/**
 * 지금 서 있는 키. **스킨을 먹인 자리**로 잰다 — 뼈 배율은 정점을 통해서만
 * 드러나므로 지오메트리 상자를 그냥 뜨면 머리를 줄여도 값이 안 변한다
 */
function measure(inner: Group, body: Group): number {
  inner.updateMatrixWorld(true)
  let lo = Infinity, hi = -Infinity
  const v = new Vector3()
  body.traverse((o) => {
    const mesh = o as SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    const count = mesh.geometry.getAttribute('position').count
    for (let i = 0; i < count; i += 1) {
      mesh.getVertexPosition(i, v)
      v.applyMatrix4(mesh.matrixWorld)
      if (v.y < lo) lo = v.y
      if (v.y > hi) hi = v.y
    }
  })
  return hi - lo
}
