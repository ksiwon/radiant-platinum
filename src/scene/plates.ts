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
import { BufferAttribute, BufferGeometry } from 'three'
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
  /**
   * 홀로 선 나무의 그림자 판(2×2)이 놓인 **왼쪽 위 칸**.
   *
   * 원작이 나무 밑에 깐 동그라미라, 그 한가운데가 곧 그 나무의 자리다.
   * 4×8타일짜리는 안 담는다 — 숲 한 덩어리를 한 장으로 덮은 것이라
   * 한가운데가 어느 한 그루의 자리가 아니다
   */
  shadows: Set<number>
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
 * 원작이 나무 밑에 깔아 둔 **그림자 판**.
 *
 * 오버월드에 2,525장 있고 전부 완전히 평평하다. 폭은 2·4·8타일이고 2,254장
 * (89.3%)이 짝수 타일에서 시작한다 — 두 칸 격자에 맞춰 깐 것이다.
 *
 * ⚠️ **걷어낸다.** 원작은 나무가 판때기라 그림자를 그릴 수가 없어서 땅에 동그란
 * 그림을 깔았다. 우리는 입체 나무가 진짜 그림자를 던지므로, 이걸 남겨 두면
 * 나무 크기와 상관없는 **똑같은 동그라미**가 그 위에 하나 더 깔린다.
 *
 * 자리는 버리지 않는다 — 이 판이 짝수 격자에 놓여 있다는 것이 곧 나무를
 * 어디에 세워야 하는지의 근거다 (`Foliage`의 `treeAt`)
 */
const BAKED_SHADOW = /^tshadow$/

export function isBakedShadow(mesh: ChunkMesh, group: number): boolean {
  return BAKED_SHADOW.test(mesh.materials[group]?.tex ?? '')
}

/**
 * **판때기로 세워 놓은 바위.**
 *
 * 나무만 판때기인 것이 아니다. 물가의 바위도 사각형 한 장이고, 원작이 고정
 * 카메라를 보고 45°로 눕혀 놓았다 — 그 각도에서 보면 물에 잠긴 바위로 읽힌다.
 * 세워 놓으면 **새까만 달걀**이 물 위에 늘어선다(양지시티 해안).
 *
 * 이름으로 고르는 것이 위태로워 보이지만 실측이 딱 갈라 준다:
 *
 *   `searock`    사각형 1,001장 — **1,001장 다** 45.0° · **1,001장 다** 2.0×1.41×1.41타일
 *   `dun_srock`  2장 — 둘 다 45.0° · 둘 다 같은 크기
 *   ── 여기까지가 세워 놓은 바위 ──
 *   `c3_iwa_s`   48장 전부 90°(땅에 깔린 무늬)
 *   `c3_grand`   75장 전부 90°
 *   `c3_iwa_l`   11장 전부 60.3° — 45°도 63.4°도 아니라 원래 그 각으로 놓인 지형이다
 *   `m_4ten_iwa` 21장이 11°~57°로 흩어져 있다 (창관산 배경)
 *
 * 한 서브메시가 통째로 한 가지라 삼각형을 골라낼 일이 없다
 */
const ROCK_NAME = /^(searock|dun_srock)$/

export function isRock(mesh: ChunkMesh, group: number): boolean {
  return ROCK_NAME.test(mesh.materials[group]?.tex ?? '')
}

/** 입체로 세울 덩이 하나. 자리는 밑바닥 한가운데다 */
export interface RockSite {
  x: number
  z: number
  /** 밑바닥 높이 */
  y: number
  /** 원작 판의 가로 폭 (타일) */
  w: number
  /** 색을 가져올 서브메시 */
  group: number
  /** 색을 가져올 **그림 칸**. 한 그림에 여러 물건이 들어 있다 */
  u0: number
  u1: number
  v0: number
  v1: number
}

/**
 * 눕혀 놓은 바위 판의 자리와 크기.
 *
 * 사각형 하나가 바위 하나다 — 삼각형 둘씩 이어져 있고(실측: 1,001장이 전부
 * 그렇다), 상자의 가로가 곧 바위 폭이다
 */
export function rockSites(
  mesh: ChunkMesh, position: Float32Array, lumps?: LumpSet,
): RockSite[] {
  const index = mesh.geometry.getIndex()!.array
  const uv = (mesh.geometry.getAttribute('uv') as BufferAttribute | undefined)?.array as
    Float32Array | undefined
  const out: RockSite[] = []
  mesh.groups.forEach(([, start, count], group) => {
    const named = isRock(mesh, group)
    for (let t = 0; t + 6 <= count; t += 6) {
      if (!named && !lumps?.has(start + t)) continue
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity
      let z0 = Infinity, z1 = -Infinity
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
      for (let k = 0; k < 6; k++) {
        const i = index[start + t + k]!
        const x = position[i * 3]!, y = position[i * 3 + 1]!, z = position[i * 3 + 2]!
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (z < z0) z0 = z
        if (z > z1) z1 = z
        const tu = uv ? uv[i * 2]! : 0, tv = uv ? uv[i * 2 + 1]! : 0
        if (tu < u0) u0 = tu
        if (tu > u1) u1 = tu
        if (tv < v0) v0 = tv
        if (tv > v1) v1 = tv
      }
      out.push({
        x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: y0,
        w: Math.max(x1 - x0, z1 - z0), group, u0, u1, v0, v1,
      })
    }
  })
  return out
}

/** 입체로 바꿀 판때기 사각형들. 열쇠는 색인 배열에서의 시작 자리다 */
export type LumpSet = Set<number>

/**
 * **담이 아니라 덩이인 판때기.**
 *
 * ⚠️ 원작 그림 한 장에 여러 물건이 들어 있다. 축복시티 `imped`(64×64) 한 장에
 * 흰 울타리 두 줄 · **바위 한 덩이** · 화분 둘 · 자갈 둘이 같이 있다. 이름으로는
 * 못 가른다 — 같은 서브메시고 같은 텍스처다. 전부 45°로 눕혀 놓아서
 * `standCutouts`가 다 세우는데, 울타리는 세우는 것이 맞고 바위와 화분은
 * **세우면 액자가 된다.** 사용자 화면에서 인도 위에 떠 있던 회색 판이 그 화분이다.
 *
 * 가르는 것은 **그 판이 쓰는 그림 칸의 좌우 끝**이다. 담은 옆으로 이어지므로
 * 칸의 왼쪽 끝과 오른쪽 끝이 둘 다 불투명하고, 덩이는 칸 안에 떠 있어서 한쪽이
 * 비어 있다. 오버월드 45° 사각형 4,651개를 이 잣대로 세면:
 *
 *   담   3,808 — `newstep`(계단 난간) · `seaside3`(물거품) · `imped` 울타리 줄
 *   덩이   843 — `imped` 화분 378+129 · 자갈 104 · 바위 80 …
 *
 * 겹치는 칸이 없다: `imped`의 울타리 칸(u0.00~1.00 · u0.50~0.62, v0.00~0.25)은
 * 전부 담이고 아래쪽 칸(v0.50~1.00)은 전부 덩이다
 */
