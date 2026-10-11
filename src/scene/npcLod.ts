// 사람 모델의 **먼 몫(LOD)** — 뼈 없이 굳힌 자세를 인스턴싱으로 세운다 (G3)
//
// 스킨 모델은 사람 하나에 정점 프로그램 하나다 (`warmPipelines` 머리말: 복제마다 뼈 행렬 버퍼 이름에 노드 id가
// 박힌다). 그래서 사람 수 상한(`NpcModels`의 `MAX`)을 올려 넘치는 사람을 세우면 파이프라인이 그만큼 는다 —
// 상한을 넘은 사람이 판때기로 서던 까닭이다.
//
// 넘치는 사람은 **뼈를 버린다.** 스킨 몸을 자세 하나로 굳혀(정점에 뼈 행렬을 미리 곱해 두고) 뼈 없는
// 지오메트리로 만든다:
//   - 파이프라인: 갈래(번들) × 재질 하나씩이다. 사람 수와 상관없다 — 재질이 같고 뼈 버퍼가 없다
//   - 그리기 호출: 갈래 × 조각 × 자세 수다. 사람 수와 상관없다 (같은 갈래는 인스턴싱으로 한 번에 그린다)
//   - 믹서 · 스키닝: 0
// 자세는 서 있는 것 하나와 걷기 한 바퀴를 `WALK_POSES`장으로 끊은 것이다. 걷는 사람은 걸은 거리로 그 장을
// 고른다(`stepGait`와 같은 약속).
import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, Frustum, InstancedBufferAttribute,
  InstancedMesh, Matrix4, Vector3, type Group, type Material, type Mesh, type Object3D, type SkinnedMesh,
} from 'three'

/** 걷기 한 바퀴를 끊는 장 수. 12장이면 한 장이 30° 위상이다 (6장은 뚝뚝 끊길 수 있어 늘렸다 — 메모리는 갈래당 정점 위치·법선 몫이 장마다 는다) */
export const WALK_POSES = 12

/** 갈래 하나에서 한 번에 세울 수 있는 사람(몸) 수. 이만큼이 인스턴스 버퍼 크기다 */
export const LOD_CAPACITY = 128

/** 한 자세의 조각 하나 */
interface LodPart {
  geometry: BufferGeometry
  material: Material | Material[]
}

/** 굳힌 몸 한 벌 (한 칸 = 한 배치의 몸 전부) */
export interface LodBody {
  /** `[자세][조각]`. 0번이 서 있기, 1부터 걷기 `WALK_POSES`장. 걷기를 못 구웠으면 0번뿐이다 */
  poses: LodPart[][]
  /** 걷기 한 바퀴에 발이 딛는 거리(타일). 걷기 장이 없으면 0 */
  cycle: number
  /** 선 키(타일) — 머리 위에 얹는 것(`EmoteMarks`)이 본다 */
  height: number
}

/** 이 노드부터 루트까지 하나라도 숨겼으면 안 그리는 조각이다 (대체 복장 등) */
function hidden(o: Object3D, root: Object3D): boolean {
  for (let p: Object3D | null = o; p !== null; p = p.parent) {
    if (!p.visible) return true
    if (p === root) break
  }
  return false
}

const NOT_COPIED = new Set(['position', 'normal', 'skinIndex', 'skinWeight', 'tangent'])

/** 정점 하나에 닿는 뼈 행렬을 미리 곱해 둔 표. 뼈마다 4x3 열 우선 12개 */
function boneTable(mesh: SkinnedMesh): Float32Array {
  mesh.skeleton.update()
  const bm = mesh.skeleton.boneMatrices!
  const n = mesh.skeleton.bones.length
  // 셰이더의 식: 세계 = matrixWorld · bindMatrixInverse · Σ w · boneMatrix · bindMatrix · 정점
  // 합 안의 곱을 뼈마다 미리 묶는다 — 선형이라 같다
  const toWorld = new Matrix4().multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse)
  const out = new Float32Array(n * 16)
  const m = new Matrix4(), c = new Matrix4()
  for (let i = 0; i < n; i++) {
    m.fromArray(bm, i * 16)
    c.multiplyMatrices(toWorld, m).multiply(mesh.bindMatrix)
    c.toArray(out, i * 16)
  }
  return out
}

