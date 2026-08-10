// 부팅 갈래 (IMPORT.md §7 · §13-3 · §14 완료 조건)
//
// ⚠️ **이 결정을 한때 아무도 안 내렸다.** `main.tsx`가 곧바로 `<App />`을 그렸고
// `assets()`는 Provider가 없으면 HTTP를 만들었다 — 그래서 공개 빌드는 설치를
// 끝내고 다시 켜도 있지도 않은 `/data`로 요청을 보냈다.
//
// 재는 것 다섯:
//
//   ① 개발판은 지금 그대로 HTTP
//   ② 공개판 + ready → OPFS. 콘텐츠 계약과 언어 목록도 따라온다
//   ③ 공개판 + 미설치 → **HTTP로 안 되돌아간다.** 콘텐츠를 한 번도 안 부른다
//   ④ partial·invalid·미지원이 각각 다른 이유로 갈린다
//   ⑤ 설치 직후 갈아 끼운 것이 다시 켜도 복구된다
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { boot, activateInstall, type BootEnv } from './boot'
import { assets, setAssetProvider } from '../data/providers/assetProvider'
import { memoryPackStore, type WritablePackStore } from '../data/providers/packStore'
import { contentContract, setContentContract } from '../state/save/contract'
import { availableLanguages, LANGUAGES } from '../state/optionsStore'
import {
  CONTRACT_VERSION, INSTALL_FILE, runInstall, type InstallStores,
} from '../import/install/installer'
import { REQUIRED_GROUPS } from '../import/install/required'
import type { GroupSpec } from '../import/platinum/convert'

const enc = new TextEncoder()

/** 필수를 다 채우는 가짜 그룹들 */
const FULL: GroupSpec[] = REQUIRED_GROUPS.map((name) => ({
  name,
  outputs: [`data/${name}.json`],
  converter: 1,
  convert: () => Promise.resolve(new Map([[`data/${name}.json`, enc.encode(`{"g":"${name}"}`)]])),
}))

async function installed(locale = 'ko'): Promise<InstallStores> {
  const s: InstallStores = { root: memoryPackStore(), assets: memoryPackStore() }
  await runInstall({
    ...s, locale, groups: FULL,
    produce: (spec) => spec.convert!({
      fs: null as never, release: null as never, locale, onProgress: () => {},
    }),
  })
  return s
}

const prod = (root: WritablePackStore, asset?: WritablePackStore): BootEnv =>
  ({ dev: false, opfs: true, rootStore: root, assetStore: asset })

/** 네트워크를 건드리면 시험이 안다 */
const realFetch = globalThis.fetch
let fetched: string[]

