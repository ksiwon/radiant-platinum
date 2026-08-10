// glTF 2.0 바이너리(GLB) 쓰기 — 브라우저에서 (IMPORT.md §12)
//
// 개발 추출기는 파이썬에서 numpy로 접근자를 쌓아 같은 규격을 쓴다
// (`tools/extract/bdspGlb.py`의 `Buffer`·`write_glb`). 여기 있는 것은 그 계약을
// 그대로 옮긴 것이다 — three.js가 읽는 파일이 개발판과 공개판에서 같아야 한다.
//
// ⚠️ **접근자 오프셋은 요소 크기의 배수여야 한다.** 4로 맞춰 두면 우리가 쓰는
// 것(float32·uint32·uint16)이 다 든다. 안 맞추면 three가 조용히 어긋난 값을
// 읽거나 브라우저마다 다르게 터진다.

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

export const FLOAT = 5126
export const USHORT = 5123
export const UINT = 5125
export const ARRAY_BUFFER = 34962
export const ELEMENT_BUFFER = 34963

export type AccessorType = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4'

const PARTS: Readonly<Record<AccessorType, number>> = {
  SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16,
}
const BYTES: Readonly<Record<number, number>> = { [FLOAT]: 4, [USHORT]: 2, [UINT]: 4 }

export interface BufferView {
  buffer: number
  byteOffset: number
  byteLength: number
  target?: number
}

export interface Accessor {
  bufferView: number
  componentType: number
  count: number
  type: AccessorType
  min?: number[]
  max?: number[]
}

export class GlbError extends Error {
  constructor(message: string) { super(message); this.name = 'GlbError' }
}

/** 접근자를 붙여 가며 바이너리 한 덩이를 쌓는다 */
export class GlbBuffer {
  readonly views: BufferView[] = []
  readonly accessors: Accessor[] = []
  private readonly chunks: Uint8Array[] = []
  private length = 0

  /** 자료 한 덩이를 넣고 뷰 번호를 준다 */
  view(data: Uint8Array, target?: number): number {
    while (this.length % 4 !== 0) { this.chunks.push(new Uint8Array(1)); this.length++ }
    this.views.push({
      buffer: 0, byteOffset: this.length, byteLength: data.byteLength,
      ...(target === undefined ? {} : { target }),
    })
    this.chunks.push(data)
    this.length += data.byteLength
    return this.views.length - 1
  }

  /**
   * 배열 하나를 접근자로. `count`는 **요소 수**지 값의 개수가 아니다.
   *
   * `minmax`를 주면 성분별 최소·최대를 적는다 — glTF는 `POSITION`에 이것을
   * 요구하고, 없으면 뷰어가 경계 상자를 못 만든다
   */
  add(
    data: Float32Array | Uint32Array | Uint16Array, type: AccessorType,
    componentType: number, target?: number, minmax = false,
  ): number {
    const parts = PARTS[type]
    if (data.length % parts !== 0) {
      throw new GlbError(`${type}인데 값이 ${String(data.length)}개다 — ${String(parts)}로 안 떨어진다`)
    }
    const count = data.length / parts
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    const acc: Accessor = { bufferView: this.view(bytes.slice(), target), componentType, count, type }
    if (minmax) {
      const min = new Array<number>(parts).fill(Infinity)
      const max = new Array<number>(parts).fill(-Infinity)
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < parts; k++) {
          const v = data[i * parts + k]!
          if (v < min[k]!) min[k] = v
          if (v > max[k]!) max[k] = v
        }
      }
      acc.min = min
      acc.max = max
    }
    this.accessors.push(acc)
    return this.accessors.length - 1
  }

  get byteLength(): number { return this.length }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.length)
    let at = 0
    for (const c of this.chunks) { out.set(c, at); at += c.byteLength }
    return out
  }
}

export interface Gltf {
  asset: { version: string, generator: string }
  scene: number
  scenes: { nodes: number[] }[]
  nodes: Record<string, unknown>[]
  meshes: Record<string, unknown>[]
  skins?: Record<string, unknown>[]
  materials?: Record<string, unknown>[]
  textures?: Record<string, unknown>[]
  images?: Record<string, unknown>[]
  samplers?: Record<string, unknown>[]
  animations?: Record<string, unknown>[]
  accessors: Accessor[]
  bufferViews: BufferView[]
  buffers: { byteLength: number }[]
}

