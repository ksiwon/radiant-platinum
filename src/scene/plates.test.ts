// 잎 걷어내기 검증 (DATA.md §2.2)
//
// 겁나는 것은 **지형을 지우는 것**이다. 나무와 경사로는 기울기도 크기도 겹쳐서,
// 모양만 보고 가르면 계단과 비탈이 같이 사라진다. 그래서 잣대를 텍스처의 투명
// 픽셀로 잡았고, 여기서 그 잣대가 실제로 갈라 주는지 확인한다.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  BufferAttribute, BufferGeometry, CylinderGeometry, MultiplyBlending, Vector3,
} from 'three'
import {
  canBorrowFloor, cellKey, cellX, cellZ, cutoutGroups, floorPatch, floorSource, groundArea,
  groundRank, isBakedShadow, isFoliage,
  leaning, LEVEL_SLACK, pickGround, plateColors, shiftFloors, splitFoliage, treeSites, trunkNudge,
  tuftTextures,
  type FloorSource, type FloorTri, type GroundKind, type Split,
} from './plates'
import {
  BARE, CONTACT_DARK, CROWN_REACH, CULL_MARGIN, RADIUS_MIN, TREE_TOP, TRUNK, TRUNK_R,
  crownGeometry, trunkGeometry,
  contactGeometry, contactMaterial, contactTexture, merge, nearScale, paint, treeAt,
  treeGeometry,
} from './Foliage'
import type { ChunkMesh, TexSheet } from './chunkMesh'
import { heightField, heightInChunk, type HeightData } from '../engine/map/height'
import { MapGrid, type MatrixMeta } from '../engine/map/grid'
import { withData } from '../data/romData.testkit'

const DATA = resolve(__dirname, '../../public/data')
const maybe = withData('chunks/0.bin')
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

/** `bdhc.json` + `bdhc.bin`. 좌표는 int32×4가 먼저, 평면 색인 u16이 뒤다 */
function loadHeight(): HeightData {
  const json = read('bdhc.json') as {
    plateCount: number
    planes: [number, number, number, number][]
    chunks: [number, number][]
    fixedPerTile: number
  }
  const buf = readFileSync(resolve(DATA, 'bdhc.bin'))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  return {
    planes: json.planes,
    chunks: json.chunks,
    coords: new Int32Array(ab, 0, json.plateCount * 4),
    refs: new Uint16Array(ab, json.plateCount * 16, json.plateCount),
    fixedPerTile: json.fixedPerTile,
  }
}

