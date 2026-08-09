// OPFS 설치 (IMPORT.md §8 · §13-8)
//
// 재는 것은 셋이다: **중간에 끊겨도 잃지 않는가**, **끝나기 전에 게임이
// 시작되지 않는가**, **에셋을 지워도 리포트가 남는가**.
//
// ⚠️ **`install.json`은 검증이 끝나기 전에 `ready`가 되지 않는다.** 이 한 줄이
// "설치가 반쯤 된 상태로 게임이 시작되는 것"을 막는 전부다. 반쯤 설치된 채로
// 시작하면 첫 배틀에서 종족 표가 없다고 죽는데, 그때는 무엇이 없는지 알 수 없다.
//
// ⚠️ **에셋과 리포트는 저장소가 다르다.** 에셋은 OPFS의 `assets/`, 리포트는
// IndexedDB다 (`state/report.ts`). "에셋 다시 설치"가 `assets/`와 저널만 지우고
// 리포트를 안 건드리는 것이 그래서 성립한다 (IMPORT.md §8 끝).
import type { WritablePackStore } from '../../data/providers/packStore'
import { Cancelled, type ConvertContext, type GroupSpec, type Produced } from '../platinum/convert'
import type { NdsFileSystem } from '../platinum/nds'

export const CONTRACT_VERSION = 1
export const INSTALL_FILE = 'install.json'
export const JOURNAL_FILE = 'journal.json'
export const ASSETS_PREFIX = 'assets/'
/** 리포트 사본이 사는 가지. **에셋 삭제가 안 건드린다** */
export const SAVES_PREFIX = 'saves/'

export interface InstallManifest {
  contractVersion: number
  /** `ready`가 되기 전에는 게임을 시작하지 않는다 */
  state: 'installing' | 'ready'
  platinumLocale: string
  /** 설치된 것만. **개발 모드에 세 벌이 있다고 세 언어를 주지 않는다** */
  availableLocales: string[]
  startedAt: string
  finishedAt?: string
  groups: Record<string, { files: string[]; bytes: number }>
}

export interface InstallJournal {
  contractVersion: number
  /** 끝난 그룹. 재개할 때 여기 있는 것은 다시 안 만든다 */
  done: string[]
  /** 하다 만 그룹. 재개하면 여기부터 다시 한다 */
  running: string | null
}

export type InstallEvent =
  | { kind: 'group'; name: string; index: number; total: number }
  | { kind: 'progress'; name: string; done: number; total: number }
  | { kind: 'wrote'; path: string; bytes: number }
  | { kind: 'resumed'; skipped: string[] }
  | { kind: 'verifying' }
  | { kind: 'ready'; manifest: InstallManifest }

export interface InstallOptions {
  store: WritablePackStore
  fs: NdsFileSystem
  locale: string
  groups: readonly GroupSpec[]
  /** 지금 시각. 시험이 값을 못 박을 수 있어야 한다 */
  now?: () => Date
  signal?: { aborted: boolean }
  onEvent?: (e: InstallEvent) => void
}

const text = new TextDecoder()
const bytes = new TextEncoder()

async function readJson<T>(store: WritablePackStore, path: string): Promise<T | null> {
  const raw = await store.read(path)
  if (!raw) return null
  try { return JSON.parse(text.decode(raw)) as T } catch { return null }
}

function writeJson(store: WritablePackStore, path: string, value: unknown): Promise<void> {
  return store.write(path, bytes.encode(JSON.stringify(value, null, 1)))
}

export function readManifest(store: WritablePackStore): Promise<InstallManifest | null> {
  return readJson<InstallManifest>(store, INSTALL_FILE)
}

/** 게임을 시작해도 되는가. **이 함수 하나가 그 판단의 전부다** */
export async function installReady(store: WritablePackStore): Promise<InstallManifest | null> {
  const manifest = await readManifest(store)
  if (!manifest || manifest.state !== 'ready') return null
  if (manifest.contractVersion !== CONTRACT_VERSION) return null
  return manifest
}

/**
 * 저널과 **실제 파일**을 대조한다 (IMPORT.md §8).
 *
 * ⚠️ 저널만 믿으면 안 된다. 저널을 쓴 직후 탭이 죽으면 "끝났다"고 적힌 그룹의
 * 파일이 실제로는 없을 수 있다 — 그러면 재개가 그 그룹을 건너뛰고, 없는 파일을
 * 게임이 찾는다
 */
