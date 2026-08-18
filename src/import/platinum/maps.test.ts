// 맵 그룹 ↔ 노드 산출물 parity (DATA.md §2.7 · §4.1)
//
// ⚠️ **여기서 재는 것 하나가 주소 상수를 없앤 것이다.** 노드 쪽은 `0xEA01C`를
// 박아 두고 일본어 롬은 "자리를 안 찾았다"로 비워 뒀다. 브라우저 쪽은 표를 표로
// 만드는 성질로 **찾는다** — 그 찾은 자리가 노드가 박아 둔 값과 같은지를 잰다.
// 같으면 상수를 없앤 것이 기능을 안 줄였다는 뜻이고, 다르면 둘 중 하나가 틀렸다.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { openNds, type NdsFileSystem } from './nds'
import {
  findHeaderTable, tableFits, parseObjects, parseMatrix, parseBdhc, parseHeader, toUsBank, patchTile,
  HEADER_SIZE, MAP_COUNT, CHUNK_TILES, IMPASSABLE,
} from './maps'
import { GROUPS } from './convert'
import { SUPPORTED } from './validate'
import { DATA, withRom, romPath, fileSource } from '../../data/romData.testkit'

const decoder = new TextDecoder()

/** 노드 쪽이 박아 둔 자리 (ROM 절대 오프셋). ja는 안 찾았다고 적혀 있다 */
const NODE_TABLE: Record<string, number | null> = {
  en: 0xea01c,
  ko: 0xeaaa4,
  // 노드 쪽은 "찾을 필요도 없다"며 비워 뒀다 (`dialogue.js`의 `ROMS.ja.headers`).
  // 성질로 찾으니 나온다 — 실측 0xE96F0
  ja: null,
}

describe('행렬·건물 한 줄', () => {
  it('행렬 머리를 읽는다 — 이름 길이가 가변이다', () => {
    // width 2 · height 3 · 헤더 없음 · 높이 없음 · 이름 "AB" · 맵 6칸
    const b = new Uint8Array(5 + 2 + 12)
    b.set([2, 3, 0, 0, 2, 0x41, 0x42])
    const m = parseMatrix(b)
    expect(m.name).toBe('AB')
    expect(m.maps).toHaveLength(6)
    expect(m.headers).toBeNull()
  })

  it('건물 좌표가 청크 중심 기준에서 원점 기준으로 옮겨진다', () => {
    // 중심 기준 (0,0,0)이면 청크 좌표로는 (16, 0, 16)이다
    const b = new Uint8Array(48)
    new DataView(b.buffer).setInt32(0, 7, true)
    const [o] = parseObjects(b)
    expect(o!.model).toBe(7)
    expect(o!.x).toBe(CHUNK_TILES / 2)
    expect(o!.z).toBe(CHUNK_TILES / 2)
  })

  it('BDHC 크기 합이 안 맞으면 세운다 — 조용히 넘어가면 지형이 어긋난다', () => {
    const b = new Uint8Array(24)
    b.set([0x42, 0x44, 0x48, 0x43]) // "BDHC"
    new DataView(b.buffer).setUint16(4, 99, true) // 점 99개인데 파일은 24B
    expect(() => parseBdhc(b, 0)).toThrow(/크기 불일치/)
  })

  it('BDHC 매직이 없으면 세운다', () => {
    expect(() => parseBdhc(new Uint8Array(16), 0)).toThrow(/매직/)
  })
})

withRom('en', 'ko', 'ja')('맵 헤더 표를 찾는다 — 세 판 다', () => {
  for (const locale of ['en', 'ko', 'ja'] as const) {
    it(`${locale} 롬에서 자리가 하나로 정해진다`, async () => {
      const fs = await openNds(fileSource(romPath(locale)!))
      if (!fs) throw new Error('롬을 못 열었다')
      const arm9 = await fs.arm9(0, fs.header.arm9Size)
      const counts = await tableCounts(fs)
      const at = findHeaderTable(arm9!, counts)
      const abs = at + fs.header.arm9RomOffset

      const node = NODE_TABLE[locale]
      if (node !== null) {
        // 노드가 박아 둔 값과 같다 — 상수를 없앤 것이 기능을 안 줄였다
        expect(abs, `${locale}: 찾은 0x${abs.toString(16)} ≠ 박아 둔 0x${node.toString(16)}`).toBe(node)
      } else {
        // ja는 노드 쪽이 안 찾은 자리다. 찾았다는 것 자체가 새로 되는 일이다
        expect(abs).toBeGreaterThan(0)
      }
    }, 120_000)
  }

  it('⚠️ 후보는 둘이고 정확히 한 줄 떨어져 있다 — 그 무리의 시작이 표다', async () => {
    const fs = await openNds(fileSource(romPath('en')!))
    const arm9 = await fs!.arm9(0, fs!.header.arm9Size)
    const counts = await tableCounts(fs!)
    const view = new DataView(arm9!.buffer, arm9!.byteOffset, arm9!.byteLength)
    const hits: number[] = []
    for (let at = 0; at <= arm9!.byteLength - MAP_COUNT * HEADER_SIZE; at += 4) {
      if (view.getUint16(at + 16, true) >= counts.events) continue
      if (view.getUint16(at + 2, true) >= counts.matrices) continue
      if (tableFits(view, at, counts)) hits.push(at)
    }
    const first = 0xea01c - fs!.header.arm9RomOffset
    // 뒤 후보는 0번 줄을 버리고 표 다음 줄을 끌어들여 읽은 것이다. 성질만으로는
    // 여기까지밖에 못 좁힌다는 사실 자체를 재 둔다 — 나중에 하나로 줄면 알고 싶다
    expect(hits).toEqual([first, first + HEADER_SIZE])
  }, 180_000)
})

