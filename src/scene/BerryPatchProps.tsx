// 나무열매 밭 (PARITY §4.6)
//
// 밭 하나는 **두 층**이다. 흙은 3D 모델이고(`fldeff.narc` 17번) 그 위에 자란 것은 BDSP의 나무 모델이다
// (`models/berry/kinoNNN.glb` — `Environments/gimmick/kino001~064`, docs/orders/BATTLE_FX_20261004.md §2).
// 원작(DS)은 자란 것을 판때기로 그렸지만 판은 카메라를 보는 한 장이라 옆에서 돌아보면 종잇장이었다.
// 흙은 `BerryPatchManager_Init3DRendering`, 자란 것은 `BerryPatchGraphics`가 따로 세운다.
//
// ⚠️ **성장 단계 ↔ 모델 묶음은 우리가 맺었다.** 원작 그림 번호는 산술이다 — 싹이 4096이고 그 뒤로 열매마다
// 자람·꽃·열림 셋씩이다 (`BerryPatchGraphics_GetGraphicsResourceID`). BDSP 한 벌은 `Miki`(줄기 · 잎) · `Hana`(꽃) ·
// `Mi`(열매) 세 노드라 차례대로 자람 · 꽃 · 열림에 잇고, 싹은 열매와 상관없는 `kinoseeding`이다.
// 심은 단계(PLANTED)와 빈 흙에는 아무것도 안 선다 — 흙만 보인다 (원작이 둘 다 0xffff를 준다).
// 열매 번호는 `KinomiData`의 `TagNo`와 같아 `kino` + 세 자리 번호다 (`engine/world/berryPlants`).
//
// ⚠️ **크기는 모델 그대로다** — BDSP 1단위가 우리 한 칸(1m)이고 지역 glb도 곱 없이 놓는다. 밑동은 밭 칸 한가운데 땅 위다.
// 재질은 지역 소품과 같은 빛 받는 재질이라(glb의 표준 재질) 밤 · 동굴의 밝기를 장면의 빛이 정한다.
//
// ⚠️ **화면에 들었는지도 여기서 잰다.** 그게 곧 「이 밭이 자라기 시작하는가」다
// (`BerryPatches_UpdateGrowthStates`). 그리는 자리와 재는 자리가 원작에서도
// 같은 절두체를 본다.
//
// ⚠️ **BDSP 형상에 덮인 밭은 나무도 흙도 안 그린다** (I-p18-3 · `BDSP_COVERED`). 밭 자체(심기 · 자람 · 말 걸기)는 그대로 돈다.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Frustum, Matrix4, Mesh, Sphere, Vector3, type Group, type Material, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { npcActors } from '../engine/actor/npcs'
import { BERRY_STAGE } from '../engine/world/berryPatches'
import {
  BERRY_BLOOMING, BERRY_FRUIT, BERRY_GROWING, BERRY_SEEDING, berryPlantName,
} from '../engine/world/berryPlants'
import { assets } from '../data/providers/assetProvider'
import { useSaveStore } from '../state/saveStore'
import { berryPatchObjects, berryView } from './berryPatches'
import {
  dropMaterial,
  loadDistortionPropMesh, loadDistortionPropOffsets, loadDistortionPropSheet,
  type ChunkMesh,
} from './chunkMesh'
import { groundYAt } from './distortion'
import { world } from '../engine/map/world'
import type { MapGrid } from '../engine/map/grid'
import { bdspReady, bdspVersion, subscribeBdsp } from './bdspReady'
import { propMaterials } from './propMeshes'

/** 흙 모델의 소품 번호 (`distortionProps`의 28번 = `fldeff.narc` 17) */
const SOIL_KIND = 28

/**
 * 한 맵에 세우는 밭 상한.
 *
 * 실측으로 밭 118곳이 맵 서른 곳에 **넷씩**(한 곳만 둘) 흩어져 있다. 갑절을
 * 두는 것은 여유다 — 넘칠 일이 없어야 자란 것이 조용히 안 서는 일이 없다
 */
const MAX_PATCHES = 8

/**
 * 밭 하나를 감싸는 공의 반지름, 타일 단위.
 *
 * ⚠️ **우리가 정한 값이다.** 원작은 흙 모델의 상자로 재는데
 * (`GFXBoxTest_IsModelInView`) 그 상자를 여기까지 들고 오지 않았다. 밭이 한
 * 칸을 채우므로 반 칸이면 칸 밖으로 안 넘친다
 */
const VIEW_RADIUS = 0.5

