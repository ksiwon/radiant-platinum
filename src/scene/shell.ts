// 소품의 빠진 면을 만든다 (DATA.md §2.2)
//
// 원작 집은 **면이 통째로 없다.** 소품 590종 중 여섯 방향이 다 있는 것이 78종뿐이고,
// 오버월드 배치 501개로 세면 −Z가 64% · −X가 40% · +Y가 31% · +X가 22%에서 그쪽을
// 보는 면이 0개다. 구멍이 뚫린 것이 아니라 안 만들어져 있다 — 원작 카메라가 고정
// 각도라 만들 이유가 없었다. 그쪽으로 돌아가면 반대편 벽의 **안쪽**이 보인다.
//
// ⚠️ **면적 벡터로는 이걸 못 잰다.** 한 번 그렇게 접근했다가 틀렸다. 경계 고리를
// 부채꼴로 덮으면 면적 벡터는 0에 수렴하는데, 문틀·창틀 같은 안쪽 테두리를 덮고
// 정작 뚫린 쪽은 그대로 두고도 합이 맞는다. 재야 할 것은 넓이가 아니라
// **그쪽에서 본 실루엣이 다 막혔는가**다(`shell.test`가 그걸 잰다).
//
// 그래서 고리를 고르지 않는다. **삼각형을 전부 그쪽 판으로 눌러 붙인다.** 눌러
// 붙인 것들의 합집합이 곧 그 방향에서 본 실루엣이라, 어느 고리가 진짜 구멍인지
// 고를 필요 자체가 없어진다.
import { BufferAttribute, BufferGeometry } from 'three'
import type { ChunkMesh, TexSheet } from './chunkMesh'

/**
 * 판을 이만큼 두께 안에 눌러 담는다 (타일).
 *
 * 한 평면에 완전히 눕히면 겹친 삼각형끼리 깊이가 같아 깜빡인다. 원래 순서를
 * 유지한 채 얇은 층에 담으면, 그 방향에서 볼 때 원작의 제일 바깥면이 앞에 온다 —
 * 뒤에서 보는 박공은 지붕이 아니라 벽으로 보여야 맞다
 */
const SLAB = 0.02
/** 알파 판정 문턱. 재질이 쓰는 `alphaTest: 0.5`와 같은 자리다 */
const ALPHA_CUT = 128
/** 이보다 작으면 그 방향에서 넓이가 0이다 — 모로 선 면이라 실루엣에 안 보탠다 */
export const FLAT = 1e-4

/**
 * 채울 방향 `[축, 부호]`. 축은 0=x · 1=y · 2=z다.
 *
 * **−Y(바닥)는 없다.** 건물 밑은 볼 자리가 없어서 채워 봐야 삼각형만 버린다 —
 * 소품 590종 중 84%가 바닥이 없는데 그게 화면에 나온 적이 없다
 */
export const FILLABLE: readonly (readonly [number, number])[] = [
  [0, -1], [0, 1], [1, 1], [2, -1], [2, 1],
]

/**
 * 뚫렸는지 재는 격자. 주인공 집(5.8타일)에서 한 칸이 0.09타일이다.
 *
 * `shell.test`가 같은 값으로 다시 잰다. 해상도와 `FLAT`은 **재는 눈금**이지
 * 검증 대상이 아니다 — 눈금이 다르면 칸 한가운데를 찍는 자리가 어긋나서
 * 버그가 아닌 표본 차이로 결과가 갈린다. 실제로 그렇게 446칸이 어긋났다
 */
export const GRID = 64

/** 축 방향의 두께. 0이면 그 축에 수직인 **한 장짜리**라 붙일 뒤가 없다 */
function extent(pos: ArrayLike<number>, axis: number): number {
  let lo = Infinity, hi = -Infinity
  for (let i = axis; i < pos.length; i += 3) {
    const c = pos[i]!
    if (c < lo) lo = c
    if (c > hi) hi = c
  }
  return hi - lo
}

/**
 * 그 축에 수직인 격자를 칠한다. `sign`이 0이면 실루엣, ±1이면 그쪽을 보는 면만.
 *
 * ⚠️ **"그쪽 면이 몇 개냐"로 판단하면 안 된다.** 처음에 그렇게 했다가 틀렸다 —
 * 지붕처럼 비스듬한 면도 옆에서 보면 넓이를 보태서, 면 개수로는 "있다"인데
 * 실루엣의 절반만 덮는 경우가 있다. 뚫렸는지는 **덮어 보고** 알아야 한다
 */
