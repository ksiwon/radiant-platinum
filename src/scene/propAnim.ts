// 맵 소품이 **원작 클립대로** 움직인다 (PARITY §8.5 · DATA §2.31·§2.32)
//
// 소품 590개 중 **112개**가 애니를 갖는다. 갈래가 셋이고 하는 일이 아주 다르다:
//
//     BCA0  32벌  노드를 움직인다 — 문 스무 종 · 꿀나무 · 운하시티 다리
//     BTA0  43벌  UV를 민다 — 폭포 · 용암 · 물결 · 자전거 진흙 비탈
//     BTP0  23벌  그림을 갈아 끼운다 — 에스컬레이터 · 치료기 · 체육관 단추
//
// ⚠️ **셋 중 둘은 노드를 안 건드린다.** BTA0·BTP0를 쓰는 84개는 **전부 노드가
// 하나**라 기하를 쪼갤 이유가 없다 — 재질만 프레임마다 손대면 된다. 기하를
// 쪼개야 하는 것은 BCA0 스물여덟뿐이다.
//
// ⚠️ **`placeByNode`가 이미 발라 놨다.** 굽는 쪽이 노드 변환을 정점에 먹여
// 두므로(그래야 안 움직이는 소품 590개가 메시 하나로 선다) 노드를 다시
// 움직이려면 **기본 변환을 되돌려야** 한다 — 그래서 그룹 행렬이
// `애니 × 기본⁻¹`이다. 문 스무 종 중 열여덟은 기본이 단위라 되돌릴 것이 없고,
// 나머지 둘(대저택 441 · 백화점 442)만 문짝이 ±10·±12유닛 밀려 있다.
import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three'
import { loadPropAnimBytes, loadPropAnims } from '../data/gameData'
import type { PropAnimsFile } from '../data/schema'
import { readNsbca, type JntAnim } from '../import/platinum/nsbca'
import { readNsbta, type SrtAnim } from '../import/platinum/nsbta'
import { readNsbtp, type PatAnim } from '../import/platinum/nsbtp'
import { readNsbma, type MatAnim } from '../import/platinum/nsbma'
import { readNsbva, type VisAnim } from '../import/platinum/nsbva'
import type { ChunkMesh } from './chunkMesh'

/** 노드 이동값이 유닛이다 — 정점은 타일이라 열여섯으로 나눈다 (`placeByNode`) */
const UNITS_PER_TILE = 16

/** 원작은 한 틱에 한 프레임 돌린다 (`MapPropAnimation_AdvanceFrame`) */
export const FRAME_MS = 1000 / 60

/** 애니 멤버 하나를 푼 것 */
export type PropClip =
  | { kind: 'BCA0', frames: number, anim: JntAnim }
  | { kind: 'BMA0', frames: number, anim: MatAnim }
  | { kind: 'BVA0', frames: number, anim: VisAnim }
  | { kind: 'BTA0', frames: number, anim: SrtAnim }
  | { kind: 'BTP0', frames: number, anim: PatAnim }

/** 소품 애니 한 벌 — 표와 바이트, 그리고 푼 것을 담아 두는 자리 */
export interface PropAnimSet {
  table: PropAnimsFile
  /** 멤버 번호를 풀어 준다. 같은 번호는 한 번만 푼다 */
  clip: (member: number) => PropClip | null
}

let held: Promise<PropAnimSet | null> | null = null

/** 표와 바이트를 받는다. 둘 중 하나라도 없으면 소품이 그냥 안 움직인다 */
export function loadPropAnimSet(): Promise<PropAnimSet | null> {
  held ??= Promise.all([loadPropAnims(), loadPropAnimBytes()])
    .then(([table, bytes]) => {
      if (!table || !bytes) return null
      const cache = new Map<number, PropClip | null>()
      const clip = (member: number): PropClip | null => {
        const hit = cache.get(member)
        if (hit !== undefined) return hit
        const made = readClip(table, bytes, member)
        cache.set(member, made)
        return made
      }
      return { table, clip }
    })
    .catch(() => null)
  return held
}

function readClip(table: PropAnimsFile, bytes: Uint8Array, member: number): PropClip | null {
  const row = table.members[member]
  if (!row) return null
  return readRawClip(row, bytes)
}

/** 이어 붙인 바이트에서 멤버 하나를 푼다 — 맵 소품과 필드 이펙트 소품(`loadDistortionPropAnims`)이 같이 쓴다 */
export function readRawClip(
  row: { kind: 'BCA0' | 'BTA0' | 'BTP0' | 'BMA0' | 'BVA0', frames: number, at: number, size: number }, bytes: Uint8Array,
): PropClip | null {
  const raw = bytes.subarray(row.at, row.at + row.size)
  try {
    if (row.kind === 'BMA0') {
      const anim = readNsbma(raw)[0]
      return anim ? { kind: 'BMA0', frames: row.frames, anim } : null
    }
    if (row.kind === 'BVA0') {
      const anim = readNsbva(raw)[0]
      return anim ? { kind: 'BVA0', frames: row.frames, anim } : null
    }
    if (row.kind === 'BCA0') {
      const anim = readNsbca(raw)[0]
      return anim ? { kind: 'BCA0', frames: row.frames, anim } : null
    }
    if (row.kind === 'BTA0') {
      const anim = readNsbta(raw)[0]
      return anim ? { kind: 'BTA0', frames: row.frames, anim } : null
    }
    const anim = readNsbtp(raw)[0]
    return anim ? { kind: 'BTP0', frames: row.frames, anim } : null
  } catch {
    // 한 멤버를 못 읽어도 나머지 소품은 돈다
    return null
  }
}

