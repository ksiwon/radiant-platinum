// 설치된 에셋을 담는 자리 (IMPORT.md §8)
//
// OPFS를 Provider에서 떼어 낸 이유는 하나다 — **시험할 수 있게** 하려는 것이다.
// 노드에는 OPFS가 없어서 Provider 안에 붙여 두면 참조 수 관리도, Blob URL
// 수명도, 텍스트 디코딩도 한 줄도 못 잰다. 저장소를 좁은 계약으로 빼면
// 메모리 저장소로 같은 계약 시험을 돌릴 수 있다.
//
// 첫 구현은 **파일 단위**다. 논리 경로 하나에 파일 하나. IMPORT.md §8이 종류별
// pack + index를 목표로 잡았지만 "첫 구현은 정확성을 위해 파일 단위로 시작해도
// 되며 pack 전환은 AssetProvider 뒤에서 한다"고 적어 두었다 — 그 뒤가 여기다.

export interface PackStore {
  readonly kind: string
  read(path: string): Promise<Uint8Array | null>
  has(path: string): Promise<boolean>
}

/** 쓰는 쪽까지 있는 저장소. 설치기가 쓴다 (IMPORT.md §8 "임시 이름에 쓴 뒤 commit") */
export interface WritablePackStore extends PackStore {
  /**
   * 임시 이름에 쓰고 검증한 뒤 제자리로 옮긴다.
   *
   * ⚠️ **바로 제자리에 쓰면 안 된다.** 쓰는 도중에 탭이 죽으면 반쯤 쓰인 파일이
   * 정상 이름으로 남고, 다음 실행이 그걸 완성품으로 읽는다 — 저널이 완료로
   * 적어 두면 영영 안 고쳐진다
   */
  write(path: string, bytes: Uint8Array): Promise<void>
  remove(path: string): Promise<void>
  /**
   * 그 아래 전부. 재개할 때 저널과 실제 파일을 대조하는 데 쓴다.
   *
   * `parts`를 켜면 쓰다 만 `.part` 조각까지 준다 — **지울 때만 쓴다.**
   * 평소에 주면 재개가 조각을 완성품으로 읽는다
   */
  list(prefix?: string, options?: { parts?: boolean }): Promise<string[]>
  /** 나무 하나를 통째로. "에셋 다시 설치"가 쓴다 — **세이브는 안 건드린다** */
  clear(prefix: string): Promise<void>
}

// ── 메모리 ───────────────────────────────────────────────────────────────────

/** 시험과 스파이크용. 계약 시험이 두 저장소에 같은 것을 묻는다 */
export function memoryPackStore(seed: Record<string, Uint8Array> = {}): WritablePackStore {
  const files = new Map<string, Uint8Array>(Object.entries(seed))
  return {
    kind: 'memory',
    read: (path) => Promise.resolve(files.get(path) ?? null),
    has: (path) => Promise.resolve(files.has(path)),
    write: (path, bytes) => { files.set(path, bytes); return Promise.resolve() },
    remove: (path) => { files.delete(path); return Promise.resolve() },
    list: (prefix = '') =>
      Promise.resolve([...files.keys()].filter((k) => k.startsWith(prefix)).sort()),
    clear: (prefix) => {
      for (const k of [...files.keys()]) if (k.startsWith(prefix)) files.delete(k)
      return Promise.resolve()
    },
  }
}

// ── OPFS ─────────────────────────────────────────────────────────────────────

/** OPFS를 쓸 수 있는 자리인가. 보안 컨텍스트가 아니면 아예 없다 */
export function opfsAvailable(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.storage?.getDirectory === 'function'
}

/** 설치 뿌리 (IMPORT.md §8). `saves/`는 이 아래지만 **에셋과 다른 가지**다 */
export const OPFS_ROOT = 'radiant-platinum'
export const OPFS_ASSETS = 'assets'

async function walkTo(
  from: FileSystemDirectoryHandle, parts: string[], create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  let at = from
  for (const name of parts) {
    try {
      at = await at.getDirectoryHandle(name, { create })
    } catch { return null }
  }
  return at
}

async function fileAt(
  root: FileSystemDirectoryHandle, path: string, create: boolean,
): Promise<FileSystemFileHandle | null> {
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop()
  if (name === undefined) return null
  const dir = await walkTo(root, parts, create)
  if (!dir) return null
  try {
    return await dir.getFileHandle(name, { create })
  } catch { return null }
}

