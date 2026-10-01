// 청크 파일 검증 (DATA.md §2.2)
//
// 지오메트리가 맞는지는 추출기가 증명한다 — MDL0 헤더가 적어 둔 정점·삼각형
// 수와 666/666 일치한다. 여기서는 **싣는 파일**이 그 결과와 어긋나지 않았는지,
// 그리고 읽는 쪽이 같은 규격을 보고 있는지를 본다.
//
// 규격이 어긋나면 화면이 조용히 이상해진다 — 정점 폭을 하나 틀리면 좌표가
// 밀리면서 삼각형이 가시처럼 찢어지는데, 개수는 그대로 맞는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FrontSide, MeshBasicMaterial, MeshLambertMaterial, Texture,
  type Material,
} from 'three'
import {
  castsShadow, dropMaterial, ownMap, releaseSplit, sliceTexture, softAlpha, splitShadow, unlitMaterial,
  type TexSheet,
} from './chunkMesh'
import { DEPTH_SLOPE, PROP_DEPTH_BASE, featureTree, keptOverBdsp, materialsFor, propPriority } from './ChunkModels'
import { grassMaterial, tuftGeometry } from './Grass'
import { tickRetiredTextures } from './retireTexture'
import { decodePng, withData } from '../data/romData.testkit'

const DATA = resolve(__dirname, '../../public/data/chunks')
const maybe = withData('chunks/index.json', 'chunks/0.bin')

interface ChunkMeta {
  verts: number
  indices: number
  materials: { tex: string | null, pal: string | null, rep: number, a: number, f: number }[]
  submeshes: [number, number, number][]
}

/** 파일 앞머리를 읽는다. 읽는 쪽(`chunkMesh.ts`)과 같은 규격이어야 한다 */
function open(index: number): { meta: ChunkMeta, head: number, bytes: Buffer } {
  const bytes = readFileSync(resolve(DATA, `${String(index)}.bin`))
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('PT3C')
  const metaLen = bytes.readUInt32LE(4)
  const meta = JSON.parse(bytes.subarray(8, 8 + metaLen).toString('utf8')) as ChunkMeta
  return { meta, head: 8 + metaLen + ((4 - (metaLen % 4)) % 4), bytes }
}

maybe('청크 파일', () => {
  const format = JSON.parse(readFileSync(resolve(DATA, 'index.json'), 'utf8')) as {
    posScale: number, vertexBytes: number, unitsPerTile: number, count: number
  }

  it('규격이 읽는 쪽과 같다', () => {
    // 이 넷이 `chunkMesh.ts`의 오프셋 계산을 통째로 정한다
    expect(format.vertexBytes).toBe(24)
    expect(format.posScale).toBe(256)
    expect(format.unitsPerTile).toBe(16)
    expect(format.count).toBe(666)
  })

  it('파일 크기가 정점·색인 수와 정확히 맞는다', () => {
    // 한 바이트라도 남거나 모자라면 규격이 어긋난 것이다
    for (const i of [0, 1, 177, 300, 665]) {
      const { meta, head, bytes } = open(i)
      expect(bytes.length).toBe(head + meta.verts * format.vertexBytes + meta.indices * 2)
    }
  })

  it('서브메시가 색인 전부를 빈틈없이 덮는다', () => {
    const { meta } = open(0)
    let at = 0
    for (const [material, start, count] of meta.submeshes) {
      expect(start).toBe(at)
      expect(material).toBeLessThan(meta.materials.length)
      at += count
    }
    expect(at).toBe(meta.indices)
    expect(meta.indices % 3).toBe(0)
  })

  it('색인이 정점 범위 안에 있다', () => {
    // u16으로 담으므로 65536을 넘으면 조용히 감긴다. 실측 최대가 4757이다
    const { meta, head, bytes } = open(0)
    expect(meta.verts).toBeLessThan(65536)
    const at = head + meta.verts * format.vertexBytes
    for (let k = 0; k < meta.indices; k++) {
      expect(bytes.readUInt16LE(at + k * 2)).toBeLessThan(meta.verts)
    }
  })

  it('좌표가 청크 한 칸 안에 든다', () => {
    // 모델은 −16~+16 타일로 가운데 정렬돼 있다. 유닛(16유닛 = 한 타일)을
    // 타일로 안 옮기면 여기서 16배로 튄다
    const { meta, head, bytes } = open(0)
    let minY = Infinity, maxXZ = 0
    for (let k = 0; k < meta.verts; k++) {
      const o = head + k * format.vertexBytes
      const x = bytes.readInt16LE(o) / format.posScale
      const y = bytes.readInt16LE(o + 2) / format.posScale
      const z = bytes.readInt16LE(o + 4) / format.posScale
      maxXZ = Math.max(maxXZ, Math.abs(x), Math.abs(z))
      minY = Math.min(minY, y)
    }
    expect(maxXZ).toBeLessThan(24)
    expect(maxXZ).toBeGreaterThan(15)
    expect(minY).toBeGreaterThan(-8)
  })

  it('재질이 텍스처와 팔레트를 이름으로 가리킨다', () => {
    const { meta } = open(0)
    expect(meta.materials.length).toBeGreaterThan(0)
    for (const m of meta.materials) {
      expect(typeof m.tex).toBe('string')
      // 반복 비트 4개 · 알파 0~31 · 그리는 면 0~3
      expect(m.rep).toBeLessThanOrEqual(0xf)
      expect(m.a).toBeLessThanOrEqual(31)
      expect(m.f).toBeLessThanOrEqual(3)
    }
  })
})

