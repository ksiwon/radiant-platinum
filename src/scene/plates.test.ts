// 잎 걷어내기 검증 (DATA.md §2.2)
//
// 겁나는 것은 **지형을 지우는 것**이다. 나무와 경사로는 기울기도 크기도 겹쳐서,
// 모양만 보고 가르면 계단과 비탈이 같이 사라진다. 그래서 잣대를 텍스처의 투명
// 픽셀로 잡았고, 여기서 그 잣대가 실제로 갈라 주는지 확인한다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { BufferAttribute, BufferGeometry, CylinderGeometry, Vector3 } from 'three'
import {
  cellKey, cellX, cellZ, cutoutGroups, isFoliage, plateColors, splitFoliage,
} from './plates'
import {
  BARE, CULL_MARGIN, RADIUS_MIN, TREE_TOP, TRUNK,
  merge, nearScale, paint, treeAt, treeGeometry,
} from './Foliage'
import type { ChunkMesh, TexSheet } from './chunkMesh'

const DATA = resolve(__dirname, '../../public/data')
const present = existsSync(resolve(DATA, 'chunks/0.bin'))
const maybe = present ? describe : describe.skip
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

interface Fmt { posScale: number; vertexBytes: number; count: number }

/** 청크 파일 하나를 `ChunkMesh` 모양으로 읽는다. 브라우저의 `build`와 같은 규격이다 */
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

/** 텍스처 묶음 한 장. PNG를 안 풀고 **투명 비율만** 흉내 낸다 */
function fakeSheet(clear: number, items: TexSheet['items']): TexSheet {
  const width = 16
  const pixels = new Uint8ClampedArray(width * 16 * items.length * 4)
  for (const item of items) {
    for (let y = 0; y < item.h; y++) {
      for (let x = 0; x < item.w; x++) {
        const o = ((item.y + y) * width + item.x + x) * 4
        pixels[o] = 60; pixels[o + 1] = 140; pixels[o + 2] = 70
        pixels[o + 3] = y * item.w + x >= Math.round(item.w * item.h * clear) ? 255 : 0
      }
    }
  }
  return { width, height: 16 * items.length, items, pixels }
}

/** 판 하나짜리 메시. 잣대를 눈으로 못 보는 자리라 손으로 만든다 */
function oneQuad(tex: string): ChunkMesh {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 1, 0, 2, 1, 0, 2, 2, -1, 0, 2, -1,
  ]), 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  return {
    geometry,
    materials: [{ tex, pal: '', rep: 0, a: 31, f: 0 }],
    groups: [[0, 0, 6]],
  }
}

