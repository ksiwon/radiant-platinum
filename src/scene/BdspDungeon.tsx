// 던전을 **BDSP 던전**으로 세운다 (docs/orders/VISUAL_20260930.md §1)
//
// 호수 · 숲 · 동굴 · 탑은 원작이 제 행렬을 쓰는 맵이라 원작 그림이 그대로 섰고, 1인칭으로 돌아보면 합성 벽(갈색 상자)과 검은
// 하늘이 드러났다. BDSP는 같은 던전을 입체로 다시 지었다(`Environments/prefab_map/d##…` 138벌 · `models/dungeon/*.glb`).
//
// ⚠️ **좌표는 대개 그대로다.** 방과 같다 — 원작 칸 좌표로 지어져 있어 행렬 원점에 놓는다(`d27r0101` 상자 −2~68 × 0~64).
// 짝도 방과 같은 규칙이다(`roomFor` — 이름 → 같은 행렬의 형제). 충돌 · 높이 · 워프 · 사람은 원작 자료가 쥔다 — 이 층은 그림만이다.
// 예외 둘은 실측으로 옮긴다:
// · **여러 맵이 한 행렬을 나눠 쓰면** glb는 그 맵 청크의 제 좌표다(대습초원 여섯 · `dungeonOrigin`)
// · **바닥이 원작 높이와 통째로 어긋난** 던전은 들어 올린다(`DUNGEON_LIFT`)
//
// ⚠️ **천장은 1인칭에서만 보인다** (`isCeiling`). BDSP는 부감 게임이라 실내형 던전(숲의 양옥집 · 배틀타워 로비)에 천장이 덮여 있고
// 3인칭 카메라는 그 위에 있다 — 방(`BdspRoom`)과 같은 규칙이다. 하늘이 안 서는 던전(`coverKind`)은 1인칭에서 둘레 벽 띠와
// 천장 판으로 덮는다(`dungeonCover`) — 부감용 디오라마라 벽 위 · 바깥이 검은 허공이다
//
// ⚠️ **그림은 glb 밖에 있다.** 던전끼리 한 벌을 나눠 쓰므로(`tex/{해시}.png`) glb를 풀기 전에 그 주소를 설치본 주소로 잇는다
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  AdditiveBlending, Box3, BufferAttribute, BufferGeometry, DoubleSide, InstancedMesh, LoadingManager, Mesh,
  MeshStandardMaterial, Vector3, type Group, type Material, type Object3D,
} from 'three'
import { assets } from '../data/providers/assetProvider'
import { firstPersonView } from '../engine/actor/camera'
import type { MatrixMeta } from '../engine/map/grid'
import { mapById, world } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { hideDevices, roomFor } from './BdspRoom'
import { bdspLights, type BdspLights } from './bdspLights'
import { disposeTree } from './disposeTree'
import { fieldFade, type FieldFade } from './fieldFade'
import { useBdspMark } from './bdspReady'
import { liveWater } from './BdspField'
import { holdBdspDoors } from './DoorAnimations'
import { holdBdspSigns } from './ObjectProps'

const ROOT = 'models/dungeon'

let index: Promise<ReadonlySet<string>> | null = null
/** 구워 둔 던전들 (`models/dungeon/index.json`). 없는 설치본이면 빈 목록 — 그때는 원작 그림 그대로다 */
function dungeonIndex(): Promise<ReadonlySet<string>> {
  index ??= assets().text(`${ROOT}/index.json`)
    .then((t) => new Set(((JSON.parse(t) as { dungeons?: { name: string }[] }).dungeons ?? []).map((d) => d.name)))
    .catch(() => new Set<string>())
  return index
}

/** 지금 맵의 던전 이름 — 목차가 오기 전과 던전이 없는 맵은 `null` */
export function useBdspDungeon(mapId: number): string | null {
  const [names, setNames] = useState<ReadonlySet<string> | null>(null)
  useEffect(() => {
    let alive = true
    void dungeonIndex().then((n) => { if (alive) setNames(n) })
    return () => { alive = false }
  }, [])
  return names ? roomFor(mapId, names) : null
}

/**
 * 하늘이 트인 던전인가 — 원작 배틀 배경이 풀밭 ~ 눈이다 (`generated/battle_backgrounds.txt`: 0 PLAIN · 1 WATER · 2 CITY · 3 FOREST ·
 * 4 MOUNTAIN · 5 SNOW · 6~8 INDOORS · 9~11 CAVE).
 *
 * ⚠️ **헤더의 맵 갈래로는 못 가른다.** 호수 입구 · 영원의 숲 · 동굴이 다 같은 던전형(`mapType` 3)이라 하늘이 안 서서, BDSP로 세운
 * 호숫가 위가 검게 비었다. 배틀 배경은 원작이 그 자리의 바깥을 적어 둔 값이다 — 풀밭 ~ 눈으로 찍힌 던전은 호수 셋의 입구 ·
 * 영원의 숲 · 대습초원 · 꽃향기의 꽃밭 · 만월섬 · 신월섬 · 송별의 샘 · 자랑의 뒷마당 · 천관산 바깥 · 창기둥이다.
 *
 * 원작 그림이 서는 던전에는 안 쓴다 — 3인칭 부감용 판때기라 가장자리 너머에 하늘을 걸면 공중에 뜬 널판이 된다 (`MapStreamer`)
 */
