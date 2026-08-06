// 판때기 나무를 걷어낸다 (DATA.md §2.2)
//
// 원작 필드의 나무는 **사각형 한 장**이다. 정점 4개짜리 판에 그림을 붙였고,
// 오버월드에 3만 장이 있다. 원작 카메라가 고정 각도라 그걸로 충분했다.
//
// 1인칭으로 서면 옆과 뒤에서 종잇장이 된다. **빌보드로 세울 수도 없다** —
// 그림이 나무를 *위에서 내려다본* 모양이라(잎 뭉치 아래로 그루터기가 보인다)
// 카메라 쪽으로 세우면 잎 원반이 서 있는 꼴이 된다. 진짜 지오메트리를 세운다.
//
// **판 단위로 세지 않는다.** 실측해 보면 숲 벽 하나가 판 넉 장이 겹쳐 쌓인 것이다:
//
//   x -14~-6, z 14~16    conttree_b y 1.06~1.06 (평평) · 1.45~2.67
//                        conttree_t y 2.15~3.23 · 2.86~3.64
//
// 판마다 나무를 세우면 같은 자리에 네 줄이 겹쳐 브로콜리가 된다. 게다가 높이가
// 0인 평평한 판은 *위에서 본 숲 지붕*이라 걸러 두면 땅에 그림으로 남는다.
// 그래서 **잎이 덮은 땅을 1타일 격자로 칠하고** 그 위에 일정 간격으로 세운다 —
// 몇 겹이든 눕든 서든 저절로 합쳐진다.
//
// **무엇이 잎인지는 잰 값으로 먼저 거른다.** 기울기와 크기만 보면 경사로·계단
// (`c3_slope1` · `gate_step1` · `gym08_step`)이 같은 조건에 걸려 지형이 지워진다.
// 가르는 것은 **텍스처의 투명 픽셀**이다:
//
//   오려 낸 그림 (`tree01` 41.7% · `conttree_t` 56.4% · `imped` 45.3%)  31.9~85.9%
//   지형 (`c3_slope1` · `gate_step1` · `criffp` · `hamabe`)             전부 0.0%
//
// 겹치는 값이 하나도 없다.
import { BufferGeometry, type BufferAttribute } from 'three'
import type { ChunkMesh, TexSheet } from './chunkMesh'

/** 이 값을 넘게 투명하면 오려 낸 그림이다. 지형은 전부 0%라 경계에 여유가 크다 */
const CUTOUT_ALPHA = 0.05
/** 알파 판정 문턱. 재질이 쓰는 `alphaTest: 0.5`와 같은 자리다 */
const ALPHA_CUT = 128

/**
 * 잎으로 치는 텍스처.
 *
 * 투명도로 "오려 낸 그림"까지는 가려지지만, 그중 무엇이 나무이고 무엇이
 * 울타리·바위인지는 모양이 아니라 **쓰임**이라 잴 수가 없다. 롬이 붙인 이름을
 * 쓴다 — 우리가 지어낸 분류가 아니라 원작 자료의 이름이다.
 *
 * 이 규칙이 놓치는 것은 실측으로 `bf_ueki01`(화단, 96장)과 `bf_zou`(4장)뿐이다
 */
const FOLIAGE_NAME = /^(cont)?tree|_tree|treeg/

/**
 * 긴 풀로 치는 텍스처. **자리를 고르는 데는 안 쓴다** — 어디가 풀숲인지는
 * 타일 거동값이 말한다(`Grass.tsx`). 여기서는 색만 가져온다
 */
const GRASS_NAME = /grass|kusa|shiba/

/**
 * 물로 치는 텍스처. **자리를 고르는 데는 안 쓴다** — 어디가 물인지는 거동값
 * `0x0015`·`0x0010`이 말한다(`Water.tsx`). 여기서는 색만 가져온다
 */
const WATER_NAME = /^(sea|lake|asasea|dun_sea)/

/** 격자 칸 열쇠. 청크 로컬 좌표가 −48~+48이라 128을 더해 음수를 없앤다 */
const KEY_BIAS = 128
const KEY_SPAN = 512
export const cellKey = (tx: number, tz: number): number =>
  (tx + KEY_BIAS) * KEY_SPAN + (tz + KEY_BIAS)
export const cellX = (key: number): number => Math.floor(key / KEY_SPAN) - KEY_BIAS
export const cellZ = (key: number): number => (key % KEY_SPAN) - KEY_BIAS

export interface Cell {
  /** 이 칸을 덮은 잎의 높이 범위 */
  minY: number
  maxY: number
  /** 서브메시 번호. 색을 여기서 가져온다 */
  group: number
}

