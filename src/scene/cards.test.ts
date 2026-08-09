// 오려 낸 판에 두께 주기 검증 (DATA.md §2.2)
//
// 겁나는 것은 **없던 것을 만드는 것**이다. 울타리 모양을 짐작해 세우면 그건
// 우리 울타리다. 여기서 보는 것은 옆면이 **그림의 실루엣을 그대로 따라가는가**
// 하나뿐이다 — 말뚝 사이 빈틈이 빈틈으로 남는가.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import { cardShells, fitAffine } from './cards'
import { cutoutGroups, plateLumps, splitFoliage } from './plates'
import type { ChunkMesh, TexSheet } from './chunkMesh'
import type { MatrixMeta } from '../engine/map/grid'
import { withData } from '../data/romData.testkit'

const DATA = resolve(__dirname, '../../public/data')
const maybe = withData('chunks/0.bin')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

interface Fmt { posScale: number; vertexBytes: number; count: number }

function readChunk(index: number, fmt: Fmt): ChunkMesh {
  const buf = readFileSync(resolve(DATA, `chunks/${String(index)}.bin`))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const view = new DataView(ab)
  const metaLen = view.getUint32(4, true)
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, metaLen))) as {
    verts: number; indices: number
    materials: { tex: string | null; pal: string | null; rep: number; a: number; f: number }[]
    submeshes: [number, number, number][]
  }
  const head = 8 + metaLen + ((4 - (metaLen % 4)) % 4)
  const n = meta.verts
  const position = new Float32Array(n * 3)
  const uv = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    const o = head + i * fmt.vertexBytes
    for (let a = 0; a < 3; a++) position[i * 3 + a] = view.getInt16(o + a * 2, true) / fmt.posScale
    for (let a = 0; a < 2; a++) uv[i * 2 + a] = view.getFloat32(o + 8 + a * 4, true)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
  geometry.setIndex([...new Uint16Array(ab, head + n * fmt.vertexBytes, meta.indices)])
  return {
    geometry,
    materials: meta.submeshes.map(([mat]) => meta.materials[mat]!),
    groups: meta.submeshes,
  }
}

const sheetCache = new Map<number, TexSheet>()
function sheetFor(set: number): TexSheet {
  const hit = sheetCache.get(set)
  if (hit) return hit
  const { decodePng } = createRequire(import.meta.url)('../../tools/spike/png-decode.js') as {
    decodePng: (f: string) => { width: number; height: number; pixels: Uint8Array }
  }
  const png = decodePng(resolve(DATA, `tex/${String(set)}.png`))
  const info = (read('tex/index.json') as {
    sets: { items: [string, string, number, number, number, number][] }[]
  }).sets[set]!
  const made: TexSheet = {
    width: png.width,
    height: png.height,
    items: info.items.map(([tex, pal, x, y, w, h]) => ({ tex, pal, x, y, w, h })),
    pixels: new Uint8ClampedArray(png.pixels.buffer, png.pixels.byteOffset, png.pixels.length),
  }
  sheetCache.set(set, made)
  return made
}

/** 손으로 만든 판 한 장. 세로로 서 있고 UV가 그림 한 칸을 그대로 덮는다 */
function standingCard(tex: string): ChunkMesh {
  const geometry = new BufferGeometry()
  // x 0~1, y 0~1, z=0인 사각형
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
  ]), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1,
  ]), 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  return {
    geometry,
    materials: [{ tex, pal: '', rep: 0, a: 31, f: 0 }],
    groups: [[0, 0, 6]],
  }
}

/**
 * 알파를 손으로 그린 그림 한 장. `#`이 불투명이다.
 * 투명 비율이 잣대라(`cutoutGroups`) 그림을 진짜로 만들어야 한다
 */
function drawnSheet(tex: string, rows: string[]): TexSheet {
  const w = rows[0]!.length, h = rows.length
  const pixels = new Uint8ClampedArray(w * h * 4)
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      pixels[o] = 220; pixels[o + 1] = 220; pixels[o + 2] = 210
      pixels[o + 3] = row[x] === '#' ? 255 : 0
    }
  })
  return { width: w, height: h, items: [{ tex, pal: '', x: 0, y: 0, w, h }], pixels }
}

