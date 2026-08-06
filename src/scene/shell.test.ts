// 소품 뒷면 검증 (DATA.md §2.2)
//
// ⚠️ **넓이로 재면 속는다.** 한 번 그렇게 했다가 틀렸다 — 경계 고리를 부채꼴로
// 덮으면 면적 벡터가 0에 수렴하는데, 문틀·창틀을 덮고 정작 뒤는 뚫린 채로도
// 합이 맞는다. 렌더해 보고서야 알았다.
//
// 그래서 여기서는 **뒤에서 본 실루엣을 실제로 래스터라이즈한다.** 앞에서 보이는
// 칸은 뒤에서도 무언가로 막혀 있어야 한다. 이 잣대는 문틀을 덮는 것으로 못 속인다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import { backPlate, shellColors } from './shell'
import type { ChunkMesh, TexSheet } from './chunkMesh'

const DATA = resolve(__dirname, '../../public/data')
const present = existsSync(resolve(DATA, 'props/23.bin'))
const maybe = present ? describe : describe.skip

interface Fmt { posScale: number; vertexBytes: number }

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
  for (let i = 0; i < n; i++) {
    const o = head + i * fmt.vertexBytes
    for (let a = 0; a < 3; a++) position[i * 3 + a] = view.getInt16(o + a * 2, true) / fmt.posScale
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setIndex([...new Uint16Array(ab, head + n * fmt.vertexBytes, meta.indices)])
  return {
    geometry,
    materials: meta.submeshes.map(([mat]) => meta.materials[mat]!),
    groups: meta.submeshes,
  }
}

interface Tri { p: [number, number, number][]; nz: number }

function triangles(geo: BufferGeometry): Tri[] {
  const pos = geo.getAttribute('position') as BufferAttribute
  const idx = geo.getIndex()
  const n = idx ? idx.count : pos.count
  const at = (k: number) => (idx ? idx.getX(k) : k)
  const out: Tri[] = []
  for (let t = 0; t + 2 < n; t += 3) {
    const p = [0, 1, 2].map((j) => {
      const i = at(t + j)
      return [pos.getX(i), pos.getY(i), pos.getZ(i)] as [number, number, number]
    })
    // 화면 법선의 z 성분. 음수면 −Z를 본다 = 뒤에서 보인다
    const nz = (p[1]![0] - p[0]![0]) * (p[2]![1] - p[0]![1])
      - (p[2]![0] - p[0]![0]) * (p[1]![1] - p[0]![1])
    out.push({ p, nz })
  }
  return out
}

/**
 * XY 격자를 칠한다. `rear`면 −Z를 보는 면만 센다 — 뒤에서 실제로 보이는 것이다.
 *
 * 격자 48×48은 주인공 집(5.76×5.67타일)에서 한 칸이 0.12타일이라 창틀 하나도
 * 여러 칸에 걸린다
 */
function cover(tris: Tri[], box: number[][], N: number, rear: boolean): Set<number> {
  const hit = new Set<number>()
  const [[x0, x1], [y0, y1]] = box as [[number, number], [number, number]]
  for (const { p, nz } of tris) {
    // `backPlate`가 버리는 문턱과 같은 자리다 — 다르면 "덮을 것이 없다"와
    // "안 덮었다"가 갈리는 데서 어긋난다
    if (Math.abs(nz) < 2e-4) continue
    if (rear && nz > 0) continue
    const area = nz
    const lo = (a: number) => Math.min(p[0]![a], p[1]![a], p[2]![a])
    const hi = (a: number) => Math.max(p[0]![a], p[1]![a], p[2]![a])
    const cx0 = Math.max(0, Math.floor(((lo(0) - x0) / (x1 - x0)) * N))
    const cx1 = Math.min(N - 1, Math.ceil(((hi(0) - x0) / (x1 - x0)) * N))
    const cy0 = Math.max(0, Math.floor(((lo(1) - y0) / (y1 - y0)) * N))
    const cy1 = Math.min(N - 1, Math.ceil(((hi(1) - y0) / (y1 - y0)) * N))
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const x = x0 + ((cx + 0.5) / N) * (x1 - x0)
        const y = y0 + ((cy + 0.5) / N) * (y1 - y0)
        const w1 = ((x - p[0]![0]) * (p[2]![1] - p[0]![1])
          - (p[2]![0] - p[0]![0]) * (y - p[0]![1])) / area
        const w2 = ((p[1]![0] - p[0]![0]) * (y - p[0]![1])
          - (x - p[0]![0]) * (p[1]![1] - p[0]![1])) / area
        if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue
        hit.add(cy * N + cx)
      }
    }
  }
  return hit
}