function coverage(
  pos: ArrayLike<number>, index: ArrayLike<number>,
  box: readonly number[][], axis: number, sign: number,
): Set<number> {
  const u = (axis + 1) % 3, v = (axis + 2) % 3
  const [u0, u1] = box[0] as [number, number]
  const [v0, v1] = box[1] as [number, number]
  const hit = new Set<number>()
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t]! * 3, b = index[t + 1]! * 3, c = index[t + 2]! * 3
    const area = (pos[b + u]! - pos[a + u]!) * (pos[c + v]! - pos[a + v]!)
      - (pos[c + u]! - pos[a + u]!) * (pos[b + v]! - pos[a + v]!)
    if (Math.abs(area) < FLAT) continue
    if (sign !== 0 && area * sign <= 0) continue
    const lo = (w: number) => Math.min(pos[a + w]!, pos[b + w]!, pos[c + w]!)
    const hi = (w: number) => Math.max(pos[a + w]!, pos[b + w]!, pos[c + w]!)
    const cu0 = Math.max(0, Math.floor(((lo(u) - u0) / (u1 - u0)) * GRID))
    const cu1 = Math.min(GRID - 1, Math.ceil(((hi(u) - u0) / (u1 - u0)) * GRID))
    const cv0 = Math.max(0, Math.floor(((lo(v) - v0) / (v1 - v0)) * GRID))
    const cv1 = Math.min(GRID - 1, Math.ceil(((hi(v) - v0) / (v1 - v0)) * GRID))
    for (let cv = cv0; cv <= cv1; cv++) {
      for (let cu = cu0; cu <= cu1; cu++) {
        const x = u0 + ((cu + 0.5) / GRID) * (u1 - u0)
        const y = v0 + ((cv + 0.5) / GRID) * (v1 - v0)
        const w1 = ((x - pos[a + u]!) * (pos[c + v]! - pos[a + v]!)
          - (pos[c + u]! - pos[a + u]!) * (y - pos[a + v]!)) / area
        const w2 = ((pos[b + u]! - pos[a + u]!) * (y - pos[a + v]!)
          - (x - pos[a + u]!) * (pos[b + v]! - pos[a + v]!)) / area
        if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue
        hit.add(cv * GRID + cu)
      }
    }
  }
  return hit
}

/**
 * 축마다 `[최소, 최대]`.
 */
function bounds(pos: ArrayLike<number>): [number, number][] {
  const out: [number, number][] = [
    [Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity],
  ]
  for (let i = 0; i + 2 < pos.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const c = pos[i + a]!
      const b = out[a]!
      if (c < b[0]) b[0] = c
      if (c > b[1]) b[1] = c
    }
  }
  return out
}

/**
 * 그 축으로 내려다본 실루엣. 칸 색인은 `[c_u × GRID + c_v]`다.
 *
 * 앞뒤를 안 가린다 — 그 축에 수직인 면이 하나라도 그 칸을 덮으면 1이다
 */
function silhouette(
  pos: ArrayLike<number>, index: ArrayLike<number>,
  bb: readonly [number, number][], axis: number,
): Uint8Array {
  const u = (axis + 1) % 3, v = (axis + 2) % 3
  const [u0, u1] = bb[u]!, [v0, v1] = bb[v]!
  const hit = new Uint8Array(GRID * GRID)
  if (!(u1 > u0) || !(v1 > v0)) return hit
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t]! * 3, b = index[t + 1]! * 3, c = index[t + 2]! * 3
    const area = (pos[b + u]! - pos[a + u]!) * (pos[c + v]! - pos[a + v]!)
      - (pos[c + u]! - pos[a + u]!) * (pos[b + v]! - pos[a + v]!)
    if (Math.abs(area) < FLAT) continue
    const lo = (w: number) => Math.min(pos[a + w]!, pos[b + w]!, pos[c + w]!)
    const hi = (w: number) => Math.max(pos[a + w]!, pos[b + w]!, pos[c + w]!)
    const cu0 = Math.max(0, Math.floor(((lo(u) - u0) / (u1 - u0)) * GRID))
    const cu1 = Math.min(GRID - 1, Math.ceil(((hi(u) - u0) / (u1 - u0)) * GRID))
    const cv0 = Math.max(0, Math.floor(((lo(v) - v0) / (v1 - v0)) * GRID))
    const cv1 = Math.min(GRID - 1, Math.ceil(((hi(v) - v0) / (v1 - v0)) * GRID))
    for (let cv = cv0; cv <= cv1; cv++) {
      for (let cu = cu0; cu <= cu1; cu++) {
        const x = u0 + ((cu + 0.5) / GRID) * (u1 - u0)
        const y = v0 + ((cv + 0.5) / GRID) * (v1 - v0)
        const w1 = ((x - pos[a + u]!) * (pos[c + v]! - pos[a + v]!)
          - (pos[c + u]! - pos[a + u]!) * (y - pos[a + v]!)) / area
        const w2 = ((pos[b + u]! - pos[a + u]!) * (y - pos[a + v]!)
          - (x - pos[a + u]!) * (pos[b + v]! - pos[a + v]!)) / area
        if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue
        hit[cu * GRID + cv] = 1
      }
    }
  }
  return hit
}

