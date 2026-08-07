// 입체 나무 (DATA.md §2.2)
//
// 원작에는 나무의 3D 모양이 **없다.** 판때기 한 장과 그 위에 그린 그림뿐이다.
// 그래서 여기서 세우는 형태는 우리가 만든 것이다 — 숨기지 않고 적어 둔다.
//
// 대신 **자리와 크기와 색은 전부 원작에서 온다.** 서는 자리는 잎이 덮고 있던
// 칸이고, 꼭대기는 그 칸을 덮은 잎의 꼭대기이고, 색은 그 그림에서 실제로 제일
// 많이 쓰인 색이다(`plateColors`). 그래서 떡잎마을의 연둣빛과 무쇠탄갱의
// 검푸른 잎이 서로 다르게 남고, 나무가 가리던 것을 그대로 가린다.
//
// 그림이 같은 나무는 청크를 넘어 한 인스턴스 메시로 모은다 — 창 안에 3천 그루가
// 서므로 그루마다 그리면 안 된다.
//
// **좌표계는 밑동이 원점이고 단위는 나무 반지름 배수다.** 잎 한가운데를 원점으로
// 두면 줄기 길이가 타일 단위라 반지름에 따라 나무가 제 줄기에서 떠오르거나
// 파묻힌다. 밑동을 잡으면 나무 전체가 한 덩어리로 자란다.
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute, BufferGeometry, Color, Frustum, IcosahedronGeometry,
  InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Sphere, Vector3,
} from 'three'
import { worldState } from '../state/worldState'
import { cellX, cellZ, type Cell } from './plates'

/** 잎 덩이의 세로 눌림. 1이면 완전한 공이라 버섯처럼 보인다 */
const CROWN_SQUASH = 0.8
/**
 * 잎 덩이 셋. 공 하나면 어느 각도에서 봐도 공이라 겹쳐 놓는다.
 * `[x, y, z, 반지름]`이고 y는 잎 무리 원점 기준이다
 */
const BLOBS: readonly (readonly [number, number, number, number])[] = [
  [0, 0.05, 0, 0.95],
  [0.40, 0.34, -0.16, 0.58],
  [-0.34, 0.20, 0.30, 0.52],
]
/**
 * 덩이마다 세분. 0이면 20면이라 각지고 1이면 80면이다.
 *
 * 1인칭으로 나무 밑까지 걸어가므로 큰 덩이는 1을 쓴다 — 0은 코앞에서 주사위로
 * 보인다. 곁덩이는 반지름이 절반이라 화면에서 차지하는 넓이가 1/4이고, 큰 덩이에
 * 반쯤 파묻혀 있어서 0으로 둬도 티가 안 난다
 */
const BLOB_DETAIL = [1, 0, 0]
/** 잎 덩이를 울퉁불퉁하게 미는 정도(반지름 배수). 0이면 매끈한 공이다 */
const LUMP = 0.16
/**
 * 잎 무리의 세로 높이 · 위로 뻗는 높이 (나무 반지름 배수). `BLOBS`에서 나온 값이다.
 *
 * 아래로 −0.95×0.8+0.05 = −0.71, 위로 0.95×0.8+0.05 = 0.81 → 1.52.
 * 가로는 −0.95 ~ +0.98 → 1.93. 원작 나무 한 그루가 폭 2.06타일이므로
 * 반지름 1.07이 원작 크기다 — 그래서 `RADIUS`가 그 언저리다
 */
const CROWN_H = 1.52
const CROWN_TOP = 0.81