beforeEach(() => {
  fetched = []
  globalThis.fetch = ((input: RequestInfo | URL) => {
    fetched.push(String(input))
    return Promise.reject(new Error('네트워크를 부르면 안 된다'))
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  setAssetProvider(null)
  setContentContract({ platinumLocale: 'dev', schema: 1 })
})

describe('개발판', () => {
  it('HTTP Provider로 시작한다 — 기존 동작 그대로', async () => {
    const state = await boot({ dev: true, opfs: false })
    expect(state).toEqual({ kind: 'play', source: 'dev', manifest: null })
    expect(assets().kind).toBe('dev-http')
  })
})

describe('공개판 + 설치본', () => {
  it('OPFS Provider로 시작하고 계약을 세운다', async () => {
    const s = await installed('ja')
    const state = await boot(prod(s.root, s.assets))

    expect(state.kind).toBe('play')
    if (state.kind !== 'play') return
    expect(state.source).toBe('opfs')
    expect(state.manifest?.platinumLocale).toBe('ja')
    expect(assets().kind).toContain('opfs')
    expect(contentContract().platinumLocale).toBe('ja')
  })

  it('⚠️ 설치된 언어만 고를 수 있다', async () => {
    const s = await installed('ja')
    await boot(prod(s.root, s.assets))
    // 개발판에 세 벌이 있다고 세 언어를 주지 않는다
    expect(availableLanguages()).toEqual(['ja'])
    // 되돌리는 것은 아래 describe의 afterEach가 한다
  })

  it('설치한 것을 그대로 읽는다', async () => {
    const s = await installed()
    await boot(prod(s.root, s.assets))
    expect(await assets().text(`data/${REQUIRED_GROUPS[0]!}.json`))
      .toBe(`{"g":"${REQUIRED_GROUPS[0]!}"}`)
    expect(fetched).toEqual([])
  })

  it('다시 켜도 같은 자리로 온다', async () => {
    const s = await installed('en')
    await boot(prod(s.root, s.assets))
    setAssetProvider(null) // 탭을 닫았다 친다
    const again = await boot(prod(s.root, s.assets))
    expect(again.kind).toBe('play')
    expect(assets().kind).toContain('opfs')
  })
})

describe('공개판 + 설치본 없음', () => {
  it('⚠️ HTTP로 안 되돌아간다 — 네트워크를 한 번도 안 부른다', async () => {
    const state = await boot(prod(memoryPackStore()))
    expect(state).toEqual({ kind: 'install', reason: 'none' })
    expect(assets().kind).toBe('absent')
    // 콘텐츠를 물어도 네트워크가 아니라 즉시 없다고 답한다
    await expect(assets().text('data/species.json')).rejects.toThrow()
    expect(fetched).toEqual([])
  })

  it('부분 설치는 partial이다 — 게임을 안 연다', async () => {
    const s: InstallStores = { root: memoryPackStore(), assets: memoryPackStore() }
    await runInstall({
      ...s, locale: 'ko', groups: FULL.slice(0, 2),
      produce: (spec) => spec.convert!({
        fs: null as never, release: null as never, locale: 'ko', onProgress: () => {},
      }),
    })
    const state = await boot(prod(s.root, s.assets))
    expect(state.kind).toBe('install')
    if (state.kind !== 'install') return
    expect(state.reason).toBe('partial')
    expect(assets().kind).toBe('absent')
  })

  it('기록이 깨졌으면 invalid다 — none과 구별한다', async () => {
    const root = memoryPackStore()
    await root.write(INSTALL_FILE, enc.encode('{ 반쯤 쓰다 만'))
    const state = await boot(prod(root))
    expect(state.kind).toBe('install')
    if (state.kind !== 'install') return
    expect(state.reason).toBe('invalid')
  })

  it('OPFS가 없으면 unsupported다', async () => {
    const state = await boot({ dev: false, opfs: false })
    expect(state).toEqual({ kind: 'install', reason: 'unsupported' })
    expect(assets().kind).toBe('absent')
  })
})

describe('설치 직후', () => {
  it('⚠️ 다시 켜지 않고 그 자리에서 OPFS로 넘어간다', async () => {
    // 미설치 상태로 시작
    const root = memoryPackStore()
    await boot(prod(root))
    expect(assets().kind).toBe('absent')

    // 설치가 끝났다
    const s = await installed('ko')
    const { installReady } = await import('../import/install/installer')
    const manifest = (await installReady(s.root))!
    activateInstall(manifest, s.assets)

    // reload 없이 바로 읽힌다
    expect(assets().kind).toContain('opfs')
    expect(await assets().text(`data/${REQUIRED_GROUPS[0]!}.json`)).toContain('"g"')
    expect(fetched).toEqual([])
  })
})

describe('언어 목록', () => {
  afterEach(() => {
    // 다른 시험이 세 언어를 본다. 원래대로 돌려놓는다
    activateInstall({
      contractVersion: CONTRACT_VERSION, state: 'ready', platinumLocale: 'dev', assetFormat: 1,
      availableLocales: [...LANGUAGES], startedAt: 'x', groups: {},
    }, memoryPackStore())
    setAssetProvider(null)
  })

  it('모르는 코드는 버리고, 하나도 못 알아들으면 그대로 둔다', () => {
    activateInstall({
      contractVersion: CONTRACT_VERSION, state: 'ready', platinumLocale: 'xx', assetFormat: 1,
      availableLocales: ['xx', 'yy'], startedAt: 'x', groups: {},
    }, memoryPackStore())
    // 언어를 0개로 만들면 화면이 아무것도 못 고른다
    expect(availableLanguages()).toEqual(LANGUAGES)
  })
})
