// 둥근 건물의 빈 뒤를 **몸통으로** 닫는다 (REPAIR §161)
//
// 메운 판(`shell.shellPlates`)은 그 방향에서 본 실루엣을 축에 맞춘 판으로 눌러 붙이고, 판의 깊이는 세 축 실루엣이
// 겹치는 **비주얼 헐**에서 읽는다. 상자 같은 집은 헐이 곧 집이라 판이 없는 벽 자리에 선다. 그런데 **둥근 건물은 헐이
// 건물보다 크다** — 원뿔을 옆에서 본 삼각형과 위에서 본 십각형을 겹친 헐은 원뿔 밖으로 부푼다. 판이 원작 면 **앞에**
// 선다.
//
// 배틀프런티어의 천막(소품 540 · 맵 559)이 그 꼴이다. 판이 그 방향에서 보이는 원작 면을 −X 64% · +X 86% · +Y 66% ·
// −Z 65% 가렸다(판이 원작 면보다 0.25타일 넘게 앞에 선 칸 ÷ 그 방향에서 보이는 원작 면 칸). 게다가 몸통에 **도는
// 조명 두 줄기**(서브메시 7·8 · 노드 1·2 · `BCA0` 121프레임)가 들어 있어서, 그 기본 자세의 실루엣이 −X·+Y를
// 「뚫린 방향」으로 만들고 헐을 z −9.6~8.4까지 늘렸다. 15m짜리 비스듬한 판이 그렇게 섰고, 띠 그림이 벽 그림의 한
// 줄(#efef9c)만 읽어 노랗게 칠했다 — 정원에서 본 「노란 반투명 덩어리」다(`--blame=250,420` → 띠 판 `prop-band`).
//
// 그래서 판을 **안 세우고**, 원작이 실제로 빠뜨린 것만 닫는다. 천막은 지붕 처마 고리(정십각형 · 반지름 7.1)가 한
// 바퀴 다 있고 **벽만 앞 절반**이다. 비어 있는 뒤쪽 호를 처마 고리 꼭짓점을 따라 바닥에서 처마 밑까지 세우고,
// 원작 벽을 높이별 한 색으로 접은 띠(`ringStrip`)를 바른다 — 다른 집의 메운 면과 같은 표현이다
import { BufferAttribute, BufferGeometry } from 'three'
import type { ChunkMesh, TexSheet } from './chunkMesh'
import { stripGroup } from './shell'

/** 둥근 건물 하나의 닫을 자리 */
interface RingBack {
  /** 처마 고리를 가진 지붕 서브메시 */
  roof: number
  /** 이보다 낮은 지붕 꼭짓점만 처마 고리로 친다 — 위쪽은 원뿔 몸이다 */
  below: number
  /** 원작 벽 서브메시 — 띠 그림을 여기서 읽는다. 첫째의 재질 명세(알파·불투명도)를 띠가 물려받는다 */
  walls: readonly number[]
  /** 원작 벽 층의 높이 범위 `[바닥, 위끝]` — 이 범위를 띠 하나로 접고, 몸통은 바닥에서 처마 밑까지 그 띠를 늘려 바른다 */
  span: readonly [number, number]
  /**
   * 원작 벽이 끝나는 두 자리 `[x, z]`. 이 사이의 호를 **각이 커지는 쪽으로** 돌며 닫는다.
   * 각은 처마 고리 한가운데에서 잰다
   */
  from: readonly [number, number]
  to: readonly [number, number]
}

/**
 * 판 대신 몸통으로 닫는 소품. **소품 번호로 고른다.**
 *
 * ⚠️ 판이 원작 면을 가리는 정도는 소품마다 재 두었다(판이 원작 면보다 0.25타일 넘게 앞에 선 칸 수 · 소품 590종).
 * 천막 540이 4,285칸으로 셋째다. 앞의 둘(470 `kingSta` 7,235 · 300 체육관 바닥 4,424)과 뒤를 잇는 프런티어 건물
 * 541(3,786) · 542(3,140)는 둥근 처마 고리가 없어 이 몸통이 안 맞는다 — 손대지 않았다
 */
