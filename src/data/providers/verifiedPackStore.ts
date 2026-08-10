// 읽을 때 한 번 확인한다 (IMPORT.md §8·§15)
//
// ⚠️ **부팅마다 630MB를 다시 해싱하지 않는다.** 그러면 "한 번만 고르면 된다"가
// "켤 때마다 몇 초씩 기다린다"가 된다. 그렇다고 안 보면 조용히 깨진 바이트가
// 게임까지 흘러 들어간다 — 브라우저는 공간이 모자라면 말없이 되찾아 간다.
//
// 그래서 **처음 읽을 때 한 번** 본다:
//
//   길이   O(1). 기록과 다르면 그 자리에서 끝이다 — 잘린 파일이 여기서 걸린다
//   해시   그 파일을 실제로 읽은 김에 SHA-256. 세션 안에서 한 번뿐이다
//
// 안 읽은 파일은 안 센다. 그게 요점이다 — 첫 화면이 여는 파일은 몇 개고,
// 배틀 모델 96MB는 배틀에 들어갈 때 처음 본다.
//
// ⚠️ **깨진 파일을 게임에 안 넘긴다.** 던지고, 그 그룹을 `corrupt`로 표시한다.
// 그 뒤는 화면이 정한다 — 그 그룹만 다시 만들면 되고, 나머지는 멀쩡하다.
import { checkFile, type Broken } from '../../import/install/integrity'
import type { InstallManifest } from '../../import/install/manifestSchema'
import type { PackStore } from './packStore'

/** 깨진 파일을 읽으려 했다 */
export class AssetCorrupt extends Error {
  constructor(readonly path: string, readonly group: string, readonly why: Broken) {
    super(`${path}: ${why.detail}`)
    this.name = 'AssetCorrupt'
  }
}

export interface VerifiedStore extends PackStore {
  /** 경로 → 어느 그룹의 것인가 */
  groupOf(path: string): string | null
  /** 지금까지 확인한 파일 수. 세션 안에서만 유효하다 */
  checked(): number
  /** 깨진 것이 나온 그룹 */
  corruptGroups(): string[]
  /**
   * 전부 확인한다 — **설정 화면의 손 버튼**과 타이틀 뒤 idle 검사가 부른다.
   *
   * 부팅에서 부르지 않는다. 부르면 이 파일이 존재하는 이유가 사라진다
   */
  verifyAll(onProgress?: (done: number, total: number) => void,
    signal?: { aborted: boolean }): Promise<{ ok: number, broken: Broken[] }>
}

/**
 * 설치 기록을 들고 저장소를 감싼다.
 *
 * 기록에 없는 경로는 그냥 통과시킨다 — 확인할 근거가 없는 것을 막으면 개발판
 * 산출물이나 나중에 늘어난 파일이 전부 못 읽히게 된다. 기록에 있는 것만 본다
 */
export function verifiedPackStore(store: PackStore, manifest: InstallManifest): VerifiedStore {
  interface Entry { group: string, bytes: number, sha256: string, path: string }
  const records = new Map<string, Entry>()
  for (const [group, record] of Object.entries(manifest.groups)) {
    for (const f of record.files) records.set(f.path, { group, ...f })
  }

  /** 이미 통과한 경로. **세션 안에서만** 산다 — 새로 켜면 다시 한 번 본다 */
  const passed = new Set<string>()
  /** 진행 중인 확인. 같은 파일을 두 화면이 동시에 열면 해시를 두 번 세지 않는다 */
  const inFlight = new Map<string, Promise<void>>()
  const corrupt = new Set<string>()

  const verify = (path: string, bytes: Uint8Array): Promise<void> => {
    const record = records.get(path)
    if (!record || passed.has(path)) return Promise.resolve()
    const running = inFlight.get(path)
    if (running) return running

    const job = (async () => {
      // 이미 바이트가 손에 있다. 다시 읽지 않는다
      const fault = await checkFile(async () => bytes, record)
      if (fault) {
        corrupt.add(record.group)
        throw new AssetCorrupt(path, record.group, fault)
      }
      passed.add(path)
    })().finally(() => { inFlight.delete(path) })

    inFlight.set(path, job)
    return job
  }

  const readChecked = async (path: string): Promise<Uint8Array | null> => {
    const bytes = await store.read(path)
    if (bytes === null) return null
    await verify(path, bytes)
    return bytes
  }

  return {
    kind: `verified:${store.kind}`,
    read: readChecked,
    has: (path) => store.has(path),

    groupOf: (path) => records.get(path)?.group ?? null,
    checked: () => passed.size,
    corruptGroups: () => [...corrupt],

    async verifyAll(onProgress, signal) {
      const all = [...records.values()]
      const broken: Broken[] = []
      let ok = 0
      for (const [i, record] of all.entries()) {
        if (signal?.aborted) break
        if (passed.has(record.path)) { ok += 1; onProgress?.(i + 1, all.length); continue }
        const fault = await checkFile((p) => store.read(p), record)
        if (fault) { broken.push(fault); corrupt.add(record.group) }
        else { passed.add(record.path); ok += 1 }
        onProgress?.(i + 1, all.length)
      }
      return { ok, broken }
    },
  }
}