/**
 * 판을 붙일 깊이. `(u, v)`마다 **없는 벽이 있었을 자리**를 돌려준다.
 *
 * ⚠️ **여기가 두 번 틀렸던 자리다.**
 *
 * ① 삼각형을 바운딩 박스의 끝면에 눌러 붙였다. 처마가 벽보다 튀어나온 만큼
 *    벽 자리의 판이 뒤로 물러나 허공에 뜬다.
 *
 * ② 그 자리의 **제일 바깥면**을 찾아 붙였다. 이게 더 나빴다 — 뒤가 통째로
 *    없는 집은 그 자리에 아무 면도 없어서 **반대편 앞벽**이 잡힌다. 판 꼭짓점
 *    89,991개 중 **30,349개(33.7%)가 소품 두께의 절반보다 안쪽**에 섰다.
 *    주인공 집(22번)은 두께 2.75타일에 판이 평균 2.24타일 안쪽 — 150개가
 *    150개 다 앞벽에 눌러 붙어, 뒤판 뒤로 옆벽만 남아 면이 따로 노는 것으로
 *    보였다. 이때 잰 "0개"는 **잣대가 구현과 같아서** 나온 값이라 뜻이 없었다.
 *
 * 뒷벽 자리의 깊이는 그 자리에 없다 — **옆벽이 갖고 있다.** 옆벽은 이 방향에서
 * 보면 선이라 실루엣에 아무것도 안 보태므로(`FLAT`에 걸려 빠진다) 아무리 찾아도
 * 안 나온다. 그래서 다른 두 축에서 본 실루엣을 겹친다:
 *
 *   z 깊이(x, y) = S_x(y, z) ∧ S_y(x, z) 를 만족하는 제일 바깥 z
 *
 * 세 실루엣이 만드는 **비주얼 헐**이다. 벽 높이에서는 옆벽이 z 범위를 잡아 주고
 * (→ 뒷벽 평면), 박공 높이에서는 지붕이 잡아 준다(→ 처마 끝). 헐은 늘 물체를
 * 감싸므로 판이 본체 속으로 파고들 일이 없다
 */
function hullDepth(
  pos: ArrayLike<number>, index: ArrayLike<number>,
  bb: readonly [number, number][], axis: number, sign: number,
): (pu: number, pv: number) => number {
  const u = (axis + 1) % 3, v = (axis + 2) % 3
  const [a0, a1] = bb[axis]!, [u0, u1] = bb[u]!, [v0, v1] = bb[v]!
  // `silhouette(u)`는 `[c_v × GRID + c_a]`, `silhouette(v)`는 `[c_a × GRID + c_u]`다
  const su = silhouette(pos, index, bb, u)
  const sv = silhouette(pos, index, bb, v)
  const flat = a1 - a0
  const edge = sign > 0 ? a1 : a0
  const map = new Float64Array(GRID * GRID)
  for (let cu = 0; cu < GRID; cu++) {
    for (let cv = 0; cv < GRID; cv++) {
      let found = -1
      for (let k = 0; k < GRID; k++) {
        const ca = sign > 0 ? GRID - 1 - k : k
        if (su[cv * GRID + ca] === 0) continue
        if (sv[ca * GRID + cu] === 0) continue
        found = ca
        break
      }
      // 헐이 비면 그 자리를 아무것도 안 덮은 것이다 — 상자 끝으로 물러선다
      map[cu * GRID + cv] = found < 0 ? edge : a0 + ((found + 0.5) / GRID) * flat
    }
  }
  const at = (cu: number, cv: number) =>
    map[Math.min(GRID - 1, Math.max(0, cu)) * GRID + Math.min(GRID - 1, Math.max(0, cv))]!
  return (pu, pv) => {
    // 칸 한가운데 격자에서 겹선형으로 읽는다. 칸 값을 그대로 쓰면 판이 계단이
    // 되고, 그 단차가 `SLAB`보다 커서 겹친 삼각형끼리 앞뒤가 뒤집힌다
    const fu = u1 > u0 ? ((pu - u0) / (u1 - u0)) * GRID - 0.5 : 0
    const fv = v1 > v0 ? ((pv - v0) / (v1 - v0)) * GRID - 0.5 : 0
    const cu = Math.floor(fu), cv = Math.floor(fv)
    const tu = fu - cu, tv = fv - cv
    return (at(cu, cv) * (1 - tu) + at(cu + 1, cv) * tu) * (1 - tv)
      + (at(cu, cv + 1) * (1 - tu) + at(cu + 1, cv + 1) * tu) * tv
  }
}

function boxOf(pos: ArrayLike<number>, axis: number): number[][] {
  return [(axis + 1) % 3, (axis + 2) % 3].map((a) => {
    let lo = Infinity, hi = -Infinity
    for (let i = a; i < pos.length; i += 3) {
      const c = pos[i]!
      if (c < lo) lo = c
      if (c > hi) hi = c
    }
    return [lo, hi]
  })
}

/**
 * 이 소품에서 **실제로 뚫린** 방향들. 채울 대상이다.
 *
 * 그 방향에서 보이는 실루엣을, 그 방향을 보는 면이 다 덮는지 격자로 확인한다.
 * 한 칸이라도 남으면 뚫린 것이다.
 *
 * 두께가 0인 축은 뺀다 — 간판·그림자처럼 **정면 한 장**은 판을 붙일 뒤가 아예
 * 없고, 양면으로 그리면 그것이 곧 뒷면이다
 */