/** 노드 하나의 기본 변환 (`propModelInfo`가 실은 것) */
export interface NodeBase {
  m: readonly number[]
  s: readonly number[]
  t: readonly number[]
}

/** 노드마다 기본 자세를 굽는 데 쓴 배율 — 원래 배율이 0이라 대신 쓴 것 (`demoModels`의 `rest`) */
type RestScales = readonly (readonly number[] | null)[] | undefined

/** 행 우선 3×3 + 배율 + 이동(유닛) → 타일 자의 4×4 */
function xform(m: readonly number[], s: readonly number[], t: readonly number[]): Matrix4 {
  const out = new Matrix4().set(
    m[0] ?? 1, m[1] ?? 0, m[2] ?? 0, 0,
    m[3] ?? 0, m[4] ?? 1, m[5] ?? 0, 0,
    m[6] ?? 0, m[7] ?? 0, m[8] ?? 1, 0,
    0, 0, 0, 1,
  )
  out.scale(new Vector3(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1))
  out.setPosition(
    (t[0] ?? 0) / UNITS_PER_TILE,
    (t[1] ?? 0) / UNITS_PER_TILE,
    (t[2] ?? 0) / UNITS_PER_TILE,
  )
  return out
}

/**
 * 이 프레임에 노드가 가질 **그룹 행렬** — 이미 구워진 정점에 곱할 것.
 *
 * 트랙이 없는 채널은 모델 값을 그대로 쓴다 (`JntFrame`의 `null`이 그 뜻이다)
 */
export function nodeMatrixAt(
  base: NodeBase, anim: JntAnim, node: number, frame: number, rest?: readonly number[] | null,
): Matrix4 {
  const track = anim.tracks.find((t) => t.node === node)
  const got = track?.frames[Math.min(anim.frames - 1, Math.max(0, Math.floor(frame)))]
  const now = xform(got?.m ?? base.m, got?.s ?? base.s, got?.t ?? base.t)
  return now.multiply(xform(base.m, rest ?? base.s, base.t).invert())
}

/** 노드 하나의 이 프레임 제 행렬 (트랙이 없는 채널은 모델 값) */
function localAt(base: NodeBase, anim: JntAnim, node: number, frame: number): Matrix4 {
  const track = anim.tracks.find((t) => t.node === node)
  const got = track?.frames[Math.min(anim.frames - 1, Math.max(0, Math.floor(frame)))]
  return xform(got?.m ?? base.m, got?.s ?? base.s, got?.t ?? base.t)
}

/**
 * 이 프레임에 노드마다 걸 **그룹 행렬** — 노드 사슬까지 (`chunks.nodeChain`).
 *
 * 사슬이 없는 모델(거의 다)은 `nodeMatrixAt`과 같다. 사슬이 있으면 자식이 **부모의 움직임 위에** 선다 — 원작 SBC가
 * 행렬 더미로 그렇게 곱한다. 굽는 쪽이 사슬로 셈한 기본 자세를 정점에 발라 두었으므로 되돌리는 것도 사슬 셈이다:
 * `애니의 세계 행렬 × 기본의 세계 행렬⁻¹`
 */
export function nodeMatricesAt(
  info: { nodes: readonly NodeBase[], parents?: readonly number[], rest?: RestScales },
  anim: JntAnim, nodes: Iterable<number>, frame: number,
): Map<number, Matrix4> {
  const out = new Map<number, Matrix4>()
  const parents = info.parents
  if (!parents) {
    for (const node of nodes) {
      const base = info.nodes[node]
      if (base) out.set(node, nodeMatrixAt(base, anim, node, frame, info.rest?.[node]))
    }
    return out
  }
  const live = new Map<number, Matrix4>(), rest = new Map<number, Matrix4>()
  const worldOf = (id: number, moving: boolean): Matrix4 => {
    const memo = moving ? live : rest
    const hit = memo.get(id)
    if (hit) return hit
    const base = info.nodes[id]
    const local = !base ? new Matrix4() : moving ? localAt(base, anim, id, frame)
      : xform(base.m, info.rest?.[id] ?? base.s, base.t)
    const up = parents[id] ?? -1
    const made = up >= 0 && up !== id ? worldOf(up, moving).clone().multiply(local) : local
    memo.set(id, made)
    return made
  }
  for (const node of nodes) {
    if (!info.nodes[node]) continue
    out.set(node, worldOf(node, true).clone().multiply(worldOf(node, false).clone().invert()))
  }
  return out
}