/**
 * BDSP 형상에 덮인 밭 칸과 그 칸을 그리는 BDSP 지역 (I-p18-3).
 *
 * 실측(밭 118곳 · 칸 한가운데에서 위로부터 쏜 곧은 선 · 그 칸을 상자에 담는 지역 glb 전부 — `BerryPatchProps.test`): **114곳은
 * BDSP가 같은 칸에 흙(`M_C_001_SeedSoil_01`)을 구워 두었다** — 원작 땅 높이 위 0.06~0.15칸이라 그 위에 나무가 그대로 선다.
 * 나머지 넷이 다 리조트(맵 457)다. 원작은 별장 터를 두 칸 높여(원작 땅 y 3 · x 816~829) 문(822,469) 양옆에 밭을 둘씩
 * 두었는데, BDSP 지역(`area014`)에는 그 터도 별장도 없다 — 땅이 y 1이고 별장 문 자리가 못(`Pond_01`)이다. 그래서 나무가 BDSP 땅보다
 * 두 칸 떠서 집 · 나무 속에 섰다.
 *
 *   · 816,469 · 817,469 — 집(`M_D_014_House_01`, 815.1~818.9 × 467.0~470.0) 안. 지붕이 4.5칸 높이다
 *   · 827,469 — 못 둑. 칸의 서쪽 2/5가 못 바닥(y 0)이다
 *   · 828,469 — 나무(`M_C_001_Tree_05`) 밑동. 칸을 5×5로 쏘면 21곳이 2.4~3.8칸 높이의 잎에 걸린다 — 원작 땅(3)이 잎 속이다
 *
 * 그래서 그 지역이 **서서 그려지는 동안만**(`bdspReady`) 나무와 흙을 빼고, 원작 그림이 서는 동안(받는 중 · 실패)은 그대로 둔다.
 * 원작 칸의 행동(0xA0)과 밭 객체는 손대지 않는다 — 심고 · 물 주고 · 거두는 것은 그대로 된다
 */
export const BDSP_COVERED: readonly { x: number, z: number, field: string }[] = [
  { x: 816, z: 469, field: 'area014' },
  { x: 817, z: 469, field: 'area014' },
  { x: 827, z: 469, field: 'area014' },
  { x: 828, z: 469, field: 'area014' },
]

/** 이 밭 칸(x, z)이 지금 BDSP 형상에 덮였는가 — 덮는 지역이 서서 그려질 때만 참이다 */
export function bdspCovers(x: number, z: number, ready: (key: string) => boolean = bdspReady): boolean {
  return BDSP_COVERED.some((c) => c.x === x && c.z === z && ready(c.field))
}

/** 그 밭에 설 모델 — 파일 이름과 켤 묶음. 묶음이 null이면 한 벌 통째로(싹) */
interface BerryPlantPick { file: string, node: string | null }

/**
 * 열매 번호와 성장 단계로 설 모델을 고른다.
 *
 * 빈 흙과 **심은 직후**에는 아무것도 안 선다 — 원작이 둘 다 0xffff를 준다
 * (`BerryPatchGraphics_GetGraphicsResourceID`)
 */
export function berryPlantFor(berryID: number, growthStage: number): BerryPlantPick | null {
  if (berryID === 0) return null
  if (growthStage === BERRY_STAGE.sprouted) return { file: BERRY_SEEDING, node: null }
  const file = berryPlantName(berryID)
  if (file === null) return null
  if (growthStage === BERRY_STAGE.growing) return { file, node: BERRY_GROWING }
  if (growthStage === BERRY_STAGE.blooming) return { file, node: BERRY_BLOOMING }
  if (growthStage === BERRY_STAGE.fruit) return { file, node: BERRY_FRUIT }
  return null
}

// ── 나무 모델 ───────────────────────────────────────────────────────────────────────────────────────────────────────

const loader = new GLTFLoader()
/**
 * 받은 모델 틀. 열매 예순넷에 싹 하나라 다 받아도 18.5MB(구운 크기)다 — 그래서 놓지 않는다.
 * 밭마다 `clone`으로 세우고 지오메트리 · 재질 · 그림은 이 틀과 나눠 쓴다
 */
const templates = new Map<string, Promise<Group | null>>()

function loadPlant(file: string): Promise<Group | null> {
  let hit = templates.get(file)
  if (hit === undefined) {
    const path = `models/berry/${file}.glb`
    const provider = assets()
    hit = provider.objectUrl(path)
      .then((url) => loader.loadAsync(url).finally(() => { provider.releaseObjectUrl(path) }))
      .then((gltf) => {
        gltf.scene.traverse((o: Object3D) => {
          if (!(o instanceof Mesh)) return
          o.castShadow = true
          o.receiveShadow = true
        })
        return gltf.scene
      })
      // 못 받으면 흙만 선다. 다음에 다시 시도하도록 틀을 비운다
      .catch(() => { templates.delete(file); return null })
    templates.set(file, hit)
  }
  return hit
}

/** 묶음 노드만 켠다 — 한 벌의 나머지 단계는 숨긴다. `node`가 null이면 다 켠다 (싹) */
export function showStage(root: Object3D, node: string | null): void {
  for (const child of root.children) child.visible = node === null || child.name === node
}