export function openAir(header: { battleBg?: number } | null | undefined): boolean {
  const bg = header?.battleBg ?? -1
  return bg >= 0 && bg <= OPEN_AIR_LAST
}
/** `BACKGROUND_SNOW` — 바깥 배경의 끝 */
const OPEN_AIR_LAST = 5

/** glb 안 JSON이 가리키는 바깥 그림 주소들 */
export function imageUris(glb: ArrayBuffer): string[] {
  const view = new DataView(glb)
  const length = view.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, length))) as { images?: { uri?: string }[] }
  return (json.images ?? []).flatMap((i) => (i.uri === undefined ? [] : [i.uri]))
}

/** 주인공의 어느 높이를 겨누는가 — `PropFade`의 `AIM_HEIGHT`와 같다 */
const AIM = 1.2

// ── 재질 갈래 ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * 천장 조각인가 — BDSP 재질 이름이 `…_Ceil_…`이다 (`BdspRoom`의 판별과 같다).
 *
 * 던전 138벌의 `_Ceil_` 재질은 스물셋이고 **전부 실내형의 평평한 판**이다(양옥집 `d25r01xx` `M_D_053_Ceil_01_C` y 3.1 · 배틀타워
 * `d31r02xx` `M_RO_018_Ceil_01` y 2.5 · `d02r0101` · `d04r0101` · `d10r03xx`). 동굴 · 숲에는 3인칭에서 보여야 할 바위 천장이 없다 —
 * 그래서 갈래를 안 가리고 다 1인칭 전용이다. 천장 등(`…_CeilLight_…`)은 걸리지 않는다
 */
export const isCeiling = (m: Material): boolean => /_Ceil_/.test(m.name)

/**
 * 바닥에 붙은 얇은 무늬 — 잔디 이음(`GrassSeam`) · 매트(`…_Mat_01`) · 바닥 마크(`…_Mark_01`). 바닥과 **같은 평면**이다
 * (`d31r0201` `M_C_001_Mat_01`이 y −2e−17 · 바닥이 y 0 — I-p18-15). 깊이로 못 가르니 깊이를 당겨 늘 바닥 위에 그리고, 바닥에
 * 그림자를 드리우지도(제 그림자에 덮여 검은 톱니가 졌다 — I-p18-10) 받지도 않는다
 */
export const isDecal = (m: Material): boolean => /GrassSeam|_Mat_\d+$|_Mark_\d+/.test(m.name)

/**
 * 창으로 드는 빛 · 조명 줄기 — **더해지는 빛**이다(`…_WindowLight_…` · `…_SpotLight_…` · `…_Light_…` · `EntranceLight`).
 * 방(`BdspRoom`)과 같은 사정이다 — 반투명 판으로 그리면 하얀 널빤지가 화면을 가로지른다. `SpotLight`는 배틀타워 광장
 * (`d31` `M_D_011_SpotLight_01`)에 있다
 */
export const isLightShaft = (m: Material): boolean => /_(Window|Spot)?Light_\d/.test(m.name) || /EntranceLight/.test(m.name)

/** 빛 줄기의 세기 — 더해지는 빛이라 1이면 바닥이 하얗게 탄다 (`BdspRoom`과 같은 값) */
const LIGHT_SHAFT = 0.35
/** 이보다 얇으면 평평한 판이다 (타일) */
const FLAT = 0.02

/** 불러온 던전의 메시마다 그림자 · 빛 · 무늬 깃발을 세운다. 천장 메시들을 돌려준다 — 1인칭에서만 보일 것들이다 */
export function dressDungeon(root: Object3D): Mesh[] {
  root.updateMatrixWorld(true)
  const ceilings: Mesh[] = []
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    o.receiveShadow = true
    o.castShadow = true
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
    if (mats.some(isCeiling)) {
      // 3인칭에서는 숨는다. 1인칭에서 그림자를 드리우면 방 전체가 그늘이다
      o.castShadow = false
      ceilings.push(o)
    }
    if (mats.some(isLightShaft)) {
      for (const m of mats) {
        if (!isLightShaft(m)) continue
        m.blending = AdditiveBlending
        m.transparent = true
        m.depthWrite = false
        m.opacity = LIGHT_SHAFT
        // 더하는 빛으로 적어 둔다 — 흐림(`fieldFade`)이 가리는 것으로 안 세고, 발광(`bdspLights`)도 같은 길로 편다
        m.userData.add = true
      }
      o.castShadow = false
      o.receiveShadow = false
      o.renderOrder = 10
      return
    }
    if (mats.some(isDecal)) {
      for (const m of mats) {
        if (!isDecal(m)) continue
        m.polygonOffset = true
        m.polygonOffsetFactor = -1
        m.polygonOffsetUnits = -1
      }
      o.castShadow = false
      o.receiveShadow = false
      o.renderOrder = 1
      return
    }
    // 평평한 컷아웃 판(`MASK`)은 그림자를 안 드리운다 — 같은 평면에 제 그림자로 줄무늬가 진다. 바위 · 벽은 그대로 진다.
    // ⚠️ 굽는 쪽이 불투명 재질도 다 `MASK`로 싣는다(`d01r0102` 재질 열여덟 모두) — 그래서 컷아웃인지는 두께로 본다
    const box = new Box3().setFromObject(o)
    if (box.max.y - box.min.y < FLAT && mats.every((m) => m.alphaTest > 0)) o.castShadow = false
  })
  return ceilings
}