function boxOf(tris: Tri[]): number[][] {
  return [0, 1].map((a) => [
    Math.min(...tris.flatMap((t) => t.p.map((q) => q[a]))),
    Math.max(...tris.flatMap((t) => t.p.map((q) => q[a]))),
  ])
}

maybe('소품 뒷면', () => {
  const fmt = JSON.parse(readFileSync(resolve(DATA, 'chunks/index.json'), 'utf8')) as Fmt
  const N = 48
  /** 텍스처를 안 읽으므로 색만 손으로 준다. 모양을 재는 시험이지 색을 재는 것이 아니다 */
  const paint = (mesh: ChunkMesh) => mesh.materials.map(() => 0x8a7f6a)

  it('원작 소품은 뒤를 보는 면이 하나도 없다', () => {
    // 이 시험이 있어야 아래 시험에 뜻이 있다 — 원래 뒤가 막혀 있었다면
    // 뒤판을 붙여도 통과할 테니까
    for (const id of [22, 23, 236]) {
      const tris = triangles(readProp(id, fmt).geometry)
      expect(tris.filter((t) => t.nz < 0), `소품 ${String(id)}`).toHaveLength(0)
    }
  })

  it('뒤판을 붙이면 앞에서 보이는 자리가 뒤에서도 다 막힌다', () => {
    for (const id of [22, 23, 236]) {
      const mesh = readProp(id, fmt)
      const front = triangles(mesh.geometry)
      const plate = backPlate(mesh, paint(mesh))
      expect(plate, `소품 ${String(id)} 뒤판`).not.toBeNull()
      const box = boxOf(front)

      const seen = cover(front, box, N, false)
      const rear = cover(triangles(plate!), box, N, true)
      const open = [...seen].filter((c) => !rear.has(c))
      // 뚫린 칸이 하나도 없어야 한다. 문틀만 덮고 뒤를 놔둔 예전 방식은
      // 여기서 실루엣의 대부분이 뚫린 채로 걸린다
      expect(open.length, `소품 ${String(id)}에 뒤가 뚫린 칸 ${String(open.length)}/${String(seen.size)}`).toBe(0)
      expect(seen.size).toBeGreaterThan(N * N * 0.3)
    }
  })

  it('소품 590개 전부에서 뒤가 막힌다', () => {
    // 집 몇 채만 보고 넘어가면 안 된다. 지난번에 접은 방식도 130종 중 75종에서는
    // 수치가 맞았다 — 전수로 재야 "대체로 된다"에 속지 않는다
    let props = 0, empty = 0, seen = 0, open = 0
    const worst: [number, number][] = []
    for (let id = 0; id < 600; id++) {
      if (!existsSync(resolve(DATA, `props/${String(id)}.bin`))) continue
      props++
      const mesh = readProp(id, fmt)
      const front = triangles(mesh.geometry)
      const plate = backPlate(mesh, paint(mesh))
      const box = boxOf(front)
      if (!plate) {
        // 뒤판을 안 만들어도 되는 사유는 **딱 둘**이고, 둘 다 "한 장짜리라
        // 만들 뒤가 없다"는 말이다. 그 밖의 이유로 비면 그건 못 덮은 것이다:
        //   ① 깊이 0 — 간판·그림자처럼 정면 한 장 (양면으로 그린다)
        //   ② 뒤에서 봐서 넓이 0 — 울타리처럼 옆을 보고 선 한 장
        const pos = mesh.geometry.getAttribute('position') as BufferAttribute
        let lo = Infinity, hi = -Infinity
        for (let i = 0; i < pos.count; i++) {
          lo = Math.min(lo, pos.getZ(i)); hi = Math.max(hi, pos.getZ(i))
        }
        const flat = hi - lo === 0
        const sideOn = cover(front, box, 32, false).size === 0
        expect(flat || sideOn, `소품 ${String(id)}는 뒤에서 보이는데 뒤판이 없다`).toBe(true)
        empty++
        continue
      }
      const f = cover(front, box, 32, false)
      const r = cover(triangles(plate), box, 32, true)
      const miss = [...f].filter((c) => !r.has(c)).length
      seen += f.size; open += miss
      if (miss > 0) worst.push([id, miss])
    }
    expect(props).toBe(590)
    // 뒤판이 안 나오는 것은 뒤에서 봐서 넓이가 0인 한 장짜리다 (위에서 확인한다)
    expect(empty).toBe(98)
    expect(open, `뚫린 칸 ${String(open)}/${String(seen)} · 소품 ${String(worst.length)}개: ${JSON.stringify(worst.slice(0, 10))}`).toBe(0)
  })

  it('뒤판은 본체 뒤에 얇게 붙는다 — 집이 두꺼워지지 않는다', () => {
    const mesh = readProp(23, fmt)
    const src = mesh.geometry.getAttribute('position') as BufferAttribute
    let minZ = Infinity
    for (let i = 0; i < src.count; i++) minZ = Math.min(minZ, src.getZ(i))
    const plate = backPlate(mesh, paint(mesh))!
    const pos = plate.getAttribute('position') as BufferAttribute
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < pos.count; i++) {
      lo = Math.min(lo, pos.getZ(i)); hi = Math.max(hi, pos.getZ(i))
    }
    // 뒤판 전체가 본체 뒤끝에서 0.02타일 안에 들어간다. 거울로 뒤집거나
    // 통째로 밀어 붙이면 집이 두 배로 깊어져 뒷길을 막는다.
    //
    // `hi`가 `minZ`에 딱 닿지는 않는다 — 제일 뒤에 있는 정점은 옆벽 것인데
    // 옆벽은 모로 서 있어서 뒤판에 안 들어간다
    expect(hi).toBeLessThanOrEqual(minZ)
    expect(hi).toBeGreaterThan(minZ - 0.02)
    expect(lo).toBeGreaterThanOrEqual(minZ - 0.02)
  })

  it('모로 선 면은 뒤판에 안 들어간다', () => {
    // 옆벽은 뒤에서 보면 선이라 실루엣에 아무것도 안 보탠다. 주인공 집은
    // 219개 중 109개가 그렇다 — 넣으면 삼각형만 버린다
    const mesh = readProp(23, fmt)
    const plate = backPlate(mesh, paint(mesh))!
    const all = triangles(mesh.geometry).length
    const kept = plate.getAttribute('position').count / 3
    expect(all).toBe(219)
    expect(kept).toBe(110)
  })

  it('오려 낸 그림은 뒤판을 안 만든다', () => {
    // 판 한 장짜리 울타리·간판을 눌러 붙이면 없던 널판이 생긴다.
    // **그림이 있는데도** 안 만들어야 뜻이 있다 — 그림이 없으면 어차피 안 만든다
    const items = [{ tex: 'w', pal: '', x: 0, y: 0, w: 2, h: 2 }]
    const pixels = new Uint8ClampedArray(2 * 2 * 4).fill(200)
    const sheet: TexSheet = { width: 2, height: 2, items, pixels }
    const geometry = new BufferGeometry()
    // 깊이가 있고 뒤에서 봐서 넓이도 있는 삼각형 하나
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 0, 0, 2, 0, 0, 0, 2, 1,
    ]), 3))
    geometry.setIndex([0, 1, 2])
    const mesh: ChunkMesh = {
      geometry,
      materials: [{ tex: 'w', pal: '', rep: 0, a: 31, f: 0 }],
      groups: [[0, 0, 3]],
    }
    expect(shellColors(mesh, sheet, [false])[0]).not.toBeNull()
    expect(backPlate(mesh, shellColors(mesh, sheet, [false]))).not.toBeNull()
    // 같은 그림, 같은 모양 — 오려 낸 것으로 표시된 것만 다르다
    expect(shellColors(mesh, sheet, [true])[0]).toBeNull()
    expect(backPlate(mesh, shellColors(mesh, sheet, [true]))).toBeNull()
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
    expect(shellColors(mesh, sheet, [false])[0])
      .toBe((140 << 16) | (128 << 8) | 115)
  })
})