export function openDirections(mesh: ChunkMesh): (readonly [number, number])[] {
  const pos = (mesh.geometry.getAttribute('position') as BufferAttribute)
    .array as ArrayLike<number>
  const index = mesh.geometry.getIndex()!.array
  return FILLABLE.filter(([axis, sign]) => {
    if (!(extent(pos, axis) > 0)) return false
    const box = boxOf(pos, axis)
    if (!(box[0]![1]! > box[0]![0]!) || !(box[1]![1]! > box[1]![0]!)) return false
    const seen = coverage(pos, index, box, axis, 0)
    if (seen.size === 0) return false
    const face = coverage(pos, index, box, axis, sign)
    for (const c of seen) if (!face.has(c)) return true
    return false
  })
}

/**
 * 서브메시마다 판에 쓸 색. `null`이면 그 서브메시는 판을 안 만든다.
 *
 * 색은 **그 그림의 평균**이다 — 아무 회색이나 칠하면 지역마다 다른 원작 색조가
 * 사라진다. 여기서 `plateColors`처럼 제일 많이 쓰인 색을 쓰지 않는 이유는,
 * 저쪽은 팔레트에서 잎 색과 줄기 색을 **갈라내는** 일이고 이쪽은 텍스처 한 장을
 * 색 하나로 **대신하는** 일이라서다. 대신하는 자리에서는 멀리서 보이는 색이
 * 답인데, 최빈값은 통나무 줄눈처럼 넓게 깔린 윤곽선을 집는다 — 주인공 집 벽이
 * 최빈 #947b73(밝기 129)이고 평균 #a5a28f(밝기 161)다.
 *
 * 그늘로 따로 깎지 않는다. 채우는 면은 대개 태양(24, 42, 18)도 필(−14, 12, 26)도
 * 못 받아 반구광만 닿는다 — 이미 그늘이다. 여기서 또 깎으면 이중이 된다.
 *
 * ⚠️ **오려 낸 그림이라고 빼면 안 된다.** 한동안 그랬다 — "판 한 장짜리
 * 울타리·간판을 눌러 붙이면 없던 널판이 생긴다"는 이유였다. 그런데 그 잣대는
 * **투명한 픽셀이 5%만 있어도** 선다. 창이 뚫린 벽, 여백이 남은 그림이 다 걸려서
 * 소품 590종 중 **189종이 뚫린 채로 남았다**(실루엣 칸 1,368,413개 중 469,175개).
 * 빼지 않으면 남는 것이 1종 6칸이다.
 *
 * 널판 걱정은 실제로는 안 일어난다. 판 한 장짜리는 어느 축으로 봐도 경계 상자가
 * 납작해서 `openDirections`가 아예 안 고른다 — 잣대를 지우기 전후로 판을 만드는
 * 소품이 350개로 같다. 달라지는 것은 **이미 만들던 판이 얼마나 덮느냐**뿐이다
 */
export function shellPaint(mesh: ChunkMesh, sheet: TexSheet | null): ShellPaint {
  return { colors: shellColors(mesh, sheet) }
}

export function shellColors(mesh: ChunkMesh, sheet: TexSheet | null): (number | null)[] {
  return mesh.materials.map((spec) => {
    const item = sheet?.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
    if (!sheet || !item) return null
    let r = 0, g = 0, b = 0, n = 0
    for (let y = 0; y < item.h; y++) {
      const row = ((item.y + y) * sheet.width + item.x) * 4
      for (let x = 0; x < item.w; x++) {
        const o = row + x * 4
        if (sheet.pixels[o + 3]! < ALPHA_CUT) continue
        r += sheet.pixels[o]!; g += sheet.pixels[o + 1]!; b += sheet.pixels[o + 2]!; n++
      }
    }
    if (n === 0) return null
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)
  })
}

/**
 * 판이 무엇으로 칠해지는가.
 *
 * ⚠️ **평균색 하나로 칠하면 뒷면이 회색 슬래브가 된다.** 실제로 그랬다 —
 * 주인공 집은 나무벽 + 파란 기단 + 회색 문인데 그 평균이 흙탕 회색이라, 뒤로
 * 돌아가면 창문 자리에 실선만 남은 판때기가 서 있었다.
 *
 * ⚠️ **아틀라스 한 장으로 칠하는 것도 안 된다.** 그다음에 그렇게 했다 — 드로우콜
 * 하나로 끝내려고 UV를 시트 좌표로 고쳐 썼는데, 원작 UV는 **칸마다 0~1이고
 * 반복**한다(`sliceTexture`가 `wrapS/T`로 흉내 낸다). 아틀라스는 반복을 못 하므로
 * 소수부만 남기게 되고, 그러면 칸 경계를 걸친 삼각형이 **거꾸로 뒤집힌다**:
 * u가 0.98과 1.02인 두 꼭짓점이 0.98과 0.02가 되어, 폭 0.04짜리 띠가 그림 전체를
 * 거꾸로 훑는 폭 0.96짜리가 된다. 판 삼각형 29,922개 중 **7,405개(24.7%)**가
 * 그랬고, 판을 만드는 소품 350종 중 277종에 그런 삼각형이 있었다. 화면에서는
 * 벽 텍스처의 검은 줄눈이 뒷벽 절반을 덮은 **검은 줄무늬 판때기**로 나왔다.
 *
 * 그래서 지금은 **소품이 쓰는 그 재질을 그대로 쓴다.** 판에 서브메시 그룹을 달아
 * 두면 재질 배열을 그대로 물릴 수 있고, 반복도 알파도 원작 그대로다. 값은
 * 드로우콜이 소품 하나에 중앙값 2개 느는 것뿐이다.
 *
 * `colors`는 그대로 남는다. 어느 그룹이 그림을 못 찾아 판을 만들면 안 되는지
 * (`null`)를 나르는 표다
 */