// ── 자리 ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * 던전이 놓일 자리(x · z) — **그 glb 이름의 맵이 행렬에서 차지한 청크의 원점**. 맵이 행렬을 혼자 쓰면 0이다.
 *
 * 대습초원 여섯(504~509 · `D06R0201`~`D06R0206`)은 행렬 240(`m_dun0602_` · 4 × 5청크) 하나를 같이 쓰는데, BDSP는 맵마다 glb를
 * **제 청크 좌표로** 지었다 — 505(`d06r0202`)의 glb 상자가 x −1~40 · z −8~33인데 그 맵은 청크 (2, 1) · 칸 x 64~96 · z 32~64에
 * 있어서, 원점에 세우면 64 · 32칸 비껴 주인공 발밑에 땅이 하나도 없었다(I-p11-0). 실측으로 맞다: 505의 원작 정류장 소품(모델 473)이
 * 행렬 (70, 40)이고 glb 정류장(`M_D_007_Station_01`)이 x 3.5~8 · z 4~12 — 청크 원점 (64, 32)을 더하면 같은 자리다.
 *
 * 형제 glb를 빌릴 때(`roomFor`)도 **glb 이름의 맵** 청크다 — 그 glb는 그 맵 자리에 지어졌다. 행렬에 맵 표(`zone`)가 없으면
 * (던전 138벌 중 대습초원 밖 전부) 0이다
 */
export function dungeonOrigin(
  name: string, meta: Pick<MatrixMeta, 'id' | 'width' | 'tileWidth' | 'chunks'> | null,
): { x: number, z: number } {
  const map = world.maps?.find((m) => m.name.toLowerCase() === name)
  if (!map || !meta || map.matrix !== meta.id) return { x: 0, z: 0 }
  const own = meta.chunks.filter((c) => c.zone === map.id)
  if (own.length === 0) return { x: 0, z: 0 }
  const n = meta.tileWidth / meta.width
  return { x: Math.min(...own.map((c) => c.mx)) * n, z: Math.min(...own.map((c) => c.my)) * n }
}

/**
 * **바닥이 원작 높이와 통째로 어긋난 던전** — 이만큼 들어 올린다 (타일).
 *
 * 원작 높이(BDHC · `public/data/bdhc.*`)는 주인공 · 사람 · 소품이 서는 높이다. glb 바닥이 그보다 낮으면 사람이 한 칸 떠 보였다
 * (창기둥 조무래기 둘 — I-p15-4). 잰 방법: 지나갈 수 있는 칸마다 한가운데에서 BDHC 판이 하나뿐인 자리를 골라, 같은 자리 glb의
 * 위 보는 면 중 BDHC에 가장 가까운 높이와의 차를 0.25 단위로 모았다(물 · 풀 · 그늘 · 빛 재질은 뺐다). **여러 단에서 같은 차**가
 * 나온 던전만 넣었다 — 단마다 다른 것(호수 셋 · 미혹의 동굴 · 철의 섬 일부)은 BDSP가 지형을 다시 지은 것이라 들어서 맞지 않는다.
 * 실측 (2026-10-01 · 차 = glb − BDHC, 그 차인 칸 / 잰 칸) — `BdspDungeon.test.ts`가 같은 방법으로 다시 잰다:
 *
 *   d03r0101 (203)  −1  1,602 / 1,607   BDHC 1 한 단
 *   d05r0105 (211)  +1    587 / 593     BDHC 2 · 3 · 4 · 5 · 6 · 7 · 10 · 11 · 12 · 14 열 단 모두
 *   d05r0114 (220)  −1    421 / 484     BDHC 1 · 1.5 · 2.5 · 3 — 나머지는 −0.25 · −1.25(계단 턱)
 *   d05r0115 (221)  −1    386 / 443     위와 같은 판
 *   d05r0116 (510)  −1    106 / 106     BDHC 1 ~ 16
 *   d13r0101 (256)  −1  3,044 / 3,044   BDHC 1 · 2
 *   d28r0101 (314)  −6    993 / 1,013   BDHC 0 ~ 6 일곱 단 모두
 */
export const DUNGEON_LIFT: Readonly<Record<string, number>> = {
  d03r0101: 1,
  d05r0105: -1,
  d05r0114: 1,
  d05r0115: 1,
  d05r0116: 1,
  d13r0101: 1,
  d28r0101: 6,
}

// ── 메움 면 ──────────────────────────────────────────────────────────────────────────────────────────────

/** 같은 그림이 깔린 넓이의 가운데 촘촘함보다 이만큼 넘게 성기면 메움 면이다 */
const FILL_SPARSE = 8
/** 메움 면을 찾는 재질 — 땅 · 절벽 · 바위 윗면. 굽도리 벽(`ComWall`)은 띠 그림이라 성긴 것이 제 모습이다 */
const FILL_MATERIAL = /_(Ground|Cliff|RockTop)/
/** 위를 보는 면 (법선 y) */
const UP = 0.7
/** 이보다 작은 삼각형은 촘촘함을 안 잰다 (타일²) */
const TINY = 1e-3

