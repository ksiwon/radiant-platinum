// 입체 바위 (DATA.md §2.2)
//
// 나무만 판때기인 것이 아니다. 물가의 바위도 **사각형 한 장**이고, 원작이 고정
// 3/4 카메라를 보고 45°로 눕혀 놓았다 — 그 각도에서 보면 물에 잠긴 바위로
// 읽힌다. 우리 카메라로 보면 **새까만 달걀**이 물 위에 줄줄이 서 있다
// (양지시티 해안이 그랬다).
//
// 바위만이 아니다. 축복시티 `imped` 한 장에 흰 울타리 두 줄 · 바위 한 덩이 ·
// **화분 둘** · 자갈 둘이 같이 들어 있고, 전부 45°로 눕혀 놓아서 다 같이
// 세워진다 — 울타리는 세우는 것이 맞고 나머지는 세우면 액자가 된다. 인도 위에
// 회색 판이 떠 있던 것이 그 화분이다. 가르는 잣대는 `plates.plateLumps`에 있다.
//
// 원작에는 이것들의 입체 모양이 없다. 그래서 여기 세우는 덩이는 우리가 만든
// 것이다 — 나무와 같다. 대신 **자리와 폭과 색은 전부 원작에서 온다**:
//
//   자리  판 하나가 덩이 하나다. 판 상자의 한가운데에 세운다
//   폭    `searock` 판이 실측으로 **1,001장 전부 2.0×1.41×1.41타일**이다
//   색    그 판이 쓰는 그림 칸의 **가로줄 평균**을 밑에서 위로 (`plateBands`)
//
// 높이만 우리 것이다. 판은 45°로 누워 있고 그 실루엣이 세로 2.0타일인데,
// 45°에서 보이는 세로 길이는 `(높이 + 깊이)×cos45°`다. 둥근 바위라 깊이를
// 폭과 같다고 두면 높이는 2.0/0.707 − 2.0 = **0.83타일**이 된다 — 깊이를
// 폭으로 둔 것 하나가 우리가 넣은 가정이고, 나머지는 원작 수치다.
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute, BufferGeometry, Color, DataTexture, Frustum, InstancedMesh, Matrix4,
  MeshLambertMaterial, NearestFilter, Quaternion, SRGBColorSpace, Sphere, Vector3,
} from 'three'
import type { TexSheet } from './chunkMesh'
import type { RockSite } from './plates'
import { setInstances } from './instances'
import { rockCrop, rockUvs, type RockCrop } from './rockPaint'
import {
  ROCK_RECIPES, rockAspect, rockPositions, rockVariant, type RockRecipe,
} from './rockShape'

/**
 * 폭 대비 높이는 **칸마다 다시 센다** (`rockShape.rockAspect`).
 *
 * ⚠️ 예전에는 0.414 하나를 모든 바위에 썼다. 그 값은 판이 그림으로 가득 찼다는
 * 가정에서 나온 것이라(2.0/cos45° − 2.0), 위아래가 빈 칸에서는 실제보다 솟는다.
 * 지금은 그 칸에서 불투명한 줄·칸의 비율을 받아 계열마다 다시 센다 — 가득 찬
 * 칸이면 같은 0.414가 나온다
 */
/**
 * 밑을 이만큼 땅에 묻는다 (폭 배수).
 *
 * 덩이는 뚜껑이 없는 통이 아니라 닫힌 공이지만, 딱 얹어 두면 물결·모래와의
 * 경계가 칼로 자른 듯 떨어진다. 조금 묻어야 **박힌 것**으로 보인다
 */
const ROCK_SINK = 0.10

/** 덩이를 몇 층으로 나눠 칠하나. 원작 그림이 32텍셀이라 8이면 네 텍셀에 한 층이다 */
const BANDS = 8