async function tableCounts(fs: NdsFileSystem): Promise<{ events: number, matrices: number, encounters: number }> {
  const { narcCount } = await import('./nds')
  const count = async (p: string): Promise<number> => {
    const b = await fs.read(p)
    const n = b ? narcCount(b) : null
    if (n === null) throw new Error(`${p}을 못 셌다`)
    return n
  }
  return {
    events: await count('/fielddata/eventdata/zone_event.narc'),
    matrices: await count('/fielddata/mapmatrix/map_matrix.narc'),
    encounters: await count('/fielddata/encountdata/pl_enc_data.narc'),
  }
}

/**
 * ⚠️ **배포된 게임의 대사가 통째로 어긋났던 자리다.**
 *
 * 헤더 24바이트를 세 판에서 견주면 다른 자리가 `msg`(8·9번) 하나뿐이고 593줄이
 * **전부** 다르다 — 각 롬이 자기 뱅크 번호를 적기 때문이다. 우리가 굽는 대사
 * 파일 이름은 us 번호라, 되돌리지 않으면 맵마다 이웃 뱅크를 읽는다. 파일은 있으니
 * 화면은 멀쩡히 뜨고 글만 딴 것이 나온다 — 그래서 개발판에서는 안 보였다
 */
withRom('en', 'ko', 'ja')('맵이 가리키는 글 뱅크가 세 판에서 같은 것이다', () => {
  const banksOf = async (locale: 'en' | 'ko' | 'ja'): Promise<number[]> => {
    const fs = await openNds(fileSource(romPath(locale)!))
    if (!fs) throw new Error('롬을 못 열었다')
    const arm9 = await fs.arm9(0, fs.header.arm9Size)
    const at = findHeaderTable(arm9!, await tableCounts(fs))
    const view = new DataView(arm9!.buffer, arm9!.byteOffset, arm9!.byteLength)
    return Array.from({ length: MAP_COUNT }, (_, id) => {
      const raw = parseHeader(view, at + id * HEADER_SIZE, id).msg
      return toUsBank(raw, locale === 'en' ? 'us' : locale, id)
    })
  }

  it('ko·ja 롬의 번호를 되돌리면 us 열과 593/593 같다', async () => {
    const us = await banksOf('en')
    for (const locale of ['ko', 'ja'] as const) {
      const got = await banksOf(locale)
      const off = us.map((v, i) => (v === got[i] ? -1 : i)).filter((i) => i >= 0)
      expect(off, `${locale}: ${String(off.length)}개 맵이 어긋난다 — ${off.slice(0, 5).join(', ')}`)
        .toEqual([])
    }
  }, 300_000)

  it('세 판이 같은 것을 낸다 — maps.json도 통행 격자도 바이트로 같다', async () => {
    const runFor = async (locale: 'en' | 'ko' | 'ja'): Promise<Map<string, Uint8Array>> => {
      const release = SUPPORTED.releases.find((r) => r.locale === locale)!
      const fs = await openNds(fileSource(romPath(locale)!))
      return GROUPS.find((g) => g.name === 'maps')!.convert!({ fs: fs!, locale, release })
    }
    // ⚠️ **`0.bin`은 글 뱅크와 다른 이유로 갈렸다.** 한국판이 225번도로의 잔디
    // 4칸을 열어 뒀다 — 롬 셋에서 지형이 다른 자리는 그것뿐이고, `TILE_PATCHES`가
    // 세 판을 그 열린 값으로 맞춘다
    const want = ['data/maps.json', 'data/matrices/0.bin', 'data/matrices/interiors.bin']
    const us = await runFor('en')
    for (const locale of ['ko', 'ja'] as const) {
      const got = await runFor(locale)
      for (const path of want) {
        expect(Buffer.from(got.get(path)!).equals(Buffer.from(us.get(path)!)), `${locale} ${path}`)
          .toBe(true)
      }
    }
  }, 300_000)

  it('통행 칸 보정은 기대한 값일 때만 먹는다 — 다른 값이면 롬을 그대로 둔다', () => {
    // 225번도로(청크 164)의 그 네 칸만, 통행 불가일 때만 연다
    expect(patchTile(164, 26, 16, IMPASSABLE)).toBe(0)
    expect(patchTile(164, 27, 17, IMPASSABLE)).toBe(0)
    // 이미 열려 있으면(한국판) 그대로. 우리가 모르는 값이면 손대지 않는다
    expect(patchTile(164, 26, 16, 0)).toBe(0)
    expect(patchTile(164, 26, 16, 0x0015)).toBe(0x0015)
    // 이웃 칸과 다른 청크는 안 건드린다
    expect(patchTile(164, 26, 18, IMPASSABLE)).toBe(IMPASSABLE)
    expect(patchTile(163, 26, 16, IMPASSABLE)).toBe(IMPASSABLE)
  })

  it('되돌리기 전에는 593개가 다 어긋나 있다 — 시험이 무엇을 잡는지', async () => {
    const fsEn = await openNds(fileSource(romPath('en')!))
    const fsKo = await openNds(fileSource(romPath('ko')!))
    const raw = async (fs: NonNullable<Awaited<ReturnType<typeof openNds>>>): Promise<number[]> => {
      const arm9 = await fs.arm9(0, fs.header.arm9Size)
      const at = findHeaderTable(arm9!, await tableCounts(fs))
      const view = new DataView(arm9!.buffer, arm9!.byteOffset, arm9!.byteLength)
      return Array.from({ length: MAP_COUNT }, (_, id) => parseHeader(view, at + id * HEADER_SIZE, id).msg)
    }
    const [us, ko] = [await raw(fsEn!), await raw(fsKo!)]
    expect(us.filter((v, i) => v === ko[i])).toHaveLength(0)
  }, 300_000)
})