function triArea(a: Vector3, b: Vector3, c: Vector3): number {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
}
function uvArea(u: readonly number[]): number {
  return Math.abs((u[2]! - u[0]!) * (u[5]! - u[1]!) - (u[4]! - u[0]!) * (u[3]! - u[1]!)) / 2
}

/** 메시의 삼각형을 월드 꼭짓점 · UV로 돈다 */
function eachTriangle(mesh: Mesh, fn: (t: number, p: readonly [Vector3, Vector3, Vector3], uv: readonly number[]) => void): void {
  const g = mesh.geometry as BufferGeometry
  const pos = g.getAttribute('position'), tex = g.getAttribute('uv') as BufferAttribute | undefined
  const index = g.getIndex()
  const n = Math.floor((index ? index.count : pos.count) / 3)
  const p: [Vector3, Vector3, Vector3] = [new Vector3(), new Vector3(), new Vector3()]
  const uv = [0, 0, 0, 0, 0, 0]
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      const i = index ? index.getX(t * 3 + k) : t * 3 + k
      p[k]!.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
      uv[k * 2] = tex ? tex.getX(i) : 0
      uv[k * 2 + 1] = tex ? tex.getY(i) : 0
    }
    fn(t, p, uv)
  }
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1]!
}

/**
 * **무늬가 한 점으로 뭉친 면에 무늬를 다시 편다.** 새로 세운 메시들을 돌려준다.
 *
 * BDSP 동굴은 벽 꼭대기 뚜껑(`M_C_001_Ground_05_02`)과 절벽 일부(`…_Cliff_01_01N` 등)의 UV가 거의 한 점이다 — 바닥(`Ground_05_01`)과
 * **같은 그림**인데 한 칸에 UV 0.006만 간다(바닥은 0.156 · 25배). 부감에서는 어두운 뚜껑으로 읽히지만 3인칭 · 1인칭에서는 무늬 없는
 * 갈색 판이 세트 뒷면처럼 화면을 덮었다(천관산 · 철의 섬 — I-p14-5 · I-p13-1). 같은 그림이 깔린 넓이의 가운데 촘촘함보다
 * `FILL_SPARSE`배 넘게 성긴 삼각형을 떼어, 그 재질 제 무늬의 촘촘함(없으면 그 가운데 값)으로 **월드 평면에 다시 편다** — 위 보는
 * 면은 x · z, 옆면은 가로 · 높이. 재질은 그대로 나눠 쓴다(뚜껑의 색 0.876이 남아 바닥보다 조금 어둡다). 던전 138벌에서 이렇게
 * 성긴 땅 · 절벽 재질은 `Ground_05_02`(동굴 39벌) · `M_D_00_001_Cliff_01_01`(칸당 0.006)이다.
 *
 * 떼어 낸 위 보는 면은 높이마다 한 벌이고 `userData.cap`을 단다 — 3인칭에서 주인공을 가리면 흐린다(`fieldFade`).
 *
 * ⚠️ **같은 형상을 여럿이 나눠 쓰면 안 건드린다** — 인덱스를 고치면 다른 자리도 바뀐다. 동굴 지형은 한 벌씩이다
 */
