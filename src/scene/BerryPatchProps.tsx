// 나무열매 밭 (PARITY §4.6)
//
// 밭 하나는 **두 층**이다. 흙은 3D 모델이고(`fldeff.narc` 17번) 그 위에 자란
// 것은 판때기다(`mmodel.narc`의 열매별 텍스처). 원작도 이 둘을 따로 세운다 —
// 흙은 `BerryPatchManager_Init3DRendering`, 자란 것은 `BerryPatchGraphics`다.
//
// ⚠️ **자란 것의 그림 번호는 산술이다.** 싹이 4096이고 그 뒤로 열매마다
// 자람·꽃·열림 셋씩이다 (`BerryPatchGraphics_GetGraphicsResourceID`).
// 심은 단계(PLANTED)와 빈 흙에는 아무것도 안 선다 — 흙만 보인다.
//
// ⚠️ **화면에 들었는지도 여기서 잰다.** 그게 곧 「이 밭이 자라기 시작하는가」다
// (`BerryPatches_UpdateGrowthStates`). 그리는 자리와 재는 자리가 원작에서도
// 같은 절두체를 본다.
//
// ⚠️ **1인칭에서는 판을 옅게, 매끈하게 그린다** (I-p02-4). 원작도 판때기라 판 자체는 그대로 둔다. 다만 원작은 DS 화면에서
// 위로 내려다본 그림이라, 1인칭으로 바싹 붙으면 텍셀 하나가 손바닥만 한 픽셀이 되어 화면 절반을 덮었다. 그때만 선형 필터 ·
// 밉맵 쌍(`npcTextureSmooth`)으로 바꾸고 눈에서 1.5칸 안이면 알파를 거리로 줄인다(`nearPlateAlpha`).
//
// ⚠️ **BDSP 형상에 덮인 밭은 판도 흙도 안 그린다** (I-p18-3 · `BDSP_COVERED`). 밭 자체(심기 · 자람 · 말 걸기)는 그대로 돈다.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute, DoubleSide, Frustum, Matrix4, Mesh, MeshBasicMaterial,
  PlaneGeometry, Sphere, Vector3, type Group, type Material,
} from 'three'
import { npcSprite, TEXELS_PER_TILE } from '../engine/actor/sprites'
import { npcActors } from '../engine/actor/npcs'
import { BERRY_STAGE } from '../engine/world/berryPatches'
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
import { npcTexture, npcTextureSmooth } from './npcTexture'
import { firstPersonView } from '../engine/actor/camera'
import { bdspReady, bdspVersion, subscribeBdsp } from './bdspReady'
import { hideRest } from './billboard'
import { sceneShade } from './NpcSprites'
import { propMaterials } from './propMeshes'

/** 흙 모델의 소품 번호 (`distortionProps`의 28번 = `fldeff.narc` 17) */
const SOIL_KIND = 28

/** `OBJ_EVENT_GFX_BERRY_SPROUT`. 싹 하나고 그 뒤로 열매마다 셋씩이다 */
const BERRY_GFX_SPROUT = 4096

/**
 * 한 맵에 세우는 판때기 상한.
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
 * 판의 알파 컷. 원작 열매 그림은 알파가 0 아니면 1이라(실측 `data/npc` 4096번부터 193장 — 알파 값이 0과 255 둘뿐이다)
 * 반이면 도트 텍스처에서 윤곽이 그대로다.
 *
 * ⚠️ **옅게 할 때는 컷도 같은 비율로 내린다.** three는 알파에 불투명도를 곱한 **뒤에** 컷과 견준다(`NodeMaterial`의
 * `setupDiffuseColor`) — 컷을 0.5에 두고 불투명도를 반 밑으로 내리면 판이 옅어지는 게 아니라 통째로 사라진다
 */
const ALPHA_TEST = 0.5

/**
 * 1인칭에서 판이 옅어지기 시작하는 거리와 다 사라지는 거리 (칸, 눈에서 판 밑동까지 땅 위 곧은 거리).
 *
 * ⚠️ **우리가 정한 값이다** — 원작에 1인칭이 없다. 밭은 막힌 칸이라(행동 0xA0) 붙어 서도 한 칸 떨어진다. 눈이 몸보다
 * 0.12칸 앞이라(`camera`의 `EYE_FORWARD`) 마주 선 밭까지가 0.88칸이고, 그때 알파가 0.38이다 — 무엇이 자랐는지는 읽히고
 * 화면을 덮지는 않는다
 */