maybe('잎 걷어내기', () => {
  const fmt = read('chunks/index.json') as Fmt
  const all = (mesh: ChunkMesh) => mesh.materials.map(() => true)

  it('오려 낸 그림이 아니면 잎도 자리도 안 뺀다 — 구운 그림자만 빠진다', () => {
    const mesh = readChunk(0, fmt)
    const before = mesh.geometry.getIndex()!.count
    const split = splitFoliage(mesh, mesh.materials.map(() => false))
    expect(split.cells.size).toBe(0)
    // 청크 0의 `tshadow` 삼각형 58개는 오려 낸 그림 여부와 상관없이 빠진다
    expect(before - split.geometry.getIndex()!.count).toBe(58 * 3)
  })

  it('원작이 구워 둔 나무 그림자를 걷어낸다', () => {
    // 원작은 나무가 판때기라 그림자를 못 그려서 땅에 동그란 그림을 깔았다.
    // 우리 입체 나무는 진짜 그림자를 던지므로, 남겨 두면 나무 크기와 상관없는
    // **똑같은 동그라미**가 하나 더 깔린다
    const shadow = oneQuad('tshadow')
    expect(isBakedShadow(shadow, 0)).toBe(true)
    expect(splitFoliage(shadow, [true]).geometry.getIndex()!.count).toBe(0)
    // 자리는 안 센다 — 여기 나무를 세우는 것이 아니다
    expect(splitFoliage(shadow, [true]).cells.size).toBe(0)
    // 이름이 비슷한 다른 그림자는 안 건드린다
    expect(isBakedShadow(oneQuad('shadowchip'), 0)).toBe(false)
  })

  it('떡잎마을 청크에서 잎만 빠지고 땅은 남는다', () => {
    const mesh = readChunk(0, fmt)
    const split = splitFoliage(mesh, all(mesh))
    // 실측 — 삼각형 1628개 중 잎이 832개 · 구운 그림자가 58개, 남는 땅이 738개다
    expect(mesh.geometry.getIndex()!.count / 3).toBe(1628)
    expect(split.geometry.getIndex()!.count / 3).toBe(738)
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

  it('원작이 땅을 안 만든 숲 바닥을 둘레 지형의 타일로 메운다', () => {
    // ⚠️ **원작 숲에는 바닥이 없다.** 떡잎마을 청크에서 나무 144그루 중 밑에
    // 지형 삼각형이 있는 것이 33그루뿐이다 — 고정 카메라에서 잎에 가려 보일
    // 일이 없어 안 만든 것이다. 판때기를 걷어내면 그 자리가 그대로 뚫린다.
    //
    // ⚠️ **잎 그림으로 메우면 안 된다.** 원작의 평평한 잎 판을 남겨 봤더니 그건
    // 바닥이 아니라 위에서 내려다본 우듬지라, 나무마다 밑에 검푸른 원반이 깔렸다.
    // 메울 것은 **옆 타일**이고, 그래서 서브메시와 UV 평면을 그대로 이어 쓴다
    const geometry = new BufferGeometry()
    // 칸 (0,0)에 지형 한 장(서브메시 1), 칸 (1,0)에는 잎만
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([
      // 잎 판 — 칸 (1,0)을 덮는다
      1, 2, 0, 2, 2, 0, 2, 3, 1, 1, 3, 1,
      // 지형 — 칸 (0,0)
      0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1,
    ]), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1,
      // 지형 UV는 좌표를 그대로 따른다 — 메운 판이 이 평면을 이어야 한다
      0, 0, 1, 0, 1, 1, 0, 1,
    ]), 2))
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
    const mesh: ChunkMesh = {
      geometry,
      materials: [
        { tex: 'tree01', pal: '', rep: 0, a: 31, f: 0 },
        { tex: 'ngrass', pal: '', rep: 0, a: 31, f: 0 },
      ],
      groups: [[0, 0, 6], [1, 6, 6]],
    }
    const split = splitFoliage(mesh, [true, false])
    // 잎이 덮은 칸은 (1,0) 하나고 지형은 (0,0)에만 있다
    expect([...split.cells.keys()]).toEqual([cellKey(1, 0)])

    const patch = floorPatch(split, () => 1)!
    // 삼각형 둘 — 안 덮인 칸 하나
    expect(patch.geometry.getAttribute('position').count / 3).toBe(2)
    // **지형 서브메시로** 들어가야 한다. 잎 서브메시로 넣으면 나무 그림이 깔린다
    expect(patch.groups.map(([, , g]) => g)).toEqual([1])

    // ⚠️ **평면을 늘리는 대신 그 칸으로 되접는다.**
    //
    // 늘린 UV는 그림 조각 밖으로 나간다. 안 물리는 그림에서는 가장자리 텍셀로
    // 눌려 민무늬 판이 깔리고, 물리는 그림에서도 원작 바닥 그림 한 장이
    // **여러 벌을 모아 둔 한 장**이라 칸마다 다른 벌을 집는다.
    //
    // 여기서는 (1,0)이 (0,0)에서 베껴 오므로 u가 한 칸 뒤로 접힌다
    const p = patch.geometry.getAttribute('position') as BufferAttribute
    const u = patch.geometry.getAttribute('uv') as BufferAttribute
    for (let i = 0; i < p.count; i++) {
      expect(u.getX(i)).toBeCloseTo(p.getX(i) - 1, 5)
      expect(u.getY(i)).toBeCloseTo(p.getZ(i), 5)
      // 되접은 값은 그 타일 안에 든다. 늘린 값은 1을 넘어 있었다
      expect(u.getX(i)).toBeLessThanOrEqual(1.02)
    }
    // 높이는 지면이 정한다
    expect(p.getY(0)).toBeCloseTo(1, 6)
    // 높이 자료가 없는 칸도 **비워 두지 않는다** — 베껴 온 타일이 서 있는
    // 높이로 깐다. 오버월드에 그런 칸이 943개 있고, 건너뛰면 그대로 뚫린다
    const noHeight = floorPatch(split, () => null)!
    expect(noHeight.geometry.getAttribute('position').count / 3).toBe(2)
    expect((noHeight.geometry.getAttribute('position') as BufferAttribute).getY(0)).toBeCloseTo(1, 6)
  })

  it('메운 판이 위를 보게 감긴다 — 아니면 위에서 볼 때 통째로 사라진다', () => {
    // ⚠️ **법선 배열만 +Y로 채워 놓고 감는 방향은 아래였다.** three는 재질이
    // 단면(`FrontSide`)일 때 **감는 방향으로** 앞뒤를 가리므로, 지형 재질을
    // 그대로 쓰는 이 판이 위에서 볼 때 전부 컬링됐다 — 숲 바닥이 뻥 뚫려
    // 하늘이 보이던 것이 이것이다. 법선 배열은 빛에만 쓰여서 눈치채기 어려웠다.
    //
    // 잣대는 우리가 정하지 않는다. 원작 바닥 삼각형 123,733개 중 **123,531개가
    // 법선이 위**다(아래는 202개). 그쪽에 맞춘다
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([
      1, 2, 0, 2, 2, 0, 2, 3, 1, 1, 3, 1,
      0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1,
    ]), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1,
    ]), 2))
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
    const mesh: ChunkMesh = {
      geometry,
      materials: [
        { tex: 'tree01', pal: '', rep: 0, a: 31, f: 0 },
        { tex: 'ngrass', pal: '', rep: 0, a: 31, f: 0 },
      ],
      groups: [[0, 0, 6], [1, 6, 6]],
    }
    const patch = floorPatch(splitFoliage(mesh, [true, false]), () => 1)!
    const p = patch.geometry.getAttribute('position') as BufferAttribute
    expect(p.count / 3).toBe(2)
    for (let t = 0; t < p.count; t += 3) {
      const ux = p.getX(t + 1) - p.getX(t), uz = p.getZ(t + 1) - p.getZ(t)
      const vx = p.getX(t + 2) - p.getX(t), vz = p.getZ(t + 2) - p.getZ(t)
      // 법선의 y 성분. 오른손 좌표계에서 (u × v)_y = u_z·v_x − u_x·v_z 다
      expect(uz * vx - ux * vz, `삼각형 ${String(t / 3)}이 아래를 본다`).toBeGreaterThan(0)
    }
    // 빛에 쓰는 법선도 같은 쪽이어야 한다 — 둘이 어긋나면 앞뒤가 따로 논다
    const n = patch.geometry.getAttribute('normal') as BufferAttribute
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBe(1)
  })

  it('아랫단이 지나갈 뿐인 칸은 덮인 것이 아니다 — 하늘이 비친다', () => {
    // ⚠️ 원작 지형은 층이 겹친다. 한 칸 밑으로 아랫단 잔디(y=0)가 지나가고
    // 걸어 다니는 층(y=1)에는 아무것도 없는 자리가 오버월드에만 2,842칸이다.
    // "어떤 면이든 덮였으면 됐다"로 세면 그 칸이 그대로 뚫리고, 영원의 숲
    // 길가에서 **땅 사이로 하늘이 비쳤다**
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([
      // 잎 판 — 칸 (1,0)을 y=1 언저리에서 덮는다
      1, 1.5, 0, 2, 1.5, 0, 2, 1.5, 1, 1, 1.5, 1,
      // 지형 — 칸 (0,0)과 (1,0)에 걸쳐 **y=0**으로 깔린 아랫단
      0, 0, 0, 2, 0, 0, 2, 0, 1, 0, 0, 1,
      // 지형 — 칸 (0,0)에만 y=1로 깔린 윗단. 여기서 UV를 베껴 온다
      0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1,
    ]), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1,
    ]), 2))
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11])
    const mesh: ChunkMesh = {
      geometry,
      materials: [
        { tex: 'tree01', pal: '', rep: 0, a: 31, f: 0 },
        { tex: 'ngrass', pal: '', rep: 0, a: 31, f: 0 },
        { tex: 'ngrass', pal: '', rep: 0, a: 31, f: 0 },
      ],
      groups: [[0, 0, 6], [1, 6, 6], [2, 12, 6]],
    }
    // 걸어 다니는 높이가 1이다. 칸 (1,0)에는 y=0짜리만 있으므로 메워야 한다
    const split = splitFoliage(mesh, [true, false, false])
    // 여기 잎 판은 **평평하다** — 곧 원작이 그 칸에 깔아 둔 나무 바닥 타일이다
    const patch = floorPatch(split, () => 1)!
    const p = patch.geometry.getAttribute('position') as BufferAttribute
    expect(p.count / 3, '삼각형 둘 = 칸 하나').toBe(2)
    expect(p.getX(0)).toBeCloseTo(1, 1)
    expect(p.getY(0), '윗단 높이에 깐다').toBe(1)

    // 그 칸에 윗단이 이미 있으면 **바닥은** 안 깐다. 다만 윗단(y=1)과
    // 아랫단(y=0) 사이의 턱에는 옆면이 선다 — 그건 바닥이 아니라 벽이다
    const covered = floorPatch(splitFoliage(mesh, [true, false, false]), () => 0)!
    const n = covered.geometry.getAttribute('normal') as BufferAttribute
    const laid = [...Array(n.count).keys()].filter((i) => n.getY(i) !== 0)
    expect(laid, '아랫단 높이로 걸으면 아랫단이 곧 그 층이다 — 깔 바닥이 없다').toEqual([])
  })

  it('덮인 칸에는 안 깐다 — 원작 지형과 겹치면 깜빡인다', () => {
    const mesh = oneQuad('tree01')
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute
    // 평평한 잎 판이 칸 (0,0)만 덮는다. 지형 삼각형은 하나도 없다
    pos.setXYZ(0, 0, 1, 0); pos.setXYZ(1, 1, 1, 0)
    pos.setXYZ(2, 1, 1, 1); pos.setXYZ(3, 0, 1, 1)
    // 바닥 삼각형이 아예 없으면 이어 쓸 타일이 없다 — 아무것도 안 깐다
    expect(floorPatch(splitFoliage(mesh, [true]), () => 1)).toBeNull()
  })

  it('누워 있는 울타리를 세운다 — 나무만 판때기인 것이 아니다', () => {
    // ⚠️ 원작은 고정 3/4 카메라를 보고 그린 것이라 울타리도 **45°로 눕혀**
    // 놓았다. 오버월드 `imped` 삼각형 2,854개의 눕은 각이 p05·중앙값 둘 다
    // 정확히 45.0°다 — 우연이 아니라 규칙이고, 우리 카메라로 보면 널판이
    // 비스듬히 쓰러져 있다.
    const mesh = oneQuad('imped')
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute
    // z 0→1로 1타일 나가면서 y 1→2로 1타일 오르는 45° 판
    pos.setXYZ(0, 0, 1, 0); pos.setXYZ(1, 1, 1, 0)
    pos.setXYZ(2, 1, 2, 1); pos.setXYZ(3, 0, 2, 1)

    const out = splitFoliage(mesh, [true]).geometry.getAttribute('position') as BufferAttribute
    // 아래 모서리는 제자리다 — 축이 거기다
    expect([out.getX(0), out.getY(0), out.getZ(0)]).toEqual([0, 1, 0])
    // 윗변이 아래 모서리 바로 위로 온다. z가 안 나가고, 높이는 판 길이 √2다
    for (const i of [2, 3]) {
      expect(out.getZ(i), `정점 ${String(i)} z`).toBeCloseTo(0, 6)
      expect(out.getY(i), `정점 ${String(i)} y`).toBeCloseTo(1 + Math.SQRT2, 6)
    }
    // 가로 폭은 그대로다 — 축을 따라서는 안 움직인다
    expect(out.getX(2)).toBeCloseTo(1, 6)

    // 오려 낸 그림이 아니면 안 건드린다. 45° 비탈은 지형이지 판때기가 아니다
    const slope = splitFoliage(mesh, [false]).geometry.getAttribute('position') as BufferAttribute
    expect(slope.getZ(2)).toBe(1)
    expect(slope.getY(2)).toBe(2)
  })

  it('원작이 눕혀 둔 각이 아니면 안 세운다 — 지형까지 일으켜 세웠다', () => {
    // ⚠️ 예전에는 기울기 0.20~0.97을 전부 세웠다. 그래서 **지형이 일어섰다**:
    // 청크 632개 실측으로 바닷가 거품(`seaside3`) 7,450삼각형과 천장 구멍
    // (`dun_dhole`, 48.0°)과 빛기둥(`dun_light`)이 벽처럼 섰고, 천관산에서는
    // 그 구멍 판이 흰 판때기로 공중에 떠 있었다.
    //
    // 원작이 속임수로 눕혀 둔 것은 **정확히 45.0°**다 — `imped` 2,920삼각형과
    // `dun_imped` 2,330삼각형이 전부 그 각이고, 거품에는 45°가 하나도 없다
    expect(leaning(Math.sin((45 * Math.PI) / 180)), '45°').toBe(true)
    expect(leaning(Math.sin(Math.atan(2))), '63.4°').toBe(true)
    expect(leaning(Math.sin((15.9 * Math.PI) / 180)), '거품 15.9°').toBe(false)
    expect(leaning(Math.sin((48 * Math.PI) / 180)), '천장 구멍 48°').toBe(false)
    expect(leaning(Math.sin((80.5 * Math.PI) / 180)), '거품 80.5°').toBe(false)
    expect(leaning(0), '이미 선 판').toBe(false)
    expect(leaning(1), '땅에 깔린 판').toBe(false)

    // 48°짜리 판은 제자리에 그대로 있어야 한다
    const hole = oneQuad('dun_dhole')
    const h = hole.geometry.getAttribute('position') as BufferAttribute
    const tan48 = Math.tan(((90 - 48) * Math.PI) / 180)
    h.setXYZ(0, 0, 1, 0); h.setXYZ(1, 1, 1, 0)
    h.setXYZ(2, 1, 1 + tan48, 1); h.setXYZ(3, 0, 1 + tan48, 1)
    const out = splitFoliage(hole, [true]).geometry.getAttribute('position') as BufferAttribute
    expect(out.getZ(2), '48° 판은 안 세운다').toBeCloseTo(1, 6)
  })

  it('이미 선 판과 땅에 깔린 판은 안 건드린다', () => {
    // 원작에는 세 가지가 다 있다: 선 것(0°) · 누운 것(45°·63.4°) · 깔린 것(90°)
    const upright = oneQuad('imped')
    const u = upright.geometry.getAttribute('position') as BufferAttribute
    u.setXYZ(0, 0, 1, 0); u.setXYZ(1, 1, 1, 0)
    u.setXYZ(2, 1, 2, 0); u.setXYZ(3, 0, 2, 0)
    const a = splitFoliage(upright, [true]).geometry.getAttribute('position') as BufferAttribute
    expect([a.getY(2), a.getZ(2)]).toEqual([2, 0])

    const flat = oneQuad('imped')
    const f = flat.geometry.getAttribute('position') as BufferAttribute
    f.setXYZ(0, 0, 1, 0); f.setXYZ(1, 1, 1, 0)
    f.setXYZ(2, 1, 1, 1); f.setXYZ(3, 0, 1, 1)
    const b = splitFoliage(flat, [true]).geometry.getAttribute('position') as BufferAttribute
    expect([b.getY(2), b.getZ(2)]).toEqual([1, 1])
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
    // 잎 80+20×5=180 · 줄기 6각 × 마디 4 × 2 = 48 · 가지 3 × 4각 × 2 = 24
    expect(treeGeometry([0x60a050], 0x6b4a2a).getAttribute('position').count / 3).toBe(252)

    // 줄기만 따로 잰다. 가로가 `TRUNK_R` 배수라 나무와 단위가 다르다
    const geo = trunkGeometry(0x6b4a2a)
    const pos = geo.getAttribute('position') as BufferAttribute
    expect(pos.count / 3, '줄기 48 + 가지 24').toBe(72)

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
    let upright = 0, outward = 0, area = 0
    // 가지는 축이 따로라 여기서 빼고, 줄기 몸통 48개만 본다
    for (let t = 0; t < 48; t++) {
      a.fromBufferAttribute(pos, t * 3)
      b.fromBufferAttribute(pos, t * 3 + 1)
      c.fromBufferAttribute(pos, t * 3 + 2)
      n.crossVectors(u.subVectors(b, a), v.subVectors(c, a))
      area += n.length() / 2
      n.normalize()
      // 세로면이면 법선이 눕는다. 예전 것은 넷 다 |ny|=1이었다
      if (Math.abs(n.y) < 0.9) upright++
      mid.addVectors(a, b).add(c).multiplyScalar(1 / 3)
      if (n.x * (mid.x - axis(mid.y)) + n.z * mid.z > 0) outward++
    }
    expect(upright).toBe(48)
    // 그리고 **바깥을 봐야** 한다. 재질이 앞면만 그리므로 감는 방향이 뒤집히면
    // 면은 다 있는데 화면에는 통째로 없다 — 개수로는 안 걸리는 자리다
    expect(outward).toBe(48)
    // 넓이도 봐야 한다 — 면이 찌부러져 있으면 개수만으로는 안 걸린다.
    // 둘레 2π×0.6 × 높이 1.82 ≈ 6.9가 대충 맞는 자리다 (`TRUNK_R` 배수)
    expect(area).toBeGreaterThan(4)

    // ⚠️ **법선을 다시 세면 안 된다.** 색인이 없으므로 그것이 곧 면 법선이라,
    // 여섯 면짜리 줄기가 널판 여섯 장으로 갈려 보인다. 옆으로 뻗은 값이
    // 그대로 실려 와야 한다
    const nrm = geo.getAttribute('normal') as BufferAttribute
    for (let i = 0; i < 48 * 3; i++) expect(Math.abs(nrm.getY(i))).toBeLessThan(1e-6)
  })

  it('잎 덩이의 법선이 공의 것이다 — 면 법선이면 주사위가 된다', () => {
    // ⚠️ 사용자가 "폴리곤 느낌"이라고 한 것의 절반이 이것이다. 정이십면체를
    // 면 법선으로 그리면 20개의 평면이 또렷이 갈려 보인다. 법선만 중심에서
    // 뻗은 방향으로 바꾸면 같은 삼각형 수로 빛이 공처럼 흐르고, 각진 것은
    // 윤곽에만 남는다 — 세분을 올리는 것과 값이 다르다
    const geo = crownGeometry([0x60a050, 0x2f6b34])
    const pos = geo.getAttribute('position') as BufferAttribute
    const nrm = geo.getAttribute('normal') as BufferAttribute
    expect(pos.count / 3, '80 + 20×5').toBe(180)

    // 같은 삼각형의 세 정점이 **서로 다른** 법선을 가져야 매끄럽다.
    // 면 법선이면 셋이 똑같다
    let varied = 0
    for (let t = 0; t < pos.count / 3; t++) {
      const a = new Vector3().fromBufferAttribute(nrm, t * 3)
      const b = new Vector3().fromBufferAttribute(nrm, t * 3 + 1)
      if (a.distanceTo(b) > 1e-3) varied++
    }
    expect(varied).toBe(pos.count / 3)
    // 그리고 전부 단위 벡터여야 한다 — 길이가 흐트러지면 밝기가 튄다
    for (let i = 0; i < nrm.count; i++) {
      expect(new Vector3().fromBufferAttribute(nrm, i).length()).toBeCloseTo(1, 5)
    }

    // 색은 위아래로 갈린다. 원작 색 둘 사이를 잇는 것뿐이라 새 색은 안 만든다
    const col = geo.getAttribute('color') as BufferAttribute
    let lowest = 0, highest = 0
    for (let i = 1; i < pos.count; i++) {
      if (pos.getY(i) < pos.getY(lowest)) lowest = i
      if (pos.getY(i) > pos.getY(highest)) highest = i
    }
    expect(col.getY(highest), '꼭대기가 밑보다 밝다').toBeGreaterThan(col.getY(lowest))
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
    // 짙은 숲에 창 하나당 4,628그루가 선다(떡잎마을 일대 실측). 30타일 밖에서는
    // 덩이 하나하나의 면 수가 안 읽히지만 **윤곽은 읽힌다** — 덩이를 빼면
    // 그 거리에서도 모양이 달라지는 것이 보인다. 그래서 덩이는 여섯 그대로
    // 두고 20면짜리를 8면짜리로 바꾼다
    const near = treeGeometry([0x60a050], 0x6b4a2a, false)
    const far = treeGeometry([0x60a050], 0x6b4a2a, true)
    expect(near.getAttribute('position').count / 3).toBe(252)
    // 잎 8×6 = 48 · 줄기 4각 × 마디 1 × 2 = 8. 예전 먼 나무(66)보다 싸다
    expect(far.getAttribute('position').count / 3).toBe(56)
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

  it('밑동의 접지 그림자가 사각형으로 안 보인다', () => {
    // 태양이 고도 54.5°라 우듬지 그림자는 밑동에서 1.6r **옆에** 진다 — 그림자
    // 맵으로는 발밑이 절대 안 어두워진다. 그 자리를 채우는 것이 이 판인데,
    // 곱하기로 섞으므로 **가장자리 값이 정확히 1이 아니면 사각형이 드러난다**
    const tex = contactTexture()
    const px = tex.image.data as Uint8Array
    const N = tex.image.width
    const at = (x: number, y: number) => px[(y * N + x) * 4]!
    // 네 귀퉁이는 원 밖이라 그대로여야 한다
    for (const [x, y] of [[0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1]]) {
      expect(at(x!, y!)).toBe(255)
    }
    // 변의 한가운데도 원의 접점이라 그대로다
    expect(at(N / 2, 0)).toBe(255)
    // 한가운데가 제일 어둡고 `CONTACT_DARK`만큼 깎인다. 딱 그 값은 아니다 —
    // 칸 한가운데를 찍으므로 원점에서 반 텍셀 벗어나 있다
    const dark = Math.round(255 * (1 - CONTACT_DARK))
    expect(at(N / 2, N / 2)).toBe(Math.min(...px.filter((_, i) => i % 4 === 0)))
    expect(at(N / 2, N / 2) - dark).toBeLessThan(6)
    // 그리고 가운데에서 밖으로 **단조롭게** 풀린다 — 안 그러면 테가 생긴다
    for (let x = N / 2; x + 1 < N; x++) expect(at(x + 1, N / 2)).toBeGreaterThanOrEqual(at(x, N / 2))

    // ⚠️ **곱하기 혼합은 프리멀티플라이드여야 한다.** 아니면 three의 WebGPU
    // 파이프라인이 "Invalid blending"으로 떨어뜨려서, 판은 그려지는데 화면에는
    // 아무 변화가 없다(`WebGPUPipelineUtils` 574줄). 실제로 그렇게 한 판 날렸다
    const mat = contactMaterial()
    expect(mat.blending).toBe(MultiplyBlending)
    expect(mat.premultipliedAlpha).toBe(true)
    // 깊이는 안 쓴다 — 쓰면 그 뒤의 나무가 이 판에 가려 사라진다
    expect(mat.depthWrite).toBe(false)

    // 판 자체는 삼각형 둘이다. 그루당 168에 둘을 더하는 값이라 여기서 못 늘린다
    const geo = contactGeometry()
    expect(geo.getAttribute('position').count / 3).toBe(2)
    // 그리고 **땅 위로 조금 떠야** 한다 — 같은 높이면 지형과 깊이가 겹쳐 얼룩진다
    const y = (geo.getAttribute('position') as BufferAttribute).getY(0)
    expect(y).toBeGreaterThan(0)
    expect(y).toBeLessThan(0.05)
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

  /**
   * **집·울타리 안으로는 안 자란다** (사용자 지적: "울타리랑 나무랑 겹쳐있지?
   * 포켓몬센터랑 겹쳐있는 나무도 있고").
   *
   * 원작 나무는 위에서 본 그림 한 장이라 집에 걸쳐 있어도 화면에서는 집이
   * 덮었다. 그걸 입체로 세우니 줄기가 벽을 뚫고 잎이 지붕에 박혔다 — 실측으로
   * 마을 열 곳에서 98그루, 제일 깊은 것이 2.17타일이었다
   */
  it('소품·울타리에 가까우면 줄어들고, 최소 크기로도 안 들어가면 안 선다', () => {
    const cell = { minY: 1, maxY: 4, group: 0 }
    const key = cellKey(8, 12)
    const full = new Vector3().setFromMatrixScale(treeAt(key, cell)!)
    // 넉넉하면 그대로다
    const far = new Vector3().setFromMatrixScale(treeAt(key, cell, undefined, undefined, () => 9)!)
    expect(far.x).toBeCloseTo(full.x, 6)
    // 1.0타일밖에 안 남으면 잎이 그 안에 들어오도록 줄인다 (`CROWN_REACH` 0.97)
    const tight = treeAt(key, cell, undefined, undefined, () => 1.0)!
    const small = new Vector3().setFromMatrixScale(tight)
    expect(small.x).toBeLessThan(full.x)
    expect(small.x * CROWN_REACH).toBeLessThanOrEqual(1.0 + 1e-6)
    // 세로도 같이 줄어야 한다 — 가로만 줄이면 납작해진다
    expect(small.y / small.x).toBeCloseTo(full.y / full.x, 6)
    // 최소 크기로도 안 들어가면 아예 안 세운다
    expect(treeAt(key, cell, undefined, undefined, () => RADIUS_MIN * CROWN_REACH - 0.01))
      .toBeNull()
    expect(treeAt(key, cell, undefined, undefined, () => 0)).toBeNull()
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

/**
 * 나무가 땅에 서는가 (DATA.md §2.2).
 *
 * 원작 판은 나무를 **위에서 본 그림**이라 땅보다 위에 걸려 있다. 잎 아래끝에
 * 세우면 나무가 뜬다 — 그리고 뜬 나무는 그림자가 제 밑동에서 벗어난 데 진다.
 * 태양이 (24, 42, 18)이라 수평 30 · 수직 42고, 어긋나는 거리는 뜬 높이의
 * 30/42 = 0.71배다.
 *
 * 여기서 세는 것은 오버월드 전체다 — 청크 하나를 골라 보면 우연히 맞는 자리를
 * 고를 수 있다.
 *
 * ⚠️ 다만 높이를 **청크 하나 안에서만** 묻는다. 그래서 "자료 없음"이 런타임보다
 * 많이 나온다(2,931 대 360) — 청크 경계에 선 나무는 옆 청크의 판이 답이고,
 * 런타임은 월드 좌표로 물어 그쪽까지 본다. 여기서 재는 것은 "잎 아래끝에 세우면
 * 뜨는가"이지 자료가 몇 개 비어 있는가가 아니다.
 */
maybe('나무가 땅에 선다', () => {
  const fmt = read('chunks/index.json') as Fmt


  /** 잎 텍스처 이름. 여기서는 알파를 안 재므로 이름만 본다 — `isFoliage`의 절반이다 */
  const FOLIAGE_NAME = /^(cont)?tree|_tree|treeg/

  interface Stood { gap: number; grounded: number }

  /** 오버월드 전체를 훑어 그루마다 (밑동−지면)을 잰다 */
  function everyTree(): { off: Stood[]; noGround: number } {
    heightField.data = loadHeight()
    const meta = read('matrices/0.json') as MatrixMeta
    const off: Stood[] = []
    let noGround = 0
    for (const c of meta.chunks) {
      let mesh: ChunkMesh
      try { mesh = readChunk(c.land, fmt) } catch { continue }
      const cutout = mesh.materials.map((m) => FOLIAGE_NAME.test(m.tex ?? ''))
      if (!cutout.some(Boolean)) continue
      // 메시 로컬은 청크 **한가운데** 기준(−16~+16)이고 높이 자료는 **원점**
      // 기준(0~32)이다. 16을 안 더하면 74%가 "판이 없다"로 나온다
      const ground = (x: number, z: number, near: number) =>
        heightInChunk(c.land, x + 16, z + 16, near)
      for (const [key, cell] of splitFoliage(mesh, cutout).cells) {
        const bare = treeAt(key, cell)
        if (!bare) continue
        const y = new Vector3().setFromMatrixPosition(bare).y
        const p = new Vector3().setFromMatrixPosition(treeAt(key, cell, ground)!)
        const g = ground(p.x, p.z, cell.minY)
        if (g === null) { noGround++; continue }
        off.push({ gap: y - g, grounded: p.y - g })
      }
    }
    return { off, noGround }
  }

  it('잎 아래끝에 세우면 48,404그루가 뜬다 — 지면에 세우면 0그루다', () => {
    const { off, noGround } = everyTree()
    // 실측 앵커. 높이 자료가 없는 칸이 2,970개고 거기서는 잎 아래끝으로 물러선다
    expect(off.length).toBe(48564)
    expect(noGround).toBe(2931)

    const floating = (xs: Stood[], k: (s: Stood) => number, t: number) =>
      xs.filter((s) => k(s) > t).length
    // 잎에 세운 것 — 거의 전부가 뜬다. 0.71배가 그림자가 어긋나는 거리다
    expect(floating(off, (s) => s.gap, 0.05)).toBe(48404)
    expect(floating(off, (s) => s.gap, 0.1)).toBe(8914)
    expect(floating(off, (s) => s.gap, 0.5)).toBe(634)
    expect(floating(off, (s) => s.gap, 2)).toBe(255)
    // 파묻힌 것도 있다 — 잎이 땅보다 **아래**인 칸이다
    expect(off.filter((s) => s.gap < -0.1)).toHaveLength(160)

    // 지면에 세운 것 — 한 그루도 안 뜨고 한 그루도 안 묻힌다
    for (const s of off) expect(s.grounded).toBeCloseTo(0, 9)
  })

  it('겹친 판 중 잎에 가까운 것을 고른다 — 다리 위 나무가 밑으로 안 떨어진다', () => {
    // 한 자리를 판이 둘 덮으면(다리와 그 밑) 아무거나 고르면 안 된다.
    // `near`로 잎 아래끝을 넘기므로 **위 판**이 뽑혀야 한다
    const cell = { minY: 4.0, maxY: 5.5, group: 0 }
    const two = (_x: number, _z: number, near: number) =>
      [0.0, 4.2].reduce<number | null>(
        (best, y) => (best === null || Math.abs(y - near) < Math.abs(best - near) ? y : best),
        null)
    const m = treeAt(cellKey(6, 8), cell, two)!
    expect(new Vector3().setFromMatrixPosition(m).y).toBe(4.2)
    // 잎이 낮으면 아래 판이 답이다 — 규칙이 방향을 안 탄다
    const low = treeAt(cellKey(6, 8), { minY: 0.3, maxY: 1.4, group: 0 }, two)!
    expect(new Vector3().setFromMatrixPosition(low).y).toBe(0.0)
  })
})

/**
 * 나무가 **원작 나무 자리에** 서는가 (DATA.md §2.2).
 *
 * 원작은 나무 밑에 동그란 그림자 판(`tshadow`)을 깔아 두었다. 그 판이 곧 그
 * 나무가 서 있던 자리라, 우리 입체 나무가 그 위에 서면 원작과 겹치는 것이다.
 *
 * ⚠️ 예전엔 칸 한가운데에서 ±0.9타일 흩었다. 홀로 선 나무 1,022그루가
 * **1,022그루 다** 동그라미를 벗어나 있었고 중앙값이 1.20타일이었다.
 */
maybe('나무가 원작 자리에 선다', () => {
  const fmt = read('chunks/index.json') as Fmt
  const FOLIAGE_NAME = /^(cont)?tree|_tree|treeg/

  interface Tally {
    /** 잎이 있는 2×2 그림자 판 */
    quads: number
    /** 그 한가운데에 나무가 정확히 선 판 */
    onCentre: number
    /** 판 안에 선 나무 (하나여야 한다) */
    inside: number
    /** 나무 전체 */
    trees: number
  }

  function sweep(): Tally {
    const meta = read('matrices/0.json') as MatrixMeta
    const t: Tally = { quads: 0, onCentre: 0, inside: 0, trees: 0 }
    for (const c of meta.chunks) {
      let mesh: ChunkMesh
      try { mesh = readChunk(c.land, fmt) } catch { continue }
      const cutout = mesh.materials.map((m) => FOLIAGE_NAME.test(m.tex ?? ''))
      const split = splitFoliage(mesh, cutout)
      const sites = treeSites(split)
      t.trees += sites.length
      if (split.shadows.size === 0) continue
      const spots = sites.map((site) => {
        const p = new Vector3().setFromMatrixPosition(treeAt(site.key, site.cell, undefined, site)!)
        return [p.x, p.z] as const
      })
      for (const q of split.shadows) {
        const qx = cellX(q), qz = cellZ(q)
        // 잎이 하나도 안 걸친 판은 나무 자리가 아니다 — 원작에도 그 자리엔 없다
        let leafy = false
        for (let dz = 0; dz < 2; dz++) {
          for (let dx = 0; dx < 2; dx++) if (split.cells.has(cellKey(qx + dx, qz + dz))) leafy = true
        }
        if (!leafy) continue
        t.quads++
        // 경계는 이웃 판과 나눠 쓰는 자리라 **안쪽만** 센다
        const inside = spots.filter(([x, z]) => x > qx && x < qx + 2 && z > qz && z < qz + 2)
        if (inside.length === 1) t.inside++
        if (inside.some(([x, z]) => x === qx + 1 && z === qz + 1)) t.onCentre++
      }
    }
    return t
  }

  it('홀로 선 나무는 판 한가운데에 딱 한 그루씩 선다', () => {
    const t = sweep()
    // 잎이 걸친 2×2 판이 이만큼 있다 — 0이면 이 시험에 뜻이 없다
    expect(t.quads).toBeGreaterThan(400)
    // **판마다 한가운데에 정확히 선다.** ±0.9타일 흩던 때는 한 그루도 안 맞았다
    expect(t.onCentre, `${String(t.onCentre)}/${String(t.quads)}만 한가운데다`).toBe(t.quads)
    // 그리고 **한 그루뿐이다.** 격자가 같은 자리에 또 세우면 두 그루가 겹친다
    expect(t.inside, `${String(t.inside)}/${String(t.quads)}만 한 그루다`).toBe(t.quads)
    // 그루 수가 통째로 무너지지도 늘지도 않는다
    expect(t.trees).toBeGreaterThan(40_000)
  })
})

/**
 * **발밑이 뚫린 자리가 하나도 없는가** (DATA.md §2.2).
 *
 * 잎을 걷어낸 자리를 청크 **안**의 바닥 삼각형으로만 메우면 절반이 그대로
 * 뚫린다 — 오버월드 배치 468개 중 46개가 바닥 삼각형이 하나도 없는 청크고
 * (숲만 든 173번이 대부분), 잎 칸의 46.6%가 거기에 있다.
 *
 * 여기서 오버월드 전체를 실제 그림 묶음·실제 높이 자료로 훑어 **0칸**을 잰다.
 * 이 수가 0이 아니면 어딘가에서 하늘이 내다보인다.
 */
maybe('숲 바닥에 빈 칸이 없다', () => {
  const CHUNK = 32
  /** 그림 묶음 한 장을 진짜 PNG에서 읽는다 — 투명 비율이 잣대라 흉내로는 못 잰다 */
  const sheets = new Map<number, TexSheet>()
  function sheetFor(set: number): TexSheet {
    const hit = sheets.get(set)
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
    sheets.set(set, made)
    return made
  }

  interface Tally { cells: number; covered: number; filled: number; borrowed: number; bare: number }

  function sweep(): Tally {
    heightField.data = loadHeight()
    const fmt = read('chunks/index.json') as Fmt
    const maps = read('maps.json') as {
      maps: { area: number }[]
      areas: { tex: number }[]
    }
    const meta = read('matrices/0.json') as MatrixMeta
    const texOf = (zone: number) => maps.areas[maps.maps[zone]?.area ?? 0]?.tex ?? 0
    const at = new Map(meta.chunks.map((c) => [`${String(c.mx)},${String(c.my)}`, c]))
    // `MapGrid.heightAtWorld`와 같은 길 — 청크를 찾아 그 안 좌표로 묻는다
    const groundAt = (x: number, z: number, near: number) => {
      const c = at.get(`${String(Math.floor(x / CHUNK))},${String(Math.floor(z / CHUNK))}`)
      return c ? heightInChunk(c.land, x - c.mx * CHUNK, z - c.my * CHUNK, near) : null
    }

    const meshes = new Map<number, ChunkMesh>()
    const meshOf = (land: number) => {
      let m = meshes.get(land)
      if (!m) { m = readChunk(land, fmt); meshes.set(land, m) }
      return m
    }
    const parts = new Map<string, { split: Split; source: FloorSource }>()
    const partOf = (c: { land: number; zone: number }) => {
      const key = `${String(c.land)}/${String(texOf(c.zone))}`
      let hit = parts.get(key)
      if (!hit) {
        const mesh = meshOf(c.land)
        const split = splitFoliage(mesh, cutoutGroups(mesh, sheetFor(texOf(c.zone))))
        hit = { split, source: floorSource(split, (g) => canBorrowFloor(mesh, g)) }
        parts.set(key, hit)
      }
      return hit
    }

    const t: Tally = { cells: 0, covered: 0, filled: 0, borrowed: 0, bare: 0 }
    for (const c of meta.chunks) {
      const { split, source } = partOf(c)
      const originX = c.mx * CHUNK + CHUNK / 2
      const originZ = c.my * CHUNK + CHUNK / 2

      // 바닥이 아예 없으면 이웃에서 빌려 온다. 고리는 렌더 창(반경 2)까지다.
      //
      // **물·턱만 있는 청크도 "없는 것"이다** (`floorSource`). 그래서 여기가
      // 화면과 같은 순서여야 한다: 이웃 → 없으면 마지막 보루
      let borrowed: FloorTri[] = []
      if (source.floors.length === 0) {
        for (let ring = 1; ring <= 2 && borrowed.length === 0; ring++) {
          for (let dz = -ring; dz <= ring; dz++) {
            for (let dx = -ring; dx <= ring; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue
              const n = at.get(`${String(c.mx + dx)},${String(c.my + dz)}`)
              if (!n) continue
              const near = partOf(n)
              if (near.source.floors.length === 0) continue
              borrowed = borrowed.concat(
                shiftFloors(near.source.floors, dx * CHUNK, dz * CHUNK, (g) => g))
            }
          }
        }
        if (borrowed.length === 0) borrowed = source.fallback ?? []
      }

      // ⚠️ **화면과 같은 길로 불러야 뜻이 있다.** `ChunkModels`는 갈래를 넘겨서
      // 메울 바닥을 **한 그림으로 좁히는데**(`oneGround`), 좁히고 나면 씨앗이
      // 줄어 너비 우선이 못 닿는 칸이 생길 수 있다 — 이 시험이 잡을 것이 그것이다.
      //
      // 빌려 온 삼각형은 여기서 번호를 그대로 두므로(`shiftFloors(…, (g) => g)`)
      // 이웃 그림의 이름이 이 청크 것으로 잘못 붙을 수 있다. 어느 그림이
      // 이기는지는 위의 통일 시험이 보고, **여기서 보는 것은 빈 칸이 0이냐**다
      const mine = meshOf(c.land)
      const sheet = sheetFor(texOf(c.zone))
      const patch = floorPatch(
        split, (x, z, near) => groundAt(x + originX, z + originZ, near), borrowed, source,
        (g) => {
          const name = mine.materials[g]?.tex ?? ''
          return { name, rank: groundRank(sheet, name) }
        })
      const done = new Set<number>()
      if (patch) {
        const pos = patch.geometry.getAttribute('position') as BufferAttribute
        // 칸 하나가 삼각형 둘 = 정점 여섯이고, 첫 정점이 그 칸의 왼쪽 위다
        for (let i = 0; i < pos.count; i += 6) {
          done.add(cellKey(Math.round(pos.getX(i)), Math.round(pos.getZ(i))))
        }
      }
      for (const [key, cell] of split.cells) {
        t.cells++
        // ⚠️ **"덮였는가"가 아니라 "그 층이 덮였는가"다.** 원작 지형은 층이
        // 겹쳐서, 한 칸 밑으로 아랫단 잔디가 지나가고 걸어 다니는 층에는
        // 아무것도 없을 수 있다 — 영원의 숲의 하늘 비치던 구멍이 그것이다
        const want = groundAt(cellX(key) + originX + 0.5, cellZ(key) + originZ + 0.5, cell.minY)
        const here = source.levels.get(key)
        const onLevel = here !== undefined
          && (want === null || here.some((y) => Math.abs(y - want) <= LEVEL_SLACK))
        if (onLevel) t.covered++
        else if (done.has(key)) { t.filled++; if (borrowed.length > 0) t.borrowed++ }
        else t.bare++
      }
    }
    return t
  }

  it('오버월드 잎 칸 110,703개가 한 칸도 안 남는다', () => {
    const t = sweep()
    expect(t.cells).toBe(110_703)
    // 원작 지형이 **그 층에** 이미 깔아 둔 칸 — 나머지를 우리가 메운다.
    //
    // 12,463이었다. "어떤 면이든 덮였으면 됐다"로 세던 값이고, 그 안에 층이
    // 어긋난 칸 2,842개가 숨어 있었다 — 밑으로 아랫단 잔디가 지나갈 뿐 걸어
    // 다니는 층에는 아무것도 없는 칸이다. 영원의 숲 길가에 하늘이 비치던
    // 구멍이 그 2,842개 중 하나다
    // 9,621이었다. 줄어든 930은 **판때기 바위**가 덮고 있던 칸이다 — 그 판을
    // 걷어내고 `Rocks`가 입체로 세우면서 그 자리가 다시 메울 칸이 됐다
    // 8,691이었다. 줄어든 10은 **덮은 것이 물뿐이던 칸**이다 — 물은 이제
    // 바닥으로 안 세므로(`NOT_FLOOR`) 덮인 것이 아니라 메울 칸이 됐다
    expect(t.covered).toBe(8_681)
    expect(t.filled).toBe(102_022)
    // **절반이 이웃에서 온다.** 청크 안만 보면 이만큼이 그대로 뚫린다.
    //
    // 51,546이었다. 늘어난 4,158은 물·턱만 들고 있던 청크다 — 예전에는 제
    // 웅덩이를 숲 밑에 깔았고(실측 8,296삼각형) 이제 이웃의 땅을 빌려 온다
    expect(t.borrowed).toBe(55_704)
    // 여기가 이 시험의 전부다
    expect(t.bare).toBe(0)
  }, 600_000)
})

/**
 * **밑동이 걸어 다니는 칸을 밟지 않는가** (DATA.md §2.2).
 *
 * 원작 나무는 판 한 장이라 통행 가능한 칸 위에 걸쳐 있어도 그림으로만 보였다.
 * 그걸 입체로 세우면 길 위에 줄기가 서고 몸이 그 속을 지나간다 — 사용자가
 * "나무 칸을 튀어나와 도보 가능한 타일을 튀어나온 나무들"이라 한 것이 이것이다.
 *
 * 여기서 오버월드 전체를 실제 격자로 훑는다.
 */
maybe('밑동이 길을 안 밟는다', () => {
  const CHUNK = 32
  const sheets = new Map<number, TexSheet>()
  function sheetFor(set: number): TexSheet {
    const hit = sheets.get(set)
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
    sheets.set(set, made)
    return made
  }

  it('오버월드 26,199그루 중 길을 0.15타일 넘게 밟는 것이 없다', () => {
    const fmt = read('chunks/index.json') as Fmt
    const maps = read('maps.json') as { maps: { area: number }[]; areas: { tex: number }[] }
    const meta = read('matrices/0.json') as MatrixMeta
    const bin = readFileSync(resolve(DATA, 'matrices/0.bin'))
    const grid = new MapGrid(meta, new Uint16Array(
      bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)))
    const texOf = (zone: number) => maps.areas[maps.maps[zone]?.area ?? 0]?.tex ?? 0
    const blocked = (tx: number, tz: number) => grid.isBlocked(tx, tz)

    const meshes = new Map<number, ChunkMesh>()
    const splits = new Map<string, Split>()
    const splitOf = (c: { land: number; zone: number }) => {
      const key = `${String(c.land)}/${String(texOf(c.zone))}`
      let hit = splits.get(key)
      if (!hit) {
        let mesh = meshes.get(c.land)
        if (!mesh) { mesh = readChunk(c.land, fmt); meshes.set(c.land, mesh) }
        hit = splitFoliage(mesh, cutoutGroups(mesh, sheetFor(texOf(c.zone))))
        splits.set(key, hit)
      }
      return hit
    }

    let total = 0, skipped = 0, atRisk = 0, nudged = 0, deep = 0
    for (const c of meta.chunks) {
      const ox = c.mx * CHUNK + CHUNK / 2, oz = c.my * CHUNK + CHUNK / 2
      for (const site of treeSites(splitOf(c))) {
        total++
        const tx = site.x + ox, tz = site.z + oz
        const nudge = trunkNudge(blocked, tx, tz)
        // 사방이 다 열린 자리는 아예 안 세운다 — 길 한복판이다
        if (!nudge) { skipped++; continue }
        const open = ([[-1, -1], [0, -1], [-1, 0], [0, 0]] as const)
          .filter(([dx, dz]) => !blocked(tx + dx, tz + dz)).length
        if (open > 0) atRisk++
        if (nudge.dx !== 0 || nudge.dz !== 0) nudged++
        // 민 뒤에도 열린 칸을 얼마나 밟는가. 밑동 반지름이 `TRUNK_R`이다
        let worst = 0
        for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
          if (blocked(tx + dx, tz + dz)) continue
          const cx = tx + nudge.dx, cz = tz + nudge.dz
          const inX = Math.min(cx + TRUNK_R, tx + dx + 1) - Math.max(cx - TRUNK_R, tx + dx)
          const inZ = Math.min(cz + TRUNK_R, tz + dz + 1) - Math.max(cz - TRUNK_R, tz + dz)
          if (inX > 0 && inZ > 0) worst = Math.max(worst, Math.min(inX, inZ))
        }
        if (worst > 0.15) deep++
      }
    }
    expect(total).toBe(26_199)
    // 길 한복판이라 안 세우는 것 — 예전부터 이 규칙이었다
    expect(skipped).toBe(923)
    // 길가라 그냥 남겨 두던 것 — 밑동이 열린 칸에 0.6타일씩 들어가 있었다
    expect(atRisk).toBe(869)
    // 그중 실제로 밀 축이 있는 것. 나머지 셋은 막힌 칸 둘이 **대각으로** 놓여
    // 어느 축으로도 밀 곳이 없다
    expect(nudged).toBe(866)
    // ⚠️ **여기가 이 시험의 전부다.** 밀기 전에는 869그루가 다 0.6타일을 밟았다
    expect(deep).toBe(3)
    expect(atRisk - nudged).toBe(deep)
  }, 600_000)
})

/**
 * **나무 밑에는 한 가지 바닥만 깐다** (사용자 요청: "나무 아래 타일은 그냥 풀,
 * 아니면 그냥 눈으로 통일하자").
 *
 * 칸마다 제일 가까운 삼각형을 베끼면 그 자리에 뭐가 가깝든 그대로 딸려 와서
 * 숲 바닥이 누더기가 된다 — 실측으로 떡잎마을 줄기 111그루 중 63그루가 눈 위,
 * 영원의숲 107그루 중 33그루가 절벽 위에 서 있었다.
 */
describe('나무 밑 바닥을 한 가지로 통일한다', () => {
  /** 그림마다 한 텍셀짜리 시트. 색이 곧 그 그림의 정체다 */
  function sheetOf(colors: [string, number, number, number][]): TexSheet {
    const pixels = new Uint8ClampedArray(colors.length * 4)
    colors.forEach(([, r, g, b], i) => {
      pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = 255
    })
    return {
      width: colors.length,
      height: 1,
      items: colors.map(([tex], i) => ({ tex, pal: '', x: i, y: 0, w: 1, h: 1 })),
      pixels,
    }
  }

  /**
   * 실측한 롬 그림의 평균색 (`.audit/groundTint.mjs` · 그림 1,133가지).
   * 잣대를 우리가 지어내지 않았다는 것이 이 표의 뜻이다
   */
  const REAL = sheetOf([
    ['nectgr', 60, 192, 62],    // 풀 — 초록 130
    ['ngrass', 92, 246, 148],   // 풀 — 초록 98
    ['fenter', 71, 205, 126],   // 풀 — 초록 78
    ['nsandp', 203, 228, 148],  // 흙 — 초록 26 (풀이 아니다)
    ['criffp', 120, 93, 91],    // 절벽 — 초록 −27
    ['criff', 192, 156, 145],   // 절벽 — 초록 −36
    ['s_sonwp', 246, 246, 248], // 눈 — 밝기 246.6 · 색기 0.008 (이름이 오타다)
    ['s_snow04', 253, 253, 255],// 눈 — 밝기 253.6 · 색기 0.006
    ['beach', 243, 243, 216],   // 모래 — 밝기 240인데 **색기 0.108**
    ['sea', 57, 127, 231],      // 물
  ])

  it('풀과 눈만 2등급이다 — 이름이 아니라 색으로 가른다', () => {
    // ⚠️ 롬 이름은 못 믿는다. 눈 그림 하나가 `s_sonwp`고, `nectgr`·`fenter`는
    // 이름만 봐서는 풀인지 알 수 없다 — 실제로 둘 다 풀이다
    expect(groundRank(REAL, 'nectgr')).toBe(2)
    expect(groundRank(REAL, 'ngrass')).toBe(2)
    expect(groundRank(REAL, 'fenter')).toBe(2)
    expect(groundRank(REAL, 's_sonwp')).toBe(2)
    expect(groundRank(REAL, 's_snow04')).toBe(2)
    // 흙·절벽은 땅이긴 하지만 나무 밑에 골라 깔 것은 아니다
    expect(groundRank(REAL, 'nsandp')).toBe(1)
    expect(groundRank(REAL, 'criffp')).toBe(1)
    expect(groundRank(REAL, 'criff')).toBe(1)
    // ⚠️ **모래사장이 눈으로 새면 안 된다.** 밝기는 눈과 같은 240인데 색기가
    // 0.108로 열 배 넘게 높다 — 갈리는 자리가 밝기가 아니라 색기다
    expect(groundRank(REAL, 'beach')).toBe(1)
    // 물은 아예 안 쓴다
    expect(groundRank(REAL, 'sea')).toBe(0)
  })

  /**
   * 속이 빈 그림은 바닥이 못 된다 — **사용자가 「투명 타일」이라 한 것이다.**
   *
   * 원작은 잔디·바위 **위에** 겹쳐 까는 한 겹을 따로 갖고 있다. 눈(`s_snow`
   * 불투명 49.2% · `s_snow02` 29.7% · `s_sonwp` 23.6%)과 얼음(`c09_ice` 55.2% ·
   * `c09_ice2` 48.2%)이 그것인데, 불투명한 텍셀만 세면 새하얘서 **눈으로
   * 2등급**을 받았다. 그걸 숲 바닥에 깔면 알파 컷에 잘려 발밑이 뚫린다.
   *
   * 실측(그림 1,140가지)이 문턱을 비워 준다: 진짜 바닥 그림은 `ngrass`·
   * `nectgr`·`criff`·`s_snow04`·`beach`까지 **전부 100.0%**이고 그 아래는
   * 98.8%부터다
   */
  it('절반이 투명한 덧그림은 바닥으로 안 쓴다', () => {
    // 텍셀 넷 중 둘만 불투명한 새하얀 그림 — 눈과 색이 똑같다
    const pixels = new Uint8ClampedArray(4 * 4)
    for (let i = 0; i < 4; i++) {
      pixels[i * 4] = 253; pixels[i * 4 + 1] = 253; pixels[i * 4 + 2] = 255
      pixels[i * 4 + 3] = i < 2 ? 255 : 0
    }
    const holed: TexSheet = {
      width: 4, height: 1,
      items: [{ tex: 's_snow', pal: '', x: 0, y: 0, w: 4, h: 1 }],
      pixels,
    }
    expect(groundRank(holed, 's_snow'),
      '불투명한 텍셀만 보면 눈이라 2등급이 나온다 — 그걸 깔면 뚫린다').toBe(0)
  })

  /**
   * 칸 (0,0)에 잎만 있고 바닥이 없는 청크. 가까운 데 `near`가 한 칸,
   * 먼 데 `far`가 다섯 칸 깔려 있다 — 「제일 가까운 것」과 「제일 넓은 것」이
   * 서로 다른 답을 내도록 일부러 그렇게 놓았다
   */
  function forestChunk(near: string, far: string): Split {
    const pos: number[] = [
      // 잎 판 — 칸 (0,0)을 덮는다. 서 있는 판이라 걷어내진다
      0, 2, 0, 1, 2, 0, 1, 3, 1, 0, 3, 1,
      // `near` — 칸 (1,0) 하나
      1, 1, 0, 2, 1, 0, 2, 1, 1, 1, 1, 1,
    ]
    const uv: number[] = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]
    const index: number[] = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]
    // `far` — 칸 (5,0)부터 다섯 칸. 넓이가 다섯 배다
    for (let i = 0; i < 5; i++) {
      const v = 8 + i * 4
      const x = 5 + i
      pos.push(x, 1, 0, x + 1, 1, 0, x + 1, 1, 1, x, 1, 1)
      uv.push(0, 0, 1, 0, 1, 1, 0, 1)
      index.push(v, v + 1, v + 2, v, v + 2, v + 3)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    geometry.setIndex(index)
    const mesh: ChunkMesh = {
      geometry,
      materials: [
        { tex: 'tree01', pal: '', rep: 0, a: 31, f: 0 },
        { tex: near, pal: '', rep: 0, a: 31, f: 0 },
        { tex: far, pal: '', rep: 0, a: 31, f: 0 },
      ],
      groups: [[0, 0, 6], [1, 6, 6], [2, 12, 30]],
    }
    return splitFoliage(mesh, [true, false, false])
  }

  /** 서브메시 번호 → 그 그림의 이름·등급 */
  const kindFrom = (names: string[]) => (g: number): GroundKind => {
    const name = names[g] ?? ''
    return { name, rank: groundRank(REAL, name) }
  }

  /** 메운 판이 실제로 어느 서브메시로 들어갔나 */
  const filledWith = (split: Split, names: string[]): number[] => {
    const patch = floorPatch(split, () => 1, [], undefined, kindFrom(names))
    return patch === null ? [] : patch.groups.map(([, , g]) => g)
  }

  it('가까운 눈이 아니라 넓은 풀로 메운다 — 떡잎마을이 눈밭이 됐던 자리다', () => {
    // ⚠️ 실측으로 떡잎마을 줄기 111그루 중 **63그루가 눈**(`s_sonwp`) 위에
    // 서 있었다. 초록 마을인데 그렇다 — 그 청크에서 눈은 바닥 넓이의 2.9%다
    const split = forestChunk('s_sonwp', 'ngrass')
    expect([...split.cells.keys()]).toEqual([cellKey(0, 0)])
    // 통일 전이라면 한 칸 옆의 눈을 집는다
    expect(floorPatch(split, () => 1)!.groups.map(([, , g]) => g)).toEqual([1])
    // 통일하면 다섯 칸짜리 풀이 이긴다
    expect(filledWith(split, ['tree01', 's_sonwp', 'ngrass'])).toEqual([2])
  })

  it('설원이면 눈이 이긴다 — 풀을 억지로 깔지 않는다', () => {
    // 같은 2등급끼리는 **그 청크에 실제로 넓게 깔린 쪽**이 이긴다
    expect(filledWith(forestChunk('ngrass', 's_snow04'), ['tree01', 'ngrass', 's_snow04']))
      .toEqual([2])
  })

  it('가까운 절벽 대신 먼 풀을 깐다 — 영원의숲이 절벽 위였던 자리다', () => {
    // 실측으로 영원의숲 줄기 107그루 중 33그루가 `criffp`(절벽) 위에 있었다
    expect(filledWith(forestChunk('criffp', 'nectgr'), ['tree01', 'criffp', 'nectgr']))
      .toEqual([2])
  })

  it('풀이 좁아도 절벽보다 먼저다 — 등급이 넓이를 이긴다', () => {
    // 풀이 한 칸(가까운 쪽), 절벽이 다섯 칸. 넓이만 보면 절벽이 이긴다
    expect(filledWith(forestChunk('ngrass', 'criff'), ['tree01', 'ngrass', 'criff']))
      .toEqual([1])
  })

  it('풀도 눈도 없으면 제일 넓은 땅으로 통일한다 — 모래사장·포장 도시', () => {
    // ⚠️ **모래사장 나무를 억지로 풀로 만들지 않는다.** 고를 것이 없으면
    // 그 청크를 실제로 이루는 땅이 답이다. 다만 **하나로** 통일하는 것은 같다
    expect(filledWith(forestChunk('criffp', 'beach'), ['tree01', 'criffp', 'beach']))
      .toEqual([2])
  })

  it('통일해도 발밑이 안 뚫린다 — 고를 것이 없으면 안 거른다', () => {
    // ⚠️ 누더기보다 하늘 구멍이 나쁘다. 물뿐이라 다 걸러지면 거르기를 포기한다
    const split = forestChunk('sea', 'sea')
    const patch = floorPatch(split, () => 1, [], undefined, kindFrom(['tree01', 'sea', 'sea']))
    expect(patch, '메울 것이 물뿐이어도 칸은 메운다').not.toBeNull()
    expect(patch!.geometry.getAttribute('position').count / 3).toBe(2)
  })

  it('갈래를 안 주면 예전 그대로다 — 부르는 쪽이 안 바뀌면 안 바뀐다', () => {
    const split = forestChunk('s_sonwp', 'ngrass')
    expect(floorPatch(split, () => 1)!.groups.map(([, , g]) => g)).toEqual([1])
  })
})

/**
 * **풀숲 그림은 나무 밑에 안 깐다** (사용자: "나무가 풀숲 위에 있으면 안돼").
 *
 * 색으로만 고르면 원작이 풀숲을 그리는 데 쓴 그림이 제일 초록이라 자주 이긴다.
 * 그러면 숲 바닥이 통째로 풀숲으로 보이는데, 정작 인카운터가 나는 칸은
 * 거기가 아니다 — 어디가 풀숲인지는 **거동값**이 말한다 (`Grass.tsx`).
 */
describe('풀숲 그림을 가려낸다', () => {
  /** 칸 (x,0)마다 한 장씩, 서브메시를 나눠 깐 바닥 */
  function strip(spans: [string, number, number][]): { split: Split, mesh: ChunkMesh } {
    const pos: number[] = []
    const index: number[] = []
    const groups: [number, number, number][] = []
    let at = 0
    spans.forEach(([, from, to], g) => {
      const start = at
      for (let x = from; x < to; x++) {
        const v = pos.length / 3
        pos.push(x, 1, 0, x + 1, 1, 0, x + 1, 1, 1, x, 1, 1)
        index.push(v, v + 1, v + 2, v, v + 2, v + 3)
        at += 6
      }
      groups.push([g, start, at - start])
    })
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
    geometry.setIndex(index)
    const mesh: ChunkMesh = {
      geometry,
      materials: spans.map(([tex]) => ({ tex, pal: '', rep: 0, a: 31, f: 0 })),
      groups,
    }
    return { split: splitFoliage(mesh, spans.map(() => false)), mesh }
  }

  const nameOf = (mesh: ChunkMesh) => (g: number) => mesh.materials[g]?.tex ?? ''

  it('덮은 칸이 다 풀숲이면 풀숲 그림이다', () => {
    // ⚠️ 실측: 영원의숲 `nectgr`은 244칸 중 **100.0%**가 거동 0x02·0x03이고
    // `ngrass`는 6,220칸 중 0.5%다. 두 값 사이라 문턱을 어디 놓아도 같다
    const { split, mesh } = strip([['ngrass', 0, 10], ['nectgr', 10, 14]])
    const found = tuftTextures(split, nameOf(mesh), (tx) => tx >= 10)

    expect([...found]).toEqual(['nectgr'])
  })

  it('풀숲 칸이 조금 섞였다고 풀숲 그림이 되지는 않는다', () => {
    // 열 칸 중 하나만 풀숲인 일반 땅. 이걸 빼면 깔 바닥이 사라진다
    const { split, mesh } = strip([['ngrass', 0, 10]])

    expect([...tuftTextures(split, nameOf(mesh), (tx) => tx === 3)]).toEqual([])
  })

  it('벽에 걸린 그림은 안 센다 — 바닥 후보가 아니다', () => {
    // 세워 둔 판. 누운 면이 없으면 칸을 하나도 안 모은다
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 1, 0, 1, 1, 0, 1, 2, 0, 0, 2, 0,
    ]), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(8), 2))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    const mesh: ChunkMesh = {
      geometry,
      materials: [{ tex: 'nectgr', pal: '', rep: 0, a: 31, f: 0 }],
      groups: [[0, 0, 6]],
    }

    expect([...tuftTextures(splitFoliage(mesh, [false]), nameOf(mesh), () => true)]).toEqual([])
  })

  it('풀숲 그림을 0등급으로 주면 그 다음 풀이 이긴다', () => {
    // ⚠️ **여기가 사용자가 본 화면이다.** `nectgr`이 제일 초록이라(초록 133)
    // 색만으로는 늘 이기는데, 그걸 나무 밑에 깔면 숲 바닥이 풀숲이 된다
    const REAL = {
      width: 2, height: 1,
      items: [
        { tex: 'nectgr', pal: '', x: 0, y: 0, w: 1, h: 1 },
        { tex: 'ngrass', pal: '', x: 1, y: 0, w: 1, h: 1 },
      ],
      pixels: new Uint8ClampedArray([58, 192, 59, 255, 85, 253, 150, 255]),
    }
    // 잎 칸 하나 · 풀숲 그림 다섯 칸 · 일반 풀 두 칸. 둘 다 2등급이고
    // 안 거르면 **넓은 쪽인 풀숲 그림**이 이긴다
    const pos: number[] = []
    const index: number[] = []
    /** 칸 [from, to)에 바닥을 깐다. 돌려주는 것은 `[색인 시작, 개수]` */
    const lay = (from: number, to: number): [number, number] => {
      const start = index.length
      for (let x = from; x < to; x++) {
        const v = pos.length / 3
        pos.push(x, 1, 0, x + 1, 1, 0, x + 1, 1, 1, x, 1, 1)
        index.push(v, v + 1, v + 2, v, v + 2, v + 3)
      }
      return [start, index.length - start]
    }
    // 서 있는 잎 판 — 칸 (20,0)을 덮는다. 밑에 바닥이 없으니 메울 칸이 된다
    pos.push(20, 2, 0, 21, 2, 0, 21, 3, 1, 20, 3, 1)
    index.push(0, 1, 2, 0, 2, 3)
    const leaf: [number, number] = [0, 6]
    const tall = lay(0, 5)
    const plain = lay(10, 12)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
    geometry.setIndex(index)
    const names = ['tree01', 'nectgr', 'ngrass']
    const split = splitFoliage({
      geometry,
      materials: names.map((tex) => ({ tex, pal: '', rep: 0, a: 31, f: 0 })),
      groups: [[0, ...leaf], [1, ...tall], [2, ...plain]],
    }, [true, false, false])
    const kind = (tuft: boolean) => (g: number) => ({
      name: names[g] ?? '',
      rank: tuft && names[g] === 'nectgr' ? 0 : groundRank(REAL, names[g] ?? ''),
    })

    // 안 거르면 더 넓은 `nectgr`(서브메시 1)이 이긴다
    expect(floorPatch(split, () => 1, [], undefined, kind(false))!.groups.map(([, , g]) => g))
      .toEqual([1])
    // 풀숲 그림으로 걸러 내면 `ngrass`(서브메시 2)가 깔린다
    expect(floorPatch(split, () => 1, [], undefined, kind(true))!.groups.map(([, , g]) => g))
      .toEqual([2])
  })
})

