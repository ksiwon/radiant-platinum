// 소품 빠진 면 검증 (DATA.md §2.2)
//
// ⚠️ **넓이로 재면 속는다.** 한 번 그렇게 했다가 틀렸다 — 경계 고리를 부채꼴로
// 덮으면 면적 벡터가 0에 수렴하는데, 문틀·창틀을 덮고 정작 뚫린 쪽은 그대로
// 두고도 합이 맞는다. 렌더해 보고서야 알았다.
//
// 그래서 여기서는 **그 방향에서 본 실루엣을 실제로 래스터라이즈한다.** 그 방향에서
// 보이는 칸은 그 방향을 보는 면으로 다 막혀 있어야 한다. 이 잣대는 문틀을 덮는
// 것으로 못 속인다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, it, expect } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import {
  FILLABLE, FLAT, GRID, facePlate, openDirections, shellColors, shellPaint, shellPlates,
  type ShellPaint,
} from './shell'
import type { ChunkMesh, TexSheet } from './chunkMesh'
import { withData } from '../data/romData.testkit'

const DATA = resolve(__dirname, '../../public/data')
const maybe = withData('props/23.bin')

interface Fmt { posScale: number; vertexBytes: number }

type P3 = [number, number, number]

/** 소품 파일 하나를 `ChunkMesh` 모양으로 읽는다 */
function readProp(index: number, fmt: Fmt): ChunkMesh {
  const buf = readFileSync(resolve(DATA, `props/${String(index)}.bin`))
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

/**
 * 소품이 실제로 쓰는 그림 묶음.
 *
 * ⚠️ **여기가 이 파일의 눈먼 자리였다.** 색을 손으로 만들어 넘기면 `shellPaint`가
 * 하는 판단을 한 번도 안 지난다 — 그 판단이 소품 189종을 뚫린 채로 두는 동안
 * 이 시험은 계속 통과했다. 그래서 롬에서 나온 그림을 그대로 물린다
 */
function readSheet(index: number): TexSheet | null {
  const info = (JSON.parse(readFileSync(resolve(DATA, 'props/index.json'), 'utf8')) as {
    sheets: ({ items: [string, string, number, number, number, number][] } | null)[]
  }).sheets[index]
  if (!info) return null
  const png = decodePng(resolve(DATA, `props/${String(index)}.png`))
  return {
    width: png.width,
    height: png.height,
    pixels: png.pixels,
    items: info.items.map(([tex, pal, x, y, w, h]) => ({ tex, pal, x, y, w, h })),
  }
}

/** 우리가 구운 PNG만 읽는다 — 8비트 RGBA · 인터레이스 없음 (`tools/extract/png.js`) */
function decodePng(file: string): { width: number, height: number, pixels: Uint8ClampedArray } {
  const buf = readFileSync(file)
  let at = 8, width = 0, height = 0, depth = 0, kind = 0
  const idat: Buffer[] = []
  while (at < buf.length) {
    const len = buf.readUInt32BE(at)
    const type = buf.toString('ascii', at + 4, at + 8)
    const body = buf.subarray(at + 8, at + 8 + len)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4)
      depth = body[8]!; kind = body[9]!
    }
    if (type === 'IDAT') idat.push(body)
    at += 12 + len
  }
  if (depth !== 8 || kind !== 6) throw new Error(`예상 밖 PNG: ${String(depth)}비트 · 형식 ${String(kind)}`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    const row = y * (stride + 1) + 1
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? out[y * stride + i - 4]! : 0
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0
      const c = i >= 4 && y > 0 ? out[(y - 1) * stride + i - 4]! : 0
      let v = raw[row + i]!
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[y * stride + i] = v & 255
    }
  }
  return { width, height, pixels: out }
}

function triangles(geo: BufferGeometry): P3[][] {
  const pos = geo.getAttribute('position') as BufferAttribute
  const idx = geo.getIndex()
  const n = idx ? idx.count : pos.count
  const at = (k: number) => (idx ? idx.getX(k) : k)
  const out: P3[][] = []
  for (let t = 0; t + 2 < n; t += 3) {
    out.push([0, 1, 2].map((j) => {
      const i = at(t + j)
      return [pos.getX(i), pos.getY(i), pos.getZ(i)] as P3
    }))
  }
  return out
}