/** GLB 한 덩이로 묶는다 */
export function writeGlb(gltf: Gltf, blob: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(gltf))
  const jsonPad = (4 - (json.byteLength % 4)) % 4
  const binPad = (4 - (blob.byteLength % 4)) % 4
  const total = 12 + 8 + json.byteLength + jsonPad + 8 + blob.byteLength + binPad
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, json.byteLength + jsonPad, true)
  view.setUint32(16, JSON_CHUNK, true)
  out.set(json, 20)
  // JSON 청크의 남는 자리는 **빈칸**이다. 0으로 채우면 파서가 문자열 끝을 못 찾는다
  for (let i = 0; i < jsonPad; i++) out[20 + json.byteLength + i] = 0x20
  const binAt = 20 + json.byteLength + jsonPad
  view.setUint32(binAt, blob.byteLength + binPad, true)
  view.setUint32(binAt + 4, BIN_CHUNK, true)
  out.set(blob, binAt + 8)
  return out
}

/**
 * 쓴 파일을 다시 읽어 glTF 규칙을 확인한다.
 *
 * ⚠️ **여기서 잡는 것과 못 잡는 것을 구분해 둔다.** 잡는 것은 구조다 — 청크 길이,
 * 접근자가 뷰 밖을 가리키는지, 관절 번호가 스킨 밖인지, 가중치 합이 1인지.
 * **모델이 제대로 서 있는지는 못 잡는다.** 감기 순서만 `outwardRatio`가 대신 잰다.
 * 개발 추출기의 `verify`와 같은 목록이다 — 한쪽만 느슨해지면 안 된다
 */
export function verifyGlb(raw: Uint8Array): string[] {
  const bad: string[] = []
  if (raw.byteLength < 20) return ['glb가 너무 짧다']
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC) return ['glb 매직이 아니다']
  if (view.getUint32(4, true) !== 2) bad.push(`버전이 ${String(view.getUint32(4, true))}이다`)
  if (view.getUint32(8, true) !== raw.byteLength) {
    bad.push(`헤더 길이 ${String(view.getUint32(8, true))} ≠ 실제 ${String(raw.byteLength)}`)
  }

  const chunks = new Map<number, Uint8Array>()
  let at = 12
  while (at + 8 <= raw.byteLength) {
    const size = view.getUint32(at, true)
    const kind = view.getUint32(at + 4, true)
    chunks.set(kind, raw.subarray(at + 8, at + 8 + size))
    at += 8 + size
  }
  const jsonChunk = chunks.get(JSON_CHUNK)
  const blob = chunks.get(BIN_CHUNK)
  if (!jsonChunk || !blob) return [...bad, '청크가 모자란다']

  let g: Gltf
  try {
    g = JSON.parse(new TextDecoder().decode(jsonChunk)) as Gltf
  } catch (e) {
    return [...bad, `JSON을 못 읽었다: ${String(e)}`]
  }
  if (g.buffers[0]!.byteLength > blob.byteLength) bad.push('버퍼가 선언보다 짧다')

  g.accessors.forEach((acc, i) => {
    const v = g.bufferViews[acc.bufferView]
    if (!v) { bad.push(`접근자 ${String(i)}가 없는 뷰를 가리킨다`); return }
    const want = acc.count * PARTS[acc.type] * (BYTES[acc.componentType] ?? 0)
    if (want > v.byteLength) bad.push(`접근자 ${String(i)}가 뷰 밖을 가리킨다 (${String(want)} > ${String(v.byteLength)})`)
    if (v.byteOffset + v.byteLength > blob.byteLength) bad.push(`뷰 ${String(acc.bufferView)}가 버퍼 밖이다`)
  })

  const read = (index: number): Float32Array | Uint32Array | Uint16Array => {
    const acc = g.accessors[index]!
    const v = g.bufferViews[acc.bufferView]!
    const n = acc.count * PARTS[acc.type]
    const start = blob.byteOffset + v.byteOffset
    if (acc.componentType === FLOAT) return new Float32Array(blob.buffer.slice(start, start + n * 4))
    if (acc.componentType === UINT) return new Uint32Array(blob.buffer.slice(start, start + n * 4))
    return new Uint16Array(blob.buffer.slice(start, start + n * 2))
  }

  const nodeCount = g.nodes.length
  g.meshes.forEach((mesh, m) => {
    const skin = g.skins?.[m] as { joints?: number[], inverseBindMatrices?: number } | undefined
    if (skin?.joints) {
      if (skin.joints.some((j) => j >= nodeCount)) bad.push(`스킨 ${String(m)}의 관절이 노드 밖을 가리킨다`)
      const ibm = skin.inverseBindMatrices
      if (ibm !== undefined && g.accessors[ibm]!.count !== skin.joints.length) {
        bad.push(`스킨 ${String(m)}: 역바인드 행렬 수가 관절 수와 다르다`)
      }
    }
    for (const prim of mesh.primitives as { attributes: Record<string, number>, indices: number }[]) {
      const verts = g.accessors[prim.attributes.POSITION!]!.count
      for (const [name, index] of Object.entries(prim.attributes)) {
        const n = g.accessors[index]!.count
        if (n !== verts) bad.push(`메시 ${String(m)}: ${name}이 ${String(n)}개인데 정점은 ${String(verts)}개다`)
      }
      const idx = read(prim.indices)
      let maxIndex = 0
      for (const v of idx) if (v > maxIndex) maxIndex = v
      if (maxIndex >= verts) bad.push(`메시 ${String(m)}: 인덱스가 정점 수(${String(verts)})를 넘는다`)
      if (idx.length % 3 !== 0) bad.push(`메시 ${String(m)}: 삼각형이 셋으로 안 떨어진다`)
      if (skin?.joints && prim.attributes.JOINTS_0 !== undefined) {
        const joints = read(prim.attributes.JOINTS_0)
        let maxJoint = 0
        for (const v of joints) if (v > maxJoint) maxJoint = v
        if (maxJoint >= skin.joints.length) bad.push(`메시 ${String(m)}: 관절 번호가 스킨을 넘는다`)
      }
      if (prim.attributes.WEIGHTS_0 !== undefined) {
        const w = read(prim.attributes.WEIGHTS_0)
        let off = 0
        for (let i = 0; i + 4 <= w.length; i += 4) {
          const sum = w[i]! + w[i + 1]! + w[i + 2]! + w[i + 3]!
          if (Math.abs(sum - 1) > 1e-3) off++
        }
        if (off) bad.push(`메시 ${String(m)}: 가중치 합이 1이 아닌 정점 ${String(off)}개`)
      }
    }
  })

  ;(g.animations ?? []).forEach((anim, a) => {
    const samplers = anim.samplers as { input: number, output: number }[]
    for (const ch of anim.channels as { sampler: number, target: { node: number, path: string } }[]) {
      if (ch.target.node >= nodeCount) bad.push(`클립 ${String(a)}: 채널이 노드 밖을 가리킨다`)
      const s = samplers[ch.sampler]!
      if (g.accessors[s.input]!.count !== g.accessors[s.output]!.count) {
        bad.push(`클립 ${String(a)}: 키 ${String(g.accessors[s.input]!.count)}개에 값 ${String(g.accessors[s.output]!.count)}개`)
      }
      const times = read(s.input)
      for (let i = 1; i < times.length; i++) {
        if (times[i]! <= times[i - 1]!) { bad.push(`클립 ${String(a)}: 시각이 오름차순이 아니다`); break }
      }
      if (ch.target.path === 'rotation') {
        const q = read(s.output)
        for (let i = 0; i + 4 <= q.length; i += 4) {
          const n = Math.hypot(q[i]!, q[i + 1]!, q[i + 2]!, q[i + 3]!)
          if (Math.abs(n - 1) > 1e-3) { bad.push(`클립 ${String(a)}: 회전이 단위 사원수가 아니다`); break }
        }
      }
    }
  })

  return bad
}

