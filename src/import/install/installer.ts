// OPFS 설치 (IMPORT.md §8 · §13-8)
//
// 재는 것은 넷이다: **중간에 끊겨도 잃지 않는가**, **끝나기 전에 게임이
// 시작되지 않는가**, **에셋을 지워도 리포트가 남는가**, **깨진 파일을 완료로
// 세지 않는가**.
//
// ⚠️ **`ready`는 "돌릴 수 있는 것을 다 돌렸다"가 아니다.** 게임을 시작하는 데
// 필요한 그룹(`required.ts`)이 전부 있고 그 파일들이 길이·해시까지 맞을 때만이다.
// 그 전에는 `partial`이고, `partial`로는 게임이 안 열린다. 한때 이 자리가
// "변환기가 있는 그룹을 다 돌렸으면 ready"였고, 그때 구현된 것은 `moves`
// 하나였다 — 기술 471개만 든 설치본이 "준비 완료"로 남았다.
//
// ⚠️ **저장소가 둘이다.** `root`에 `install.json`·`journal.json`·`saves/`가 있고,
// `assets`에 게임이 읽는 것이 있다. 하나로 두고 `assets/` 접두어를 붙이던 때는
// Provider의 뿌리가 이미 `…/assets`라서 `assets/assets`가 되기 직전이었다.
// 나누면 접두어 자체가 사라진다.
//
// ⚠️ **에셋과 리포트는 저장소가 다르다.** 에셋은 OPFS, 리포트는 IndexedDB다
// (`state/report.ts`). "에셋 다시 설치"가 리포트를 안 건드리는 것이 그래서 성립한다.
import type { WritablePackStore } from '../../data/providers/packStore'
import { Cancelled, type GroupSpec, type Produced } from '../platinum/convert'
import type { NdsFileSystem } from '../platinum/nds'
import type { Release } from '../platinum/validate'
import { checkFile, recordOf, type Broken, type FileRecord } from './integrity'
import {
  CONTRACT_VERSION, parseJournal, parseManifest,
  type GroupRecord, type InstallJournal, type InstallManifest, type ReadResult,
} from './manifestSchema'
import { missingRequired } from './required'

export { CONTRACT_VERSION }
export type { InstallManifest, InstallJournal, GroupRecord }

export const INSTALL_FILE = 'install.json'
export const JOURNAL_FILE = 'journal.json'
/** 리포트 사본이 사는 가지. **에셋 삭제가 안 건드린다** */
export const SAVES_PREFIX = 'saves/'

/** 두 저장소. 섞으면 접두어가 겹치거나 세이브가 함께 지워진다 */
export interface InstallStores {
  /** `install.json` · `journal.json` · `saves/` */
  root: WritablePackStore
  /** 게임이 읽는 자리. Provider가 이 저장소를 그대로 본다 */
  assets: WritablePackStore
}

export type InstallEvent =
  | { kind: 'group'; name: string; index: number; total: number }
  | { kind: 'progress'; name: string; done: number; total: number }
  | { kind: 'wrote'; path: string; bytes: number }
  | { kind: 'resumed'; skipped: string[]; rebuilt: string[] }
  | { kind: 'verifying'; done: number; total: number }
  | { kind: 'done'; manifest: InstallManifest; missing: string[] }

/**
 * 바이트를 만들어 오는 쪽.
 *
 * ⚠️ **설치기는 변환을 직접 안 부른다.** 공개판에서 변환은 Worker 안에서 돌고,
 * `NdsFileSystem`은 함수를 품고 있어서 스레드를 못 건넌다 — 그래서 설치기가
 * `fs`를 들고 있으면 Worker를 쓸 수가 없다. 여기서 끊으면 같은 설치기가
 * 로컬(시험)에서도 Worker(브라우저)에서도 돈다
 */
export type Producer = (
  spec: GroupSpec,
  hooks: { onProgress: (done: number, total: number) => void },
) => Promise<Produced>

/** 같은 스레드에서 만든다. 시험과 노드 parity가 이 길로 간다 */
export function localProducer(fs: NdsFileSystem, release: Release, locale: string,
  signal?: { aborted: boolean }): Producer {
  return (spec, hooks) => spec.convert!({ fs, release, locale, signal, onProgress: hooks.onProgress })
}

export interface InstallOptions extends InstallStores {
  locale: string
  groups: readonly GroupSpec[]
  produce: Producer
  /** 지금 시각. 시험이 값을 못 박을 수 있어야 한다 */
  now?: () => Date
  signal?: { aborted: boolean }
  onEvent?: (e: InstallEvent) => void
}

const decoder = new TextDecoder()
const encoder = new TextEncoder()

async function readJson(store: WritablePackStore, path: string): Promise<unknown | undefined> {
  const raw = await store.read(path)
  if (!raw) return undefined
  try { return JSON.parse(decoder.decode(raw)) } catch { return null } // null = 깨진 JSON
}