export function paintFills(root: Object3D): Mesh[] {
  root.updateMatrixWorld(true)
  const users = new Map<BufferGeometry, number>()
  root.traverse((o) => {
    if (o instanceof Mesh) users.set(o.geometry as BufferGeometry, (users.get(o.geometry as BufferGeometry) ?? 0) + 1)
  })
  interface Info { mesh: Mesh, key: unknown, density: number[], area: number[] }
  const infos: Info[] = []
  root.traverse((o) => {
    if (!(o instanceof Mesh) || o instanceof InstancedMesh) return
    const mat = o.material as Material | Material[]
    if (Array.isArray(mat) || !(mat instanceof MeshStandardMaterial) || !mat.map || !FILL_MATERIAL.test(mat.name)) return
    const g = o.geometry as BufferGeometry
    if (!g.getAttribute('position') || !g.getAttribute('uv')) return
    const info: Info = { mesh: o, key: mat.map.source, density: [], area: [] }
    eachTriangle(o, (_t, p, uv) => {
      const a = triArea(p[0], p[1], p[2])
      info.area.push(a)
      info.density.push(a > 0 ? Math.sqrt(uvArea(uv) / a) : 0)
    })
    infos.push(info)
  })
  const typical = (i: Info, floor = 0): number | null => median(i.density.filter((d, t) => i.area[t]! > TINY && d >= floor))
  // 그 그림이 깔린 **넓이로 가운데** 촘촘함. 재질마다의 최댓값으로 잡으면 작은 조각 하나(미혹의 동굴 `Ground_05_01` 열두 삼각형 ·
  // 칸당 1.67)가 기준이 되어 바닥 2만 삼각형(칸당 0.156)이 통째로 메움으로 잡혔다
  const spread = new Map<unknown, [number, number][]>()
  for (const i of infos) {
    const list = spread.get(i.key) ?? []
    for (let t = 0; t < i.density.length; t++) if (i.area[t]! > TINY) list.push([i.density[t]!, i.area[t]!])
    spread.set(i.key, list)
  }
  const usual = new Map<unknown, number>()
  for (const [key, list] of spread) {
    list.sort((a, b) => a[0] - b[0])
    const half = list.reduce((s, x) => s + x[1], 0) / 2
    let run = 0
    for (const [d, a] of list) {
      run += a
      if (run >= half) { usual.set(key, d); break }
    }
  }
  const made: Mesh[] = []
  const w: [Vector3, Vector3, Vector3] = [new Vector3(), new Vector3(), new Vector3()]
  const e = new Vector3(), f = new Vector3()
  for (const info of infos) {
    const { mesh, density, area } = info
    const ref = usual.get(info.key) ?? 0
    const g = mesh.geometry as BufferGeometry
    const parent = mesh.parent
    if (ref <= 0 || (users.get(g) ?? 0) > 1 || g.groups.length > 0 || !parent) continue
    const sparse = ref / FILL_SPARSE
    const fills: number[] = []
    for (let t = 0; t < density.length; t++) if (area[t]! > TINY && density[t]! < sparse) fills.push(t)
    if (fills.length === 0) continue
    const k = typical(info, sparse) ?? ref
    const index = g.getIndex()
    const pos = g.getAttribute('position')
    const vertexOf = (t: number, c: number): number => (index ? index.getX(t * 3 + c) : t * 3 + c)
    /** 그 삼각형의 월드 꼭짓점을 `w`에 싣고 법선 y의 크기와 옆면의 가로축(x면 0 · z면 1)을 준다 */
    const face = (t: number): { up: boolean, alongZ: boolean } => {
      for (let c = 0; c < 3; c++) w[c].fromBufferAttribute(pos, vertexOf(t, c)).applyMatrix4(mesh.matrixWorld)
      const n = e.subVectors(w[1], w[0]).cross(f.subVectors(w[2], w[0])).normalize()
      return { up: Math.abs(n.y) > UP, alongZ: Math.abs(n.x) > Math.abs(n.z) }
    }
    // 높이마다(위 보는 면) 한 벌 · 옆면 한 벌
    const groups = new Map<string, number[]>()
    for (const t of fills) {
      const key = face(t).up ? `y${Math.round(((w[0].y + w[1].y + w[2].y) / 3) * 4) / 4}` : 'side'
      const list = groups.get(key)
      if (list) list.push(t)
      else groups.set(key, [t])
    }
    for (const [key, tris] of groups) {
      const out = new BufferGeometry()
      for (const [attr, src] of Object.entries(g.attributes)) {
        const size = src.itemSize
        const arr = new Float32Array(tris.length * 3 * size)
        tris.forEach((t, j) => {
          for (let c = 0; c < 3; c++) {
            for (let q = 0; q < size; q++) arr[(j * 3 + c) * size + q] = src.getComponent(vertexOf(t, c), q)
          }
        })
        out.setAttribute(attr, new BufferAttribute(arr, size))
      }
      // 월드 평면에 다시 편다 — 이웃 메시와 같은 좌표라 이음매에서 무늬 결이 같다
      const uv = out.getAttribute('uv') as BufferAttribute
      tris.forEach((t, j) => {
        const { up, alongZ } = face(t)
        for (let c = 0; c < 3; c++) {
          const q = w[c]
          if (up) uv.setXY(j * 3 + c, q.x * k, q.z * k)
          else uv.setXY(j * 3 + c, (alongZ ? q.z : q.x) * k, q.y * k)
        }
      })
      const fill = new Mesh(out, mesh.material)
      fill.name = `${mesh.name} 메움 ${key}`
      fill.position.copy(mesh.position)
      fill.quaternion.copy(mesh.quaternion)
      fill.scale.copy(mesh.scale)
      fill.castShadow = mesh.castShadow
      fill.receiveShadow = mesh.receiveShadow
      if (key !== 'side') fill.userData.cap = true
      parent.add(fill)
      made.push(fill)
    }
    // 원래 메시에서는 뗀다
    const gone = new Set(fills)
    const kept: number[] = []
    for (let t = 0; t < density.length; t++) if (!gone.has(t)) kept.push(vertexOf(t, 0), vertexOf(t, 1), vertexOf(t, 2))
    g.setIndex(kept)
    g.boundingBox = null
    g.boundingSphere = null
    if (kept.length === 0) mesh.visible = false
  }
  root.updateMatrixWorld(true)
  return made
}

// ── 1인칭 덮개 ───────────────────────────────────────────────────────────────────────────────────────────

/** `BACKGROUND_CAVE` 셋 (`generated/battle_backgrounds.txt`) */
const CAVE_FIRST = 9
const CAVE_LAST = 11

/**
 * 1인칭에서 덮을 갈래 — 하늘이 안 서는 던전이다(`openAir`의 반대쪽). 원작 배틀 배경 9~11이 굴(`cave`), 6~8이 실내(`indoor`).
 * 풀밭 ~ 눈(0~5)은 하늘이 서므로 안 덮는다
 */
export function coverKind(header: { battleBg?: number } | null | undefined): 'cave' | 'indoor' | null {
  const bg = header?.battleBg ?? -1
  if (bg >= CAVE_FIRST && bg <= CAVE_LAST) return 'cave'
  if (bg > OPEN_AIR_LAST && bg < CAVE_FIRST) return 'indoor'
  return null
}

