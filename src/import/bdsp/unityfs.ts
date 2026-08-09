// UnityFS 컨테이너 — 브라우저에서 (IMPORT.md §12 spike)
//
// ⚠️ **이것은 spike다. 변환기가 아니다.** 개발 추출기는 파이썬 UnityPy가 하고,
// 그것을 브라우저에서 그대로 부를 수 없다는 것이 §12의 게이트다. 그 게이트를
// "언젠가 하겠다"로 두지 않으려고, **어디까지 되고 어디서 막히는지**를 실제로
// 짚어 본 것이 이 파일이다.
//
// 여기까지 된다 (실측):
//
//   · `UnityFS` 헤더 · 블록 목록 · 디렉터리 목록
//   · LZ4 블록 풀기 (LZ4HC = LZ4 블록 포맷과 같다)
//   · SerializedFile 헤더 · 타입 표 · 오브젝트 표 (classID와 자리)
//
// 여기서 막힌다 (`SPIKE_BLOCKERS`):
//
//   · 타입 트리를 걸어 필드를 읽는 일 — Mesh 하나가 채널·스트림·압축 조합이라
//     구현이 UnityPy의 `TypeTreeHelper` 통째와 같은 크기다
//   · 텍스처 디코딩 — BC7/ASTC/ETC2를 CPU에서 풀어야 한다
//   · GLB 쓰기 — Blender 없이 하려면 glTF 작성기를 새로 써야 한다
//
// 세 가지 다 **할 수 있는 일**이고 못 할 이유는 아직 안 나왔다. 다만 이 spike가
// 증명한 것은 컨테이너까지고, 그 위는 아직 아무것도 아니다.

const MAGIC = 'UnityFS\0'

export interface UnityFsHeader {
  version: number
  unityVersion: string
  unityRevision: string
  size: number
  compressedBlocksInfoSize: number
  uncompressedBlocksInfoSize: number
  flags: number
  /** 헤더 바로 뒤 자리 */
  dataStart: number
}

export interface BlockInfo { uncompressed: number; compressed: number; flags: number }
export interface DirectoryNode { offset: number; size: number; flags: number; path: string }

export type Compression = 'none' | 'lzma' | 'lz4' | 'lz4hc'

const COMPRESSION: Record<number, Compression> = { 0: 'none', 1: 'lzma', 2: 'lz4', 3: 'lz4hc' }

export class UnsupportedBundle extends Error {
  constructor(readonly why: string) { super(`UnityFS: ${why}`); this.name = 'UnsupportedBundle' }
}

class Reader {
  at = 0
  private readonly view: DataView
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }
  u8(): number { return this.view.getUint8(this.at++) }
  u16(be = true): number { const v = this.view.getUint16(this.at, !be); this.at += 2; return v }
  u32(be = true): number { const v = this.view.getUint32(this.at, !be); this.at += 4; return v }
  i32(be = true): number { const v = this.view.getInt32(this.at, !be); this.at += 4; return v }
  i64(be = true): number {
    const v = this.view.getBigInt64(this.at, !be); this.at += 8; return Number(v)
  }
  cstr(): string {
    let end = this.at
    while (end < this.bytes.length && this.bytes[end] !== 0) end++
    const s = new TextDecoder().decode(this.bytes.subarray(this.at, end))
    this.at = end + 1
    return s
  }
  take(n: number): Uint8Array {
    const out = this.bytes.subarray(this.at, this.at + n)
    this.at += n
    return out
  }
  align(n: number): void { this.at = (this.at + (n - 1)) & ~(n - 1) }
}

export function readUnityFsHeader(bytes: Uint8Array): UnityFsHeader {
  const r = new Reader(bytes)
  if (new TextDecoder().decode(r.take(8)) !== MAGIC) throw new UnsupportedBundle('UnityFS가 아니다')
  const version = r.u32()
  // 6·7만 봤다. 다른 판은 배치가 달라서 짐작으로 읽으면 조용히 틀린다
  if (version !== 6 && version !== 7) throw new UnsupportedBundle(`판 ${String(version)}은 아직 모른다`)
  const unityVersion = r.cstr()
  const unityRevision = r.cstr()
  const size = r.i64()
  const compressedBlocksInfoSize = r.u32()
  const uncompressedBlocksInfoSize = r.u32()
  const flags = r.u32()
  if (version >= 7) r.align(16)
  return {
    version, unityVersion, unityRevision, size,
    compressedBlocksInfoSize, uncompressedBlocksInfoSize, flags,
    dataStart: r.at,
  }
}

export function compressionOf(flags: number): Compression {
  const kind = COMPRESSION[flags & 0x3f]
  if (!kind) throw new UnsupportedBundle(`압축 방식 ${String(flags & 0x3f)}을 모른다`)
  return kind
}

/**
 * LZ4 블록 포맷 풀기.
 *
 * LZ4HC는 **같은 포맷**이다 — 압축을 더 오래 할 뿐 결과 바이트의 문법은 같다.
 * 프레임 헤더가 없는 raw 블록이라 60줄이면 된다
 */
