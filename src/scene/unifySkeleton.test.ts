import { describe, expect, it } from 'vitest'
import {
  Bone, BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshBasicMaterial,
  Skeleton, SkinnedMesh,
} from 'three'
import { unifySkeletons } from './unifySkeleton'

/**
 * 조각 하나. `bones`가 그 조각이 쓰는 뼈고, `weights`가 각 정점이 가리키는
 * **그 조각 안에서의** 자리다 — 합치고 나면 이 수가 바뀌어야 한다.
 */
function part(bones: Bone[], weights: number[], invScale = 1): SkinnedMesh {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(weights.length * 3), 3))
  g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(weights), 4))
  g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(weights.length), 4))
  const mesh = new SkinnedMesh(g, new MeshBasicMaterial())
  // ⚠️ **bindMatrix를 꼭 넘긴다.** 안 넘기면 three가 `calculateInverses()`로
  // 역행렬을 **다시 계산해서** 여기서 준 값이 통째로 덮인다 — 그러면 「바인드
  // 자세가 어긋난 모델」을 시험에서 아예 만들 수 없다
  mesh.bind(new Skeleton(bones, bones.map(() => new Matrix4().makeScale(invScale, 1, 1))),
    new Matrix4())
  return mesh
}

/** 뼈 n개. 이름을 붙여 둔다 — 어긋남을 알릴 때 이름이 나와야 한다 */
const bones = (n: number, from = 0): Bone[] =>
  Array.from({ length: n }, (_, i) => {
    const b = new Bone()
    b.name = `bone${String(from + i)}`
    return b
  })

const indexOf = (m: SkinnedMesh): number[] =>
  [...(m.geometry.getAttribute('skinIndex').array as Uint16Array)]

describe('unifySkeletons', () => {
  it('조각들이 뼈대 하나를 같이 쓴다', () => {
    const all = bones(5)
    const root = new Group()
    const a = part([all[0]!, all[1]!], [0, 1, 0, 0])
    const b = part([all[2]!, all[3]!, all[4]!], [0, 2, 1, 0])
    root.add(a, b)

    const out = unifySkeletons(root)

    expect(out.skipped).toBeNull()
    expect(out.bones).toBe(5)
    expect(a.skeleton).toBe(b.skeleton)
  })

  it('`skinIndex`를 합친 자리로 고쳐 쓴다', () => {
    // ⚠️ **이걸 안 고치면 조각이 남의 뼈를 따라 움직인다.** 자리 번호는 조각
    // 안에서만 뜻이 있어서, 뼈대를 바꾸면 그 번호도 같이 바뀌어야 한다
    const all = bones(5)
    const root = new Group()
    const a = part([all[0]!, all[1]!], [0, 1, 1, 0])
    const b = part([all[2]!, all[3]!, all[4]!], [0, 1, 2, 0])
    root.add(a, b)

    unifySkeletons(root)

    expect(indexOf(a)).toEqual([0, 1, 1, 0])
    // b의 0·1·2번은 합친 목록에서 2·3·4번이다
    expect(indexOf(b)).toEqual([2, 3, 4, 2])
  })

  it('같은 뼈를 나눠 쓰면 자리를 한 번만 잡는다', () => {
    const all = bones(4)
    const root = new Group()
    const a = part([all[0]!, all[1]!], [0, 1, 0, 0])
    const b = part([all[1]!, all[2]!, all[3]!], [0, 1, 2, 0])
    root.add(a, b)

    const out = unifySkeletons(root)

    // all[1]은 둘 다 쓰지만 목록에는 한 번만 들어간다 — 4가 아니라 4개 그대로다
    expect(out.bones).toBe(4)
    // b의 0번(=all[1])은 이미 1번 자리에 있고, 1·2번이 2·3번으로 간다
    expect(indexOf(b)).toEqual([1, 2, 3, 1])
  })

  it('바인드 자세가 어긋나면 안 합치고 까닭을 돌려준다', () => {
    // ⚠️ **여기서 조용히 합치면 한쪽이 뒤틀린다.** 같은 뼈를 서로 다른 역행렬로
    // 잡고 있으면 하나로 묶을 수 없다 — 근사하지 않고 그대로 둔다
    const shared = bones(3)
    const root = new Group()
    const a = part([shared[0]!, shared[1]!], [0, 1, 0, 0], 1)
    const b = part([shared[0]!, shared[1]!, shared[2]!], [0, 1, 2, 0], 2)
    root.add(a, b)

    const out = unifySkeletons(root)

    expect(out.skipped).toContain('바인드 자세')
    expect(a.skeleton).not.toBe(b.skeleton)
    expect(indexOf(a)).toEqual([0, 1, 0, 0])
  })

  it('뼈 수가 이미 같으면 건드리지 않는다', () => {
    const all = bones(4)
    const root = new Group()
    const a = part([all[0]!, all[1]!], [0, 1, 0, 0])
    const b = part([all[2]!, all[3]!], [0, 1, 0, 0])
    const before = a.skeleton
    root.add(a, b)

    const out = unifySkeletons(root)

    // 셋을 다 같은 수로 두면 셰이더가 안 갈리므로 합칠 까닭이 없다
    expect(out.was).toBe(1)
    expect(a.skeleton).toBe(before)
    expect(indexOf(b)).toEqual([0, 1, 0, 0])
  })

  it('두 번 걸어도 자리 번호가 또 안 밀린다', () => {
    // ⚠️ 복제본에 또 걸리면 이미 고친 것을 한 번 더 고쳐 **엉뚱한 뼈**를 가리킨다
    const all = bones(4)
    const root = new Group()
    const b = part([all[2]!, all[3]!], [0, 1, 1, 0])
    root.add(part([all[0]!, all[1]!], [0, 1, 1, 0]), b)

    unifySkeletons(root)
    const after = indexOf(b)
    unifySkeletons(root)

    expect(indexOf(b)).toEqual(after)
  })

  it('스킨이 아닌 것은 세지 않는다', () => {
    const root = new Group()
    root.add(new Mesh(new BufferGeometry(), new MeshBasicMaterial()))

    const out = unifySkeletons(root)

    expect(out.meshes).toBe(0)
    expect(out.skipped).toBeNull()
  })
})