export function plateLumps(
  mesh: ChunkMesh, sheet: TexSheet | null, cutout: readonly boolean[],
  position: Float32Array,
): LumpSet {
  const out: LumpSet = new Set()
  if (!sheet) return out
  const uv = (mesh.geometry.getAttribute('uv') as BufferAttribute | undefined)?.array as
    Float32Array | undefined
  if (!uv) return out
  const index = mesh.geometry.getIndex()!.array

  mesh.groups.forEach(([, start, count], group) => {
    if (cutout[group] !== true) return
    if (isFoliage(mesh, group, cutout) || isBakedShadow(mesh, group) || isRock(mesh, group)) return
    const spec = mesh.materials[group]!
    const item = sheet.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
    if (!item) return
    for (let t = 0; t + 6 <= count; t += 6) {
      const vs = [0, 1, 2, 3, 4, 5].map((k) => index[start + t + k]!)
      const a = vs[0]!, b = vs[1]!, c = vs[2]!
      const ax = position[a * 3]!, ay = position[a * 3 + 1]!, az = position[a * 3 + 2]!
      const ux = position[b * 3]! - ax, uy = position[b * 3 + 1]! - ay
      const uz = position[b * 3 + 2]! - az
      const vx = position[c * 3]! - ax, vy = position[c * 3 + 1]! - ay
      const vz = position[c * 3 + 2]! - az
      const ny = uz * vx - ux * vz
      const len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx)
      if (len < 1e-9) continue
      // 원작이 눕혀 놓은 각인 것만 본다 — 나머지는 원래 그 각으로 놓인 지형이다
      if (!leaning(Math.abs(ny) / len)) continue
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
      for (const i of vs) {
        const tu = uv[i * 2]!, tv = uv[i * 2 + 1]!
        if (tu < u0) u0 = tu
        if (tu > u1) u1 = tu
        if (tv < v0) v0 = tv
        if (tv > v1) v1 = tv
      }
      if (!edgeToEdge(sheet, item, u0, u1, v0, v1)) out.add(start + t)
    }
  })
  return out
}

/** 그 그림 칸의 **왼쪽 끝과 오른쪽 끝이 둘 다** 불투명한가 — 담의 표시다 */
function edgeToEdge(
  sheet: TexSheet, item: { x: number; y: number; w: number; h: number },
  u0: number, u1: number, v0: number, v1: number,
): boolean {
  const clampX = (t: number) => Math.min(item.w - 1, Math.max(0, t))
  const clampY = (t: number) => Math.min(item.h - 1, Math.max(0, t))
  const tx0 = clampX(Math.round(u0 * item.w))
  const tx1 = clampX(Math.round(u1 * item.w) - 1)
  const ty0 = clampY(Math.round(v0 * item.h))
  const ty1 = clampY(Math.round(v1 * item.h) - 1)
  const opaque = (tx: number): boolean => {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (sheet.pixels[((item.y + ty) * sheet.width + item.x + tx) * 4 + 3]! >= ALPHA_CUT) {
        return true
      }
    }
    return false
  }
  return opaque(tx0) && opaque(tx1)
}

/**
 * 잎을 걷어내고 덮은 칸을 돌려준다.
 *
 * 원본 지오메트리는 손대지 않는다 — 청크는 캐시돼 있고 텍스처 묶음이 다르면
 * 잘라 낼 것도 달라진다
 */
