// NDS 파일시스템 — 브라우저에서 (IMPORT.md §5 · §6)
//
// `tools/spike/nds.js`가 하던 일을 옮긴 것이다. 다른 점은 하나뿐이고 그게 전부다:
//
// ⚠️ **파일을 통째로 메모리에 올리지 않는다.** 롬 하나가 128MB다. 노드 도구는
// `readFileSync`로 다 읽어도 됐지만, 브라우저에서 그러면 탭 하나가 128MB를 물고
// 시작한다. 게다가 사용자가 잘못 고른 4GB 파일이 그대로 들어온다.
// `Blob.slice()`로 필요한 범위만 읽는다.
//
// 그래서 모든 읽기가 비동기다. 그 대신 헤더·FAT·FNT처럼 작고 자주 쓰는 것은
// 한 번 읽어 들고 있는다 — FNT가 커 봐야 몇 KB다.

/** 바이트를 조각내 주는 것. `File`도 `Uint8Array`도 이 모양으로 감싼다 */
export interface ByteSource {
  readonly size: number
  slice(start: number, end: number): Promise<Uint8Array>
}

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async slice(start, end) {
      const clamped = Math.min(Math.max(end, start), blob.size)
      return new Uint8Array(await blob.slice(start, clamped).arrayBuffer())
    },
  }
}

/** 시험과 스파이크용. 같은 계약이라 위 코드가 그대로 돈다 */
export function bytesSource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.byteLength,
    slice: (start, end) =>
      Promise.resolve(bytes.subarray(Math.min(start, bytes.length), Math.min(Math.max(end, start), bytes.length))),
  }
}

/** 헤더 (`nitro` 카트리지 헤더). 우리가 보는 자리만 */
export interface NdsHeader {
  title: string
  gameCode: string
  makerCode: string
  /**
   * ARM9 정적 바이너리. **파일시스템 밖이다** — FNT에도 FAT에도 안 들어 있다.
   *
   * 상점 재고가 여기 있다 (DATA.md §2.13). 한때 "롬에 없고 디컴프 헤더에만
   * 있다"고 적어 뒀는데 틀렸다 — ARM9에 있고, 셋 다 실측으로 확인했다
   */
  arm9RomOffset: number
  arm9Entry: number
  /** 로드되는 RAM 주소. 코드 안의 포인터를 파일 자리로 되돌릴 때 쓴다 */
  arm9RamAddress: number
  arm9Size: number
  fntOffset: number
  fntSize: number
  fatOffset: number
  fatSize: number
  overlayOffset: number
  overlaySize: number
}

/** 헤더 최소 길이. 여기까지 없으면 NDS라고 부를 수도 없다 */
export const HEADER_BYTES = 0x200

const latin1 = (bytes: Uint8Array): string =>
  String.fromCharCode(...bytes).replace(/\0+$/, '')

export async function readHeader(src: ByteSource): Promise<NdsHeader | null> {
  if (src.size < HEADER_BYTES) return null
  const head = await src.slice(0, HEADER_BYTES)
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  return {
    title: latin1(head.subarray(0, 12)),
    gameCode: latin1(head.subarray(12, 16)),
    makerCode: latin1(head.subarray(16, 18)),
    arm9RomOffset: view.getUint32(0x20, true),
    arm9Entry: view.getUint32(0x24, true),
    arm9RamAddress: view.getUint32(0x28, true),
    arm9Size: view.getUint32(0x2c, true),
    fntOffset: view.getUint32(0x40, true),
    fntSize: view.getUint32(0x44, true),
    fatOffset: view.getUint32(0x48, true),
    fatSize: view.getUint32(0x4c, true),
    overlayOffset: view.getUint32(0x50, true),
    overlaySize: view.getUint32(0x54, true),
  }
}

export interface FatEntry { start: number; end: number }

export interface NdsFileSystem {
  header: NdsHeader
  /** 전체 경로 → FAT 칸 */
  files: ReadonlyMap<string, FatEntry>
  fat: readonly FatEntry[]
  /** 오버레이 수. FNT에 이름이 없어서 따로 센다 */
  overlays: number
  read(path: string): Promise<Uint8Array | null>
  /**
   * ARM9 정적 바이너리의 한 조각. `at`은 **ARM9 시작 기준** 상대 자리다.
   *
   * 범위를 벗어나면 `null`. 사용자가 아무 파일이나 고를 수 있으므로 여기서
   * 막지 않으면 잘린 롬에서 엉뚱한 바이트를 표로 읽는다
   */
  arm9(at: number, length: number): Promise<Uint8Array | null>
  /**
   * 코드 안의 RAM 포인터를 ARM9 상대 자리로 되돌린다.
   *
   * `at = pointer - arm9RamAddress`. 범위 밖이면 `null` — 그것이 곧
   * "이 포인터는 ARM9 안을 안 가리킨다"는 뜻이고, 표를 잘못 짚었다는 신호다
   */
  arm9At(pointer: number): number | null
}

/**
 * FNT를 걸어 전체 경로 표를 만든다.
 *
 * ⚠️ **손상된 파일에서 무한히 돌 수 있다.** 디렉터리 엔트리가 자기 자신을
 * 가리키면 재귀가 안 끝난다 — 사용자가 아무 파일이나 고를 수 있으므로 본 것을
 * 세어 두고 두 번 들어가지 않는다
 */