export interface ShellPaint {
  colors: readonly (number | null)[]
}

/**
 * 그 판을 **옆벽에서 베껴 온다**.
 *
 * ⚠️ 눌러 붙인 삼각형이 제 UV를 그대로 들고 가면 **앞벽이 뒤에 찍힌다.**
 * 주인공 집은 뒤가 통째로 없어서 뒷판이 앞벽 삼각형으로 만들어지는데, 그 앞벽에는
 * 문(`t1_door1` 4삼각형)과 창이 있다 — 뒤로 돌아가면 문이 하나 더 있는 집이 된다.
 *
 * 뒷벽 자리에 있어야 할 그림은 **옆벽이 갖고 있다.** 옆벽의 UV는 (y, z)의 함수라,
 * 뒷면 자리(z = 뒤끝)에서 값을 그대로 읽을 수 있다. 가로로는 옆벽의 법선 방향인데
 * 그 방향의 기울기를 0으로 두면 **모서리에서 본 그 줄무늬가 뒤로 이어진다** —
 * 나무 벽은 나무 벽대로, 기단은 기단대로 높이가 맞는다.
 *
 * 지붕은 안 바꾼다. 위를 보는 삼각형은 제 UV가 곧 지붕 그림이다
 */
interface WallSource {
  group: number
  /** 그 벽이 쓰는 **그림 칸**. 판이 이 칸을 통째로 늘려 쓴다 */
  u0: number
  u1: number
  /** 벽 아래끝과 위끝의 v. 어느 쪽이 큰지는 원작이 정한 대로 따라간다 */
  vLow: number
  vHigh: number
  /** 그 v를 읽은 높이 */
  yLow: number
  yHigh: number
}

/** 옆벽으로 칠 만큼 세로인가. 지붕(위를 봄)과 바닥은 여기서 빠진다 */
const WALLISH = 0.5
/** 그 축에 수직인가 — 뒷판에서 보면 선으로 보이는 면이 옆벽이다 */
const PERPENDICULAR = 0.3

/**
 * **문은 벽이 아니다.**
 *
 * ⚠️ 세로로 선 면을 다 옆벽으로 치면 안 된다. 주인공 집(22)의 문(`t1_door1`)은
 * 넉 장 중 **두 장이 옆을 본다** — 그러면 그 문이 뒷판의 그림 원본이 되어
 * 뒤에도 문이 생긴다. 실제로 그렇게 여섯 꼭짓점이 문 칸에 떨어졌다.
 *
 * 갈라 주는 것은 **넓이**다. 서브메시별 옆벽 넓이를 재면 문과 벽 사이가 훤히
 * 벌어진다 (제일 큰 것 대비):
 *
 *   22  t1_h01 100% · t1_door1 **1%**
 *   23  t1_s01_1 100% · t1_s01_2 81%·59% · t1_door1 **2%**
 *   8   gymb 100% · gyma 52% · (텍스처 없음) 7%
 *   227 sindenC 100% · sindenC 18%
 *
 * 문은 1~2%, 진짜 벽은 18% 위다. 문턱을 10%로 둔다
 */
const MINOR_WALL = 0.1

/**
 * 이 판이 그림을 베껴 올 **옆벽 하나**. 없으면 `null`.
 *
 * ⚠️ **삼각형마다 제일 가까운 옆벽을 따로 고르면 안 된다.** 한동안 그랬고,
 * 그게 뒷벽을 조각보로 만들었다 — 옆벽마다 UV의 상수항이 달라서, 이웃한 두
 * 삼각형이 서로 다른 옆벽을 베끼면 그 경계에서 그림이 툭 끊긴다. 주인공 집
 * 뒷벽에 파란 기단 줄이 허리 높이와 처마 밑에 두 번 더 그어져 있던 것이 이것이다.
 *
 * 판 하나가 **제일 넓은 옆벽 하나**를 통째로 베끼면 UV가 아핀 함수 한 벌이라
 * 끊길 자리가 없다. 가로로는 기울기가 0이라(법선 방향) 모서리에서 본 줄무늬가
 * 그대로 이어지고, 세로로는 기단이 기단 높이에, 벽이 벽 높이에 온다
 */