/** 노드의 기본 자세 세계 행렬 — 굽는 쪽이 정점에 발라 둔 것 (사슬이 있으면 사슬 셈) */
export function restWorld(
  info: { nodes: readonly NodeBase[], parents?: readonly number[], rest?: RestScales }, node: number,
): Matrix4 {
  const at = (id: number, depth: number): Matrix4 => {
    const base = info.nodes[id]
    const local = base ? xform(base.m, info.rest?.[id] ?? base.s, base.t) : new Matrix4()
    const up = info.parents?.[id] ?? -1
    return up >= 0 && up !== id && depth < 64 ? at(up, depth + 1).multiply(local) : local
  }
  return at(node, 0)
}

/** 이 애니가 움직이는 노드들 */
export function movedNodes(anim: JntAnim): Set<number> {
  return new Set(anim.tracks.map((t) => t.node))
}

/**
 * 갈래마다 한 벌만 쪼갠다.
 *
 * ⚠️ **배치마다 쪼개면 안 된다.** 소품 하나가 한 맵에 여러 번 서는데
 * (문 스무 종이 그렇다) 배치마다 새 기하를 만들면 그만큼 GPU 색인 버퍼가 는다.
 * 그리고 **버릴 수도 없다** — 정점·UV·법선을 원본과 나눠 쓰므로
 * `geometry.dispose()`가 그 공유 버퍼까지 놓아 원본이 안 그려진다.
 * 기하가 갈래마다 하나뿐이므로(`loadPropMesh`가 캐시한다) 그것을 열쇠로 쓴다
 */
const splitCache = new WeakMap<ChunkMesh, Map<number, BufferGeometry>>()

/**
 * 서브메시 차례 → 롬 재질 번호.
 *
 * ⚠️ **재질 배열은 서브메시마다다** (`ChunkMesh.materials` · `propMaterials`). 롬 재질 번호(`propModelInfo.materials` ·
 * `uv` · 굽는 쪽의 `blend` · `light`)와 차례가 다르다 — SBC가 그리는 차례가 서브메시 차례라서다. 창기둥 영상의 땅은
 * 9 · 10 · 6 · 2 · …로 그린다. 둘을 섞으면 그림이 남의 면에 붙는다 (실측: 소품 249 · 연출 모델 13)
 */
export const romMaterial = (mesh: ChunkMesh, sub: number): number => mesh.groups[sub]?.[0] ?? sub

/** 그 롬 재질을 그리는 서브메시들 */
export function submeshesOf(mesh: ChunkMesh, rom: number): number[] {
  const out: number[] = []
  mesh.groups.forEach(([mat], i) => { if (mat === rom) out.push(i) })
  return out
}

/**
 * 소품 기하를 **노드마다** 쪼갠다.
 *
 * 정점·UV·법선은 **나눠 쓴다** — 쪼개는 것은 색인뿐이라 GPU에 같은 것을 여러
 * 벌 올리지 않는다. 그룹(재질 구간)은 자기 색인 안 자리로 다시 매긴다
 */
export function splitByNode(
  mesh: ChunkMesh, submeshNodes: readonly number[],
): Map<number, BufferGeometry> {
  const hit = splitCache.get(mesh)
  if (hit) return hit
  const index = mesh.geometry.getIndex()
  if (!index) return new Map()
  // 그룹의 재질 칸은 **서브메시 차례**다 — 재질 배열이 그 차례다 (`romMaterial`)
  const byNode = new Map<number, { at: number, count: number, material: number }[]>()
  mesh.groups.forEach(([, start, count], i) => {
    const node = submeshNodes[i] ?? 0
    const list = byNode.get(node) ?? []
    list.push({ at: start, count, material: i })
    byNode.set(node, list)
  })

  const out = new Map<number, BufferGeometry>()
  for (const [node, parts] of byNode) {
    const total = parts.reduce((a, p) => a + p.count, 0)
    const array = new Uint16Array(total)
    const made = new BufferGeometry()
    for (const name of Object.keys(mesh.geometry.attributes)) {
      made.setAttribute(name, mesh.geometry.attributes[name]!)
    }
    let o = 0
    for (const part of parts) {
      for (let k = 0; k < part.count; k++) array[o + k] = index.getX(part.at + k)
      made.addGroup(o, part.count, part.material)
      o += part.count
    }
    made.setIndex(new BufferAttribute(array, 1))
    made.computeBoundingSphere()
    out.set(node, made)
  }
  splitCache.set(mesh, out)
  return out
}

/**
 * BTA0가 이 프레임에 거는 UV 이동 — **정규화 UV**로 돌려준다.
 *
 * 클립의 값은 **텍셀**이라 재질마다 그림 크기로 나눈다 (`propModelInfo.uv`가
 * 그 배수를 싣는다). 없는 재질은 0이다
 */
export function uvOffsetAt(
  anim: SrtAnim, material: string, factor: readonly [number, number], frame: number,
): [number, number] {
  const track = anim.tracks.find((t) => t.material === material)
  if (!track) return [0, 0]
  const at = Math.min(anim.frames - 1, Math.max(0, Math.floor(frame)))
  return [track.u(at) * factor[0], track.v(at) * factor[1]]
}
