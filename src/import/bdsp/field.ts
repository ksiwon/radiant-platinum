// BDSP 야외 지역 번들 → glb (docs/orders/VISUAL_20260929.md §2)
//
// 무대(`arena.ts`)와 같은 꼴(정적 메시 + 재질)인데 **크기가 다르다.** 떡잎 · 잔모래 · 축복시티와 길들을 담은 `area001`은
// 메시 6,255개에 삼각형 150만 개이고, 무대처럼 전부 한 메시로 구우면 93MB다. 그 150만 중 120만이 **같은 메시의 사본**이다 —
// 낮은 나무 한 벌이 2,312번 · 나무 954번 · 풀 무더기 1,350번 선다(고유 메시 111개 · 고유 삼각형 29만). 그래서 같은 메시 ·
// 같은 재질을 두 번 넘게 쓰는 것은 **한 벌 + 세울 자리 목록**으로 쓴다 (`EXT_mesh_gpu_instancing` — three의 GLTFLoader가
// `InstancedMesh`로 편다).
//
// ⚠️ **좌표는 원작 칸 그대로다.** BDSP 야외는 원작 월드 좌표로 지어져 있고 x 부호만 반대다(떡잎마을 집 BDSP x −104~−115 ·
// z 876~886 ↔ 원작 104~115) — 무대처럼 x를 뒤집으면 그대로 맞는다. 높이도 같다: `area001`의 땅 466자리에서 BDSP − 원작 높이의
// 중앙값이 0.0이다 (`.audit/probe/bdspGroundH.py`)
//
// ⚠️ **굽는 쪽은 이것 하나다.** 개발 산출물(`tools/extract/bdspFields.mjs`)도 이 파일을 돌린다 — 두 굽는 쪽이 갈릴 자리를 안 만든다
import { bakeLooks, lanes, worldOf, type ImageShare, type Mat4 } from './arena'
import {
  ARRAY_BUFFER, ELEMENT_BUFFER, FLOAT, GlbBuffer, UINT, USHORT, verifyGlb, writeGlb, type Gltf,
} from './glb'
import { meshFrom, CHANNEL, type MeshData } from './mesh'
import { resource } from './texture'
import type { Environment } from './environment'
import type { UnityValue } from './typetree'

class FieldError extends Error {
  constructor(message: string) { super(message); this.name = 'FieldError' }
}

type Props = Record<string, UnityValue>
const num = (v: UnityValue | undefined, fallback = 0): number => (typeof v === 'number' ? v : fallback)

interface FieldStat {
  /** 세운 메시 (사본 포함) */
  placed: number
  /** 고유 메시 · 재질 조합 */
  unique: number
  /** 인스턴싱으로 쓴 조합 */
  instanced: number
  /** 고유 삼각형 · 사본까지 센 삼각형 */
  triangles: number
  placedTriangles: number
  materials: number
  /** 원작 좌표의 x · z 범위 */
  box: [number, number, number, number]
  bytes: number
  problems: string[]
}

interface Group {
  meshPid: number
  mesh: MeshData
  wide: boolean
  slots: number[]
  worlds: Mat4[]
}

/** Unity 월드 행렬 → 원작 좌표(x 뒤집기)의 행렬. `F·W·F` (F = diag(−1, 1, 1)) */
export function flipped(w: Mat4): Mat4 {
  const m = Float64Array.from(w)
  // 행 0과 열 0의 부호를 바꾼다(교차 칸 [0]은 두 번 바뀌어 그대로)
  for (let c = 1; c < 4; c++) m[c] = -m[c]!
  for (let r = 1; r < 4; r++) m[r * 4] = -m[r * 4]!
  return m
}