/**
 * 잎 아래끝까지의 줄기 길이 (나무 반지름 배수).
 *
 * **이것 때문에 나무가 원작보다 높아진다.** 원작 판은 35° 누워 있어서 세로로
 * 1.08타일밖에 안 차지하는데, 잎 무리만 해도 1.4타일이라 줄기 자리가 안 남는다.
 * 판을 그대로 세운 그림(잎 밑에 줄기가 그려져 있다)이 곧 원작이 의도한 모습이라
 * 그쪽을 따른다.
 *
 * 값은 3인칭 카메라가 정한다. 카메라가 플레이어 뒤 8·위 4라 26.6°로 내려다보는데,
 * 잎이 제 밑을 0.86r까지 가린다(잎 겉면 어느 점에서든 `y − 0.5·가로거리`의
 * 최솟값이다. `plates.test`가 실제 지오메트리로 잰다). 1.0이면 그 위로 조금
 * 남고, 그보다 짧으면 잎에 통째로 먹힌다
 */
export const BARE = 1.0
/** 잎 무리 원점. 아래끝이 딱 `BARE`에 오도록 올린다 */
const CROWN_Y = BARE + (CROWN_H - CROWN_TOP)
/** 나무 꼭대기 (반지름 배수). 시험이 원작 판 더미 높이와 견주는 값이다 */
export const TREE_TOP = BARE + CROWN_H

/**
 * 줄기 마디 `[높이, 반지름, 휜 만큼]`. 전부 나무 반지름 배수고 y=0이 땅이다.
 *
 * 뿌리목을 굵게 두는 것이 땅에 박힌 느낌을 만든다 — 위아래가 같은 굵기면
 * 파이프가 꽂힌 것으로 보인다. 마지막 마디는 잎 속으로 들어가 잎과 줄기 사이가
 * 뚫리지 않게 한다. 조금씩 휘어 두는 것은 그루마다 Y축으로 아무렇게나 돌려
 * 세우기 때문이다 — 곧은 기둥이면 돌려도 다 같아 보인다
 */
export const TRUNK: readonly (readonly [number, number, number])[] = [
  [0.00, 0.260, 0.000],
  [0.17, 0.165, 0.015],
  [0.62, 0.135, 0.050],
  [1.55, 0.100, 0.110],
]
/** 줄기 단면의 각. 6이면 마디 사이마다 12삼각형, 줄기 하나가 36이다 */
const TRUNK_SIDES = 6
/** 밑동이 어두워지는 정도. 땅에 닿는 자리는 그늘이라 여기서 색이 앉는다 */
const TRUNK_SHADE = 0.62

/** 몇 타일마다 한 그루. 원작 개별 나무가 폭 2.06타일이라 그것이 원작 밀도다 */
const STRIDE = 2
/**
 * 나무 반지름(타일). 흩어 놓지 않으면 윗선이 자로 그은 듯 평평해진다.
 *
 * 아래끝 0.95가 폭 1.83타일 — 원작 나무 한 그루의 2.06타일 언저리다. 위끝 1.4는
 * 폭 2.7타일이라 두 칸 간격에서 이웃과 크게 겹쳐 숲 벽이 통짜로 닫힌다
 */
export const RADIUS_MIN = 0.95
const RADIUS_MAX = 1.40
/** 그루마다 흔드는 폭 */
const RADIUS_JITTER = 0.12

/**
 * 키를 반지름과 **따로** 흔드는 폭.
 *
 * ⚠️ **이게 없으면 숲이 카펫이 된다.** 크기를 균등 배율 하나로만 주면 짙은 숲에서
 * `want`가 다 같아서(판이 넉 장 쌓인 칸이 이어진다) 반지름 흔들림 ±0.12 안에서만
 * 갈리고, 우듬지가 한 높이에 늘어선다. 위에서 내려다보면 나무 하나하나가 아니라
 * 초록 덩어리 한 장으로 읽힌다 — 실제로 그렇게 찍혔다.
 *
 * ±22%면 두 칸 간격에서 이웃과 확실히 어긋나면서도, 원작 판 더미가 정한
 * 큰 크기 차이(숲 벽 대 길가 나무)는 안 지운다
 */
const HEIGHT_JITTER = 0.22
/**
 * 칸 한가운데에서 흩는 폭(타일).
 *
 * 0.5로 두면 줄기가 두 칸 격자에 맞춰 줄지어 서서 조림지처럼 보인다. 칸이
 * 두 타일이라 0.9까지는 제 칸을 안 벗어난다
 */