/** 덮개 둘레를 정하는 재질 — 땅 · 절벽 · 벽 · 바닥 · 못가 */
const COVER_TERRAIN = /_(Ground|Cliff|Floor|Wall|ComWall|RockTop|Pond)/
/** 굴 천장 높이 — 지형 꼭대기에서 이만큼 위. 눈은 BDHC + 1.38(`EYE_HEIGHT`)이고 BDHC는 glb 꼭대기를 안 넘는다 — 1.1칸 남는다 */
const CAVE_HEADROOM = 2.5
/** 실내 천장 판 — BDSP 천장(없으면 벽 꼭대기)에서 이만큼 위. 천장 등 판(`CeilLight` · y 3.0)이 그 앞에 그려지게 */
const CEIL_GAP = 0.02
/** 둘레 벽 띠를 지형 상자에서 이만큼 밖에 세운다 — 바깥 벽과 같은 평면이면 깊이 싸움이 난다 */
const BAND_OUT = 0.1
/** 띠를 지형 바닥보다 이만큼 아래부터 — 가장자리 틈으로 아래 허공이 안 보이게 */
const BAND_SKIRT = 0.5
/** 굴 천장 밝기 — 바닥 흙 그림을 어둡게 */
const CAVE_CEIL_SHADE = 0.45
/** 실내 천장 판 밝기 — 벽 그림을 어둡게 */
const INDOOR_CEIL_SHADE = 0.6
/** 쓸 재질이 없을 때 — 어두운 바위색 */
const COVER_ROCK = 0x2a2118

/** 세운 면의 UV 결 — 가로로 `du`, 높이로 `dv`, 높이 0에서 `v0` */
interface WallUv { du: number, dv: number, v0: number }

const det3 = (x: readonly (readonly number[])[]): number =>
  x[0]![0]! * (x[1]![1]! * x[2]![2]! - x[1]![2]! * x[2]![1]!)
  - x[0]![1]! * (x[1]![0]! * x[2]![2]! - x[1]![2]! * x[2]![0]!)
  + x[0]![2]! * (x[1]![0]! * x[2]![1]! - x[1]![1]! * x[2]![0]!)

/**
 * 그 재질이 **실제로 벽에 깔린 UV 결** — 세운 삼각형마다 (가로, 높이) → UV를 풀어 넓이로 가장 많은 결. 양옥집 벽
 * `M_D_028_Wall_01`은 (0.25, −0.25, 0.75)이다 — 띠가 같은 결이면 굽도리 높이가 맞는다
 */
function wallUv(meshes: readonly Mesh[]): WallUv | null {
  const votes = new Map<string, { area: number, uv: WallUv }>()
  const n = new Vector3(), e = new Vector3()
  for (const mesh of meshes) {
    eachTriangle(mesh, (_t, [a, b, c], uv) => {
      n.subVectors(b, a).cross(e.subVectors(c, a))
      const len = n.length()
      if (len < 1e-6 || Math.abs(n.y) / len > 0.2) return
      const h = Math.hypot(n.x, n.z)
      const s = (q: Vector3): number => (q.z * n.x - q.x * n.z) / h
      const m = [[s(a), a.y, 1], [s(b), b.y, 1], [s(c), c.y, 1]]
      const d = det3(m)
      if (Math.abs(d) < 1e-6) return
      const solve = (r: readonly number[]): number[] =>
        [0, 1, 2].map((col) => det3(m.map((row, i) => row.map((x, j) => (j === col ? r[i]! : x)))) / d)
      const [du, duy] = solve([uv[0]!, uv[2]!, uv[4]!]) as [number, number]
      const [dvs, dv, v0] = solve([uv[1]!, uv[3]!, uv[5]!]) as [number, number, number]
      // 돌려 깐 결(가로가 V)은 안 센다 — 띠는 가로가 U다
      if (Math.abs(duy) > 1e-3 || Math.abs(dvs) > 1e-3 || Math.abs(du) < 1e-4) return
      const key = `${Math.abs(du).toFixed(3)} ${dv.toFixed(3)} ${v0.toFixed(2)}`
      const hit = votes.get(key) ?? { area: 0, uv: { du: Math.abs(du), dv, v0 } }
      hit.area += len / 2
      votes.set(key, hit)
    })
  }
  let best: { area: number, uv: WallUv } | null = null
  for (const v of votes.values()) if (!best || v.area > best.area) best = v
  return best?.uv ?? null
}

/** 메시의 무늬 촘촘함 — 칸당 UV (가운데값) */
function densityOf(mesh: Mesh): number | null {
  const d: number[] = []
  eachTriangle(mesh, (_t, p, uv) => {
    const a = triArea(p[0], p[1], p[2])
    if (a > TINY) d.push(Math.sqrt(uvArea(uv) / a))
  })
  return median(d)
}

/** 덮개 재질 — 그 재질을 떠서 양면 · 불투명으로, 밝기만 `shade`배 */
function coverPaint(src: Material | undefined, shade: number): MeshStandardMaterial {
  const m = src instanceof MeshStandardMaterial ? src.clone() : new MeshStandardMaterial({ color: COVER_ROCK })
  m.name = `${src?.name ?? '바위'} 덮개`
  m.side = DoubleSide
  m.transparent = false
  m.opacity = 1
  m.alphaTest = 0
  m.color.multiplyScalar(shade)
  return m
}

/** 판 하나(삼각형 둘) — 꼭짓점 넷과 그 UV */
function quad(
  out: { pos: number[], uv: number[], normal: number[] },
  q: readonly (readonly number[])[], t: readonly (readonly number[])[], n: readonly number[],
): void {
  for (const i of [0, 1, 2, 0, 2, 3]) { out.pos.push(...q[i]!); out.uv.push(...t[i]!); out.normal.push(...n) }
}

