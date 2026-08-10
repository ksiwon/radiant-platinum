// BDSP 배틀 무대 번들 → glb — 브라우저에서 (PLAN §4.3 · DATA.md §7.4)
//
// 개발 추출기 `tools/extract/bdspArena.py`를 옮긴 것이다.
//
// ⚠️ **인물 번들과 다르다.** `model.ts`는 `SkinnedMeshRenderer` + 뼈대를 다루고
// 여기는 `MeshFilter` + `Transform` 계층뿐이다. 뼈가 없으므로 **월드 행렬을 정점에
// 구워 넣고** 재질별로 합친다 — 메시 158개를 노드 158개로 두면 드로우콜이 그만큼
// 난다.
//
// ⚠️ **좌표계는 X 뒤집기다.** `model.ts`와 같은 이유다(그쪽 머리말). 손잡이가
// 뒤집히므로 삼각형 감기 순서도 함께 뒤집는다.
import { bakeAlbedo } from './albedo'
import {
  ARRAY_BUFFER, ELEMENT_BUFFER, FLOAT, GlbBuffer, UINT, USHORT,
  verifyGlb, writeGlb, type Gltf,
} from './glb'
import { meshFrom, CHANNEL, type MeshData } from './mesh'
import { resource } from './texture'
import type { Environment } from './environment'
import type { UnityValue } from './typetree'

export class ArenaError extends Error {
  constructor(message: string) { super(message); this.name = 'ArenaError' }
}

type Props = Record<string, UnityValue>
const num = (v: UnityValue | undefined, fallback = 0): number => (typeof v === 'number' ? v : fallback)

/** `[이름, 값]` 짝 목록을 지도로 */
function pairs(entries: UnityValue): Map<string, UnityValue> {
  const out = new Map<string, UnityValue>()
  if (!Array.isArray(entries)) return out
  for (const e of entries as UnityValue[]) {
    if (!Array.isArray(e) || e.length !== 2) continue
    const key = e[0]
    if (typeof key === 'string') out.set(key, e[1] as UnityValue)
  }
  return out
}

// ── 월드 행렬 ────────────────────────────────────────────────────────────────

type Mat4 = Float64Array

/** Transform 하나의 로컬 행렬 (Unity 좌표계 그대로, 행 우선 4×4) */
function localMatrix(t: Props): Mat4 {
  const p = (t.m_LocalPosition ?? {}) as Props
  const q = (t.m_LocalRotation ?? {}) as Props
  const s = (t.m_LocalScale ?? {}) as Props
  const x = num(q.x)
  const y = num(q.y)
  const z = num(q.z)
  const w = num(q.w, 1)
  const sx = num(s.x, 1)
  const sy = num(s.y, 1)
  const sz = num(s.z, 1)
  const m = new Float64Array(16)
  m[0] = (1 - 2 * (y * y + z * z)) * sx
  m[1] = 2 * (x * y - z * w) * sy
  m[2] = 2 * (x * z + y * w) * sz
  m[3] = num(p.x)
  m[4] = 2 * (x * y + z * w) * sx
  m[5] = (1 - 2 * (x * x + z * z)) * sy
  m[6] = 2 * (y * z - x * w) * sz
  m[7] = num(p.y)
  m[8] = 2 * (x * z - y * w) * sx
  m[9] = 2 * (y * z + x * w) * sy
  m[10] = (1 - 2 * (x * x + y * y)) * sz
  m[11] = num(p.z)
  m[15] = 1
  return m
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[r * 4 + k]! * b[k * 4 + c]!
      out[r * 4 + c] = sum
    }
  }
  return out
}

/** 부모를 타고 올라가 월드 행렬을 만든다. 뼈가 없으므로 이걸 정점에 굽는다 */
function worldOf(env: Environment, pathId: number, cache: Map<number, Mat4>): Mat4 {
  const had = cache.get(pathId)
  if (had) return had
  const v = env.read(pathId) as Props | null
  if (!v) {
    const identity = new Float64Array(16)
    identity[0] = identity[5] = identity[10] = identity[15] = 1
    return identity
  }
  let m = localMatrix(v)
  const father = num((v.m_Father as Props | undefined)?.m_PathID)
  // ⚠️ 순환은 실제로 없지만, 먼저 자리를 잡아 두어야 무한 재귀가 안 난다
  cache.set(pathId, m)
  if (father !== 0 && father !== pathId) m = multiply(worldOf(env, father, cache), m)
  cache.set(pathId, m)
  return m
}