/** 스킨 조각 하나를 지금 자세로 굳힌다 */
function bakeSkinned(mesh: SkinnedMesh): BufferGeometry {
  const src = mesh.geometry
  const pos = src.getAttribute('position')
  const nor = src.getAttribute('normal') as BufferAttribute | undefined
  const sIdx = src.getAttribute('skinIndex')
  const sWt = src.getAttribute('skinWeight')
  const table = boneTable(mesh)
  const count = pos.count
  const outPos = new Float32Array(count * 3)
  const outNor = nor ? new Float32Array(count * 3) : null
  for (let v = 0; v < count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v)
    const nx = nor ? nor.getX(v) : 0, ny = nor ? nor.getY(v) : 0, nz = nor ? nor.getZ(v) : 0
    let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0
    for (let k = 0; k < 4; k++) {
      const w = sWt.getComponent(v, k)
      if (w === 0) continue
      const o = sIdx.getComponent(v, k) * 16
      px += w * (table[o]! * x + table[o + 4]! * y + table[o + 8]! * z + table[o + 12]!)
      py += w * (table[o + 1]! * x + table[o + 5]! * y + table[o + 9]! * z + table[o + 13]!)
      pz += w * (table[o + 2]! * x + table[o + 6]! * y + table[o + 10]! * z + table[o + 14]!)
      if (outNor) {
        qx += w * (table[o]! * nx + table[o + 4]! * ny + table[o + 8]! * nz)
        qy += w * (table[o + 1]! * nx + table[o + 5]! * ny + table[o + 9]! * nz)
        qz += w * (table[o + 2]! * nx + table[o + 6]! * ny + table[o + 10]! * nz)
      }
    }
    outPos[v * 3] = px; outPos[v * 3 + 1] = py; outPos[v * 3 + 2] = pz
    if (outNor) {
      const len = Math.hypot(qx, qy, qz) || 1
      outNor[v * 3] = qx / len; outNor[v * 3 + 1] = qy / len; outNor[v * 3 + 2] = qz / len
    }
  }
  return rebuild(src, outPos, outNor)
}

/** 뼈 없는 조각(소품)은 제 세계 행렬만 곱한다 */
function bakeRigid(mesh: Mesh): BufferGeometry {
  const g = mesh.geometry.clone()
  g.applyMatrix4(mesh.matrixWorld)
  for (const name of ['skinIndex', 'skinWeight', 'tangent']) g.deleteAttribute(name)
  g.computeBoundingSphere()
  return g
}

/** 위치·법선만 새로 쓰고 나머지 속성은 원본과 **같이 쓴다** — 자세마다 메모리가 위치·법선 몫만 는다 */
function rebuild(src: BufferGeometry, pos: Float32Array, nor: Float32Array | null): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  if (nor) g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  for (const name of Object.keys(src.attributes)) {
    if (NOT_COPIED.has(name)) continue
    g.setAttribute(name, src.attributes[name]!)
  }
  if (src.index) g.setIndex(src.index)
  for (const grp of src.groups) g.addGroup(grp.start, grp.count, grp.materialIndex)
  g.computeBoundingSphere()
  return g
}

/**
 * `root` 아래 보이는 조각을 **지금 자세로** 굳힌다. 뼈와 래퍼의 세계 행렬이 최신이어야 해서 안에서 한 번
 * 갱신한다. 결과 좌표는 `root`의 세계 좌표 그대로다 — `root`가 원점에 놓여 있어야 칸 안 좌표가 된다
 */
export function bakePose(root: Object3D): LodPart[] {
  root.updateMatrixWorld(true)
  const parts: LodPart[] = []
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || hidden(o, root)) return
    const skinned = (o as SkinnedMesh).isSkinnedMesh
    parts.push({
      geometry: skinned ? bakeSkinned(o as SkinnedMesh) : bakeRigid(mesh),
      material: mesh.material,
    })
  })
  return parts
}

/**
 * 한 갈래(칸 모양)의 인스턴스 메시 모음.
 *
 * ⚠️ **한 자세의 조각들이 인스턴스 행렬 버퍼를 같이 쓴다.** 사람 한 명의 행렬을 조각 수만큼 쓰지 않으려고
 * 자세마다 버퍼를 하나만 두고 조각 메시가 그것을 가리킨다
 */