const FADE_FAR = 1.5
const FADE_NEAR = 0.5

/** 1인칭에서 판의 알파 — 눈에서 판까지(dx, dz) `FADE_NEAR` 안이면 0, `FADE_FAR` 밖이면 1, 그 사이는 곧게 */
export function nearPlateAlpha(dx: number, dz: number): number {
  const d = Math.hypot(dx, dz)
  return Math.min(1, Math.max(0, (d - FADE_NEAR) / (FADE_FAR - FADE_NEAR)))
}

/**
 * BDSP 형상에 덮인 밭 칸과 그 칸을 그리는 BDSP 지역 (I-p18-3).
 *
 * 실측(밭 118곳 · 칸 한가운데에서 위로부터 쏜 곧은 선 · 그 칸을 상자에 담는 지역 glb 전부 — `BerryPatchProps.test`): **114곳은
 * BDSP가 같은 칸에 흙(`M_C_001_SeedSoil_01`)을 구워 두었다** — 원작 땅 높이 위 0.06~0.15칸이라 그 위에 판이 그대로 선다.
 * 나머지 넷이 다 리조트(맵 457)다. 원작은 별장 터를 두 칸 높여(원작 땅 y 3 · x 816~829) 문(822,469) 양옆에 밭을 둘씩
 * 두었는데, BDSP 지역(`area014`)에는 그 터도 별장도 없다 — 땅이 y 1이고 별장 문 자리가 못(`Pond_01`)이다. 그래서 판이 BDSP 땅보다
 * 두 칸 떠서 집 · 나무 속에 섰다.
 *
 *   · 816,469 · 817,469 — 집(`M_D_014_House_01`, 815.1~818.9 × 467.0~470.0) 안. 지붕이 4.5칸 높이다
 *   · 827,469 — 못 둑. 칸의 서쪽 2/5가 못 바닥(y 0)이다
 *   · 828,469 — 나무(`M_C_001_Tree_05`) 밑동. 칸을 5×5로 쏘면 21곳이 2.4~3.8칸 높이의 잎에 걸린다 — 원작 땅(3)이 잎 속이다
 *
 * 그래서 그 지역이 **서서 그려지는 동안만**(`bdspReady`) 판과 흙을 빼고, 원작 그림이 서는 동안(받는 중 · 실패)은 그대로 둔다.
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

/**
 * 그 밭에 설 그림 번호 (`BerryPatchGraphics_GetGraphicsResourceID`).
 *
 * 빈 흙과 **심은 직후**에는 아무것도 안 선다 — 원작이 둘 다 0xffff를 준다
 */
function berryStageGfx(berryID: number, growthStage: number): number | null {
  if (berryID === 0) return null
  if (growthStage === BERRY_STAGE.sprouted) return BERRY_GFX_SPROUT
  const at = growthStage === BERRY_STAGE.growing ? 1
    : growthStage === BERRY_STAGE.blooming ? 2
      : growthStage === BERRY_STAGE.fruit ? 3 : 0
  if (at === 0) return null
  return BERRY_GFX_SPROUT + (berryID - 1) * 3 + at
}

interface Slot {
  mesh: Mesh
  material: MeshBasicMaterial
  uv: BufferAttribute
  gfx: number
  /** 지금 매끈한 쌍(`npcTextureSmooth`)을 쥐었나 */
  smooth: boolean
}

function makeSlot(): Slot {
  // 원점을 아래 모서리에 둔다 — 자란 것의 밑동이 흙에 닿아야 한다
  const geometry = new PlaneGeometry(1, 1)
  geometry.translate(0, 0.5, 0)
  const material = new MeshBasicMaterial({
    transparent: true, alphaTest: ALPHA_TEST, side: DoubleSide, depthWrite: true,
  })
  const mesh = new Mesh(geometry, material)
  mesh.visible = false
  mesh.frustumCulled = false
  return { mesh, material, uv: geometry.getAttribute('uv') as BufferAttribute, gfx: -1, smooth: false }
}