// ── 재질 ─────────────────────────────────────────────────────────────────────

/**
 * ⚠️ **투명 여부를 짐작하지 않는다. 번들이 적어 두었다.** 재질마다
 * `stringTagMap`에 유니티의 `RenderType`이 그대로 실려 있다:
 *
 *   Opaque(큐 2000)             벽·바닥·바위 — 안 비친다
 *   TransparentCutout(큐 2450)  잎·풀 — 오려 낸다
 *   Transparent(큐 3000)        창으로 드는 빛·물안개 — 비친다
 *
 * 여태 **전부 오려 내기**로 구웠다. 그래서 체육관 안 창빛이 흰 널빤지로 섰다
 */
function alphaOf(kind: string): Record<string, unknown> {
  if (kind === 'Transparent') return { alphaMode: 'BLEND' }
  // ⚠️ Opaque도 오려 낸다. BDSP 셰이더는 `RenderType`이 Opaque인 재질에도 알파
  // 있는 그림을 물리는 자리가 있고(무대 나무·풀), 불투명으로 두면 잎 사이가
  // 사각형으로 막힌다. 문턱은 유니티의 `_Cutoff` 기본값이다
  return { alphaMode: 'MASK', alphaCutoff: 0.5 }
}

// ── 내보내기 ─────────────────────────────────────────────────────────────────

export interface ArenaOptions {
  /** 무대 한가운데에서 이보다 먼 메시는 버린다 (m). null이면 전부 */
  far?: number | null
  /**
   * 텍스처 긴 변 상한.
   *
   * ⚠️ **무대는 줄이지 않는다.** 인물·포켓몬은 화면에 드는 크기가 정해져 있어
   * 256이면 텍셀이 남지만, 무대 바닥은 배율 (11, 11)로 되풀이하는 그림이라
   * 줄이면 발밑 전체가 뭉갠다. 개발 추출기도 여기는 원본 그대로 굽는다
   */
  maxSize?: number | null
  /** glTF 노드·메시에 적을 이름. 개발 추출기는 번들 이름을 적는다 */
  name?: string
}

export interface ArenaStat {
  meshes: number
  dropped: number
  vertices: number
  triangles: number
  materials: number
  draws: number
  width: number
  height: number
  depth: number
  bytes: number
  problems: string[]
}

interface Part {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint32Array
}

/** 정점당 `want`개 값으로 편다. 없거나 개수가 안 맞으면 `fallback`으로 채운다 */
function lanes(
  raw: Float32Array | undefined, dim: number | undefined,
  n: number, want: number, fallback: readonly number[],
): Float32Array {
  const out = new Float32Array(n * want)
  if (!raw || dim === undefined || dim < want || raw.length < n * dim) {
    for (let i = 0; i < n; i++) for (let k = 0; k < want; k++) out[i * want + k] = fallback[k]!
    return out
  }
  // ⚠️ **성분 개수가 3이라고 가정하면 안 된다.** BDSP 무대 메시의 법선 스트림이
  // 정점당 4성분으로 들어 있는 것이 있다 (`g001`에서 10,444 = 2,611 × 4)
  for (let i = 0; i < n; i++) for (let k = 0; k < want; k++) out[i * want + k] = raw[i * dim + k]!
  return out
}