describe('땅은 청크 혼자 못 고른다', () => {
  const kind = (name: string, rank: number): GroundKind => ({ name, rank })

  /** 삼각형 하나를 흉내 낸다. `groundArea`가 보는 것은 서브메시 번호와 넓이뿐이다 */
  const tri = (group: number, size: number): FloorTri => ({
    group, ax: 0, az: 0, au: 0, av: 0,
    ux: size, uz: 0, du: 1, dv: 0,
    vx: 0, vz: size, eu: 0, ev: 1,
    r: 1, g: 1, b: 1, cx: 0.5, cz: 0.5, cy: 0,
  })

  it('이름별로 넓이를 합치고 물·풀숲(0등급)은 뺀다', () => {
    const area = groundArea(
      [tri(0, 2), tri(0, 2), tri(1, 4), tri(2, 8)],
      (g) => [kind('ngrass', 2), kind('criff', 1), kind('sea', 0)][g]!)
    expect([...area.keys()]).toEqual(['ngrass', 'criff'])
    expect(area.get('ngrass')!.area).toBe(4)
    expect(area.get('criff')!.area).toBe(8)
  })

  it('등급이 먼저고 그다음이 넓이다', () => {
    // 절벽이 두 배 넓어도 풀이 이긴다
    expect(pickGround(groundArea([tri(0, 2), tri(1, 4)],
      (g) => [kind('ngrass', 2), kind('criff', 1)][g]!))).toBe('ngrass')
    // 같은 등급이면 넓은 쪽
    expect(pickGround(groundArea([tri(0, 2), tri(1, 4)],
      (g) => [kind('ngrass', 2), kind('s_snow04', 2)][g]!))).toBe('s_snow04')
    expect(pickGround(new Map())).toBeNull()
  })

  /**
   * 이 청크에는 절벽밖에 없다. 이웃이 준 풀을 함께 받는다.
   *
   * ⚠️ 예진호수 청크 (0,0)이 정확히 이 꼴이었다 — 제 바닥이 `criff`(분홍 바위)
   * 뿐이라 숲 바닥 792칸을 통째로 분홍으로 깔았고, 바로 옆 (0,1)은 풀로 깔았다.
   * 「바닥이 하나도 없을 때만 빌려 온다」였던 것이 원인이다
   */
  function cliffOnly(): Split {
    const pos = [
      // 잎 판 — 칸 (0,0)
      0, 2, 0, 1, 2, 0, 1, 3, 1, 0, 3, 1,
      // 절벽 바닥 — 칸 (1,0)
      1, 1, 0, 2, 1, 0, 2, 1, 1, 1, 1, 1,
    ]
    const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
    const mesh: ChunkMesh = {
      geometry,
      materials: [
        { tex: 'tree01', pal: '', rep: 0, a: 31, f: 0 },
        { tex: 'criff', pal: '', rep: 0, a: 31, f: 0 },
      ],
      groups: [[0, 0, 6], [1, 6, 6]],
    }
    return splitFoliage(mesh, [true, false])
  }

  it('이웃이 준 풀이 제 절벽을 이긴다 — 예진호수 분홍 바위 판', () => {
    const split = cliffOnly()
    const named = (g: number): GroundKind =>
      (g === 1 ? kind('criff', 1) : kind('ngrass', 2))
    // 빌려 온 풀 삼각형. 서브메시 2번으로 뒤에 붙여 준다 (`ChunkModels.borrowFloors`)
    const lent = [{ ...tri(2, 1), ax: 3, az: 0, cx: 3.5, cz: 0.5 }]
    expect(floorPatch(split, () => 1, [], undefined, named)!.groups.map(([, , g]) => g))
      .toEqual([1])
    expect(floorPatch(split, () => 1, lent, undefined, named)!.groups.map(([, , g]) => g))
      .toEqual([2])
  })

  it('밖에서 고른 그림(`want`)이 제 넓이를 이긴다 — 청크선이 드러나던 자리', () => {
    const split = cliffOnly()
    const named = (g: number): GroundKind =>
      (g === 1 ? kind('criff', 2) : kind('ngrass', 2))
    const lent = [{ ...tri(2, 1), ax: 3, az: 0, cx: 3.5, cz: 0.5 }]
    // 둘 다 2등급이면 이 청크에 넓은 `criff`가 이긴다 — 옆 청크와 답이 갈린다
    expect(floorPatch(split, () => 1, lent, undefined, named)!.groups.map(([, , g]) => g))
      .toEqual([1])
    // 이름을 받으면 그것을 쓴다. 맞닿은 청크가 같은 이름을 받으므로 경계가 사라진다
    expect(floorPatch(split, () => 1, lent, undefined, named, 'ngrass')!
      .groups.map(([, , g]) => g)).toEqual([2])
    // 그 이름이 이 무더기에 없으면 제 힘으로 고른다 — 빈 자리를 만들지 않는다
    expect(floorPatch(split, () => 1, lent, undefined, named, 's_snow04')!
      .groups.map(([, , g]) => g)).toEqual([1])
  })
})