/**
 * 삼각형 법선이 바깥을 보는 비율.
 *
 * ⚠️ **감기 순서가 맞는지 재는 유일한 방법이다.** 사람 모양은 대체로 닫힌
 * 껍데기라 무게중심에서 바깥으로 향하는 면이 대부분이어야 한다. 뒤집혀 있으면
 * 0.5 아래로 떨어진다 — 화면으로 보기 전에 여기서 걸린다
 */
export function outwardRatio(verts: Float32Array, indices: Uint32Array): number {
  let out = 0
  let total = 0
  let cx = 0
  let cy = 0
  let cz = 0
  const n = verts.length / 3
  for (let i = 0; i < n; i++) { cx += verts[i * 3]!; cy += verts[i * 3 + 1]!; cz += verts[i * 3 + 2]! }
  cx /= n; cy /= n; cz /= n
  for (let t = 0; t + 3 <= indices.length; t += 3) {
    const a = indices[t]! * 3
    const b = indices[t + 1]! * 3
    const c = indices[t + 2]! * 3
    const abx = verts[b]! - verts[a]!
    const aby = verts[b + 1]! - verts[a + 1]!
    const abz = verts[b + 2]! - verts[a + 2]!
    const acx = verts[c]! - verts[a]!
    const acy = verts[c + 1]! - verts[a + 1]!
    const acz = verts[c + 2]! - verts[a + 2]!
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    const mx = (verts[a]! + verts[b]! + verts[c]!) / 3 - cx
    const my = (verts[a + 1]! + verts[b + 1]! + verts[c + 1]!) / 3 - cy
    const mz = (verts[a + 2]! + verts[b + 2]! + verts[c + 2]!) / 3 - cz
    if (nx * mx + ny * my + nz * mz > 0) out++
    total++
  }
  return total === 0 ? 0 : out / total
}
