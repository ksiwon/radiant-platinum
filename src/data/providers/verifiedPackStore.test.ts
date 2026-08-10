// 읽을 때 한 번 확인한다 (IMPORT.md §15)
//
// 재는 것: **부팅이 전부를 안 해싱하는가**, **읽은 것은 반드시 보는가**,
// **같은 파일을 두 번 안 세는가**, **깨진 것이 게임까지 안 가는가**.
import { describe, it, expect } from 'vitest'
import { memoryPackStore, type WritablePackStore } from './packStore'
import { AssetCorrupt, verifiedPackStore } from './verifiedPackStore'
import { recordOf } from '../../import/install/integrity'
import { CONTRACT_VERSION, type InstallManifest } from '../../import/install/manifestSchema'

const enc = new TextEncoder()

async function build(): Promise<{ store: WritablePackStore, manifest: InstallManifest }> {
  const store = memoryPackStore()
  const files: Record<string, [string, Uint8Array][]> = {
    moves: [['data/moves.json', enc.encode('{"moves":[]}')]],
    maps: [['data/maps.json', enc.encode('{"maps":[]}')], ['data/matrices/0.bin', enc.encode('0000')]],
  }
  const groups: InstallManifest['groups'] = {}
  for (const [group, entries] of Object.entries(files)) {
    const records = []
    let bytes = 0
    for (const [path, data] of entries) {
      await store.write(path, data)
      records.push(await recordOf(path, data))
      bytes += data.byteLength
    }
    groups[group] = { files: records, bytes, converter: 1, format: 1 }
  }
  return {
    store,
    manifest: {
      contractVersion: CONTRACT_VERSION, state: 'ready', platinumLocale: 'ko', assetFormat: 1,
      availableLocales: ['ko'], startedAt: 'x', groups,
    },
  }
}

describe('처음 읽을 때 한 번', () => {
  it('감싸기만 해서는 아무것도 안 센다 — 부팅이 630MB를 안 해싱한다', async () => {
    const { store, manifest } = await build()
    const checked = verifiedPackStore(store, manifest)
    expect(checked.checked()).toBe(0)
  })

  it('읽은 파일만 센다', async () => {
    const { store, manifest } = await build()
    const checked = verifiedPackStore(store, manifest)
    await checked.read('data/moves.json')
    expect(checked.checked()).toBe(1)
    await checked.read('data/maps.json')
    expect(checked.checked()).toBe(2)
    // 안 읽은 것은 그대로 0
    expect(checked.corruptGroups()).toEqual([])
  })

  it('같은 파일을 두 번 읽어도 한 번만 센다', async () => {
    const { store, manifest } = await build()
    let reads = 0
    const counted = { ...store, read: (p: string) => { reads++; return store.read(p) } }
    const checked = verifiedPackStore(counted, manifest)
    await Promise.all([checked.read('data/moves.json'), checked.read('data/moves.json')])
    await checked.read('data/moves.json')
    expect(checked.checked()).toBe(1)
    expect(reads).toBe(3)   // 바이트는 매번 주지만 해시는 한 번이다
  })

  it('기록에 없는 경로는 그냥 통과시킨다', async () => {
    const { store, manifest } = await build()
    await store.write('data/나중에.json', enc.encode('{}'))
    const checked = verifiedPackStore(store, manifest)
    expect(await checked.read('data/나중에.json')).not.toBeNull()
    expect(checked.checked()).toBe(0)
  })
})

describe('깨진 것은 게임까지 안 간다', () => {
  it('길이가 다르면 던진다', async () => {
    const { store, manifest } = await build()
    const checked = verifiedPackStore(store, manifest)
    await store.write('data/moves.json', enc.encode('{}'))
    await expect(checked.read('data/moves.json')).rejects.toBeInstanceOf(AssetCorrupt)
  })

  it('길이는 같은데 내용이 다르면 해시가 잡는다', async () => {
    const { store, manifest } = await build()
    const checked = verifiedPackStore(store, manifest)
    await store.write('data/moves.json', enc.encode('{"moves":[1]}'.slice(0, 12)))
    const fault = await checked.read('data/moves.json').catch((e: unknown) => e)
    expect(fault).toBeInstanceOf(AssetCorrupt)
    expect((fault as AssetCorrupt).why.why).toBe('hash')
  })

  it('⚠️ 깨진 그룹만 표시한다 — 나머지는 멀쩡하다', async () => {
    const { store, manifest } = await build()
    const checked = verifiedPackStore(store, manifest)
    await store.write('data/matrices/0.bin', enc.encode('9999'))
    await expect(checked.read('data/matrices/0.bin')).rejects.toBeInstanceOf(AssetCorrupt)
    expect(checked.corruptGroups()).toEqual(['maps'])
    // 다른 그룹은 그대로 읽힌다
    expect(await checked.read('data/moves.json')).not.toBeNull()
  })

  it('경로가 어느 그룹 것인지 안다 — 그것만 다시 만들 수 있다', async () => {
    const { store, manifest } = await build()
    const checked = verifiedPackStore(store, manifest)
    expect(checked.groupOf('data/matrices/0.bin')).toBe('maps')
    expect(checked.groupOf('data/없음.json')).toBeNull()
  })
})

describe('손으로 전부 확인하기', () => {
  it('설정 화면 버튼이 부르는 길 — 전부 세고 결과를 준다', async () => {
    const { store, manifest } = await build()
    const checked = verifiedPackStore(store, manifest)
    const seen: number[] = []
    const got = await checked.verifyAll((done) => seen.push(done))
    expect(got).toEqual({ ok: 3, broken: [] })
    expect(seen).toEqual([1, 2, 3])
    expect(checked.checked()).toBe(3)
  })

  it('깨진 것을 전부 모아 준다', async () => {
    const { store, manifest } = await build()
    const checked = verifiedPackStore(store, manifest)
    await store.write('data/moves.json', new Uint8Array(0))
    const got = await checked.verifyAll()
    expect(got.ok).toBe(2)
    expect(got.broken.map((b) => b.path)).toEqual(['data/moves.json'])
    expect(checked.corruptGroups()).toEqual(['moves'])
  })

  it('취소하면 그 자리에서 멈춘다 — idle 검사가 화면을 안 막는다', async () => {
    const { store, manifest } = await build()
    const checked = verifiedPackStore(store, manifest)
    const signal = { aborted: false }
    const got = await checked.verifyAll(() => { signal.aborted = true }, signal)
    expect(got.ok).toBe(1)
  })
})