export function lz4Decode(src: Uint8Array, outSize: number): Uint8Array {
  const out = new Uint8Array(outSize)
  let s = 0
  let d = 0
  while (s < src.length) {
    const token = src[s++]!
    let literals = token >> 4
    if (literals === 0x0f) {
      let more: number
      do { more = src[s++]!; literals += more } while (more === 0xff)
    }
    for (let i = 0; i < literals; i++) out[d++] = src[s++]!
    if (s >= src.length) break
    const offset = src[s++]! | (src[s++]! << 8)
    if (offset === 0) throw new UnsupportedBundle('LZ4 오프셋 0 — 자료가 깨졌다')
    let match = token & 0x0f
    if (match === 0x0f) {
      let more: number
      do { more = src[s++]!; match += more } while (more === 0xff)
    }
    match += 4
    let from = d - offset
    if (from < 0) throw new UnsupportedBundle('LZ4가 앞을 넘어 가리킨다')
    for (let i = 0; i < match; i++) out[d++] = out[from++]!
  }
  if (d !== outSize) throw new UnsupportedBundle(`푼 길이가 다르다 (${String(d)} ≠ ${String(outSize)})`)
  return out
}

export interface Bundle {
  header: UnityFsHeader
  blocks: BlockInfo[]
  nodes: DirectoryNode[]
  /** 블록을 다 이어 붙인 것. 노드의 `offset`이 여기 기준이다 */
  data: Uint8Array
}

export function openBundle(bytes: Uint8Array): Bundle {
  const header = readUnityFsHeader(bytes)
  // 목록이 끝에 붙어 있는 판이 있다 (`0x80`)
  const atEnd = (header.flags & 0x80) !== 0
  const infoAt = atEnd ? bytes.length - header.compressedBlocksInfoSize : header.dataStart
  const rawInfo = bytes.subarray(infoAt, infoAt + header.compressedBlocksInfoSize)

  const kind = compressionOf(header.flags)
  let info: Uint8Array
  if (kind === 'none') info = rawInfo
  else if (kind === 'lz4' || kind === 'lz4hc') info = lz4Decode(rawInfo, header.uncompressedBlocksInfoSize)
  // ⚠️ LZMA는 안 푼다. 여기 오면 spike가 못 가는 자리고, **짐작으로 채우지 않는다**
  else throw new UnsupportedBundle('LZMA 블록은 아직 못 푼다')

  const r = new Reader(info)
  r.take(16) // uncompressedDataHash
  const blockCount = r.i32()
  const blocks: BlockInfo[] = []
  for (let i = 0; i < blockCount; i++) {
    blocks.push({ uncompressed: r.u32(), compressed: r.u32(), flags: r.u16() })
  }
  const nodeCount = r.i32()
  const nodes: DirectoryNode[] = []
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ offset: r.i64(), size: r.i64(), flags: r.u32(), path: r.cstr() })
  }

  // 블록을 순서대로 풀어 잇는다
  const total = blocks.reduce((a, b) => a + b.uncompressed, 0)
  const data = new Uint8Array(total)
  let src = atEnd ? header.dataStart : header.dataStart + header.compressedBlocksInfoSize
  let dst = 0
  for (const block of blocks) {
    const chunk = bytes.subarray(src, src + block.compressed)
    const how = compressionOf(block.flags)
    if (how === 'none') data.set(chunk, dst)
    else if (how === 'lz4' || how === 'lz4hc') data.set(lz4Decode(chunk, block.uncompressed), dst)
    else throw new UnsupportedBundle('LZMA 블록은 아직 못 푼다')
    src += block.compressed
    dst += block.uncompressed
  }

  return { header, blocks, nodes, data }
}

// ── SerializedFile ───────────────────────────────────────────────────────────

export interface UnityObject {
  pathId: number
  /** 자료 안의 자리 (`SerializedFile`의 `dataOffset` 기준) */
  byteStart: number
  byteSize: number
  classId: number
}

export interface SerializedFile {
  version: number
  unityVersion: string
  targetPlatform: number
  objects: UnityObject[]
  /** classID → 몇 개 */
  counts: Record<number, number>
}

/** 우리가 알아볼 클래스만. 나머지는 번호로 남는다 */
export const CLASS_NAMES: Readonly<Record<number, string>> = {
  1: 'GameObject', 4: 'Transform', 21: 'Material', 23: 'MeshRenderer', 28: 'Texture2D',
  33: 'MeshFilter', 43: 'Mesh', 48: 'Shader', 74: 'AnimationClip', 91: 'AnimatorController',
  95: 'Animator', 111: 'Animation', 114: 'MonoBehaviour', 115: 'MonoScript',
  137: 'SkinnedMeshRenderer', 142: 'AssetBundle', 213: 'Sprite', 687078895: 'SpriteAtlas',
}

export function className(id: number): string {
  return CLASS_NAMES[id] ?? `#${String(id)}`
}

