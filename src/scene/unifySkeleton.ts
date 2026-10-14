// 모델 하나의 조각들이 **뼈대 하나를 같이 쓰게** 한다.
//
// ⚠️ **뼈 개수가 곧 셰이더 개수다.** three는 노드 빌더 상태를
// `renderObject.getCacheKey()`로 캐시하는데, 그 열쇠에 재질 모양·지오메트리
// 속성과 함께 **`object.skeleton.bones.length`**가 들어간다
// (`RenderObject.getMaterialCacheKey`). 뼈 수가 하나 다르면 원문이 통째로 다시
// 지어지고, ANGLE에서는 그 링크 확인 하나가 100~350ms 렌더를 막는다.
//
// BDSP 사람 모델은 재질마다 조각이 나뉘어 있고(평균 7.2개, 많으면 19개) 조각마다
// 제 스킨을 갖는다. 209번도로에서 재 보면 이렇다:
//
//     스킨 프로그램 46개 · 2,972ms
//     그런데 **뼈 개수를 빼고 보면 모양이 넷뿐**이고,
//     그 하나가 뼈 16가지로 갈려 27번 구워진다
//
// 조각들이 뼈대 하나를 같이 쓰면 그 넷으로 준다. `SkeletonUtils.clone`이
// 사람마다 뼈를 새로 짓는 것은 그대로다(그래야 각자 다른 자세로 선다) — 여기서
// 없애는 것은 **한 사람 안에서** 조각마다 갈리던 것이다.
//
// ⚠️ **복제하기 전에, 갈래마다 한 번만 돌려야 한다.** `skinIndex`를 고쳐 쓰는데
// `Object3D.clone`은 지오메트리를 **참조로** 물려주므로, 복제본에 돌리면 이미
// 고친 것을 또 고친다. 받아 온 원본 씬에 한 번 거는 것이 맞는 자리다.
import { Matrix4, Skeleton, type BufferAttribute, type Object3D, type SkinnedMesh } from 'three'

/** 같은 뼈의 바인드 역행렬이 이만큼 어긋나면 다른 것으로 본다 */
const SAME = 1e-4

/** 두 번 걸지 않으려고 남기는 표식 */
const MARK = '__skeletonUnified'

interface UnifyResult {
  /** 뼈대를 같이 쓰게 된 조각 수 */
  meshes: number
  /** 합친 뼈대의 뼈 수 */
  bones: number
  /** 합치기 전 뼈 개수 가짓수 — 이만큼 셰이더가 갈려 있었다 */
  was: number
  /** 안 합쳤으면 그 까닭. 합쳤으면 null */
  skipped: string | null
}

/**
 * `root` 아래 스킨 조각들을 뼈대 하나로 묶는다.
 *
 * ⚠️ **바인드 자세가 어긋나면 안 합친다.** 같은 뼈를 두 스킨이 서로 다른
 * 역행렬로 잡고 있으면 하나로 묶는 순간 한쪽이 뒤틀린다. 그런 모델은 그대로
 * 두고 까닭을 돌려준다 — 조용히 근사하지 않는다.
 */
export function unifySkeletons(root: Object3D): UnifyResult {
  const out = unifyPieces(root)
  fitBoneLimit(root)
  return out
}

function unifyPieces(root: Object3D): UnifyResult {
  if (root.userData[MARK] === true) return { meshes: 0, bones: 0, was: 0, skipped: '이미 합쳤다' }
  const meshes: SkinnedMesh[] = []
  root.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh) meshes.push(o as SkinnedMesh) })
  root.userData[MARK] = true

  const was = new Set(meshes.map((m) => m.skeleton.bones.length)).size
  if (meshes.length < 2 || was < 2) {
    return { meshes: meshes.length, bones: meshes[0]?.skeleton.bones.length ?? 0, was, skipped: null }
  }

  // 합친 뼈 목록. 처음 본 순서를 지킨다 — 순서가 곧 `skinIndex`가 가리킬 자리다
  const order: Object3D[] = []
  const seat = new Map<Object3D, number>()
  const inverse: Matrix4[] = []
  for (const mesh of meshes) {
    const { bones, boneInverses } = mesh.skeleton
    for (const [i, bone] of bones.entries()) {
      const inv = boneInverses[i]
      if (inv === undefined) continue
      const at = seat.get(bone)
      if (at === undefined) {
        seat.set(bone, order.length)
        order.push(bone)
        inverse.push(inv.clone())
        continue
      }
      // 같은 뼈를 두 번 봤다 — 잡는 자세가 같아야 하나로 묶을 수 있다
      const before = inverse[at]
      if (before === undefined) continue
      for (let e = 0; e < 16; e++) {
        if (Math.abs((before.elements[e] ?? 0) - (inv.elements[e] ?? 0)) > SAME) {
          return {
            meshes: meshes.length,
            bones: 0,
            was,
            skipped: `바인드 자세가 어긋난다 (${bone.name || '이름 없는 뼈'})`,
          }
        }
      }
    }
  }

  // ⚠️ **뼈대를 하나만 만든다.** 조각마다 새로 만들면 `bones.length`는 같아져도
  // `skeleton.update()`가 조각 수만큼 돈다 — three는 프레임마다 스켈레톤 단위로
  // 한 번만 돌리므로(`_skeletonsUpdated`), 같이 쓰면 그 값도 같이 준다
  const shared = new Skeleton(order as SkinnedMesh['skeleton']['bones'], inverse)

  for (const mesh of meshes) {
    const old = mesh.skeleton.bones
    const index = mesh.geometry.getAttribute('skinIndex') as BufferAttribute | undefined
    if (index !== undefined) {
      // ⚠️ **지오메트리는 갈래마다 하나뿐이라 제자리에서 고쳐도 된다.** 다만
      // 두 조각이 같은 지오메트리를 나눠 쓰면 두 번 고쳐진다 — 그런 모델은
      // 못 봤지만, 고친 것을 표시해 두고 건너뛴다
      if (index.array.length > 0 && (index as unknown as Record<string, unknown>)[MARK] !== true) {
        ;(index as unknown as Record<string, unknown>)[MARK] = true
        const a = index.array as unknown as { [k: number]: number, length: number }
        for (let i = 0; i < a.length; i++) {
          const bone = old[a[i] ?? 0]
          a[i] = bone === undefined ? 0 : (seat.get(bone) ?? 0)
        }
        index.needsUpdate = true
      }
    }
    mesh.bind(shared, mesh.bindMatrix)
  }

  return { meshes: meshes.length, bones: order.length, was, skipped: null }
}