/**
 * OPFS 저장소.
 *
 * ⚠️ **`getDirectory()`를 호출마다 부르지 않는다.** 브라우저마다 비용이 다르고,
 * 청크를 스무 개 받는 프레임에서 스무 번 도는 자리다
 */
export function opfsPackStore(base = `${OPFS_ROOT}/${OPFS_ASSETS}`): WritablePackStore {
  let rootPromise: Promise<FileSystemDirectoryHandle> | null = null

  const root = async (): Promise<FileSystemDirectoryHandle> => {
    rootPromise ??= navigator.storage.getDirectory().then(async (dir) => {
      const at = await walkTo(dir, base.split('/').filter(Boolean), true)
      if (!at) throw new Error(`OPFS 뿌리를 못 만들었다: ${base}`)
      return at
    })
    return rootPromise
  }

  return {
    kind: 'opfs',

    async read(path) {
      const handle = await fileAt(await root(), path, false)
      if (!handle) return null
      const file = await handle.getFile()
      return new Uint8Array(await file.arrayBuffer())
    },

    async has(path) {
      return (await fileAt(await root(), path, false)) !== null
    },

    async write(path, bytes) {
      const dir = await root()
      // ⚠️ 임시 이름 → 검증 → 옮기기. OPFS에는 rename이 없어서 **임시 파일에
      // 쓰고 다시 읽어 길이를 맞춘 뒤 제자리에 복사하고 임시를 지운다**.
      // 복사가 한 번 더 도는 대신, 반쯤 쓰인 파일이 정상 이름으로 남지 않는다
      const tmp = `${path}.part`
      const tmpHandle = await fileAt(dir, tmp, true)
      if (!tmpHandle) throw new Error(`임시 파일을 못 만들었다: ${tmp}`)
      const stream = await tmpHandle.createWritable()
      await stream.write(bytes as unknown as BufferSource)
      await stream.close()

      // ⚠️ **길이만 확인하고 바이트는 JS 힙으로 안 끌어올린다.** 한때 여기서
      // `.arrayBuffer()`로 통째로 다시 읽었다 — 그러면 `bytes`와 읽어 온 것이
      // 동시에 살아 있어서 큰 파일 하나에 메모리가 두 배로 뛴다. `File`은
      // Blob이라 그대로 쓰기 스트림에 넘길 수 있고, 그 복사는 브라우저가 한다
      const back = await tmpHandle.getFile()
      if (back.size !== bytes.byteLength) {
        throw new Error(`${path}: 쓴 길이가 다르다 (${String(bytes.byteLength)} → ${String(back.size)})`)
      }

      const handle = await fileAt(dir, path, true)
      if (!handle) throw new Error(`파일을 못 만들었다: ${path}`)
      const out = await handle.createWritable()
      await out.write(back)
      await out.close()
      await this.remove(tmp)
    },

    async remove(path) {
      const parts = path.split('/').filter(Boolean)
      const name = parts.pop()
      if (name === undefined) return
      const dir = await walkTo(await root(), parts, false)
      if (!dir) return
      try { await dir.removeEntry(name, { recursive: true }) } catch { /* 이미 없다 */ }
    },

    async list(prefix = '', options) {
      const out: string[] = []
      const walk = async (dir: FileSystemDirectoryHandle, at: string): Promise<void> => {
        // ⚠️ `entries()`는 아직 TS의 DOM 타입에 없다. 크로미움에는 있고 OPFS를
        // 훑을 다른 길이 없다 — 없는 것으로 취급하면 재개가 불가능해진다
        for await (const [name, handle] of (dir as unknown as {
          entries(): AsyncIterableIterator<[string, FileSystemHandle]>
        }).entries()) {
          const rel = at ? `${at}/${name}` : name
          if (handle.kind === 'directory') {
            await walk(handle as FileSystemDirectoryHandle, rel)
            continue
          }
          // 완성되지 않은 조각은 목록에 없다 — 재개가 그걸 완료로 읽으면 안 된다.
          // ⚠️ 다만 **지울 때는 봐야 한다.** 안 그러면 탭이 쓰기 도중에 죽어
          // 남은 조각을 아무도 못 지운다 — 목록에 안 보이니 `clear`도 못 본다
          if (rel.endsWith('.part') && options?.parts !== true) continue
          if (rel.startsWith(prefix)) out.push(rel)
        }
      }
      await walk(await root(), '')
      return out.sort()
    },

    async clear(prefix) {
      for (const path of await this.list(prefix, { parts: true })) await this.remove(path)
    },
  }
}