export interface Split {
  /** 잎이 덮은 칸. 여기에 나무를 세운다 */
  cells: Map<number, Cell>
  /** 잎을 뺀 나머지. 그대로 그리면 된다 */
  geometry: BufferGeometry
  /**
   * 새 그룹 `[시작, 개수, 서브메시]`.
   *
   * 셋째 값은 **서브메시 번호**다. 롬의 재질 번호가 아니다 — 청크 666개 중
   * 647개에서 둘이 어긋나 있고(청크 0: 서브메시 0이 재질 4다), three가 이
   * 값으로 재질 배열을 색인하는데 그 배열은 `chunkMesh.build`와 마찬가지로
   * 서브메시 순서다. 재질 번호를 넣으면 땅이 나무 그림으로 그려진다
   */
  groups: [number, number, number][]
}

/**
 * 서브메시마다 "그림에 투명한 데가 있는가"를 잰다.
 *
 * 시트 픽셀이 이미 메모리에 있으므로 한 번 훑으면 끝난다. 텍스처가 없는
 * 서브메시는 자를 것이 없으니 false다
 */
export function cutoutGroups(mesh: ChunkMesh, sheet: TexSheet | null): boolean[] {
  if (!sheet) return mesh.materials.map(() => false)
  return mesh.materials.map((spec) => {
    const item = sheet.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
    if (!item) return false
    let clear = 0
    for (let y = 0; y < item.h; y++) {
      const row = ((item.y + y) * sheet.width + item.x) * 4
      for (let x = 0; x < item.w; x++) if (sheet.pixels[row + x * 4 + 3]! < ALPHA_CUT) clear++
    }
    return clear / (item.w * item.h) > CUTOUT_ALPHA
  })
}

/** 이 서브메시가 잎인가. 오려 낸 그림이면서 이름이 나무여야 한다 */
export function isFoliage(mesh: ChunkMesh, group: number, cutout: readonly boolean[]): boolean {
  return cutout[group] === true && FOLIAGE_NAME.test(mesh.materials[group]?.tex ?? '')
}

/**
 * 잎을 걷어내고 덮은 칸을 돌려준다.
 *
 * 원본 지오메트리는 손대지 않는다 — 청크는 캐시돼 있고 텍스처 묶음이 다르면
 * 잘라 낼 것도 달라진다
 */
export function splitFoliage(mesh: ChunkMesh, cutout: readonly boolean[]): Split {
  const src = mesh.geometry
  const position = (src.getAttribute('position') as BufferAttribute).array as Float32Array
  const index = src.getIndex()!.array
  const cells = new Map<number, Cell>()
  const kept: number[] = []
  const groups: [number, number, number][] = []

  mesh.groups.forEach(([, start, count], group) => {
    const begin = kept.length
    const foliage = isFoliage(mesh, group, cutout)
    for (let t = 0; t < count; t += 3) {
      const a = index[start + t]!, b = index[start + t + 1]!, c = index[start + t + 2]!
      if (!foliage) { kept.push(a, b, c); continue }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      let z0 = Infinity, z1 = -Infinity
      for (const i of [a, b, c]) {
        const x = position[i * 3]!, y = position[i * 3 + 1]!, z = position[i * 3 + 2]!
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        if (z < z0) z0 = z
        if (z > z1) z1 = z
      }
      // 삼각형이 걸친 칸을 전부 칠한다. −0.01은 딱 경계에서 끝나는 면이 다음
      // 칸까지 물들이는 것을 막는다 — 판이 정수 좌표에 딱 맞춰 놓여 있다
      for (let tz = Math.floor(z0); tz <= Math.floor(z1 - 0.01); tz++) {
        for (let tx = Math.floor(x0); tx <= Math.floor(x1 - 0.01); tx++) {
          const key = cellKey(tx, tz)
          const hit = cells.get(key)
          if (hit) {
            if (y0 < hit.minY) hit.minY = y0
            if (y1 > hit.maxY) hit.maxY = y1
          } else cells.set(key, { minY: y0, maxY: y1, group })
        }
      }
    }
    groups.push([begin, kept.length - begin, group])
  })

  const geometry = new BufferGeometry()
  for (const name of ['position', 'uv', 'color', 'normal']) {
    const attr = src.getAttribute(name)
    if (attr) geometry.setAttribute(name, attr)
  }
  geometry.setIndex(kept)
  for (const [start, count, group] of groups) {
    if (count > 0) geometry.addGroup(start, count, group)
  }
  geometry.boundingSphere = src.boundingSphere
  return { cells, geometry, groups }
}

/**
 * 쪼갠 결과 보관함.
 *
 * 청크 경계를 넘을 때마다 창 안 25개를 전부 다시 쪼개면 그 순간 끊긴다.
 * 한 청크는 늘 같은 결과를 내므로 한 번만 하면 된다 — 열쇠에 텍스처 묶음이
 * 들어가는 이유는 오려 낸 판인지가 그 묶음의 그림에 달려 있어서다
 */
const splitCache = new Map<string, Split>()

export function cachedSplit(key: string, mesh: ChunkMesh, cutout: readonly boolean[]): Split {
  const hit = splitCache.get(key)
  if (hit) return hit
  const made = splitFoliage(mesh, cutout)
  splitCache.set(key, made)
  return made
}

