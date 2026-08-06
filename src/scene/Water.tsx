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
/** 물 면을 지면에서 이만큼 띄운다 (타일). 원작 물 그림과 z-파이팅을 피한다 */
const LIFT = 0.045

export interface WaterField {
  /** 정점 자리 `[x, 바닥 높이, z]`가 이어진 것 */
  grid: Float32Array
  /** 삼각형 색인 */
  index: Uint32Array
  /** 얕은 색 · 깊은 색 */
  colors: readonly [number, number]
}

/**
 * 창 안의 물 면.
 *
 * 타일마다 판을 따로 두지 않고 **모서리를 공유한다** — 안 그러면 이웃한 타일의
 * 물결이 어긋나서 격자 선이 보인다
 */
export function waterField(
  grid: MapGrid, chunkIndex: number, radius: number,
): { grid: Float32Array; index: Uint32Array } {
  const n = grid.chunkTiles
  /** 모서리 좌표 → 정점 번호 */
  const at = new Map<number, number>()
  const pos: number[] = []
  const index: number[] = []
  const corner = (x: number, z: number): number => {
    const key = x * 4096 + z
    let got = at.get(key)
    if (got === undefined) {
      got = pos.length / 3
      at.set(key, got)
      pos.push(x, grid.heightAtWorld(x, z) ?? 0, z)
    }
    return got
  }
  for (const c of grid.chunksAround(chunkIndex, radius)) {
    for (let z = c.my * n; z < (c.my + 1) * n; z++) {
      for (let x = c.mx * n; x < (c.mx + 1) * n; x++) {
        if (!isWater(grid.behavior(x, z))) continue
        const a = corner(x, z), b = corner(x + 1, z)
        const d = corner(x, z + 1), e = corner(x + 1, z + 1)
        index.push(a, d, b, b, d, e)
      }
    }
  }
  return { grid: new Float32Array(pos), index: new Uint32Array(index) }
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
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]!, z = base[i * 3 + 2]!
      const [y, dx, dz] = waveAt(x, z, t)
      pos.setY(i, base[i * 3 + 1]! + LIFT + y)
      // 기울기에서 바로 나온 법선. 길이는 재질이 정규화한다
      nrm.setXYZ(i, -dx, 1, -dz)
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