/**
 * 덩이 색 — **그 그림의 가로줄 평균을 밑에서 위로.**
 *
 * ⚠️ 색을 골라 쓰면 안 된다. 이 길로 세우는 것이 바위만이 아니다 — 축복시티
 * `imped` 한 장에 바위와 **화분**(회색 통 + 초록 덤불)이 같이 들어 있어서,
 * 많이 쓰인 색 셋을 밝기로 세우면 화분이 통째로 초록 공이 된다.
 *
 * 줄 평균을 그대로 실으면 그럴 일이 없다: 화분은 밑이 회색이고 위가 초록,
 * 바위는 밑이 어둡고 위가 밝다. 판이 45°로 누워 있어 **그림의 아래가 물건의
 * 아래**라, 줄 순서를 그대로 쓰면 된다.
 *
 * 칸은 그 판이 실제로 쓰는 그림 칸이다 — 한 그림에 여러 물건이 들어 있어서
 * 통째로 평균 내면 옆 물건 색이 섞인다
 */
export function plateBands(
  sheet: TexSheet, item: { x: number; y: number; w: number; h: number },
  u0: number, u1: number, v0: number, v1: number,
): number[] {
  const clampX = (t: number) => Math.min(item.w - 1, Math.max(0, t))
  const clampY = (t: number) => Math.min(item.h, Math.max(0, t))
  const tx0 = clampX(Math.round(u0 * item.w)), tx1 = clampX(Math.round(u1 * item.w) - 1)
  const ty0 = clampY(Math.round(v0 * item.h)), ty1 = clampY(Math.round(v1 * item.h))
  const rows = Math.max(1, ty1 - ty0)
  const out: number[] = []
  let last = 0x8c8c84
  for (let k = 0; k < BANDS; k++) {
    // 아래 층이 그림의 **아랫줄**이다
    const from = ty1 - Math.round(((k + 1) / BANDS) * rows)
    const to = ty1 - Math.round((k / BANDS) * rows)
    let r = 0, g = 0, b = 0, n = 0
    for (let y = from; y < to; y++) {
      const row = ((item.y + y) * sheet.width + item.x) * 4
      for (let x = tx0; x <= tx1; x++) {
        const o = row + x * 4
        if (sheet.pixels[o + 3]! < 128) continue
        // 물결 하이라이트는 물이지 물건이 아니다 (`searock`의 #ade7ff 66픽셀)
        const cr = sheet.pixels[o]!, cg = sheet.pixels[o + 1]!, cb = sheet.pixels[o + 2]!
        if (cb > cr + 24 && cb > cg + 16) continue
        r += cr; g += cg; b += cb; n++
      }
    }
    // 빈 줄은 밑의 색을 이어받는다 — 검게 떨어뜨리면 그 층만 띠로 보인다
    if (n > 0) last = (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)
    out.push(last)
  }
  return out
}

/**
 * 바위 한 덩이. 원점이 **밑바닥 한가운데**고 폭이 1이다.
 *
 * 모양은 링 넷 × 둘레 일곱이고(`rockShape`) 면마다 제 법선이 선다 — 예전처럼
 * 20면체를 눌러 `ballNormals`로 공처럼 펴지 않는다. 능선이 각져야 바위로 읽힌다.
 *
 * ⚠️ **LOD를 안 나눈다.** 나무처럼 먼 것을 단순한 모양으로 바꿔 봤는데, 바위는
 * 잎과 달리 하나가 통짜라 그대로 **뿔**로 읽힌다(양지 앞바다에서 확인했다).
 * 한 덩이가 49삼각형이라(§10.1의 상한 160) 아낄 자리도 아니다
 */
