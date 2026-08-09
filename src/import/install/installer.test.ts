// OPFS 설치 (IMPORT.md §8 · §14 완료 조건)
//
// 재는 것 여섯:
//
//   ① **필수 그룹이 다 있어야** `ready`다 — 돌릴 수 있는 것을 다 돌린 것이 아니라
//   ② 중간에 끊겨도 완성된 것은 남고, 재개가 하다 만 것부터 다시 한다
//   ③ 저널만 믿지 않는다 — 실제 파일의 **길이와 SHA-256**을 본다
//   ④ 깨진 파일이 완료로 지나가지 않는다
//   ⑤ 모양이 다른 `install.json`은 `invalid`로 걸린다
//   ⑥ **에셋을 지워도 리포트가 남는다**
import { describe, it, expect } from 'vitest'
import { memoryPackStore, type WritablePackStore } from '../../data/providers/packStore'
import { opfsAssetProvider } from '../../data/providers/opfsAssetProvider'
import { Cancelled, type GroupSpec } from '../platinum/convert'
import {
  clearAssets, installReady, JOURNAL_FILE, INSTALL_FILE, readInstall, resumableGroups,
  runInstall, SAVES_PREFIX, verifyGroups,
  type InstallEvent, type InstallJournal, type InstallStores, type Producer,
} from './installer'
import { CONTRACT_VERSION } from './manifestSchema'
import { REQUIRED_GROUPS } from './required'

const AT = new Date('2026-08-10T12:00:00Z')
const enc = new TextEncoder()
const dec = new TextDecoder()