/** 행 우선 4×4 → 이동 · 회전(사원수) · 배율. 밀림(shear)은 버린다 */
export function decompose(m: Mat4): { t: number[], r: number[], s: number[] } {
  const col = (c: number): number[] => [m[c]!, m[4 + c]!, m[8 + c]!]
  const cx = col(0), cy = col(1), cz = col(2)
  let sx = Math.hypot(...cx); const sy = Math.hypot(...cy); const sz = Math.hypot(...cz)
  const det = cx[0]! * (cy[1]! * cz[2]! - cy[2]! * cz[1]!) - cy[0]! * (cx[1]! * cz[2]! - cx[2]! * cz[1]!)
    + cz[0]! * (cx[1]! * cy[2]! - cx[2]! * cy[1]!)
  if (det < 0) sx = -sx
  const r00 = cx[0]! / sx, r10 = cx[1]! / sx, r20 = cx[2]! / sx
  const r01 = cy[0]! / sy, r11 = cy[1]! / sy, r21 = cy[2]! / sy
  const r02 = cz[0]! / sz, r12 = cz[1]! / sz, r22 = cz[2]! / sz
  const trace = r00 + r11 + r22
  let x: number, y: number, z: number, w: number
  if (trace > 0) {
    const k = 0.5 / Math.sqrt(trace + 1)
    w = 0.25 / k; x = (r21 - r12) * k; y = (r02 - r20) * k; z = (r10 - r01) * k
  } else if (r00 > r11 && r00 > r22) {
    const k = 2 * Math.sqrt(1 + r00 - r11 - r22)
    w = (r21 - r12) / k; x = 0.25 * k; y = (r01 + r10) / k; z = (r02 + r20) / k
  } else if (r11 > r22) {
    const k = 2 * Math.sqrt(1 + r11 - r00 - r22)
    w = (r02 - r20) / k; x = (r01 + r10) / k; y = 0.25 * k; z = (r12 + r21) / k
  } else {
    const k = 2 * Math.sqrt(1 + r22 - r00 - r11)
    w = (r10 - r01) / k; x = (r02 + r20) / k; y = (r12 + r21) / k; z = 0.25 * k
  }
  const len = Math.hypot(x, y, z, w) || 1
  return { t: [m[3]!, m[7]!, m[11]!], r: [x / len, y / len, z / len, w / len], s: [sx, sy, sz] }
}

/** glTF 노드 행렬(열 우선) */
function columnMajor(m: Mat4): number[] {
  const out: number[] = []
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out.push(m[r * 4 + c]!)
  return out
}