const TEX = resolve(__dirname, '../../public/data/tex/index.json')
const maybeTex = withData('tex/index.json')

maybeTex('맵 텍스처 시트', () => {
  const index = JSON.parse(readFileSync(TEX, 'utf8')) as {
    sheetWidth: number
    sets: { w: number, h: number, items: [string, string, number, number, number, number][] }[]
  }

  it('묶음 74벌이고 조각이 시트 안에 든다', () => {
    expect(index.sets).toHaveLength(74)
    let total = 0
    for (const set of index.sets) {
      expect(set.w).toBe(index.sheetWidth)
      for (const [, , x, y, w, h] of set.items) {
        expect(x + w).toBeLessThanOrEqual(set.w)
        expect(y + h).toBeLessThanOrEqual(set.h)
        // NDS 텍스처는 변이 전부 2의 거듭제곱이다 (8~128)
        expect(Math.log2(w) % 1).toBe(0)
        expect(Math.log2(h) % 1).toBe(0)
        total++
      }
    }
    // 재질이 쓰는 조합으로 편 것 2,736장 + 맵 묶음 어디에도 없어 **건물 묶음에서**
    // 빌려 온 72장 (FP-04 · `chunks.holePairs`)
    expect(total).toBe(2808)
  })

  it('한 묶음 안에서 조각이 안 겹친다', () => {
    // 겹치면 두 텍스처가 서로의 픽셀을 물어 온다. 눈으로는 "색이 이상하다"로만 보인다
    for (const set of index.sets) {
      const seen: [number, number, number, number][] = []
      for (const [, , x, y, w, h] of set.items) {
        for (const [ox, oy, ow, oh] of seen) {
          const apart = x + w <= ox || ox + ow <= x || y + h <= oy || oy + oh <= y
          expect(apart).toBe(true)
        }
        seen.push([x, y, w, h])
      }
    }
  })
})