function rockGeometry(
  recipe: RockRecipe, tall: number, bands: readonly number[], textured: boolean,
): BufferGeometry {
  const position = rockPositions(recipe, tall, ROCK_SINK)
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(position, 3))
  geo.setAttribute('uv', new BufferAttribute(rockUvs(position, tall), 2))
  if (!textured) {
    // 그림을 못 받았을 때만 층 색으로 떨어진다 — 색은 여전히 원작 칸에서 온다
    const color = new Float32Array(position.length)
    const lo = new Color(), hi = new Color(), c = new Color()
    const top = tall * (1 - ROCK_SINK)
    const n = bands.length
    for (let i = 0; i < position.length / 3; i++) {
      const t = Math.min(1, Math.max(0, position[i * 3 + 1]! / top)) * (n - 1)
      const k = Math.min(Math.max(0, n - 2), Math.floor(t))
      lo.set(bands[k] ?? 0x8c8c84)
      hi.set(bands[k + 1] ?? bands[k] ?? 0x8c8c84)
      c.copy(lo).lerp(hi, t - k)
      color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new BufferAttribute(color, 3))
  }
  // 비인덱스라 면마다 제 법선이 나온다 — 그것이 곧 hard edge다
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/** 같은 **그림 칸**을 쓰는 덩이를 청크를 넘어 한 덩어리로 묶는다 */
export interface RockGroup {
  key: string
  /** 그림을 못 받았을 때 쓰는 층 색 */
  bands: number[]
  /**
   * 그 칸에서 잘라 온 그림. **문양이 여기서 온다** — 없으면 층 색으로 떨어진다
   */
  crop?: RockCrop | null
  /** [자리, 청크 원점 x, 청크 원점 z] */
  items: [RockSite, number, number][]
}

/**
 * 그 칸의 그림과 실루엣을 함께 받는다. `ChunkModels`가 무리를 만들 때 부른다.
 *
 * 높이(`tall`)는 **실루엣에서** 나온다 — 칸을 가득 채운 그림이면 예전 값 0.414다
 */
export function rockLook(
  sheet: TexSheet | null, item: { x: number, y: number, w: number, h: number } | undefined,
  site: { u0: number, u1: number, v0: number, v1: number },
): { crop: RockCrop | null, tall: number } {
  const crop = sheet && item
    ? rockCrop(sheet, item, site.u0, site.u1, site.v0, site.v1) : null
  return { crop, tall: crop ? rockAspect(crop.rows, crop.cols) : rockAspect(1, 1) }
}

/** 화면 밖이어도 이만큼은 남긴다 (타일). 그림자가 이만큼 뻗는다 */
const CULL_MARGIN = 2

const shapes = new Map<string, BufferGeometry>()
const paints = new Map<string, MeshLambertMaterial>()
/** 그림을 못 받은 칸이 쓰는 한 벌. 색은 정점이 나른다 */
const bandMaterial = new MeshLambertMaterial({ vertexColors: true })

const viewProj = new Matrix4()
const frustum = new Frustum()
const sphere = new Sphere()
const spot = new Vector3()

/** 변주마다 모양이 따로다 — 인스턴스 하나가 지오메트리를 바꿔 달 수는 없다 */
function shapeOf(
  key: string, variant: number, tall: number, bands: number[], textured: boolean,
): BufferGeometry {
  const id = `${key}/v${String(variant)}`
  let geo = shapes.get(id)
  if (!geo) {
    geo = rockGeometry(ROCK_RECIPES[variant]!, tall, bands, textured)
    shapes.set(id, geo)
  }
  return geo
}

/** 그 칸의 그림을 재질 하나로. 같은 칸을 쓰는 무리가 나눠 쓴다 */
function paintOf(key: string, crop: RockCrop): MeshLambertMaterial {
  let made = paints.get(key)
  if (!made) {
    const map = new DataTexture(crop.pixels, crop.width, crop.height)
    // 원작 도트다. 선형 보간을 걸면 4세대 특유의 또렷함이 사라진다
    map.magFilter = NearestFilter
    map.colorSpace = SRGBColorSpace
    map.name = `rock ${String(crop.width)}x${String(crop.height)}`
    map.needsUpdate = true
    made = new MeshLambertMaterial({ map })
    paints.set(key, made)
  }
  return made
}