const SPREAD = 0.9

/**
 * 3인칭에서 카메라가 이만큼 가까운 나무는 지운다 (타일).
 *
 * 3인칭 카메라는 플레이어 뒤 8타일·위 4타일에 있다(`actor/camera`의 `THIRD`).
 * 숲 옆에 서면 그 사이의 나무가 화면을 통째로 덮는다. 5.5타일은 플레이어까지의
 * 거리 8.9보다 한참 짧아서, 지워도 플레이어와 그 둘레는 그대로 남는다.
 *
 * 1인칭은 눈이 곧 플레이어라 지우면 코앞의 나무가 사라진다 — 안 건다
 */
const HIDE_RADIUS = 5.5
/** 이 구간에서 크기가 0으로 줄어든다. 갑자기 없어지면 깜빡임으로 보인다 */
const HIDE_FADE = 2.0

/**
 * 카메라 거리로 정하는 그루당 배율. 0이면 삼각형이 찌부러져 안 보인다.
 *
 * 거리만으로 정하므로 시간을 안 탄다 — 카메라가 멈추면 그림도 멈춘다
 */
export function nearScale(distance: number, active: boolean): number {
  if (!active) return 1
  return Math.min(1, Math.max(0, (distance - HIDE_RADIUS) / HIDE_FADE))
}

export interface FoliageGroup {
  /** 같은 그림을 쓰는 나무를 한 덩어리로 묶는 열쇠 */
  key: string
  leaf: number[]
  trunk: number
  /** [칸 열쇠, 칸, 청크 원점 x, 청크 원점 z] */
  items: [number, Cell, number, number][]
}

/**
 * 자리에서 뽑는 난수.
 *
 * 프레임마다 흔들리면 안 되고 청크를 다시 세울 때도 같아야 한다. 그래서
 * `Math.random`이 아니라 좌표를 섞는다 — 같은 나무는 늘 같은 모습으로 선다
 */
function hash(x: number, z: number, salt: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * 공을 울퉁불퉁하게 만든다.
 *
 * 매끈한 구는 어느 각도에서 봐도 그냥 초록 공이다 — 잎 뭉치로 안 읽힌다.
 * 정점을 제자리에서 안팎으로 밀어 덩어리진 윤곽을 만든다. **삼각형이 하나도
 * 안 는다** — 세분을 올리는 것과 값이 다르다.
 *
 * 같은 자리는 늘 같은 값이라 나무가 흔들리지 않고, 그루마다 다르게 돌려
 * 세우므로 같은 지오메트리라도 서로 달라 보인다
 */
function lumpy(geo: BufferGeometry, r: number): void {
  const pos = geo.getAttribute('position') as BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    // 세 방향의 결을 겹쳐 한 방향으로 쏠리지 않게 한다
    const wave = Math.sin(x * 4.1 + y * 2.7) + Math.sin(y * 3.3 + z * 4.9)
      + Math.sin(z * 3.7 + x * 2.3)
    const k = 1 + wave * LUMP / 3
    pos.setXYZ(i, x * k, y * k, z * k)
  }
  // 밀고 나면 원래 반지름보다 커지거나 작아진다. 폭이 원작 판 너비에서
  // 벗어나지 않게 되돌린다
  geo.computeBoundingSphere()
  const grew = (geo.boundingSphere?.radius ?? r) / r
  if (grew > 0) geo.scale(1 / grew, 1 / grew, 1 / grew)
}

/** 조각 하나를 한 색으로 칠한다. 정점 색이 색을 나르므로 재질은 한 벌이면 된다 */
export function paint(geo: BufferGeometry, rgb: number): BufferGeometry {
  const c = new Color(rgb)
  const n = geo.getAttribute('position').count
  const color = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new BufferAttribute(color, 3))
  return geo
}

