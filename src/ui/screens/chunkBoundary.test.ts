// 지연 청크를 못 받았을 때 (PLAN §4.6)
//
// 두 쪽을 같이 잰다 — 화면의 경계(`ChunkBoundary`)와 그 앞에서 옛 청크를 내주는
// 서비스 워커(`public/sw.js`). 배포 뒤 첫 배틀이 빈 화면이 되던 일은 두 쪽이
// 같이 비어 있어서 났다: 워커는 캐시에 든 옛 청크를 한 번도 안 내줬고, 화면은
// 못 받은 것을 받을 경계가 없었다.
//
// ⚠️ **워커는 브라우저 밖에서 돈다.** vitest에는 `caches`도 `clients`도 없으므로
// 워커 소스를 `node:vm`에 그대로 싣고, Cache Storage를 **명세대로 만든 차례를
// 지키는** 가짜로 댄다 — 「앞 판」을 그 차례로 가르기 때문이다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../../state/sessionStore'
import {
  ChunkBoundary, ChunkTrouble, chunkTroubleSaid, isChunkLoadError,
} from './ChunkBoundary'

// 테마는 이름 하나만 있으면 된다. 진짜 모듈은 글꼴 선언(`globalFontFace`)을 끌고
// 오는데 시험용 대역(`tools/test/vanillaExtractStub.ts`)에 그 함수가 없다
vi.mock('../theme/day.css', () => ({ dayTheme: 'dayTheme' }))

describe('청크 실패를 알아본다', () => {
  // 브라우저가 실제로 내는 문장 그대로다. 줄여 맞추면 다른 오류까지 먹는다
  it.each([
    ['Chromium', new TypeError('Failed to fetch dynamically imported module: https://radiant.siwon.it.kr/assets/BattleScreen-Ab12.js')],
    ['WebKit', new TypeError('Importing a module script failed.')],
    ['Gecko', new TypeError('error loading dynamically imported module: https://radiant.siwon.it.kr/assets/IntroScreen-Cd34.js')],
    ['CSS 미리받기', new Error('Unable to preload CSS for /assets/BattleScreen-Ef56.css')],
    ['MIME', new TypeError("Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of \"text/html\".")],
  ])('%s', (_who, error) => {
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('다른 오류는 청크 실패가 아니다', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'hp')"))).toBe(false)
    expect(isChunkLoadError(new Error('Rotom has no formats-data entry'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError({ message: 'Failed to fetch dynamically imported module' })).toBe(false)
  })
})

describe('창에 적는 말', () => {
  it('연결이 있으면 새 버전을, 없으면 연결을 말한다', () => {
    expect(chunkTroubleSaid(true, true, false).title).toBe('새 버전이 올라와 이 화면을 받지 못했습니다')
    expect(chunkTroubleSaid(true, false, false).title).toBe('인터넷 연결을 확인해 주세요')
  })

  it('필드에서만 잃는 것을 적는다', () => {
    const lost = '마지막 리포트 뒤의 진행은 사라집니다'
    for (const online of [true, false]) {
      expect(chunkTroubleSaid(true, online, true).body.join(' ')).toContain(lost)
      expect(chunkTroubleSaid(true, online, false).body.join(' ')).not.toContain(lost)
    }
    // 맨 바깥 경계가 받은 다른 오류도 같다
    expect(chunkTroubleSaid(false, true, true).body.join(' ')).toContain(lost)
  })

  it('청크 실패가 아닌 것을 새 버전 탓으로 적지 않는다', () => {
    expect(chunkTroubleSaid(false, true, false).title).not.toContain('새 버전')
    expect(chunkTroubleSaid(false, false, false).title).not.toContain('인터넷')
  })
})

describe('경계', () => {
  const chunk = new TypeError('Failed to fetch dynamically imported module: /assets/BattleScreen-Ab12.js')
  const bug = new TypeError("Cannot read properties of undefined (reading 'hp')")

  const crashed = (error: unknown, outermost = false): ChunkBoundary => {
    const b = new ChunkBoundary({ children: null, where: '배틀 화면', outermost })
    b.state = ChunkBoundary.getDerivedStateFromError(error)
    return b
  }

  it('청크 실패는 받아서 창을 그린다', () => {
    const out = crashed(chunk).render()
    expect(out).toMatchObject({ type: ChunkTrouble, props: { error: chunk, where: '배틀 화면' } })
  })

  it('⚠️ 다른 오류는 위로 넘긴다 — 배틀의 버그를 새 버전 탓으로 덮지 않는다', () => {
    expect(() => crashed(bug).render()).toThrow(bug)
  })

  it('맨 바깥 경계는 넘길 곳이 없으므로 무엇이든 받는다', () => {
    expect(crashed(bug, true).render()).toMatchObject({ type: ChunkTrouble })
  })
})

describe('창', () => {
  let reload: ReturnType<typeof vi.fn>

  beforeEach(() => {
    reload = vi.fn()
    vi.stubGlobal('location', { reload })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    useSessionStore.getState().setPhase('title')
  })

  const draw = (error: unknown): string =>
    renderToStaticMarkup(createElement(ChunkTrouble, { error, where: '배틀 화면' }))

  it('⚠️ 그리기만으로는 다시 불러오지 않는다 (PLAN §4.6)', () => {
    useSessionStore.getState().setPhase('overworld')
    const html = draw(new TypeError('Importing a module script failed.'))
    expect(reload).not.toHaveBeenCalled()
    expect(html).toContain('다시 불러오기')
    expect(html).toContain('마지막 리포트 뒤의 진행은 사라집니다')
  })

  it('브라우저가 준 말과 자리를 그대로 적는다', () => {
    const html = draw(new TypeError('Importing a module script failed.'))
    expect(html).toContain('받지 못한 자리: 배틀 화면')
    expect(html).toContain('브라우저가 준 말: Importing a module script failed.')
    // 타이틀에서는 잃을 진행이 없다
    expect(html).not.toContain('사라집니다')
  })

  it('브라우저가 연결이 없다고 하면 연결을 말한다', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(draw(new TypeError('Importing a module script failed.'))).toContain('인터넷 연결을 확인해 주세요')
  })
})

// ── 서비스 워커 ────────────────────────────────────────────────────────────────

const ORIGIN = 'https://radiant.test'
const SW_SOURCE = readFileSync(resolve(__dirname, '../../../public/sw.js'), 'utf8')
/** 빌드가 판 이름을 박는 줄 (`vite.config.ts`의 `stampWorker`와 같은 꼴) */
const VERSION_LINE = /^const VERSION = '[^']*'$/m