function group(name: string, files: Record<string, string>, opts: {
  fail?: string
  steps?: number
} = {}): GroupSpec {
  return {
    name,
    outputs: Object.keys(files),
    converter: 1,
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

/**
 * 필수 목록을 다 채우는 그룹 묶음.
 *
 * ⚠️ 여기가 곧 "무엇이 있어야 ready인가"의 시험이다. `required.ts`에서 하나를
 * 빼면 이 묶음이 부족해지고 아래 시험들이 `partial`로 떨어진다
 */
const FULL: GroupSpec[] = REQUIRED_GROUPS.map(
  (name) => group(name, { [`data/${name}.json`]: `{"g":"${name}"}` }))

/** 필수의 일부만. 이걸로는 `ready`가 되면 안 된다 */
const PARTIAL = FULL.slice(0, 2)

function stores(): InstallStores {
  return { root: memoryPackStore(), assets: memoryPackStore() }
}

const local = (groups: readonly GroupSpec[], signal?: { aborted: boolean }): Producer =>
  (spec, hooks) => {
    const found = groups.find((g) => g.name === spec.name)!
    return found.convert!({
      fs: null as never, release: null as never, locale: 'ko', signal,
      onProgress: hooks.onProgress,
    })
  }

const run = (s: InstallStores, groups: readonly GroupSpec[], extra: {
  signal?: { aborted: boolean }
  onEvent?: (e: InstallEvent) => void
} = {}) => runInstall({
  ...s, locale: 'ko', groups, produce: local(groups, extra.signal), now: () => AT, ...extra,
})

describe('한 번에 끝나는 설치', () => {
  it('필수 그룹이 다 있으면 ready가 된다', async () => {
    const s = stores()
    const manifest = await run(s, FULL)

    expect(manifest.state).toBe('ready')
    expect(manifest.platinumLocale).toBe('ko')
    // ⚠️ 설치된 언어만. 개발 모드에 세 벌이 있다고 세 언어를 주지 않는다
    expect(manifest.availableLocales).toEqual(['ko'])
    expect(await s.assets.list()).toHaveLength(REQUIRED_GROUPS.length)
    expect(await installReady(s.root)).not.toBeNull()
  })

  it('⚠️ 필수 그룹이 모자라면 ready가 아니라 partial이다', async () => {
    // 한때 여기가 "변환기가 있는 그룹을 다 돌렸으면 ready"였고, 그때 구현된
    // 것은 `moves` 하나였다 — 기술 471개만 든 설치본이 "준비 완료"였다
    const s = stores()
    let missing: string[] = []
    const manifest = await run(s, PARTIAL, {
      onEvent: (e) => { if (e.kind === 'done') missing = e.missing },
    })

    expect(manifest.state).toBe('partial')
    expect(missing).toHaveLength(REQUIRED_GROUPS.length - PARTIAL.length)
    // **게임은 못 연다**
    expect(await installReady(s.root)).toBeNull()
  })

  it('파일마다 길이와 SHA-256을 적는다', async () => {
    const s = stores()
    const manifest = await run(s, PARTIAL)
    const first = manifest.groups[PARTIAL[0]!.name]!.files[0]!
    expect(first.bytes).toBeGreaterThan(0)
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('진행이 그룹마다 여러 번 보고된다', async () => {
    const seen: InstallEvent[] = []
    await run(stores(), PARTIAL, { onEvent: (e) => seen.push(e) })
    expect(seen.filter((e) => e.kind === 'group')).toHaveLength(2)
    expect(seen.filter((e) => e.kind === 'progress').length).toBeGreaterThan(2)
    expect(seen.filter((e) => e.kind === 'wrote')).toHaveLength(2)
    expect(seen.at(-1)?.kind).toBe('done')
  })

  it('설치한 것을 Provider가 그대로 읽는다', async () => {
    // 두 쪽이 같은 논리 경로를 쓰는지 — 여기가 갈리면 설치는 됐는데 게임이
    // 아무것도 못 찾는다. **접두어가 안 겹치는지**도 여기서 걸린다
    const s = stores()
    await run(s, PARTIAL)
    const assets = opfsAssetProvider(s.assets)
    const name = PARTIAL[0]!.name
    expect(await assets.text(`data/${name}.json`)).toBe(`{"g":"${name}"}`)
  })
})

describe('끊기고 다시 잇기', () => {
  it('⚠️ 실패해도 ready가 안 된다', async () => {
    const s = stores()
    const broken = [FULL[0]!, group(FULL[1]!.name, {}, { fail: '변환이 터졌다' })]
    await expect(run(s, broken)).rejects.toThrow('변환이 터졌다')

    // 먼저 끝난 그룹은 남는다 — 다시 만들 이유가 없다
    expect(await s.assets.list()).toHaveLength(1)
    // 그러나 **게임은 시작 못 한다**
    expect(await installReady(s.root)).toBeNull()
    const got = await readInstall(s.root)
    expect(got.kind === 'ok' && got.value.state).toBe('installing')
  })

  it('취소하면 하다 만 그룹이 저널에 남는다', async () => {
    const s = stores()
    const signal = { aborted: false }
    const slow = [FULL[0]!, group(FULL[1]!.name, { 'data/x.json': 'x' }, { steps: 50 })]

    await expect(run(s, slow, {
      signal,
      onEvent: (e) => { if (e.kind === 'progress' && e.name === slow[1]!.name) signal.aborted = true },
    })).rejects.toBeInstanceOf(Cancelled)

    const journal = JSON.parse(dec.decode((await s.root.read(JOURNAL_FILE))!)) as InstallJournal
    expect(journal.done).toEqual([FULL[0]!.name])
    expect(journal.running).toBe(slow[1]!.name)
  })

  it('재개하면 온전한 그룹을 건너뛴다', async () => {
    const s = stores()
    await expect(run(s, [FULL[0]!, group(FULL[1]!.name, {}, { fail: '한 번 터진다' })]))
      .rejects.toThrow()

    let ran = 0
    const again = FULL.map((g) => (g.name === FULL[0]!.name
      ? { ...g, convert: (c: Parameters<NonNullable<GroupSpec['convert']>>[0]) => { ran++; return g.convert!(c) } }
      : g))
    const seen: InstallEvent[] = []
    const manifest = await run(s, again, { onEvent: (e) => seen.push(e) })

    // 이미 끝난 그룹은 **다시 안 돈다**
    expect(ran).toBe(0)
    expect(seen.find((e) => e.kind === 'resumed'))
      .toEqual({ kind: 'resumed', skipped: [FULL[0]!.name], rebuilt: [] })
    expect(manifest.state).toBe('ready')
  })

  it('⚠️ 저널만 믿지 않는다 — 파일이 사라졌으면 다시 만든다', async () => {
    // 저널을 쓴 직후 탭이 죽으면 "끝났다"고 적힌 그룹의 파일이 없을 수 있다
    const s = stores()
    await run(s, PARTIAL)
    await s.assets.remove(`data/${PARTIAL[0]!.name}.json`)

    const { skip, rebuild } = await resumableGroups(s, PARTIAL)
    expect(skip).toEqual([PARTIAL[1]!.name])
    expect(rebuild).toEqual([PARTIAL[0]!.name])
  })

  it('⚠️ 길이가 다른 파일을 완료로 세지 않는다', async () => {
    // 할당량이 차서 잘린 파일. 이름은 그대로라 `list()`로는 못 잡는다
    const s = stores()
    await run(s, PARTIAL)
    await s.assets.write(`data/${PARTIAL[0]!.name}.json`, enc.encode('짧'))

    const { skip, rebuild } = await resumableGroups(s, PARTIAL)
    expect(skip).toEqual([PARTIAL[1]!.name])
    expect(rebuild).toEqual([PARTIAL[0]!.name])
  })

  it('⚠️ 길이는 같은데 내용이 다른 파일도 잡는다', async () => {
    // 길이만 보면 지나간다. 해시가 그 자리를 메운다
    const s = stores()
    const manifest = await run(s, PARTIAL)
    const path = `data/${PARTIAL[0]!.name}.json`
    const was = manifest.groups[PARTIAL[0]!.name]!.files[0]!.bytes
    await s.assets.write(path, enc.encode('x'.repeat(was)))

    const { broken } = await verifyGroups(s.assets, manifest, [PARTIAL[0]!.name])
    expect(broken.get(PARTIAL[0]!.name)?.[0]?.why).toBe('hash')
  })

  it('깨진 그룹만 다시 만든다 — 온전한 것은 그대로', async () => {
    const s = stores()
    await run(s, FULL)
    await s.assets.remove(`data/${FULL[3]!.name}.json`)

    const ran: string[] = []
    const again = FULL.map((g) => ({
      ...g,
      convert: (c: Parameters<NonNullable<GroupSpec['convert']>>[0]) => { ran.push(g.name); return g.convert!(c) },
    }))
    const manifest = await run(s, again)
    expect(ran).toEqual([FULL[3]!.name])
    expect(manifest.state).toBe('ready')
  })

  it('계약 판이 바뀌면 저널을 안 믿는다', async () => {
    const s = stores()
    await run(s, PARTIAL)
    await s.root.write(JOURNAL_FILE, enc.encode(JSON.stringify({
      contractVersion: 99, done: PARTIAL.map((g) => g.name), running: null,
    })))
    const { skip } = await resumableGroups(s, PARTIAL)
    expect(skip).toEqual([])
  })
})

describe('깨진 기록', () => {
  it('JSON이 아니면 invalid다', async () => {
    const s = stores()
    await s.root.write(INSTALL_FILE, enc.encode('{ 반쯤 쓰다 말'))
    const got = await readInstall(s.root)
    expect(got.kind).toBe('invalid')
    expect(await installReady(s.root)).toBeNull()
  })

  it('⚠️ 같은 판인데 모양이 다르면 invalid다 — cast로 통과시키지 않는다', async () => {
    const s = stores()
    await s.root.write(INSTALL_FILE, enc.encode(JSON.stringify({
      contractVersion: CONTRACT_VERSION, state: 'ready', platinumLocale: 'ko',
      availableLocales: ['ko'], startedAt: 'x',
      // `files`가 문자열 배열이던 옛 모양
      groups: { moves: { files: ['data/moves.json'], bytes: 10, converter: 1 } },
    })))
    expect((await readInstall(s.root)).kind).toBe('invalid')
    expect(await installReady(s.root)).toBeNull()
  })

  it('없으면 none이다 — invalid와 구별한다', async () => {
    expect((await readInstall(memoryPackStore())).kind).toBe('none')
  })
})

describe('에셋 삭제와 리포트 분리', () => {
  it('⚠️ 에셋을 지워도 리포트 사본이 남는다', async () => {
    // IMPORT.md §8 끝 — "에셋 다시 설치"가 `saves/`를 건드리면 안 된다.
    // 말로는 안 지켜진다. 실제로 지워 보고 남는지 본다
    const s = stores()
    await run(s, FULL)
    await s.root.write(`${SAVES_PREFIX}report.rpsave`, enc.encode('내 진행'))

    await clearAssets(s)

    expect(await s.assets.list()).toEqual([])
    expect(await s.root.read(JOURNAL_FILE)).toBeNull()
    expect(await installReady(s.root)).toBeNull()
    // 남아야 하는 것
    expect(dec.decode((await s.root.read(`${SAVES_PREFIX}report.rpsave`))!)).toBe('내 진행')
  })

  it('지운 뒤 다시 설치하면 같은 자리에 돌아온다', async () => {
    const s = stores()
    await run(s, FULL)
    await s.root.write(`${SAVES_PREFIX}report.rpsave`, enc.encode('내 진행'))
    await clearAssets(s)

    const manifest = await run(s, FULL)
    expect(manifest.state).toBe('ready')
    expect(await s.assets.list()).toHaveLength(REQUIRED_GROUPS.length)
    // 리포트는 그 사이에 한 번도 안 건드려졌다
    expect(dec.decode((await s.root.read(`${SAVES_PREFIX}report.rpsave`))!)).toBe('내 진행')
  })
})

describe('검증', () => {
  it('⚠️ 매니페스트에 적힌 파일이 없으면 ready가 안 된다', async () => {
    const s = stores()
    // 쓰는 척만 하고 안 쓰는 저장소 — 쓰다 만 상태를 흉내 낸다
    const liar: WritablePackStore = { ...s.assets, write: () => Promise.resolve() }
    const manifest = await run({ root: s.root, assets: liar }, FULL)
    expect(manifest.state).toBe('partial')
    expect(Object.keys(manifest.groups)).toEqual([])
    expect(await installReady(s.root)).toBeNull()
  })
})
