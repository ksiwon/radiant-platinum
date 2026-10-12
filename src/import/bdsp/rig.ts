// 계층이 있는 움직이는 소품 — 에스컬레이터 (docs/orders/GAPS_20261011.md A)
//
// 에스컬레이터 `P_RO_005_Escalator_0N`은 **스킨 메시**(`SkinnedMeshRenderer` — 껍데기 `SM_RO_005_Escalator_01`)이고 계단 일곱이 뼈
// (`Escalator00~05` · `Root`)다. 클립 `up` · `down`(0.875초 · 계단이 한 칸씩 옮겨 가는 이음새 없는 루프)이 그 뼈들의 위치를 민다.
// 클립은 `FieldEventEntity.clips`에 들어 있고 `playOnAwake`가 `Idle`(0.04초)이라 번들 쪽에서는 스크립트가 부를 때만 도는 것으로 보이지만,
// **원작 DS의 에스컬레이터는 늘 움직인다**(BTP0 `esca_up1`) — 우리는 늘 돌린다.
//
// ⚠️ **방향은 번들 구성이 말한다.** `03`은 오르는 것, `04`는 내리는 것이다: 백화점 1층(`c07r0201`)에는 03만, 꼭대기 층(`c07r0205`)에는 04만 있고
// 가운데 층(`c07r0202`~`0204`)에는 둘이 다 있다 — 1층에서는 오르기만, 꼭대기에서는 내리기만 하기 때문이다. 그래서 03은 `up`, 04는 `down`을 튼다
//
// 닻(부모 월드 · 정지) → 뿌리 → 자식 마디 …로 노드를 짓고, 클립이 자식 경로(CRC32)로 노드를 찾게 한다. 껍데기는 스킨(관절 = 마디)으로 싣는다
//
// ⚠️ `arena.ts`가 이 파일을 불러오면 순환이라(이 파일이 `arena.ts`의 `worldOf`를 쓴다) 부르는 쪽(`convert.ts`)이 `arena.ts`에 넘긴다
import { crc32 } from './model'
import { worldOf, type Mat4 } from './arena'
import type { Environment } from './environment'
import type { UnityValue } from './typetree'

type Props = Record<string, UnityValue>
const num = (v: UnityValue | undefined, fallback = 0): number => (typeof v === 'number' ? v : fallback)

interface RigNode {
  name: string
  /** 이 마디의 Transform */
  transform: number
  /** x를 뒤집은 로컬 이동 · 사원수 · 배율 */
  t: number[]
  r: number[]
  s: number[]
  children: number[]
  /** 뿌리 기준 경로(CRC32의 재료) — 뿌리는 빈 문자열 */
  path: string
}

/** 뼈대에 매달린 껍데기 하나 (`SkinnedMeshRenderer`) */
interface RigSkin {
  mesh: number
  materials: number[]
  /** 뼈의 Transform PathID들 — 스킨의 `joints`가 된다 */
  bones: number[]
}

export interface Rig {
  /** 묶음 이름의 재료 — 이름 + 월드 자리 */
  key: string
  name: string
  parent: Mat4 | null
  clip: number
  /** 뿌리부터 깊이 우선 차례 */
  nodes: RigNode[]
  skins: RigSkin[]
}

/** 클립 이름: 03 오름 · 04 내림 */
function escalatorClip(goName: string): 'up' | 'down' | null {
  const m = /Escalator_0([34])/.exec(goName)
  return m ? (m[1] === '3' ? 'up' : 'down') : null
}

const at = (v: number): string => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3)