maybe('잎 걷어내기', () => {
  const fmt = read('chunks/index.json') as Fmt
  const all = (mesh: ChunkMesh) => mesh.materials.map(() => true)

  it('오려 낸 그림이 아니면 아무것도 안 뺀다', () => {
    const mesh = readChunk(0, fmt)
    const before = mesh.geometry.getIndex()!.count
    const split = splitFoliage(mesh, mesh.materials.map(() => false))
    expect(split.cells.size).toBe(0)
    expect(split.geometry.getIndex()!.count).toBe(before)
  })

  it('떡잎마을 청크에서 잎만 빠지고 땅은 남는다', () => {
    const mesh = readChunk(0, fmt)
    const split = splitFoliage(mesh, all(mesh))
    // 실측 — 삼각형 1628개 중 잎이 832개, 남는 땅이 796개다
    expect(mesh.geometry.getIndex()!.count / 3).toBe(1628)
    expect(split.geometry.getIndex()!.count / 3).toBe(796)
    // 잎이 덮은 칸 606개, 그중 나무가 서는 것이 144그루다
    expect(split.cells.size).toBe(606)
    expect([...split.cells].filter(([k, c]) => treeAt(k, c) !== null)).toHaveLength(144)

    // 그룹이 새 색인 버퍼를 **빈틈없이 이어서** 덮어야 한다. 시작 자리를 원본
    // 것으로 두면 삼각형이 엉뚱한 재질로 그려지는데, 개수만 세면 안 걸린다
    expect(split.groups.length).toBe(mesh.groups.length)
    let at = 0
    split.groups.forEach(([start, count]) => {
      expect(start).toBe(at)
      at += count
    })
    expect(at).toBe(split.geometry.getIndex()!.count)
  })

  it('그룹의 셋째 값은 재질 번호가 아니라 서브메시 번호다', () => {
    // three는 이 값으로 재질 **배열**을 색인하는데, 그 배열은 `chunkMesh.build`와
    // `materialsFor` 둘 다 서브메시 순서다. 롬의 재질 번호를 넣으면 땅이 나무
    // 그림으로 그려진다 — 실제로 그렇게 보였다
    const mesh = readChunk(0, fmt)
    // 청크 0은 서브메시 0이 재질 4다. 둘이 어긋나야 이 시험에 뜻이 있다
    expect(mesh.groups.some(([material], i) => material !== i)).toBe(true)
    const split = splitFoliage(mesh, all(mesh))
    split.groups.forEach(([, , group], i) => { expect(group).toBe(i) })
    // 지오메트리에 실제로 실린 값도 같아야 한다 (빈 그룹은 안 실린다)
    for (const g of split.geometry.groups) {
      expect(split.groups[g.materialIndex!]![0]).toBe(g.start)
    }
  })

  it('잎이 아닌 오려 낸 판은 안 뺀다 — 울타리는 그 자리에 남는다', () => {
    // `imped`(흰 울타리)는 나무와 똑같이 오려 낸 그림이고 기울기도 같다. 그래도
    // 입체 나무를 세울 것이 아니므로 지오메트리에 남아야 한다 — 빼 놓고 아무것도
    // 안 세우면 울타리가 통째로 사라진다
    const fence = oneQuad('imped')
    expect(isFoliage(fence, 0, [true])).toBe(false)
    expect(splitFoliage(fence, [true]).geometry.getIndex()!.count).toBe(6)

    const tree = oneQuad('tree01')
    expect(isFoliage(tree, 0, [true])).toBe(true)
    expect(splitFoliage(tree, [true]).geometry.getIndex()!.count).toBe(0)
  })

  it('딱 경계에서 끝나는 판이 다음 칸까지 물들이지 않는다', () => {
    // 원작 판은 정수 좌표에 딱 맞춰 놓여 있다. 경계를 그대로 `floor`하면 0~2를
    // 덮은 판이 칸 0·1·2 셋을 칠해서, 숲이 실제보다 한 줄씩 넓게 선다
    const mesh = oneQuad('tree01')
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute
    // x 0~2, z 0~2 — 정확히 두 칸씩
    pos.setXYZ(0, 0, 1, 0); pos.setXYZ(1, 2, 1, 0)
    pos.setXYZ(2, 2, 2, 2); pos.setXYZ(3, 0, 2, 2)
    const cells = splitFoliage(mesh, [true]).cells
    expect([...cells.keys()].map((k) => `${String(cellX(k))},${String(cellZ(k))}`).sort())
      .toEqual(['0,0', '0,1', '1,0', '1,1'])
  })

  it('투명 픽셀이 잣대다 — 지형 텍스처는 전부 0%라 안 걸린다', () => {
    const mesh = readChunk(0, fmt)
    const items = mesh.materials.map((m, i) => ({
      tex: m.tex ?? '', pal: m.pal ?? '', x: 0, y: i * 16, w: 16, h: 16,
    }))
    expect(cutoutGroups(mesh, fakeSheet(0, items)).some(Boolean)).toBe(false)
    expect(cutoutGroups(mesh, fakeSheet(0.4, items)).every(Boolean)).toBe(true)
    expect(cutoutGroups(mesh, null).some(Boolean)).toBe(false)
  })

  it('칸 열쇠가 음수 좌표까지 왕복한다', () => {
    for (const [x, z] of [[0, 0], [-16, 31], [47, -48], [-48, -48]]) {
      const k = cellKey(x!, z!)
      expect([cellX(k), cellZ(k)]).toEqual([x, z])
    }
  })

  it('나무는 STRIDE 간격의 칸에만 서고 칸 안에 선다', () => {
    const cell = { minY: 1, maxY: 4, group: 0 }
    // 두 칸 간격 — 짝수 칸만 대표로 선다
    expect(treeAt(cellKey(0, 0), cell)).not.toBeNull()
    expect(treeAt(cellKey(1, 0), cell)).toBeNull()
    expect(treeAt(cellKey(0, 1), cell)).toBeNull()
    expect(treeAt(cellKey(-2, -2), cell)).not.toBeNull()
    expect(treeAt(cellKey(-1, -2), cell)).toBeNull()

    const pos = new Vector3().setFromMatrixPosition(treeAt(cellKey(4, 6), cell)!)
    expect(pos.x).toBeGreaterThanOrEqual(4)
    expect(pos.x).toBeLessThanOrEqual(6)
    expect(pos.z).toBeGreaterThanOrEqual(6)
    expect(pos.z).toBeLessThanOrEqual(8)
  })

  it('색인 있는 조각을 합쳐도 삼각형이 그대로 남는다', () => {
    // ⚠️ 이것이 줄기가 화면에서 사라졌던 자리다. 색인을 안 풀고 정점만 이어
    // 붙이면 실린더 12정점이 연속 3개씩 묶여 **수평 조각 4개**가 된다
    const cyl = new CylinderGeometry(0.2, 0.3, 1, 5, 1, true)
    expect(cyl.getAttribute('position').count).toBe(12)
    expect(cyl.getIndex()!.count / 3).toBe(10)

    const out = merge([paint(cyl, 0x6b4a2a)])
    expect(out.getIndex()).toBeNull()
    expect(out.getAttribute('position').count / 3).toBe(10)
    // 색도 같이 따라와야 한다 — 정점 색이 색을 나른다
    expect(out.getAttribute('color').count).toBe(30)
  })

  it('줄기가 진짜 세로면으로 남는다 — 조각을 합치며 삼각형을 잃지 않는다', () => {
    // ⚠️ 이 시험이 있는 이유. `CylinderGeometry`는 정점 12개에 **색인 30개**
    // (삼각형 10개)다. 합칠 때 색인을 안 풀고 정점만 이어 붙이면 연속 3개씩
    // 묶여 삼각형 4개가 되는데, 그 넷이 전부 **수평**이고 각각 잎 속과 땅속에
    // 묻힌다. 그래서 화면에 줄기가 통째로 없었다 — 눈으로는 "안 보인다"까지만
    // 알 수 있어서 여기서 면의 개수와 방향을 직접 센다
    const geo = treeGeometry([0x60a050], 0x6b4a2a)
    const pos = geo.getAttribute('position') as BufferAttribute
    // 잎 80+20+20 · 줄기 6각 × 마디 3 × 2 = 36
    expect(pos.count / 3).toBe(156)

    // 줄기 축은 곧지 않고 조금씩 휘어 있다. 바깥쪽을 재려면 그 높이의 축을 알아야 한다
    const axis = (h: number): number => {
      for (let s = 0; s + 1 < TRUNK.length; s++) {
        const lo = TRUNK[s]!, hi = TRUNK[s + 1]!
        if (h > hi[0] + 1e-6) continue
        return lo[2] + (hi[2] - lo[2]) * ((h - lo[0]) / (hi[0] - lo[0]))
      }
      return TRUNK[TRUNK.length - 1]![2]
    }

    const a = new Vector3(), b = new Vector3(), c = new Vector3()
    const u = new Vector3(), v = new Vector3(), n = new Vector3(), mid = new Vector3()
    let trunk = 0, upright = 0, outward = 0, area = 0
    for (let t = 0; t < pos.count / 3; t++) {
      a.fromBufferAttribute(pos, t * 3)
      b.fromBufferAttribute(pos, t * 3 + 1)
      c.fromBufferAttribute(pos, t * 3 + 2)
      // 잎은 `BARE` 위에서 시작한다. 그 밑에 걸친 삼각형은 줄기뿐이다
      if (Math.min(a.y, b.y, c.y) >= BARE - 0.01) continue
      trunk++
      n.crossVectors(u.subVectors(b, a), v.subVectors(c, a))
      area += n.length() / 2
      n.normalize()
      // 세로면이면 법선이 눕는다. 예전 것은 넷 다 |ny|=1이었다
      if (Math.abs(n.y) < 0.9) upright++
      mid.addVectors(a, b).add(c).multiplyScalar(1 / 3)
      if (n.x * (mid.x - axis(mid.y)) + n.z * mid.z > 0) outward++
    }
    expect(trunk).toBe(36)
    expect(upright).toBe(36)
    // 그리고 **바깥을 봐야** 한다. 재질이 앞면만 그리므로 감는 방향이 뒤집히면
    // 면은 다 있는데 화면에는 통째로 없다 — 개수로는 안 걸리는 자리다
    expect(outward).toBe(36)
    // 넓이도 봐야 한다 — 면이 찌부러져 있으면 개수만으로는 안 걸린다.
    // 둘레 2π×0.16 × 높이 1.55 ≈ 1.5가 대충 맞는 자리다
    expect(area).toBeGreaterThan(0.8)
  })

  it('3인칭 26.6°에서 잎이 줄기를 다 가리지 않는다', () => {
    // 카메라가 플레이어 뒤 8·위 4라 시선이 1:2로 내려온다. 잎 겉면의 점 하나는
    // 줄기 축의 높이 `y − 0.5×가로거리`까지를 가린다 — 그 최솟값 밑이 화면에
    // 남는 줄기다. 나무는 Y축으로 아무렇게나 돌려 세우므로 방향은 안 고른다
    const geo = treeGeometry([0x60a050], 0x6b4a2a)
    const pos = geo.getAttribute('position') as BufferAttribute
    let hidden = Infinity
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < BARE - 0.01) continue // 줄기는 제 몸을 안 가린다
      hidden = Math.min(hidden, y - 0.5 * Math.hypot(pos.getX(i), pos.getZ(i)))
    }
    // 반지름 배수다. 제일 작은 나무에서도 0.7타일 넘게 남아야 눈에 들어온다
    expect(hidden).toBeGreaterThan(0.75)
    expect(hidden * RADIUS_MIN).toBeGreaterThan(0.7)
  })

  it('나무가 밑동으로 서고, 판이 두꺼울수록 크게 자란다', () => {
    // 자리값이 곧 밑동이다. 잎 한가운데를 원점으로 두면 줄기 길이가 타일 단위라
    // 반지름에 따라 나무가 제 줄기에서 떠오르거나 파묻힌다
    const shape = (c: { minY: number; maxY: number; group: number }) => {
      const m = treeAt(cellKey(4, 6), c)!
      const foot = new Vector3().setFromMatrixPosition(m).y
      const r = new Vector3().setFromMatrixScale(m).x
      return { foot, bare: BARE * r, top: foot + TREE_TOP * r, r }
    }
    // 홀로 선 나무: 원작 판 한 장이 세로 1.08타일이다
    const lone = shape({ minY: 1.06, maxY: 2.14, group: 0 })
    // 숲 벽: 판 넉 장이 쌓여 2.58타일이다
    const wall = shape({ minY: 1.06, maxY: 3.64, group: 0 })
    for (const t of [lone, wall]) {
      expect(t.foot).toBe(1.06)
      expect(t.bare).toBeGreaterThan(0.75)
    }
    // 두꺼운 더미가 더 크게 자라야 숲이 서로 닿아 벽이 된다
    expect(wall.r).toBeGreaterThan(lone.r + 0.1)
    // 그리고 나무는 자기가 대신하는 판 더미보다 낮으면 안 된다 — 낮으면 원작이
    // 가리던 곳이 뚫려 보인다
    expect(lone.top).toBeGreaterThan(2.14 - 0.2)
    expect(wall.top).toBeGreaterThan(3.64 - 0.2)
  })

  it('먼 나무는 값싼 모양으로 선다 — 다만 실루엣은 안 바꾼다', () => {
    // 그루당 156이면 짙은 숲에서 72만 삼각형이다(떡잎마을 일대 4,628그루 실측).
    // 30타일 밖에서는 세분과 줄기 단면이 안 읽히지만 **윤곽은 읽힌다** —
    // 덩이를 빼면 그 거리에서도 모양이 달라지는 것이 보인다
    const near = treeGeometry([0x60a050], 0x6b4a2a, false)
    const far = treeGeometry([0x60a050], 0x6b4a2a, true)
    expect(near.getAttribute('position').count / 3).toBe(156)
    expect(far.getAttribute('position').count / 3).toBe(66)
    // 값싼 것도 **폭과 높이는 같아야** 한다 — 다르면 LOD가 바뀌는 순간 튄다
    const span = (g: BufferGeometry) => {
      const p = g.getAttribute('position') as BufferAttribute
      let lo = Infinity, hi = -Infinity, wide = 0
      for (let i = 0; i < p.count; i++) {
        lo = Math.min(lo, p.getY(i)); hi = Math.max(hi, p.getY(i))
        wide = Math.max(wide, Math.hypot(p.getX(i), p.getZ(i)))
      }
      return { lo, hi, wide }
    }
    // 덩이 셋을 그대로 두므로 폭과 높이가 거의 같다 — 바뀌는 순간이 안 보인다
    const a = span(near), b = span(far)
    expect(Math.abs(b.hi - a.hi) / a.hi).toBeLessThan(0.03)
    expect(Math.abs(b.lo - a.lo)).toBeLessThan(0.03)
    expect(b.wide).toBeGreaterThan(a.wide * 0.95)
  })

  it('그림자가 지는 만큼은 화면 밖 나무도 남긴다', () => {
    // 태양 (24, 42, 18) → 수평 30 · 수직 42 → 고도 54.5°.
    // 제일 큰 나무가 TREE_TOP × RADIUS_MAX 높이이므로 그림자는 그 / tan(54.5°)다.
    // 컬링 여유가 그보다 짧으면 화면 가장자리에서 그림자가 툭툭 끊긴다
    const elevation = Math.atan2(42, Math.hypot(24, 18))
    const tallest = TREE_TOP * 1.52 // RADIUS_MAX + 흔들림
    const shadow = tallest / Math.tan(elevation)
    expect(shadow).toBeLessThan(CULL_MARGIN)
  })

  it('3인칭에서 카메라 코앞의 나무만 지운다', () => {
    // 3인칭 카메라는 플레이어에서 8.9타일 떨어져 있다 — 그 거리는 살아야
    // 플레이어 둘레가 안 지워진다
    expect(nearScale(0, true)).toBe(0)
    expect(nearScale(4, true)).toBe(0)
    expect(nearScale(8.9, true)).toBe(1)
    expect(nearScale(6.5, true)).toBeGreaterThan(0)
    expect(nearScale(6.5, true)).toBeLessThan(1)
    // 1인칭은 눈이 곧 플레이어다. 걸면 코앞의 나무가 통째로 사라진다
    expect(nearScale(0, false)).toBe(1)
  })

  it('같은 칸은 늘 같은 나무다 — 청크를 다시 세워도 안 흔들린다', () => {
    const cell = { minY: 1, maxY: 4, group: 0 }
    const a = treeAt(cellKey(8, 12), cell)!
    const b = treeAt(cellKey(8, 12), cell)!
    expect(a.elements).toEqual(b.elements)
    // 이웃과는 달라야 한다 — 다 같으면 흩어 놓은 뜻이 없다
    expect(treeAt(cellKey(10, 12), cell)!.elements).not.toEqual(a.elements)
  })

  it('색은 그림에서 제일 많이 쓰인 것으로 나오고 밝은 것이 앞에 온다', () => {
    // **어두운 잎을 더 많이** 둔다(8칸) — 세는 것만으로 고르면 어두운 것이 앞에
    // 오므로, 밝은 것이 앞에 오면 그것은 밝기로 다시 세운 것이다
    const items = [{ tex: 't', pal: '', x: 0, y: 0, w: 4, h: 4 }]
    const pixels = new Uint8ClampedArray(4 * 4 * 4)
    const put = (i: number, r: number, g: number, b: number) => {
      pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = 255
    }
    for (let i = 0; i < 8; i++) put(i, 30, 80, 40)
    for (let i = 8; i < 12; i++) put(i, 60, 150, 70)
    for (let i = 12; i < 16; i++) put(i, 120, 80, 40)
    const { leaf, trunk } = plateColors({ width: 4, height: 4, items, pixels }, items[0]!)
    expect(trunk).toBe((120 << 16) | (80 << 8) | 40)
    expect(leaf[0]).toBe((60 << 16) | (150 << 8) | 70)
    expect(leaf[1]).toBe((30 << 16) | (80 << 8) | 40)
  })
})