describe('턱에 옆면을 세운다', () => {
  /**
   * 칸 (0,0)은 y=`high`, 칸 (1,0)은 y=0. 잎은 없다.
   *
   * ⚠️ 원작 지형에는 세로면이 **아예 없다** — 4세대는 위에서만 보므로 높이가
   * 다른 가로 판만 쌓는다. 실측: 217번도로 창 전체의 세로 삼각형 82개가 전부
   * 부두·난간·계단 소품이고 땅에서 나온 것은 0개, 예진호수는 하나도 없다.
   * 1인칭으로 돌면 그 턱마다 밑이 훤히 보였다 (217번도로 243자리 중 243자리)
   */
  function terrace(high: number): Split {
    const pos = [
      1, high, 0, 0, high, 0, 0, high, 1, 1, high, 1, // 칸 (0,0) — 높은 쪽
      2, 0, 0, 1, 0, 0, 1, 0, 1, 2, 0, 1, // 칸 (1,0) — 낮은 쪽
    ]
    const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
    const mesh: ChunkMesh = {
      geometry,
      materials: [{ tex: 'ngrass', pal: '', rep: 0, a: 31, f: 0 }],
      groups: [[0, 0, 12]],
    }
    return splitFoliage(mesh, [false])
  }

  /** 그 판의 삼각형들을 (높이, 법선)으로 읽는다 */
  function facesOf(high: number) {
    // 걷는 높이도 그린 높이와 맞춰 준다 — 청크 밖 이웃은 이것으로 견준다
    const patch = floorPatch(terrace(high), (x) => (x < 1 ? high : 0))
    if (patch === null) return []
    const pos = patch.geometry.getAttribute('position')
    const nor = patch.geometry.getAttribute('normal')
    const out: { y: number[], n: [number, number, number] }[] = []
    for (let t = 0; t < pos.count; t += 3) {
      out.push({
        y: [pos.getY(t), pos.getY(t + 1), pos.getY(t + 2)],
        n: [nor.getX(t), nor.getY(t), nor.getZ(t)],
      })
    }
    return out
  }

  it('한 칸 낮은 이웃 쪽에만 세로면이 선다', () => {
    const faces = facesOf(1)
    // 잎이 없으니 바닥 판은 안 깔린다. 나온 것은 옆면 넉 장(사각 하나)뿐이다
    expect(faces.length).toBe(2)
    for (const f of faces) {
      // 바깥(+x)을 본다 — 뒤집히면 턱 안쪽에서만 보이고 밖에선 그대로 뚫린다
      expect(f.n).toEqual([1, 0, 0])
      expect(Math.min(...f.y)).toBe(0)
      expect(Math.max(...f.y)).toBe(1)
    }
  })

  it('평평하면 아무것도 안 세운다', () => {
    expect(facesOf(0)).toEqual([])
  })

  it('두 칸 떨어지면 한 칸씩 끊어 두 층으로 쌓는다', () => {
    // ⚠️ 통째로 늘리면 UV가 타일 밖으로 나가 가장자리 텍셀로 눌린 **민무늬
    // 띠**가 된다 — `lay`가 겪은 것과 같은 고장이다
    const faces = facesOf(2)
    expect(faces.length).toBe(4)
    const spans = faces.map((f) => [Math.min(...f.y), Math.max(...f.y)])
    expect(spans).toContainEqual([1, 2])
    expect(spans).toContainEqual([0, 1])
  })

  it('UV가 타일 밖으로 안 나간다 — 안쪽으로 되짚는다', () => {
    const patch = floorPatch(terrace(2), (x) => (x < 1 ? 2 : 0))!
    const uv = patch.geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0)
      expect(uv.getX(i)).toBeLessThanOrEqual(1)
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0)
      expect(uv.getY(i)).toBeLessThanOrEqual(1)
    }
  })
})