const viewProj = new Matrix4()
const frustum = new Frustum()
const sphere = new Sphere()
const spot = new Vector3()

interface Soil { mesh: ChunkMesh; materials: Material[]; offset: readonly number[] }

export function BerryPatchProps({ grid, layer }: { grid: MapGrid; layer: number }) {
  const camera = useThree((s) => s.camera)
  const mapId = world.mapId
  const patches = useSaveStore((s) => s.berryPatches)
  const slots = useMemo(() => Array.from({ length: MAX_PATCHES }, makeSlot), [])
  const [soil, setSoil] = useState<Soil | null>(null)
  const groupRef = useRef<Group>(null)
  // BDSP 지역이 서고 떨어질 때마다 다시 그린다 — 흙이 `bdspCovers`를 읽는다
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

    // 빛을 안 받는 재질이라 밤·동굴에서 혼자 환하다. 사람 판때기와 같은 밝기를 곱한다
    const shade = sceneShade(groupRef.current)
    // 설정이 아니라 지금 렌즈를 본다 — 컷신 동안은 1인칭 설정이어도 3인칭 렌즈다
    const first = firstPersonView()
    let n = 0
    for (const place of places) {
      const patch = patches[place.patch]
      if (!patch) continue
      if (bdspCovers(place.x, place.z)) continue
      const gfx = berryStageGfx(patch.berryID, patch.growthStage)
      if (gfx === null) continue
      const sprite = npcSprite(gfx)
      if (sprite === null) continue
      const slot = slots[n]
      if (slot === undefined) break
      n++

      if (slot.gfx !== gfx || slot.smooth !== first) {
        slot.material.map = first ? npcTextureSmooth(gfx) : npcTexture(gfx)
        slot.material.needsUpdate = true
        slot.smooth = first
      }
      if (slot.gfx !== gfx) {
        slot.gfx = gfx
        // 아틀라스의 첫 장만 쓴다. 흔들리는 연출은 원작에도 없다
        const span = 1 / sprite.frames
        slot.uv.setXY(0, 0, 1); slot.uv.setXY(1, span, 1)
        slot.uv.setXY(2, 0, 0); slot.uv.setXY(3, span, 0)
        slot.uv.needsUpdate = true
      }
      const y = groundYAt(grid, mapId, place.x + 0.5, place.z + 0.5, layer, 0)
      slot.mesh.position.set(place.x + 0.5, y, place.z + 0.5)
      slot.mesh.scale.set(sprite.w / TEXELS_PER_TILE, sprite.h / TEXELS_PER_TILE, 1)
      slot.mesh.rotation.set(0, Math.atan2(
        camera.position.x - slot.mesh.position.x,
        camera.position.z - slot.mesh.position.z,
      ), 0)
      slot.material.color.setScalar(shade)
      const alpha = first
        ? nearPlateAlpha(camera.position.x - slot.mesh.position.x, camera.position.z - slot.mesh.position.z)
        : 1
      slot.material.opacity = alpha
      // 컷이 0이 되면 컷 자체가 꺼져 셰이더를 다시 굽는다 — 그 전에 판을 내린다
      slot.material.alphaTest = ALPHA_TEST * Math.max(alpha, 0.01)
      slot.mesh.visible = alpha > 0
    }
    hideRest(slots, n)
  })

  if (places.length === 0) return null
  return (
    <group ref={groupRef}>
      {soil !== null && places.filter((place) => !bdspCovers(place.x, place.z)).map((place) => (
        <mesh
          key={place.patch}
          geometry={soil.mesh.geometry}
          material={soil.materials}
          position={[
            place.x + 0.5 + (soil.offset[0] ?? 0),
            groundYAt(grid, mapId, place.x + 0.5, place.z + 0.5, layer, 0) + (soil.offset[1] ?? 0),
            place.z + 0.5 + (soil.offset[2] ?? 0),
          ]}
        />
      ))}
      {slots.map((slot, i) => <primitive key={i} object={slot.mesh} />)}
    </group>
  )
}