/** 그 축을 향한 부호 있는 넓이. 부호가 곧 앞뒤고, 0에 가까우면 모로 선 면이다 */
function signedArea(p: P3[], axis: number): number {
  const u = (axis + 1) % 3, v = (axis + 2) % 3
  return (p[1]![u] - p[0]![u]) * (p[2]![v] - p[0]![v])
    - (p[2]![u] - p[0]![u]) * (p[1]![v] - p[0]![v])
}

/**
 * 그 축에 수직인 격자를 칠한다.
 *
 * `sign`이 0이면 실루엣(어느 쪽을 보든), ±1이면 **그쪽을 보는 면만** 센다.
 * 후자가 그 방향에서 실제로 눈에 들어오는 것이다.
 *
 * 문턱은 `shell.ts`에서 가져온다 — 따로 적으면 어긋나고, 어긋나면 버그가 아니라
 * 표본 차이로 결과가 갈린다
 */
function cover(
  tris: P3[][], box: number[][], N: number, axis: number, sign: number,
): Set<number> {
  const u = (axis + 1) % 3, v = (axis + 2) % 3
  const [[u0, u1], [v0, v1]] = box as [[number, number], [number, number]]
  const hit = new Set<number>()
  for (const p of tris) {
    const area = signedArea(p, axis)
    if (Math.abs(area) < FLAT) continue
    if (sign !== 0 && area * sign <= 0) continue
    const lo = (a: number) => Math.min(p[0]![a], p[1]![a], p[2]![a])
    const hi = (a: number) => Math.max(p[0]![a], p[1]![a], p[2]![a])
    const cu0 = Math.max(0, Math.floor(((lo(u) - u0) / (u1 - u0)) * N))
    const cu1 = Math.min(N - 1, Math.ceil(((hi(u) - u0) / (u1 - u0)) * N))
    const cv0 = Math.max(0, Math.floor(((lo(v) - v0) / (v1 - v0)) * N))
    const cv1 = Math.min(N - 1, Math.ceil(((hi(v) - v0) / (v1 - v0)) * N))
    for (let cv = cv0; cv <= cv1; cv++) {
      for (let cu = cu0; cu <= cu1; cu++) {
        const x = u0 + ((cu + 0.5) / N) * (u1 - u0)
        const y = v0 + ((cv + 0.5) / N) * (v1 - v0)
        const w1 = ((x - p[0]![u]) * (p[2]![v] - p[0]![v])
          - (p[2]![u] - p[0]![u]) * (y - p[0]![v])) / area
        const w2 = ((p[1]![u] - p[0]![u]) * (y - p[0]![v])
          - (x - p[0]![u]) * (p[1]![v] - p[0]![v])) / area
        if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue
        hit.add(cv * N + cu)
      }
    }
  }
  return hit
}

/** 그 축에 수직인 두 축의 경계 상자 */
function boxOf(tris: P3[][], axis: number): number[][] {
  return [(axis + 1) % 3, (axis + 2) % 3].map((a) => [
    Math.min(...tris.flatMap((t) => t.map((q) => q[a]))),
    Math.max(...tris.flatMap((t) => t.map((q) => q[a]))),
  ])
}

const NAME = ['X', 'Y', 'Z']
const dirName = ([a, s]: readonly [number, number]) => `${s > 0 ? '+' : '−'}${NAME[a]!}`