interface PoseMeshes {
  matrices: InstancedBufferAttribute
  meshes: InstancedMesh[]
  n: number
}

export class LodStage {
  private readonly sets = new Map<string, PoseMeshes[]>()
  private readonly frustum = new Frustum()
  private readonly vp = new Matrix4()
  private readonly view = new Matrix4()
  private readonly sphere = { center: new Vector3(), radius: 0 }

  constructor(private readonly parent: Group) {}

  /** 굳힌 몸을 올려 둔다. 재질은 스킨 몸과 같은 것이라 이미 비동기로 굽도록 표시돼 있다 */
  add(tag: string, body: LodBody): void {
    if (this.sets.has(tag)) return
    const poses: PoseMeshes[] = body.poses.map((parts) => {
      const matrices = new InstancedBufferAttribute(new Float32Array(LOD_CAPACITY * 16), 16)
      matrices.setUsage(DynamicDrawUsage)
      const meshes = parts.map((p) => {
        const mesh = new InstancedMesh(p.geometry, p.material as Material, LOD_CAPACITY)
        mesh.instanceMatrix = matrices
        mesh.count = 0
        mesh.visible = false
        // 인스턴스마다 위치가 달라 기본 경계로는 못 거른다. 거르기는 칸 쪽에서 한다 (`inView`)
        mesh.frustumCulled = false
        mesh.castShadow = true
        this.parent.add(mesh)
        return mesh
      })
      return { matrices, meshes, n: 0 }
    })
    this.sets.set(tag, poses)
  }

  /** 프레임 처음. 카메라 절두체를 새로 잡고 인스턴스 수를 0으로 되돌린다 */
  begin(cam: { projectionMatrix: Matrix4, matrixWorld: Matrix4, coordinateSystem?: number }): void {
    // ⚠️ `matrixWorldInverse`는 렌더러가 그릴 때 갱신해서 한 프레임 늦다 — 빠르게 도는 카메라 가장자리의 사람이 한 프레임
    // 걸러지는 것을 피하려고 지금의 세계 행렬에서 역행렬을 새로 낸다
    this.vp.multiplyMatrices(cam.projectionMatrix, this.view.copy(cam.matrixWorld).invert())
    // 좌표계(WebGL 깊이 −1~1 · WebGPU 0~1)는 카메라가 안다
    this.frustum.setFromProjectionMatrix(this.vp, cam.coordinateSystem as never)
    for (const poses of this.sets.values()) for (const p of poses) p.n = 0
  }

  /** 이 둘레(세계 좌표)가 화면에 걸리는가 */
  inView(x: number, y: number, z: number, radius: number): boolean {
    this.sphere.center.set(x, y, z)
    this.sphere.radius = radius
    return this.frustum.intersectsSphere(this.sphere as never)
  }

  /** 한 사람(칸)을 이 자세로 세운다. 가득 차면 `false` */
  push(tag: string, pose: number, matrix: Matrix4): boolean {
    const poses = this.sets.get(tag)
    const p = poses?.[Math.min(pose, (poses?.length ?? 1) - 1)]
    if (!p || p.n >= LOD_CAPACITY) return false
    matrix.toArray(p.matrices.array as Float32Array, p.n * 16)
    p.n++
    return true
  }

  /** 프레임 끝. 쓴 만큼만 그리게 하고 버퍼를 올린다 */
  end(): void {
    for (const poses of this.sets.values()) {
      for (const p of poses) {
        const on = p.n > 0
        for (const mesh of p.meshes) { mesh.count = p.n; mesh.visible = on }
        if (on) p.matrices.needsUpdate = true
      }
    }
  }

  clear(): void {
    for (const poses of this.sets.values()) {
      for (const p of poses) {
        for (const mesh of p.meshes) { this.parent.remove(mesh); mesh.geometry.dispose() }
      }
    }
    this.sets.clear()
  }

  /** 시험용 */
  counts(tag: string): number[] { return this.sets.get(tag)?.map((p) => p.n) ?? [] }
}
