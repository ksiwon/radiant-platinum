import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import { fieldWeatherKind, weatherFogProfile, weatherProfile } from './weatherVisual'
import { flakeAlpha, flakeNear, roofCells, underRoof } from './FieldWeather'
import type { ChunkMesh } from './chunkMesh'
import { withData } from '../data/romData.testkit'

describe('overworld 3D weather', () => {
  it('maps the original weather ids into visual families', () => {
    expect(fieldWeatherKind(2)).toBe('rain')
    expect(fieldWeatherKind(7)).toBe('blizzard')
    expect(fieldWeatherKind(10)).toBe('sand')
    expect(fieldWeatherKind(14)).toBe('fog')
    expect(fieldWeatherKind(34)).toBe('snow')
  })

  it('keeps unknown special map effects out of generic weather', () => {
    expect(fieldWeatherKind(29)).toBe('clear')
  })

  it('uses more particles and tighter fog for severe weather', () => {
    expect(weatherProfile('storm')!.count).toBeGreaterThan(weatherProfile('rain')!.count)
    expect(weatherFogProfile('blizzard').farScale).toBeLessThan(weatherFogProfile('snow').farScale)
  })
})

type Tri = readonly (readonly [number, number, number])[]

/** 삼각형 목록으로 소품 메시 하나 */
function meshOf(tris: readonly Tri[]): ChunkMesh {
  const position = new Float32Array(tris.flatMap((t) => t.flat()))
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setIndex(Array.from({ length: tris.length * 3 }, (_, i) => i))
  return { geometry, materials: [], groups: [] }
}

/** 소품 밑동 기준 높이 `y`에 누운 x0~x1 · z0~z1 판 (삼각형 둘) */
function slab(x0: number, x1: number, z0: number, z1: number, y: number): Tri[] {
  return [
    [[x0, y, z0], [x0, y, z1], [x1, y, z1]],
    [[x0, y, z0], [x1, y, z1], [x1, y, z0]],
  ]
}

describe('지붕 밑에는 비가 안 든다', () => {
  it('누운 지붕 판이 덮은 칸과 그 둘레 한 칸이 지붕 밑이다', () => {
    // 밑동 (10, 1, 20)에 두 칸 × 한 칸짜리 지붕이 4칸 높이에 있다
    const roofs = roofCells([{ at: { x: 10, y: 1, z: 20 }, mesh: meshOf(slab(0, 2, 0, 1, 4)) }])
    // 지붕 칸 10~11 · 20, 벽까지 한 칸 번져 9~12 · 19~21
    expect(roofs.size).toBe(4 * 3)
    expect(underRoof(roofs, 10.5, 2, 20.5)).toBe(true)
    expect(underRoof(roofs, 9.1, 2, 19.1)).toBe(true)
    expect(underRoof(roofs, 12.9, 2, 21.9)).toBe(true)
    // 지붕 위 · 둘레 밖은 그대로 내린다
    expect(underRoof(roofs, 10.5, 5.1, 20.5)).toBe(false)
    expect(underRoof(roofs, 13.1, 2, 20.5)).toBe(false)
    expect(underRoof(roofs, 10.5, 2, 18.9)).toBe(false)
  })

  it('사람 키보다 낮은 판은 지붕이 아니다 — 바닥 판 · 수영장 · 컨테이너', () => {
    for (const y of [0, 0.41, 1.88]) {
      expect(roofCells([{ at: { x: 0, y: 1, z: 0 }, mesh: meshOf(slab(0, 2, 0, 2, y)) }]).size, String(y)).toBe(0)
    }
  })

  it('기울인 판은 지붕이 아니다 — 칸당 1.45씩 오르는 화산 연기', () => {
    const smoke = meshOf([
      [[0, 1, 0], [0, 10, -6.2], [6, 10, -6.2]],
      [[0, 1, 0], [6, 10, -6.2], [6, 1, 0]],
    ])
    expect(roofCells([{ at: { x: 0, y: 0, z: 0 }, mesh: smoke }]).size).toBe(0)
  })

  it('선 판(문짝 · 폭포)은 지붕이 아니다', () => {
    const door = meshOf([[[0, 0, 0], [0, 3, 0], [2, 3, 0]], [[0, 0, 0], [2, 3, 0], [2, 0, 0]]])
    expect(roofCells([{ at: { x: 0, y: 0, z: 0 }, mesh: door }]).size).toBe(0)
  })

  it('Y축 회전을 `ChunkModels`의 소품 상자와 같은 방향으로 돈다', () => {
    // x로 긴 판을 90° 돌리면 −z로 눕는다 (x' = x·cos + z·sin, z' = −x·sin + z·cos)
    const roofs = roofCells([{
      at: { x: 0, y: 0, z: 0, rot: [0, Math.PI / 2, 0], scale: [1, 1, 1] },
      mesh: meshOf(slab(0, 5, 0, 1, 3)),
    }])
    expect(underRoof(roofs, 0.5, 1, -3.5)).toBe(true)
    expect(underRoof(roofs, 3.5, 1, 0.5)).toBe(false)
  })
})