export const RING_BACKS: ReadonlyMap<number, RingBack> = new Map([
  // 처마 고리 열 꼭짓점의 처마 밑 높이가 5.34(−x)~6.71(+x)로 기울어 있다. 벽은 바닥 0.19 · 위끝 5.34이고,
  // 고리의 −161.7°(−5.27, −3.39)에서 앞을 돌아 문틀 뒤 기둥(8.66, −0.5)까지만 있다
  [540, {
    roof: 5, below: 7.5, walls: [6, 1], span: [0.1875, 5.34375],
    from: [-5.266, -3.391], to: [8.664, -0.5],
  }],
])

/** 처마 고리 — 지붕 한가운데와, 각 순서로 늘어선 꼭짓점 `[각, x, z, 처마 밑 높이]` */
export function eaveRing(mesh: ChunkMesh, spec: RingBack): {
  center: [number, number]
  corners: [number, number, number, number][]
} | null {
  const group = mesh.groups[spec.roof]
  if (!group) return null
  const [, start, count] = group
  const pos = mesh.geometry.getAttribute('position') as BufferAttribute
  const index = mesh.geometry.getIndex()!
  // 같은 자리 위아래로 두 꼭짓점(처마 띠의 위·아래 끝)이 있다 — 아래 것이 처마 밑이다
  const low = new Map<string, [number, number, number]>()
  for (let k = start; k < start + count; k++) {
    const i = index.getX(k)
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    if (!(y < spec.below)) continue
    const key = `${x.toFixed(2)},${z.toFixed(2)}`
    const was = low.get(key)
    if (!was || y < was[1]) low.set(key, [x, y, z])
  }
  if (low.size < 3) return null
  // 한가운데는 **상자 한가운데**로 잡는다 — 평균으로 잡으면 겹쳐 선 꼭짓점(천막 +x 쪽에 넷)만큼 끌려간다
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const [x, , z] of low.values()) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z)
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
  const corners = [...low.values()]
    .map(([x, y, z]): [number, number, number, number] => [Math.atan2(z - cz, x - cx), x, z, y])
    .sort((a, b) => a[0] - b[0])
  return { center: [cx, cz], corners }
}

/** 그 각에서 처마 밑 높이 — 이웃한 두 꼭짓점 사이를 각으로 잇는다 */
function eaveAt(corners: readonly [number, number, number, number][], angle: number): number {
  const n = corners.length
  for (let k = 0; k < n; k++) {
    const a = corners[k]!, b = corners[(k + 1) % n]!
    const a0 = a[0], a1 = k + 1 < n ? b[0] : b[0] + 2 * Math.PI
    let t = angle
    if (t < a0) t += 2 * Math.PI
    if (t >= a0 && t <= a1) return a[3] + (b[3] - a[3]) * ((t - a0) / (a1 - a0 || 1))
  }
  return corners[0]![3]
}

/** 처마를 따라 도는 몸통의 아랫변 꼭짓점 `[x, z, 처마 밑 높이]` — `from`에서 `to`까지 */
export function ringPath(mesh: ChunkMesh, spec: RingBack): {
  center: [number, number]
  path: [number, number, number][]
} | null {
  const ring = eaveRing(mesh, spec)
  if (!ring) return null
  const [cx, cz] = ring.center
  const turn = (a: number, from: number): number => (a < from ? a + 2 * Math.PI : a)
  const a0 = Math.atan2(spec.from[1] - cz, spec.from[0] - cx)
  const a1 = turn(Math.atan2(spec.to[1] - cz, spec.to[0] - cx), a0 + 1e-9)
  /** 끝자리와 거의 겹치는 꼭짓점은 건너뛴다 — 벽 끝이 곧 고리 꼭짓점인 쪽이 있다 (천막의 −161.7°) */
  const NEAR = Math.PI / 180
  const inner = ring.corners
    .map(([a, x, z, y]) => [turn(a, a0), x, z, y] as const)
    .filter(([t]) => t > a0 + NEAR && t < a1 - NEAR)
    .sort((p, q) => p[0] - q[0])
    .map(([, x, z, y]): [number, number, number] => [x, z, y])
  return {
    center: ring.center,
    path: [
      [spec.from[0], spec.from[1], eaveAt(ring.corners, a0)],
      ...inner,
      [spec.to[0], spec.to[1], eaveAt(ring.corners, a1)],
    ],
  }
}