// ── 반투명 그림 ──────────────────────────────────────────────────────────────
// DS는 텍스처 자체가 알파를 나르는 형식(A3I5·A5I3)을 쓴다. 그때는 폴리곤 알파가
// 31(불투명)이어도 하드웨어가 텍셀마다 섞는데, 우리는 폴리곤 알파만 보고
// `alphaTest: 0.5`로 잘랐다 — 천관산 빛기둥이 통째로 잘려 나가고 그 뒤의 천장
// 구멍 판만 흰 판때기로 남았다.
maybeTex('알파가 번지는 그림', () => {
  const index = JSON.parse(readFileSync(TEX, 'utf8')) as {
    sets: { items: [string, string, number, number, number, number][] }[]
  }

  it('빛기둥은 알파가 절반도 안 차고, 그런 그림은 섞어 그린다', () => {
    // ⚠️ 이 값이 128을 넘으면 이 시험이 아무것도 안 지킨다 — 문턱 0.5를
    // 넘어서면 `alphaTest`로도 살아남으니까. 실측 최댓값이 123이다
    const png = decodePng(resolve(__dirname, '../../public/data/tex/68.png'))
    const item = index.sets[68]!.items.find(([tex]) => tex === 'dun_light')!
    const [, , x, y, w, h] = item
    let max = 0
    let graded = 0
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const a = png.pixels[((y + j) * png.width + x + i) * 4 + 3]!
        if (a > max) max = a
        if (a !== 0 && a !== 255) graded++
      }
    }
    expect(max, '빛기둥 알파 최댓값').toBe(123)
    expect(graded, '중간 알파 텍셀').toBe(704)

    // 그 그림이 걸리는 잣대. 걸리면 자르는 게 아니라 섞는다
    const pixels = new Uint8Array(w * h * 4)
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        pixels[(j * w + i) * 4 + 3] = png.pixels[((y + j) * png.width + x + i) * 4 + 3]!
      }
    }
    expect(softAlpha(pixels), '빛기둥').toBe(true)
    // 4세대 팔레트 그림은 색 0만 투명이라 알파가 0 아니면 255다 — 나무·울타리가
    // 여기 걸리면 숲이 통째로 반투명이 된다
    expect(softAlpha(new Uint8Array([1, 2, 3, 255, 4, 5, 6, 0])), '잘라 낸 그림').toBe(false)
  })
})

describe('그림자를 던질 면 가르기', () => {
  /** 무리 넷짜리 기하 하나 — 재질은 밖에서 준다 */
  function land(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(36), 3))
    for (let i = 0; i < 4; i++) g.addGroup(i * 3, 3, i)
    return g
  }
  const opaque = (): Material => new MeshLambertMaterial({ alphaTest: 0.5 })
  const soft = (): Material => new MeshLambertMaterial({ transparent: true, alphaTest: 0 })

  it('섞는 면이 없으면 나누지 않는다 — 대부분의 청크가 그렇다', () => {
    const g = land()
    const out = splitShadow(g, [opaque(), opaque(), opaque(), opaque()])
    expect(out.solid).toBe(g)
    expect(out.soft).toBe(null)
  })

  it('섞는 무리만 빼내고 나머지는 그림자를 던진다', () => {
    const g = land()
    const mats = [opaque(), soft(), opaque(), soft()]
    const out = splitShadow(g, mats)
    expect(out.solid.groups.map((x) => x.materialIndex)).toEqual([0, 2])
    expect(out.soft?.groups.map((x) => x.materialIndex)).toEqual([1, 3])
    // ⚠️ **정점을 나눠 쓴다.** 복사하면 청크마다 버퍼가 두 벌 된다
    expect(out.solid.attributes.position).toBe(g.attributes.position)
    expect(out.soft?.attributes.position).toBe(g.attributes.position)
    // 무리를 하나도 안 잃는다 — 잃으면 화면에서 그 면이 사라진다
    expect(out.solid.groups.length + (out.soft?.groups.length ?? 0)).toBe(g.groups.length)
  })

  it('같은 원본·같은 그림자 무리면 다시 안 만든다', () => {
    const g = land()
    const mats = [opaque(), soft(), opaque(), soft()]
    // ⚠️ **재질 배열은 배치마다 새로 온다.** 객체 신원으로 캐시하면 한 번도
    // 안 맞는다 — 여기서 재는 것은 「그림자를 던지는 무리가 같은가」다
    const a = splitShadow(g, mats)
    const b = splitShadow(g, [opaque(), soft(), opaque(), soft()])
    expect(b.solid).toBe(a.solid)
    expect(b.soft).toBe(a.soft)
  })

  it('원본을 놓을 때 파생도 함께 놓는다 — 놓는 자가 없었다', () => {
    const g = land()
    const out = splitShadow(g, [opaque(), soft(), opaque(), soft()])
    let freed = 0
    out.solid.addEventListener('dispose', () => { freed++ })
    out.soft?.addEventListener('dispose', () => { freed++ })
    releaseSplit(g)
    expect(freed).toBe(2)
    // 보관함에서도 빠진다 — 다시 부르면 새로 만든다
    const again = splitShadow(g, [opaque(), soft(), opaque(), soft()])
    expect(again.solid).not.toBe(out.solid)
  })

  it('나눌 것이 없었으면 원본을 놓지 않는다', () => {
    const g = land()
    const out = splitShadow(g, [opaque(), opaque(), opaque(), opaque()])
    expect(out.solid).toBe(g)
    let freed = 0
    g.addEventListener('dispose', () => { freed++ })
    releaseSplit(g)
    // ⚠️ **여기서 원본을 놓으면 나눠 쓰는 쪽이 함께 깨진다**
    expect(freed).toBe(0)
  })

  it('만든 적 없는 기하를 놓으라 해도 조용하다', () => {
    expect(() => { releaseSplit(land()); releaseSplit(null) }).not.toThrow()
  })

  it('알파를 자르는 면은 그림자를 던진다 — 나무와 울타리가 그렇다', () => {
    expect(castsShadow(new MeshLambertMaterial({ alphaTest: 0.5 }))).toBe(true)
    expect(castsShadow(new MeshLambertMaterial({ transparent: true, alphaTest: 0.5 }))).toBe(true)
    // 빛기둥·물·연기는 안 던진다 (`castsShadow` 머리말)
    expect(castsShadow(new MeshLambertMaterial({ transparent: true, alphaTest: 0 }))).toBe(false)
  })
})