/** 소품 파일 하나를 `ChunkMesh` 모양으로 읽는다 — `chunkMesh.build`와 같은 규격 */
function readProp(id: number): ChunkMesh {
  const DATA = resolve(__dirname, '../../public/data')
  const fmt = JSON.parse(readFileSync(resolve(DATA, 'chunks/index.json'), 'utf8')) as {
    posScale: number; vertexBytes: number
  }
  const buf = readFileSync(resolve(DATA, `props/${String(id)}.bin`))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const view = new DataView(ab)
  const metaLen = view.getUint32(4, true)
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, metaLen))) as {
    verts: number; indices: number
  }
  const head = 8 + metaLen + ((4 - (metaLen % 4)) % 4)
  const position = new Float32Array(meta.verts * 3)
  for (let i = 0; i < meta.verts; i++) {
    for (let a = 0; a < 3; a++) {
      position[i * 3 + a] = view.getInt16(head + i * fmt.vertexBytes + a * 2, true) / fmt.posScale
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setIndex([...new Uint16Array(ab, head + meta.verts * fmt.vertexBytes, meta.indices)])
  return { geometry, materials: [], groups: [] }
}

/** 칸 x0~x1 · z0~z1이 높이 `y`에서 전부 지붕 밑인가 — 아닌 칸을 돌려준다 */
function uncovered(
  roofs: ReadonlyMap<number, number>, x0: number, x1: number, z0: number, z1: number, y: number,
): string[] {
  const out: string[] = []
  for (let tz = z0; tz <= z1; tz++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!underRoof(roofs, tx + 0.5, y, tz + 0.5)) out.push(`${String(tx)},${String(tz)}`)
    }
  }
  return out
}

withData('props/40.bin', 'props/39.bin', 'props/585.bin')('원작 소품이 지붕을 말한다', () => {
  it('213번도로 관문 — BDSP 관문(x639.5~646.5 · z810.1~815.9 · 밑동+4) 안이 다 지붕 밑이다', () => {
    const roofs = roofCells([{ at: { x: 643, y: 1, z: 813 }, mesh: readProp(40) }])
    // 실내 바닥(y 1)과 천장 밑 사이
    for (const y of [1.2, 3, 4.5]) expect(uncovered(roofs, 639, 646, 810, 815, y), `y ${String(y)}`).toEqual([])
    // 지붕은 밑동 위 3.7~3.9다 — 그 위로는 내린다
    expect(underRoof(roofs, 643.5, 5.0, 813.5)).toBe(false)
    // 문간 바깥(동쪽 워프 646의 한 칸 더 동쪽)과 관문 북쪽 숲은 비가 내린다
    expect(underRoof(roofs, 647.5, 2, 812.5)).toBe(false)
    expect(underRoof(roofs, 643.5, 2, 808.5)).toBe(false)
  })

  it('연고시티 관문 — BDSP 관문(x456.1~461.9 · z676.4~684.6) 안이 다 지붕 밑이다', () => {
    const roofs = roofCells([{ at: { x: 459, y: 2, z: 681 }, mesh: readProp(39) }])
    // 워프(458·459, 683)까지가 관문 칸이다 — 통행값이 그 줄까지 막혀 있다
    expect(uncovered(roofs, 456, 461, 677, 683, 3)).toEqual([])
    // z684는 관문 앞 광장(통행값이 열려 있다)인데 BDSP 처마가 0.6칸 나와 있다. 문 앞 네 칸만 처마 밑이다 —
    // 양 끝(456 · 461)은 원작 지붕 칸에서 두 칸 떨어져 번짐이 안 닿는다
    expect(uncovered(roofs, 457, 460, 684, 684, 3)).toEqual([])
    expect(underRoof(roofs, 459.5, 3, 685.5)).toBe(false)
  })

  it('하드마운틴 화산 연기(585)는 22칸을 덮어도 지붕이 아니다 — 화산재가 안 빠진다', () => {
    expect(roofCells([{ at: { x: 756.5, y: 2.5, z: 231.5 }, mesh: readProp(585) }]).size).toBe(0)
  })
})

describe('눈송이는 둥글고 부드럽다', () => {
  it('한가운데는 꽉 차고 가장자리는 0이다', () => {
    expect(flakeAlpha(0)).toBe(1)
    expect(flakeAlpha(0.2)).toBe(1)
    expect(flakeAlpha(1)).toBe(0)
    expect(flakeAlpha(1.4)).toBe(0)
  })

  it('반투명 절반 자리가 반지름 0.6이다 — 판 0.25에서 지름 0.15, 예전 팔면체와 같다', () => {
    expect(flakeAlpha(0.6)).toBeCloseTo(0.5, 6)
  })

  it('밖으로 갈수록 한 번도 안 짙어진다', () => {
    let last = 1
    for (let r = 0; r <= 1.2; r += 0.01) {
      const a = flakeAlpha(r)
      expect(a).toBeLessThanOrEqual(last + 1e-12)
      last = a
    }
  })

  it('가까운 송이는 화면 크기가 묶인다 — 3인칭 곁 송이의 두 배를 안 넘는다', () => {
    // 세로 화각 55°, 화면 800px이면 한가운데가 768px/라디안이다 (`FIELD_FOV`)
    const pxPerRad = 400 / Math.tan((55 / 2) * (Math.PI / 180))
    const diameter = 0.15 * 0.9
    const third = (diameter / Math.hypot(8, 4)) * pxPerRad
    let biggest = 0
    for (let d = 0.05; d <= 30; d += 0.05) biggest = Math.max(biggest, ((diameter * flakeNear(d)) / d) * pxPerRad)
    expect(third).toBeCloseTo(11.6, 1)
    expect(biggest).toBeLessThanOrEqual(2 * third + 1e-9)
    // 예전에는 1.5칸 앞에서 69px이었다
    expect((diameter / 1.5) * pxPerRad).toBeGreaterThan(69)
    // 멀리서는 그대로다
    expect(flakeNear(10)).toBe(1)
    expect(flakeNear(0)).toBe(0)
  })
})