maybe('소품 빠진 면', () => {
  const fmt = JSON.parse(readFileSync(resolve(DATA, 'chunks/index.json'), 'utf8')) as Fmt
  /**
   * 눈금은 `shell.ts`에서 가져온다.
   *
   * 여기 래스터라이저는 구현과 따로 짠 것이지만, 해상도와 문턱까지 다르게 두면
   * 칸 한가운데를 찍는 자리가 어긋나서 **버그가 아닌 표본 차이로** 결과가 갈린다.
   * 실제로 48 대 64에서 446칸(0.011%)이, 문턱 2e-4 대 1e-4에서 몇 칸이 그렇게
   * 어긋났다. 눈금은 재는 자이지 검증 대상이 아니다 — 자를 맞추고 **판이 실제로
   * 덮는가**를 본다
   */
  const N = GRID
  /** 텍스처를 안 읽으므로 색만 손으로 준다. 모양을 재는 시험이지 색을 재는 것이 아니다 */
  /** 색만 있고 그림은 없는 칠 — 판이 서는지만 보는 자리다 */
  const paint = (mesh: ChunkMesh): ShellPaint => ({
    colors: mesh.materials.map(() => 0x8a7f6a),
    rects: mesh.materials.map(() => null),
  })

  /**
   * 그 방향이 뚫려 있는가 — 시험이 제 눈으로 다시 잰다.
   *
   * 실루엣은 **원본**에서 재고 덮개는 채운 것에서 잰다. 격자도 원본의 경계
   * 상자로 잡는다 — 채운 것으로 잡으면 판 두께 0.02만큼 상자가 커져서 격자가
   * 밀리고, 버그가 아닌 표본 차이로 한두 칸이 갈린다
   */
  function openIn(src: P3[][], filled: P3[][], dir: readonly [number, number]): number {
    const [axis, sign] = dir
    const box = boxOf(src, axis)
    const seen = cover(src, box, N, axis, 0)
    const face = cover(filled, box, N, axis, sign)
    return [...seen].filter((c) => !face.has(c)).length
  }

  it('원작 집은 뒤·좌우가 뚫려 있다', () => {
    // 이 시험이 있어야 아래 시험에 뜻이 있다 — 원래 막혀 있었다면
    // 판을 붙여도 통과할 테니까. 바닥(−Y)은 채울 대상이 아니라 안 센다
    expect(FILLABLE.map(dirName)).toEqual(['−X', '+X', '+Y', '−Z', '+Z'])
    for (const id of [22, 23]) {
      const tris = triangles(readProp(id, fmt).geometry)
      const open = FILLABLE.filter((d) => openIn(tris, tris, d) > 0).map(dirName)
      expect(open, `소품 ${String(id)}`).toContain('−Z')
    }
    // 구현이 고른 방향과 시험이 잰 방향이 같아야 한다 — 다르면 한쪽이 틀렸다
    for (const id of [22, 23, 236]) {
      const mesh = readProp(id, fmt)
      const tris = triangles(mesh.geometry)
      expect(openDirections(mesh).map(dirName).sort(),
        `소품 ${String(id)}`).toEqual(FILLABLE.filter((d) => openIn(tris, tris, d) > 0).map(dirName).sort())
    }
  })

  it('채우면 그 방향에서 보이는 자리가 다 막힌다', () => {
    for (const id of [22, 23, 236]) {
      const mesh = readProp(id, fmt)
      const src = triangles(mesh.geometry)
      const plate = shellPlates(mesh, paint(mesh))
      expect(plate, `소품 ${String(id)} 판`).not.toBeNull()
      const filled = [...src, ...triangles(plate!)]
      // **채운 방향만 보지 않는다.** 다섯 방향 전부 막혀야 한다
      for (const dir of FILLABLE) {
        expect(openIn(src, filled, dir), `소품 ${String(id)} ${dirName(dir)}`).toBe(0)
      }
    }
  })

  it('소품 590개 전부에서 빠진 면이 다 막힌다 — 진짜 그림을 물려서', () => {
    // 집 몇 채만 보고 넘어가면 안 된다. 지난번에 접은 방식도 130종 중 75종에서는
    // 수치가 맞았다 — 전수로 재야 "대체로 된다"에 속지 않는다.
    //
    // ⚠️ **손으로 만든 색이 아니라 롬 그림으로 잰다.** 손으로 넘기면 `shellPaint`가
    // 하는 판단을 건너뛴다 — 그 판단이 189종을 뚫린 채로 두는 동안 이 시험이
    // 통과했다
    let props = 0, filled = 0, dirs = 0, seenAll = 0, open = 0, sheets = 0
    const bad: string[] = []
    const byDir = new Map<string, number>()
    for (let id = 0; id < 600; id++) {
      if (!existsSync(resolve(DATA, `props/${String(id)}.bin`))) continue
      props++
      const mesh = readProp(id, fmt)
      const src = triangles(mesh.geometry)
      const plate = shellPlates(mesh, shellPaint(mesh, readSheet(id)))
      const all = plate ? [...src, ...triangles(plate)] : src
      if (plate) filled++
      // **다섯 방향 전부** 본다. 구현이 고른 것만 보면 못 고른 것을 못 잡는다
      const pos = mesh.geometry.getAttribute('position') as BufferAttribute
      for (const dir of FILLABLE) {
        // 그 축으로 두께가 0이면 한 장짜리다 — 붙일 뒤가 없고 양면으로 그리면
        // 그것이 곧 뒷면이다. 소품 590종 중 24종이 여기 해당한다
        let lo = Infinity, hi = -Infinity
        for (let i = 0; i < pos.count; i++) {
          const c = [pos.getX(i), pos.getY(i), pos.getZ(i)][dir[0]]!
          lo = Math.min(lo, c); hi = Math.max(hi, c)
        }
        if (hi - lo === 0) { sheets++; continue }
        if (openIn(src, src, dir) > 0) {
          dirs++
          byDir.set(dirName(dir), (byDir.get(dirName(dir)) ?? 0) + 1)
        }
        const miss = openIn(src, all, dir)
        seenAll += cover(src, boxOf(src, dir[0]), N, dir[0], 0).size
        open += miss
        if (miss > 0) {
          bad.push(`${String(id)}${dirName(dir)}:${String(miss)}`)
        }
      }
    }
    expect(props).toBe(590)
    // 실측 465건. 이 수가 곧 "화면에서 뚫려 보이던 자리"의 크기다.
    //
    // ⚠️ 면 방향을 세는 방식(그쪽을 보는 삼각형이 0개냐)으로는 769건이 나오는데
    // **그 수는 틀렸다.** 지붕처럼 비스듬한 면도 옆에서 보면 넓이를 보태므로
    // 개수로는 "있다"인데 실루엣의 절반만 덮는 경우가 있고, 반대로 개수로는
    // "없다"인데 실제로는 안 뚫린 경우도 있다. 덮어 보고 세야 맞다
    expect([...byDir].sort().map(([d, n]) => `${d}${String(n)}`).join(' '))
      .toBe('+X40 +Y7 +Z17 −X45 −Z335')
    expect(dirs).toBe(444)
    // ⚠️ **0이 아니다.** 남는 것은 소품 19번의 −Z에서 6칸이고, 실루엣 칸
    // 7,129,214개 대비 0.00008%다. 0으로 못 박으면 눈금(64×64)이 바뀔 때마다
    // 깨지므로 **실측한 자리를 그대로** 적는다 — 늘어나면 그게 회귀다.
    //
    // 손으로 만든 색으로 재던 때는 여기가 0이었고, 그 0이 거짓이었다. 그림을
    // 물리면 189종·469,175칸이 뚫려 있었다
    expect(bad).toEqual(['19−Z:6'])
    expect(open, `뚫린 칸 ${String(open)}/${String(seenAll)}`).toBe(6)
    expect(seenAll).toBe(7129214)
    expect(filled).toBe(350)
    // 한 장짜리라 건너뛴 방향
    expect(sheets).toBe(111)
  // 590종을 방향 다섯으로 64×64 래스터라이즈한다. 5초 기본값으로는 모자란다
  }, 30_000)

  it('판은 본체 바깥에 얇게 붙는다 — 소품이 두꺼워지지 않는다', () => {
    const mesh = readProp(23, fmt)
    const src = mesh.geometry.getAttribute('position') as BufferAttribute
    for (const dir of FILLABLE) {
      const [axis, sign] = dir
      const plate = facePlate(mesh, paint(mesh), axis, sign)
      if (!plate) continue
      let lo = Infinity, hi = -Infinity
      for (let i = 0; i < src.count; i++) {
        const c = [src.getX(i), src.getY(i), src.getZ(i)][axis]!
        lo = Math.min(lo, c); hi = Math.max(hi, c)
      }
      const pos = plate.getAttribute('position') as BufferAttribute
      let plo = Infinity, phi = -Infinity
      for (let i = 0; i < pos.count; i++) {
        const c = [pos.getX(i), pos.getY(i), pos.getZ(i)][axis]!
        plo = Math.min(plo, c); phi = Math.max(phi, c)
      }
      // 판 전체가 본체 끝에서 0.02타일 안에 들어간다. 거울로 뒤집거나 통째로
      // 밀어 붙이면 소품이 두 배로 커져 길을 막는다
      const label = `${dirName(dir)} 판`
      expect(phi, label).toBeLessThanOrEqual(hi + 0.021)
      expect(plo, label).toBeGreaterThanOrEqual(lo - 0.021)
    }
  })

  /**
   * ⚠️ **판이 반대편 벽에 눌러 붙어 있었다** — 그리고 그걸 **못 잡는 잣대**를
   * 썼다. 두 번 다 여기서 갈렸다.
   *
   * ① 삼각형을 바운딩 박스의 끝면에 눌러 붙였다. 처마가 벽보다 튀어나온 만큼
   *    벽 자리의 판이 뒤로 물러나 허공에 떴다.
   * ② 고친다고 "그 자리의 **제일 바깥면**"을 찾아 붙였는데 더 나빴다. 뒤가
   *    통째로 없는 집은 그 자리에 아무 면도 없어서 **반대편 앞벽**이 잡힌다.
   *
   * ⚠️ 그런데 그때 쓴 잣대가 **구현과 같은 함수**였다("그 자리의 바깥면에서
   * 얼마나 뜨는가"). 정의상 0이 나온다 — 0/89,991은 아무것도 증명하지 않았다.
   *
   * 그래서 여기서는 **구현을 안 쳐다보는 자로** 잰다: 바운딩 박스의 그 끝에서
   * 판이 얼마나 안쪽으로 들어갔는가. 뒤가 없는 집의 뒤판이 앞벽에 붙으면 이
   * 값이 곧 집 두께가 된다.
   *
   * 0을 기대할 수는 없다 — 박공은 위로 갈수록 앞뒤가 좁아지고 ㄱ자 건물은 안쪽
   * 모서리가 실제로 들어가 있다. 그래서 **실측 앵커**로 잡는다
   */
  it('판이 반대편 벽에 안 붙는다', () => {
    /** 그 축 방향의 [최소, 최대] */
    const span = (tris: P3[][], axis: number): [number, number] => [
      Math.min(...tris.flatMap((t) => t.map((q) => q[axis]))),
      Math.max(...tris.flatMap((t) => t.map((q) => q[axis]))),
    ]
    let verts = 0, deep = 0
    const houses = new Map<string, { mean: number; deep: number; of: number }>()
    for (let id = 0; id < 600; id++) {
      if (!existsSync(resolve(DATA, `props/${String(id)}.bin`))) continue
      const mesh = readProp(id, fmt)
      const src = triangles(mesh.geometry)
      for (const dir of openDirections(mesh)) {
        const [axis, sign] = dir
        const plate = facePlate(mesh, paint(mesh), axis, sign)
        if (!plate) continue
        const [lo, hi] = span(src, axis)
        const thick = hi - lo
        if (!(thick > 0)) continue
        const pos = plate.getAttribute('position') as BufferAttribute
        let sum = 0, bad = 0
        for (let i = 0; i < pos.count; i++) {
          const d = [pos.getX(i), pos.getY(i), pos.getZ(i)][axis]!
          const inward = sign > 0 ? hi - d : d - lo
          sum += inward
          // 두께의 절반보다 안쪽이면 그건 이쪽 벽이 아니라 저쪽 벽이다
          if (inward > thick * 0.5) bad++
        }
        verts += pos.count
        deep += bad
        if (id === 22 || id === 23) {
          houses.set(`${String(id)}${dirName(dir)}`,
            { mean: sum / pos.count, deep: bad, of: pos.count })
        }
      }
    }
    expect(verts).toBe(89991)

    // 주인공 집(23)과 이웃집(22)의 뒤판. **여기가 화면에서 보이던 자리다** —
    // 앞벽에 붙으면 뒤판 뒤로 옆벽만 남아 면이 따로 노는 것으로 보인다
    const a = houses.get('22−Z')!
    const b = houses.get('23−Z')!
    // 붙어 있던 때: 22가 평균 2.24타일 안쪽에 150/150, 23이 3.07타일에 291/330
    expect(a.mean, `22−Z 평균 ${a.mean.toFixed(2)}타일 안쪽`).toBeLessThan(0.4)
    expect(b.mean, `23−Z 평균 ${b.mean.toFixed(2)}타일 안쪽`).toBeLessThan(0.3)
    expect(b.deep).toBe(0)
    expect(a.deep).toBeLessThan(a.of * 0.1)

    // 전수. 붙어 있던 때는 30,349개(33.7%)였다. 남는 것은 박공처럼 위로 갈수록
    // 좁아지는 자리라 **판이 안쪽에 있는 것이 맞는** 경우다
    expect(deep, `${String(deep)}/${String(verts)}이 반대편 벽에 붙었다`)
      .toBeLessThan(verts * 0.08)
    expect(deep).toBeGreaterThan(0)
  }, 30_000)


  /**
   * ⚠️ **눌러 붙인 앞벽이 제 UV를 들고 가면 문이 뒤에 찍힌다.**
   *
   * 주인공 집(23)은 뒤가 통째로 없어서 뒷판이 앞벽 삼각형으로 만들어진다. 그
   * 앞벽에 문(`t1_door1`, 서브메시 4)과 창이 있으니, 그대로 눌러 붙이면 뒤로
   * 돌아갔을 때 **문이 하나 더 있는 집**이 된다.
   *
   * 여기서는 그림칸을 서브메시마다 따로 주고 **뒷판의 UV가 어느 칸에 떨어지는지**
   * 센다. 문 칸에 한 점도 안 떨어져야 한다
   */
  it('뒷판에 앞문이 안 찍힌다 — 그림은 옆벽에서 온다', () => {
    const SHEET = 64
    const cell = (g: number) => ({ x: g * 8, y: 0, w: 8, h: 8, sheetW: SHEET, sheetH: 8 })
    for (const id of [22, 23, 236]) {
      const mesh = readProp(id, fmt)
      const marked: ShellPaint = {
        colors: mesh.materials.map(() => 0x8a7f6a),
        rects: mesh.materials.map((_, g) => cell(g)),
      }
      const door = mesh.materials.findIndex((m) => m.tex === 't1_door1')
      expect(door, `소품 ${String(id)}에 문이 있어야 이 시험에 뜻이 있다`).toBeGreaterThanOrEqual(0)

      const plate = facePlate(mesh, marked, 2, -1)!
      const uv = plate.getAttribute('uv') as BufferAttribute
      const inCell = new Map<number, number>()
      for (let i = 0; i < uv.count; i++) {
        const g = Math.floor(uv.getX(i) * SHEET / 8)
        inCell.set(g, (inCell.get(g) ?? 0) + 1)
      }
      // 문 칸은 비어 있다
      expect(inCell.get(door), `소품 ${String(id)} 뒷판에 문 그림`).toBeUndefined()
      // 그리고 뭔가는 들어 있어야 한다 — 전부 0이면 위 조건이 공허하다
      expect(uv.count).toBeGreaterThan(0)
    }
  })

  it('지붕은 제 그림을 지킨다 — 옆벽 그림을 지붕에 바르면 그게 더 틀렸다', () => {
    // 소품 23은 서브메시 3(`t1_s01_1`)의 54%가 위를 보는 지붕이다. 그 삼각형은
    // 눌러 붙여도 제 UV 그대로여야 한다
    const mesh = readProp(23, fmt)
    const SHEET = 64
    const marked: ShellPaint = {
      colors: mesh.materials.map(() => 0x8a7f6a),
      rects: mesh.materials.map((_, g) => ({ x: g * 8, y: 0, w: 8, h: 8, sheetW: SHEET, sheetH: 8 })),
    }
    // 위(+Y)에서 본 판 — 여기 들어가는 것은 지붕이다
    const plate = facePlate(mesh, marked, 1, 1)!
    const uv = plate.getAttribute('uv') as BufferAttribute
    const cells = new Set<number>()
    for (let i = 0; i < uv.count; i++) cells.add(Math.floor(uv.getX(i) * SHEET / 8))
    // 위를 보는 삼각형은 저마다 제 칸에 그대로 남는다 — 0(구운 그림자)·
    // 2(`t1_s01_2`의 위쪽 16%)·3(지붕)
    expect([...cells].sort((a, b) => a - b)).toEqual([0, 2, 3])
  })

  it('베껴 올 옆벽이 없으면 제 UV 그대로다', () => {
    // 삼각형 하나짜리는 옆벽이 없다 — 그때는 예전 그대로 눌러 붙인다
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 1,
    ]), 3))
    geo.setAttribute('uv', new BufferAttribute(new Float32Array([0.25, 0.5, 1, 0, 0.5, 1]), 2))
    geo.setIndex([0, 1, 2])
    const mesh: ChunkMesh = {
      geometry: geo,
      materials: [{ tex: 'w', pal: '', rep: 0, a: 31, f: 0 }],
      groups: [[0, 0, 3]],
    }
    const rect = { x: 0, y: 0, w: 8, h: 8, sheetW: 8, sheetH: 8 }
    const plate = facePlate(mesh, { colors: [0x808080], rects: [rect] }, 2, -1)!
    const uv = plate.getAttribute('uv') as BufferAttribute
    // 첫 꼭짓점의 u가 0.25 그대로 (반 픽셀 안으로 당긴 값)
    expect(uv.getX(0)).toBeCloseTo((0.5 + 0.25 * 7) / 8, 10)
  })

  it('모로 선 면은 판에 안 들어간다', () => {
    // 옆벽은 뒤에서 보면 선이라 실루엣에 아무것도 안 보탠다. 주인공 집은
    // 219개 중 109개가 그렇다 — 넣으면 삼각형만 버린다
    const mesh = readProp(23, fmt)
    const plate = facePlate(mesh, paint(mesh), 2, -1)!
    expect(triangles(mesh.geometry)).toHaveLength(219)
    expect(plate.getAttribute('position').count / 3).toBe(110)
  })

  it('투명한 데가 있는 그림도 판을 만든다 — 창 뚫린 벽이 그렇다', () => {
    // ⚠️ 한동안 "투명한 픽셀이 5%만 있어도 판을 안 만든다"였다. 울타리·간판을
    // 지키려던 잣대인데 **창이 뚫린 벽이 다 걸렸다.**
    //
    // 판 한 장짜리는 이 잣대 없이도 안 걸린다 — 어느 축으로 봐도 경계 상자가
    // 납작해서 `openDirections`가 아예 안 고른다. 그것도 여기서 확인한다
    const items = [{ tex: 'w', pal: '', x: 0, y: 0, w: 4, h: 4 }]
    // 넉 점 중 한 점이 투명하다 — 25%로, 옛 문턱(5%)을 훌쩍 넘는다
    const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(200)
    for (let i = 0; i < 4; i++) pixels[i * 4 + 3] = 0
    const sheet: TexSheet = { width: 4, height: 4, items, pixels }
    const material = { tex: 'w', pal: '', rep: 0, a: 31, f: 0 }

    // 두께가 있는 것 — ㄱ자로 꺾인 벽. 판이 나와야 한다
    const solid = new BufferGeometry()
    solid.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 0, 0, 2, 0, 0, 0, 2, 0, 2, 2, 0, 0, 0, 1, 0, 2, 1,
    ]), 3))
    solid.setAttribute('uv', new BufferAttribute(new Float32Array(12), 2))
    solid.setIndex([0, 1, 2, 1, 3, 2, 0, 2, 4, 2, 5, 4])
    const wall: ChunkMesh = { geometry: solid, materials: [material], groups: [[0, 0, 12]] }
    expect(shellColors(wall, sheet)[0]).not.toBeNull()
    expect(shellPlates(wall, shellPaint(wall, sheet))).not.toBeNull()

    // 판 한 장 — 어느 축에서도 안 고른다
    const card = new BufferGeometry()
    card.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 0, 0, 2, 0, 0, 0, 2, 0,
    ]), 3))
    card.setAttribute('uv', new BufferAttribute(new Float32Array(6), 2))
    card.setIndex([0, 1, 2])
    const sign: ChunkMesh = { geometry: card, materials: [material], groups: [[0, 0, 3]] }
    expect(openDirections(sign)).toEqual([])
    expect(shellPlates(sign, shellPaint(sign, sheet))).toBeNull()
  })

  it('방향이 둘 이상이어도 그림이 붙는다 — 합치면서 UV를 잃지 않는다', () => {
    // ⚠️ 합치는 자리에서 자리·법선·색만 옮기고 **UV를 안 옮겼다.** 방향 하나만
    // 뚫린 소품은 합칠 것이 없어 그대로 지나가니까 멀쩡했고, 둘 이상 뚫린 69종만
    // 아틀라스 (0,0) 한 픽셀로 칠해졌다 — 통짜 색 슬래브가 그것이다
    // 34번은 넉 방향이 뚫려 있다 — 두 방향 이상인 소품이 69종이고 그것들이
    // 전부 이 자리를 지난다
    const mesh = readProp(34, fmt)
    expect(openDirections(mesh).length, '이 소품이 두 방향 이상 뚫려 있어야 뜻이 있다').toBe(4)
    const rect = { x: 0, y: 0, w: 8, h: 8, sheetW: 64, sheetH: 8 }
    const plate = shellPlates(mesh, {
      colors: mesh.materials.map(() => 0x8a7f6a),
      rects: mesh.materials.map(() => rect),
    })!
    const uv = plate.getAttribute('uv') as BufferAttribute | undefined
    expect(uv, '합친 판에 UV가 없다').toBeDefined()
    expect(uv!.count).toBe(plate.getAttribute('position').count)
    // 한 점으로 뭉쳐 있으면 그림이 안 붙은 것과 같다
    const spread = new Set<number>()
    for (let i = 0; i < uv!.count; i++) spread.add(Math.round(uv!.getX(i) * 1000))
    expect(spread.size).toBeGreaterThan(1)
  })

  it('색은 그림의 평균이다 — 최빈값은 윤곽선을 집는다', () => {
    const items = [{ tex: 'w', pal: '', x: 0, y: 0, w: 4, h: 4 }]
    const pixels = new Uint8ClampedArray(4 * 4 * 4)
    const put = (i: number, r: number, g: number, b: number, a = 255) => {
      pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = a
    }
    for (let i = 0; i < 10; i++) put(i, 200, 180, 160)
    for (let i = 10; i < 16; i++) put(i, 40, 40, 40)
    const sheet: TexSheet = { width: 4, height: 4, items, pixels }
    const mesh: ChunkMesh = {
      geometry: new BufferGeometry(),
      materials: [{ tex: 'w', pal: '', rep: 0, a: 31, f: 0 }],
      groups: [[0, 0, 0]],
    }
    // 최빈값이면 10칸을 차지한 (200,180,160)이 나온다. 평균은 어두운 6칸이
    // 끌어내린 (140,128,115)이다 — 이 시험이 둘을 가른다
    expect(shellColors(mesh, sheet)[0])
      .toBe((140 << 16) | (128 << 8) | 115)
  })
})