function coverMesh(out: { pos: number[], uv: number[], normal: number[] }, material: MeshStandardMaterial, name: string): Mesh {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(out.pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(out.normal), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(out.uv), 2))
  const mesh = new Mesh(g, material)
  mesh.name = name
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.visible = false
  return mesh
}

/**
 * **1인칭 덮개** — 지형 상자 둘레의 벽 띠와 천장 판. 1인칭에서만 보인다(부르는 쪽이 켜고 끈다). 좌표는 `root` 안 좌표다.
 *
 * BDSP 던전은 부감용 디오라마라 벽이 낮고(미혹의 동굴 `d21r0101` 꼭대기 y 2.2 · 눈은 BDHC 1 + 1.38) 바깥 · 위가 비었다 —
 * 1인칭으로 서면 위 절반이 검은 허공이었다(미혹의 동굴 · 챔피언로드 · 천관산 — I-p06-3 · I-p17-0 · I-b1-13). 실내형(숲의 양옥집)은
 * 카메라 쪽 남 · 동 벽이 없어 바닥 끝 너머가 새까맸다(I-p05-2). 그래서:
 *
 * · **띠** — 지형 상자(`COVER_TERRAIN`) 네 변에 바닥 아래(`BAND_SKIRT`)부터 천장까지. 굴은 그 굴의 절벽 재질(`…_Cliff_01_01[NSEW]`),
 *   실내는 그 glb의 벽 재질(`…_Wall_…`)이고 UV는 그 재질이 실제 벽에 깔린 결(`wallUv`)을 따른다
 * · **천장** — 굴은 지형 꼭대기 + `CAVE_HEADROOM`에 바닥 흙(`…_Ground_…` 중 가장 촘촘한 것)을 어둡게, 실내는 BDSP 천장(없으면 벽
 *   꼭대기) 바로 위에 벽 재질을 어둡게. BDSP 천장이 덮지 않은 가장자리 틈도 메운다
 *
 * ⚠️ 안쪽 통로 벽은 그대로다 — 미혹의 동굴처럼 벽이 눈보다 낮은 굴은 1인칭에서 벽 너머 통로가 여전히 보인다
 */
export function dungeonCover(root: Object3D, kind: 'cave' | 'indoor'): Mesh[] {
  root.updateMatrixWorld(true)
  const terrain = new Box3()
  let ceil = -Infinity
  const strict: Mesh[] = [], loose: Mesh[] = [], ground: Mesh[] = []
  const bandStrict = kind === 'cave' ? /_Cliff_01_01[NSEW]$/ : /_Wall_/
  const bandLoose = kind === 'cave' ? /_Cliff_/ : /_ComWall_/
  root.traverse((o) => {
    if (!(o instanceof Mesh) || o instanceof InstancedMesh) return
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
    if (mats.some(isCeiling)) { ceil = Math.max(ceil, new Box3().setFromObject(o).max.y); return }
    if (!mats.every((m) => COVER_TERRAIN.test(m.name))) return
    terrain.union(new Box3().setFromObject(o))
    const name = mats.length === 1 ? mats[0]!.name : ''
    if (bandStrict.test(name)) strict.push(o)
    else if (bandLoose.test(name)) loose.push(o)
    if (/_Ground_/.test(name)) ground.push(o)
  })
  if (terrain.isEmpty()) return []
  const walls = strict.length > 0 ? strict : loose
  const wallPaint = walls[0]?.material as Material | undefined
  const wall = wallUv(walls) ?? { du: 0.25, dv: -0.25, v0: 0 }
  const top = kind === 'cave'
    ? terrain.max.y + CAVE_HEADROOM
    : (Number.isFinite(ceil) ? ceil : terrain.max.y) + CEIL_GAP
  const x0 = terrain.min.x - BAND_OUT, x1 = terrain.max.x + BAND_OUT
  const z0 = terrain.min.z - BAND_OUT, z1 = terrain.max.z + BAND_OUT
  const y0 = terrain.min.y - BAND_SKIRT
  const v = (y: number): number => wall.v0 + wall.dv * y
  // 네 변 — 안쪽을 본다. 가로 UV는 둘레를 따라 이어 간다
  const band = { pos: [] as number[], uv: [] as number[], normal: [] as number[] }
  const edges: [number, number, number, number, number[]][] = [
    [x0, z0, x1, z0, [0, 0, 1]], [x1, z0, x1, z1, [-1, 0, 0]], [x1, z1, x0, z1, [0, 0, -1]], [x0, z1, x0, z0, [1, 0, 0]],
  ]
  let s = 0
  for (const [ax, az, bx, bz, n] of edges) {
    const len = Math.hypot(bx - ax, bz - az)
    const u0 = s * wall.du, u1 = (s + len) * wall.du
    quad(band, [[ax, y0, az], [bx, y0, bz], [bx, top, bz], [ax, top, az]], [[u0, v(y0)], [u1, v(y0)], [u1, v(top)], [u0, v(top)]], n)
    s += len
  }
  const out = [coverMesh(band, coverPaint(wallPaint, 1), '던전 둘레 벽 (1인칭)')]
  // 천장 — 아래를 본다
  let lid: { mesh: Mesh, d: number } | null = null
  if (kind === 'cave') {
    for (const m of ground) {
      const d = densityOf(m)
      if (d !== null && (!lid || d > lid.d)) lid = { mesh: m, d }
    }
  }
  const lidPaint = kind === 'cave' ? lid?.mesh.material as Material | undefined : wallPaint
  const k = lid?.d ?? wall.du
  const cap = { pos: [] as number[], uv: [] as number[], normal: [] as number[] }
  quad(cap, [[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]],
    [[x0 * k, z0 * k], [x1 * k, z0 * k], [x1 * k, z1 * k], [x0 * k, z1 * k]], [0, -1, 0])
  out.push(coverMesh(cap, coverPaint(lidPaint, kind === 'cave' ? CAVE_CEIL_SHADE : INDOOR_CEIL_SHADE), '던전 천장 (1인칭)'))
  return out
}