/**
 * 조각들을 한 지오메트리로 합친다.
 *
 * ⚠️ **색인을 먼저 푼다.** 이걸 안 하면 색인이 있는 조각의 삼각형이 통째로
 * 사라진다. `CylinderGeometry`가 그랬다 — 정점 12개에 색인 30개(삼각형 10개)인데
 * 색인을 버리고 정점만 이어 붙이면 연속 3개씩 묶여 **수평 조각 4개**가 되고,
 * 그 넷은 잎 속과 땅속에 하나씩 묻혀 화면에 줄기가 아예 안 나왔다.
 *
 * 법선은 합친 뒤 다시 센다. 색인이 없으므로 면 법선이 되어 각지게 남는데,
 * 지형이 16×16 도트라 매끈한 덩이가 그 옆에서 겉돈다. `lumpy`가 정점을 민 뒤라
 * 원래 법선은 어차피 못 쓴다
 */
export function merge(parts: readonly BufferGeometry[]): BufferGeometry {
  const flat = parts.map((p) => (p.getIndex() ? p.toNonIndexed() : p))
  let verts = 0
  for (const p of flat) verts += p.getAttribute('position').count
  const position = new Float32Array(verts * 3)
  const color = new Float32Array(verts * 3)
  let at = 0
  for (const p of flat) {
    const pos = p.getAttribute('position') as BufferAttribute
    const col = p.getAttribute('color') as BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      position[(at + i) * 3] = pos.getX(i)
      position[(at + i) * 3 + 1] = pos.getY(i)
      position[(at + i) * 3 + 2] = pos.getZ(i)
      color[(at + i) * 3] = col.getX(i)
      color[(at + i) * 3 + 1] = col.getY(i)
      color[(at + i) * 3 + 2] = col.getZ(i)
    }
    at += pos.count
    p.dispose()
  }
  const out = new BufferGeometry()
  out.setAttribute('position', new BufferAttribute(position, 3))
  out.setAttribute('color', new BufferAttribute(color, 3))
  out.computeVertexNormals()
  out.computeBoundingSphere()
  return out
}

/**
 * 줄기. 마디마다 다각형 고리를 놓고 사이를 잇는다.
 *
 * 색인 없이 삼각형을 바로 쌓는다 — 조각을 합칠 때 색인을 잃을 여지를 안 만든다
 */
function trunkGeometry(rgb: number, far = false): BufferGeometry {
  const sides = far ? 3 : TRUNK_SIDES
  const rungs = far ? [TRUNK[0]!, TRUNK[TRUNK.length - 1]!] : TRUNK
  const base = new Color(rgb)
  const top = TRUNK[TRUNK.length - 1]![0]
  const shade = (h: number): Color =>
    new Color().copy(base).multiplyScalar(TRUNK_SHADE + (1 - TRUNK_SHADE) * Math.min(1, h / top))
  const ring = (m: readonly [number, number, number], k: number): [number, number, number] => {
    const a = (k / sides) * Math.PI * 2
    return [m[2] + Math.cos(a) * m[1], m[0], Math.sin(a) * m[1]]
  }

  const position: number[] = []
  const color: number[] = []
  for (let s = 0; s + 1 < rungs.length; s++) {
    const lo = rungs[s]!, hi = rungs[s + 1]!
    const cLo = shade(lo[0]), cHi = shade(hi[0])
    for (let k = 0; k < sides; k++) {
      const a0 = ring(lo, k), a1 = ring(lo, k + 1)
      const b0 = ring(hi, k), b1 = ring(hi, k + 1)
      // 밖에서 봤을 때 반시계로 감는다. 뒤집으면 재질이 앞면만 그려서 통째로 사라진다
      const tri: [[number, number, number], Color][] = [
        [a0, cLo], [b0, cHi], [b1, cHi],
        [a0, cLo], [b1, cHi], [a1, cLo],
      ]
      for (const [p, c] of tri) {
        position.push(p[0], p[1], p[2])
        color.push(c.r, c.g, c.b)
      }
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(color), 3))
  return geo
}

