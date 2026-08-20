// NSBMD(BMD0) — 브라우저에서 (DATA.md §2.2)
//
// land_data 청크마다 `BMD0` 덩어리가 들어 있고 그게 신오의 진짜 땅이다.
// NSBMD는 NDS GPU의 **디스플레이 리스트**를 그대로 담는다 — 정점이 배열로 있는 게
// 아니라 "지금부터 삼각형 띠, 정점 (x,y,z), 정점 …" 하는 명령 흐름이라 GPU 명령을
// 해석해야 삼각형이 나온다.
//
// ⚠️ **검증은 헤더가 해 준다.** MDL0가 정점·삼각형·사각형 수를 적어 두므로 우리가
// 명령을 풀어 센 것과 한 개도 안 틀려야 한다. 명령 폭을 하나만 잘못 알아도 그 뒤가
// 전부 밀리므로 우연히 맞을 수 없다 — `chunks.test.ts`가 666개를 다 센다.

/** 20.12 고정소수점 */
export const fx32 = (v: number): number => v / 4096
/** 1.3.12 고정소수점 (정점 좌표) */
const fx16 = (v: number): number => v / 4096

interface DictEntry { name: string, at: number, itemSize: number }

const ascii = (b: Uint8Array): string => {
  let s = ''
  for (const c of b) { if (c === 0) break; s += String.fromCharCode(c) }
  return s
}

/**
 * NNS G3D의 이름표 목록.
 *
 * 세 토막이다 — 머리, 쓰지 않는 패턴 블록, 그리고 자료 블록. 마지막에 16바이트짜리
 * 이름이 개수만큼 붙는다. 자료의 크기(`itemSize`)가 블록마다 달라서 그걸 읽지 않고는
 * 이름 자리를 못 찾는다
 */
export function readDict(buf: Uint8Array, view: DataView, at: number): DictEntry[] {
  const count = buf[at + 1]!
  // 머리 4바이트 + 패턴 블록. 패턴 블록은 자기 크기를 헤더에 갖고 있다
  let p = at + 4
  const headerSize = view.getUint16(p, true)
  p += headerSize + count * 4
  const itemSize = view.getUint16(p, true)
  p += 4
  const dataAt = p
  const namesAt = dataAt + count * itemSize
  const out: DictEntry[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      name: ascii(buf.subarray(namesAt + i * 16, namesAt + i * 16 + 16)),
      at: dataAt + i * itemSize,
      itemSize,
    })
  }
  return out
}

/** GPU 명령별 파라미터 워드 수. 모델에 실제로 나오는 것만 적는다 */
const PARAMS: Readonly<Record<number, number>> = {
  0x00: 0, // NOP
  0x10: 1, // MTX_MODE
  0x11: 0, // MTX_PUSH
  0x12: 1, // MTX_POP
  0x13: 1, // MTX_STORE
  0x14: 1, // MTX_RESTORE
  0x15: 0, // MTX_IDENTITY
  0x16: 16, 0x17: 12, 0x18: 16, 0x19: 12, 0x1a: 9,
  0x1b: 3, // MTX_SCALE
  0x1c: 3, // MTX_TRANS
  0x20: 1, // COLOR
  0x21: 1, // NORMAL
  0x22: 1, // TEXCOORD
  0x23: 2, // VTX_16
  0x24: 1, // VTX_10
  0x25: 1, // VTX_XY
  0x26: 1, // VTX_XZ
  0x27: 1, // VTX_YZ
  0x28: 1, // VTX_DIFF
  0x29: 1, // POLYGON_ATTR
  0x2a: 1, // TEXIMAGE_PARAM
  0x2b: 1, // PLTT_BASE
  0x30: 1, // DIF_AMB
  0x31: 1, // SPE_EMI
  0x32: 1, // LIGHT_VECTOR
  0x33: 1, // LIGHT_COLOR
  0x34: 32, // SHININESS
  0x40: 1, // BEGIN_VTXS
  0x41: 0, // END_VTXS
}

/** 프리미티브 종류 */
export const PRIM = ['tri', 'quad', 'tristrip', 'quadstrip'] as const

export type Vec3 = [number, number, number]

/**
 * 디스플레이 리스트를 푼다.
 *
 * 명령은 **4개씩 묶여** 온다: 명령 번호 4바이트 다음에 그 넷의 파라미터가 차례로
 * 붙는다. 이 묶음 규칙을 모르면 첫 명령부터 어긋난다
 */
export function runDisplayList(dl: Uint8Array, sink: (op: number, params: number[]) => void): void {
  const view = new DataView(dl.buffer, dl.byteOffset, dl.byteLength)
  let p = 0
  while (p + 4 <= dl.byteLength) {
    const ops = [dl[p]!, dl[p + 1]!, dl[p + 2]!, dl[p + 3]!]
    p += 4
    for (const op of ops) {
      const n = PARAMS[op]
      if (n === undefined) {
        throw new Error(`모르는 GPU 명령 0x${op.toString(16)} (오프셋 ${String(p)})`)
      }
      const params: number[] = []
      for (let i = 0; i < n; i++) {
        params.push(view.getUint32(p, true))
        p += 4
      }
      sink(op, params)
    }
  }
}

/** 부호 있는 n비트 정수 */
const signed = (v: number, bits: number): number =>
  (v & (1 << (bits - 1)) ? v - (1 << bits) : v)

/**
 * 정점 명령을 좌표로.
 *
 * 좌표를 줄이는 방식이 다섯 가지다 — 16비트 셋, 10비트 하나, 두 축만 바꾸는 것,
 * 그리고 직전 정점에서의 **차이**. 마지막 것 때문에 상태를 들고 가야 한다
 */