/** 옆벽으로 칠 만큼 세로인가 — `shell`의 옆벽 문턱과 같은 값이다 */
const WALLISH = 0.5
/** 알파 판정 문턱. 재질이 쓰는 `alphaTest: 0.5`와 같은 자리다 */
const ALPHA_CUT = 128
/** 삼각형 하나를 몇 칸으로 쪼개 읽는가 (한 변 기준) */
const SAMPLES = 12

/** 0~1로 되접는다. 원작 UV는 칸마다 0~1이고 밖으로 넘어가면 물린다 (`shell.wallStrip`과 같다) */
const wrap01 = (x: number): number => x - Math.floor(x)

/**
 * 원작 벽을 **높이별 한 색으로 접은 띠**. 폭 1텍셀 × 높이 `h`텍셀, 아래(`span[0]`)에서 위로.
 *
 * ⚠️ **`shell.wallStrip`처럼 벽의 위아래 끝 v로 높이를 읽으면 안 된다.** 천막 벽은 층마다 따로 감긴 띠라 맨 아래와
 * 맨 위 꼭짓점의 v가 둘 다 0.15625다 — 그렇게 읽으면 서른두 줄이 전부 #efef9c 한 색이 된다(실측). 그래서
 * 벽 삼각형을 **실제로 찍어 보고**, 높이마다 제일 많이 찍힌 텍셀 색을 고른다 (최빈인 까닭은 `wallStrip`과 같다)
 */
export function ringStrip(mesh: ChunkMesh, sheet: TexSheet | null, spec: RingBack): { pixels: Uint8Array, h: number } | null {
  if (!sheet) return null
  const first = mesh.materials[spec.walls[0] ?? -1]
  const item0 = sheet.items.find((s) => s.tex === first?.tex && s.pal === (first.pal ?? ''))
  if (!item0 || item0.h === 0) return null
  const h = item0.h
  const [y0, y1] = spec.span
  if (!(y1 > y0)) return null
  const tally = Array.from({ length: h }, () => new Map<number, number>())
  const pos = mesh.geometry.getAttribute('position') as BufferAttribute
  const uv = mesh.geometry.getAttribute('uv') as BufferAttribute | undefined
  if (!uv) return null
  const index = mesh.geometry.getIndex()!
  for (const g of spec.walls) {
    const group = mesh.groups[g]
    const m = mesh.materials[g]
    const item = sheet.items.find((s) => s.tex === m?.tex && s.pal === (m.pal ?? ''))
    if (!group || !item || item.w === 0 || item.h === 0) continue
    for (let t = group[1]; t < group[1] + group[2]; t += 3) {
      const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
      const p = tri.map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)])
      const ab = [p[1]![0]! - p[0]![0]!, p[1]![1]! - p[0]![1]!, p[1]![2]! - p[0]![2]!]
      const ac = [p[2]![0]! - p[0]![0]!, p[2]![1]! - p[0]![1]!, p[2]![2]! - p[0]![2]!]
      const nx = ab[1]! * ac[2]! - ab[2]! * ac[1]!
      const ny = ab[2]! * ac[0]! - ab[0]! * ac[2]!
      const nz = ab[0]! * ac[1]! - ab[1]! * ac[0]!
      const len = Math.hypot(nx, ny, nz)
      // 옆벽만 — 창턱·처마 밑 같은 누운 면은 그 높이의 벽 색이 아니다
      if (len < 1e-9 || Math.abs(ny) / len >= WALLISH) continue
      for (let a = 0; a <= SAMPLES; a++) {
        for (let b = 0; a + b <= SAMPLES; b++) {
          const w1 = a / SAMPLES, w2 = b / SAMPLES, w0 = 1 - w1 - w2
          const y = w0 * p[0]![1]! + w1 * p[1]![1]! + w2 * p[2]![1]!
          if (y < y0 || y > y1) continue
          const u = w0 * uv.getX(tri[0]!) + w1 * uv.getX(tri[1]!) + w2 * uv.getX(tri[2]!)
          const v = w0 * uv.getY(tri[0]!) + w1 * uv.getY(tri[1]!) + w2 * uv.getY(tri[2]!)
          const x = item.x + Math.min(item.w - 1, Math.floor(wrap01(u) * item.w))
          const yy = item.y + Math.min(item.h - 1, Math.floor(wrap01(v) * item.h))
          const o = (yy * sheet.width + x) * 4
          if (sheet.pixels[o + 3]! < ALPHA_CUT) continue
          const rgb = (sheet.pixels[o]! << 16) | (sheet.pixels[o + 1]! << 8) | sheet.pixels[o + 2]!
          const row = tally[Math.min(h - 1, Math.floor(((y - y0) / (y1 - y0)) * h))]!
          row.set(rgb, (row.get(rgb) ?? 0) + 1)
        }
      }
    }
  }
  const best = tally.map((row) => {
    let pick = -1, most = 0
    for (const [rgb, n] of row) if (n > most) { most = n; pick = rgb }
    return pick
  })
  // 그 높이에 찍힌 것이 없으면 아랫줄을 이어 쓴다 (`wallStrip`과 같다). 맨 아래가 비었으면 처음 찍힌 줄로
  let carry = best.find((c) => c >= 0)
  if (carry === undefined) return null
  const pixels = new Uint8Array(h * 4)
  for (let k = 0; k < h; k++) {
    if (best[k]! >= 0) carry = best[k]!
    pixels[k * 4] = (carry >> 16) & 255
    pixels[k * 4 + 1] = (carry >> 8) & 255
    pixels[k * 4 + 2] = carry & 255
    pixels[k * 4 + 3] = 255
  }
  return { pixels, h }
}