type Keyed = string | { url: string }
const keyOf = (req: Keyed): string => new URL(typeof req === 'string' ? req : req.url, `${ORIGIN}/sw.js`).href

class FakeCache {
  readonly entries = new Map<string, Response>()
  put(req: Keyed, res: Response): Promise<void> {
    this.entries.set(keyOf(req), res)
    return Promise.resolve()
  }
  match(req: Keyed): Promise<Response | undefined> {
    return Promise.resolve(this.entries.get(keyOf(req))?.clone())
  }
  addAll(): Promise<void> {
    return Promise.resolve()
  }
}

/** 명세의 이름 표처럼 **만든 차례**를 지킨다 — `Map`이 그렇다 */
class FakeStorage {
  readonly byName = new Map<string, FakeCache>()
  open(name: string): Promise<FakeCache> {
    let c = this.byName.get(name)
    if (!c) { c = new FakeCache(); this.byName.set(name, c) }
    return Promise.resolve(c)
  }
  keys(): Promise<string[]> {
    return Promise.resolve([...this.byName.keys()])
  }
  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.byName.delete(name))
  }
  async match(req: Keyed): Promise<Response | undefined> {
    for (const c of this.byName.values()) {
      const hit = await c.match(req)
      if (hit) return hit
    }
    return undefined
  }
}

type Listener = (e: unknown) => void

interface Worker {
  storage: FakeStorage
  net: ReturnType<typeof vi.fn>
  /** 요청 하나를 워커에 태운다. 워커가 손을 안 대면 null */
  request: (path: string, mode?: string) => Promise<Response | null>
  activate: () => Promise<void>
}

/** 판 이름 `version`으로 박힌 워커를 하나 띄운다 */
function bootWorker(version: string, storage = new FakeStorage()): Worker {
  const listeners = new Map<string, Listener>()
  const net = vi.fn<(req: unknown) => Promise<Response>>()
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => { listeners.set(type, fn) },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  }
  runInNewContext(SW_SOURCE.replace(VERSION_LINE, `const VERSION = '${version}'`), {
    self, caches: storage, fetch: net, Response, URL, Set, Promise,
  })
  const settle = async (): Promise<void> => {
    // 워커는 캐시에 넣는 일을 기다리지 않고(`void caches.open…`) 응답부터 준다
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }
  return {
    storage,
    net,
    request: async (path, mode = 'cors') => {
      let answer: Promise<Response> | null = null
      listeners.get('fetch')!({
        request: { url: `${ORIGIN}${path}`, method: 'GET', mode },
        respondWith: (p: Promise<Response>) => { answer = p },
      })
      const res = answer === null ? null : await (answer as Promise<Response>)
      await settle()
      return res
    },
    activate: async () => {
      let work: Promise<unknown> = Promise.resolve()
      listeners.get('activate')!({ waitUntil: (p: Promise<unknown>) => { work = p } })
      await work
    },
  }
}

const js = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/javascript' } })
const html = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })

describe('서비스 워커가 청크를 내준다', () => {
  it('판 이름을 박는 줄이 하나 있다 — 빌드가 그 줄을 찾는다', () => {
    expect(SW_SOURCE.match(new RegExp(VERSION_LINE.source, 'gm'))).toHaveLength(1)
  })

  it('⚠️ 배포로 사라진 옛 청크를 앞 판 캐시에서 내준다 — 호스트는 HTML을 200으로 준다', async () => {
    const storage = new FakeStorage()
    await (await storage.open('shell-a1')).put('/assets/BattleScreen-old.js', js('old battle'))
    const sw = bootWorker('b2', storage)
    sw.net.mockResolvedValue(html('<!doctype html>'))
    const res = await sw.request('/assets/BattleScreen-old.js')
    expect(await res!.text()).toBe('old battle')
    // 캐시가 먼저다 — 호스트에 묻지도 않는다
    expect(sw.net).not.toHaveBeenCalled()
  })

  it('⚠️ 청크 자리에 온 HTML은 캐시에 안 담는다 — 담으면 그 이름이 영영 HTML이다', async () => {
    const sw = bootWorker('b2')
    sw.net.mockResolvedValue(html('<!doctype html>'))
    const res = await sw.request('/assets/BattleScreen-gone.js')
    // 그대로 넘겨서 `import()`가 실패하게 둔다 — 화면의 경계가 받는다
    expect(res!.headers.get('content-type')).toContain('text/html')
    expect(await sw.storage.match('/assets/BattleScreen-gone.js')).toBeUndefined()
  })

  it('404도 안 담는다', async () => {
    const sw = bootWorker('b2')
    sw.net.mockResolvedValue(js('', 404))
    expect((await sw.request('/assets/Gone-x.css'))!.status).toBe(404)
    expect(await sw.storage.match('/assets/Gone-x.css')).toBeUndefined()
  })

  it('제대로 받은 청크는 지금 판 캐시에 담는다', async () => {
    const sw = bootWorker('b2')
    sw.net.mockResolvedValue(js('new battle'))
    await sw.request('/assets/BattleScreen-new.js')
    const cached = await sw.storage.byName.get('shell-b2')!.match('/assets/BattleScreen-new.js')
    expect(await cached!.text()).toBe('new battle')
  })

  it('연결이 없고 캐시에도 없으면 실패를 그대로 준다', async () => {
    const sw = bootWorker('b2')
    sw.net.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await sw.request('/assets/Never-x.js'))!.type).toBe('error')
  })

  it('이름이 안 변하는 셸 그림은 여전히 네트워크가 먼저다', async () => {
    const storage = new FakeStorage()
    await (await storage.open('shell-b2')).put(
      '/assets/radiant-platinum-favicon.png',
      new Response('old png', { headers: { 'content-type': 'image/png' } }))
    const sw = bootWorker('b2', storage)
    sw.net.mockResolvedValue(new Response('new png', { headers: { 'content-type': 'image/png' } }))
    expect(await (await sw.request('/assets/radiant-platinum-favicon.png'))!.text()).toBe('new png')
  })
})

describe('서비스 워커의 화면 이동', () => {
  it('⚠️ 오프라인이면 지금 판의 껍데기를 준다 — 앞 판 것이 먼저 만들어졌어도', async () => {
    const storage = new FakeStorage()
    await (await storage.open('shell-a1')).put('./index.html', html('old shell'))
    await (await storage.open('shell-b2')).put('./index.html', html('new shell'))
    const sw = bootWorker('b2', storage)
    sw.net.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await (await sw.request('/play', 'navigate'))!.text()).toBe('new shell')
  })

  it('오류 쪽지는 껍데기로 안 담는다', async () => {
    const storage = new FakeStorage()
    await (await storage.open('shell-b2')).put('./index.html', html('good shell'))
    const sw = bootWorker('b2', storage)
    sw.net.mockResolvedValue(html('bad gateway', 502))
    await sw.request('/', 'navigate')
    expect(await (await storage.match('./index.html'))!.text()).toBe('good shell')
  })
})

describe('서비스 워커의 활성화', () => {
  it('지금 판과 바로 앞 판만 남긴다', async () => {
    const storage = new FakeStorage()
    for (const name of ['assets-v1', 'shell-a0', 'shell-a1']) await storage.open(name)
    const sw = bootWorker('b2', storage)
    await storage.open('shell-b2') // 설치가 만든다
    await sw.activate()
    expect([...storage.byName.keys()]).toEqual(['shell-a1', 'shell-b2'])
  })

  it('앞 판이 없으면 지금 판만 남는다', async () => {
    const storage = new FakeStorage()
    await storage.open('assets-v1')
    const sw = bootWorker('b2', storage)
    await storage.open('shell-b2')
    await sw.activate()
    expect([...storage.byName.keys()]).toEqual(['shell-b2'])
  })
})
