// 서 있는 풀숲 (DATA.md §2.2)
//
// 원작의 긴 풀은 **바닥 타일 그림**이다. 고정 각도에서 내려다보니 그것으로 충분했다.
// 1인칭으로 서면 풀밭이 그냥 초록 장판이 된다.
//
// **어디가 풀숲인지는 그림이 아니라 거동값이 말한다.** 타일 거동 `0x0002`는
// 인카운터 표와의 교차검증으로 확정된 값이다(`map/zone`의 `Behavior.TALL_GRASS`) —
// 오탐·누락 0. 텍스처 이름으로 고르면 잔디(`lgreen`)까지 딸려 온다.
//
// ⚠️ 더 긴 풀(`0x0003`)도 함께 세운다. 오버월드에 1,066칸 있고(210번도로 724 ·
// 229번도로 241 · 214번도로 101) 전부 야생이 나오는 칸인데, 여기를 빼 두면
// **아무것도 안 자란 땅에서 야생이 튀어나온다.** 다만 지금은 같은 포기를 쓴다 —
// 원작에서 이 풀은 더 길고, 그 차이는 아직 안 옮겼다.
//
// ⚠️ **대습초원의 풀은 `TALL_GRASS`가 아니다.** 진흙 위의 풀(0xA6 · 0xA7)이고
// 실내 행렬에 3,094칸 있다. 풀숲 판정(`isGrassTile`)만 보고 있어서 대습초원은
// 통째로 바닥 그림 그대로였다 — 3인칭으로 보면 초록 「W」를 뿌려 놓은 장판이다.
// 포기를 세우는 칸은 `isTuftTile`이 정한다(발소리·흔들림보다 넓다).
//
// 포기는 우리가 만든 모양이다. 원작에는 3D 풀이 없다. 대신 색은 원작 그림에서
// 가장 많이 쓰인 초록을 그대로 쓴다.
import { useEffect, useMemo } from 'react'
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedMesh, Matrix4,
  MeshLambertMaterial, Quaternion, Vector3,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import { isTuftTile } from '../engine/battle/encounter'

/** 포기 하나에 잎 몇 장. 넷 아래로 내리면 옆에서 볼 때 성글다 */
const BLADES = 5
/**
 * 한 타일에 몇 포기.
 *
 * 창 하나에 드는 풀숲 칸이 전 오버월드 최대 1,056개라, 셋씩 세워도 삼각형
 * 31,680개다 — 나무 90만 개 옆에서 없는 것과 같다. 성글면 장판이 비쳐 보인다
 */
const TUFTS = 3
/** 잎 길이(타일). 원작 긴 풀이 발목을 덮고 무릎에 안 닿는다 — 키 1.5의 1/3쯤 */
const BLADE_LEN = 0.5
/** 밑동 폭(타일). 끝으로 갈수록 좁아진다 */
const BLADE_WIDE = 0.09
/** 잎이 밖으로 눕는 정도. 0이면 전부 곧게 서서 솔처럼 보인다 */
const BLADE_LEAN = 0.32

export interface GrassField {
  /** 포기 자리 `[x, y, z]`가 셋씩 이어진다 */
  spots: Float32Array
  /** 밑동 색과 끝 색 */
  colors: readonly [number, number]
}

