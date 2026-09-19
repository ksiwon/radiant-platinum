// 출렁이는 물 (DATA.md §2.2)
//
// 원작의 물은 **바닥 타일 그림**이다. 도트가 몇 프레임 흐르는 것으로 물결을
// 냈고, 고정 각도로 내려다보니 그것으로 충분했다. 1인칭으로 서면 파란 장판이 된다.
//
// **어디가 물인지는 그림이 아니라 거동값이 말한다.** `0x0015`(넓은 물)와
// `0x0010`(작은 물) 둘을 합쳐야 맞다 — 파도타기가 있는 36개 존 중 35개를 덮는다
// (`map/zone`의 `isWater`). 하나만 쓰면 트윈리프 연못이 빠진다.
//
// 물결은 우리가 만든 것이다. 다만 **색은 원작 그림에서 가져온다** — 아무 파랑이나
// 칠하면 예진호수와 바다가 같은 색이 된다.
//
// 셰이더를 안 쓰고 정점을 CPU에서 민다. WebGPU 노드 재질과 WebGL2 폴백을 따로
// 봐야 하는 것을 피하려는 것이고, 창 하나에 드는 물이 최대 864칸이라 정점이
// 수천 개뿐이라 그래도 된다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshLambertMaterial,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import { isWater } from '../engine/map/zone'
import { markSeeThrough } from './fx/seeThrough'

/**
 * 물결 둘. `[진폭(타일), 파장(타일), 초당 마루 수, 방향]`.
 *
 * 하나면 줄무늬가 되고, 방향이 어긋난 둘을 겹쳐야 물처럼 일렁인다. 진폭이
 * 0.06인 이유는 물 타일 하나가 1타일이라 그보다 크면 계단처럼 각져 보여서다
 */
const WAVES: readonly (readonly [number, number, number, number])[] = [
  [0.055, 5.5, 0.42, 0.0],
  [0.032, 2.9, 0.63, 2.1],
]
/**
 * 물 면을 지면에서 이만큼 띄운다 (타일). 원작 물 그림과 z-파이팅을 피한다.
 *
 * **물결 진폭 합(0.055 + 0.032 = 0.087)보다 커야 한다** — 작으면 골에서 수면이
 * 원래 물 그림 아래로 0.042타일 내려가 그 자리만 지지직거린다
 */
export const LIFT = 0.09

/**
 * 기슭에서 물결이 잦아드는 폭 (타일).
 *
 * ⚠️ **기슭에서도 같은 진폭으로 일렁이면 물이 뭍을 타고 오르내린다.** 골에서는
 * 모래가 드러나고 마루에서는 풀을 덮는다 — 원작 그림의 물가 선과 어긋난다.
 * 경계에서 0, 이만큼 떨어지면 1이 되게 부드럽게 올린다 (FIRST_PERSON §8.2)
 */
const SHORE_WIDTH = 1

/** 기슭 감쇠의 기울기를 중앙차분으로 잴 때 쓰는 간격 (타일) */
const SHORE_EPS = 0.125

/**
 * 같은 수면인가를 가르는 높이 눈금 (타일).
 *
 * 원본 높이판이 1/256타일 고정소수라 그 눈금에 맞춘다 — 그보다 잘게 가르면
 * 같은 못이 부동소수 한 톨로 두 겹이 된다
 */
const HEIGHT_STEP = 256

export interface WaterField {
  /** 정점 자리 `[x, 바닥 높이, z]`가 이어진 것 */
  grid: Float32Array
  /** 삼각형 색인 */
  index: Uint32Array
  /**
   * 정점마다 `[기슭 감쇠 a, ∂a/∂x, ∂a/∂z]`.
   *
   * 기울기까지 드는 이유는 법선이다. 높이가 `H = base + a·S`면
   * `dH/dx = (∂a/∂x)·S + a·(∂S/∂x)`이라, 파동 미분에 `a`만 곱하면 **기슭에서
   * 법선이 틀린다** (FIRST_PERSON §8.3)
   */
  shore: Float32Array
  /** 얕은 색 · 깊은 색 */
  colors: readonly [number, number]
}