// 재질을 버릴 때 **그 그림도 같이 가는가** (REPAIR §46.3)
//
// ⚠️ **`Material.dispose()`는 `map`을 안 버린다.** `sliceTexture`가 부를 때마다
// 새 `DataTexture`를 만드는데, 표시가 없으면 놓는 자가 그냥 지나간다 —
// 실측(2026-09-09 `_land42` 22바퀴)으로 빌려 온 바닥이 왕복마다 7장, 소품
// 재질이 6장씩 늘어 한 번도 안 줄었다.
describe('그림의 임자', () => {
  /** 재질과 **그 재질이 문 그림**을 함께 돌려준다 */
  const withMap = (): { m: Material, tex: DataTexture, freed: () => number } => {
    const tex = new DataTexture(new Uint8Array(4), 1, 1)
    let n = 0
    tex.addEventListener('dispose', () => { n++ })
    return { m: new MeshLambertMaterial({ map: tex }), tex, freed: () => n }
  }

  it('표시를 단 재질은 그림까지 버린다 — 나간 프레임 두 장 뒤에', () => {
    const one = withMap()
    dropMaterial(ownMap(one.m))
    // 그 자리에서 버리면 제출 중인 프레임이 문다 (REPAIR §48)
    tickRetiredTextures(); tickRetiredTextures()
    expect(one.freed()).toBe(1)
  })

  it('표시가 없으면 그림은 남긴다 — 나눠 쓰는 것이 있다', () => {
    const one = withMap()
    dropMaterial(one.m)
    // ⚠️ 나눠 쓰는 그림을 버리면 다음 배치가 빈 그림을 문다
    expect(one.freed()).toBe(0)
  })

  it('그림이 없는 재질에는 표시를 안 단다', () => {
    const m = ownMap(new MeshLambertMaterial())
    expect(m.userData.ownsMap).toBeUndefined()
    expect(() => { dropMaterial(m) }).not.toThrow()
  })
})