export function splitFoliage(
  mesh: ChunkMesh, cutout: readonly boolean[], lumps?: LumpSet,
): Split {
  const src = mesh.geometry
  const source = (src.getAttribute('position') as BufferAttribute).array as Float32Array
  // 누워 있는 오려 낸 판(울타리·표지판)을 세운다. 원본은 안 건드린다 —
  // 청크는 캐시돼 있고 텍스처 묶음이 다르면 오려 낸 판도 달라진다
  const position = standCutouts(mesh, cutout, source, lumps)
  const index = src.getIndex()!.array
  const cells = new Map<number, Cell>()
  const shadows = new Set<number>()
  const kept: number[] = []
  const groups: [number, number, number][] = []

  mesh.groups.forEach(([, start, count], group) => {
    const begin = kept.length
    const foliage = isFoliage(mesh, group, cutout)
    // 구운 그림자는 그리지 않는다 — 입체 나무가 진짜 그림자를 던진다.
    // 대신 **어디 있었는지는 적어 둔다**: 그 자리가 원작 나무의 자리다
    const shadow = isBakedShadow(mesh, group)
    if (shadow) { soloShadows(position, index, start, count, shadows); groups.push([begin, 0, group]); return }
    // 세워 놓은 바위 판도 걷어낸다 — `Rocks`가 입체로 다시 세운다.
    // 서브메시가 통째로 45°짜리 판이라(실측 1,001/1,001) 고를 것이 없다
    if (isRock(mesh, group)) { groups.push([begin, 0, group]); return }
    for (let t = 0; t < count; t += 3) {
      const a = index[start + t]!, b = index[start + t + 1]!, c = index[start + t + 2]!
      // 담이 아니라 덩이인 판(화분·바위)도 걷어낸다 — `Rocks`가 입체로 세운다.
      // 사각형 단위라 짝수 삼각형에 표가 붙어 있다
      if (lumps?.has(start + t - (t % 6))) continue
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
      // ⚠️ **평평한 잎 판도 같이 걷어낸다.**
      //
      // 원작 나무 그림 한 장에는 위에서 내려다본 밑동이 같이 들어 있고
      // (`tree01`의 오른쪽 위 칸이 초록 타원 위의 그루터기다), 그 그림을 붙인
      // 평평한 판이 나무 밑에 깔려 있었다. 한동안 그 판을 그루마다 다시
      // 깔아 줬는데 — **위에서 내려다본 나무를, 입체로 세운 나무 밑에 또
      // 붙이는 일**이라 세 가지가 어긋났다: ① 타원이 잔디색이라 모랫길
      // 위에서는 초록 스티커가 됐고, ② 카메라가 가까워 나무가 줄어들면
      // (`Foliage.nearScale`) 판은 안 줄어서 그린 그루터기가 줄기 밖으로
      // 삐져나왔고, ③ 진짜 그림자와 접지 그늘 위에 하드한 동그라미가 하나 더
      // 겹쳤다.
      //
      // 걷어내도 발밑은 안 뚫린다. 잎 칸을 메우는 것은 이 판이 아니라
      // `floorPatch`이고, 오버월드 잎 칸 110,703개가 **한 칸도 안 남는다**
      // (`plates.test`가 그 0을 잰다). 판은 그 위에 덧깔려 있었을 뿐이다
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
  for (const name of ['uv', 'color', 'normal']) {
    const attr = src.getAttribute(name)
    if (attr) geometry.setAttribute(name, attr)
  }
  geometry.setAttribute('position', position === source
    ? src.getAttribute('position')
    : new BufferAttribute(position, 3))
  geometry.setIndex(kept)
  for (const [start, count, group] of groups) {
    if (count > 0) geometry.addGroup(start, count, group)
  }
  geometry.boundingSphere = src.boundingSphere
  return { cells, shadows, geometry, groups }
}

/**
 * 누워 있는 오려 낸 판을 **세운다** (울타리·표지판·덤불).
 *
 * ⚠️ 나무만 판때기인 것이 아니다. 원작은 고정 3/4 카메라를 보고 그린 것이라
 * 울타리도 **45°로 눕혀 놓았다** — 그 각도에서 보면 서 있는 것으로 읽힌다.
 * 우리 카메라로 보면 널판이 비스듬히 쓰러져 있다.
 *
 * 각도가 우연이 아니다: 오버월드 `imped`(흰 울타리) 삼각형 2,854개의 눕은 각이
 * p05·중앙값 **둘 다 정확히 45.0°**다. `area07_hei_h`도 45.0°, `h3`는 63.4°
 * (=atan 2)다. 이미 서 있는 것(0°)과 땅에 깔린 것(90°)은 안 건드린다.
 *
 * 세우는 방법은 **아래 모서리를 축으로 돌리는 것**이다. 판이 평면이라 그 평면의
 * 수평 방향(경첩)과 오르막 방향을 뽑아, 오르막 성분만 수직으로 옮기면 된다.
 * 그래서 45° 1타일짜리 울타리는 1.41타일 높이로 선다 — 원작 카메라에서 보이던
 * 크기가 그것이다
 */

/**
 * 원작이 **판때기를 눕혀 놓은 각**. 이 각이 아니면 안 세운다.
 *
 * ⚠️ **기울기 구간(0.20~0.97)으로 잡으면 안 된다.** 그렇게 잡았다가 지형을
 * 통째로 일으켜 세웠다 — 실측으로 청크 632개에서:
 *
 *   울타리 `imped` 2,920삼각형          **45.0°** (나머지 700개는 90°=깔린 것)
 *   동굴 울타리 `dun_imped` 2,330       **45.0°** (전부)
 *   화단 `bf_ueki01` 192 · `yomawaru` 350  **45.0°** (전부)
 *   ── 여기까지가 세워야 할 것 ──
 *   바닷가 거품 `seaside3` 15,426       15.9° · 80.5° · 85.8° · 74.1° (45°가 0개)
 *   빛기둥 `dun_light` 666              83.7° · 9.5° · 81.4° · 14.9° …
 *   천장 구멍 `dun_dhole` 962           48.0° · 0° · 88.2°
 *   동굴 조명 `c5_light` 1,620          46.1° · 41.5° · 32.5° …
 *
 * 원작이 **정확히 45.0°**로 그려 둔 것만 그 속임수를 쓴 것이고, 나머지는 그냥
 * 그 각도로 놓인 지형이다. 천관산에 흰 판때기가 공중에 떠 있던 것이 이것이었다 —
 * 48°짜리 천장 구멍 판을 울타리로 알고 세워 놓았다.
 *
 * 63.4°(=atan 2)도 함께 둔다. 소품 `area07_hei_h3`가 그 각이다 — 지금은 청크만
 * 이 길을 지나지만, 각이 우연이 아니라 원작이 고른 값이라는 증거다
 */
const STAND_ANGLES = [45, 63.4349] as const
/** 각을 얼마나 봐 주는가(도). 원작 값이 딱 떨어져서 넉넉할 이유가 없다 */
const STAND_SLACK = 0.2

/**
 * 이 기울기가 원작이 눕혀 놓은 각인가.
 *
 * `lean`은 판 법선의 |y| 성분(0=서 있다 · 1=깔렸다)이라, 판이 수직에서 넘어간
 * 각이 곧 `asin(lean)`이다
 */
export function leaning(lean: number): boolean {
  const deg = (Math.asin(Math.min(1, lean)) * 180) / Math.PI
  return STAND_ANGLES.some((a) => Math.abs(deg - a) <= STAND_SLACK)
}

/** 판 하나를 세운다. 정점 자리를 제자리에서 고친다 */
function standCard(pos: Float32Array, verts: number[], n: [number, number, number]): void {
  // 경첩은 판 평면의 수평 방향이다. 판이 수평이면 경첩이 없다
  const hx = n[2], hz = -n[0]
  const hl = Math.hypot(hx, hz)
  if (hl < 1e-6) return
  const ux = hx / hl, uz = hz / hl
  // 오르막은 판 안에서 제일 위를 보는 방향 — 경첩과 법선에 둘 다 수직이다
  let sx = n[1] * uz, sy = n[2] * ux - n[0] * uz, sz = -n[1] * ux
  const sl = Math.hypot(sx, sy, sz)
  if (sl < 1e-6) return
  sx /= sl; sy /= sl; sz /= sl
  if (sy < 0) { sx = -sx; sy = -sy; sz = -sz }

  let low = verts[0]!
  for (const i of verts) if (pos[i * 3 + 1]! < pos[low * 3 + 1]!) low = i
  const ox = pos[low * 3]!, oy = pos[low * 3 + 1]!, oz = pos[low * 3 + 2]!
  for (const i of verts) {
    const dx = pos[i * 3]! - ox, dy = pos[i * 3 + 1]! - oy, dz = pos[i * 3 + 2]! - oz
    const along = dx * ux + dz * uz
    const up = dx * sx + dy * sy + dz * sz
    pos[i * 3] = ox + along * ux
    pos[i * 3 + 1] = oy + up
    pos[i * 3 + 2] = oz + along * uz
  }
}

/**
 * 누운 판을 전부 세운 자리 배열. 세울 것이 없으면 원본을 그대로 돌려준다.
 *
 * 판마다 따로 세워야 한다 — 울타리 한 줄이 한 서브메시에 다 들어 있고, 판이
 * 저마다 다른 자리에서 시작한다. 그래서 정점을 함께 쓰는 삼각형끼리 묶는다
 */
export function standCutouts(
  mesh: ChunkMesh, cutout: readonly boolean[], position: Float32Array, lumps?: LumpSet,
): Float32Array {
  const index = mesh.geometry.getIndex()!.array
  let out: Float32Array | null = null
  mesh.groups.forEach(([, start, count], group) => {
    if (cutout[group] !== true) return
    if (isFoliage(mesh, group, cutout) || isBakedShadow(mesh, group)) return
    // 바위 판은 세우지 않는다 — 세우면 새까만 달걀이고, `Rocks`가 입체로 세운다
    if (isRock(mesh, group)) return
    /** 덩이로 빠진 사각형인가. 세워 봐야 걷어낼 것이라 손대지 않는다 */
    const lump = (t: number): boolean => lumps?.has(start + t - (t % 6)) === true

    // 정점을 함께 쓰는 삼각형끼리 묶는다 (유니온-파인드)
    const parent = new Map<number, number>()
    const find = (x: number): number => {
      let r = x
      while (parent.get(r) !== r) r = parent.get(r) ?? r
      return r
    }
    const join = (a: number, b: number) => {
      const ra = find(a), rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }
    for (let t = 0; t < count; t += 3) {
      if (lump(t)) continue
      for (const k of [0, 1, 2]) {
        const i = index[start + t + k]!
        if (!parent.has(i)) parent.set(i, i)
      }
      join(index[start + t]!, index[start + t + 1]!)
      join(index[start + t]!, index[start + t + 2]!)
    }

    /** 덩이마다 면적 가중 법선과 정점 목록 */
    const parts = new Map<number, { n: [number, number, number]; verts: Set<number> }>()
    for (let t = 0; t < count; t += 3) {
      if (lump(t)) continue
      const a = index[start + t]!, b = index[start + t + 1]!, c = index[start + t + 2]!
      const root = find(a)
      let part = parts.get(root)
      if (!part) { part = { n: [0, 0, 0], verts: new Set() }; parts.set(root, part) }
      const ax = position[a * 3]!, ay = position[a * 3 + 1]!, az = position[a * 3 + 2]!
      const ux = position[b * 3]! - ax, uy = position[b * 3 + 1]! - ay, uz = position[b * 3 + 2]! - az
      const vx = position[c * 3]! - ax, vy = position[c * 3 + 1]! - ay, vz = position[c * 3 + 2]! - az
      part.n[0] += uy * vz - uz * vy
      part.n[1] += uz * vx - ux * vz
      part.n[2] += ux * vy - uy * vx
      part.verts.add(a); part.verts.add(b); part.verts.add(c)
    }

    for (const part of parts.values()) {
      const len = Math.hypot(...part.n)
      if (len < 1e-9) continue
      // 이미 선 것(0°)과 땅에 깔린 것(90°)은 여기서 저절로 빠진다
      if (!leaning(Math.abs(part.n[1]) / len)) continue
      out ??= position.slice()
      standCard(out, [...part.verts], [part.n[0] / len, part.n[1] / len, part.n[2] / len])
    }
  })
  return out ?? position
}

/**
 * 숲 바닥. 원작이 잎 판으로 가려 두고 **땅을 안 만든 자리**를 메운다.
 *
 * ⚠️ **원작 숲에는 바닥이 없다.** 떡잎마을 청크에서 나무 144그루 중 밑에 지형
 * 삼각형이 있는 것이 33그루뿐이다 — 고정 카메라에서 잎에 가려 보일 일이 없어서
 * 안 만든 것이다. 판때기를 걷어내면 그 자리가 그대로 뚫린다.
 *
 * ⚠️ **잎 그림으로 메우면 안 된다.** 한 번 원작의 평평한 잎 판을 남겨 봤는데,
 * 그건 바닥이 아니라 *위에서 내려다본 우듬지*라 나무마다 밑에 검푸른 원반이
 * 깔렸다. 메울 것은 **둘레 지형의 그 타일**이다.
 *
 * 그래서 칸마다 제일 가까운 **바닥 삼각형**을 찾아 그것의 서브메시와 UV 평면을
 * 그대로 이어 쓴다. 색도 그림도 우리가 고르지 않는다 — 옆 타일이 정한다.
 *
 * ⚠️ **청크 안에서만 찾으면 절반이 안 메워진다.** 오버월드 배치 468개 중 46개가
 * 이어 쓸 바닥 삼각형이 **청크에 하나도 없는** 것이고(대부분 숲만 든 173번),
 * 잎 칸 110,703개 중 51,546개(46.6%)가 거기 있다. 그 46개는 전부 **바로 옆
 * 청크에 바닥이 있다**(고리 1). 그래서 없으면 이웃에서 빌려 온다 —
 * `shiftFloors`가 삼각형을 이쪽 좌표계로 밀고, UV는 좌표의 아핀 함수라 따라온다
 */
export interface FloorPatch {
  geometry: BufferGeometry
  /** `[시작, 개수, 서브메시]`. 청크 재질 배열을 그대로 쓴다 */
  groups: [number, number, number][]
}

/** 바닥으로 칠 만큼 누워 있는가. 절벽면·울타리를 이어 쓰면 벽 그림이 땅에 깔린다 */
const FLOOR_NORMAL = 0.7

/**
 * 바닥 삼각형 하나를 **평면 계수까지 펴 둔 것**.
 *
 * 정점 색인이 아니라 값으로 갖는 이유는 **옆 청크에서 빌려 오기 위해서**다.
 * `x`·`z`에 청크 사이 거리를 더하면 그대로 이쪽 좌표계의 삼각형이 된다 —
 * UV는 좌표의 아핀 함수라 평행이동에 따라오고, 이어 붙은 땅이 그대로 이어진다
 */
export interface FloorTri {
  /** 재질 색인. 빌려 온 것은 부른 쪽이 재질 배열에 덧붙이고 그 번호를 준다 */
  group: number
  ax: number; az: number; au: number; av: number
  ux: number; uz: number; du: number; dv: number
  vx: number; vz: number; eu: number; ev: number
  /**
   * 그 삼각형의 **정점 색**.
   *
   * ⚠️ 원작은 지형에 그늘을 정점 색으로 구워 넣는다 — 청크 300은 정점 1,147개가
   * 156·181·206·255 넉 단계다. 메운 바닥에 이걸 안 실으면 재질이
   * `vertexColors`라 흰색으로 그려져서, 원작 땅보다 **밝은 사각형**이 된다.
   * 영원의 숲 바닥이 밝고 어두운 타일의 바둑판이었던 것이 이것이다 (실측:
   * 같은 `fenter`인데 원작 땅 #198a30 · 메운 바닥 #44b946)
   */
  r: number; g: number; b: number
  /** 무게중심. 어느 것이 가까운지 이걸로 잰다 */
  cx: number; cz: number
  /**
   * 그 삼각형의 높이.
   *
   * 높이 자료(BDHC)가 없는 칸에서 쓴다 — 잎 칸 110,703개 중 943개가 그렇다.
   * 판을 안 깔면 그 자리는 그대로 뚫리므로, **베껴 온 그 타일의 높이**로 깐다.
   * 우리가 정한 값이 아니라 옆 타일이 실제로 서 있는 높이다
   */
  cy: number
}

/** 이 청크의 바닥 삼각형과, 원작 지형이 이미 덮은 칸 */
export interface FloorSource {
  floors: FloorTri[]
  /**
   * 걸러 내기 전의 바닥. **`floors`가 비었을 때만 채워진다.**
   *
   * 물·턱밖에 없는 청크가 여기 걸린다. 그 그림을 숲 밑에 깔면 안 되지만
   * (`NOT_FLOOR`), 이웃도 못 빌려 왔으면 발밑이 뚫리는 것보다는 낫다 —
   * 마지막 보루다 (`ChunkModels`)
   */
  fallback?: FloorTri[]
  covered: Set<number>
  /**
   * 칸마다 **바닥이 실제로 있는 높이들**.
   *
   * ⚠️ **"덮였는가"만으로는 구멍을 못 막는다.** 원작 지형은 층이 겹친다 —
   * 한 칸 위로 윗단의 잔디가 지나가고 그 밑에 아랫단의 잔디가 또 있다. 덮인
   * 것으로만 세면 **어느 층이 덮였는지**를 안 보게 되고, 잎이 걸려 있던 층에
   * 바닥이 없어도 그냥 넘어간다. 영원의 숲에서 길 바로 옆에 **하늘이 비치는
   * 구멍**이 그렇게 남아 있었다: 그 칸을 덮은 것은 y=0의 아랫단 잔디와
   * 기울기 0.64짜리 절벽면뿐이고, 걸어 다니는 y=1에는 아무것도 없었다
   */
  levels: Map<number, number[]>
}

/**
 * 바닥이 "그 층"인지 보는 여유(타일).
 *
 * 4세대 지형의 단차는 한 타일이다(실측: 구멍 자리의 두 층이 y=0과 y=1).
 * 절반이면 두 층이 확실히 갈리면서, 같은 층 안의 미세한 요철은 안 가른다
 */
export const LEVEL_SLACK = 0.5

/**
 * **물은 메울 바닥이 못 된다.**
 *
 * ⚠️ 잎 밑을 메우는 자리는 칸마다 제일 가까운 바닥 삼각형을 베끼는데, 물가
 * 근처에서는 그 제일 가까운 것이 물이다. 실측으로 메운 칸 101,082개 중
 * **6,167개가 웅덩이**(`puddlep` 4,583 · `puddle_b` 1,584)에서, 1,208개가
 * 바다에서 왔다 — 떡잎마을 숲 사이사이에 파란 마름모가 뜬 것이 그것이다.
 * 그 그림들은 바닥 넓이의 2~4%밖에 안 되는 장식인데 숲 안쪽까지 번진다.
 *
 * 이름으로 거른다. 어디가 물인지는 거동값이 말하고(`Water.tsx`), 여기서 쓰는
 * 것은 **그 그림을 베껴 오지 말라**는 표시뿐이다
 */
const NOT_FLOOR = /^(sea|lake|asasea|dun_sea|puddle|allpeak)/

/** 이 서브메시를 메울 바닥으로 베껴 와도 되는가 */
export function canBorrowFloor(mesh: ChunkMesh, group: number): boolean {
  return !NOT_FLOOR.test(mesh.materials[group]?.tex ?? '')
}

/**
 * 바닥 삼각형을 모은다. 청크마다 한 번만 하면 되므로 따로 뺐다 —
 * 이웃이 빌려 갈 때도 이 결과를 그대로 쓴다.
 *
 * `keep`으로 서브메시를 걸러 낼 수 있다. 거르고 나서 아무것도 안 남으면
 * **거르지 않은 것을 돌려준다** — 물가 청크에 바닥이 물뿐일 수 있고, 그때는
 * 물이라도 깔아야 발밑이 안 뚫린다
 */
export function floorSource(split: Split, keep?: (group: number) => boolean): FloorSource {
  if (!keep) return gatherFloors(split)
  const some = gatherFloors(split, keep)
  if (some.floors.length > 0) return some
  // ⚠️ **여기서 그냥 물을 깔면 거른 것이 헛일이 된다.** 한동안 그랬다 — 걸러
  // 놓고 아무것도 안 남으면 안 거른 것을 돌려줬는데, 그러면 `floors`가 안 비고
  // `ChunkModels`가 **이웃에서 빌려 오는 길로 안 간다.** 실측으로 오버월드
  // 176청크에서 메운 삼각형 8,296개가 `puddlep`(웅덩이)였다 — 잔디 44,310개
  // 다음으로 많고, 정작 웅덩이의 바닥 넓이는 전체의 0.1%다. 떡잎마을 숲
  // 사이사이에 파란 마름모가 떠 있던 것이 이것이다.
  //
  // 비워서 돌려준다. 이웃 청크에서 빌려 오는 것이 언제나 낫고
  // (`ChunkModels.borrowFloors`가 고리 4까지 찾는다), 정말 아무 데도 없으면
  // `fallback`이 마지막 보루로 남는다
  return { ...some, fallback: gatherFloors(split).floors }
}

/** @param keep 이 서브메시를 **바닥으로 셀 것인가** */
function gatherFloors(split: Split, keep?: (group: number) => boolean): FloorSource {
  const pos = (split.geometry.getAttribute('position') as BufferAttribute).array as Float32Array
  const uvAttr = split.geometry.getAttribute('uv') as BufferAttribute | undefined
  const uv = uvAttr?.array as Float32Array | undefined
  const colAttr = split.geometry.getAttribute('color') as BufferAttribute | undefined
  const col = colAttr?.array as ArrayLike<number> | undefined
  const index = split.geometry.getIndex()!.array
  const floors: FloorTri[] = []
  const covered = new Set<number>()
  const levels = new Map<number, number[]>()
  for (const [start, count, group] of split.groups) {
    if (keep && !keep(group)) continue
    for (let t = 0; t < count; t += 3) {
      const a = index[start + t]!, b = index[start + t + 1]!, c = index[start + t + 2]!
      const ax = pos[a * 3]!, ay = pos[a * 3 + 1]!, az = pos[a * 3 + 2]!
      const ux = pos[b * 3]! - ax, uy = pos[b * 3 + 1]! - ay, uz = pos[b * 3 + 2]! - az
      const vx = pos[c * 3]! - ax, vy = pos[c * 3 + 1]! - ay, vz = pos[c * 3 + 2]! - az
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz)
      if (len < 1e-9) continue
      // 덮인 칸은 **어떤 면이든** 덮은 것으로 친다. 바닥인 면은 **높이까지** 적는다
      const bx0 = Math.min(ax, ax + ux, ax + vx), bx1 = Math.max(ax, ax + ux, ax + vx)
      const bz0 = Math.min(az, az + uz, az + vz), bz1 = Math.max(az, az + uz, az + vz)
      const area = ux * vz - vx * uz
      const flat = Math.abs(ny) / len >= FLOOR_NORMAL
      if (Math.abs(area) > 1e-9) {
        for (let tz = Math.floor(bz0); tz <= Math.floor(bz1); tz++) {
          for (let tx = Math.floor(bx0); tx <= Math.floor(bx1); tx++) {
            const px = tx + 0.5 - ax, pz = tz + 0.5 - az
            const w1 = (px * vz - vx * pz) / area
            const w2 = (ux * pz - px * uz) / area
            if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue
            const key = cellKey(tx, tz)
            covered.add(key)
            if (!flat) continue
            const y = ay + w1 * uy + w2 * vy
            const here = levels.get(key)
            if (here) here.push(y)
            else levels.set(key, [y])
          }
        }
      }
      if (!flat) continue
      const au = uv ? uv[a * 2]! : 0, av = uv ? uv[a * 2 + 1]! : 0
      const mid = (k: number): number => (col
        ? (col[a * 3 + k]! + col[b * 3 + k]! + col[c * 3 + k]!) / 3 : 1)
      floors.push({
        group,
        r: mid(0), g: mid(1), b: mid(2),
        ax, az, au, av,
        ux, uz, du: uv ? uv[b * 2]! - au : 0, dv: uv ? uv[b * 2 + 1]! - av : 0,
        vx, vz, eu: uv ? uv[c * 2]! - au : 0, ev: uv ? uv[c * 2 + 1]! - av : 0,
        cx: ax + (ux + vx) / 3, cz: az + (uz + vz) / 3, cy: ay + (uy + vy) / 3,
      })
    }
  }
  return { floors, covered, levels }
}

/**
 * 빌려 온 바닥을 이 청크 좌표계로 옮긴다.
 *
 * UV는 좌표의 아핀 함수라 꼭짓점만 밀면 따라온다 — 그래서 옆 청크의 흙길이
 * 경계를 넘어 그대로 이어진다. 재질은 이쪽 배열에 없으므로 번호를 갈아 끼운다
 */
export function shiftFloors(
  floors: readonly FloorTri[], dx: number, dz: number, group: (from: number) => number,
): FloorTri[] {
  return floors.map((f) => ({
    ...f,
    group: group(f.group),
    ax: f.ax + dx, az: f.az + dz,
    cx: f.cx + dx, cz: f.cz + dz,
  }))
}

/**
 * 칸마다 제일 가까운 바닥 삼각형.
 *
 * ⚠️ 칸마다 삼각형을 전부 훑으면 안 되는 자리가 있다. 숲만 든 청크(173번)는
 * 잎 칸이 1,122개인데 빌려 올 삼각형이 이웃 여덟에서 수천 개 온다 — 곱하면
 * 한 청크에 수백만 번이고, 창을 다시 세울 때마다 그만큼 멈춘다.
 *
 * 그래서 삼각형을 **타일 격자에 찍고** 거기서 너비 우선으로 번진다. 칸 하나에
 * 드는 값이 개수와 무관해진다
 */
function nearestFloors(
  cells: Iterable<number>, floors: readonly FloorTri[],
): Map<number, FloorTri> {
  const seed = new Map<number, number>()
  /**
   * **넓은 땅이 이긴다.**
   *
   * ⚠️ 같은 거리에 두 바닥이 있으면 예전에는 배열에서 먼저 나온 것이 이겼다 —
   * 뜻 없는 순서다. 그래서 떡잎마을 나무줄 밑이 통째로 눈밭이 됐다: 눈
   * (`s_snow`)은 그 청크 바닥의 0.1%인데 메운 칸의 22배를 칠했다. 화면에서는
   * 숲 앞에 흰 선반이 깔린 것으로 보였다.
   *
   * 서브메시 넓이 순으로 훑으면 **비긴 칸은 그 청크를 실제로 이루는 땅**이
   * 가져간다. 눈 바로 옆 칸은 여전히 눈이다 — 거리가 이기지, 넓이가 거리를
   * 뒤집지는 않는다
   */
  const area = new Map<number, number>()
  for (const f of floors) {
    area.set(f.group, (area.get(f.group) ?? 0) + Math.abs(f.ux * f.vz - f.vx * f.uz) / 2)
  }
  const order = floors
    .map((_, i) => i)
    .sort((a, b) => (area.get(floors[b]!.group) ?? 0) - (area.get(floors[a]!.group) ?? 0))
  order.forEach((i) => {
    const f = floors[i]!
    const x0 = Math.floor(Math.min(f.ax, f.ax + f.ux, f.ax + f.vx))
    const x1 = Math.floor(Math.max(f.ax, f.ax + f.ux, f.ax + f.vx))
    const z0 = Math.floor(Math.min(f.az, f.az + f.uz, f.az + f.vz))
    const z1 = Math.floor(Math.max(f.az, f.az + f.uz, f.az + f.vz))
    for (let tz = z0; tz <= z1; tz++) {
      for (let tx = x0; tx <= x1; tx++) {
        const k = cellKey(tx, tz)
        if (!seed.has(k)) seed.set(k, i)
      }
    }
  })
  const want = new Set(cells)
  const out = new Map<number, FloorTri>()
  let front = [...seed.keys()]
  const from = new Map(seed)
  // 청크가 ±16타일이고 이웃까지 ±48이다.
  //
  // ⚠️ **56이었다.** 바로 옆 청크(씨앗이 ±32)까지만 닿는 값이라, 물·턱만 든
  // 청크가 두 칸 떨어진 데서 바닥을 빌려 오게 되자 그 씨앗(±64)이 통째로
  // 잘려 나가 잎 칸 2,244개가 뚫렸다. 고리 3까지 덮는다
  const LIMIT = 120
  for (let step = 0; front.length > 0 && out.size < want.size && step <= LIMIT * 2; step++) {
    const next: number[] = []
    for (const k of front) {
      const i = from.get(k)!
      if (want.has(k) && !out.has(k)) out.set(k, floors[i]!)
      const tx = cellX(k), tz = cellZ(k)
      for (const [dx, dz] of NEIGHBORS) {
        const nx = tx + dx, nz = tz + dz
        if (nx < -LIMIT || nx >= LIMIT || nz < -LIMIT || nz >= LIMIT) continue
        const nk = cellKey(nx, nz)
        if (from.has(nk)) continue
        from.set(nk, i)
        next.push(nk)
      }
    }
    front = next
  }
  return out
}

const NEIGHBORS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
]

export function floorPatch(
  split: Split,
  ground: (x: number, z: number, near: number) => number | null,
  borrowed: readonly FloorTri[] = [],
  source?: FloorSource,
): FloorPatch | null {
  const src = source ?? floorSource(split)
  const { floors: own, levels } = src
  const floors = borrowed.length > 0 ? [...own, ...borrowed] : own
  /**
   * 마지막 보루. 물·턱뿐이라 걸러 낸 바닥이다 (`floorSource`).
   *
   * ⚠️ **없는 것으로 두면 발밑이 뚫린다.** 걸러 내기만 하고 이웃도 못 빌려 온
   * 자리가 잎 칸 2,244개였다 — 파란 마름모보다 하늘 구멍이 나쁘다. 그래서
   * 진짜 바닥으로 닿는 칸은 진짜 바닥으로 메우고, **거기서 못 닿은 칸만**
   * 이걸로 메운다
   */
  const spare = src.fallback ?? []
  if (floors.length === 0 && spare.length === 0) return null

  // ⚠️ **"덮였는가"가 아니라 "그 층에 바닥이 있는가"를 본다.** 층이 겹친 자리에서
  // 잎이 걸린 층에 바닥이 없으면 그 칸은 그대로 뚫린다 (`FloorSource.levels`)
  const bare: number[] = []
  for (const [key, cell] of split.cells) {
    const want = ground(cellX(key) + 0.5, cellZ(key) + 0.5, cell.minY)
    const here = levels.get(key)
    // 높이 자료가 없는 칸은 예전대로 "덮였으면 됐다"로 본다 — 견줄 값이 없다
    if (here && (want === null || here.some((y) => Math.abs(y - want) <= LEVEL_SLACK))) continue
    bare.push(key)
  }
  const nearest = floors.length > 0 ? nearestFloors(bare, floors) : new Map<number, FloorTri>()
  // 진짜 바닥으로 못 닿은 칸만 마지막 보루로 다시 찾는다
  const missed = bare.filter((k) => !nearest.has(k))
  if (missed.length > 0 && spare.length > 0) {
    for (const [k, f] of nearestFloors(missed, spare)) nearest.set(k, f)
  }

  /** 서브메시별로 모은다. 재질이 서브메시 순서라 그대로 그룹이 된다 */
  const bucket = new Map<number, { position: number[]; uv: number[]; color: number[] }>()

  /**
   * 칸 하나를 삼각형 판 하나로 깐다. 그림은 `src`의 타일을 그대로 한 장 베낀다.
   *
   * ⚠️ **평면을 늘리지 않고 그 칸으로 되접는다.**
   *
   * 평면을 그냥 늘리면 UV가 삼각형에서 멀어진 만큼 그대로 벗어난다. 안 물리는
   * 그림은 벗어난 값이 가장자리 텍셀로 눌려서 **한 색으로 칠한 널따란 판**이
   * 깔린다 — 영원의 숲 바닥 절반이 그렇게 민무늬 초록이었다.
   *
   * ⚠️ **물리는 그림이면 괜찮다고 뒀던 것이 두 번째 고장이었다.** 원작 바닥
   * 그림 한 장은 타일 한 장이 아니라 **여러 벌을 모아 둔 한 장**이다. 늘리면
   * 칸마다 다른 벌을 집어서, 같은 `fenter`인데 원래 땅은 #198a30이고 메운
   * 바닥은 #44b946으로 나왔다 — 영원의 숲 바닥이 밝고 어두운 사각형이
   * 번갈아 깔린 바둑판이 된 것이 이것이다.
   *
   * 그래서 늘 되접는다: 칸 안쪽 자리만 살리고 칸 번호는 **베껴 온 칸의 것**을
   * 쓴다. `at`이 아핀이라 정수 칸만큼 옮기는 것은 곧 그 타일을 그대로 한 장
   * 복사하는 것이고, 메운 칸이 원본 칸과 **똑같이** 보인다
   */
  const lay = (src: FloorTri, tx: number, tz: number, y: number): void => {
    const { ax, az, ux, uz, vx, vz, au, av, du, dv, eu, ev } = src
    const area = ux * vz - vx * uz
    const at = (x: number, z: number): [number, number] => {
      if (Math.abs(area) < 1e-9) return [0, 0]
      const px = x - ax, pz = z - az
      const w1 = (px * vz - vx * pz) / area
      const w2 = (ux * pz - px * uz) / area
      return [au + w1 * du + w2 * eu, av + w1 * dv + w2 * ev]
    }
    const shiftX = Math.floor(src.cx) - tx
    const shiftZ = Math.floor(src.cz) - tz

    let into = bucket.get(src.group)
    if (!into) { into = { position: [], uv: [], color: [] }; bucket.set(src.group, into) }
    // 칸 하나를 살짝 넘겨 깐다 — 딱 맞추면 이웃 칸과의 사이에 실금이 보인다
    const e = 0.01
    // ⚠️ **위를 보게 감는다.** 법선 배열만 +Y로 채우고 감는 방향을 안 맞추면
    // three가 **감는 방향으로** 앞뒤를 가리므로, 지형 재질(단면)에서 이 판이
    // 위에서 볼 때 통째로 사라진다 — 나무 밑이 뻥 뚫려 하늘이 보이던 것이 이것이다.
    // 원작 바닥 삼각형 123,733개 중 123,531개가 법선이 위다. 그쪽에 맞춘다
    const quad: [number, number][] = [
      [tx - e, tz - e], [tx + 1 + e, tz + 1 + e], [tx + 1 + e, tz - e],
      [tx - e, tz - e], [tx - e, tz + 1 + e], [tx + 1 + e, tz + 1 + e],
    ]
    for (const [x, z] of quad) {
      into.position.push(x, y, z)
      into.uv.push(...at(x + shiftX, z + shiftZ))
      // 베껴 온 삼각형의 그늘을 같이 가져온다 — 안 그러면 이 칸만 하얗게 뜬다
      into.color.push(src.r, src.g, src.b)
    }
  }

  for (const key of bare) {
    const cell = split.cells.get(key)!
    const tx = cellX(key), tz = cellZ(key)
    const cx = tx + 0.5, cz = tz + 0.5
    const best = nearest.get(key)
    if (!best) continue
    // 높이 자료가 없으면 **베껴 온 타일이 서 있는 높이**로 깐다. 예전엔 그런
    // 칸을 건너뛰었는데, 그러면 943칸이 그대로 뚫린 채 남는다
    const y = ground(cx, cz, cell.minY) ?? best.cy
    lay(best, tx, tz, y)
  }
  if (bucket.size === 0) return null

  const position: number[] = []
  const texcoord: number[] = []
  const color: number[] = []
  const groups: [number, number, number][] = []
  for (const [group, part] of bucket) {
    groups.push([position.length / 3, part.position.length / 3, group])
    position.push(...part.position)
    texcoord.push(...part.uv)
    color.push(...part.color)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(texcoord), 2))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(color), 3))
  const normal = new Float32Array(position.length)
  for (let i = 1; i < normal.length; i += 3) normal[i] = 1
  geometry.setAttribute('normal', new BufferAttribute(normal, 3))
  for (const [start, count, group] of groups) geometry.addGroup(start, count, group)
  geometry.computeBoundingSphere()
  return { geometry, groups }
}