/**
 * 창 안의 물 면.
 *
 * 타일마다 판을 따로 두지 않고 **모서리를 공유한다** — 안 그러면 이웃한 타일의
 * 물결이 어긋나서 격자 선이 보인다.
 *
 * ⚠️ **모서리 높이는 물 칸에서만 받는다.** 모서리 자리를 그대로
 * `heightAtWorld(x, z)`에 물으면 `Math.floor`가 **남동쪽 한 칸**을 고르므로, 그
 * 칸이 뭍인 기슭에서는 모서리가 뭍 높이를 받는다. 실측(떡잎 연못 108–115 ×
 * 891–895, 물 0.50 · 남쪽 잔디 0.00): 정점 54개 중 9개가 0.50타일 꺼져서 수면이
 * 못 바닥 아래로 내려갔고, 바닥이 물 위로 풀빛 삼각형으로 비어져 나왔다.
 * 무쇠시티 44:750은 582개 중 42개(최대 1.00타일).
 */
export function waterField(
  grid: MapGrid, chunkIndex: number, radius: number,
): { grid: Float32Array; index: Uint32Array; shore: Float32Array } {
  const n = grid.chunkTiles
  /** `수면 높이|모서리` → 정점 번호 */
  const at = new Map<string, number>()
  const pos: number[] = []
  const shore: number[] = []
  const index: number[] = []

  /**
   * 그 칸의 **제 수면 높이**. 물이 아니면 null.
   *
   * ⚠️ **모서리가 아니라 칸 한가운데에 묻는다.** 모서리를 그대로
   * `heightAtWorld(x, z)`에 물으면 `Math.floor`가 **남동쪽 한 칸**을 고르므로,
   * 그 칸이 뭍인 기슭에서는 뭍 높이가 들어온다
   */
  const surfaceAt = (x: number, z: number): number | null => {
    if (!isWater(grid.behavior(x, z))) return null
    const h = grid.heightAtWorld(x + 0.5, z + 0.5)
    return h === null ? null : Math.round(h * HEIGHT_STEP) / HEIGHT_STEP
  }

  /**
   * 이 점에서 **그 수면의 물가**까지의 거리 (타일).
   *
   * 물가는 「물 칸과 물 아닌 칸」 사이의 변이고, **높이가 다른 물도 물가로 친다** —
   * 폭포 위아래를 한 면으로 이으면 안 되므로 서로에게 끝이다.
   *
   * 둘레 두 칸만 본다. `SHORE_WIDTH`가 1이라 그보다 멀면 답이 1로 굳는다
   */
  const shoreDistance = (px: number, pz: number, h: number): number => {
    let best = SHORE_WIDTH + 1
    const cx = Math.floor(px), cz = Math.floor(pz)
    for (let z = cz - 2; z <= cz + 2; z++) {
      for (let x = cx - 2; x <= cx + 2; x++) {
        if (surfaceAt(x, z) !== h) continue
        // 이 물 칸의 네 변 중 **바깥과 맞닿은** 것까지의 거리.
        // 변은 길이 1짜리 선분이고 축에 나란하다 — 한 축은 못 박고 다른 축은
        // 칸 안으로 끼워 넣은 뒤 두 점 거리를 잰다
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (surfaceAt(x + dx, z + dz) === h) continue
          let d: number
          if (dx !== 0) {
            const line = x + (dx > 0 ? 1 : 0)
            d = Math.hypot(px - line, pz - Math.min(z + 1, Math.max(z, pz)))
          } else {
            const line = z + (dz > 0 ? 1 : 0)
            d = Math.hypot(px - Math.min(x + 1, Math.max(x, px)), pz - line)
          }
          if (d < best) best = d
        }
      }
    }
    return best
  }

  /** 0에서 1로 부드럽게 오른다 */
  const smoothstep = (v: number): number => {
    const k = Math.min(1, Math.max(0, v))
    return k * k * (3 - 2 * k)
  }

  /**
   * 그 점이 **이 수면 안쪽**인가.
   *
   * ⚠️ **거리에는 부호가 없다.** 안팎을 안 가르면 물가 바깥 0.125타일도 안쪽
   * 0.125타일과 같은 답을 내서, 중앙차분이 서로 지워지고 **기슭에서 기울기가
   * 0이 된다** — 그러면 `∂a/∂x` 항을 들고 다닐 이유가 없어진다
   */
  const insideAt = (px: number, pz: number, h: number): boolean =>
    surfaceAt(Math.floor(px), Math.floor(pz)) === h

  const ampAt = (px: number, pz: number, h: number): number =>
    (insideAt(px, pz, h) ? smoothstep(shoreDistance(px, pz, h) / SHORE_WIDTH) : 0)

  /**
   * 감쇠의 기울기 `[∂a/∂x, ∂a/∂z]`.
   *
   * ⚠️ **가로세로 두 점만 보면 안 된다.** 물이 대각선으로만 닿은 모서리에서는
   * ±x도 ±z도 둘 다 뭍이라 차분이 0으로 죽는다 — 그 자리만 법선이 평평해진다.
   * 여덟 점(소벨)으로 보면 대각선 물도 잡힌다
   */
  const slopeAt = (x: number, z: number, h: number): [number, number] => {
    const e = SHORE_EPS
    const n = ampAt(x, z - e, h), sth = ampAt(x, z + e, h)
    const w = ampAt(x - e, z, h), ea = ampAt(x + e, z, h)
    const nw = ampAt(x - e, z - e, h), ne = ampAt(x + e, z - e, h)
    const sw = ampAt(x - e, z + e, h), se = ampAt(x + e, z + e, h)
    return [
      ((ne + 2 * ea + se) - (nw + 2 * w + sw)) / (8 * e),
      ((sw + 2 * sth + se) - (nw + 2 * n + ne)) / (8 * e),
    ]
  }

  /**
   * 모서리 하나. **수면 높이를 열쇠에 넣는다.**
   *
   * ⚠️ **`x*4096+z`만으로는 높이가 다른 물이 한 정점을 나눠 쓴다.** 실측으로
   * 오버월드 모서리 32,205개 중 **445개**가 높이가 다른 물 칸에 걸쳐 있고, 제일
   * 심한 데는 2.0과 0.5가 만난다(910,480) — 예전에는 그중 **낮은 쪽**을 골랐으므로
   * 높은 못의 가장자리가 1.5타일을 주저앉아 비스듬한 판이 됐다
   */
  const corner = (x: number, z: number, h: number): number => {
    const key = `${String(h)}|${String(x)},${String(z)}`
    let got = at.get(key)
    if (got === undefined) {
      got = pos.length / 3
      at.set(key, got)
      pos.push(x, h, z)
      // 감쇠와 그 기울기. 기울기는 같은 함수를 중앙차분한다 —
      // 감쇠를 곱하기만 하고 기울기를 안 고치면 기슭에서 빛이 딴 데를 본다
      const a = ampAt(x, z, h)
      shore.push(a, ...slopeAt(x, z, h))
    }
    return got
  }

  for (const c of grid.chunksAround(chunkIndex, radius)) {
    for (let z = c.my * n; z < (c.my + 1) * n; z++) {
      for (let x = c.mx * n; x < (c.mx + 1) * n; x++) {
        const h = surfaceAt(x, z)
        if (h === null) continue
        const a = corner(x, z, h), b = corner(x + 1, z, h)
        const d = corner(x, z + 1, h), e = corner(x + 1, z + 1, h)
        index.push(a, d, b, b, d, e)
      }
    }
  }
  return {
    grid: new Float32Array(pos),
    index: new Uint32Array(index),
    shore: new Float32Array(shore),
  }
}