// 버리기를 미룬다 (REPAIR §48)
//
// 그 자리에서 버리면 제출 중인 프레임이 없는 그림을 문다 —
// `Destroyed texture [Texture (unlabeled 16x16 px, …)] used in a submit`.
// `sliceTexture`가 내는 것이 정확히 그 16×16이다.
describe('버리기를 미룬다', () => {
  const own = () => {
    const m = ownMap(new MeshBasicMaterial({ map: new Texture() }))
    const map = (m as MeshBasicMaterial).map!
    let disposed = 0
    map.addEventListener('dispose', () => { disposed += 1 })
    return { m, count: () => disposed }
  }

  it('⚠️ 버리라고 한 그 자리에서는 안 버린다', () => {
    const { m, count } = own()
    dropMaterial(m)
    expect(count()).toBe(0)
  })

  it('한 장으로는 모자라다 — 두 장이 나간 뒤에 버린다', () => {
    const { m, count } = own()
    dropMaterial(m)
    tickRetiredTextures()
    expect(count()).toBe(0)
    tickRetiredTextures()
    expect(count()).toBe(1)
  })

  it('두 번 버리지 않는다', () => {
    const { m, count } = own()
    dropMaterial(m)
    tickRetiredTextures(); tickRetiredTextures(); tickRetiredTextures()
    expect(count()).toBe(1)
  })

  it('제 것이 아닌 그림은 애초에 안 맡는다', () => {
    const map = new Texture()
    let disposed = 0
    map.addEventListener('dispose', () => { disposed += 1 })
    dropMaterial(new MeshBasicMaterial({ map }))
    tickRetiredTextures(); tickRetiredTextures()
    expect(disposed).toBe(0)
  })
})


// **도트를 키워서 계단만 깎는다** (`sliceTexture`의 Scale2x · FIRST_PERSON_FP)
//
// 1인칭에서 텍셀 하나가 화면 12~54픽셀이 된다(실측 중앙값). 원작은 위에서
// 내려다보는 화면이라 그 타일이 손톱만 했다. 여기서 보는 것은 셋이다:
// **짧은 변이 64가 되는가** · **새 색을 안 만드는가** · **안 키울 것은 그대로 두는가**.
describe('도트를 키운다 — 계단만 깎고 색은 안 만든다', () => {
  /** `w×h` 시트 한 장. `paint(x,y)`가 RGBA를 준다 */
  const sheetOf = (w: number, h: number, paint: (x: number, y: number) => number[]): TexSheet => {
    const pixels = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) pixels.set(paint(x, y), (y * w + x) * 4)
    }
    return { width: w, height: h, items: [], pixels }
  }
  /** 대각선 — Scale2x가 깎을 계단이 있는 그림이다 */
  const diagonal = (w: number, h: number): TexSheet =>
    sheetOf(w, h, (x, y) => (x > y ? [200, 40, 40, 255] : [20, 20, 200, 255]))

  const sizeOf = (tex: Texture): [number, number] => {
    const img = tex.image as { width: number, height: number }
    return [img.width, img.height]
  }

  it('짧은 변이 64가 될 때까지만 키운다', () => {
    const item = (w: number, h: number) => ({ tex: 't', pal: 'p', x: 0, y: 0, w, h })
    expect(sizeOf(sliceTexture(diagonal(16, 16), item(16, 16), 0)), '16×16은 ×4').toEqual([64, 64])
    expect(sizeOf(sliceTexture(diagonal(32, 32), item(32, 32), 0)), '32×32는 ×2').toEqual([64, 64])
    expect(sizeOf(sliceTexture(diagonal(64, 64), item(64, 64), 0)), '64×64는 그대로').toEqual([64, 64])
    expect(sizeOf(sliceTexture(diagonal(16, 32), item(16, 32), 0)), '짧은 변으로 잰다').toEqual([64, 128])
  })

  it('1~2픽셀짜리 띠는 안 키운다 — Scale2x가 할 일이 없다', () => {
    const item = { tex: 't', pal: 'p', x: 0, y: 0, w: 2, h: 64 }
    expect(sizeOf(sliceTexture(diagonal(2, 64), item, 0))).toEqual([2, 64])
  })

  it('⚠️ 새 색을 만들지 않는다 — 원작 팔레트 밖으로 안 나간다', () => {
    const src = diagonal(16, 16)
    const out = sliceTexture(src, { tex: 't', pal: 'p', x: 0, y: 0, w: 16, h: 16 }, 0)
    const data = (out.image as { data: Uint8Array }).data
    const seen = new Set<string>()
    for (let i = 0; i < data.length; i += 4) {
      seen.add(`${String(data[i])},${String(data[i + 1])},${String(data[i + 2])},${String(data[i + 3])}`)
    }
    expect([...seen].sort(), '섞은 색이 하나라도 생기면 보간을 한 것이다')
      .toEqual(['20,20,200,255', '200,40,40,255'])
  })

  it('키운 그림도 계단이 깎인다 — 그대로 키운 것과 다르다', () => {
    const item = { tex: 't', pal: 'p', x: 0, y: 0, w: 16, h: 16 }
    const grown = sliceTexture(diagonal(16, 16), item, 0)
    const data = (grown.image as { data: Uint8Array }).data
    // 그냥 ×4로 키웠다면 (x,y)의 색은 원본 (x>>2, y>>2)의 색과 늘 같다.
    // 계단을 깎았으면 경계 근처에서 다른 칸이 나온다
    let moved = 0
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const want = (x >> 2) > (y >> 2) ? 200 : 20
        if (data[(y * 64 + x) * 4] !== want) moved += 1
      }
    }
    expect(moved, '경계에서 화소가 옮겨 앉은 자리가 있어야 한다').toBeGreaterThan(0)
  })
})

