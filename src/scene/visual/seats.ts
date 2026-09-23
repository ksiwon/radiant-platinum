// 바닥에 눕혀 그린 방석·의자를 세운다 (파일럿 보고 ⑥ · REPAIR §68)
//
// 원작의 방석(`pc_s05a`·`pc_s05b` · 포켓몬센터 귀퉁이)과 등받이 없는 의자(`chair01`~`04`)는
// **16×16 그림 한 장을 바닥에 깐 것**이다. 그림은 3/4 각도에서 본 모습이라 윗면 아래에
// 앞면 띠가, 의자는 그 아래에 다리 둘이 그려져 있다 — 위에서 내려다보는 원작 카메라에서는
// 앉을 것으로 읽히지만, 3인칭에서는 바닥에 붙은 스티커다.
//
// 그래서 그림을 **읽어서** 입체로 세운다. 그림 줄을 위에서부터
//
//   테두리 · **윗면** · **옆 띠**(윗면보다 어두운 줄) · (의자면) **다리**(가운데가 빈 줄) · 테두리
//
// 로 가르고, 윗면을 윗면에 · 옆 띠를 네 옆면에 · 다리 색을 다리 넷에 붙인다.
//
// ⚠️ **높이도 그림에서 온다.** 3/4 그림은 윗면 깊이를 sin θ만큼, 옆 높이를 cos θ만큼
// 줄여 그린다. 윗면은 원래 정사각형이니 sin θ = 윗면 줄 수 ÷ 안쪽 폭이고, 옆 높이 =
// 띠 줄 수 ÷ cos θ다. 방석은 0.34칸, 의자(`chair01`)는 앉는 판 위가 0.44칸이다.
//
// ⚠️ **새 색이 없다.** 모든 면이 원작 그림의 그 텍셀을 가리킨다(UV). 의자의 바닥 그림자
// 판(재질 1)은 그대로 둔다.
import { BufferAttribute, BufferGeometry } from 'three'
import type { ChunkMesh, TexSheet } from '../chunkMesh'
import { seatClaims } from './propPlan'
import type { RecipeMode } from './resolve'
import type { VisualRecipe } from './types'

/** 윗면 대표색보다 이만큼 어두우면 옆 띠다 (밝기 비). 실측 0.87~0.72 · 윗면 안 무늬는 0.85까지 */
const SIDE_LUMA = 0.92

type Shape = 'cushion' | 'stool'

interface SeatBands {
  /** 불투명한 칸의 상자 — 열 [c0, c1] · 줄 [r0, r1] (둘 다 끝 포함) */
  c0: number, c1: number, r0: number, r1: number
  /** 윗면 줄 [topFrom, sideFrom) · 옆 띠 [sideFrom, legFrom) · 다리 [legFrom, legTo) */
  sideFrom: number, legFrom: number, legTo: number
  /** 다리 열 구간들 [from, to) — 방석이면 비었다 */
  legs: [number, number][]
  /** 다리 색을 찍을 텍셀 [열, 줄]. 다리가 없으면 null */
  legTexel: [number, number] | null
  /** 그림이 윗면을 줄여 그린 각의 sin */
  sin: number
}

type Px = (c: number, r: number) => { rgb: number, a: number }

const luma = (c: number) => 0.299 * (c >> 16) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)

/**
 * 그림 줄을 윗면 · 옆 띠 · 다리로 가른다. 모양이 안 맞으면 null.
 *
 * 테두리 색은 맨 윗줄의 첫 불투명 텍셀이다(방석 `#636363` · 의자 `#424242`)
 */
