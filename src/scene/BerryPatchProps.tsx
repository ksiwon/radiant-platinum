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
import { useEffect, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute, DoubleSide, FrontSide, Frustum, Matrix4, Mesh, MeshBasicMaterial, NearestFilter,
  PlaneGeometry, Sphere, SRGBColorSpace, Texture, TextureLoader, Vector3, type Material,
} from 'three'
import { assets, onProviderSwap } from '../data/providers/assetProvider'
import { npcSprite, TEXELS_PER_TILE } from '../engine/actor/sprites'
import { npcActors } from '../engine/actor/npcs'
import { BERRY_STAGE } from '../engine/world/berryPatches'
import { useSaveStore } from '../state/saveStore'
import { berryPatchObjects, berryView } from './berryPatches'
import {
  loadDistortionPropMesh, loadDistortionPropOffsets, loadDistortionPropSheet, sliceTexture,
  type ChunkMesh, type TexSheet,
} from './chunkMesh'
import { groundYAt } from './distortion'
import { world } from '../engine/map/world'
import type { MapGrid } from '../engine/map/grid'

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
 * 그 밭에 설 그림 번호 (`BerryPatchGraphics_GetGraphicsResourceID`).
 *
 * 빈 흙과 **심은 직후**에는 아무것도 안 선다 — 원작이 둘 다 0xffff를 준다
 */
export function berryStageGfx(berryID: number, growthStage: number): number | null {
  if (berryID === 0) return null
  if (growthStage === BERRY_STAGE.sprouted) return BERRY_GFX_SPROUT
  const at = growthStage === BERRY_STAGE.growing ? 1
    : growthStage === BERRY_STAGE.blooming ? 2
      : growthStage === BERRY_STAGE.fruit ? 3 : 0
  if (at === 0) return null
  return BERRY_GFX_SPROUT + (berryID - 1) * 3 + at
}

const loader = new TextureLoader()
const textures = new Map<number, Texture>()

onProviderSwap(() => {
  for (const tex of textures.values()) tex.dispose()
  textures.clear()
})

/** `NpcSprites`의 것과 같은 식이다 — 빈 판을 먼저 주고 그림이 오면 채운다 */
function textureFor(gfx: number): Texture {
  const had = textures.get(gfx)
  if (had !== undefined) return had
  const tex = new Texture()
  const path = `data/npc/${String(gfx)}.png`
  const provider = assets()
  void provider.objectUrl(path)
    .then((url) => loader.loadAsync(url).finally(() => { provider.releaseObjectUrl(path) }))
    .then((got) => { tex.image = got.image as TexImageSource; tex.needsUpdate = true })
    .catch(() => { /* 그림이 없으면 흙만 보인다 */ })
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = SRGBColorSpace
  textures.set(gfx, tex)
  return tex
}

interface Slot {
  mesh: Mesh
  material: MeshBasicMaterial
  uv: BufferAttribute
  gfx: number
}

function makeSlot(): Slot {
  // 원점을 아래 모서리에 둔다 — 자란 것의 밑동이 흙에 닿아야 한다
  const geometry = new PlaneGeometry(1, 1)
  geometry.translate(0, 0.5, 0)
  const material = new MeshBasicMaterial({
    transparent: true, alphaTest: 0.5, side: DoubleSide, depthWrite: true,
  })
  const mesh = new Mesh(geometry, material)
  mesh.visible = false
  mesh.frustumCulled = false
  return { mesh, material, uv: geometry.getAttribute('uv') as BufferAttribute, gfx: -1 }
}

function materialsOf(mesh: ChunkMesh, sheet: TexSheet | null): Material[] {
  const cache = new Map<string, Material>()
  return mesh.materials.map((spec) => {
    const key = `${spec.tex ?? ''}/${spec.pal ?? ''}/${String(spec.rep)}/${String(spec.a)}/${String(spec.f)}`
    const hit = cache.get(key)
    if (hit) return hit
    const item = sheet?.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
    const translucent = spec.a < 31
    const made = new MeshBasicMaterial({
      map: item && sheet ? sliceTexture(sheet, item, spec.rep) : null,
      vertexColors: true,
      alphaTest: translucent ? 0 : 0.5,
      transparent: translucent,
      opacity: translucent ? spec.a / 31 : 1,
      depthWrite: !translucent,
      side: spec.f === 3 ? DoubleSide : FrontSide,
    })
    cache.set(key, made)
    return made
  })
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
        setSoil({ mesh, materials: materialsOf(mesh, sheet), offset: offsets[SOIL_KIND] ?? [0, 0, 0] })
      })
      .catch(() => { /* 흙이 없으면 자란 것만 선다 */ })
    return () => { alive = false }
  }, [places.length])

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

    let n = 0
    for (const place of places) {
      const patch = patches[place.patch]
      if (!patch) continue
      const gfx = berryStageGfx(patch.berryID, patch.growthStage)
      if (gfx === null) continue
      const sprite = npcSprite(gfx)
      if (sprite === null) continue
      const slot = slots[n]
      if (slot === undefined) break
      n++

      if (slot.gfx !== gfx) {
        slot.material.map = textureFor(gfx)
        slot.material.needsUpdate = true
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
      slot.mesh.visible = true
    }
    for (let i = n; i < slots.length; i++) {
      const s = slots[i]
      if (s !== undefined) s.mesh.visible = false
    }
  })

  if (places.length === 0) return null
  return (
    <group>
      {soil !== null && places.map((place) => (
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