function writeJson(store: WritablePackStore, path: string, value: unknown): Promise<void> {
  return store.write(path, encoder.encode(JSON.stringify(value, null, 1)))
}

// ── 읽기 ─────────────────────────────────────────────────────────────────────

/**
 * 설치 기록을 읽는다.
 *
 * ⚠️ **`none`과 `invalid`를 구별한다.** 없는 것은 "아직 설치를 안 했다"이고
 * 모양이 다른 것은 "무언가 잘못됐다"다 — 화면이 할 말이 다르고, 후자는
 * 리포트를 건드리지 않은 채 다시 설치를 요구해야 한다
 */
export async function readInstall(store: WritablePackStore): Promise<ReadResult<InstallManifest>> {
  const raw = await readJson(store, INSTALL_FILE)
  if (raw === undefined) return { kind: 'none' }
  if (raw === null) return { kind: 'invalid', why: 'install.json이 JSON이 아니다' }
  return parseManifest(raw)
}

async function readJournal(store: WritablePackStore): Promise<InstallJournal> {
  const empty: InstallJournal = { contractVersion: CONTRACT_VERSION, done: [], running: null }
  const raw = await readJson(store, JOURNAL_FILE)
  if (raw === undefined || raw === null) return empty
  const got = parseJournal(raw)
  // 모양이 다른 저널은 없는 것으로 친다 — 그러면 전부 다시 만든다. 안전한 쪽이다
  return got.kind === 'ok' ? got.value : empty
}

/**
 * 게임을 시작해도 되는가. **이 함수 하나가 그 판단의 전부다**
 *
 * 해시를 다시 세지 않는다 — `state: 'ready'`는 그 검사를 통과했을 때만 쓰이고,
 * 부팅마다 630MB를 다시 해싱하면 첫 화면이 몇 초씩 늦는다
 */
export async function installReady(store: WritablePackStore): Promise<InstallManifest | null> {
  const got = await readInstall(store)
  if (got.kind !== 'ok') return null
  if (got.value.state !== 'ready') return null
  // ready인데 필수 그룹이 빠져 있으면 그 기록 자체를 안 믿는다
  if (missingRequired(Object.keys(got.value.groups)).length > 0) return null
  return got.value
}

// ── 검증 ─────────────────────────────────────────────────────────────────────

export interface VerifyResult {
  /** 파일까지 온전한 그룹 */
  ok: string[]
  /** 어긋난 것이 있는 그룹 → 무엇이 어긋났는가 */
  broken: Map<string, Broken[]>
}

/**
 * 기록된 파일을 **실제로 읽어** 길이와 SHA-256을 견준다.
 *
 * ⚠️ 예전에는 `store.list()`로 이름만 모아 `Set`으로 물었다. 그러면 0바이트로
 * 잘린 파일이 완료로 지나가고, 재개가 그 그룹을 건너뛴다
 */
export async function verifyGroups(
  assets: WritablePackStore,
  manifest: InstallManifest,
  names: readonly string[],
  onProgress?: (done: number, total: number) => void,
): Promise<VerifyResult> {
  const ok: string[] = []
  const broken = new Map<string, Broken[]>()
  const total = names.reduce((a, n) => a + (manifest.groups[n]?.files.length ?? 0), 0)
  let done = 0

  for (const name of names) {
    const group = manifest.groups[name]
    if (!group) { broken.set(name, [{ path: name, why: 'missing', detail: '기록이 없다' }]); continue }
    const bad: Broken[] = []
    for (const record of group.files) {
      const fault = await checkFile((p) => assets.read(p), record)
      if (fault) bad.push(fault)
      done += 1
      if (done % 32 === 0 || done === total) onProgress?.(done, total)
    }
    if (bad.length > 0) broken.set(name, bad)
    else ok.push(name)
  }
  onProgress?.(total, total)
  return { ok, broken }
}

/**
 * 다시 만들지 않아도 되는 그룹 (IMPORT.md §8).
 *
 * 저널이 "끝났다"고 적은 것만 후보로 두고, 그 파일을 **실제로 읽어** 확인한다.
 * 저널을 쓴 직후 탭이 죽으면 적힌 것과 있는 것이 다르다
 */
export async function resumableGroups(
  stores: InstallStores,
  groups: readonly GroupSpec[],
): Promise<{ skip: string[]; rebuild: string[]; journal: InstallJournal }> {
  const journal = await readJournal(stores.root)
  const got = await readInstall(stores.root)
  if (got.kind !== 'ok') return { skip: [], rebuild: [], journal }

  const known = new Set(groups.map((g) => g.name))
  const candidates = journal.done.filter((n) => known.has(n) && got.value.groups[n])
  const { ok, broken } = await verifyGroups(stores.assets, got.value, candidates)
  return { skip: ok, rebuild: [...broken.keys()], journal }
}