/**
 * 비어 있는 뒤쪽 호를 닫는 몸통. 재질은 띠 자리(`shell.stripGroup`)다 — 띠 그림은 `ringStrip`이다.
 *
 * v는 바닥 0 · 처마 밑 1이다. 원작 벽 층(0.19~5.34)을 그 꼭짓점의 처마 높이까지 늘려 바른다 — 처마가 뒤로 갈수록
 * 높아서(최대 6.71) 벽 층을 그대로 두면 처마 밑에 맨 윗줄 색만 1.4타일 남는다
 */
export function ringBack(mesh: ChunkMesh, spec: RingBack): BufferGeometry | null {
  const made = ringPath(mesh, spec)
  if (!made) return null
  const { center: [cx, cz], path } = made

  // 정점 색은 원작 벽이 구워 둔 것의 평균 — 메운 면(`facePlate`)이 원작 정점 색을 물려받는 것과 맞춘다
  const color = mesh.geometry.getAttribute('color') as BufferAttribute | undefined
  const tint = [0, 0, 0]
  let counted = 0
  const index = mesh.geometry.getIndex()!
  for (const g of spec.walls) {
    const group = mesh.groups[g]
    if (!color || !group) continue
    for (let k = group[1]; k < group[1] + group[2]; k++) {
      const i = index.getX(k)
      tint[0] += color.getX(i); tint[1] += color.getY(i); tint[2] += color.getZ(i)
      counted++
    }
  }
  if (counted > 0) for (let a = 0; a < 3; a++) tint[a] /= counted
  else tint.fill(1)

  const floor = spec.span[0]
  const position: number[] = [], normal: number[] = [], uv: number[] = [], rgb: number[] = []
  for (let k = 0; k + 1 < path.length; k++) {
    const [x0, z0, y0] = path[k]!, [x1, z1, y1] = path[k + 1]!
    const ex = x1 - x0, ez = z1 - z0
    const len = Math.hypot(ex, ez)
    if (len < 1e-6) continue
    // 바깥(고리 한가운데에서 먼 쪽)을 본다
    let nx = ez / len, nz = -ex / len
    if (nx * ((x0 + x1) / 2 - cx) + nz * ((z0 + z1) / 2 - cz) < 0) { nx = -nx; nz = -nz }
    // 꼭짓점 `[x, y, z, v]` — 아래 둘 · 위 둘
    const quad: [number, number, number, number][] = [
      [x0, floor, z0, 0], [x1, floor, z1, 0], [x1, y1, z1, 1], [x0, y0, z0, 1]]
    // 바깥을 보게 감는다 — 아래 두 꼭짓점과 위 하나로 감은 삼각형의 법선은 (−ez, 0, ex) 쪽이다
    const order = -ez * nx + ex * nz > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
    for (const j of order) {
      const q = quad[j]!
      position.push(q[0], q[1], q[2])
      normal.push(nx, 0, nz)
      uv.push(0.5, q[3])
      rgb.push(tint[0]!, tint[1]!, tint[2]!)
    }
  }
  if (position.length === 0) return null
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(rgb), 3))
  geo.addGroup(0, position.length / 3, stripGroup(mesh))
  geo.computeBoundingSphere()
  return geo
}
