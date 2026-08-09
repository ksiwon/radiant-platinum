// Provider 계약 (IMPORT.md §7 · §14 "두 Provider가 같은 계약 시험을 통과한다")
//
// ⚠️ **같은 시험을 둘에 돌리는 것이 요점이다.** 각자 따로 시험하면 두 구현이
// 서로 다른 뜻으로 자란다 — 개발판에서만 도는 길이 생기고, 그 차이는 공개
// 설치를 끝낸 뒤에야 드러난다.
//
// 노드에는 OPFS도 `fetch`할 서버도 없으므로, 바이트가 나오는 자리를 각자
// 세워 준다: HTTP는 `fetch`를 가로채고, OPFS는 메모리 저장소를 쓴다. **재는
// 것은 저장 매체가 아니라 계약**이다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AssetMissing, readJson, assets, setAssetProvider } from './assetProvider'
import { httpAssetProvider, httpUrlFor } from './httpAssetProvider'
import { opfsAssetProvider } from './opfsAssetProvider'
import { memoryPackStore } from './packStore'
import { dataUrl, modelUrl } from '../assetBase'

const FILES: Record<string, string> = {
  'data/species.json': '{"species":[{"id":387}]}',
  // 바이너리 경로용. 코드 1·2·3은 UTF-8에서도 바이트 1·2·3이라 그대로 잰다 —
  // 소스에 제어문자를 직접 박으면 편집기와 lint를 지나며 조용히 사라진다
  'data/chunks/0.bin': String.fromCharCode(1, 2, 3),
  'models/dawn.glb': 'glTF-ish',
}

const bytesOf = (text: string) => new TextEncoder().encode(text)

/** `fetch`를 가로채 위 표를 준다. 개발판이 실제로 하는 일과 같은 모양이다 */
function stubFetch(): void {
  vi.stubGlobal('fetch', (input: string) => {
    const url = String(input)
    const hit = Object.entries(FILES).find(([path]) => url === httpUrlFor(path))
    if (!hit) return Promise.resolve(new Response(null, { status: 404 }))
    return Promise.resolve(new Response(bytesOf(hit[1]), { status: 200 }))
  })
}

/**
 * Blob URL도 노드에는 없다. 만든 것과 거둔 것을 세면 누수가 그대로 드러난다.
 *
 * ⚠️ `URL`을 통째로 갈아 끼우면 안 된다 — `new URL(...)`이 같이 죽어서 `fetch`
 * 흉내가 무너진다. **정적 메서드 둘만** 바꾸고 되돌린다
 */
const realCreate = URL.createObjectURL
const realRevoke = URL.revokeObjectURL

function stubObjectUrl(): { live: () => number; made: () => number } {
  const alive = new Set<string>()
  let made = 0
  URL.createObjectURL = () => {
    const url = `blob:test/${String(made++)}`
    alive.add(url)
    return url
  }
  URL.revokeObjectURL = (url: string) => { alive.delete(url) }
  return { live: () => alive.size, made: () => made }
}

interface Case {
  name: string
  make: () => import('./assetProvider').AssetProvider
}

const CASES: Case[] = [
  { name: 'DevAssetProvider (HTTP)', make: () => httpAssetProvider() },
  {
    name: 'OpfsAssetProvider (메모리 저장소)',
    make: () => opfsAssetProvider(memoryPackStore(
      Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, bytesOf(v)])))),
  },
]

beforeEach(() => { stubFetch(); stubObjectUrl() })
afterEach(() => {
  vi.unstubAllGlobals()
  URL.createObjectURL = realCreate
  URL.revokeObjectURL = realRevoke
  setAssetProvider(null)
})

describe.each(CASES)('$name', ({ make }) => {
  it('있는 것과 없는 것을 가른다', async () => {
    const p = make()
    expect(await p.exists('data/species.json')).toBe(true)
    expect(await p.exists('data/이런건없다.json')).toBe(false)
  })

  it('글을 그대로 준다', async () => {
    expect(await make().text('data/species.json')).toBe(FILES['data/species.json'])
  })

  it('JSON은 주소를 거치지 않는다', async () => {
    const got = await readJson(make(), 'data/species.json') as { species: { id: number }[] }
    expect(got.species[0]!.id).toBe(387)
  })

  it('바이트를 그대로 준다', async () => {
    const buf = await make().bytes('data/chunks/0.bin')
    expect([...new Uint8Array(buf)]).toEqual([1, 2, 3])
  })

  it('없는 것을 물으면 던진다 — 조용한 undefined가 제일 나쁘다', async () => {
    // 빈 값을 돌려주면 스키마 오류로 나오고, 그 오류는 "왜 없는지"를 말하지 않는다
    await expect(make().text('data/없다.json')).rejects.toThrow()
  })

  it('주소가 필요한 소비자에게는 주소를 준다', async () => {
    const p = make()
    const url = await p.objectUrl('models/dawn.glb')
    expect(typeof url).toBe('string')
    expect(url.length).toBeGreaterThan(0)
    // 돌려준 뒤 다시 물어도 쓸 수 있어야 한다 — 화면이 열리고 닫히기를 반복한다
    p.releaseObjectUrl('models/dawn.glb')
    expect((await p.objectUrl('models/dawn.glb')).length).toBeGreaterThan(0)
  })

  it('논리 경로는 두 나무뿐이다', async () => {
    await expect(make().text('secrets/prod.keys')).rejects.toThrow()
  })
})