/** 자리에서 뽑는 난수. 프레임마다 흔들리면 안 된다 (`Foliage`의 것과 같은 규칙) */
function hash(x: number, z: number, salt: number): number {
  const s = Math.sin(x * 269.5 + z * 183.3 + salt * 41.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * 창 안의 풀숲 칸을 훑어 포기 자리를 뽑는다.
 *
 * 높이는 격자에 묻는다 — 풀숲이 비탈에도 깔려 있어서 한 청크에 한 높이를
 * 쓰면 언덕에서 풀이 땅에 파묻히거나 뜬다
 */
export function grassSpots(grid: MapGrid, chunkIndex: number, radius: number): Float32Array {
  const n = grid.chunkTiles
  const out: number[] = []
  for (const c of grid.chunksAround(chunkIndex, radius)) {
    for (let z = c.my * n; z < (c.my + 1) * n; z++) {
      for (let x = c.mx * n; x < (c.mx + 1) * n; x++) {
        if (!isTuftTile(grid.behavior(x, z))) continue
        for (let t = 0; t < TUFTS; t++) {
          const px = x + 0.2 + hash(x, z, t) * 0.6
          const pz = z + 0.2 + hash(x, z, t + 8) * 0.6
          out.push(px, grid.heightAtWorld(px, pz) ?? 0, pz)
        }
      }
    }
  }
  return new Float32Array(out)
}

/**
 * 포기 하나의 모양. 잎 `BLADES`장, 장마다 삼각형 둘.
 *
 * 밑동을 어둡게 두는 것은 실제 풀숲이 아래로 갈수록 빛을 못 받기 때문이다.
 * 이것이 없으면 포기가 평평한 초록 부채로 보인다
 */
function tuftGeometry(base: number, tip: number): BufferGeometry {
  const position = new Float32Array(BLADES * 4 * 3)
  const color = new Float32Array(BLADES * 4 * 3)
  const index: number[] = []
  const low = new Color(base), high = new Color(tip)
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2 + 0.4
    const dx = Math.cos(a), dz = Math.sin(a)
    // 잎의 폭 방향은 눕는 방향과 직교해야 옆에서 봐도 면이 보인다
    const wx = -dz * BLADE_WIDE, wz = dx * BLADE_WIDE
    const lean = BLADE_LEAN * (0.5 + b / BLADES)
    const put = (i: number, x: number, y: number, z: number, c: Color) => {
      position[i * 3] = x; position[i * 3 + 1] = y; position[i * 3 + 2] = z
      color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b
    }
    const o = b * 4
    put(o, -wx, 0, -wz, low)
    put(o + 1, wx, 0, wz, low)
    put(o + 2, dx * lean + wx * 0.3, BLADE_LEN, dz * lean + wz * 0.3, high)
    put(o + 3, dx * lean - wx * 0.3, BLADE_LEN, dz * lean - wz * 0.3, high)
    index.push(o, o + 1, o + 2, o, o + 2, o + 3)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(position, 3))
  geo.setAttribute('color', new BufferAttribute(color, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/** 색은 정점이 나르므로 재질은 한 벌이면 된다. 잎 한 장이라 양면으로 그린다 */
const grassMaterial = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide })
const shapes = new Map<string, BufferGeometry>()

const at = new Vector3()
const spin = new Quaternion()
const axis = new Vector3(0, 1, 0)
const size = new Vector3()
const put = new Matrix4()

export function Grass({ field }: { field: GrassField | null }) {
  const mesh = useMemo(() => {
    if (!field || field.spots.length === 0) return null
    const key = `${String(field.colors[0])}/${String(field.colors[1])}`
    let geometry = shapes.get(key)
    if (!geometry) {
      geometry = tuftGeometry(field.colors[0], field.colors[1])
      shapes.set(key, geometry)
    }
    const count = field.spots.length / 3
    const made = new InstancedMesh(geometry, grassMaterial, count)
    made.name = '풀숲'
    for (let i = 0; i < count; i++) {
      const x = field.spots[i * 3]!, y = field.spots[i * 3 + 1]!, z = field.spots[i * 3 + 2]!
      const s = 0.75 + hash(x, z, 3) * 0.5
      made.setMatrixAt(i, put.compose(
        at.set(x, y, z),
        spin.setFromAxisAngle(axis, hash(x, z, 4) * Math.PI * 2),
        size.set(s, s * (0.8 + hash(x, z, 5) * 0.5), s),
      ))
    }
    made.instanceMatrix.needsUpdate = true
    made.receiveShadow = true
    made.frustumCulled = false // 인스턴스가 청크를 가로질러 흩어져 있다
    return made
  }, [field])

  useEffect(() => () => { mesh?.dispose() }, [mesh])

  return mesh ? <primitive object={mesh} /> : null
}