function wallSource(
  mesh: ChunkMesh, paint: ShellPaint, axis: number,
  pos: ArrayLike<number>, uv: ArrayLike<number> | undefined,
): WallSource | null {
  if (!uv) return null
  const index = mesh.geometry.getIndex()!.array
  /** 서브메시별 옆벽 넓이. 문을 걸러내는 잣대다 */
  const area = new Map<number, number>()
  /** 서브메시별 그림 칸과 위아래 끝 */
  const box = new Map<number, WallSource>()
  mesh.groups.forEach(([, start, count], group) => {
    if (paint.colors[group] === null || paint.colors[group] === undefined) return
    for (let t = 0; t < count; t += 3) {
      const tri = [index[start + t]!, index[start + t + 1]!, index[start + t + 2]!]
      const ap: [number, number, number] = [
        pos[tri[0]! * 3]!, pos[tri[0]! * 3 + 1]!, pos[tri[0]! * 3 + 2]!]
      const ab: [number, number, number] = [
        pos[tri[1]! * 3]! - ap[0], pos[tri[1]! * 3 + 1]! - ap[1], pos[tri[1]! * 3 + 2]! - ap[2]]
      const ac: [number, number, number] = [
        pos[tri[2]! * 3]! - ap[0], pos[tri[2]! * 3 + 1]! - ap[1], pos[tri[2]! * 3 + 2]! - ap[2]]
      const n: [number, number, number] = [
        ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
      const len = Math.hypot(...n)
      if (len < 1e-9) continue
      // 옆벽 — 이 축에 수직이고(뒤에서 보면 선이다) 세로로 서 있다
      if (Math.abs(n[axis]!) / len >= PERPENDICULAR) continue
      if (Math.abs(n[1]) / len >= WALLISH) continue
      area.set(group, (area.get(group) ?? 0) + len / 2)
      // 그 서브메시가 쓰는 **그림 칸 전체**를 모은다.
      //
      // ⚠️ 삼각형 하나만 골라 쓰면 안 된다. 제일 넓은 것도, 세로로 제일 긴 것도
      // 둘 다 **모서리 기둥**을 집어서 뒷벽이 통짜 검정으로 깔렸다 — 기둥은
      // 높이가 벽과 같고 그림칸이 어두운 한 줄이다. 칸 전체를 쓰면 널판이
      // 널판으로 깔리고, 대신 기단 칸이 세로줄 하나로 섞여 든다. 그 줄은
      // 모서리 기둥으로 읽혀서 통짜 검정보다 훨씬 낫다
      let hit = box.get(group)
      if (!hit) {
        hit = {
          group, u0: Infinity, u1: -Infinity,
          vLow: 0, vHigh: 0, yLow: Infinity, yHigh: -Infinity,
        }
        box.set(group, hit)
      }
      for (const k of tri) {
        const y = pos[k * 3 + 1]!
        const tu = uv[k * 2]!, tv = uv[k * 2 + 1]!
        if (tu < hit.u0) hit.u0 = tu
        if (tu > hit.u1) hit.u1 = tu
        if (y < hit.yLow) { hit.yLow = y; hit.vLow = tv }
        if (y > hit.yHigh) { hit.yHigh = y; hit.vHigh = tv }
      }
    }
  })
  if (area.size === 0) return null
  // **문은 벽이 아니다.** 서브메시 넓이로 먼저 거른다
  const most = Math.max(...area.values())
  let best: WallSource | null = null
  let bestArea = 0
  for (const [group, size] of area) {
    if (size < most * MINOR_WALL || size <= bestArea) continue
    bestArea = size
    best = box.get(group) ?? null
  }
  return best
}


/**
 * 한 방향의 판. 없으면 `null`.
 *
 * 그 방향에서 봐서 넓이가 0인 삼각형(모로 선 것)은 실루엣에 아무것도 안 보태므로
 * 버린다 — 주인공 집 뒤판은 219개 중 110개만 남는다.
 *
 * 법선은 전부 그 방향으로 준다. 눌러 붙인 삼각형의 원래 법선은 사방을 보고 있어서
 * 그대로 두면 한 벽이 얼룩덜룩해진다
 */
export function facePlate(
  mesh: ChunkMesh, paint: ShellPaint, axis: number, sign: number,
): BufferGeometry | null {
  const src = mesh.geometry
  const pos = (src.getAttribute('position') as BufferAttribute).array as ArrayLike<number>
  const uv = (src.getAttribute('uv') as BufferAttribute | undefined)?.array as
    ArrayLike<number> | undefined
  const index = src.getIndex()!.array
  let lo = Infinity, hi = -Infinity
  for (let i = axis; i < pos.length; i += 3) {
    const c = pos[i]!
    if (c < lo) lo = c
    if (c > hi) hi = c
  }
  const depth = hi - lo
  if (!(depth > 0)) return null

  const u = (axis + 1) % 3, v = (axis + 2) % 3
  const depthAt = hullDepth(pos, index, bounds(pos), axis, sign)

  /**
   * **없는 벽이 있었을 자리**로 누른다 (`hullDepth`).
   *
   * 마지막 항은 원래 깊이 순서를 `SLAB` 두께 안에 담는 것이다 — 한 평면에
   * 완전히 눕히면 겹친 삼각형끼리 깊이가 같아 깜빡인다
   */
  const flat = (pu: number, pv: number, c: number): number =>
    depthAt(pu, pv) + sign * SLAB * (1 - (c - lo) / depth)
  const vcol = (src.getAttribute('color') as BufferAttribute | undefined)?.array as
    ArrayLike<number> | undefined
  /** 서브메시별로 모은다 — 그 재질을 그대로 물리려면 그룹이 있어야 한다 */
  const bucket = new Map<number, { position: number[]; color: number[]; uv: number[] }>()
  // 눌러 붙인 앞벽이 제 UV를 들고 가면 문과 창이 뒤에 찍힌다. 옆벽에서 베껴 온다.
  //
  // ⚠️ **위(+Y) 판은 안 베낀다.** 그 판은 지붕이고, 지붕에 있어야 할 그림은
  // 옆벽이 아니라 제 것이다. 완만한 지붕면은 `WALLISH`(0.5)에 걸려 벽으로
  // 세어지므로, 안 막으면 지붕에 벽 그림이 발린다
  const wall = axis === 1 ? null : wallSource(mesh, paint, axis, pos, uv)
  /** 판의 가로 축과 그 범위. 옆벽 그림 칸을 여기에 한 번 늘려 붙인다 */
  const across = axis === 0 ? 2 : 0
  const [low, high] = bounds(pos)[across]!
  const span = high - low
  mesh.groups.forEach(([, start, count], group) => {
    const rgb = paint.colors[group]
    // 그림을 못 찾은 서브메시는 칠할 것이 없다
    if (rgb === null || rgb === undefined) return
    for (let t = 0; t < count; t += 3) {
      const tri = [index[start + t]!, index[start + t + 1]!, index[start + t + 2]!]
      const p = tri.map((k) => [pos[k * 3]!, pos[k * 3 + 1]!, pos[k * 3 + 2]!] as const)
      const area = (p[1]![u] - p[0]![u]) * (p[2]![v] - p[0]![v])
        - (p[2]![u] - p[0]![u]) * (p[1]![v] - p[0]![v])
      if (Math.abs(area) < FLAT) continue

      // 이 삼각형이 벽이면 옆벽에서, 지붕이면 제 것 그대로. 지붕은 위에서 봐야
      // 뜻이 있는 그림이라 옮겨 오면 오히려 틀린다
      const nx = (p[1]![1] - p[0]![1]) * (p[2]![2] - p[0]![2])
        - (p[1]![2] - p[0]![2]) * (p[2]![1] - p[0]![1])
      const ny = (p[1]![2] - p[0]![2]) * (p[2]![0] - p[0]![0])
        - (p[1]![0] - p[0]![0]) * (p[2]![2] - p[0]![2])
      const nz = (p[1]![0] - p[0]![0]) * (p[2]![1] - p[0]![1])
        - (p[1]![1] - p[0]![1]) * (p[2]![0] - p[0]![0])
      const nl = Math.hypot(nx, ny, nz)
      const from = nl > 1e-9 && Math.abs(ny) / nl < WALLISH ? wall : null
      // **그림을 가져온 서브메시로 간다.** 그래야 그 재질의 반복·알파가 그대로
      // 걸린다 — 옆벽에서 베껴 온 삼각형은 옆벽의 재질로 그려야 맞다
      const paintedBy = from ? from.group : group
      const fallback = paint.colors[paintedBy] ?? rgb
      let into = bucket.get(paintedBy)
      if (!into) { into = { position: [], color: [], uv: [] }; bucket.set(paintedBy, into) }

      // **그쪽을 보게 감는다.** 원작의 감는 방향을 그대로 물려받으면 판이 반대를
      // 보고 있어서, 면은 다 있는데 그 방향에서는 하나도 안 보인다
      const order = area * sign > 0 ? [0, 1, 2] : [0, 2, 1]
      for (const j of order) {
        const q = p[j]!
        const out = [q[0], q[1], q[2]]
        out[axis] = flat(q[u], q[v], q[axis])
        into.position.push(out[0]!, out[1]!, out[2]!)
        // 정점 색은 원작이 구워 둔 것을 그대로 쓴다. 없으면 그림 평균색으로 —
        // 재질이 `vertexColors`라 흰색으로 두면 그림이 그대로 나온다
        if (vcol) {
          const k = tri[j]! * 3
          into.color.push(vcol[k] ?? 1, vcol[k + 1] ?? 1, vcol[k + 2] ?? 1)
        } else {
          into.color.push(
            ((fallback >> 16) & 255) / 255, ((fallback >> 8) & 255) / 255, (fallback & 255) / 255)
        }
        if (from) {
          // **옆벽이 쓰는 그림 칸을 판에 통째로 늘려 붙인다.**
          //
          // ⚠️ 옆벽의 UV를 아핀 함수로 읽어 그 자리 좌표를 넣는 방법을 두 번
          // 시도했고 둘 다 틀렸다. ① 법선 방향 기울기를 0으로 두면 판의 **가로가
          // 통째로 한 값**이 된다 — 원작 벽 그림은 널판이 세로줄이라 변화가 죄다
          // 가로에 있는데 그걸 버리는 것이다(뒷벽이 텍셀 하나짜리 통짜 갈색이
          // 됐다). ② 가로를 옆벽의 길이 방향으로 바꿔 넣으면 이번에는 값이
          // 그림 칸을 벗어난다 — 원작 벽 그림은 **벽 조각을 여러 개 모아 둔 한
          // 장**이라(`t1_h01` 64×64 안에 지붕·창·널판·기단이 다 있다) 조금만
          // 넘쳐도 벽 자리에 지붕이나 창이 찍힌다.
          //
          // 그림 칸을 벗어날 수 없게 하려면 **칸 안에서만 셈하면 된다.** 옆벽이
          // 실제로 쓰는 u 범위를 판의 가로 전체에, 옆벽의 높이–v 대응을 판의
          // 높이에 건다. 널판 한 벌이 뒷벽을 정확히 한 번 덮는다
          const t = span > 0 ? (out[across]! - low) / span : 0
          const h = from.yHigh > from.yLow
            ? (out[1]! - from.yLow) / (from.yHigh - from.yLow) : 0
          const clamp = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
          into.uv.push(
            from.u0 + clamp(t) * (from.u1 - from.u0),
            from.vLow + clamp(h) * (from.vHigh - from.vLow))
        } else into.uv.push(uv?.[tri[j]! * 2] ?? 0, uv?.[tri[j]! * 2 + 1] ?? 0)
      }
    }
  })
  const position: number[] = []
  const color: number[] = []
  const texcoord: number[] = []
  const groups: [number, number, number][] = []
  for (const [group, part] of bucket) {
    groups.push([position.length / 3, part.position.length / 3, group])
    position.push(...part.position)
    color.push(...part.color)
    texcoord.push(...part.uv)
  }
  if (position.length === 0) return null

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(color), 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(texcoord), 2))
  const normal = new Float32Array(position.length)
  for (let i = 0; i < normal.length; i += 3) normal[i + axis] = sign
  geo.setAttribute('normal', new BufferAttribute(normal, 3))
  // 그룹이 곧 재질 번호다. 소품의 재질 배열을 그대로 물릴 수 있다
  for (const [start, count, group] of groups) geo.addGroup(start, count, group)
  geo.computeBoundingSphere()
  return geo
}

