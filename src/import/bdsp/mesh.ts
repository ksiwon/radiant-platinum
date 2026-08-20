// Unity Mesh → 우리 메시 (IMPORT.md §12)
//
// 정점은 배열이 아니라 **바이트 뭉치 하나**에 스트림별로 섞여 있다. 어느 자리가
// 무엇인지는 `m_Channels` 14칸이 말한다 — 채널마다 (스트림, 오프셋, 형식, 차원).
// 스트림 하나 안에서 정점 하나가 차지하는 폭(stride)은 그 스트림에 속한 채널들의
// 끝 중 가장 먼 것을 4로 올림한 값이다.
//
// ⚠️ **stride를 채널 순서로 더해 구하면 안 된다.** 채널이 스트림별로 흩어져 있고
// 쓰지 않는 채널(차원 0)이 중간에 끼어 있다. 실측 tr0040: 스트림 0이 32B(위치·법선·
// 탄젠트), 1이 12B(색·UV), 2가 32B(뼈 가중치·색인)이고 합이 76B × 7693 ≠ 615456이다.
// 스트림 경계는 **정점 수만큼 지난 뒤**에 다음 스트림이 시작한다.
import { className, type SerializedFile, type UnityObject } from './unityfs'
import type { UnityValue } from './typetree'

/** `m_Channels`의 형식 번호 → 읽는 법 */
const VertexFormat = {
  Float: 0,
  Float16: 1,
  UNorm8: 2,
  SNorm8: 3,
  UNorm16: 4,
  SNorm16: 5,
  UInt8: 6,
  SInt8: 7,
  UInt16: 8,
  SInt16: 9,
  UInt32: 10,
  SInt32: 11,
} as const

const FORMAT_BYTES: Readonly<Record<number, number>> = {
  0: 4, 1: 2, 2: 1, 3: 1, 4: 2, 5: 2, 6: 1, 7: 1, 8: 2, 9: 2, 10: 4, 11: 4,
}

/** 채널 차례 = 무엇인가. Unity 2019의 `VertexAttribute` 순서다 */
export const CHANNEL = {
  position: 0, normal: 1, tangent: 2, color: 3,
  uv0: 4, uv1: 5, uv2: 6, uv3: 7, uv4: 8, uv5: 9, uv6: 10, uv7: 11,
  blendWeight: 12, blendIndices: 13,
} as const

export interface Channel { stream: number, offset: number, format: number, dimension: number }

interface SubMesh {
  firstByte: number
  indexCount: number
  topology: number
  baseVertex: number
  firstVertex: number
  vertexCount: number
}

export interface MeshData {
  name: string
  vertexCount: number
  /** 채널 차례 → 정점당 값들 (평평한 배열). 없는 채널은 빠져 있다 */
  attributes: Map<number, Float32Array>
  /** 채널 차례 → 정점당 정수 값 (뼈 색인처럼 정수여야 하는 것) */
  intAttributes: Map<number, Uint16Array>
  /** 채널 차례 → 한 정점이 몇 개를 쓰는가 */
  dimensions: Map<number, number>
  indices: Uint32Array
  subMeshes: SubMesh[]
  /** 뼈 하나당 4×4 역바인드 행렬. 없으면 빈 배열 */
  bindPose: Float32Array
  boneNameHashes: Uint32Array
}

export class MeshError extends Error {
  constructor(message: string) { super(message); this.name = 'MeshError' }
}

/**
 * 스트림별 stride와 시작 자리.
 *
 * 스트림 s의 stride는 그 스트림 채널들의 `offset + 폭×차원` 중 최대를 4로 올린 값,
 * 시작 자리는 앞 스트림들의 `stride × 정점 수`를 16으로 올려 이어 붙인 값이다
 */
export function streamLayout(
  channels: readonly Channel[], vertexCount: number,
): { stride: number, start: number }[] {
  const streams = Math.max(0, ...channels.map((c) => (c.dimension > 0 ? c.stream : 0))) + 1
  const out: { stride: number, start: number }[] = []
  let at = 0
  for (let s = 0; s < streams; s++) {
    let end = 0
    for (const c of channels) {
      if (c.dimension === 0 || c.stream !== s) continue
      const bytes = FORMAT_BYTES[c.format]
      if (bytes === undefined) throw new MeshError(`모르는 정점 형식 ${String(c.format)}`)
      end = Math.max(end, c.offset + bytes * c.dimension)
    }
    const stride = (end + 3) & ~3
    out.push({ stride, start: at })
    // 다음 스트림은 16바이트 경계에서 시작한다
    at = (at + stride * vertexCount + 15) & ~15
  }
  return out
}