export function seatBands(w: number, h: number, px: Px): SeatBands | null {
  let c0 = w, c1 = -1, r0 = h, r1 = -1
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (px(c, r).a < 128) continue
      c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r)
    }
  }
  if (c1 - c0 < 4 || r1 - r0 < 6) return null
  let outline = -1
  for (let c = c0; c <= c1 && outline < 0; c++) if (px(c, r0).a >= 128) outline = px(c, r0).rgb
  const solid = (c: number, r: number) => px(c, r).a >= 128
  const inner = (c: number, r: number) => solid(c, r) && px(c, r).rgb !== outline
  const mid = Math.floor((c0 + c1) / 2)

  // 아래에서부터 — 맨 아랫줄이 테두리뿐이면 건너뛴다
  let r = r1
  const onlyOutline = (row: number) => {
    for (let c = c0; c <= c1; c++) if (inner(c, row)) return false
    return true
  }
  while (r > r0 && onlyOutline(r)) r--
  // 다리 — 가운데가 비었는데 안쪽 텍셀이 있는 줄
  const legTo = r + 1
  while (r > r0 && !solid(mid, r) && [...Array(c1 - c0 + 1).keys()].some((k) => inner(c0 + k, r))) r--
  const legFrom = r + 1
  const legs: [number, number][] = []
  let legTexel: [number, number] | null = null
  if (legFrom < legTo) {
    for (let c = c0; c <= c1; c++) {
      if (!inner(c, legFrom)) continue
      if (legs.length > 0 && legs[legs.length - 1]![1] === c) legs[legs.length - 1]![1] = c + 1
      else legs.push([c, c + 1])
    }
    legTexel = [legs[0]![0], legFrom]
  }
  // 윗면 대표색 — 윗면 쪽 절반의 안쪽 텍셀에서 가장 흔한 색
  const tally = new Map<number, number>()
  for (let row = r0 + 1; row <= Math.floor((r0 + r) / 2); row++) {
    for (let c = c0; c <= c1; c++) if (inner(c, row)) tally.set(px(c, row).rgb, (tally.get(px(c, row).rgb) ?? 0) + 1)
  }
  const top = [...tally].sort((a, b) => b[1] - a[1])[0]
  if (top === undefined) return null
  // 옆 띠 — 가운데 텍셀이 윗면보다 어두운 줄이 이어지는 동안
  while (r > r0 + 1 && inner(mid, r) && luma(px(mid, r).rgb) < luma(top[0]) * SIDE_LUMA) r--
  const sideFrom = r + 1
  if (!(sideFrom < legFrom)) return null
  // 줄여 그린 각 — 윗면(테두리 뺀 줄 수)이 안쪽 폭(테두리 뺀 열 수)만큼이어야 정사각형이다
  const depth = sideFrom - (r0 + 1)
  const probe = r0 + 2
  let width = 0
  for (let c = c0; c <= c1; c++) if (inner(c, probe)) width++
  if (!(width > 0) || !(depth > 0) || depth >= width) return null
  return { c0, c1, r0, r1, sideFrom, legFrom, legTo, legs, legTexel, sin: depth / width }
}

interface PropSeat {
  claims: Map<number, string>
  geometry: BufferGeometry
  shape: Shape
  /** 윗면 높이 (모델 좌표 · 바닥 0) */
  height: number
}

type V3 = [number, number, number]

/**
 * 바닥에 깐 방석·의자 그림을 입체로. 맞는 레시피가 없으면 null
 */
export function propSeat(
  mesh: ChunkMesh, sheet: TexSheet | null, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
): PropSeat | null {
  if (sheet === null) return null
  for (const shape of ['cushion', 'stool'] as const) {
    const claims = seatClaims(shape, mesh, sheet, assetId, recipes, mode)
    if (claims.size === 0) continue
    return build(shape, claims, mesh, sheet)
  }
  return null
}