/**
 * 빠진 면을 전부 채운 지오메트리 하나. 없으면 `null`.
 *
 * 방향마다 따로 그리면 소품 하나가 드로우콜을 넷씩 먹는다. 방향이 달라도 재질은
 * 같은 배열이라, **같은 서브메시끼리 합치면** 드로우콜이 방향 수가 아니라
 * 재질 수만큼만 는다
 */
export function shellPlates(
  mesh: ChunkMesh, paint: ShellPaint,
): BufferGeometry | null {
  const parts: BufferGeometry[] = []
  for (const [axis, sign] of openDirections(mesh)) {
    const p = facePlate(mesh, paint, axis, sign)
    if (p) parts.push(p)
  }
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]!

  /** 서브메시 → 그 재질로 그릴 삼각형 전부. 방향을 넘어 합친다 */
  const bucket = new Map<number, { position: number[]; normal: number[]; color: number[]; uv: number[] }>()
  const grab = (a: BufferAttribute, from: number, count: number, wide: number): number[] => {
    const arr = a.array as ArrayLike<number>
    const out: number[] = []
    for (let i = from * wide; i < (from + count) * wide; i++) out.push(arr[i]!)
    return out
  }
  for (const p of parts) {
    for (const { start, count, materialIndex } of p.groups) {
      let into = bucket.get(materialIndex ?? 0)
      if (!into) { into = { position: [], normal: [], color: [], uv: [] }; bucket.set(materialIndex ?? 0, into) }
      into.position.push(...grab(p.getAttribute('position') as BufferAttribute, start, count, 3))
      into.normal.push(...grab(p.getAttribute('normal') as BufferAttribute, start, count, 3))
      into.color.push(...grab(p.getAttribute('color') as BufferAttribute, start, count, 3))
      into.uv.push(...grab(p.getAttribute('uv') as BufferAttribute, start, count, 2))
    }
    p.dispose()
  }
  const position: number[] = []
  const normal: number[] = []
  const color: number[] = []
  const texcoord: number[] = []
  const groups: [number, number, number][] = []
  for (const [group, part] of bucket) {
    groups.push([position.length / 3, part.position.length / 3, group])
    position.push(...part.position)
    normal.push(...part.normal)
    color.push(...part.color)
    texcoord.push(...part.uv)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(color), 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(texcoord), 2))
  for (const [start, count, group] of groups) geo.addGroup(start, count, group)
  geo.computeBoundingSphere()
  return geo
}
