// OPFS 설치 (IMPORT.md §8 · §14 완료 조건)
//
// 재는 것 넷:
//
//   ① 검증이 끝나기 전에 `ready`가 되지 않는다
//   ② 중간에 끊겨도 완성된 것은 남고, 재개가 하다 만 것부터 다시 한다
//   ③ 저널만 믿지 않는다 — 실제 파일과 대조한다
//   ④ **에셋을 지워도 리포트가 남는다**
import { describe, it, expect } from 'vitest'
import { memoryPackStore, type WritablePackStore } from '../../data/providers/packStore'
import { opfsAssetProvider } from '../../data/providers/opfsAssetProvider'
import { Cancelled, type GroupSpec } from '../platinum/convert'
import type { NdsFileSystem } from '../platinum/nds'
import {
  ASSETS_PREFIX, clearAssets, installReady, JOURNAL_FILE, readManifest, resumableGroups,
  runInstall, SAVES_PREFIX, type InstallEvent, type InstallJournal,
} from './installer'

const AT = new Date('2026-08-10T12:00:00Z')
const enc = new TextEncoder()
const dec = new TextDecoder()

/** 롬은 안 쓴다 — 변환 함수를 가짜로 주면 설치 골격만 잴 수 있다 */
const fakeFs = {} as NdsFileSystem

function group(name: string, files: Record<string, string>, opts: {
  fail?: string
  steps?: number
} = {}): GroupSpec {
  return {
    name,
    outputs: Object.keys(files),
    convert: (ctx) => {
      for (let i = 0; i < (opts.steps ?? 2); i++) {
        if (ctx.signal?.aborted) return Promise.reject(new Cancelled())
        ctx.onProgress?.(i, opts.steps ?? 2)
      }
      if (opts.fail) return Promise.reject(new Error(opts.fail))
      return Promise.resolve(new Map(Object.entries(files).map(([p, v]) => [p, enc.encode(v)])))
    },
  }
}

const GROUPS = [
  group('moves', { 'data/moves.json': '{"count":471}' }),
  group('species', { 'data/species.json': '{"count":508}' }),
]

const run = (store: WritablePackStore, groups: readonly GroupSpec[], extra: {
  signal?: { aborted: boolean }
  onEvent?: (e: InstallEvent) => void
} = {}) => runInstall({ store, fs: fakeFs, locale: 'ko', groups, now: () => AT, ...extra })

describe('한 번에 끝나는 설치', () => {
  it('파일을 만들고 ready가 된다', async () => {
    const store = memoryPackStore()
    const manifest = await run(store, GROUPS)

    expect(manifest.state).toBe('ready')
    expect(manifest.platinumLocale).toBe('ko')
    // ⚠️ 설치된 언어만. 개발 모드에 세 벌이 있다고 세 언어를 주지 않는다
    expect(manifest.availableLocales).toEqual(['ko'])
    expect(await store.list(ASSETS_PREFIX)).toEqual([
      'assets/data/moves.json', 'assets/data/species.json',
    ])
    expect(await installReady(store)).not.toBeNull()
  })

  it('진행이 그룹마다 여러 번 보고된다', async () => {
    const seen: InstallEvent[] = []
    await run(memoryPackStore(), GROUPS, { onEvent: (e) => seen.push(e) })
    expect(seen.filter((e) => e.kind === 'group')).toHaveLength(2)
    expect(seen.filter((e) => e.kind === 'progress').length).toBeGreaterThan(2)
    expect(seen.filter((e) => e.kind === 'wrote')).toHaveLength(2)
    expect(seen.at(-1)?.kind).toBe('ready')
  })

  it('설치한 것을 Provider가 그대로 읽는다', async () => {
    // 두 쪽이 같은 논리 경로를 쓰는지 — 여기가 갈리면 설치는 됐는데 게임이
    // 아무것도 못 찾는다
    const store = memoryPackStore()
    await run(store, GROUPS)
    const assets = opfsAssetProvider({
      kind: 'installed',
      read: (p) => store.read(`${ASSETS_PREFIX}${p}`),
      has: (p) => store.has(`${ASSETS_PREFIX}${p}`),
    })
    expect(await assets.text('data/moves.json')).toBe('{"count":471}')
  })
})

