// Provider를 갈아 끼울 때 무엇이 새는가 (IMPORT.md §7 · §14 완료 조건)
//
// ⚠️ **Blob URL은 문서가 닫힐 때까지 안 사라진다.** 그래서 "누가 만들었는지"와
// "누가 놓는지"가 어긋나면 그 바이트는 영영 남는다. 여기서 잡는 것 넷:
//
//   ① 놓을 때 **받은 곳**에 돌려주는가 — `assets()`를 다시 부르면 새 Provider에게
//      옛 주소를 놓아 달라고 하게 되고, 새 쪽은 조용히 아무것도 안 한다
//   ② `releaseAll()`과 경쟁하는 `objectUrl()`이 URL을 되살리지 않는가
//   ③ 갈아 끼우면 provider에 묶인 캐시가 전부 비워지는가
//   ④ 여러 번 갈아 끼워도 살아 있는 URL이 기준선으로 돌아오는가
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { assets, setAssetProvider, type AssetProvider } from './assetProvider'
import { absentAssetProvider } from './absentAssetProvider'
import { opfsAssetProvider, ProviderClosed } from './opfsAssetProvider'
import { memoryPackStore } from './packStore'
import { atlasUrl, pinAtlas, pinnedCount, unpinAll } from './atlas'

const enc = new TextEncoder()
const FILES = { 'data/a.png': 'AAA', 'data/b.png': 'BBB' }

function store() {
  return memoryPackStore(
    Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, enc.encode(v)])))
}

const realCreate = URL.createObjectURL
const realRevoke = URL.revokeObjectURL
let alive: Set<string>
let made: number

beforeEach(() => {
  alive = new Set()
  made = 0
  URL.createObjectURL = () => { const u = `blob:swap/${String(made++)}`; alive.add(u); return u }
  URL.revokeObjectURL = (u: string) => { alive.delete(u) }
})

afterEach(() => {
  unpinAll()
  setAssetProvider(null)
  URL.createObjectURL = realCreate
  URL.revokeObjectURL = realRevoke
})

describe('받은 곳에 돌려준다', () => {
  it('⚠️ 갈아 끼운 뒤 unpin해도 옛 Provider의 주소가 거둬진다', async () => {
    // 한때 `unpinAll()`이 `assets()`를 다시 불러 **새** Provider에게 놓아 달라고
    // 했다. 새 쪽은 그 경로를 모르니 아무 일도 안 일어나고, 옛 Blob은 남았다
    const old = opfsAssetProvider(store())
    setAssetProvider(old)
    await pinAtlas('data/a.png')
    expect(alive.size).toBe(1)

    // 갈아 끼운다. `setAssetProvider`가 훅으로 `unpinAll`을 부른다
    setAssetProvider(opfsAssetProvider(store()))
    expect(alive.size).toBe(0)
    expect(pinnedCount()).toBe(0)
    expect(atlasUrl('data/a.png')).toBe('')
  })

  it('갈아 끼운 뒤 다시 잡으면 새 Provider에서 온다', async () => {
    setAssetProvider(opfsAssetProvider(store()))
    const first = await pinAtlas('data/a.png')
    setAssetProvider(opfsAssetProvider(store()))
    const second = await pinAtlas('data/a.png')
    expect(second).not.toBe(first)
    expect(alive.size).toBe(1)
  })
})

describe('releaseAll과의 경쟁', () => {
  it('⚠️ 받는 사이에 거둬지면 URL이 되살아나지 않는다', async () => {
    // `objectUrl()`이 바이트를 기다리는 동안 `releaseAll()`이 돌면, 깨어난 쪽이
    // 거둬진 다음에 새 URL을 `held`에 넣는다 — 아무도 안 놓는 것이 하나 생긴다
    let unblock = (): void => {}
    const slow = memoryPackStore()
    const provider = opfsAssetProvider({
      kind: 'slow',
      has: () => Promise.resolve(true),
      read: async () => {
        await new Promise<void>((r) => { unblock = r })
        return enc.encode('AAA')
      },
    })
    void slow

    const pending = provider.objectUrl('data/a.png')
    provider.releaseAll()
    unblock()

    await expect(pending).rejects.toBeInstanceOf(ProviderClosed)
    // 되살아난 것이 없다
    expect(alive.size).toBe(0)
    expect(provider.stats().liveUrls).toBe(0)
  })

  it('거둔 뒤 새로 물으면 정상으로 돈다', async () => {
    const provider = opfsAssetProvider(store())
    await provider.objectUrl('data/a.png')
    provider.releaseAll()
    const again = await provider.objectUrl('data/a.png')
    expect(alive.has(again)).toBe(true)
    expect(provider.stats().liveUrls).toBe(1)
  })
})

describe('참조 수', () => {
  it('같은 경로를 동시에 잡으면 URL이 한 벌이다', async () => {
    const provider = opfsAssetProvider(store())
    const [a, b] = await Promise.all([
      provider.objectUrl('data/a.png'), provider.objectUrl('data/a.png'),
    ])
    expect(a).toBe(b)
    expect(provider.stats().liveUrls).toBe(1)
    // 둘 다 놓아야 사라진다
    provider.releaseObjectUrl('data/a.png')
    expect(alive.size).toBe(1)
    provider.releaseObjectUrl('data/a.png')
    expect(alive.size).toBe(0)
  })

  it('작업이 끝나면 기준선으로 돌아온다', async () => {
    const provider = opfsAssetProvider(store())
    for (let round = 0; round < 20; round++) {
      const url = await provider.objectUrl('data/a.png')
      expect(alive.has(url)).toBe(true)
      provider.releaseObjectUrl('data/a.png')
    }
    expect(alive.size).toBe(0)
    expect(provider.stats().liveUrls).toBe(0)
  })

  it('⚠️ 반복해서 갈아 끼워도 안 쌓인다', async () => {
    for (let round = 0; round < 10; round++) {
      setAssetProvider(opfsAssetProvider(store()))
      await pinAtlas('data/a.png')
      await pinAtlas('data/b.png')
    }
    // 마지막 Provider의 두 장만 살아 있다
    expect(alive.size).toBe(2)
    setAssetProvider(null)
    expect(alive.size).toBe(0)
  })
})

describe('없는 Provider', () => {
  it('⚠️ 아무것도 안 부른다 — HTTP로 안 되돌아간다', async () => {
    // 공개판에 설치본이 없을 때 여기가 꽂힌다. 되돌아가면 `/data/…`로 404가
    // 무더기로 나가고, 그 목록이 곧 우리가 무엇을 굽는지 적은 목록이다
    const provider = absentAssetProvider()
    expect(provider.kind).toBe('absent')
    expect(await provider.exists('data/a.png')).toBe(false)
    await expect(provider.text('data/a.png')).rejects.toThrow(/없다/)
    await expect(provider.bytes('data/a.png')).rejects.toThrow()
    await expect(provider.objectUrl('data/a.png')).rejects.toThrow()
    // 놓는 것은 조용히 지나간다 — 잡은 것이 없으니 오류가 아니다
    expect(() => { provider.releaseObjectUrl('data/a.png') }).not.toThrow()
  })

  it('꽂으면 assets()가 그것을 준다', () => {
    const absent = absentAssetProvider()
    setAssetProvider(absent)
    expect(assets()).toBe(absent as AssetProvider)
  })
})
