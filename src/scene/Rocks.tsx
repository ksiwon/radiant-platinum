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
  BufferAttribute, BufferGeometry, Color, Frustum, IcosahedronGeometry,
  InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Sphere, Vector3,
} from 'three'
import type { TexSheet } from './chunkMesh'
import { ballNormals, lumpy, merge } from './Foliage'
import type { RockSite } from './plates'

/**
 * 폭 대비 높이. **원작에 없는 값이다** — 위 주석의 45° 셈에서 나온다:
 * 2.0/cos45° − 2.0 = 0.83타일이고 폭이 2.0이라 0.414다
 */
const ROCK_TALL = 0.414
/**
 * 밑을 이만큼 땅에 묻는다 (폭 배수).
 *
 * 덩이는 뚜껑이 없는 통이 아니라 닫힌 공이지만, 딱 얹어 두면 물결·모래와의
 * 경계가 칼로 자른 듯 떨어진다. 조금 묻어야 **박힌 것**으로 보인다
 */
const ROCK_SINK = 0.10
/** 울퉁불퉁하게 미는 정도 (반지름 배수). 나무 잎보다 세게 — 바위는 각이 있다 */
const ROCK_LUMP = 0.26

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
 * 바위 한 덩이. 원점이 **밑바닥 한가운데**고 단위는 바위 폭이다. 삼각형 80개.
 *
 * ⚠️ **LOD를 안 나눈다.** 나무처럼 먼 것을 8면짜리로 바꿔 봤는데, 바위는
 * 잎과 달리 하나가 통짜라 8면이 그대로 **뿔**로 읽힌다(양지 앞바다에서
 * 확인했다). 오버월드에 1,003개뿐이라(실측) 아낄 자리도 아니다 —
 * 한 화면에 수십 개면 2천 삼각형이다
 */
export function rockGeometry(bands: readonly number[]): BufferGeometry {
  const geo = new IcosahedronGeometry(0.5, 1)
  lumpy(geo, 0.5, ROCK_LUMP)
  // 눌러서 바위 비율로. 밑을 조금 묻고 나머지를 땅 위로 올린다
  geo.scale(1, ROCK_TALL, 1)
  geo.translate(0, ROCK_TALL * (0.5 - ROCK_SINK), 0)
  ballNormals(geo, 0, ROCK_TALL * (0.5 - ROCK_SINK), 0)

  // 높이로 층을 골라 칠한다. 층 사이는 이어 섞어서 띠가 안 보이게 한다
  const pos = geo.getAttribute('position') as BufferAttribute
  const color = new Float32Array(pos.count * 3)
  const lo = new Color(), hi = new Color(), c = new Color()
  const top = ROCK_TALL * (1 - ROCK_SINK)
  const n = bands.length
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, pos.getY(i) / top)) * (n - 1)
    const k = Math.min(n - 2, Math.floor(t))
    lo.set(bands[k] ?? 0x8c8c84)
    hi.set(bands[k + 1] ?? bands[k] ?? 0x8c8c84)
    c.copy(lo).lerp(hi, t - k)
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new BufferAttribute(color, 3))
  return merge([geo])
}

/** 같은 **그림 칸**을 쓰는 덩이를 청크를 넘어 한 덩어리로 묶는다 */
export interface RockGroup {
  key: string
  bands: number[]
  /** [자리, 청크 원점 x, 청크 원점 z] */
  items: [RockSite, number, number][]
}

/** 화면 밖이어도 이만큼은 남긴다 (타일). 그림자가 이만큼 뻗는다 */
const CULL_MARGIN = 2

const shapes = new Map<string, BufferGeometry>()
/** 색은 정점 색이 나르므로 재질은 한 벌이면 된다 */
const rockMaterial = new MeshLambertMaterial({ vertexColors: true })

const viewProj = new Matrix4()
const frustum = new Frustum()
const sphere = new Sphere()
const spot = new Vector3()

function shapeOf(key: string, bands: number[]): BufferGeometry {
  let geo = shapes.get(key)
  if (!geo) {
    geo = rockGeometry(bands)
    shapes.set(key, geo)
  }
  return geo
}

/**
 * 자리에서 뽑는 난수. 같은 바위는 늘 같은 모습으로 서야 한다 —
 * `Math.random`이면 청크를 다시 세울 때마다 흔들린다
 */
function hash(x: number, z: number, salt: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453
  return s - Math.floor(s)
}

export function Rocks({ groups }: { groups: RockGroup[] }) {
  const camera = useThree((s) => s.camera)

  const meshes = useMemo(() => groups.map((g) => {
    const matrices = g.items.map(([site, originX, originZ]) => {
      // 크기는 판 폭이 정한다. 그루마다 조금씩 흔들어 줄지어 선 것이 안 되게 한다
      const w = site.w * (0.85 + hash(site.x, site.z, 3) * 0.3)
      return new Matrix4().compose(
        new Vector3(site.x + originX, site.y, site.z + originZ),
        new Quaternion().setFromAxisAngle(
          new Vector3(0, 1, 0), hash(site.x, site.z, 5) * Math.PI * 2),
        new Vector3(w, w, w))
    })
    const mesh = new InstancedMesh(
      shapeOf(g.key, g.bands), rockMaterial, Math.max(1, matrices.length))
    mesh.name = '바위'
    mesh.castShadow = true
    mesh.receiveShadow = true
    // 인스턴스가 청크를 가로질러 흩어져 있어 메시 단위 절두체가 뜻이 없다
    mesh.frustumCulled = false
    mesh.count = 0
    const spots = matrices.map((m) => new Vector3().setFromMatrixPosition(m))
    const radius = matrices.map((m) => new Vector3().setFromMatrixScale(m).x * 0.7)
    return { key: g.key, mesh, matrices, spots, radius }
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
      g.mesh.count = n
      g.mesh.instanceMatrix.needsUpdate = true
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
