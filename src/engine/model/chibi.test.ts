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
import { CHIBI_HAND, CHIBI_HEAD, isChibi, shapeChibi } from './chibi'

/** 발밑 0 · 목 1 · 머리끝 2인 사람 하나. 머리는 목 관절을 원점으로 줄어든다 */
const NATIVE = 2

function rig() {
  const hips = new Bone(); hips.name = 'Hips'
  const neck = new Bone(); neck.name = 'Neck'; neck.position.y = 1
  const head = new Bone(); head.name = 'Head'
  // ⚠️ 머리뼈의 로컬 X가 월드 +Y다 — 번들에서 잰 규칙이다
  head.rotation.z = Math.PI / 2
  const hand = new Bone(); hand.name = 'LHand'; hand.position.set(0.4, 0.5, 0)
  const finger = new Bone(); finger.name = 'LFingerA1'; finger.position.x = 0.05
  const held = new Bone(); held.name = 'Tray'; held.position.x = 0.06
  hips.add(neck); neck.add(head); hips.add(hand); hand.add(finger); hand.add(held)

  const pos = [
    0.15, 0, 0.15, -0.15, 1, -0.15,        // 몸 — Hips
    0.25, 1, 0.25, -0.25, NATIVE, -0.25,   // 머리 — Head
    0.45, 0.55, 0.05, 0.35, 0.45, -0.05,   // 손 — LHand
  ]
  const bones = [hips, neck, head, hand, finger, held]
  const idx = [0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0]
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
  return { inner, body, head, hand, finger, held }
}

/** 목표 키 — 아무 값이나 되지만 1이 아니어야 배율이 드러난다 */
const H = 1.5

describe('shapeChibi', () => {
  it('치비 번들만 고른다', () => {
    expect(isChibi('fc2005_00')).toBe(true)
    expect(isChibi('fc2033_01')).toBe(true)
    expect(isChibi('tr1006_00')).toBe(false)
    expect(isChibi('pc0001_00')).toBe(false)
  })

  it('머리를 줄여도 목표 키로 선다', () => {
    const { inner, body } = rig()
    expect(measure(inner, body)).toBeCloseTo(NATIVE, 4)
    shapeChibi(inner, body, NATIVE, H)
    expect(measure(inner, body)).toBeCloseTo(H, 4)
  })

  it('⚠️ 굵기는 머리를 안 줄였을 때와 같다 — 늘림이 키에만 간다', () => {
    // 머리를 줄이면 키가 줄고 정규화가 몸을 통째로 키운다. 그 늘림을 굵기에
    // 그대로 두면 「몸이 주인공보다 굵다」가 된다
    const { inner, body } = rig()
    shapeChibi(inner, body, NATIVE, H)
    expect(inner.scale.x).toBeCloseTo(H / NATIVE, 6)
    expect(inner.scale.z).toBeCloseTo(inner.scale.x, 6)
    expect(inner.scale.y).toBeGreaterThan(inner.scale.x * 1.5)
  })

  it('머리는 눌린 만큼 도로 편다 — 세로 배율과 가로 배율이 같다', () => {
    const { inner, body, head } = rig()
    shapeChibi(inner, body, NATIVE, H)
    expect(head.scale.x).toBeCloseTo(CHIBI_HEAD, 6)
    expect(head.scale.x * inner.scale.y).toBeCloseTo(head.scale.y * inner.scale.x, 6)
    expect(head.scale.y).toBeCloseTo(head.scale.z, 6)
  })

  it('손은 줄이고 손가락은 따라간다', () => {
    const { inner, body, hand, finger } = rig()
    shapeChibi(inner, body, NATIVE, H)
    expect(hand.scale.x).toBeCloseTo(CHIBI_HAND, 6)
    // 손가락은 손의 자식이라 제 배율은 1이어야 한다 — 건드리면 두 번 줄어든다
    expect(finger.scale.x).toBeCloseTo(1, 6)
  })

  it('⚠️ 손에 든 물건은 안 줄어든다 (웨이트리스의 쟁반·아이돌의 마이크)', () => {
    const { inner, body, held } = rig()
    shapeChibi(inner, body, NATIVE, H)
    inner.updateMatrixWorld(true)
    // 손뼈의 배율을 되돌려서, 월드에서는 몸통과 같은 굵기 배율로 남는다
    const world = held.getWorldScale(new Vector3())
    expect(world.x).toBeCloseTo(inner.scale.x, 6)
    expect(world.z).toBeCloseTo(inner.scale.z, 6)
  })

  it('두 번 불러도 같은 값이다 — 앞 결과가 쌓이지 않는다', () => {
    const { inner, body, head, hand, held } = rig()
    shapeChibi(inner, body, NATIVE, H)
    const first = { girth: inner.scale.x, tall: inner.scale.y, head: head.scale.y }
    shapeChibi(inner, body, NATIVE, H)
    expect(inner.scale.x).toBeCloseTo(first.girth, 6)
    expect(inner.scale.y).toBeCloseTo(first.tall, 6)
    expect(head.scale.y).toBeCloseTo(first.head, 6)
    expect(hand.scale.x).toBeCloseTo(CHIBI_HAND, 6)
    expect(held.scale.x).toBeCloseTo(1 / CHIBI_HAND, 6)
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
