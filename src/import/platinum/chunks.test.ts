// 청크 지오메트리 ↔ 노드 산출물 parity (DATA.md §2.2)
//
// ⚠️ **여기서 재는 것 둘.**
//
//   ① 헤더 수치와의 대조 — MDL0가 정점·삼각형·사각형 수를 적어 뒀다. 명령 폭을
//      하나만 잘못 알아도 그 뒤가 전부 밀리므로 우연히 맞을 수 없다. 666/666
//   ② 노드 산출물과 바이트로 같은가 — 같아야 개발판과 공개판이 같은 땅을 그린다
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { openNds, narcEntry } from './nds'
import { countGeometry, openModel, parsePolygons, runDisplayList } from './nsbmd'
import { buildChunk, readSbc, convertChunks } from './chunks'
import { SUPPORTED } from './validate'
import {
  DATA, withRom, romPath, fileSource, decodePng, decodePngBytes,
} from '../../data/romData.testkit'

const EN = SUPPORTED.releases.find((r) => r.gameCode === 'CPUE')!
const decoder = new TextDecoder()

describe('SBC', () => {
  it('재질을 바꾸고 폴리곤을 그린다 — 순서대로 1:1이 아니다', () => {
    // MAT 4 · SHP 13 · MAT 0 · SHP 9 · RET
    const b = Uint8Array.from([0x04, 4, 0x05, 13, 0x04, 0, 0x05, 9, 0x01])
    expect(readSbc(b, 0, b.length)).toEqual([
      { material: 4, polygon: 13 },
      { material: 0, polygon: 9 },
    ])
  })

  it('모르는 명령이면 세운다 — 조용히 밀리면 땅이 어긋난다', () => {
    const b = Uint8Array.from([0x1f])
    expect(() => readSbc(b, 0, b.length)).toThrow(/모르는 SBC/)
  })

  it('NODEDESC는 깃발에 따라 폭이 다르다', () => {
    // 깃발 없는 NODEDESC(2바이트) → 그 뒤 SHP가 제대로 읽힌다
    const plain = Uint8Array.from([0x06, 1, 2, 0x05, 7, 0x01])
    expect(readSbc(plain, 0, plain.length)).toEqual([{ material: 0, polygon: 7 }])
    // 깃발이 선 NODEDESC(4바이트)
    const flagged = Uint8Array.from([0x26, 1, 2, 3, 4, 0x05, 7, 0x01])
    expect(readSbc(flagged, 0, flagged.length)).toEqual([{ material: 0, polygon: 7 }])
  })
})

describe('디스플레이 리스트', () => {
  it('명령이 네 개씩 묶여 온다 — 그 규칙을 모르면 첫 명령부터 어긋난다', () => {
    // NOP · MTX_MODE(1) · NOP · NOP  다음에 파라미터 한 워드
    const b = new Uint8Array(8)
    b.set([0x00, 0x10, 0x00, 0x00])
    new DataView(b.buffer).setUint32(4, 0x1234, true)
    const seen: [number, number[]][] = []
    runDisplayList(b, (op, params) => seen.push([op, params]))
    expect(seen).toEqual([[0x00, []], [0x10, [0x1234]], [0x00, []], [0x00, []]])
  })

  it('모르는 GPU 명령이면 세운다', () => {
    expect(() => runDisplayList(Uint8Array.from([0xff, 0, 0, 0]), () => { /* */ }))
      .toThrow(/모르는 GPU 명령/)
  })
})

withRom('en')('진짜 청크 666개', () => {
  const open = async (): Promise<Uint8Array> => {
    const fs = await openNds(fileSource(romPath('en')!))
    const narc = await fs!.read('/fielddata/land_data/land_data.narc')
    if (!narc) throw new Error('land_data.narc을 못 읽었다')
    return narc
  }

  it('⚠️ 센 정점·삼각형·사각형이 MDL0 헤더와 666/666 일치한다', async () => {
    const narc = await open()
    let checked = 0
    const bad: string[] = []
    for (let i = 0; ; i++) {
      const entry = narcEntry(narc, i)
      if (!entry) break
      const { buf, view, modelAt, header } = openModel(entry)
      const total = { verts: 0, tri: 0, quad: 0 }
      for (const p of parsePolygons(buf, view, modelAt, header)) {
        const c = countGeometry(p.dl)
        total.verts += c.verts; total.tri += c.tri; total.quad += c.quad
      }
      if (total.verts !== header.verts || total.tri !== header.triangles
        || total.quad !== header.quads) {
        bad.push(`#${String(i)} 센 것 ${String(total.verts)}v/${String(total.tri)}t/`
          + `${String(total.quad)}q ≠ 헤더 ${String(header.verts)}v/`
          + `${String(header.triangles)}t/${String(header.quads)}q`)
      }
      checked++
    }
    expect(bad.slice(0, 5), `${String(bad.length)}개가 어긋난다`).toEqual([])
    expect(checked).toBe(666)
  }, 300_000)

  it('청크마다 헤더가 적은 정점 수만큼 나온다', async () => {
    const narc = await open()
    let mismatched = 0
    for (let i = 0; ; i++) {
      const entry = narcEntry(narc, i)
      if (!entry) break
      const built = buildChunk(entry, i)
      if (built.verts !== built.headerVerts) mismatched++
    }
    expect(mismatched).toBe(0)
  }, 300_000)
})