export function BdspDungeon({ name }: { name: string }) {
  const [scene, setScene] = useState<Group | null>(null)
  const [failed, setFailed] = useState(false)
  const fade = useRef<FieldFade | null>(null)
  const lights = useRef<BdspLights | null>(null)
  const tick = useRef(0)
  const cam = useRef(new Vector3())
  const aim = useRef(new Vector3())
  /** 원작 장치가 대신 그려서 숨긴 BDSP 장치(`hideDevices`)와 그때의 맵 — 한 던전을 이웃 맵이 같이 쓰므로 맵이 바뀌면 다시 고른다 */
  const devices = useRef<{ map: number, hidden: Mesh[] }>({ map: -1, hidden: [] })
  /** 1인칭에서만 보이는 것 — BDSP 천장(`isCeiling`)과 덮개(`dungeonCover`) */
  const firstOnly = useRef<readonly Mesh[]>([])
  useBdspMark(name, scene !== null, failed)
  useFrame(({ camera }, dt) => {
    // ⚠️ **눈이 실제로 어디 있나로 가른다** (`firstPersonView`) — 설정 값을 보면 컷신 동안 3인칭 카메라가 천장에 막힌다
    const first = firstPersonView()
    for (const c of firstOnly.current) c.visible = first
    if (!fade.current) return
    if (scene && devices.current.map !== world.mapId) {
      for (const m of devices.current.hidden) m.visible = true
      devices.current = { map: world.mapId, hidden: hideDevices(scene, world.mapId) }
    }
    // 목표는 세 프레임에 한 번, 따라가기는 매 프레임 (`fieldFade`)
    if ((tick.current++ % 3) === 0) {
      lights.current?.update(worldState.time.gameHour)
      const p = worldState.player.position
      camera.getWorldPosition(cam.current)
      aim.current.set(p.x, p.y + AIM, p.z)
      fade.current.aim(cam.current, aim.current, !first)
    }
    fade.current.step(dt)
  })
  useEffect(() => {
    let alive = true
    const provider = assets()
    const held: string[] = []
    let built: Group | null = null
    let release: (() => void)[] = []
    const load = async (): Promise<Group> => {
      const glb = await provider.bytes(`${ROOT}/${name}.glb`)
      const urls = new Map<string, string>()
      for (const uri of new Set(imageUris(glb))) {
        const path = `${ROOT}/${uri}`
        held.push(path)
        urls.set(uri, await provider.objectUrl(path))
      }
      const manager = new LoadingManager()
      manager.setURLModifier((u) => urls.get(u) ?? u)
      const gltf = await new GLTFLoader(manager).parseAsync(glb, '')
      return gltf.scene
    }
    load()
      .then((root) => {
        if (!alive) { disposeTree(root); return }
        built = root
        const ceilings = dressDungeon(root)
        paintFills(root)
        // 덮개는 원점에 선 채로 잰다 — `root` 안 좌표다. 흐림이 가리는 것으로 세지 않게 흐림 뒤에 붙인다
        const kind = coverKind(mapById(world.mapId))
        const cover = kind ? dungeonCover(root, kind) : []
        const origin = dungeonOrigin(name, world.grid?.meta ?? null)
        root.position.set(origin.x, DUNGEON_LIFT[name] ?? 0, origin.z)
        devices.current = { map: world.mapId, hidden: hideDevices(root, world.mapId) }
        liveWater(root)
        // ⚠️ **흐림이 먼저다** — `BdspField`와 같은 까닭이다
        fade.current = fieldFade(root)
        lights.current = bdspLights(root)
        lights.current.update(worldState.time.gameHour)
        for (const c of cover) root.add(c)
        root.updateMatrixWorld(true)
        firstOnly.current = [...ceilings, ...cover]
        for (const c of firstOnly.current) c.visible = firstPersonView()
        release = [holdBdspDoors(root), holdBdspSigns(root)]
        setScene(root)
      })
      .catch((e: unknown) => {
        console.error(`던전 ${name}을 못 세웠다`, e)
        if (alive) setFailed(true)
      })
      .finally(() => { for (const p of held) provider.releaseObjectUrl(p) })
    // ⚠️ **떼면 버린다** (`disposeTree`) — 나눠 쓰는 그림도 던전마다 새로 풀어 올리므로 그 벌은 이 던전 몫이다
    return () => {
      alive = false
      for (const r of release) r()
      if (built) disposeTree(built)
    }
  }, [name])
  return scene ? <primitive object={scene} /> : null
}
