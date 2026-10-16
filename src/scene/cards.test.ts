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

  it('몸통을 얻는 판은 **뒤로만** 밀고 뒷면을 막는다', () => {
    // `bs_pole`은 몸통 판이다(비율 1). 1×1타일 판이라 깊이 1타일 — 앞면(z 0)은 원작 판 그대로, 뒤 끝이 z −1이다
    const rows = ['.##.', '.##.', '.##.', '.##.']
    const mesh = standingCard('bs_pole')
    const shells = cardShells(mesh, [true], new Float32Array(
      (mesh.geometry.getAttribute('position') as BufferAttribute).array), drawnSheet('bs_pole', rows))!
    const pos = shells.geometry.getAttribute('position') as BufferAttribute
    const zs = new Set<number>()
    for (let i = 0; i < pos.count; i++) zs.add(Number(pos.getZ(i).toFixed(6)))
    // 앞으로는 안 나온다 — 판 바로 앞에 겹친 그림(해골몽 눈)을 안 삼킨다
    expect([...zs].sort((a, b) => a - b)).toEqual([-1, 0])
    // 옆면 넷(기둥 좌·우·위·아래) = 삼각형 여덟 + 뒷면 막이(원작 판 삼각형 둘)
    expect(pos.count / 3).toBe(10)
    // 뒷면 막이는 원작 UV 그대로다 — 실루엣이 알파로 오려져 옆면과 맞물린다
    const uv = shells.geometry.getAttribute('uv') as BufferAttribute
    expect([uv.getX(pos.count - 1), uv.getY(pos.count - 1)]).toEqual([0, 1])
  })

  it('몸통의 옆면은 윤곽선이 아니라 한 칸 안쪽 색을 집는다', () => {
    // 가운데 두 열이 몸, 그 양옆이 윤곽선인 그림 — 칸마다 색을 다르게 칠해 어느 텍셀을 집었는지 본다
    const sheet = drawnSheet('bs_pole', ['####', '####', '####', '####'])
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) sheet.pixels[(y * 4 + x) * 4] = x === 0 || x === 3 || y === 0 || y === 3 ? 10 : 200
    }
    const mesh = standingCard('bs_pole')
    const shells = cardShells(mesh, [true], new Float32Array(
      (mesh.geometry.getAttribute('position') as BufferAttribute).array), sheet)!
    const uv = shells.geometry.getAttribute('uv') as BufferAttribute
    // 옆면 정점(뒷면 막이 6개 앞)의 UV는 전부 안쪽 칸(텍셀 1~2 = 0.25~0.75) 위다
    for (let i = 0; i < uv.count - 6; i++) {
      const tx = Math.floor(uv.getX(i) * 4), ty = Math.floor(uv.getY(i) * 4)
      expect(tx >= 1 && tx <= 2 && ty >= 1 && ty <= 2, `${String(tx)},${String(ty)}`).toBe(true)
    }
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

  /**
   * ⚠️ **`matrices/0`은 오버월드뿐이다.** 그 표만 훑으면 방 안의 판때기가
   * 두께를 얻는지 알 수 없다 — 고스트 체육관의 해골몽 판이 그 자리다.
   * 방은 맵마다 제 행렬을 쓰고(`matrices/interiors`), 그림 묶음도 맵의 영역이
   * 정한다(`MapStreamer`의 `texSet`)
   */
  function sweepInteriors(): Tally {
    const fmt = read('chunks/index.json') as Fmt
    const maps = read('maps.json') as {
      maps: { area: number, matrix: number }[], areas: { tex: number }[]
    }
    const inside = read('matrices/interiors.json') as { matrices: Record<string, MatrixMeta> }

    const seen = new Set<string>()
    const t: Tally = { tris: 0, byTexture: new Map() }
    for (const m of maps.maps) {
      const mat = inside.matrices[String(m.matrix)]
      if (mat === undefined) continue
      const tex = maps.areas[m.area]?.tex ?? 0
      for (const c of mat.chunks) {
        const key = `${String(c.land)}/${String(tex)}`
        if (seen.has(key)) continue
        seen.add(key)
        const mesh = readChunk(c.land, fmt)
        const sheet = sheetFor(tex)
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
          const tx = mesh.materials[g]!.tex ?? ''
          t.byTexture.set(tx, (t.byTexture.get(tx) ?? 0) + count / 3)
        }
      }
    }
    return t
  }

  it('방 안의 판때기도 두께를 얻는다 — 해골몽 판이 그 자리다', () => {
    const t = sweepInteriors()
    // 방 청크 × 그림묶음 조합 전체. 그림 59장이 여기서 두께를 얻는다.
    //
    // ⚠️ 91,620에서 482 늘었다 — 몸통을 얻는 판(`cards.SOLID_CARDS`)의 **뒷면 막이**와 새로 받는 깃대다:
    // 해골몽 뒷면 164 · D32 깃대 `bf_hata01` 264(전엔 오려 낸 그림이 아니라 0) · 말뚝 `bs_pole` 30 ·
    // 조각상 `bf_zou` 12 · 링 줄 `gym07rope` 12. 옆면 수는 그대로다 — 실루엣이 같고 깊이만 다르다
    expect(t.tris).toBe(92_102)
    // **해골몽(ヨマワル)이다.** 연고시티 체육관 벽에 선 판이 `gm05_yomawaru`,
    // 굴에 선 것이 `yomawaru.1`이고 둘 다 오려 낸 그림 한 장이라 옆에서 보면
    // 선으로 사라졌다. 두께가 붙는 것을 여기서 잰다.
    // 몸 판은 이제 **몸통**이다(0.5타일 · 뒷면 막이 164 — 16,596에서) · 눈 판은 1텍셀 그대로다
    expect(t.byTexture.get('gm05_yomawaru')).toBe(16_760)
    expect(t.byTexture.get('yomawaru.1')).toBe(3_264)
    // D32 깃대 — 불투명 띠라 예전엔 옆면이 없었다(한쪽 면만 그려져 뒤에서 사라졌다). 열두 개가 네모 기둥이 된다
    expect(t.byTexture.get('bf_hata01')).toBe(264)
    // 제일 많이 쓰는 것은 굴 벽면(`dun_sside`)이다
    expect(t.byTexture.get('dun_sside')).toBe(36_592)
  }, 900_000)

  it('서 있는 판에는 붙고 땅에 깔린 지형에는 안 붙는다', () => {
    const t = sweep()
    // 청크 × 그림묶음 조합 전체의 합.
    //
    // ⚠️ 72,284에서 늘었다. 「키가 폭보다 크면 덩이가 아니라 서 있는 그림」이
    // 되면서(`plates.TALL_PLATE`, REPAIR §16) 판 226장이 `Rocks`에서 돌아와
    // 두께를 다시 얻는다 — `imped` 울타리 기둥 188 · 해골몽 32 · `area07_hei_h2` 6.
    //
    // 387,692였다. `standCutouts`가 원작이 눕혀 둔 각(45.0°)만 세우게 되면서
    // 29% 줄었고(15.9°로 놓인 바닷가 거품을 일으켜 세우고 거기에 두께까지 붙이던
    // 몫), 판때기 바위와 화분이 `Rocks`로 가면서 275,528에서 또 넷 중 셋이
    // 빠졌다 — 입체로 세우므로 종잇장에 두께를 붙일 일이 없다
    expect(t.tris).toBe(74_580)
    // ⚠️ **바위는 여기서 두께를 안 얻는다.** `searock` 판 1,001장이 전부 45°라
    // 세워지고 있었고, 그 실루엣에 두께를 붙이느라 삼각형 148,888개를 썼다
    expect(t.byTexture.get('searock')).toBeUndefined()
    // 흰 울타리 — 오버월드 판 1,427장이 여기서 두께를 얻는다.
    //
    // 106,488이었다. 줄어든 42,392는 **같은 그림에 든 바위와 화분**이다:
    // 축복시티 `imped` 한 장에 울타리 두 줄 · 바위 · 화분 둘 · 자갈 둘이
    // 같이 들어 있고, 그 넷이 이제 `Rocks`로 간다 (`plates.plateLumps`)
    // ⚠️ 64,096에서 늘었다 — 울타리 **기둥** 188장이 덩이에서 돌아왔다
    expect(t.byTexture.get('imped')).toBe(65_840)
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