function walkFnt(fnt: Uint8Array, fat: readonly FatEntry[]): Map<string, FatEntry> {
  const out = new Map<string, FatEntry>()
  const view = new DataView(fnt.buffer, fnt.byteOffset, fnt.byteLength)
  const seen = new Set<number>()

  const walk = (dirId: number, prefix: string): void => {
    const id = dirId & 0xfff
    if (seen.has(id)) return
    seen.add(id)
    const entryOff = id * 8
    if (entryOff + 8 > fnt.byteLength) return
    let p = view.getUint32(entryOff, true)
    let fileId = view.getUint16(entryOff + 4, true)
    for (;;) {
      if (p >= fnt.byteLength) return
      const len = fnt[p++]!
      if (len === 0) return
      const nameLen = len & 0x7f
      if (p + nameLen > fnt.byteLength) return
      const name = latin1(fnt.subarray(p, p + nameLen))
      p += nameLen
      if (len < 0x80) {
        const at = fat[fileId++]
        if (at) out.set(prefix + name, at)
        continue
      }
      if (p + 2 > fnt.byteLength) return
      const sub = view.getUint16(p, true)
      p += 2
      walk(sub, `${prefix}${name}/`)
    }
  }

  walk(0xf000, '/')
  return out
}

export async function openNds(src: ByteSource): Promise<NdsFileSystem | null> {
  const header = await readHeader(src)
  if (!header) return null

  const { fatOffset, fatSize, fntOffset, fntSize } = header
  // ⚠️ 범위를 먼저 본다. 안 보면 잘린 파일에서 `slice`가 빈 배열을 주고,
  // FAT 0칸짜리 "정상" 롬이 만들어진다 — 그 다음 실패는 원인이 안 보인다
  if (fatOffset + fatSize > src.size || fntOffset + fntSize > src.size) return null
  if (fatSize % 8 !== 0 || fatSize === 0 || fntSize === 0) return null

  const fatBytes = await src.slice(fatOffset, fatOffset + fatSize)
  const fatView = new DataView(fatBytes.buffer, fatBytes.byteOffset, fatBytes.byteLength)
  const fat: FatEntry[] = []
  for (let i = 0; i < fatSize / 8; i++) {
    fat.push({ start: fatView.getUint32(i * 8, true), end: fatView.getUint32(i * 8 + 4, true) })
  }

  const files = walkFnt(await src.slice(fntOffset, fntOffset + fntSize), fat)
  const overlays = header.overlaySize % 32 === 0 ? header.overlaySize / 32 : 0

  return {
    header,
    files,
    fat,
    overlays,
    async read(path) {
      const at = files.get(path)
      if (!at) return null
      if (at.end < at.start || at.end > src.size) return null
      return src.slice(at.start, at.end)
    },

    async arm9(at, length) {
      const { arm9RomOffset, arm9Size } = header
      if (at < 0 || length <= 0) return null
      if (at + length > arm9Size) return null
      const from = arm9RomOffset + at
      if (from + length > src.size) return null
      const got = await src.slice(from, from + length)
      // `slice`가 잘라 줄 수도 있다 — 길이를 다시 본다
      return got.byteLength === length ? got : null
    },

    arm9At(pointer) {
      const { arm9RamAddress, arm9Size } = header
      const at = pointer - arm9RamAddress
      return at >= 0 && at < arm9Size ? at : null
    },
  }
}

// ── NARC ─────────────────────────────────────────────────────────────────────

/**
 * NARC 컨테이너의 엔트리 수.
 *
 * ⚠️ **엔트리를 다 꺼내지 않는다.** 지원 판정에 필요한 것은 개수뿐인데
 * `land_data.narc` 하나가 30MB다 — 판정 때문에 그걸 다 펴면 첫 화면에서 몇 초가
 * 사라진다. `BTAF`의 카운트만 읽는다
 */
export function narcCount(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 16) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (latin1(bytes.subarray(0, 4)) !== 'NARC') return null
  let p = view.getUint16(12, true)
  while (p + 12 <= bytes.byteLength) {
    const magic = latin1(bytes.subarray(p, p + 4))
    const size = view.getUint32(p + 4, true)
    if (size <= 0) return null
    if (magic === 'BTAF') return view.getUint32(p + 8, true)
    p += size
  }
  return null
}

/** NARC 안의 파일 하나. 변환기가 쓴다 */
export function narcEntry(bytes: Uint8Array, index: number): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (latin1(bytes.subarray(0, 4)) !== 'NARC') return null
  let p = view.getUint16(12, true)
  let at: { start: number; end: number } | null = null
  let data = -1
  while (p + 12 <= bytes.byteLength) {
    const magic = latin1(bytes.subarray(p, p + 4))
    const size = view.getUint32(p + 4, true)
    if (size <= 0) break
    if (magic === 'BTAF') {
      const count = view.getUint32(p + 8, true)
      if (index < 0 || index >= count) return null
      at = {
        start: view.getUint32(p + 12 + index * 8, true),
        end: view.getUint32(p + 16 + index * 8, true),
      }
    } else if (magic === 'GMIF') {
      data = p + 8
    }
    p += size
  }
  if (!at || data < 0) return null
  return bytes.subarray(data + at.start, data + at.end)
}