/**
 * 오브젝트 표만 읽는다.
 *
 * ⚠️ **필드는 안 읽는다.** 그러려면 타입 트리를 걸어야 하고, 그것이 이 spike가
 * 막힌 자리다 (`SPIKE_BLOCKERS`). 여기까지로 알 수 있는 것은 "이 번들에 무엇이
 * 몇 개 들어 있는가"고, 그것만으로도 UnityPy와 대조가 된다
 */
export function readSerializedFile(bytes: Uint8Array): SerializedFile {
  const r = new Reader(bytes)
  r.u32()                     // metadataSize (옛 판용)
  r.u32()                     // fileSize
  const version = r.u32()
  r.u32()                     // dataOffset
  if (version < 9 || version > 22) throw new UnsupportedBundle(`SerializedFile 판 ${String(version)}`)
  const bigEndian = r.u8() !== 0
  r.take(3)                   // reserved
  if (version >= 22) { r.i64(); r.i64(); r.i64(); r.i64() }
  const little = !bigEndian

  const unityVersion = r.cstr()
  const targetPlatform = r.u32(!little)
  const hasTypeTree = r.u8() !== 0

  const typeCount = r.u32(!little)
  /** 타입 표의 차례 → classID. 오브젝트가 이 차례를 가리킨다 */
  const typeClasses: number[] = []
  for (let i = 0; i < typeCount; i++) {
    typeClasses.push(readSerializedType(r, version, little, hasTypeTree, false))
  }

  const objectCount = r.u32(!little)
  const objects: UnityObject[] = []
  for (let i = 0; i < objectCount; i++) {
    r.align(4)
    const pathId = r.i64(!little)
    const byteStart = version >= 22 ? r.i64(!little) : r.u32(!little)
    const byteSize = r.u32(!little)
    const typeIndex = r.u32(!little)
    objects.push({ pathId, byteStart, byteSize, classId: typeClasses[typeIndex] ?? -1 })
  }

  const counts: Record<number, number> = {}
  for (const o of objects) counts[o.classId] = (counts[o.classId] ?? 0) + 1
  return { version, unityVersion, targetPlatform, objects, counts }
}

/** 타입 하나를 건너뛰며 classID만 집는다 */
function readSerializedType(
  r: Reader, version: number, little: boolean, hasTypeTree: boolean, isRef: boolean,
): number {
  const classId = r.i32(!little)
  if (version >= 16) r.u8()                       // isStrippedType
  if (version >= 17) r.u16(!little)               // scriptTypeIndex
  if (version >= 13) {
    if ((isRef && classId !== -1) || (version < 16 ? classId < 0 : classId === 114)) r.take(16)
    r.take(16)                                    // oldTypeHash
  }
  if (hasTypeTree) {
    // ⚠️ 여기가 spike가 멈추는 문턱이다. 노드를 세어 건너뛰기만 한다 —
    // **읽지는 않는다.** 읽으려면 필드 타입마다 해석기가 필요하다
    const nodeCount = r.u32(!little)
    const stringSize = r.u32(!little)
    r.take(nodeCount * (version >= 19 ? 32 : 24))
    r.take(stringSize)
    if (version >= 21) {
      const deps = r.u32(!little)
      r.take(deps * 4)
    }
  }
  return classId
}

/**
 * 이 spike가 못 넘은 자리. **여기 없는 것을 "됐다"고 하지 않는다.**
 *
 * `blockers.mjs`가 이 목록이 빌 때까지 release를 막는다
 */
export const SPIKE_BLOCKERS: readonly { what: string; why: string; next: string }[] = [
  {
    what: '타입 트리로 필드 읽기',
    why:
      'Mesh 하나가 채널(위치·법선·탄젠트·UV 넷·뼈 가중치)·스트림·정점 압축 조합이고, '
      + '그 배치는 오브젝트 안이 아니라 타입 트리에 적혀 있다. 트리를 걸어 필드를 '
      + '읽는 코드가 UnityPy의 `TypeTreeHelper` 통째와 같은 크기다.',
    next:
      'BDSP 번들은 타입 트리를 싣고 있으므로(`hasTypeTree`) 클래스별 하드코딩 없이 '
      + '일반 해석기를 쓸 수 있다. 그것부터가 다음 조각이다.',
  },
  {
    what: '텍스처 디코딩',
    why:
      'Texture2D가 BC7·ASTC·ETC2 중 하나로 들어 있고 브라우저에서 그대로 못 올린다 '
      + '(WebGPU가 BC7을 지원해도 GLB에 넣으려면 PNG여야 한다). CPU 디코더가 필요하다.',
    next:
      'KTX2로 그대로 싣고 런타임에서 GPU가 푸는 길이 있다 — 그러면 디코더가 아예 '
      + '필요 없다. 다만 PLAN이 GLB를 전제하고 있어 그쪽 계약이 먼저 바뀌어야 한다.',
  },
  {
    what: 'GLB 쓰기',
    why: '개발 추출기는 Blender를 거쳐 GLB를 만든다. 브라우저에는 Blender가 없다.',
    next:
      'glTF 2.0 작성기는 우리가 쓰는 범위(메시·재질·스킨·클립)로 좁히면 클 것이 '
      + '없다. 앞의 둘이 풀린 뒤에 붙는다.',
  },
]