/**
 * 한 그루의 모양. 가까운 것은 삼각형 156개(줄기 36 + 잎 120), 먼 것은 66개다.
 *
 * ⚠️ **먼 것도 잎 덩이 셋을 그대로 둔다.** 큰 덩이 하나로 줄이면 삼각형은 26개가
 * 되지만 **실루엣이 바뀐다** — 30타일이면 나무 하나가 화면에서 180픽셀이라
 * 윤곽이 달라지는 것이 보인다. 줄이는 것은 세분(80면→20면)과 줄기 단면(6각→3각)
 * 쪽이다. 그건 그 거리에서 안 읽힌다.
 *
 * 짙은 숲이 창 하나에 4,628그루까지 서는데(떡잎마을 일대 실측) 그루당 156이면
 * 72만이다. 다만 **줄이는 것의 대부분은 LOD가 아니라 프러스텀 컬링**이다 —
 * 카메라가 한 방향만 보므로 실제로 화면에 드는 것은 15~30%다
 */
export function treeGeometry(leaf: number[], trunk: number, far = false): BufferGeometry {
  const parts: BufferGeometry[] = [trunkGeometry(trunk, far)]
  BLOBS.forEach(([x, y, z, r], i) => {
    const geo = new IcosahedronGeometry(r, far ? 0 : (BLOB_DETAIL[i] ?? 0))
    lumpy(geo, r)
    geo.scale(1, CROWN_SQUASH, 1)
    geo.translate(x, CROWN_Y + y, z)
    parts.push(paint(geo, leaf[i % leaf.length] ?? leaf[0] ?? 0x4f9e52))
  })
  return merge(parts)
}

/**
 * 지면 높이를 묻는다. 판이 없으면 null.
 *
 * `near`는 잎 아래끝이다 — 다리 위·절벽 위처럼 한 자리를 판이 여럿 덮을 때
 * **잎에 제일 가까운 판**이 그 나무가 자란 땅이다. 플레이어가 층을 가르는 규칙과
 * 같은 것을 쓴다 (`map/height`)
 */
export type GroundAt = (x: number, z: number, near: number) => number | null

/**
 * 칸 하나에 나무를 세울 자리. 자리는 **밑동**이다.
 *
 * `STRIDE` 간격의 칸만 대표로 세운다. 이러면 원작 판이 몇 겹이든, 눕든 서든,
 * **덮은 넓이에 비례해** 나무가 선다 — 숲 벽 한 자리에 판이 넉 장 겹쳐 있어서
 * 판마다 세우면 브로콜리가 된다
 *
 * ⚠️ **밑동 높이는 잎이 아니라 땅이 정한다.** 잎 아래끝(`cell.minY`)에 세우면
 * 나무가 뜬다 — 원작 판은 나무를 *위에서 본 그림*이라 땅보다 위에 걸려 있다.
 * 오버월드 48,525그루를 재 보면 **48,331그루가 땅 위에 떠 있고**(0.1타일 넘게
 * 8,890 · 0.5타일 넘게 671 · 2타일 넘게 265) 191그루는 땅에 파묻혀 있다.
 *
 * 뜬 만큼은 그림자가 어긋난 거리이기도 하다. 태양이 (24, 42, 18)이라 수평 30 ·
 * 수직 42고, 그림자는 뜬 높이의 30/42 = 0.71배만큼 옆으로 밀린다 — 2타일 뜬
 * 나무는 그림자가 1.4타일 떨어진 데 진다.
 */