describe('빛을 안 받는 사본 (`unlitMaterial`) — 들판 체육관 물바닥', () => {
  it('그림 · 섞기 · 깊이 · 우선순위를 그대로 옮기고 빛과 안개만 뺀다', () => {
    const map = new DataTexture(new Uint8Array([107, 214, 255, 182]), 1, 1)
    const lit = ownMap(new MeshLambertMaterial({
      name: 'gym01_w', map, vertexColors: true, transparent: true, opacity: 1, depthWrite: false,
      alphaTest: 0, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -3,
    }))
    const flat = unlitMaterial(lit) as MeshBasicMaterial
    expect(flat).toBeInstanceOf(MeshBasicMaterial)
    expect(flat.name).toBe('gym01_w')
    expect(flat.map, '그림은 나눠 쓴다 — 새로 자르지 않는다').toBe(map)
    expect(flat.transparent).toBe(true)
    expect(flat.depthWrite).toBe(false)
    expect(flat.vertexColors).toBe(true)
    expect(flat.side).toBe(DoubleSide)
    expect(flat.fog, '안개색 쪽으로 끌리면 다시 바랜다').toBe(false)
    expect([flat.polygonOffset, flat.polygonOffsetUnits]).toEqual([true, -3])
    expect(flat.userData.ownsMap, '그림 임자 표시도 넘어온다 — 버릴 때 그림도 같이 간다').toBe(true)
  })

  it('⚠️ 원래 재질을 버려도 그림은 산다 — 새 재질이 그 그림을 문다', () => {
    const map = new DataTexture(new Uint8Array([107, 214, 255, 182]), 1, 1)
    let gone = false
    map.addEventListener('dispose', () => { gone = true })
    const lit = ownMap(new MeshLambertMaterial({ map, transparent: true, depthWrite: false }))
    unlitMaterial(lit)
    for (let i = 0; i < 64; i++) tickRetiredTextures()
    expect(gone).toBe(false)
  })
})

describe('풀포기 법선 (`Grass.tuftGeometry`)', () => {
  const geo = tuftGeometry(0x3f7a3a, 0x7fbf5a)

  it('법선이 전부 위다 — 잎이 어느 쪽을 향하든 땅과 같은 빛을 받는다', () => {
    const n = geo.getAttribute('normal')
    expect(n.count).toBe(geo.getAttribute('position').count)
    for (let i = 0; i < n.count; i++) expect([n.getX(i), n.getY(i), n.getZ(i)]).toEqual([0, 1, 0])
  })

  it('⚠️ 잎마다 앞뒤 두 벌을 감고 재질은 단면이다 — 양면 재질은 뒷면에서 법선을 뒤집는다', () => {
    expect(grassMaterial.side).toBe(FrontSide)
    const idx = Array.from(geo.getIndex()!.array as ArrayLike<number>)
    const tris = new Set<string>()
    for (let t = 0; t < idx.length; t += 3) tris.add(`${String(idx[t])},${String(idx[t + 1])},${String(idx[t + 2])}`)
    // 삼각형마다 감는 방향이 반대인 짝(같은 세 꼭짓점 · 순서만 뒤집힌 것)이 있어야 한다
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!]
      const back = [`${String(a)},${String(c)},${String(b)}`, `${String(c)},${String(b)},${String(a)}`,
        `${String(b)},${String(a)},${String(c)}`]
      expect(back.some((k) => tris.has(k)), `삼각형 ${String(t / 3)}의 뒷면`).toBe(true)
    }
  })
})