describe('UV → 3D 아핀', () => {
  it('사각형 하나에서 정확히 풀린다', () => {
    const pos = new Float32Array([0, 0, 0, 2, 0, 0, 2, 3, 0, 0, 3, 0])
    const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1])
    const f = fitAffine([0, 1, 2, 3], pos, uv)!
    // u가 x를 2배로, v가 y를 3배로 끈다
    expect(f.a[0]).toBeCloseTo(2, 9)
    expect(f.b[1]).toBeCloseTo(3, 9)
    expect(f.c[2]).toBeCloseTo(0, 9)
  })

  it('점이 셋 미만이면 못 푼다', () => {
    const pos = new Float32Array([0, 0, 0, 1, 0, 0])
    const uv = new Float32Array([0, 0, 1, 0])
    expect(fitAffine([0, 1], pos, uv)).toBeNull()
  })
})

describe('실루엣을 그대로 밀어낸다', () => {
  it('말뚝 사이 빈틈이 빈틈으로 남는다', () => {
    // 4×4 그림에 말뚝 둘 — 가운데가 비어 있다
    const rows = ['#..#', '#..#', '#..#', '#..#']
    const mesh = standingCard('picket')
    const shells = cardShells(mesh, [true], new Float32Array(
      (mesh.geometry.getAttribute('position') as BufferAttribute).array), drawnSheet('picket', rows))!
    const pos = shells.geometry.getAttribute('position') as BufferAttribute

    // 옆면은 전부 z가 ±(한 텍셀의 절반)이다. 판이 1타일 폭에 4텍셀이라 0.125
    const zs = new Set<number>()
    for (let i = 0; i < pos.count; i++) zs.add(Number(pos.getZ(i).toFixed(6)))
    expect([...zs].sort((a, b) => a - b)).toEqual([-0.125, 0.125])

    // 세로 옆면 넷(말뚝마다 좌·우)이 이어져 한 판씩 된다 — x가 이 넷뿐이다
    const xs = new Set<number>()
    for (let i = 0; i < pos.count; i++) xs.add(Number(pos.getX(i).toFixed(6)))
    expect([...xs].sort((a, b) => a - b)).toEqual([0, 0.25, 0.75, 1])

    // 사각형 여덟 = 삼각형 열여섯: 세로 넷 + 가로 넷(말뚝마다 위·아래)
    expect(pos.count / 3).toBe(16)
  })

  it('가운데가 꽉 찬 그림은 둘레만 두른다', () => {
    const rows = ['####', '####', '####', '####']
    const mesh = standingCard('slab')
    const shells = cardShells(mesh, [true], new Float32Array(
      (mesh.geometry.getAttribute('position') as BufferAttribute).array), drawnSheet('slab', rows))!
    // 사각형 넷 = 삼각형 여덟. 안쪽 경계가 없다
    expect(shells.geometry.getAttribute('position').count / 3).toBe(8)
  })

  it('잎과 구운 그림자에는 안 붙인다 — 저쪽은 입체로 다시 세우거나 걷어낸다', () => {
    for (const tex of ['tree01', 'tshadow']) {
      const mesh = standingCard(tex)
      expect(cardShells(mesh, [true], new Float32Array(
        (mesh.geometry.getAttribute('position') as BufferAttribute).array),
      drawnSheet(tex, ['#..#', '#..#', '#..#', '#..#']))).toBeNull()
    }
  })
})

/**
 * 원작 자료로 재는 자리.
 *
 * `imped`(흰 울타리)는 오버월드에 판 1,427장이고, 그림 위쪽에 말뚝과 가로대가
 * 그려져 있다. 여기서 보는 것은 두 가지다 — 서 있는 판에 두께가 붙는가,
 * 그리고 **땅에 깔린 지형에는 안 붙는가**.
 */
