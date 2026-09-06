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
import type { ChunkMesh } from './chunkMesh'

/** 노드 이동값이 유닛이다 — 정점은 타일이라 열여섯으로 나눈다 (`placeByNode`) */
const UNITS_PER_TILE = 16

/** 원작은 한 틱에 한 프레임 돌린다 (`MapPropAnimation_AdvanceFrame`) */
export const FRAME_MS = 1000 / 60

/** 애니 멤버 하나를 푼 것 */
type PropClip =
  | { kind: 'BCA0', frames: number, anim: JntAnim }
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
  const raw = bytes.subarray(row.at, row.at + row.size)
  try {
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
interface NodeBase {
  m: readonly number[]
  s: readonly number[]
  t: readonly number[]
}

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
export function nodeMatrixAt(base: NodeBase, anim: JntAnim, node: number, frame: number): Matrix4 {
  const track = anim.tracks.find((t) => t.node === node)
  const got = track?.frames[Math.min(anim.frames - 1, Math.max(0, Math.floor(frame)))]
  const now = xform(got?.m ?? base.m, got?.s ?? base.s, got?.t ?? base.t)
  return now.multiply(xform(base.m, base.s, base.t).invert())
}

/** 이 애니가 움직이는 노드들 */
export function movedNodes(anim: JntAnim): Set<number> {
  return new Set(anim.tracks.map((t) => t.node))
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
  const index = mesh.geometry.getIndex()
  if (!index) return new Map()
  const byNode = new Map<number, { at: number, count: number, material: number }[]>()
  mesh.groups.forEach(([material, start, count], i) => {
    const node = submeshNodes[i] ?? 0
    const list = byNode.get(node) ?? []
    list.push({ at: start, count, material })
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