export function treeAt(key: number, cell: Cell, ground?: GroundAt): Matrix4 | null {
  const tx = cellX(key), tz = cellZ(key)
  if (((tx % STRIDE) + STRIDE) % STRIDE !== 0) return null
  if (((tz % STRIDE) + STRIDE) % STRIDE !== 0) return null

  // **크기를 원작 판 더미의 높이가 정한다.** 숲 벽은 판이 넉 장 쌓여 2.6타일을
  // 채우고 홀로 선 나무는 한 장에 1.1타일이다. 그 차이를 반지름으로 옮기면
  // 숲은 크게 자라 서로 닿아 벽이 되고 길가 나무는 작게 남는다
  const want = (cell.maxY - cell.minY) / CROWN_H
  const jitter = (hash(tx, tz, 9) - 0.5) * 2 * RADIUS_JITTER
  const r = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, want)) + jitter
  // 키는 따로 흔든다. 균등 배율만 주면 우듬지가 한 높이에 늘어서 카펫이 된다
  const h = r * (1 + (hash(tx, tz, 11) - 0.5) * 2 * HEIGHT_JITTER)
  const x = tx + STRIDE / 2 + (hash(tx, tz, 7) - 0.5) * SPREAD * 2
  const z = tz + STRIDE / 2 + (hash(tx, tz, 8) - 0.5) * SPREAD * 2
  // 높이 자료가 없는 칸이 6%다(48,525 중 2,970). 그때만 잎 아래끝으로 물러선다
  const foot = ground?.(x, z, cell.minY) ?? cell.minY
  return new Matrix4().compose(
    new Vector3(x, foot, z),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), hash(tx, tz, 10) * Math.PI * 2),
    new Vector3(r, h, r),
  )
}

/**
 * 이 거리부터 값싼 모양으로 바꾼다 (타일).
 *
 * 30타일이면 나무 하나가 화면에서 180픽셀쯤이다. 그 크기에서 잎 덩이의 세분
 * (80면과 20면)과 줄기 단면(6각과 3각)은 구별이 안 된다 — 실루엣만 지키면 된다.
 * 그보다 가까우면 1인칭으로 밑동까지 걸어가므로 온전한 모양이 필요하다
 */
const LOD_DISTANCE = 30
/** 나무를 감싸는 공의 반지름 (반지름 배수). 프러스텀 판정에 쓴다 */
const TREE_SPHERE = 1.35
/**
 * 화면 밖이어도 이만큼은 남긴다 (타일).
 *
 * **그림자 때문이다.** 화면 밖 나무도 그림자는 화면 안에 질 수 있다. 태양이
 * (24, 42, 18)이라 수평 30·수직 42 — 고도 54.5°다. 나무가 제일 클 때 3.8타일
 * (`TREE_TOP` × `RADIUS_MAX`)이므로 그림자는 3.8/tan54.5° = 2.7타일 뻗는다.
 * 4타일이면 그 위로 남는다
 */
export const CULL_MARGIN = 4

/** 그림이 같으면 모양도 같다. 청크를 넘을 때마다 다시 만들 이유가 없다 */
const shapes = new Map<string, BufferGeometry>()
/** 색은 지오메트리의 정점 색이 나르므로 재질은 한 벌이면 된다 */
const leafMaterial = new MeshLambertMaterial({ vertexColors: true })

const offset = new Matrix4()
const scaled = new Matrix4()
const shrink = new Vector3()
const viewProj = new Matrix4()
const frustum = new Frustum()
const sphere = new Sphere()

function shapeOf(key: string, leaf: number[], trunk: number, far: boolean): BufferGeometry {
  const id = far ? `${key}/far` : key
  let geo = shapes.get(id)
  if (!geo) {
    geo = treeGeometry(leaf, trunk, far)
    shapes.set(id, geo)
  }
  return geo
}