describe('판에 입히는 그림', () => {
  /** 4×4 그림이 시트 (10,20)에 놓인 경우 */
  const rect = { x: 10, y: 20, w: 4, h: 4, sheetW: 64, sheetH: 32 }

  /** z가 0과 1인 삼각형 하나. UV는 넘겨받은 대로 */
  const oneTri = (uv: number[]): ChunkMesh => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 1,
    ]), 3))
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    geo.setIndex([0, 1, 2])
    return {
      geometry: geo,
      materials: [{ tex: 'w', pal: '', rep: 0, a: 31, f: 0 }],
      groups: [[0, 0, 3]],
    }
  }

  const uvOf = (mesh: ChunkMesh) => {
    const plate = facePlate(mesh, { colors: [0x808080], rects: [rect] }, 2, -1)!
    return Array.from((plate.getAttribute('uv') as BufferAttribute).array)
  }

  it('UV가 그 그림이 차지한 칸 안으로 들어간다', () => {
    // ⚠️ 아틀라스 한 장을 물리므로 칸 밖으로 새면 **이웃 그림이 벽에 나타난다**
    const out = uvOf(oneTri([0, 0, 1, 0, 0.5, 1]))
    expect(out).toHaveLength(6)
    for (let i = 0; i < out.length; i += 2) {
      expect(out[i]!).toBeGreaterThanOrEqual(rect.x / rect.sheetW)
      expect(out[i]!).toBeLessThanOrEqual((rect.x + rect.w) / rect.sheetW)
      expect(out[i + 1]!).toBeGreaterThanOrEqual(rect.y / rect.sheetH)
      expect(out[i + 1]!).toBeLessThanOrEqual((rect.y + rect.h) / rect.sheetH)
    }
  })

  it('가장자리에서 반 픽셀 안으로 당긴다 — 안 그러면 옆 그림이 한 줄 샌다', () => {
    const out = uvOf(oneTri([0, 0, 1, 0, 0.5, 1]))
    // u=0은 칸 왼쪽 끝이 아니라 반 픽셀 안쪽이다
    expect(out[0]!).toBeCloseTo((rect.x + 0.5) / rect.sheetW, 10)
  })

  it('반복하는 UV는 소수부만 남긴다 — 아틀라스에서는 되풀이를 못 한다', () => {
    const once = uvOf(oneTri([0.25, 0, 1, 0, 0.5, 1]))
    const thrice = uvOf(oneTri([3.25, 0, 1, 0, 0.5, 1]))
    expect(thrice[0]).toBeCloseTo(once[0]!, 10)
  })

  it('그림을 못 찾으면 UV가 0이다 — 평균색으로 떨어지는 자리다', () => {
    const plate = facePlate(oneTri([0.3, 0.7, 1, 0, 0.5, 1]), {
      colors: [0x808080], rects: [null],
    }, 2, -1)!
    expect(Array.from((plate.getAttribute('uv') as BufferAttribute).array)).toEqual(
      [0, 0, 0, 0, 0, 0],
    )
  })
})