const readAt = (
  view: DataView, at: number, format: number, little: boolean,
): number => {
  switch (format) {
    case VertexFormat.Float: return view.getFloat32(at, little)
    case VertexFormat.Float16: return float16(view.getUint16(at, little))
    case VertexFormat.UNorm8: return view.getUint8(at) / 255
    case VertexFormat.SNorm8: return Math.max(-1, view.getInt8(at) / 127)
    case VertexFormat.UNorm16: return view.getUint16(at, little) / 65535
    case VertexFormat.SNorm16: return Math.max(-1, view.getInt16(at, little) / 32767)
    case VertexFormat.UInt8: return view.getUint8(at)
    case VertexFormat.SInt8: return view.getInt8(at)
    case VertexFormat.UInt16: return view.getUint16(at, little)
    case VertexFormat.SInt16: return view.getInt16(at, little)
    case VertexFormat.UInt32: return view.getUint32(at, little)
    case VertexFormat.SInt32: return view.getInt32(at, little)
    default: throw new MeshError(`모르는 정점 형식 ${String(format)}`)
  }
}

/** 반정밀도 부동소수. `DataView`에 없어서 손으로 편다 */
export function float16(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1
  const exp = (bits >> 10) & 0x1f
  const frac = bits & 0x3ff
  if (exp === 0) return sign * frac * 2 ** -24
  if (exp === 31) return frac ? NaN : sign * Infinity
  return sign * (1 + frac / 1024) * 2 ** (exp - 15)
}

/** 정수로 읽어야 하는 채널 — 뼈 색인은 반올림하면 다른 뼈가 된다 */
const INT_CHANNELS = new Set<number>([CHANNEL.blendIndices])

export function readMesh(value: Record<string, UnityValue>, little = true): MeshData {
  const vd = value.m_VertexData as Record<string, UnityValue> | undefined
  if (!vd) throw new MeshError('m_VertexData가 없다')
  const compressed = value.m_CompressedMesh as Record<string, UnityValue> | undefined
  const packedVerts = (compressed?.m_Vertices as Record<string, UnityValue> | undefined)?.m_NumItems
  if (typeof packedVerts === 'number' && packedVerts > 0) {
    // ⚠️ 압축 메시는 아직 안 푼다. **짐작으로 채우지 않는다** — BDSP 실측에서는
    // 3,000개 넘는 메시가 전부 비압축이었다. 나오면 알고 싶다
    throw new MeshError('압축 메시(m_CompressedMesh)는 아직 못 푼다')
  }

  const vertexCount = vd.m_VertexCount as number
  const channels = (vd.m_Channels as Record<string, number>[]).map((c): Channel => ({
    stream: c.stream, offset: c.offset, format: c.format,
    // ⚠️ **`dimension`의 윗 네 비트는 차원이 아니라 플래그다.** 실측 무대 메시의
    // 법선 채널이 52(0x34)로 들어 있다 — 그대로 쓰면 stride가 36 대신 116이 되고
    // "채널이 정점 자료 밖을 가리킨다"로 죽는다. g001 메시 158개 중 107개가
    // 그렇게 통째로 버려지고 있었고, 화면에서는 무대가 조금 휑한 것으로만 보였다
    dimension: c.dimension & 0x0f,
  }))
  const data = vd.m_DataSize as Uint8Array
  const layout = streamLayout(channels, vertexCount)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  const attributes = new Map<number, Float32Array>()
  const intAttributes = new Map<number, Uint16Array>()
  const dimensions = new Map<number, number>()
  channels.forEach((c, i) => {
    if (c.dimension === 0) return
    const stream = layout[c.stream]
    if (!stream) throw new MeshError(`채널 ${String(i)}이 없는 스트림 ${String(c.stream)}을 가리킨다`)
    const bytes = FORMAT_BYTES[c.format]!
    const need = stream.start + stream.stride * (vertexCount - 1) + c.offset + bytes * c.dimension
    if (need > data.byteLength) {
      throw new MeshError(
        `채널 ${String(i)}이 정점 자료 밖을 가리킨다 (${String(need)} > ${String(data.byteLength)})`,
      )
    }
    dimensions.set(i, c.dimension)
    if (INT_CHANNELS.has(i)) {
      const out = new Uint16Array(vertexCount * c.dimension)
      for (let v = 0; v < vertexCount; v++) {
        const base = stream.start + stream.stride * v + c.offset
        for (let k = 0; k < c.dimension; k++) {
          out[v * c.dimension + k] = readAt(view, base + bytes * k, c.format, little)
        }
      }
      intAttributes.set(i, out)
      return
    }
    const out = new Float32Array(vertexCount * c.dimension)
    for (let v = 0; v < vertexCount; v++) {
      const base = stream.start + stream.stride * v + c.offset
      for (let k = 0; k < c.dimension; k++) {
        out[v * c.dimension + k] = readAt(view, base + bytes * k, c.format, little)
      }
    }
    attributes.set(i, out)
  })

  // 색인은 u16(형식 0) 또는 u32(형식 1)
  const raw = value.m_IndexBuffer as Uint8Array
  const wide = (value.m_IndexFormat as number) === 1
  const iv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const count = Math.floor(raw.byteLength / (wide ? 4 : 2))
  const indices = new Uint32Array(count)
  for (let i = 0; i < count; i++) {
    indices[i] = wide ? iv.getUint32(i * 4, little) : iv.getUint16(i * 2, little)
  }

  const subMeshes = (value.m_SubMeshes as Record<string, number>[]).map((s): SubMesh => ({
    firstByte: s.firstByte,
    indexCount: s.indexCount,
    topology: s.topology,
    baseVertex: s.baseVertex,
    firstVertex: s.firstVertex,
    vertexCount: s.vertexCount,
  }))

  const bind = (value.m_BindPose as Record<string, number>[] | undefined) ?? []
  const bindPose = new Float32Array(bind.length * 16)
  bind.forEach((m, i) => {
    const keys = [
      'e00', 'e01', 'e02', 'e03', 'e10', 'e11', 'e12', 'e13',
      'e20', 'e21', 'e22', 'e23', 'e30', 'e31', 'e32', 'e33',
    ]
    keys.forEach((k, j) => { bindPose[i * 16 + j] = m[k] ?? 0 })
  })

  return {
    name: (value.m_Name as string | undefined) ?? '',
    vertexCount,
    attributes,
    intAttributes,
    dimensions,
    indices,
    subMeshes,
    bindPose,
    boneNameHashes: Uint32Array.from((value.m_BoneNameHashes as number[] | undefined) ?? []),
  }
}