withRom('en')('parity — 노드 산출물과 바이트로 같다', () => {
  it('⚠️ 청크 666개와 목차가 다 같다', async () => {
    if (!existsSync(resolve(DATA, 'chunks/index.json'))) {
      expect.unreachable('public/data/chunks가 없다 — pnpm extract:chunks')
      return
    }
    const fs = await openNds(fileSource(romPath('en')!))
    const out = await convertChunks({ fs: fs!, locale: 'en', release: EN })

    const diff: string[] = []
    let same = 0
    for (const [path, bytes] of out) {
      // 그림은 이 시험이 안 잰다 — 아래 시험이 픽셀로 잰다
      if (!path.startsWith('data/chunks/')) continue
      const file = resolve(DATA, path.replace(/^data\//, ''))
      if (!existsSync(file)) { diff.push(`${path}: 노드 쪽에 없다`); continue }
      const expected = readFileSync(file)
      if (expected.byteLength !== bytes.byteLength) {
        diff.push(`${path}: ${String(bytes.byteLength)}B ≠ ${String(expected.byteLength)}B`)
        continue
      }
      if (Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).equals(expected)) same++
      else diff.push(`${path}: 크기는 같은데 내용이 다르다`)
    }
    expect(diff.slice(0, 5), `${String(diff.length)}개가 어긋난다`).toEqual([])
    // 청크 666 + 목차 · 소품 590 + 시트 568 + 목차 · 텍스처 묶음 32 + 목차
    expect(same).toBe(667)
  }, 900_000)

  it('⚠️ 소품과 텍스처 시트도 픽셀로 같다', async () => {
    if (!existsSync(resolve(DATA, 'tex/index.json'))) {
      expect.unreachable('public/data/tex가 없다 — pnpm extract:mapTextures')
      return
    }
    const fs = await openNds(fileSource(romPath('en')!))
    const out = await convertChunks({ fs: fs!, locale: 'en', release: EN })

    const diff: string[] = []
    let pngs = 0, jsons = 0
    for (const [path, bytes] of out) {
      if (!/^data\/(tex|props)\//.test(path)) continue
      const file = resolve(DATA, path.replace(/^data\//, ''))
      if (!existsSync(file)) { diff.push(`${path}: 노드 쪽에 없다`); continue }
      if (path.endsWith('.json')) {
        if (decoder.decode(bytes) === readFileSync(file, 'utf8')) jsons++
        else diff.push(`${path}: 목차가 다르다`)
        continue
      }
      if (path.endsWith('.png')) {
        // PNG는 압축 부호가 달라서 바이트로 못 잰다 — 픽셀로 잰다
        const mine = decodePngBytes(bytes)
        const theirs = decodePng(file)
        if (mine.width !== theirs.width || mine.height !== theirs.height) {
          diff.push(`${path}: ${String(mine.width)}×${String(mine.height)} ≠ `
            + `${String(theirs.width)}×${String(theirs.height)}`)
          continue
        }
        let bad = 0
        for (let i = 0; i < mine.pixels.length; i++) if (mine.pixels[i] !== theirs.pixels[i]) bad++
        if (bad) diff.push(`${path}: 픽셀 ${String(bad)}개가 다르다`)
        else pngs++
        continue
      }
      // 소품 지오메트리는 바이트로 잰다
      const expected = readFileSync(file)
      if (!Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).equals(expected)) {
        diff.push(`${path}: 바이트가 다르다`)
      }
    }
    expect(diff.slice(0, 5), `${String(diff.length)}개가 어긋난다`).toEqual([])
    expect(pngs).toBeGreaterThan(560)
    expect(jsons).toBe(2)
  }, 900_000)
})