/** 환경 안의 에스컬레이터 뼈대들 */
export function findRigs(env: Environment, cache: Map<number, Mat4>): Rig[] {
  const out: Rig[] = []
  const goNameOf = (pid: number): string => {
    const t = env.read(pid) as Props | null
    const go = env.read(num((t?.m_GameObject as Props | undefined)?.m_PathID)) as Props | null
    return typeof go?.m_Name === 'string' ? go.m_Name : ''
  }
  for (const e of env.ofType('MonoBehaviour')) {
    const mb = env.readEntry(e) as Props | null
    const clips = mb?.clips
    if (!mb || !Array.isArray(clips)) continue
    const go = env.read(num((mb.m_GameObject as Props | undefined)?.m_PathID)) as Props | null
    const goName = typeof go?.m_Name === 'string' ? go.m_Name.replace(/ \(\d+\)$/, '') : ''
    const want = escalatorClip(goName)
    if (!want || !go) continue
    const clip = (clips as Props[]).find((c) => c.name === want)
    const clipPid = num((clip?.animationClip as Props | undefined)?.m_PathID)
    if (clipPid === 0) continue
    let rootPid = 0
    for (const c of (go.m_Component as UnityValue[] | undefined) ?? []) {
      const holder = (Array.isArray(c) ? c[1] : c) as Props
      const pid = num(((holder.component ?? holder) as Props).m_PathID)
      if (env.entryOf(pid)?.type === 'Transform') rootPid = pid
    }
    if (rootPid === 0) continue
    const nodes: RigNode[] = []
    const walk = (pid: number, path: string): void => {
      const t = env.read(pid) as Props | null
      if (!t) return
      const p = (t.m_LocalPosition ?? {}) as Props
      const q = (t.m_LocalRotation ?? {}) as Props
      const sc = (t.m_LocalScale ?? {}) as Props
      const kids = ((t.m_Children as Props[] | undefined) ?? []).map((k) => num(k.m_PathID))
      nodes.push({
        name: goNameOf(pid), transform: pid,
        t: [-num(p.x), num(p.y), num(p.z)],
        r: [num(q.x), -num(q.y), -num(q.z), num(q.w, 1)],
        s: [num(sc.x, 1), num(sc.y, 1), num(sc.z, 1)],
        children: kids, path,
      })
      for (const k of kids) {
        const kname = goNameOf(k)
        walk(k, path === '' ? kname : `${path}/${kname}`)
      }
    }
    walk(rootPid, '')
    const inside = new Set(nodes.map((n) => n.transform))
    const skins: RigSkin[] = []
    for (const se of env.ofType('SkinnedMeshRenderer')) {
      const v = env.readEntry(se) as Props | null
      if (!v) continue
      const sgo = env.read(num((v.m_GameObject as Props | undefined)?.m_PathID)) as Props | null
      let stf = 0
      for (const c of (sgo?.m_Component as UnityValue[] | undefined) ?? []) {
        const holder = (Array.isArray(c) ? c[1] : c) as Props
        const pid = num(((holder.component ?? holder) as Props).m_PathID)
        if (env.entryOf(pid)?.type === 'Transform') stf = pid
      }
      if (!inside.has(stf)) continue
      skins.push({
        mesh: num((v.m_Mesh as Props | undefined)?.m_PathID),
        materials: ((v.m_Materials as Props[] | undefined) ?? []).map((m) => num(m.m_PathID)),
        bones: ((v.m_Bones as Props[] | undefined) ?? []).map((b) => num(b.m_PathID)),
      })
    }
    const root = env.read(rootPid) as Props
    const father = num((root.m_Father as Props | undefined)?.m_PathID)
    const world = worldOf(env, rootPid, cache)
    out.push({
      key: `${goName}:${at(world[3]!)}:${at(world[7]!)}:${at(world[11]!)}`,
      name: goName,
      parent: father === 0 ? null : worldOf(env, father, cache),
      clip: clipPid,
      nodes,
      skins,
    })
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/** 경로 해시 → 마디 순서 (뿌리 `''`는 0) */
export function pathHashes(rig: Rig): Map<number, number> {
  const out = new Map<number, number>()
  rig.nodes.forEach((n, i) => out.set(n.path === '' ? 0 : crc32(n.path), i))
  return out
}