// ── 설치 ─────────────────────────────────────────────────────────────────────

/**
 * 설치를 돌린다. 온전한 그룹은 건너뛰고 **깨진 그룹만 다시 만든다.**
 *
 * 취소·탭 종료·할당량 초과는 전부 같은 자리로 떨어진다 — 완성된 것은 남고
 * 하다 만 것은 저널에 `running`으로 남는다. 다음 실행이 그 그룹부터 다시 한다
 */
export async function runInstall(options: InstallOptions): Promise<InstallManifest> {
  const { root, assets, locale, groups, produce, signal, onEvent } = options
  const now = options.now ?? (() => new Date())

  const { skip, rebuild } = await resumableGroups(options, groups)
  if (skip.length > 0 || rebuild.length > 0) onEvent?.({ kind: 'resumed', skipped: skip, rebuilt: rebuild })

  const before = await readInstall(root)
  const keep: Record<string, GroupRecord> = {}
  if (before.kind === 'ok') for (const name of skip) {
    const had = before.value.groups[name]
    if (had) keep[name] = had
  }

  const manifest: InstallManifest = {
    contractVersion: CONTRACT_VERSION,
    // ⚠️ 여기서 `installing`으로 되돌린다. 도중에 죽으면 옛 `ready`가 남으면 안 된다
    state: 'installing',
    platinumLocale: locale,
    availableLocales: [locale],
    startedAt: before.kind === 'ok' ? before.value.startedAt : now().toISOString(),
    groups: keep,
  }
  await writeJson(root, INSTALL_FILE, manifest)

  const journal: InstallJournal = { contractVersion: CONTRACT_VERSION, done: [...skip], running: null }
  await writeJson(root, JOURNAL_FILE, journal)

  const todo = groups.filter((g) => g.convert !== undefined && !skip.includes(g.name))
  for (const [index, spec] of todo.entries()) {
    if (signal?.aborted) throw new Cancelled()
    onEvent?.({ kind: 'group', name: spec.name, index, total: todo.length })

    journal.running = spec.name
    await writeJson(root, JOURNAL_FILE, journal)

    const produced: Produced = await produce(spec, {
      onProgress: (done, total) => { onEvent?.({ kind: 'progress', name: spec.name, done, total }) },
    })

    const files: FileRecord[] = []
    let groupBytes = 0
    for (const [path, data] of produced) {
      // 저장소가 임시 이름에 쓰고 길이를 맞춘 뒤 제자리로 옮긴다 (`packStore`)
      await assets.write(path, data)
      files.push(await recordOf(path, data))
      groupBytes += data.byteLength
      onEvent?.({ kind: 'wrote', path, bytes: data.byteLength })
    }

    manifest.groups[spec.name] = { files, bytes: groupBytes, converter: spec.converter }
    await writeJson(root, INSTALL_FILE, manifest)

    journal.done.push(spec.name)
    journal.running = null
    await writeJson(root, JOURNAL_FILE, journal)
  }

  // ── 마지막 검증 ────────────────────────────────────────────────────────────
  //
  // ⚠️ **여기를 지나야 `ready`다.** 기록된 파일을 전부 다시 읽어 길이와 해시를
  // 맞춘다. 방금 쓴 것을 왜 또 읽느냐면 — 할당량이 도중에 차거나 브라우저가
  // 되찾아 갔을 수 있고, 그것이 조용히 일어나기 때문이다
  if (signal?.aborted) throw new Cancelled()
  const have = Object.keys(manifest.groups)
  const { broken } = await verifyGroups(assets, manifest, have,
    (done, total) => { onEvent?.({ kind: 'verifying', done, total }) })

  for (const name of broken.keys()) delete manifest.groups[name]

  const missing = missingRequired(Object.keys(manifest.groups))
  // 깨진 것이 있으면 필수를 다 채웠더라도 `ready`가 아니다
  manifest.state = missing.length === 0 && broken.size === 0 ? 'ready' : 'partial'
  if (manifest.state === 'ready') manifest.finishedAt = now().toISOString()
  await writeJson(root, INSTALL_FILE, manifest)
  onEvent?.({ kind: 'done', manifest, missing })
  return manifest
}

/**
 * "에셋 다시 설치" — 에셋 저장소와 설치 기록만 지운다.
 *
 * ⚠️ **`saves/`와 IndexedDB 리포트를 안 건드린다** (IMPORT.md §8 끝). 저장소를
 * 둘로 나눈 덕에 이것이 실수로 깨질 자리가 없다 — `assets`를 통째로 비워도
 * `saves/`는 `root`에 있다. 시험이 직접 잰다
 */
export async function clearAssets(stores: InstallStores): Promise<void> {
  await stores.assets.clear('')
  await stores.root.remove(JOURNAL_FILE)
  await stores.root.remove(INSTALL_FILE)
}