export function Foliage({ groups, ground }: { groups: FoliageGroup[]; ground?: GroundAt }) {
  const camera = useThree((s) => s.camera)

  const meshes = useMemo(() => groups.map((g) => {
    const matrices: Matrix4[] = []
    for (const [key, cell, originX, originZ] of g.items) {
      // 지면은 **월드 좌표로** 묻는다. 흩어 놓은 자리가 청크 경계를 넘을 수 있고,
      // 그때는 옆 청크의 판이 답이다
      const m = treeAt(key, cell, ground
        ? (x, z, near) => ground(x + originX, z + originZ, near)
        : undefined)
      if (!m) continue
      // 판 좌표가 청크 로컬이라 청크가 놓인 자리를 더해야 월드가 된다.
      // 높이는 청크가 이미 갖고 있어서 안 더한다 — 밑동이 곧 월드 높이다
      matrices.push(m.premultiply(offset.makeTranslation(originX, 0, originZ)))
    }
    // 가까운 것과 먼 것을 **따로 그린다.** 인스턴스 하나가 지오메트리를 바꿔
    // 달 수는 없으므로 메시를 둘 두고 프레임마다 나눠 담는다
    const make = (far: boolean) => {
      const mesh = new InstancedMesh(
        shapeOf(g.key, g.leaf, g.trunk, far), leafMaterial, matrices.length)
      mesh.castShadow = true
      mesh.receiveShadow = true
      // 인스턴스가 청크를 가로질러 흩어져 있어서 메시 단위 절두체가 뜻이 없다 —
      // 대신 그루마다 직접 판정해 **보이는 것만 앞에서부터 채운다**
      mesh.frustumCulled = false
      mesh.count = 0
      return mesh
    }
    // 카메라와의 거리는 **잎**으로 잰다. 화면을 가리는 것이 잎이라 밑동으로 재면
    // 나무가 나보다 키가 큰 만큼 늦게 비켜 준다
    const spots = matrices.map((m) => {
      const p = new Vector3().setFromMatrixPosition(m)
      return p.setY(p.y + CROWN_Y * new Vector3().setFromMatrixScale(m).x)
    })
    const radius = matrices.map((m) => TREE_SPHERE * new Vector3().setFromMatrixScale(m).x)
    return { key: g.key, near: make(false), far: make(true), matrices, spots, radius }
  }), [groups, ground])

  /**
   * 프레임마다 그루를 셋으로 가른다: 화면 밖 · 가까운 것 · 먼 것.
   *
   * 화면 밖은 아예 안 담는다 — `count`를 줄이면 그만큼 GPU에 안 올라간다.
   * 짙은 숲은 창 하나에 4,628그루가 서는데(실측) 카메라가 한 방향만 보므로
   * 대부분이 뒤에 있다.
   *
   * 인스턴스 행렬을 고쳐 쓰는 것이라 백엔드를 안 탄다 — 셰이더로 지우면
   * WebGPU 노드 재질과 WebGL2 폴백을 따로 봐야 한다
   */
  useFrame(() => {
    const active = worldState.camera.mode !== 'first'
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(viewProj)
    for (const g of meshes) {
      let n = 0, f = 0
      for (let i = 0; i < g.spots.length; i++) {
        const spot = g.spots[i]!
        sphere.set(spot, g.radius[i]! + CULL_MARGIN)
        if (!frustum.intersectsSphere(sphere)) continue
        const distance = spot.distanceTo(camera.position)
        const k = nearScale(distance, active)
        if (k <= 0) continue // 코앞이라 지운 것
        // 행렬의 자리값이 곧 밑동이고 `scale`은 자리값을 안 건드린다. 그래서
        // 줄어드는 나무는 저절로 땅에 붙은 채 작아진다
        scaled.copy(g.matrices[i]!)
        if (k < 1) scaled.scale(shrink.setScalar(k))
        if (distance < LOD_DISTANCE) g.near.setMatrixAt(n++, scaled)
        else g.far.setMatrixAt(f++, scaled)
      }
      g.near.count = n
      g.far.count = f
      g.near.instanceMatrix.needsUpdate = true
      g.far.instanceMatrix.needsUpdate = true
    }
  })

  // 창이 옮겨 가면 앞의 인스턴스 메시는 버린다. `<primitive>`는 알아서 안 치워
  // 주므로 두면 청크를 넘을 때마다 GPU 버퍼가 쌓인다. 지오메트리와 재질은
  // 공유하는 것이라 여기서 안 지운다
  useEffect(() => () => {
    for (const g of meshes) { g.near.dispose(); g.far.dispose() }
  }, [meshes])

  return (
    <group>
      {meshes.map(({ key, near, far }) => (
        <group key={key}>
          <primitive object={near} />
          <primitive object={far} />
        </group>
      ))}
    </group>
  )
}