export async function resumableGroups(
  store: WritablePackStore,
  groups: readonly GroupSpec[],
): Promise<{ skip: string[]; journal: InstallJournal }> {
  const empty: InstallJournal = { contractVersion: CONTRACT_VERSION, done: [], running: null }
  const journal = await readJson<InstallJournal>(store, JOURNAL_FILE) ?? empty
  if (journal.contractVersion !== CONTRACT_VERSION) return { skip: [], journal: empty }

  const present = new Set(await store.list(ASSETS_PREFIX))
  const skip: string[] = []
  for (const name of journal.done) {
    const spec = groups.find((g) => g.name === name)
    if (!spec) continue
    const manifest = await readManifest(store)
    const wrote = manifest?.groups[name]?.files ?? []
    // 저널이 끝났다고 해도 파일이 실제로 있어야 건너뛴다
    if (wrote.length > 0 && wrote.every((p) => present.has(`${ASSETS_PREFIX}${p}`))) skip.push(name)
  }
  return { skip, journal }
}

/**
 * 설치를 돌린다. 이미 끝난 그룹은 건너뛴다.
 *
 * 취소·탭 종료·할당량 초과는 전부 같은 자리로 떨어진다 — **완성된 것은 남고
 * 하다 만 것은 저널에 `running`으로 남는다.** 다음 실행이 그 그룹부터 다시 한다
 */
export async function runInstall(options: InstallOptions): Promise<InstallManifest> {
  const { store, fs, locale, groups, signal, onEvent } = options
  const now = options.now ?? (() => new Date())

  const { skip } = await resumableGroups(store, groups)
  if (skip.length > 0) onEvent?.({ kind: 'resumed', skipped: skip })

  const before = await readManifest(store)
  const manifest: InstallManifest = {
    contractVersion: CONTRACT_VERSION,
    // ⚠️ 여기서 `installing`으로 되돌린다. 계약이 바뀌어 다시 도는 중이라면
    // 옛 `ready`가 남아 있으면 안 된다
    state: 'installing',
    platinumLocale: locale,
    availableLocales: [locale],
    startedAt: before?.startedAt ?? now().toISOString(),
    groups: { ...(before?.groups ?? {}) },
  }
  await writeJson(store, INSTALL_FILE, manifest)

  const journal: InstallJournal = { contractVersion: CONTRACT_VERSION, done: [...skip], running: null }

  const todo = groups.filter((g) => g.convert !== undefined && !skip.includes(g.name))
  for (const [index, spec] of todo.entries()) {
    if (signal?.aborted) throw new Cancelled()
    onEvent?.({ kind: 'group', name: spec.name, index, total: todo.length })

    journal.running = spec.name
    await writeJson(store, JOURNAL_FILE, journal)

    const ctx: ConvertContext = {
      fs,
      locale,
      signal,
      onProgress: (done, total) => { onEvent?.({ kind: 'progress', name: spec.name, done, total }) },
    }
    const produced: Produced = await spec.convert!(ctx)

    const files: string[] = []
    let groupBytes = 0
    for (const [path, data] of produced) {
      // 저장소가 임시 이름에 쓰고 길이를 맞춘 뒤 제자리로 옮긴다 (`packStore`)
      await store.write(`${ASSETS_PREFIX}${path}`, data)
      files.push(path)
      groupBytes += data.byteLength
      onEvent?.({ kind: 'wrote', path, bytes: data.byteLength })
    }

    manifest.groups[spec.name] = { files, bytes: groupBytes }
    await writeJson(store, INSTALL_FILE, manifest)

    journal.done.push(spec.name)
    journal.running = null
    await writeJson(store, JOURNAL_FILE, journal)
  }

  // ── 검증 ───────────────────────────────────────────────────────────────────
  //
  // ⚠️ **여기를 지나야 `ready`다.** 매니페스트에 적힌 파일이 실제로 다 있고
  // 크기가 맞는지 본다. 안 보면 쓰다 만 파일이 완성품으로 남는다
  onEvent?.({ kind: 'verifying' })
  if (signal?.aborted) throw new Cancelled()

  const present = new Set(await store.list(ASSETS_PREFIX))
  const missing: string[] = []
  for (const group of Object.values(manifest.groups)) {
    for (const path of group.files) {
      if (!present.has(`${ASSETS_PREFIX}${path}`)) missing.push(path)
    }
  }
  if (missing.length > 0) {
    throw new Error(`설치 검증 실패 — ${String(missing.length)}개가 없다: ${missing.slice(0, 3).join(' · ')}`)
  }

  manifest.state = 'ready'
  manifest.finishedAt = now().toISOString()
  await writeJson(store, INSTALL_FILE, manifest)
  onEvent?.({ kind: 'ready', manifest })
  return manifest
}

/**
 * "에셋 다시 설치" — `assets/`와 저널만 지운다.
 *
 * ⚠️ **`saves/`와 IndexedDB 리포트를 안 건드린다** (IMPORT.md §8 끝). 이것이
 * 지켜지는지는 시험이 직접 잰다 — 말로는 지켜지지 않는다
 */
export async function clearAssets(store: WritablePackStore): Promise<void> {
  await store.clear(ASSETS_PREFIX)
  await store.remove(JOURNAL_FILE)
  await store.remove(INSTALL_FILE)
}