function build(shape: Shape, claims: Map<number, string>, mesh: ChunkMesh, sheet: TexSheet): PropSeat | null {
  const geometry = mesh.geometry
  const idx = geometry.getIndex()!.array
  const pos = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  const col = geometry.getAttribute('color') as BufferAttribute | undefined
  const tris = [...claims.keys()]
  const groupOf = (t: number) => mesh.groups.findIndex(([, s, c]) => t >= s && t < s + c)
  const group = groupOf(tris[0]!)
  if (group < 0 || tris.some((t) => groupOf(t) !== group)) return null
  const m = mesh.materials[group]!
  const item = sheet.items.find((s) => s.tex === m.tex && s.pal === (m.pal ?? '')) ?? null
  if (item === null) return null

  const px: Px = (c, r) => {
    const o = ((item.y + r) * sheet.width + item.x + c) * 4
    return {
      rgb: (sheet.pixels[o]! << 16) | (sheet.pixels[o + 1]! << 8) | sheet.pixels[o + 2]!,
      a: sheet.pixels[o + 3]!,
    }
  }
  const bands = seatBands(item.w, item.h, px)
  if (bands === null) return null
  if ((shape === 'stool') !== (bands.legs.length >= 2)) return null

  /**
   * 그림 칸(열 c · 줄 r) → 모델 좌표. 원본 판의 UV를 **아핀으로 맞춰서** 거꾸로 푼다 —
   * 모델이 돌거나 뒤집혀 있어도 앞 띠가 원작이 그린 쪽(카메라 쪽)에 온다
   */
  const t = tris[0]!
  const v = [idx[t]!, idx[t + 1]!, idx[t + 2]!]
  const P = v.map((i) => [pos.getX(i), pos.getZ(i)])
  const U = v.map((i) => [uv.getX(i) * item.w, uv.getY(i) * item.h])
  // [c, r] = A·[x, z] + b 를 세 점으로 푼다
  const dx1 = P[1]![0]! - P[0]![0]!, dz1 = P[1]![1]! - P[0]![1]!
  const dx2 = P[2]![0]! - P[0]![0]!, dz2 = P[2]![1]! - P[0]![1]!
  const det = dx1 * dz2 - dx2 * dz1
  if (Math.abs(det) < 1e-9) return null
  const du1 = U[1]![0]! - U[0]![0]!, dv1 = U[1]![1]! - U[0]![1]!
  const du2 = U[2]![0]! - U[0]![0]!, dv2 = U[2]![1]! - U[0]![1]!
  // A = [dU]·[dP]⁻¹
  const a11 = (du1 * dz2 - du2 * dz1) / det, a12 = (du2 * dx1 - du1 * dx2) / det
  const a21 = (dv1 * dz2 - dv2 * dz1) / det, a22 = (dv2 * dx1 - dv1 * dx2) / det
  const aDet = a11 * a22 - a12 * a21
  if (Math.abs(aDet) < 1e-9) return null
  // 원본 판 한가운데가 찍는 칸 — 반복(rep)으로 칸 밖 값일 수 있어 그 칸 번호를 따라간다
  const [mx, mz] = tris.reduce<[number, number]>((s, tt) => {
    for (let k = 0; k < 3; k++) { s[0] += pos.getX(idx[tt + k]!) / (tris.length * 3); s[1] += pos.getZ(idx[tt + k]!) / (tris.length * 3) }
    return s
  }, [0, 0])
  const cAt = U[0]![0]! + a11 * (mx - P[0]![0]!) + a12 * (mz - P[0]![1]!)
  const rAt = U[0]![1]! + a21 * (mx - P[0]![0]!) + a22 * (mz - P[0]![1]!)
  const tileC = Math.floor(cAt / item.w) * item.w, tileR = Math.floor(rAt / item.h) * item.h
  /** 칸 좌표(그 판이 찍는 반복 칸 기준) → 모델 x·z */
  const place = (c: number, r: number): [number, number] => {
    const gc = c + tileC - U[0]![0]!, gr = r + tileR - U[0]![1]!
    return [
      P[0]![0]! + (a22 * gc - a12 * gr) / aDet,
      P[0]![1]! + (-a21 * gc + a11 * gr) / aDet,
    ]
  }
  // 그림의 +줄 방향(앞)과 +열 방향 — 모델 좌표에서
  const o = place(0, 0), cDir = place(1, 0), rDir = place(0, 1)
  const ex: [number, number] = [cDir[0] - o[0], cDir[1] - o[1]]
  const ez: [number, number] = [rDir[0] - o[0], rDir[1] - o[1]]
  const unit = (a: [number, number]): [number, number] => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l] }
  const fwd = unit(ez), right = unit(ex)

  // 크기 — 칸 한 텍셀이 모델 몇 타일인가 (열 방향 길이)
  const texel = Math.hypot(ex[0], ex[1])
  const cos = Math.sqrt(1 - bands.sin * bands.sin)
  const sideH = ((bands.legFrom - bands.sideFrom) * texel) / cos
  const legH = bands.legs.length > 0 ? ((bands.legTo - bands.legFrom) * texel) / cos : 0
  const height = legH + sideH

  // 발자국 — 열은 불투명 상자 그대로, 줄은 같은 폭의 정사각형을 그림 가운데에
  const span = bands.c1 + 1 - bands.c0
  const midR = item.h / 2
  const f0 = { c: bands.c0, r: midR - span / 2 }
  const f1 = { c: bands.c1 + 1, r: midR + span / 2 }
  const base = col === undefined ? 1 : v.reduce((s, i) => s + col.getX(i), 0) / 3

  const position: number[] = [], normal: number[] = [], texcoord: number[] = [], color: number[] = []
  const at = (c: number, r: number, y: number): V3 => { const [x, z] = place(c, r); return [x, y, z] }
  const uvOf = (c: number, r: number): [number, number] => [c / item.w, r / item.h]
  /** 면 하나 — 모서리 넷의 자리와 UV. `n` 쪽을 보게 감는다 */
  const face = (q: V3[], tex: [number, number][], n: V3) => {
    const e1 = [q[1]![0] - q[0]![0], q[1]![1] - q[0]![1], q[1]![2] - q[0]![2]]
    const e2 = [q[2]![0] - q[0]![0], q[2]![1] - q[0]![1], q[2]![2] - q[0]![2]]
    const cr = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!]
    const order = cr[0]! * n[0] + cr[1]! * n[1] + cr[2]! * n[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
    for (const k of order) {
      position.push(...q[k]!); normal.push(...n); texcoord.push(...tex[k]!); color.push(base, base, base)
    }
  }
  const nF: V3 = [fwd[0], 0, fwd[1]], nB: V3 = [-fwd[0], 0, -fwd[1]]
  const nR: V3 = [right[0], 0, right[1]], nL: V3 = [-right[0], 0, -right[1]]
  const up: V3 = [0, 1, 0], down: V3 = [0, -1, 0]

  /**
   * 띠 줄 [a, b)에서 **모든 줄이 불투명한 열** [from, to). 옆면은 이 열만 찍는다.
   *
   * ⚠️ 그림의 앉는 판은 귀가 깎여 있어서 띠 줄의 양 끝 열이 투명하다(chair02 10·11줄의
   * 1열). 발자국 폭 그대로 찍으면 옆면 귀퉁이가 알파에 뚫려 **검은 V자 틈**이 났다
   * (`--visual=candidate` 실측). 끝의 테두리 열은 남아 세로 모서리 선이 된다
   */
  const opaqueSpan = (a: number, b: number): [number, number] => {
    let from = bands.c0, to = bands.c1 + 1
    for (let r = a; r < b; r++) {
      while (from < to && px(from, r).a < 128) from++
      while (to > from && px(to - 1, r).a < 128) to--
    }
    return [from, to]
  }
  /**
   * 옆면용 — 띠 줄마다 **테두리가 아닌 열**만. 테두리뿐인 줄(방석 밑줄)은 불투명이면 된다.
   *
   * ⚠️ 테두리 열이 줄마다 한 칸씩 안으로 드는 그림이라(chair02 9줄은 1열, 10·11줄은 2열)
   * 불투명만 보고 자르면 끝 열이 윗줄은 노랗고 아랫줄은 검어서, 늘려 붙이면 귀퉁이에
   * **불꽃 모양 검은 쐐기**가 섰다 (`--visual=candidate` 실측)
   */
  const outline = px(bands.c0 + Math.floor((bands.c1 - bands.c0) / 2), bands.r0).rgb
  const innerSpan = (a: number, b: number): [number, number] => {
    let [from, to] = opaqueSpan(a, b)
    for (let r = a; r < b; r++) {
      const inner = (c: number) => px(c, r).a >= 128 && px(c, r).rgb !== outline
      let any = false
      for (let c = from; c < to; c++) if (inner(c)) { any = true; break }
      if (!any) continue
      while (from < to && !inner(from)) from++
      while (to > from && !inner(to - 1)) to--
    }
    return [from, to]
  }

  /**
   * 상자 하나 — 발자국 [ca, cb) × [ra, rb), 높이 [y0, y1).
   * 윗면은 그림 줄 [topA, topB), 옆 넷은 띠 줄 [sideA, sideB)를 찍는다
   */
  const box = (ca: number, cb: number, ra: number, rb: number, y0: number, y1: number,
    top: [number, number] | null, side: [number, number], bottomRow: number | null) => {
    // 윗면은 맨 윗줄(뒤 테두리)을 뺀다 — 그 줄은 귀가 깎여 양 끝이 투명해서, 넣으면 뒤
    // 두 귀퉁이에 구멍이 난다. 좌우 테두리 열은 남아 모서리 선이 된다
    const [tA, tB] = top === null ? side : [top[0] + 1, top[1]]
    const [sA, sB] = side
    const [uA, uB] = innerSpan(sA, sB)
    const [vA, vB] = opaqueSpan(tA, tB)
    const band: [number, number][] = [uvOf(uA, sA), uvOf(uB, sA), uvOf(uB, sB), uvOf(uA, sB)]
    // 윗면 — 그림의 윗면 줄을 발자국 깊이 전체로 편다 (줄여 그린 것을 되편다)
    face([at(ca, ra, y1), at(cb, ra, y1), at(cb, rb, y1), at(ca, rb, y1)],
      [uvOf(vA, tA), uvOf(vB, tA), uvOf(vB, tB), uvOf(vA, tB)], up)
    // 앞(+줄) · 뒤 · 오른쪽(+열) · 왼쪽 — 모두 띠 줄. 위가 띠의 윗줄이다
    face([at(ca, rb, y1), at(cb, rb, y1), at(cb, rb, y0), at(ca, rb, y0)], band, nF)
    face([at(cb, ra, y1), at(ca, ra, y1), at(ca, ra, y0), at(cb, ra, y0)], band, nB)
    face([at(cb, rb, y1), at(cb, ra, y1), at(cb, ra, y0), at(cb, rb, y0)], band, nR)
    face([at(ca, ra, y1), at(ca, rb, y1), at(ca, rb, y0), at(ca, ra, y0)], band, nL)
    if (bottomRow !== null) {
      const u: [number, number] = [(ca + cb) / 2, bottomRow + 0.5]
      face([at(ca, ra, y0), at(cb, ra, y0), at(cb, rb, y0), at(ca, rb, y0)],
        [uvOf(...u), uvOf(...u), uvOf(...u), uvOf(...u)], down)
    }
  }

  const top: [number, number] = [bands.r0, bands.sideFrom]
  if (shape === 'cushion') {
    // 옆 띠 + 그 아래 테두리 줄까지 — 띠 아래 선이 바닥과 닿는 모서리다
    box(f0.c, f1.c, f0.r, f1.r, 0, height, top, [bands.sideFrom, bands.r1 + 1], null)
  } else {
    // 앉는 판 — 다리 위에 띠 두께만큼
    box(f0.c, f1.c, f0.r, f1.r, legH, height, top, [bands.sideFrom, bands.legFrom], bands.legFrom - 1)
    // 다리 넷 — 그림의 다리 열을 앞뒤로 같은 안쪽 거리에 둔다
    const [lc, lr] = bands.legTexel!
    const legUv: [number, number] = [lc + 0.5, lr + 0.5]
    const inset = bands.legs[0]![0] - f0.c
    const thick = bands.legs[0]![1] - bands.legs[0]![0]
    const rows: [number, number][] = [[f0.r + inset, f0.r + inset + thick], [f1.r - inset - thick, f1.r - inset]]
    for (const [a, b] of [bands.legs[0]!, bands.legs[bands.legs.length - 1]!]) {
      for (const [ra, rb] of rows) {
        const q = (c: number, r: number, y: number) => at(c, r, y)
        const t4 = [uvOf(...legUv), uvOf(...legUv), uvOf(...legUv), uvOf(...legUv)]
        face([q(a, rb, legH), q(b, rb, legH), q(b, rb, 0), q(a, rb, 0)], t4, nF)
        face([q(b, ra, legH), q(a, ra, legH), q(a, ra, 0), q(b, ra, 0)], t4, nB)
        face([q(b, rb, legH), q(b, ra, legH), q(b, ra, 0), q(b, rb, 0)], t4, nR)
        face([q(a, ra, legH), q(a, rb, legH), q(a, rb, 0), q(a, ra, 0)], t4, nL)
      }
    }
  }

  const made = new BufferGeometry()
  made.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  made.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3))
  made.setAttribute('uv', new BufferAttribute(new Float32Array(texcoord), 2))
  made.setAttribute('color', new BufferAttribute(new Float32Array(color), 3))
  made.addGroup(0, position.length / 3, group)
  made.computeBoundingSphere()
  return { claims, geometry: made, shape, height }
}