describe('DevAssetProvider — 주소를 새로 짓지 않는다', () => {
  it('기존 dataUrl·modelUrl과 같은 자리를 가리킨다', () => {
    // ⚠️ 여기가 어긋나면 개발판이 통째로 404가 된다. 전환의 첫 조건은
    // **기존 동작 보존**이다 (IMPORT.md §13-3)
    expect(httpUrlFor('data/species.json')).toBe(dataUrl('species.json'))
    expect(httpUrlFor('models/pokemon/387.glb')).toBe(modelUrl('pokemon/387.glb'))
  })

  it('objectUrl은 이미 있는 주소를 그대로 준다 — Blob으로 두 벌 만들지 않는다', async () => {
    const urls = stubObjectUrl()
    expect(await httpAssetProvider().objectUrl('models/dawn.glb')).toBe(modelUrl('dawn.glb'))
    expect(urls.made()).toBe(0)
  })
})

describe('OpfsAssetProvider — Blob URL 수명', () => {
  const make = () => opfsAssetProvider(memoryPackStore(
    Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, bytesOf(v)]))))

  it('같은 경로를 두 번 물으면 한 벌만 만든다', async () => {
    const urls = stubObjectUrl()
    const p = make()
    const a = await p.objectUrl('models/dawn.glb')
    const b = await p.objectUrl('models/dawn.glb')
    expect(a).toBe(b)
    expect(urls.made()).toBe(1)
    expect(p.stats().refs['models/dawn.glb']).toBe(2)
  })

  it('⚠️ 마지막 하나가 놓을 때만 거둔다', async () => {
    // 같은 그림을 두 화면이 함께 쓰는 일이 흔하다(포켓몬 아이콘). 한쪽이 닫혔다고
    // 거두면 남은 쪽이 깨진 그림이 된다
    const urls = stubObjectUrl()
    const p = make()
    await p.objectUrl('models/dawn.glb')
    await p.objectUrl('models/dawn.glb')

    p.releaseObjectUrl('models/dawn.glb')
    expect(urls.live()).toBe(1)

    p.releaseObjectUrl('models/dawn.glb')
    expect(urls.live()).toBe(0)
    expect(p.stats().liveUrls).toBe(0)
  })

  it('⚠️ 맵을 백 번 오가도 안 쌓인다', async () => {
    const urls = stubObjectUrl()
    const p = make()
    for (let i = 0; i < 100; i++) {
      await p.objectUrl('models/dawn.glb')
      p.releaseObjectUrl('models/dawn.glb')
    }
    expect(urls.live()).toBe(0)
    expect(urls.made()).toBe(100)
  })

  it('동시에 물어도 한 벌이다', async () => {
    // `await` 사이에 다른 호출이 끼어드는 자리. 청크 스무 개를 한 프레임에
    // 받을 때 실제로 겹친다
    const urls = stubObjectUrl()
    const p = make()
    const got = await Promise.all(Array.from({ length: 8 }, () => p.objectUrl('models/dawn.glb')))
    expect(new Set(got).size).toBe(1)
    expect(urls.live()).toBe(1)
    p.releaseObjectUrl('models/dawn.glb')
    // 여덟 번 잡았으니 여덟 번 놓아야 사라진다
    expect(urls.live()).toBe(1)
  })

  it('없는 것을 놓아도 아무 일이 없다', () => {
    stubObjectUrl()
    expect(() => { make().releaseObjectUrl('models/없다.glb') }).not.toThrow()
  })

  it('releaseAll은 남은 참조를 무시하고 거둔다', async () => {
    const urls = stubObjectUrl()
    const p = make()
    await p.objectUrl('models/dawn.glb')
    await p.objectUrl('data/chunks/0.bin')
    p.releaseAll()
    expect(urls.live()).toBe(0)
  })

  it('GLB에 model/gltf-binary를 붙인다 — 빈 타입이면 로더가 텍스트로 읽는다', async () => {
    expect((await make().blob('models/dawn.glb')).type).toBe('model/gltf-binary')
    expect((await make().blob('data/species.json')).type).toBe('application/json')
  })

  it('없는 것은 AssetMissing이다 — 무엇이 없는지가 오류에 들어간다', async () => {
    await expect(make().bytes('data/없다.json')).rejects.toBeInstanceOf(AssetMissing)
    await expect(make().bytes('data/없다.json')).rejects.toThrow('data/없다.json')
  })
})

describe('갈아 끼우기', () => {
  it('기본값은 개발 HTTP다 — 아무것도 안 세워도 게임이 뜬다', () => {
    expect(assets().kind).toBe('dev-http')
  })

  it('갈아 끼우면 그쪽으로 간다', () => {
    setAssetProvider(opfsAssetProvider(memoryPackStore()))
    expect(assets().kind).toBe('opfs:memory')
    setAssetProvider(null)
    expect(assets().kind).toBe('dev-http')
  })
})