/**
 * WebGL 유니폼 블록 하나에 들어가는 뼈 행렬 수 — `MAX_UNIFORM_BLOCK_SIZE`의 하한 16384바이트 ÷ mat4 64바이트.
 *
 * three 노드 빌더는 뼈 행렬을 유니폼 블록 하나에 담고(`Skinning.js`의 `buffer(boneMatrices)`) 크기를 안 잰다.
 * WebGPU는 한도가 64KB라 넘지 않지만 WebGL 길에서는 이 수를 넘는 순간 셰이더 링크가 실패해 그 조각이 안 그려진다
 */
export const WEBGL_BONE_LIMIT = 16384 / 64

/** 이미 줄인 `skinIndex` 표식 — 조각이 지오메트리를 나눠 쓰면 두 번 고치지 않는다 */
const FIT = '__boneLimitFit'

/**
 * 뼈가 `WEBGL_BONE_LIMIT`보다 많은 스킨 조각을 **그 조각이 실제로 쓰는 뼈만으로** 다시 묶는다.
 *
 * ⚠️ **실측(2026-10-14 최종 연쇄 칸 7): 무청(`tr1078_00`)의 스킨은 joints가 268이다.** 실제 뼈는 168인데 100개가
 * **다른 바인드 자세로** 한 번 더 들어 있어 합칠 수 없다. 268 × 64 = 17,152바이트가 16384를 넘어, WebGL 길에서
 * 선단 체육관 관장이 안 그려졌다(콘솔 「Size of uniform block NodeBuffer … exceeds GL_MAX_UNIFORM_BLOCK_SIZE」).
 * 조각 일곱이 저마다 쓰는 것은 163개라 조각별 뼈대로 나누면 들어간다. 설치본 전체에서 256을 넘는 모델은 이것 하나다.
 *
 * 줄여도 안 들어가는 조각은 그대로 둔다 — 근사하지 않는다. 손댄 조각 수를 돌려준다
 */
export function fitBoneLimit(root: Object3D): number {
  let fitted = 0
  root.traverse((o) => {
    const mesh = o as SkinnedMesh
    if (!mesh.isSkinnedMesh || mesh.skeleton.bones.length <= WEBGL_BONE_LIMIT) return
    const index = mesh.geometry.getAttribute('skinIndex') as BufferAttribute | undefined
    const weight = mesh.geometry.getAttribute('skinWeight') as BufferAttribute | undefined
    if (index === undefined || weight === undefined) return
    const a = index.array as unknown as { [k: number]: number, length: number }
    const w = weight.array as unknown as { [k: number]: number, length: number }
    const { bones, boneInverses } = mesh.skeleton
    const marked = (index as unknown as Record<string, unknown>)[FIT] as number[] | undefined
    // 지오메트리를 나눠 쓰는 조각이 이미 줄였으면 그 뼈 목록을 그대로 쓴다
    let used = marked
    if (used === undefined) {
      const seen = new Set<number>()
      for (let i = 0; i < a.length; i++) if ((w[i] ?? 0) > 0) seen.add(a[i] ?? 0)
      if (seen.size === 0) seen.add(0)
      if (seen.size > WEBGL_BONE_LIMIT) return
      used = [...seen].sort((x, y) => x - y)
      const seat = new Map(used.map((old, i) => [old, i]))
      for (let i = 0; i < a.length; i++) a[i] = seat.get(a[i] ?? 0) ?? 0
      ;(index as unknown as Record<string, unknown>)[FIT] = used
      index.needsUpdate = true
    }
    const picked = used.map((i) => bones[i]).filter((b): b is NonNullable<typeof b> => b !== undefined)
    const inverses = used.map((i) => boneInverses[i]?.clone() ?? new Matrix4())
    mesh.bind(new Skeleton(picked, inverses), mesh.bindMatrix)
    fitted++
  })
  return fitted
}