/**
 * 정점 자료가 `.resS`에 나가 있는 메시를 이어 붙여 읽는다.
 *
 * ⚠️ **큰 메시는 `m_DataSize`가 비어 있다.** Unity가 정점 뭉치를 번들 안의
 * 리소스 파일로 빼고 `m_StreamData`에 (오프셋, 길이, 경로)만 남긴다 — 텍스처와
 * 같은 방식이다. 이걸 안 이으면 `readMesh`가 "채널이 정점 자료 밖을 가리킨다"로
 * 죽는다. 무대 g001은 메시 158개 중 **107개**가 그쪽이었고, 그 상태로 구운 glb는
 * 1.3MB짜리 휑한 땅이었다 (제대로 구우면 7.0MB)
 */
export function meshFrom(
  value: Record<string, UnityValue>,
  resource: (path: string) => Uint8Array | null,
  little = true,
): MeshData {
  const stream = value.m_StreamData as Record<string, UnityValue> | undefined
  const size = typeof stream?.size === 'number' ? stream.size : 0
  const path = typeof stream?.path === 'string' ? stream.path : ''
  if (size <= 0 || path === '') return readMesh(value, little)

  const vd = value.m_VertexData as Record<string, UnityValue> | undefined
  const have = vd?.m_DataSize
  // 이미 안에 들어 있으면 그대로 쓴다 — 둘 다 있는 판은 안 봤지만, 있으면
  // 파일 안의 것이 임자다
  if (have instanceof Uint8Array && have.byteLength > 0) return readMesh(value, little)

  const blob = resource(path)
  if (!blob) throw new MeshError(`메시 스트림 ${path}을(를) 못 찾았다`)
  const offset = typeof stream?.offset === 'number' ? stream.offset : 0
  if (offset + size > blob.byteLength) {
    throw new MeshError(
      `메시 스트림이 리소스 밖을 가리킨다 (${String(offset + size)} > ${String(blob.byteLength)})`,
    )
  }
  return readMesh(
    { ...value, m_VertexData: { ...vd, m_DataSize: blob.subarray(offset, offset + size) } },
    little,
  )
}

/** 파일 안의 모든 Mesh */
export function meshesOf(ser: SerializedFile): { object: UnityObject, mesh: MeshData }[] {
  const out: { object: UnityObject, mesh: MeshData }[] = []
  for (const o of ser.objects) {
    if (className(o.classId) !== 'Mesh') continue
    const v = ser.read(o)
    if (!v || typeof v !== 'object') continue
    out.push({ object: o, mesh: readMesh(v as Record<string, UnityValue>) })
  }
  return out
}