/**
 * 자리에서 뽑는 난수. 같은 바위는 늘 같은 모습으로 서야 한다 —
 * `Math.random`이면 청크를 다시 세울 때마다 흔들린다
 */
function hash(x: number, z: number, salt: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * 수평 회전의 폭 (라디안).
 *
 * ⚠️ **한 바퀴 다 돌리면 안 된다.** 앞면에 원작 문양을 폈으므로(`rockPaint`)
 * 아무 방향으로나 돌리면 그 문양이 등 뒤로 간다. 명세가 말하는 「수평 회전」은
 * 줄지어 선 것을 흩는 몫이라 이만큼이면 된다
 */
const SPIN = Math.PI / 9

export function Rocks({ groups }: { groups: RockGroup[] }) {
  const camera = useThree((s) => s.camera)

  const meshes = useMemo(() => groups.flatMap((g) => {
    const crop = g.crop ?? null
    const tall = crop ? rockAspect(crop.rows, crop.cols) : rockAspect(1, 1)
    // ⚠️ **폭도 실루엣에서 온다.** 칸의 좌우가 비어 있으면 그만큼 좁은 돌이다
    const cover = crop ? crop.cols : 1
    const material = crop ? paintOf(g.key, crop) : bandMaterial
    /** 변주별로 나눠 담는다 */
    const byVariant = ROCK_RECIPES.map((): [RockSite, number, number][] => [])
    for (const one of g.items) byVariant[rockVariant(one[0].x, one[0].z)]!.push(one)
    return byVariant.flatMap((items, variant) => {
      if (items.length === 0) return []
      const matrices = items.map(([site, originX, originZ]) => {
        const w = site.w * cover
        return new Matrix4().compose(
          new Vector3(site.x + originX, site.y, site.z + originZ),
          new Quaternion().setFromAxisAngle(
            new Vector3(0, 1, 0), (hash(site.x, site.z, 5) * 2 - 1) * SPIN),
          new Vector3(w, w, w))
      })
      const geometry = shapeOf(g.key, variant, tall, g.bands, crop !== null)
      const mesh = new InstancedMesh(geometry, material, Math.max(1, matrices.length))
      mesh.name = `바위 ${ROCK_RECIPES[variant]!.id}`
      mesh.castShadow = true
      mesh.receiveShadow = true
      // 인스턴스가 청크를 가로질러 흩어져 있어 메시 단위 절두체가 뜻이 없다
      mesh.frustumCulled = false
      setInstances(mesh, 0)
      // ⚠️ **감싸는 공도 실제 모양에서 잰다** (§10.2). 폭 배수 0.7로 박아 두면
      // 모양이 바뀔 때 절두체가 끝을 자른다
      const local = geometry.boundingSphere
      const spots = matrices.map((m) => new Vector3(local?.center.x ?? 0,
        local?.center.y ?? 0, local?.center.z ?? 0).applyMatrix4(m))
      const radius = matrices.map((m) =>
        (local?.radius ?? 0.7) * new Vector3().setFromMatrixScale(m).x)
      return [{ key: `${g.key}/v${String(variant)}`, mesh, matrices, spots, radius }]
    })
  }), [groups])

  useFrame(() => {
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(viewProj)
    for (const g of meshes) {
      let n = 0
      for (let i = 0; i < g.spots.length; i++) {
        spot.copy(g.spots[i]!)
        sphere.set(spot, g.radius[i]! + CULL_MARGIN)
        if (!frustum.intersectsSphere(sphere)) continue
        g.mesh.setMatrixAt(n++, g.matrices[i]!)
      }
      setInstances(g.mesh, n)
    }
  })

  useEffect(() => () => {
    for (const g of meshes) g.mesh.dispose()
  }, [meshes])

  return (
    <group>
      {meshes.map(({ key, mesh }) => <primitive key={key} object={mesh} />)}
    </group>
  )
}