/**
 * 그림에서 잎 색과 줄기 색을 뽑는다.
 *
 * **색을 우리가 고르지 않는다.** 원작 텍스처에 실제로 많이 쓰인 색을 세서
 * 쓴다 — 아무 초록이나 칠하면 지역마다 다른 원작 색조(떡잎 숲과 무쇠탄갱이
 * 다르다)가 통째로 사라진다. 4세대 텍스처는 팔레트라 색 수가 적어 세면 된다.
 *
 * 잎 색은 **밝은 것부터** 준다. 원작 그림이 위에서 본 것이라 밝은 쪽이 햇빛
 * 받는 면이고, 그대로 세우면 어느 덩이가 위인지 빛이 말해 준다
 */
export function plateColors(
  sheet: TexSheet, item: { x: number; y: number; w: number; h: number },
): { leaf: number[]; trunk: number } {
  const count = new Map<number, number>()
  for (let y = 0; y < item.h; y++) {
    const row = ((item.y + y) * sheet.width + item.x) * 4
    for (let x = 0; x < item.w; x++) {
      const o = row + x * 4
      if (sheet.pixels[o + 3]! < ALPHA_CUT) continue
      const rgb = (sheet.pixels[o]! << 16) | (sheet.pixels[o + 1]! << 8) | sheet.pixels[o + 2]!
      count.set(rgb, (count.get(rgb) ?? 0) + 1)
    }
  }
  const ranked = [...count].sort((a, b) => b[1] - a[1]).map(([rgb]) => rgb)
  // 줄기는 붉은 기가 파랑보다 뚜렷하고 밝지 않은 색이다
  const trunk = ranked.find(brownish) ?? ranked[ranked.length - 1] ?? 0x4a3a24
  const leaf = ranked.filter((c) => c !== trunk).slice(0, 3).sort((a, b) => luma(b) - luma(a))
  return { leaf: leaf.length > 0 ? leaf : [0x4f9e52], trunk }
}

/**
 * 풀 색 두 가지 — 밑동과 끝.
 *
 * 그 영역의 풀 그림에서 제일 많이 쓰인 색을 밝기로 세운다. 밝은 쪽이 끝이다:
 * 원작 그림이 위에서 본 것이라 밝은 픽셀이 잎 윗면이다. 풀 그림이 없는 묶음은
 * 풀숲도 없어서 안 쓰이지만, 그래도 초록 한 쌍은 돌려준다
 */
export function grassColors(sheet: TexSheet | null): [number, number] {
  const item = sheet?.items.find((s) => GRASS_NAME.test(s.tex))
  if (!sheet || !item) return [0x2f6b34, 0x69bf5c]
  const { leaf } = plateColors(sheet, item)
  const dark = leaf[leaf.length - 1] ?? 0x2f6b34
  const light = leaf[0] ?? 0x69bf5c
  return [dark, light]
}

/**
 * 물 색 두 가지 — 마루와 골.
 *
 * 그 영역의 물 그림에서 제일 많이 쓰인 색을 밝기로 세운다. 아무 파랑이나 칠하면
 * 예진호수와 바다가 같은 색이 된다. 물 그림이 없는 묶음은 물도 없지만, 그래도
 * 파랑 한 쌍은 돌려준다
 */
export function waterColors(sheet: TexSheet | null): [number, number] {
  const item = sheet?.items.find((s) => WATER_NAME.test(s.tex))
  if (!sheet || !item) return [0x6fa8d6, 0x2f5f96]
  // ⚠️ `plateColors`를 그대로 쓰면 안 된다. 저쪽은 **줄기 색을 하나 빼는데**
  // 물에는 줄기가 없어서, 색이 둘뿐인 그림에서 하나가 통째로 사라진다
  const count = new Map<number, number>()
  for (let y = 0; y < item.h; y++) {
    const row = ((item.y + y) * sheet.width + item.x) * 4
    for (let x = 0; x < item.w; x++) {
      const o = row + x * 4
      if (sheet.pixels[o + 3]! < ALPHA_CUT) continue
      const rgb = (sheet.pixels[o]! << 16) | (sheet.pixels[o + 1]! << 8) | sheet.pixels[o + 2]!
      count.set(rgb, (count.get(rgb) ?? 0) + 1)
    }
  }
  // 많이 쓰인 넷 안에서 제일 밝은 것과 어두운 것. 넷을 넘겨 보면 물 그림에
  // 섞인 물가 흙색까지 딸려 온다
  const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([rgb]) => rgb)
  if (top.length === 0) return [0x6fa8d6, 0x2f5f96]
  const sorted = top.sort((a, b) => luma(b) - luma(a))
  return [sorted[0]!, sorted[sorted.length - 1]!]
}

function luma(rgb: number): number {
  return ((rgb >> 16) & 255) * 0.3 + ((rgb >> 8) & 255) * 0.6 + (rgb & 255) * 0.1
}

function brownish(rgb: number): boolean {
  const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255
  return r > b + 16 && r >= g && r < 200
}