export function vertexFrom(op: number, params: number[], prev: Vec3): Vec3 {
  const v = params[0]!
  switch (op) {
    case 0x23: // VTX_16 — x,y가 첫 워드, z가 둘째
      return [
        fx16(signed(v & 0xffff, 16)),
        fx16(signed(v >>> 16, 16)),
        fx16(signed(params[1]! & 0xffff, 16)),
      ]
    case 0x24: // VTX_10 — 각 10비트, 소수 6자리
      return [
        signed(v & 0x3ff, 10) / 64,
        signed((v >>> 10) & 0x3ff, 10) / 64,
        signed((v >>> 20) & 0x3ff, 10) / 64,
      ]
    case 0x25: return [fx16(signed(v & 0xffff, 16)), fx16(signed(v >>> 16, 16)), prev[2]]
    case 0x26: return [fx16(signed(v & 0xffff, 16)), prev[1], fx16(signed(v >>> 16, 16))]
    case 0x27: return [prev[0], fx16(signed(v & 0xffff, 16)), fx16(signed(v >>> 16, 16))]
    case 0x28: // VTX_DIFF — 직전 정점에서의 차이. 10비트, 소수 12자리의 1/8
      return [
        prev[0] + signed(v & 0x3ff, 10) / 4096 / 8,
        prev[1] + signed((v >>> 10) & 0x3ff, 10) / 4096 / 8,
        prev[2] + signed((v >>> 20) & 0x3ff, 10) / 4096 / 8,
      ]
    default: return prev
  }
}

export interface ModelHeader {
  size: number
  sbcOffset: number
  materialsOffset: number
  polygonsOffset: number
  endOffset: number
  objects: number
  materials: number
  polygons: number
  upScale: number
  downScale: number
  verts: number
  surfaces: number
  triangles: number
  quads: number
}

/** MDL0 안의 모델 하나 */
export function parseModel(buf: Uint8Array, view: DataView, at: number): ModelHeader {
  return {
    size: view.getUint32(at, true),
    sbcOffset: view.getUint32(at + 4, true),
    materialsOffset: view.getUint32(at + 8, true),
    polygonsOffset: view.getUint32(at + 12, true),
    endOffset: view.getUint32(at + 16, true),
    objects: buf[at + 23]!,
    materials: buf[at + 24]!,
    polygons: buf[at + 25]!,
    upScale: fx32(view.getInt32(at + 28, true)),
    downScale: fx32(view.getInt32(at + 32, true)),
    verts: view.getUint16(at + 36, true),
    surfaces: view.getUint16(at + 38, true),
    triangles: view.getUint16(at + 40, true),
    quads: view.getUint16(at + 42, true),
  }
}

interface Polygon { name: string, dl: Uint8Array }

/** 폴리곤 목록 → 디스플레이 리스트들 */
export function parsePolygons(
  buf: Uint8Array, view: DataView, modelAt: number, header: ModelHeader,
): Polygon[] {
  const dictAt = modelAt + header.polygonsOffset
  return readDict(buf, view, dictAt).map((e) => {
    // 폴리곤 항목 16바이트: u32 플래그, u32 ?, u32 dl오프셋, u32 dl크기.
    // 오프셋은 **이 항목의 시작** 기준이다
    const base = dictAt + view.getUint32(e.at, true)
    const dlOffset = view.getUint32(base + 8, true)
    const dlSize = view.getUint32(base + 12, true)
    return { name: e.name, dl: buf.subarray(base + dlOffset, base + dlOffset + dlSize) }
  })
}

/** 하나를 통째로 세어 본다 — 헤더 수치와 맞대는 것이 파서의 증명이다 */
export function countGeometry(dl: Uint8Array): { verts: number, tri: number, quad: number } {
  let prim: string | null = null
  let inStrip = 0
  let prev: Vec3 = [0, 0, 0]
  const counts = { verts: 0, tri: 0, quad: 0 }
  runDisplayList(dl, (op, params) => {
    if (op === 0x40) { prim = PRIM[params[0]! & 3]!; inStrip = 0; return }
    if (op === 0x41) { prim = null; return }
    if (op < 0x23 || op > 0x28) return
    prev = vertexFrom(op, params, prev)
    counts.verts++
    inStrip++
    // 프리미티브가 완성되는 지점에서 센다
    if (prim === 'tri' && inStrip === 3) { counts.tri++; inStrip = 0 }
    else if (prim === 'quad' && inStrip === 4) { counts.quad++; inStrip = 0 }
    else if (prim === 'tristrip' && inStrip >= 3) counts.tri++
    else if (prim === 'quadstrip' && inStrip >= 4 && inStrip % 2 === 0) counts.quad++
  })
  return counts
}

/** BMD0 덩어리 안에서 첫 모델을 짚는다 */
export function openModel(chunk: Uint8Array): {
  buf: Uint8Array, view: DataView, modelAt: number, header: ModelHeader
} {
  const cv = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  const sizes = [0, 4, 8, 12].map((o) => cv.getUint32(o, true))
  const at = 16 + sizes[0]! + sizes[1]!
  const buf = chunk.subarray(at, at + sizes[2]!)
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const mdlAt = view.getUint32(16, true)
  const models = readDict(buf, view, mdlAt + 8)
  if (!models[0]) throw new Error('MDL0에 모델이 없다')
  const modelAt = mdlAt + view.getUint32(models[0].at, true)
  return { buf, view, modelAt, header: parseModel(buf, view, modelAt) }
}
