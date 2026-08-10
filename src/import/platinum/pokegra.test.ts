// 포켓몬 그림 ↔ 노드 산출물 parity (DATA.md §2.17)
//
// ⚠️ **그림은 바이트로 안 잰다.** deflate는 같은 픽셀에서 여러 정답을 낸다 —
// 노드의 `zlib level 9`와 브라우저의 `CompressionStream`이 고르는 부호가 다르다.
// 잴 것은 압축 부호가 아니라 **픽셀**이다. 한 점이라도 다르면 암호를 잘못 푼 것이다.
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { openNds } from './nds'
import { encodePng } from './png'
import { convertPokegra, decipher, paletteOf, toRgba, boundsOf, clearRatio, CUT } from './pokegra'
import { SUPPORTED } from './validate'
import { DATA, withRom, romPath, fileSource, decodePng, decodePngBytes } from '../../data/romData.testkit'

const EN = SUPPORTED.releases.find((r) => r.gameCode === 'CPUE')!
const decoder = new TextDecoder()

describe('PNG 인코더', () => {
  it('구운 것을 다시 펴면 같은 픽셀이다', async () => {
    const rgba = new Uint8Array(4 * 3 * 4)
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37) & 255
    const png = await encodePng(rgba, 4, 3)
    const back = decodePngBytes(png)
    expect([back.width, back.height]).toEqual([4, 3])
    expect([...back.pixels]).toEqual([...rgba])
  })

  it('픽셀이 모자라면 세운다 — 잘린 그림을 굽지 않는다', async () => {
    await expect(encodePng(new Uint8Array(4), 4, 3)).rejects.toThrow(/픽셀이/)
  })
})

describe('암호와 팔레트', () => {
  it('첫 낱말이 자기 자신과 XOR돼 0이 된다 — 방향이 맞다는 표시다', () => {
    const b = new Uint8Array(8)
    new DataView(b.buffer).setUint16(0, 0xabcd, true)
    const out = decipher(b, 0)
    expect(new DataView(out.buffer, out.byteOffset).getUint16(0, true)).toBe(0)
  })

  it('팔레트가 16색이 아니면 null이다', () => {
    expect(paletteOf(new Uint8Array(16))).toBeNull()
  })

  it('색 0은 투명하다 — 배경이 검게 차면 안 된다', () => {
    const palette = Array.from({ length: 16 }, (_, i) => [i, i, i] as [number, number, number])
    const rgba = toRgba(new Uint8Array(160 * 80 / 2), palette, 0)
    expect(clearRatio(rgba)).toBe(1)
    expect(boundsOf(rgba)).toBeNull()
  })
})

withRom('en')('parity — 픽셀이 노드 산출물과 같다', () => {
  let cached: Map<string, Uint8Array> | null = null
  const run = async (): Promise<Map<string, Uint8Array>> => {
    if (cached) return cached
    const fs = await openNds(fileSource(romPath('en')!))
    cached = await convertPokegra({ fs: fs!, locale: 'en', release: EN })
    return cached
  }

  it('⚠️ 구운 그림이 노드 그림과 픽셀 하나까지 같다', async () => {
    const out = await run()
    const dir = resolve(DATA, 'pokemon')
    if (!existsSync(dir)) { expect.unreachable('public/data/pokemon이 없다'); return }

    let checked = 0
    const diff: string[] = []
    for (const [path, bytes] of out) {
      if (!path.endsWith('.png')) continue
      const file = resolve(DATA, path.replace(/^data\//, ''))
      if (!existsSync(file)) { diff.push(`${path}: 노드 쪽에 없다`); continue }
      const mine = decodePngBytes(bytes)
      const theirs = decodePng(file)
      if (mine.width !== theirs.width || mine.height !== theirs.height) {
        diff.push(`${path}: 크기가 다르다`)
        continue
      }
      let bad = 0
      for (let i = 0; i < mine.pixels.length; i++) {
        if (mine.pixels[i] !== theirs.pixels[i]) bad++
      }
      if (bad) diff.push(`${path}: 픽셀 ${String(bad)}개가 다르다`)
      checked++
    }
    expect(diff.slice(0, 5), `${String(diff.length)}장이 어긋난다`).toEqual([])
    expect(checked).toBeGreaterThan(900)
  }, 600_000)

  it('노드가 구운 장수와 같다 — 조용히 몇 장을 빠뜨리지 않는다', async () => {
    const out = await run()
    const dir = resolve(DATA, 'pokemon')
    const theirs = readdirSync(dir).filter((f) => f.endsWith('.png')).length
    const mine = [...out.keys()].filter((p) => p.endsWith('.png')).length
    expect(mine).toBe(theirs)
  }, 600_000)

  it('목차가 노드 산출물과 바이트로 같다 — 여기는 JSON이라 잴 수 있다', async () => {
    const out = await run()
    const { readFileSync } = await import('node:fs')
    const expected = readFileSync(resolve(DATA, 'pokemon/index.json'), 'utf8')
    expect(decoder.decode(out.get('data/pokemon/index.json')!)).toBe(expected)
  }, 600_000)

  it('컷이 80×80이고 상자가 그 안에 든다', async () => {
    const out = await run()
    const index = JSON.parse(decoder.decode(out.get('data/pokemon/index.json')!)) as {
      size: number, sprites: Record<string, Record<string, { x: number, y: number, w: number, h: number }>>
    }
    expect(index.size).toBe(CUT)
    for (const entry of Object.values(index.sprites)) {
      for (const box of Object.values(entry)) {
        expect(box.x + box.w).toBeLessThanOrEqual(CUT)
        expect(box.y + box.h).toBeLessThanOrEqual(CUT)
      }
    }
  }, 600_000)
})
