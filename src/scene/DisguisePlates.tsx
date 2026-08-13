// 변장한 트레이너가 쓰고 있는 더미 (PARITY §1.15)
//
// 210·211·217·228번 도로의 닌자보이 열과 검은띠 하나가 눈·모래·바위·풀을 쓰고
// 숨어 있다. 지금까지는 그냥 사람이 길 한복판에 서 있었다 — 숨은 것이 아니라
// **없는 것**이었다.
//
// 원작은 사람을 32단위 땅 아래로 내리고 그 자리에 더미 모델을 그린다
// (`sub_0206A0BC` + `ov5_021F3D90`). 우리는 사람을 안 그리고 더미만 그린다.
//
// ⚠️ **더미 모델을 안 굽는다.** 넷 다 롬에서 꼭짓점 넷·삼각형 둘짜리 **한 칸
// 크기의 평면** 하나였다 (`fldeff.narc` 103~106). 높이 0.1875, 앞뒤 양면,
// 16×16 그림 한 장 — 그 값을 그대로 옮긴다. 껍데기를 새로 만들면 그건 우리
// 그림이지 원작이 아니다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute, DoubleSide, Group, Mesh, MeshBasicMaterial, NearestFilter,
  PlaneGeometry, SRGBColorSpace, Texture, TextureLoader,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import { disguiseOf } from '../engine/actor/ambient'
import { npcActors } from '../engine/actor/npcs'
import { assets, onProviderSwap } from '../data/providers/assetProvider'
import { worldState } from '../state/worldState'
import { world } from '../engine/map/world'
import { groundYAt } from './distortion'

/** 한 맵에 있는 변장 트레이너는 많아야 셋이다. 넉넉하게 둔다 */
const MAX = 8
/** 그리는 거리(타일). 사람과 같다 */
const RANGE = 48
/** 더미 넷이 가로로 이어 붙어 있다 — 눈 · 모래 · 바위 · 풀 */
const PROPS = 4
/** 롬에서 잰 평면의 높이. 땅에 딱 붙이면 z-파이팅이 난다 */
const PLATE_Y = 0.1875

const loader = new TextureLoader()
let sheet: Texture | null = null

onProviderSwap(() => { sheet?.dispose(); sheet = null })

function plateTexture(): Texture {
  if (sheet !== null) return sheet
  const tex = new Texture()
  const path = 'data/npc/disguise.png'
  const provider = assets()
  void provider.objectUrl(path)
    .then((url) => loader.loadAsync(url).finally(() => { provider.releaseObjectUrl(path) }))
    .then((loaded) => {
      tex.image = loaded.image as TexImageSource
      tex.needsUpdate = true
    })
    .catch(() => { /* 그림이 없으면 빈 판으로 선다 */ })
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = SRGBColorSpace
  sheet = tex
  return tex
}

interface Slot {
  mesh: Mesh
  uv: BufferAttribute
  /** 지금 물려 있는 더미 번호. 안 바뀌었으면 UV를 다시 안 쓴다 */
  prop: number
}

function makeSlot(material: MeshBasicMaterial): Slot {
  // 바닥에 눕는다. `PlaneGeometry`는 xy 평면이라 x축으로 눕혀야 xz가 된다
  const geometry = new PlaneGeometry(1, 1)
  geometry.rotateX(-Math.PI / 2)
  const mesh = new Mesh(geometry, material)
  mesh.visible = false
  mesh.frustumCulled = false
  return { mesh, uv: geometry.getAttribute('uv') as BufferAttribute, prop: -1 }
}

/** 한 줄 아틀라스에서 `prop`번째 칸만 보이게 UV를 옮긴다 */
function setProp(slot: Slot, prop: number): void {
  const span = 1 / PROPS
  const x0 = prop * span
  const x1 = x0 + span
  const uv = slot.uv
  uv.setXY(0, x0, 1); uv.setXY(1, x1, 1)
  uv.setXY(2, x0, 0); uv.setXY(3, x1, 0)
  uv.needsUpdate = true
  slot.prop = prop
}

export function DisguisePlates({ grid, layer }: { grid: MapGrid; layer: number }) {
  const groupRef = useRef<Group>(null)
  const material = useMemo(() => new MeshBasicMaterial({
    map: plateTexture(),
    transparent: true,
    alphaTest: 0.5,
    side: DoubleSide,
    depthWrite: true,
  }), [])
  const slots = useMemo(() => Array.from({ length: MAX }, () => makeSlot(material)), [material])

  useEffect(() => {
    const group = groupRef.current
    if (group === null) return
    for (const s of slots) group.add(s.mesh)
    return () => {
      for (const s of slots) {
        group.remove(s.mesh)
        s.mesh.geometry.dispose()
      }
      material.dispose()
    }
  }, [slots, material])

  useFrame(() => {
    const p = worldState.player.position
    let n = 0
    for (const actor of npcActors.list) {
      if (n >= MAX) break
      if (!actor.visible) continue
      const prop = disguiseOf(actor)
      if (prop === null) continue
      if (Math.abs(actor.x - p.x) > RANGE) continue
      if (Math.abs(actor.z - p.z) > RANGE) continue

      const slot = slots[n]
      if (slot === undefined) break
      n++
      if (slot.prop !== prop) setProp(slot, prop)
      const y = groundYAt(grid, world.mapId, actor.x + 0.5, actor.z + 0.5, layer, actor.y)
      slot.mesh.position.set(actor.x + 0.5, y + PLATE_Y, actor.z + 0.5)
      slot.mesh.visible = true
    }
    for (let i = n; i < slots.length; i++) {
      const s = slots[i]
      if (s !== undefined) s.mesh.visible = false
    }
  })

  return <group ref={groupRef} />
}