export async function exportArena(
  env: Environment,
  encodePng: (rgba: Uint8Array, width: number, height: number) => Promise<Uint8Array>,
  options: ArenaOptions = {},
): Promise<{ glb: Uint8Array, stat: ArenaStat }> {
  const far = options.far ?? null
  const name = options.name ?? 'arena'
  const filters = env.ofType('MeshFilter')
  if (filters.length === 0) throw new ArenaError('MeshFilter가 없다')

  // 재질 이름 → RenderType. 짐작하지 않고 번들이 적어 둔 것을 읽는다
  const renderType = new Map<string, string>()
  const materialName = new Map<number, string>()
  for (const e of env.ofType('Material')) {
    const v = env.readEntry(e) as Props | null
    if (!v) continue
    const mat = (v.m_Name as string | undefined) ?? '?'
    materialName.set(e.object.pathId, mat)
    const tags = pairs(v.stringTagMap)
    renderType.set(mat, (tags.get('RenderType') as string | undefined) ?? 'Opaque')
  }

  const buf = new GlbBuffer()
  const images: Record<string, unknown>[] = []
  const textures: Record<string, unknown>[] = []
  const materials: Record<string, unknown>[] = []
  const samplers: { wrapS: number, wrapT: number }[] = []
  const slotOf = new Map<string, number>()
  const uvOf = new Map<string, [number, number, number, number]>()

  // 알베도는 번들 통째로 한 번만 굽는다 (albedo.ts 머리말).
  //
  // ⚠️ **이름순으로 세운다.** 재질 차례가 곧 프리미티브 차례이고, 번들 안
  // 오브젝트 차례는 덤프마다 달라질 수 있다. 개발 추출기도 이름순이라
  // (`sorted(albedo.glob(...))`) parity를 바로 잴 수 있다
  const baked = bakeAlbedo(env, { maxSize: options.maxSize ?? null })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const m of baked) {
    const png = await encodePng(m.pixels, m.width, m.height)
    images.push({ bufferView: buf.view(png), mimeType: 'image/png', name: m.name })
    const want = { wrapS: m.look.wrap[0], wrapT: m.look.wrap[1] }
    let sampler = samplers.findIndex((s) => s.wrapS === want.wrapS && s.wrapT === want.wrapT)
    if (sampler < 0) { samplers.push(want); sampler = samplers.length - 1 }
    textures.push({ source: images.length - 1, sampler })
    materials.push({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorTexture: { index: textures.length - 1 },
        metallicFactor: 0,
        roughnessFactor: 0.9,
      },
      ...alphaOf(renderType.get(m.name) ?? 'Opaque'),
      doubleSided: true,
    })
    slotOf.set(m.name, materials.length - 1)
    // ⚠️ **재질이 적어 둔 UV 배율을 먹여야 한다.** 무대 바닥이 배율 (11, 11)로
    // 되풀이하는 그림이다 — 안 먹이면 타일 121장이 한 장으로 늘어난다
    uvOf.set(m.name, m.look.uv)
  }

  // ⚠️ **그림 없는 재질도 재질이다.** 무대에는 `_MainTex`가 아예 없는 재질이
  // 섞여 있다 — g010의 **바닷물**과 g006의 굴 안 **불빛**이 그렇다. 무늬가 없을
  // 뿐 색은 `_Color`에 들어 있다. 슬롯을 안 주면 glTF 규격상 **흰색 기본 재질**이
  // 붙는다 — 바다가 하얀 판으로 깔리고 굴 안에 흰 널이 선다
  for (const e of env.ofType('Material')) {
    const v = env.readEntry(e) as Props | null
    if (!v) continue
    const mat = (v.m_Name as string | undefined) ?? '?'
    if (slotOf.has(mat)) continue
    const saved = (v.m_SavedProperties ?? {}) as Props
    const colors = pairs(saved.m_Colors)
    const floats = pairs(saved.m_Floats)
    const base = (colors.get('_Color') ?? {}) as Props
    const plain: Record<string, unknown> = {
      name: mat,
      pbrMetallicRoughness: {
        baseColorFactor: [num(base.r, 1), num(base.g, 1), num(base.b, 1), num(base.a, 1)],
        metallicFactor: 0,
        roughnessFactor: 0.9,
      },
      ...alphaOf(renderType.get(mat) ?? 'Opaque'),
      doubleSided: true,
    }
    // 스스로 빛나는 것. 세기까지는 안 옮긴다 — glTF의 `emissiveFactor`는 0~1이라
    // 4배를 실을 수 없다
    const glow = colors.get('_EmissionColor') as Props | undefined
    if (glow && num(floats.get('_EmissionColorIntensity')) > 0) {
      plain.emissiveFactor = [num(glow.r), num(glow.g), num(glow.b)]
    }
    materials.push(plain)
    slotOf.set(mat, materials.length - 1)
  }

  const cache = new Map<number, Mat4>()
  /** 재질 슬롯 → 그 재질로 그리는 조각들 */
  const parts = new Map<number, Part[]>()
  let kept = 0
  let dropped = 0
  let lowX = Infinity; let highX = -Infinity
  let lowY = Infinity; let highY = -Infinity
  let lowZ = Infinity; let highZ = -Infinity

  for (const filter of filters) {
    const mf = env.readEntry(filter) as Props | null
    if (!mf) continue
    const meshPid = num((mf.m_Mesh as Props | undefined)?.m_PathID)
    const meshValue = env.read(meshPid) as Props | null
    if (!meshValue) continue
    let mesh: MeshData
    // ⚠️ 정점 자료가 `.resS`에 나가 있는 메시가 절반이 넘는다 (`meshFrom`)
    const holder = env.bundleOf(meshPid)
    try {
      mesh = meshFrom(meshValue, (p) => (holder ? resource(holder, p) : null))
    } catch { continue }
    if (mesh.vertexCount === 0) continue

    const goPid = num((mf.m_GameObject as Props | undefined)?.m_PathID)
    const go = env.read(goPid) as Props | null
    if (!go) continue
    let transformPid = 0
    let slots: number[] = []
    for (const c of (go.m_Component as UnityValue[] | undefined) ?? []) {
      // ⚠️ **`m_Component`은 `pair<int, PPtr>`의 벡터다.** 타입 트리 판에 따라
      // `[first, second]` 배열로도, `{ component: PPtr }`로도, PPtr 자체로도 온다.
      // 배열 갈래를 빠뜨렸더니 GameObject마다 Transform도 MeshRenderer도 못 찾아
      // **메시를 전부 버렸다** — g001이 6.9MB에서 1.3MB로 줄었고, 그 차이는
      // "무대가 좀 휑하다"로만 보였다
      const holder = (Array.isArray(c) ? c[1] : c) as Props
      const ptr = (holder.component ?? holder) as Props
      const pid = num(ptr.m_PathID)
      const type = env.entryOf(pid)?.type
      if (type === 'Transform' || type === 'RectTransform') transformPid = pid
      if (type === 'MeshRenderer') {
        const mr = env.read(pid) as Props | null
        slots = ((mr?.m_Materials as Props[] | undefined) ?? []).map((p) => num(p.m_PathID))
      }
    }
    // MeshRenderer가 없으면 그리지 않는 메시다 (충돌 전용). 건너뛴다
    if (slots.length === 0 || transformPid === 0) continue

    const world = worldOf(env, transformPid, cache)
    const n = mesh.vertexCount
    const rawPos = mesh.attributes.get(CHANNEL.position)
    if (!rawPos) continue
    const posDim = mesh.dimensions.get(CHANNEL.position)
    const src = lanes(rawPos, posDim, n, 3, [0, 0, 0])
    const verts = new Float32Array(n * 3)
    let nearest = Infinity
    for (let i = 0; i < n; i++) {
      const x = src[i * 3]!; const y = src[i * 3 + 1]!; const z = src[i * 3 + 2]!
      const wx = world[0]! * x + world[1]! * y + world[2]! * z + world[3]!
      const wy = world[4]! * x + world[5]! * y + world[6]! * z + world[7]!
      const wz = world[8]! * x + world[9]! * y + world[10]! * z + world[11]!
      // X 뒤집기 (머리말)
      verts[i * 3] = -wx
      verts[i * 3 + 1] = wy
      verts[i * 3 + 2] = wz
      const d = Math.hypot(wx, wz)
      if (d < nearest) nearest = d
    }
    if (far !== null && nearest > far) { dropped++; continue }
    kept++

    const normals = new Float32Array(n * 3)
    const rawNrm = lanes(mesh.attributes.get(CHANNEL.normal), mesh.dimensions.get(CHANNEL.normal),
      n, 3, [0, 1, 0])
    for (let i = 0; i < n; i++) {
      const x = rawNrm[i * 3]!; const y = rawNrm[i * 3 + 1]!; const z = rawNrm[i * 3 + 2]!
      const wx = world[0]! * x + world[1]! * y + world[2]! * z
      const wy = world[4]! * x + world[5]! * y + world[6]! * z
      const wz = world[8]! * x + world[9]! * y + world[10]! * z
      const len = Math.hypot(wx, wy, wz)
      if (len > 1e-9) {
        normals[i * 3] = -wx / len
        normals[i * 3 + 1] = wy / len
        normals[i * 3 + 2] = wz / len
      } else {
        normals[i * 3 + 1] = 1
      }
    }
    const rawUv = lanes(mesh.attributes.get(CHANNEL.uv0), mesh.dimensions.get(CHANNEL.uv0),
      n, 2, [0, 0])

    const wide = num(meshValue.m_IndexFormat) === 1
    for (let s = 0; s < mesh.subMeshes.length; s++) {
      const sub = mesh.subMeshes[s]!
      const first = Math.floor(sub.firstByte / (wide ? 4 : 2))
      const tri = mesh.indices.subarray(first, first + sub.indexCount)
      if (tri.length < 3) continue
      // 슬롯이 서브메시보다 적으면 그 서브메시는 재질이 없다. **마지막 것을 돌려
      // 쓰지 않는다** — 엉뚱한 그림이 붙는다
      const pid = s < slots.length ? slots[s]! : 0
      const name = materialName.get(pid)
      const slot = name === undefined ? -1 : (slotOf.get(name) ?? -1)
      const [sx, sy, ox, oy] = (name === undefined ? undefined : uvOf.get(name)) ?? [1, 1, 0, 0]
      const uvs = new Float32Array(n * 2)
      for (let i = 0; i < n; i++) {
        uvs[i * 2] = rawUv[i * 2]! * sx + ox
        // Unity는 UV 원점이 왼쪽 아래, glTF는 왼쪽 위다
        uvs[i * 2 + 1] = 1 - (rawUv[i * 2 + 1]! * sy + oy)
      }
      // X를 뒤집었으므로 감기 순서를 되돌린다
      const indices = new Uint32Array(tri.length - (tri.length % 3))
      for (let i = 0; i + 2 < tri.length; i += 3) {
        indices[i] = tri[i + 2]!
        indices[i + 1] = tri[i + 1]!
        indices[i + 2] = tri[i]!
      }
      const list = parts.get(slot)
      const part: Part = { positions: verts, normals, uvs, indices }
      if (list) list.push(part)
      else parts.set(slot, [part])
    }

    for (let i = 0; i < n; i++) {
      const x = verts[i * 3]!; const y = verts[i * 3 + 1]!; const z = verts[i * 3 + 2]!
      if (x < lowX) lowX = x
      if (x > highX) highX = x
      if (y < lowY) lowY = y
      if (y > highY) highY = y
      if (z < lowZ) lowZ = z
      if (z > highZ) highZ = z
    }
  }

  if (parts.size === 0) throw new ArenaError('그릴 메시가 하나도 없다')

  const primitives: Record<string, unknown>[] = []
  let totalV = 0
  let totalT = 0
  for (const slot of [...parts.keys()].sort((a, b) => a - b)) {
    const chunks = parts.get(slot)!
    const count = chunks.reduce((a, c) => a + c.positions.length / 3, 0)
    const idxCount = chunks.reduce((a, c) => a + c.indices.length, 0)
    const pos = new Float32Array(count * 3)
    const nrm = new Float32Array(count * 3)
    const tex = new Float32Array(count * 2)
    const idx = new Uint32Array(idxCount)
    let base = 0
    let atI = 0
    for (const c of chunks) {
      pos.set(c.positions, base * 3)
      nrm.set(c.normals, base * 3)
      tex.set(c.uvs, base * 2)
      for (let i = 0; i < c.indices.length; i++) idx[atI + i] = c.indices[i]! + base
      atI += c.indices.length
      base += c.positions.length / 3
    }
    totalV += count
    totalT += idxCount / 3
    const prim: Record<string, unknown> = {
      attributes: {
        POSITION: buf.add(pos, 'VEC3', FLOAT, ARRAY_BUFFER, true),
        NORMAL: buf.add(nrm, 'VEC3', FLOAT, ARRAY_BUFFER),
        TEXCOORD_0: buf.add(tex, 'VEC2', FLOAT, ARRAY_BUFFER),
      },
      // 색인은 정점이 65,536개 안쪽이면 16비트로 넣는다 — 무대 하나에서 0.8MB가
      // 빠진다. glTF는 둘 다 허용한다
      indices: count <= 65536
        ? buf.add(Uint16Array.from(idx), 'SCALAR', USHORT, ELEMENT_BUFFER)
        : buf.add(idx, 'SCALAR', UINT, ELEMENT_BUFFER),
      mode: 4,
    }
    if (slot >= 0) prim.material = slot
    primitives.push(prim)
  }

  const gltf: Gltf = {
    asset: { version: '2.0', generator: 'radiant-platinum bdsp arena' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives }],
    materials,
    textures,
    images,
    accessors: buf.accessors,
    bufferViews: buf.views,
    buffers: [{ byteLength: buf.byteLength }],
  }
  // 빈 배열은 glTF가 안 받는다
  if (samplers.length > 0) gltf.samplers = samplers

  const glb = writeGlb(gltf, buf.bytes())
  return {
    glb,
    stat: {
      meshes: kept,
      dropped,
      vertices: totalV,
      triangles: totalT,
      materials: materials.length,
      draws: primitives.length,
      width: Number((highX - lowX).toFixed(2)),
      height: Number((highY - lowY).toFixed(2)),
      depth: Number((highZ - lowZ).toFixed(2)),
      bytes: glb.byteLength,
      problems: verifyGlb(glb),
    },
  }
}