describe('끊기고 다시 잇기', () => {
  it('⚠️ 실패해도 ready가 안 된다', async () => {
    const store = memoryPackStore()
    const broken = [GROUPS[0]!, group('species', {}, { fail: '변환이 터졌다' })]
    await expect(run(store, broken)).rejects.toThrow('변환이 터졌다')

    // 먼저 끝난 그룹은 남는다 — 다시 만들 이유가 없다
    expect(await store.list(ASSETS_PREFIX)).toEqual(['assets/data/moves.json'])
    // 그러나 **게임은 시작 못 한다**
    expect(await installReady(store)).toBeNull()
    expect((await readManifest(store))?.state).toBe('installing')
  })

  it('취소하면 하다 만 그룹이 저널에 남는다', async () => {
    const store = memoryPackStore()
    const signal = { aborted: false }
    const slow = [GROUPS[0]!, group('species', { 'data/species.json': 'x' }, { steps: 50 })]

    await expect(run(store, slow, {
      signal,
      onEvent: (e) => { if (e.kind === 'progress' && e.name === 'species') signal.aborted = true },
    })).rejects.toBeInstanceOf(Cancelled)

    const journal = JSON.parse(dec.decode((await store.read(JOURNAL_FILE))!)) as InstallJournal
    expect(journal.done).toEqual(['moves'])
    expect(journal.running).toBe('species')
  })

  it('재개하면 끝난 그룹을 건너뛴다', async () => {
    const store = memoryPackStore()
    await expect(run(store, [GROUPS[0]!, group('species', {}, { fail: '한 번 터진다' })]))
      .rejects.toThrow()

    let ran = 0
    const again = [
      { ...GROUPS[0]!, convert: (c: Parameters<NonNullable<GroupSpec['convert']>>[0]) => {
        ran++
        return GROUPS[0]!.convert!(c)
      } },
      GROUPS[1]!,
    ]
    const seen: InstallEvent[] = []
    const manifest = await run(store, again, { onEvent: (e) => seen.push(e) })

    // 이미 끝난 `moves`는 **다시 안 돈다**
    expect(ran).toBe(0)
    expect(seen.find((e) => e.kind === 'resumed')).toEqual({ kind: 'resumed', skipped: ['moves'] })
    expect(manifest.state).toBe('ready')
  })

  it('⚠️ 저널만 믿지 않는다 — 파일이 사라졌으면 다시 만든다', async () => {
    // 저널을 쓴 직후 탭이 죽으면 "끝났다"고 적힌 그룹의 파일이 없을 수 있다.
    // 저널만 보고 건너뛰면 게임이 없는 파일을 찾는다
    const store = memoryPackStore()
    await run(store, GROUPS)
    await store.remove(`${ASSETS_PREFIX}data/moves.json`)

    const { skip } = await resumableGroups(store, GROUPS)
    expect(skip).toEqual(['species'])
  })

  it('계약 판이 바뀌면 저널을 안 믿는다', async () => {
    const store = memoryPackStore()
    await run(store, GROUPS)
    await store.write(JOURNAL_FILE, enc.encode(JSON.stringify({
      contractVersion: 99, done: ['moves', 'species'], running: null,
    })))
    const { skip } = await resumableGroups(store, GROUPS)
    expect(skip).toEqual([])
  })
})

describe('에셋 삭제와 리포트 분리', () => {
  it('⚠️ 에셋을 지워도 리포트 사본이 남는다', async () => {
    // IMPORT.md §8 끝 — "에셋 다시 설치"가 `saves/`를 건드리면 안 된다.
    // 말로는 안 지켜진다. 실제로 지워 보고 남는지 본다
    const store = memoryPackStore()
    await run(store, GROUPS)
    await store.write(`${SAVES_PREFIX}report.rpsave`, enc.encode('내 진행'))

    await clearAssets(store)

    expect(await store.list(ASSETS_PREFIX)).toEqual([])
    expect(await store.read(JOURNAL_FILE)).toBeNull()
    expect(await installReady(store)).toBeNull()
    // 남아야 하는 것
    expect(dec.decode((await store.read(`${SAVES_PREFIX}report.rpsave`))!)).toBe('내 진행')
  })

  it('지운 뒤 다시 설치하면 같은 자리에 돌아온다', async () => {
    const store = memoryPackStore()
    await run(store, GROUPS)
    await store.write(`${SAVES_PREFIX}report.rpsave`, enc.encode('내 진행'))
    await clearAssets(store)

    const manifest = await run(store, GROUPS)
    expect(manifest.state).toBe('ready')
    expect(await store.list(ASSETS_PREFIX)).toHaveLength(2)
    // 리포트는 그 사이에 한 번도 안 건드려졌다
    expect(dec.decode((await store.read(`${SAVES_PREFIX}report.rpsave`))!)).toBe('내 진행')
  })
})

describe('검증', () => {
  it('⚠️ 매니페스트에 적힌 파일이 없으면 ready가 안 된다', async () => {
    const store = memoryPackStore()
    // 쓰는 척만 하고 안 쓰는 저장소 — 쓰다 만 상태를 흉내 낸다
    const liar: WritablePackStore = { ...store, write: () => Promise.resolve() }
    await expect(runInstall({
      store: liar, fs: fakeFs, locale: 'ko', groups: GROUPS, now: () => AT,
    })).rejects.toThrow(/검증 실패/)
  })
})