/**
 * 그림자 판 중 **2×2짜리**의 왼쪽 위 칸을 모은다.
 *
 * 삼각형 둘이 사각형 하나다 — 원작 판은 전부 그렇게 나온다. 2×2가 아닌 것
 * (4×4 · 8×8 · 8×2 …)은 숲 한 덩어리를 한 장으로 덮은 것이라 뺀다
 */
function soloShadows(
  position: Float32Array, index: ArrayLike<number>,
  start: number, count: number, out: Set<number>,
): void {
  for (let t = 0; t + 6 <= count; t += 6) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (let k = 0; k < 6; k++) {
      const i = index[start + t + k]!
      const x = position[i * 3]!, z = position[i * 3 + 2]!
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (z < z0) z0 = z
      if (z > z1) z1 = z
    }
    if (Math.abs(x1 - x0 - 2) > 0.01 || Math.abs(z1 - z0 - 2) > 0.01) continue
    out.add(cellKey(Math.round(x0), Math.round(z0)))
  }
}

/** 밑동이 서는 모서리에 닿는 네 칸 (dx, dz). 왼위 · 오위 · 왼아래 · 오아래 */
const CORNER_TILES = [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const

/**
 * 밑동을 **막힌 칸 쪽으로 반 칸 민다**. 아예 세우면 안 되는 자리면 `null`.
 *
 * ⚠️ 밑동은 타일 **모서리**에 선다(실측: 자리값이 전부 정수다). 굵기는 원작이
 * 그린 그루터기 그대로 1.2타일(`Foliage.TRUNK_R` × 2)이라, 모서리에 서면 네
 * 칸에 각각 0.6타일씩 들어간다. 그중 하나라도 걸어 다니는 칸이면 **길 위에
 * 줄기가 서고 몸이 그 속을 지나간다** — 사람 반지름이 0.3이라 피할 수가 없다.
 *
 * 사방이 다 열린 자리는 예전대로 아예 안 세운다(길 한복판). 남은 것이 길가인데,
 * "서 있어도 몸이 안 지나간다"며 그대로 뒀던 자리다. 실측으로 오버월드
 * 26,199그루 중 **869그루**가 그렇다 — 열린 칸이 1개 91 · 2개 644 · 3개 134.
 *
 * 미는 방법은 **축마다 막힌 쪽으로 반 칸**이다. 그러면 밑동 한가운데가 모서리가
 * 아니라 막힌 칸 한가운데로 가고, 열린 칸에 남는 것이 0.6−0.5 = **0.1타일**이
 * 된다. 남는 것은 막힌 칸 둘이 **대각으로** 놓여 밀 축이 없는 자리뿐이다
 */
export function trunkNudge(
  blocked: (tx: number, tz: number) => boolean, tx: number, tz: number,
): { dx: number, dz: number } | null {
  const open = CORNER_TILES.map(([dx, dz]) => !blocked(tx + dx, tz + dz))
  const openCount = open.filter(Boolean).length
  if (openCount === 4) return null
  if (openCount === 0) return { dx: 0, dz: 0 }
  const wall = (i: number): number => (open[i] === true ? 0 : 1)
  const left = wall(0) + wall(2), right = wall(1) + wall(3)
  const up = wall(0) + wall(1), down = wall(2) + wall(3)
  return {
    dx: left === right ? 0 : left > right ? -0.5 : 0.5,
    dz: up === down ? 0 : up > down ? -0.5 : 0.5,
  }
}

export interface TreeSite {
  /** 크기·색을 정하는 잎 칸 */
  key: number
  cell: Cell
  /** 밑동 자리 (청크 로컬 타일) */
  x: number
  z: number
}

/** 몇 타일마다 한 그루. 원작 개별 나무가 폭 2.06타일이라 그것이 원작 밀도다 */
export const TREE_STRIDE = 2

/**
 * 나무를 세울 자리들.
 *
 * ⚠️ **격자가 아니라 원작 그림자 판이 자리를 정한다.** 원작은 나무 밑에 동그란
 * 판(`tshadow`)을 깔아 두었고 그것이 곧 그 나무가 서 있던 자리다. 두 칸 격자로만
 * 세우면 판 2,525장 중 271장이 **홀수 타일에서 시작**해서, 홀로 선 나무의
 * 15.4%가 제 동그라미에서 한 타일 벗어난다.
 *
 * 그래서 순서가 둘이다:
 *  ① 홀로 선 나무의 판(2×2)마다 그 한가운데에 한 그루. 판이 덮은 칸 넷은
 *     **가져간 것으로 표시**해서 격자가 같은 자리에 또 세우지 않게 한다
 *  ② 판이 없는 자리는 두 칸 격자. 숲 벽은 판이 4×4·8×8로 뭉쳐 있어서 한 그루를
 *     집어낼 수가 없고, 격자 간격이 곧 원작 나무 폭(2.06타일)이다
 */
export function treeSites(split: Split): TreeSite[] {
  const out: TreeSite[] = []
  const taken = new Set<number>()
  for (const q of split.shadows) {
    const qx = cellX(q), qz = cellZ(q)
    let key = -1
    let minY = Infinity, maxY = -Infinity, group = -1
    for (let dz = 0; dz < 2; dz++) {
      for (let dx = 0; dx < 2; dx++) {
        const k = cellKey(qx + dx, qz + dz)
        const cell = split.cells.get(k)
        if (!cell) continue
        // 판이 덮은 잎 칸을 다 합쳐야 크기가 그 자리 판 더미를 그대로 따른다
        if (key < 0) { key = k; group = cell.group }
        minY = Math.min(minY, cell.minY)
        maxY = Math.max(maxY, cell.maxY)
      }
    }
    if (key < 0) continue
    for (let dz = 0; dz < 2; dz++) {
      for (let dx = 0; dx < 2; dx++) taken.add(cellKey(qx + dx, qz + dz))
    }
    out.push({ key, cell: { minY, maxY, group }, x: qx + 1, z: qz + 1 })
  }
  for (const [key, cell] of split.cells) {
    if (taken.has(key)) continue
    const tx = cellX(key), tz = cellZ(key)
    if (((tx % TREE_STRIDE) + TREE_STRIDE) % TREE_STRIDE !== 0) continue
    if (((tz % TREE_STRIDE) + TREE_STRIDE) % TREE_STRIDE !== 0) continue
    out.push({ key, cell, x: tx + TREE_STRIDE / 2, z: tz + TREE_STRIDE / 2 })
  }
  return out
}

/**
 * 쪼갠 결과 보관함.
 *
 * 청크 경계를 넘을 때마다 창 안 25개를 전부 다시 쪼개면 그 순간 끊긴다.
 * 한 청크는 늘 같은 결과를 내므로 한 번만 하면 된다 — 열쇠에 텍스처 묶음이
 * 들어가는 이유는 오려 낸 판인지가 그 묶음의 그림에 달려 있어서다
 */
const splitCache = new Map<string, Split>()

export function cachedSplit(
  key: string, mesh: ChunkMesh, cutout: readonly boolean[], lumps?: LumpSet,
): Split {
  const hit = splitCache.get(key)
  if (hit) return hit
  const made = splitFoliage(mesh, cutout, lumps)
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

/**
 * 화단·꽃밭 그림.
 *
 * 이름은 롬이 붙인 것이다 — `nhana`·`shana`·`rhana`(はな = 꽃)와 연고시티
 * 화단 `t3_fl_*`. 오버월드 청크 176개에서 서브메시 126개가 여기 걸린다
 */
const FLOWER_NAME = /^[nsr]hana$|_fl_[a-z]/

/** 꽃이 깔린 자리. 청크 로컬 타일 좌표와 그 판의 높이 */
export interface FlowerSite {
  x: number
  z: number
  y: number
  /** 색을 가져올 서브메시 */
  group: number
}

/**
 * 바닥에 깔린 꽃 그림의 자리.
 *
 * 원작의 화단은 **바닥 타일 그림**이다. 고정 부감에서는 그것으로 꽃밭처럼
 * 보였지만, 3인칭으로 낮게 보면 잔디 위에 색종이를 뿌려 놓은 것이 된다.
 *
 * ⚠️ **원래 그림은 그대로 둔다.** 걷어내면 화단의 흙까지 사라진다 — 그림은
 * 바닥에 남기고 그 위에 꽃송이를 세운다 (`Flowers`)
 */
export function flowerSites(mesh: ChunkMesh, split: Split): FlowerSite[] {
  const pos = (split.geometry.getAttribute('position') as BufferAttribute).array as Float32Array
  const index = split.geometry.getIndex()
  if (!index) return []
  const idx = index.array
  const out = new Map<number, FlowerSite>()

  for (const [start, count, group] of split.groups) {
    if (count === 0) continue
    if (!FLOWER_NAME.test(mesh.materials[group]?.tex ?? '')) continue
    for (let t = 0; t < count; t += 3) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y = 0
      for (let k = 0; k < 3; k++) {
        const i = idx[start + t + k]!
        const x = pos[i * 3]!, z = pos[i * 3 + 2]!
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (z < z0) z0 = z
        if (z > z1) z1 = z
        y += pos[i * 3 + 1]! / 3
      }
      // 서 있는 판은 화단이 아니다. 바닥에 깔린 것만 본다
      if (x1 - x0 < 1e-6 || z1 - z0 < 1e-6) continue
      for (let tz = Math.floor(z0); tz <= Math.floor(z1 - 0.01); tz++) {
        for (let tx = Math.floor(x0); tx <= Math.floor(x1 - 0.01); tx++) {
          const key = cellKey(tx, tz)
          if (!out.has(key)) out.set(key, { x: tx, z: tz, y, group })
        }
      }
    }
  }
  return [...out.values()]
}

/**
 * 꽃송이 색. 그 그림에서 **잔디가 아닌** 색 셋을 뽑는다.
 *
 * 화단 그림은 절반이 흙과 잔디라, 제일 많이 쓰인 색을 그냥 집으면 갈색이 나온다.
 * 초록과 갈색 계열을 뺀 나머지 중 밝은 순이 곧 꽃잎이다
 */
export function flowerColors(sheet: TexSheet | null, mesh: ChunkMesh, group: number): number[] {
  const spec = mesh.materials[group]
  const item = sheet?.items.find((s) => s.tex === spec?.tex && s.pal === (spec.pal ?? ''))
  if (!sheet || !item) return [0xf2d05a]
  const count = new Map<number, number>()
  for (let y = 0; y < item.h; y++) {
    const row = ((item.y + y) * sheet.width + item.x) * 4
    for (let x = 0; x < item.w; x++) {
      const o = row + x * 4
      if (sheet.pixels[o + 3]! < ALPHA_CUT) continue
      const r = sheet.pixels[o]!, g = sheet.pixels[o + 1]!, b = sheet.pixels[o + 2]!
      // 잔디(초록이 제일 세다)와 흙(붉고 어둡다)은 꽃잎이 아니다
      if (g > r && g > b) continue
      if (r > g && g > b && r < 170) continue
      count.set((r << 16) | (g << 8) | b, (count.get((r << 16) | (g << 8) | b) ?? 0) + 1)
    }
  }
  const ranked = [...count].sort((a, b) => b[1] - a[1]).map(([rgb]) => rgb)
  return ranked.length > 0 ? ranked.slice(0, 3) : [0xf2d05a]
}