describe('BDSP 위에도 세울 원작 그림 (`keptOverBdsp`) — 연고 체육관 문 방', () => {
  it('행렬 223에서 문 소품 260과 바닥 표식 셋을 남기고 BDSP 벽까지 +0.5칸 민다', () => {
    const kept = keptOverBdsp(223)!
    expect([...kept.models]).toEqual([260])
    expect([...kept.textures].sort()).toEqual(['gm05_yuka_01', 'gm05_yuka_02', 'gm05_yuka_03'])
    expect(kept.shift).toEqual([0, 0, 0.5])
  })

  it('표에 없는 행렬은 아무것도 안 남긴다 — 바깥(0) · 입구 방(222) · 다섯 문 방(224)', () => {
    expect(keptOverBdsp(0)).toBeNull()
    expect(keptOverBdsp(222)).toBeNull()
    expect(keptOverBdsp(224)).toBeNull()
  })
})

withData('matrices/interiors.json', 'chunks/index.json', 'chunks/231.bin')('실제 자료 — 연고 체육관 문 방 (행렬 223)', () => {
  it('원작 배치가 문 셋 · 바닥 표식 셋이고 원작 북벽이 z 2.5다 — 표의 근거', () => {
    const json = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/matrices/interiors.json'), 'utf8')) as {
      matrices: Record<string, { chunks: { land: number }[], buildings: Record<string, { model: number, x: number, z: number }[]> }>
    }
    const m = json.matrices['223']!
    const doors = Object.values(m.buildings).flat().filter((b) => b.model === 260)
    expect(doors.map((b) => b.x).sort((a, b) => a - b)).toEqual([5.375, 9.375, 13.375])
    for (const d of doors) expect(d.z).toBe(2.375)
    expect(m.chunks.map((c) => c.land)).toEqual([231])

    const { meta, head, bytes } = open(231)
    const fmt = JSON.parse(readFileSync(resolve(DATA, 'index.json'), 'utf8')) as { posScale: number, vertexBytes: number }
    const names = meta.submeshes.map(([mat]) => meta.materials[mat]!.tex)
    for (const t of keptOverBdsp(223)!.textures) expect(names, t).toContain(t)
    // 북벽(`gym05_b`)의 세운 면이 놓인 z — 청크가 −16~+16으로 가운데 정렬이라 16을 더한다
    const at = (v: number): number[] => [0, 1, 2].map((k) => bytes.readInt16LE(head + v * fmt.vertexBytes + k * 2) / fmt.posScale)
    const idx = new Uint16Array(bytes.buffer.slice(
      bytes.byteOffset + head + meta.verts * fmt.vertexBytes, bytes.byteOffset + head + meta.verts * fmt.vertexBytes + meta.indices * 2))
    const wallZ = new Set<number>()
    for (const [mat, start, count] of meta.submeshes) {
      if (meta.materials[mat]!.tex !== 'gym05_b') continue
      for (let t = start; t < start + count; t += 3) {
        const v = [at(idx[t]!), at(idx[t + 1]!), at(idx[t + 2]!)]
        const zs = v.map((p) => p[2]! + 16)
        if (Math.max(...zs) - Math.min(...zs) < 1e-4 && zs[0]! < 4) wallZ.add(zs[0]!)
      }
    }
    expect([...wallZ]).toEqual([2.5])
  })
})