maybe('원작 자료', () => {
  interface Tally { tris: number; byTexture: Map<string, number> }

  function sweep(): Tally {
    const fmt = read('chunks/index.json') as Fmt
    const maps = read('maps.json') as { maps: { area: number }[]; areas: { tex: number }[] }
    const meta = read('matrices/0.json') as MatrixMeta
    const texOf = (zone: number) => maps.areas[maps.maps[zone]?.area ?? 0]?.tex ?? 0

    const seen = new Set<string>()
    const t: Tally = { tris: 0, byTexture: new Map() }
    for (const c of meta.chunks) {
      const key = `${String(c.land)}/${String(texOf(c.zone))}`
      if (seen.has(key)) continue
      seen.add(key)
      const mesh = readChunk(c.land, fmt)
      const sheet = sheetFor(texOf(c.zone))
      const cutout = cutoutGroups(mesh, sheet)
      const lumps = plateLumps(
        mesh, sheet, cutout,
        (mesh.geometry.getAttribute('position') as BufferAttribute).array as Float32Array)
      const split = splitFoliage(mesh, cutout, lumps)
      const shells = cardShells(
        mesh, cutout,
        (split.geometry.getAttribute('position') as BufferAttribute).array as Float32Array,
        sheet, lumps)
      if (!shells) continue
      t.tris += shells.geometry.getAttribute('position').count / 3
      for (const [, count, g] of shells.groups) {
        const tex = mesh.materials[g]!.tex ?? ''
        t.byTexture.set(tex, (t.byTexture.get(tex) ?? 0) + count / 3)
      }
    }
    return t
  }

  it('서 있는 판에는 붙고 땅에 깔린 지형에는 안 붙는다', () => {
    const t = sweep()
    // 청크 × 그림묶음 조합 전체의 합.
    //
    // 387,692였다. `standCutouts`가 원작이 눕혀 둔 각(45.0°)만 세우게 되면서
    // 29% 줄었고(15.9°로 놓인 바닷가 거품을 일으켜 세우고 거기에 두께까지 붙이던
    // 몫), 판때기 바위와 화분이 `Rocks`로 가면서 275,528에서 또 넷 중 셋이
    // 빠졌다 — 입체로 세우므로 종잇장에 두께를 붙일 일이 없다
    expect(t.tris).toBe(72_284)
    // ⚠️ **바위는 여기서 두께를 안 얻는다.** `searock` 판 1,001장이 전부 45°라
    // 세워지고 있었고, 그 실루엣에 두께를 붙이느라 삼각형 148,888개를 썼다
    expect(t.byTexture.get('searock')).toBeUndefined()
    // 흰 울타리 — 오버월드 판 1,427장이 여기서 두께를 얻는다.
    //
    // 106,488이었다. 줄어든 42,392는 **같은 그림에 든 바위와 화분**이다:
    // 축복시티 `imped` 한 장에 울타리 두 줄 · 바위 · 화분 둘 · 자갈 둘이
    // 같이 들어 있고, 그 넷이 이제 `Rocks`로 간다 (`plates.plateLumps`)
    expect(t.byTexture.get('imped')).toBe(64_096)
    // ⚠️ **바닷가 거품은 지형이다.** 15.9°·80.5°·85.8°로 놓여 있고 45°가 하나도
    // 없다. 세우지 않으니 옆면도 안 생긴다
    expect(t.byTexture.get('seaside3')).toBeUndefined()

    // ⚠️ **화단은 땅이다.** `t3_fl_*` 넷은 알파가 뚫려 있어 같은 잣대에 걸리지만
    // 누워 있다 — 여기에 옆면을 세우면 땅바닥 무늬마다 턱이 생기고, 그것만으로
    // 삼각형이 170,876개 늘었다(누운 판까지 세우던 때의 실측)
    for (const tex of ['t3_fl_b.1', 't3_fl_p.1', 't3_fl_r.1', 't3_fl_y.1']) {
      expect(t.byTexture.get(tex), tex).toBeUndefined()
    }
  }, 600_000)
})