/**
 * 한 자리의 물결 높이와 기울기.
 *
 * 법선을 다시 세는 대신 **물결의 미분에서 바로 뽑는다** — 정점이 수천 개라
 * `computeVertexNormals`를 프레임마다 돌리면 그것이 제일 비싸다
 */
export function waveAt(x: number, z: number, t: number): [number, number, number] {
  let y = 0, dx = 0, dz = 0
  for (const [amp, len, speed, dir] of WAVES) {
    const kx = Math.cos(dir) * ((Math.PI * 2) / len)
    const kz = Math.sin(dir) * ((Math.PI * 2) / len)
    const p = kx * x + kz * z + t * speed * Math.PI * 2
    y += Math.sin(p) * amp
    dx += Math.cos(p) * amp * kx
    dz += Math.cos(p) * amp * kz
  }
  return [y, dx, dz]
}

const material = new MeshLambertMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.82,
  side: DoubleSide,
  depthWrite: false,
})
// 깊이를 안 쓰므로 윤곽이 **물 밑 지형의 실루엣**을 물 위에 그린다 (`fx/seeThrough`)
markSeeThrough(material, true)

export function Water({ field }: { field: WaterField | null }) {
  const mesh = useRef<Mesh>(null)

  const geometry = useMemo(() => {
    if (!field || field.index.length === 0) return null
    const count = field.grid.length / 3
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(field.grid), 3))
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3))
    // 깊이는 안 재고 **물결의 골과 마루로** 색을 나눈다. 마루가 하늘을 받아
    // 밝고 골이 어둡다 — 그것만으로도 평면이 아니라는 것이 읽힌다
    const color = new Float32Array(count * 3)
    geo.setAttribute('color', new BufferAttribute(color, 3))
    geo.setIndex(new BufferAttribute(field.index, 1))
    geo.computeBoundingSphere()
    return geo
  }, [field])

  useEffect(() => () => { geometry?.dispose() }, [geometry])

  useFrame(({ clock }) => {
    const geo = geometry
    if (!geo || !field) return
    const t = clock.elapsedTime
    const pos = geo.getAttribute('position') as BufferAttribute
    const nrm = geo.getAttribute('normal') as BufferAttribute
    const col = geo.getAttribute('color') as BufferAttribute
    const shallow = new Color(field.colors[0]), deep = new Color(field.colors[1])
    const base = field.grid
    const shore = field.shore
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]!, z = base[i * 3 + 2]!
      const [s, sdx, sdz] = waveAt(x, z, t)
      // 기슭에서는 잦아든다. 물가 선에서 a가 0이라 수면이 원작 물가에 밀착한다
      const a = shore[i * 3] ?? 1
      const adx = shore[i * 3 + 1] ?? 0, adz = shore[i * 3 + 2] ?? 0
      const y = a * s
      pos.setY(i, base[i * 3 + 1]! + LIFT + y)
      // ⚠️ **파동 미분에 `a`만 곱하면 안 된다.** 실제 높이는 `H = base + a·S`라
      // `dH/dx = (∂a/∂x)·S + a·(∂S/∂x)`다 — 앞 항을 빼면 기슭에서 빛이 물결과
      // 따로 논다 (FIRST_PERSON §8.3)
      nrm.setXYZ(i, -(adx * s + a * sdx), 1, -(adz * s + a * sdz))
      // 마루가 밝고 골이 어둡다
      const k = Math.min(1, Math.max(0, y / 0.09 + 0.5))
      col.setXYZ(i,
        deep.r + (shallow.r - deep.r) * k,
        deep.g + (shallow.g - deep.g) * k,
        deep.b + (shallow.b - deep.b) * k)
    }
    pos.needsUpdate = true
    nrm.needsUpdate = true
    col.needsUpdate = true
  })

  if (!geometry) return null
  return <mesh ref={mesh} geometry={geometry} material={material} receiveShadow />
}