export async function exportField(
  env: Environment,
  encodePng: (rgba: Uint8Array, width: number, height: number) => Promise<Uint8Array>,
  options: { name?: string, maxSize?: number | null, share?: ImageShare } = {},
): Promise<{ glb: Uint8Array, stat: FieldStat }> {
  const name = options.name ?? 'field'
  const filters = env.ofType('MeshFilter')
  if (filters.length === 0) throw new FieldError('MeshFilter가 없다')

  const buf = new GlbBuffer()
  const { images, textures, materials, samplers, slotOf, uvOf, materialName } =
    await bakeLooks(env, encodePng, buf, { maxSize: options.maxSize ?? null, lights: true, share: options.share })

  // ── 메시 · 재질 조합마다 세울 자리를 모은다 ──
  const cache = new Map<number, Mat4>()
  const groups = new Map<string, Group>()
  const meshCache = new Map<number, { mesh: MeshData, wide: boolean } | null>()
  let placed = 0
  let placedTriangles = 0
  for (const filter of filters) {
    const mf = env.readEntry(filter) as Props | null
    if (!mf) continue
    const meshPid = num((mf.m_Mesh as Props | undefined)?.m_PathID)
    let got = meshCache.get(meshPid)
    if (got === undefined) {
      const meshValue = env.read(meshPid) as Props | null
      const holder = env.bundleOf(meshPid)
      try {
        got = meshValue ? { mesh: meshFrom(meshValue, (p) => (holder ? resource(holder, p) : null)), wide: num(meshValue.m_IndexFormat) === 1 } : null
      } catch { got = null }
      if (got && got.mesh.vertexCount === 0) got = null
      meshCache.set(meshPid, got)
    }
    if (!got) continue

    const goPid = num((mf.m_GameObject as Props | undefined)?.m_PathID)
    const go = env.read(goPid) as Props | null
    if (!go) continue
    // ⚠️ **꺼 둔 물체는 안 세운다** (`m_IsActive 0`) — 원작 프리팹이 꺼 둔 것은 게임에서 안 보이는 것이다
    if (num(go.m_IsActive, 1) === 0) continue
    let transformPid = 0
    let slots: number[] = []
    let enabled = true
    for (const c of (go.m_Component as UnityValue[] | undefined) ?? []) {
      const holder = (Array.isArray(c) ? c[1] : c) as Props
      const ptr = (holder.component ?? holder) as Props
      const pid = num(ptr.m_PathID)
      const type = env.entryOf(pid)?.type
      if (type === 'Transform' || type === 'RectTransform') transformPid = pid
      if (type === 'MeshRenderer') {
        const mr = env.read(pid) as Props | null
        slots = ((mr?.m_Materials as Props[] | undefined) ?? []).map((p) => num(p.m_PathID))
        enabled = num(mr?.m_Enabled, 1) !== 0
      }
    }
    if (!enabled || slots.length === 0 || transformPid === 0) continue
    const key = `${String(meshPid)}:${slots.join(',')}`
    const world = worldOf(env, transformPid, cache)
    const g = groups.get(key)
    if (g) g.worlds.push(world)
    else groups.set(key, { meshPid, mesh: got.mesh, wide: got.wide, slots, worlds: [world] })
    placed++
    placedTriangles += got.mesh.subMeshes.reduce((a, s) => a + Math.floor(s.indexCount / 3), 0)
  }
  if (groups.size === 0) throw new FieldError('세울 메시가 하나도 없다')

  // ── 조합마다 메시 한 벌 (제 좌표 · x 뒤집기) ──
  const meshes: Record<string, unknown>[] = []
  const nodes: Record<string, unknown>[] = []
  let triangles = 0
  let instanced = 0
  let lowX = Infinity, highX = -Infinity, lowZ = Infinity, highZ = -Infinity
  const ordered = [...groups.values()].sort((a, b) => a.meshPid - b.meshPid || a.slots.join().localeCompare(b.slots.join()))
  for (const g of ordered) {
    const n = g.mesh.vertexCount
    const rawPos = g.mesh.attributes.get(CHANNEL.position)
    if (!rawPos) continue
    const src = lanes(rawPos, g.mesh.dimensions.get(CHANNEL.position), n, 3, [0, 0, 0])
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { pos[i * 3] = -src[i * 3]!; pos[i * 3 + 1] = src[i * 3 + 1]!; pos[i * 3 + 2] = src[i * 3 + 2]! }
    const rawNrm = lanes(g.mesh.attributes.get(CHANNEL.normal), g.mesh.dimensions.get(CHANNEL.normal), n, 3, [0, 1, 0])
    const nrm = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const x = -rawNrm[i * 3]!, y = rawNrm[i * 3 + 1]!, z = rawNrm[i * 3 + 2]!
      const len = Math.hypot(x, y, z) || 1
      nrm[i * 3] = x / len; nrm[i * 3 + 1] = y / len; nrm[i * 3 + 2] = z / len
    }
    const rawUv = lanes(g.mesh.attributes.get(CHANNEL.uv0), g.mesh.dimensions.get(CHANNEL.uv0), n, 2, [0, 0])
    const aPos = buf.add(pos, 'VEC3', FLOAT, ARRAY_BUFFER, true)
    const aNrm = buf.add(nrm, 'VEC3', FLOAT, ARRAY_BUFFER)
    const uvAccessor = new Map<string, number>()
    const primitives: Record<string, unknown>[] = []
    for (let s = 0; s < g.mesh.subMeshes.length; s++) {
      const sub = g.mesh.subMeshes[s]!
      const first = Math.floor(sub.firstByte / (g.wide ? 4 : 2))
      const tri = g.mesh.indices.subarray(first, first + sub.indexCount)
      if (tri.length < 3) continue
      const pid = s < g.slots.length ? g.slots[s]! : 0
      const mat = materialName.get(pid)
      const slot = mat === undefined ? -1 : (slotOf.get(mat) ?? -1)
      const st = (mat === undefined ? undefined : uvOf.get(mat)) ?? [1, 1, 0, 0]
      const stKey = st.join(',')
      let aUv = uvAccessor.get(stKey)
      if (aUv === undefined) {
        const uvs = new Float32Array(n * 2)
        for (let i = 0; i < n; i++) {
          uvs[i * 2] = rawUv[i * 2]! * st[0] + st[2]
          uvs[i * 2 + 1] = 1 - (rawUv[i * 2 + 1]! * st[1] + st[3])
        }
        aUv = buf.add(uvs, 'VEC2', FLOAT, ARRAY_BUFFER)
        uvAccessor.set(stKey, aUv)
      }
      // x를 뒤집었으므로 감기를 되돌린다
      const idx = new Uint32Array(tri.length - (tri.length % 3))
      for (let i = 0; i + 2 < tri.length; i += 3) { idx[i] = tri[i + 2]!; idx[i + 1] = tri[i + 1]!; idx[i + 2] = tri[i]! }
      triangles += idx.length / 3
      const prim: Record<string, unknown> = {
        attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUv },
        indices: n <= 65536
          ? buf.add(Uint16Array.from(idx), 'SCALAR', USHORT, ELEMENT_BUFFER)
          : buf.add(idx, 'SCALAR', UINT, ELEMENT_BUFFER),
        mode: 4,
      }
      if (slot >= 0) prim.material = slot
      primitives.push(prim)
    }
    if (primitives.length === 0) continue
    meshes.push({ name: `${name}-${String(g.meshPid)}`, primitives })
    const mesh = meshes.length - 1
    const worlds = g.worlds.map(flipped)
    for (const w of worlds) {
      if (w[3]! < lowX) lowX = w[3]!
      if (w[3]! > highX) highX = w[3]!
      if (w[11]! < lowZ) lowZ = w[11]!
      if (w[11]! > highZ) highZ = w[11]!
    }
    if (worlds.length === 1) {
      nodes.push({ mesh, matrix: columnMajor(worlds[0]!) })
      continue
    }
    instanced++
    const t = new Float32Array(worlds.length * 3), r = new Float32Array(worlds.length * 4), sc = new Float32Array(worlds.length * 3)
    worlds.forEach((w, i) => {
      const d = decompose(w)
      t.set(d.t, i * 3); r.set(d.r, i * 4); sc.set(d.s, i * 3)
    })
    nodes.push({
      mesh,
      extensions: {
        EXT_mesh_gpu_instancing: {
          attributes: {
            TRANSLATION: buf.add(t, 'VEC3', FLOAT),
            ROTATION: buf.add(r, 'VEC4', FLOAT),
            SCALE: buf.add(sc, 'VEC3', FLOAT),
          },
        },
      },
    })
  }

  const gltf = {
    asset: { version: '2.0', generator: 'radiant-platinum bdsp field' },
    extensionsUsed: instanced > 0 ? ['EXT_mesh_gpu_instancing'] : undefined,
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    textures,
    images,
    accessors: buf.accessors,
    bufferViews: buf.views,
    buffers: [{ byteLength: buf.byteLength }],
  } as Gltf & { extensionsUsed?: string[] }
  if (!gltf.extensionsUsed) delete gltf.extensionsUsed
  if (samplers.length > 0) gltf.samplers = samplers
  const glb = writeGlb(gltf, buf.bytes())
  return {
    glb,
    stat: {
      placed, unique: groups.size, instanced, triangles, placedTriangles,
      materials: materials.length,
      box: [Math.floor(lowX), Math.floor(lowZ), Math.ceil(highX), Math.ceil(highZ)],
      bytes: glb.byteLength,
      problems: verifyGlb(glb),
    },
  }
}
