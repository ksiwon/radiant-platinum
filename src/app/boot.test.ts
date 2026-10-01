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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

  // ⚠️ **확인 지점은 개발 빌드에만 있다.** 그래서 설치본을 확인 지점으로 몰려면
  // 개발 서버 + OPFS 조합이 필요한데, 그 손잡이가 없어서 ㉕·㉖이 야생·트레이너·
  // 상점까지밖에 못 갔다 (REPAIR §2.3)
  it('`?assets=opfs`를 주면 개발판도 설치본을 읽는다', async () => {
    const s = await installed('en')
    const state = await boot({
      dev: true, opfs: true, preferOpfs: true, rootStore: s.root, assetStore: s.assets,
    })
    expect(state.kind).toBe('play')
    expect(state.kind === 'play' && state.source).toBe('opfs')
    expect(assets().kind).not.toBe('dev-http')
  })

  // ⚠️ **설치가 없으면 설치 화면이다** — 개발판이라고 HTTP로 안 되돌아간다.
  // 되돌아가면 "설치본으로 몰았다"가 조용히 거짓이 된다
  it('`?assets=opfs`인데 설치가 없으면 HTTP로 안 되돌아간다', async () => {
    const state = await boot({
      dev: true, opfs: true, preferOpfs: true, rootStore: memoryPackStore(),
    })
    expect(state.kind).toBe('install')
    expect(assets().kind).not.toBe('dev-http')
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

  it('⚠️ 다 깐 뒤에 필수가 늘었으면 outdated다 — 하다 만 것이 아니다', async () => {
    // `monVariants`가 선택 그룹이던 때 안 켜고 깐 설치본. 그 판에서는 도장까지 찍혔다
    const s = await installed()
    const got = JSON.parse(new TextDecoder().decode((await s.root.read(INSTALL_FILE))!)) as {
      groups: Record<string, unknown>
    }
    delete got.groups.monVariants
    await s.root.write(INSTALL_FILE, enc.encode(JSON.stringify(got)))

    const state = await boot(prod(s.root, s.assets))
    // 그룹은 id(`monVariants`)가 아니라 사람 이름으로 적는다
    expect(state).toEqual({
      kind: 'install', reason: 'outdated', detail: '새로 생긴 1가지만 더 만들면 됩니다: 이로치·암컷 모습',
    })
    expect(assets().kind).toBe('absent')
  })

  it('기록이 깨졌으면 invalid다 — none과 구별한다', async () => {
    const root = memoryPackStore()
    await root.write(INSTALL_FILE, enc.encode('{ 반쯤 쓰다 만'))
    const state = await boot(prod(root))
    expect(state.kind).toBe('install')
    if (state.kind !== 'install') return
    expect(state.reason).toBe('invalid')
    // 화면 문장은 사람 말이고, 검사기가 준 원문은 따로 든다
    expect(state.detail).toContain('다시 설치합니다')
    expect(state.raw).toContain('install.json')
  })

  // 원문은 갈래 표식 옆 속성에 남는다 — 표식 자체는 그대로 견줄 수 있어야 한다
  it('원문은 `data-boot-why`에, 갈래는 `data-boot`에 따로 적는다', async () => {
    const dataset: Record<string, string> = { bootWhy: '지난번 것' }
    vi.stubGlobal('document', { documentElement: { dataset } })
    try {
      const root = memoryPackStore()
      await root.write(INSTALL_FILE, enc.encode('{ 반쯤 쓰다 만'))
      await boot(prod(root))
      expect(dataset.boot).toBe('install:invalid')
      expect(dataset.bootWhy).toContain('install.json')
      // 원문이 없는 갈래로 다시 뜨면 지난 원문을 지운다
      await boot(prod(memoryPackStore()))
      expect(dataset.boot).toBe('install:none')
      expect('bootWhy' in dataset).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('⚠️ 하다 만 설치의 상태 이름(`installing`)을 화면 문장에 안 낸다', async () => {
    const s = await installed()
    const got = JSON.parse(new TextDecoder().decode((await s.root.read(INSTALL_FILE))!)) as {
      state: string; commit?: unknown
    }
    got.state = 'installing'
    delete got.commit
    await s.root.write(INSTALL_FILE, enc.encode(JSON.stringify(got)))
    const state = await boot(prod(s.root, s.assets))
    expect(state.kind === 'install' && state.reason).toBe('partial')
    if (state.kind !== 'install') return
    expect(state.detail).toBe('지난번 설치가 중간에 멈췄습니다.')
    expect(state.detail).not.toMatch(/[a-z]{4,}/)
    expect(state.raw).toBe('state: installing')
  })

  it('OPFS가 없으면 unsupported다', async () => {
    const state = await boot({ dev: false, opfs: false })
    expect(state).toEqual({ kind: 'install', reason: 'unsupported' })
    expect(assets().kind).toBe('absent')
  })

  // ⚠️ **함수가 있어도 거부될 수 있다** (사생활 보호 창). 그 거부가 부팅 밖으로
  // 새면 `boot()`이 끝나지 않고 「준비하는 중…」에서 영원히 선다
  it('⚠️ OPFS가 있는데 열기가 거부되면 unsupported다 — 던지지 않는다', async () => {
    const state = await boot({
      dev: false, opfs: true,
      probeOpfs: () => Promise.reject(new DOMException('denied', 'SecurityError')),
    })
    expect(state.kind === 'install' && state.reason).toBe('unsupported')
    if (state.kind !== 'install') return
    expect(state.detail).toContain('일반 창')
    expect(state.raw).toBe('SecurityError: denied')
    expect(assets().kind).toBe('absent')
    expect(fetched).toEqual([])
  })

  it('열어 보기가 되면 그대로 설치 기록을 읽는다', async () => {
    let probed = 0
    const state = await boot({
      ...prod(memoryPackStore()), probeOpfs: () => { probed++; return Promise.resolve() },
    })
    expect(probed).toBe(1)
    expect(state).toEqual({ kind: 'install', reason: 'none' })
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