withData('props/index.json', 'props/26.bin', 'props/26.png')('실제 자료 — 장치가 세우는 꿀나무 (`featureTree`)', () => {
  it('⚠️ 잎 카드를 뺀 몸통과 입체 나무를 준다 — 원본을 그대로 그리면 도트 판 더미가 선다', async () => {
    const { loadPropMesh, loadPropSheet } = await import('./chunkMesh')
    const { installNodeAssets } = await import('../data/romData.testkit')
    installNodeAssets()
    const mesh = await loadPropMesh(26)
    const sheet = await loadPropSheet(26)
    const made = featureTree(26, mesh, sheet)!
    expect(made.tree.leaf).toEqual([0xc6ad39, 0xad9439, 0x947b39])
    expect(made.mesh.geometry, '몸통은 잎 카드를 접어 뺀 사본이다').not.toBe(mesh.geometry)
    expect(made.mesh.materials).toBe(mesh.materials)
    // 접어 뺀 삼각형은 넓이가 0이다 — 잎 카드 여섯 장 몫
    const idx = made.mesh.geometry.getIndex()!.array as ArrayLike<number>
    let folded = 0
    for (let t = 0; t < idx.length; t += 3) if (idx[t] === idx[t + 1] && idx[t] === idx[t + 2]) folded += 1
    expect(folded).toBe(6)
  }, 60_000)

  it('레시피가 없는 소품은 null — 원본 그대로 그린다', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
    geometry.setIndex([0, 1, 2])
    expect(featureTree(999_999, {
      geometry, materials: [{ tex: 'x', pal: 'x_pl', rep: 0, a: 31, f: 2 }], groups: [[0, 0, 3]],
    }, null)).toBeNull()
  })
})

describe('깊이 우선순위 — 건물 · 소품은 땅보다 늘 앞선다 (`propPriority`)', () => {
  /** 그림 없는 서브메시 셋 — `makeMaterial(spec, null)`로 만들어져 그림표가 필요 없다 */
  const mesh = (): Parameters<typeof materialsFor>[0] => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
    return {
      geometry,
      materials: [0, 1, 2].map((d) => ({ tex: null, pal: null, rep: 0, a: 31, f: 2, d: [d, d, d] })),
      groups: [[0, 0, 3], [1, 0, 0], [2, 0, 0]],
    }
  }
  const offsets = (list: Material[]): [boolean, number, number][] =>
    list.map((m) => [m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits])

  it('땅은 차례마다 한 눈금씩 · 기울기 몫 −1 — 비껴 본 바닥에서도 차례가 안 뒤집힌다', () => {
    expect(DEPTH_SLOPE).toBe(-1)
    expect(offsets(materialsFor(mesh(), null, new Map()))).toEqual([[true, -1, -1], [true, -1, -2], [true, -1, -3]])
  })

  it('소품은 땅의 어느 눈금보다 앞에서 센다 — 파이트에어리어 관문 바닥 · 아스팔트', () => {
    const got = offsets(materialsFor(mesh(), null, new Map(), [true, true, true], undefined, undefined, 'prop'))
    expect(got).toEqual([[true, -1, -PROP_DEPTH_BASE], [true, -1, -PROP_DEPTH_BASE - 1], [true, -1, -PROP_DEPTH_BASE - 2]])
    const strip = new MeshBasicMaterial()
    propPriority(strip, 3)
    expect(offsets([strip])).toEqual([[true, -1, -PROP_DEPTH_BASE - 3]])
  })

  it('⚠️ 한 보관함을 나눠 써도 층이 안 섞인다 — 열쇠에 층이 든다', () => {
    const cache = new Map<string, Material>()
    const land = materialsFor(mesh(), null, cache, [true, true, true])
    const prop = materialsFor(mesh(), null, cache, [true, true, true], undefined, undefined, 'prop')
    for (let i = 0; i < 3; i++) expect(prop[i]).not.toBe(land[i])
    expect(land[0]!.polygonOffsetUnits).toBe(-1)
  })
})

maybe('실제 자료 — 땅의 눈금이 소품 몫에 안 닿는다 (`PROP_DEPTH_BASE`)', () => {
  it('청크 한 벌의 서브메시 수가 소품 첫 눈금보다 적다', async () => {
    const { readdirSync } = await import('node:fs')
    let most = 0
    for (const f of readdirSync(DATA)) {
      if (!/^\d+\.bin$/.test(f)) continue
      most = Math.max(most, open(Number(f.slice(0, -4))).meta.submeshes.length)
    }
    expect(most).toBe(42)
    expect(most).toBeLessThan(PROP_DEPTH_BASE)
  }, 60_000)
})