withRom('en')('parity — 노드 산출물과 바이트로 같다', () => {
  const EN = SUPPORTED.releases.find((r) => r.gameCode === 'CPUE')!
  let cached: Map<string, Uint8Array> | null = null
  const run = async (): Promise<Map<string, Uint8Array>> => {
    if (cached) return cached
    const fs = await openNds(fileSource(romPath('en')!))
    const group = GROUPS.find((g) => g.name === 'maps')!
    cached = await group.convert!({ fs: fs!, locale: 'en', release: EN })
    return cached
  }

  it('⚠️ 일곱 파일이 다 노드 산출물과 같다', async () => {
    const out = await run()
    const diff: string[] = []
    let same = 0
    for (const [path, bytes] of out) {
      const file = resolve(DATA, path.replace(/^data\//, ''))
      if (!existsSync(file)) { diff.push(`${path} (노드 산출물이 없다)`); continue }
      const expected = readFileSync(file)
      const equal = expected.byteLength === bytes.byteLength
        && Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).equals(expected)
      if (equal) same++
      else diff.push(`${path} (${String(bytes.byteLength)}B ≠ ${String(expected.byteLength)}B)`)
    }
    expect(diff, diff.join('\n')).toEqual([])
    expect(same).toBe(7)
  }, 300_000)

  it('맵 593개가 나오고 이벤트 파일에 전단사다', async () => {
    const out = await run()
    const maps = JSON.parse(decoder.decode(out.get('data/maps.json')!)) as {
      count: number, maps: { events: number, matrix: number }[], areas: unknown[]
    }
    expect(maps.count).toBe(MAP_COUNT)
    expect(new Set(maps.maps.map((m) => m.events)).size).toBe(534)
    expect(maps.areas.length).toBeGreaterThan(0)
  }, 300_000)

  it('오버월드가 30×30청크이고 통행 가능 타일이 있다', async () => {
    const out = await run()
    const meta = JSON.parse(decoder.decode(out.get('data/matrices/0.json')!)) as {
      width: number, height: number, tileWidth: number, spawn: { x: number, z: number, map: number }
    }
    expect([meta.width, meta.height]).toEqual([30, 30])
    const tiles = new Uint16Array(out.get('data/matrices/0.bin')!.buffer.slice(0))
    const walkable = tiles.reduce((n, t) => n + (t & IMPASSABLE ? 0 : 1), 0)
    expect(walkable).toBeGreaterThan(10_000)
    // 시작 지점이 실제로 통행 가능한 타일이다
    const at = Math.floor(meta.spawn.z) * meta.tileWidth + Math.floor(meta.spawn.x)
    expect(tiles[at]! & IMPASSABLE).toBe(0)
  }, 300_000)

  it('BDHC 판이 8,974개고 평면은 나눠 쓴다', async () => {
    const out = await run()
    const meta = JSON.parse(decoder.decode(out.get('data/bdhc.json')!)) as {
      plateCount: number, planes: number[][], chunks: [number, number][]
    }
    expect(meta.plateCount).toBe(8974)
    expect(meta.chunks).toHaveLength(666)
    // 판 8,974개가 평면 321종을 나눠 쓴다 — 안 나누면 파일이 몇 배가 된다
    expect(meta.planes.length).toBeLessThan(400)
  }, 300_000)
})