function BerryPlant({ pick, x, y, z }: { pick: BerryPlantPick, x: number, y: number, z: number }) {
  const [object, setObject] = useState<Object3D | null>(null)
  useEffect(() => {
    let alive = true
    void loadPlant(pick.file).then((tpl) => {
      if (!alive || tpl === null) return
      setObject(tpl.clone())
    })
    return () => { alive = false; setObject(null) }
  }, [pick.file])
  useEffect(() => {
    if (object !== null) showStage(object, pick.node)
  }, [object, pick.node])
  if (object === null) return null
  return <primitive object={object} position={[x, y, z]} />
}

interface Soil { mesh: ChunkMesh; materials: Material[]; offset: readonly number[] }

const viewProj = new Matrix4()
const frustum = new Frustum()
const sphere = new Sphere()
const spot = new Vector3()

/**
 * `bdspSoil` — BDSP 지역이 서서 그려지는 중이다. 그 땅에는 BDSP가 흙(`M_C_001_SeedSoil_01`)을 구워 두었으므로 원작 흙 소품을
 * 안 얹는다. 얹으면 원작 흙에 붙은 그림자 원판(`kage`)이 BDSP 흙 위에 회색 원판으로 떴다
 */
export function BerryPatchProps({ grid, layer, bdspSoil }: { grid: MapGrid; layer: number; bdspSoil: boolean }) {
  const camera = useThree((s) => s.camera)
  const mapId = world.mapId
  const patches = useSaveStore((s) => s.berryPatches)
  const [soil, setSoil] = useState<Soil | null>(null)
  const groupRef = useRef<Group>(null)
  // BDSP 지역이 서고 떨어질 때마다 다시 그린다 — 흙 · 나무가 `bdspCovers`를 읽는다
  useSyncExternalStore(subscribeBdsp, bdspVersion)

  /**
   * 이 맵의 밭 자리. 맵이 바뀔 때만 다시 훑는다.
   *
   * ⚠️ **배우 목록이 아직 앞 맵의 것일 수 있다** (`npcActors.mapId`). 그때
   * 자리를 잡으면 앞 맵의 밭이 이 맵 좌표에 선다
   */
  const places = useMemo(() => (
    npcActors.mapId === mapId ? berryPatchObjects().slice(0, MAX_PATCHES) : []
  ), [mapId])

  useEffect(() => {
    if (places.length === 0) return
    let alive = true
    void Promise.all([
      loadDistortionPropMesh(SOIL_KIND),
      loadDistortionPropSheet(SOIL_KIND),
      loadDistortionPropOffsets(),
    ])
      .then(([mesh, sheet, offsets]) => {
        if (!alive) return
        setSoil({ mesh, materials: propMaterials(mesh, sheet), offset: offsets[SOIL_KIND] ?? [0, 0, 0] })
      })
      .catch(() => { /* 흙이 없으면 자란 것만 선다 */ })
    return () => { alive = false }
  }, [places.length])

  /**
   * 흙 재질과 그 그림을 놓는다.
   *
   * ⚠️ **놓는 자가 없었다** — 맵이 바뀔 때마다 `propMaterials`가 새로 굽는데
   * 앞엣것이 그대로 남았다 (`useLoadedProps`와 같은 자리다). **그린 다음에**
   * 버린다
   */
  const shownSoil = useRef<Soil | null>(null)
  useEffect(() => {
    const old = shownSoil.current
    shownSoil.current = soil
    if (old !== null && old !== soil) for (const m of old.materials) dropMaterial(m)
  }, [soil])
  useEffect(() => () => {
    if (shownSoil.current !== null) for (const m of shownSoil.current.materials) dropMaterial(m)
  }, [])

  useEffect(() => () => { berryView.inView = null }, [])

  useFrame(() => {
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(viewProj)
    // 걸음마다 이걸 묻는 쪽은 `stepSystem`이다 — 여기서는 절두체만 갈아 끼운다
    berryView.inView = (x, z) => {
      spot.set(x, grid.heightAtWorld(x, z) ?? 0, z)
      sphere.set(spot, VIEW_RADIUS)
      return frustum.intersectsSphere(sphere)
    }
  })

  if (places.length === 0) return null
  return (
    <group ref={groupRef}>
      {places.filter((place) => !bdspCovers(place.x, place.z)).map((place) => {
        const y = groundYAt(grid, mapId, place.x + 0.5, place.z + 0.5, layer, 0)
        const patch = patches[place.patch]
        const pick = patch ? berryPlantFor(patch.berryID, patch.growthStage) : null
        return (
          <group key={place.patch}>
            {soil !== null && !bdspSoil && (
              <mesh
                geometry={soil.mesh.geometry}
                material={soil.materials}
                position={[
                  place.x + 0.5 + (soil.offset[0] ?? 0),
                  y + (soil.offset[1] ?? 0),
                  place.z + 0.5 + (soil.offset[2] ?? 0),
                ]}
              />
            )}
            {pick !== null && <BerryPlant pick={pick} x={place.x + 0.5} y={y} z={place.z + 0.5} />}
          </group>
        )
      })}
    </group>
  )
}
