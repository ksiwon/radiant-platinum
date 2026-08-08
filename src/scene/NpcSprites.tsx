// 오버월드 NPC — 원작 그림을 그대로 세운다 (DATA.md §2.16)
//
// 원작이 판때기에 텍스처를 갈아 끼우는 방식이라 우리도 그렇게 한다. 3D 모델을
// 새로 만들면 그건 우리 그림이지 원작이 아니다.
//
// 인스턴싱을 안 쓰는 이유: 사람마다 **텍스처가 다르고 장도 따로 논다.** 인스턴스
// 하나하나에 다른 텍스처를 물리려면 아틀라스를 통째로 합치고 셰이더를 따로
// 써야 하는데, 한 맵에 서 있는 사람은 많아야 수십이라 그럴 값어치가 없다.
// 대신 판때기와 재질은 **한 번 만들어 돌려 쓴다** — 프레임마다 만들면 GC가 돈다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute, DoubleSide, Group, Mesh, MeshBasicMaterial, NearestFilter,
  PlaneGeometry, SRGBColorSpace, Texture, TextureLoader,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import { npcActors, type NpcActor } from '../engine/actor/npcs'
import {
  artDir, cameraQuadrant, frameOf, npcSprite, TEXELS_PER_TILE, type NpcSprite,
} from '../engine/actor/sprites'
import { dataUrl } from '../data/assetBase'
import { worldState } from '../state/worldState'

/** 한 맵에 동시에 세우는 최대 인원. 넘치는 사람은 안 그린다 */
const MAX = 64
/** 그리는 거리(타일) */
const RANGE = 48
/**
 * 걸음 한 칸에 도는 틱.
 *
 * 원작 판때기는 프레임마다 한 틱씩 나아간다(60Hz). 우리는 초 단위로 재므로
 * 같은 속도가 되도록 60을 곱한다
 */
const TICKS_PER_SECOND = 60
/** 서 있는 사람도 조금씩 움직이면 살아 보이지만, 원작은 안 움직인다 */
const IDLE_TICK = 0

const loader = new TextureLoader()
const textures = new Map<number, Texture>()

function textureFor(gfx: number): Texture {
  const had = textures.get(gfx)
  if (had !== undefined) return had
  const tex = loader.load(dataUrl(`npc/${String(gfx)}.png`))
  // 도트를 뭉개지 않는다. 원작이 16텍셀 격자라 보간하면 윤곽이 흐려진다
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = SRGBColorSpace
  textures.set(gfx, tex)
  return tex
}

/** 판때기 하나 몫의 상태 */
interface Slot {
  mesh: Mesh
  material: MeshBasicMaterial
  uv: BufferAttribute
  /** 지금 물려 있는 것. 안 바뀌었으면 UV를 다시 안 쓴다 */
  gfx: number
  frame: number
}

function makeSlot(): Slot {
  // 바닥에 발이 닿도록 원점을 아래 모서리에 둔다 — 키가 제각각이라 중심을 맞추면
  // 큰 사람이 땅에 파묻힌다
  const geometry = new PlaneGeometry(1, 1)
  geometry.translate(0, 0.5, 0)
  const material = new MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.5,   // 반투명 정렬 대신 잘라낸다. 도트 그림이라 경계가 뚜렷하다
    side: DoubleSide,
    depthWrite: true,
  })
  const mesh = new Mesh(geometry, material)
  mesh.visible = false
  mesh.frustumCulled = false // 자리를 매 프레임 바꾸므로 경계구가 못 따라온다
  return {
    mesh, material,
    uv: geometry.getAttribute('uv') as BufferAttribute,
    gfx: -1, frame: -1,
  }
}

/** 아틀라스에서 `frame`번째 칸만 보이게 UV를 옮긴다 */
function setFrame(slot: Slot, sprite: NpcSprite, frame: number): void {
  const span = 1 / sprite.frames
  const x0 = frame * span
  const x1 = x0 + span
  const uv = slot.uv
  // PlaneGeometry의 정점 차례는 좌상·우상·좌하·우하다
  uv.setXY(0, x0, 1); uv.setXY(1, x1, 1)
  uv.setXY(2, x0, 0); uv.setXY(3, x1, 0)
  uv.needsUpdate = true
}

interface Props {
  grid: MapGrid
  layer: number
  /**
   * 입체 모델이 이미 세운 사람들. 여기 든 사람은 판때기를 안 세운다.
   *
   * "모델이 있는 그림"이 아니라 **실제로 선 사람**이어야 한다 — 모델 쪽에도
   * 상한이 있어서, 넘친 사람은 판때기로라도 서야 한다
   */
  standing?: ReadonlySet<NpcActor>
}

export function NpcSprites({ grid, layer, standing }: Props) {
  const groupRef = useRef<Group>(null)
  const camera = useThree((s) => s.camera)
  const slots = useMemo(() => Array.from({ length: MAX }, makeSlot), [])
  /** 사람마다 걸어온 시간. 배치표 번호가 아니라 배우로 잡는다 */
  const walked = useRef(new WeakMap<NpcActor, number>())

  useEffect(() => {
    const group = groupRef.current
    if (group === null) return
    for (const s of slots) group.add(s.mesh)
    return () => {
      for (const s of slots) {
        group.remove(s.mesh)
        s.mesh.geometry.dispose()
        s.material.dispose()
      }
    }
  }, [slots])

  useFrame((_, delta) => {
    const p = worldState.player.position
    // 카메라가 보는 쪽. 3인칭은 늘 북쪽이라 0이고 1인칭만 돈다
    const quadrant = cameraQuadrant(
      worldState.camera.target.x - camera.position.x,
      worldState.camera.target.z - camera.position.z,
    )
    let n = 0
    for (const actor of npcActors.list) {
      if (n >= MAX) break
      if (!actor.visible) continue
      if (standing?.has(actor) === true) continue
      if (Math.abs(actor.x - p.x) > RANGE) continue
      if (Math.abs(actor.z - p.z) > RANGE) continue
      const sprite = npcSprite(actor.gfx)
      if (sprite === null) continue

      const slot = slots[n]
      if (slot === undefined) break
      n++

      // 걷는 중에만 장이 넘어간다. 서 있으면 그 방향의 첫 장으로 멈춘다
      const moving = !Number.isInteger(actor.x) || !Number.isInteger(actor.z)
      const before = walked.current.get(actor) ?? 0
      const ticks = moving ? before + delta * TICKS_PER_SECOND : IDLE_TICK
      walked.current.set(actor, ticks)

      const anim = sprite.directional ? artDir(actor.dir, quadrant) : 0
      const frame = frameOf(sprite, anim, ticks)
      if (slot.gfx !== actor.gfx) {
        slot.material.map = textureFor(actor.gfx)
        slot.material.needsUpdate = true
        slot.gfx = actor.gfx
        slot.frame = -1
      }
      if (slot.frame !== frame) {
        setFrame(slot, sprite, frame)
        slot.frame = frame
      }

      const y = grid.heightAtWorld(actor.x + 0.5, actor.z + 0.5, layer) ?? 0
      slot.mesh.position.set(actor.x + 0.5, y, actor.z + 0.5)
      slot.mesh.scale.set(sprite.w / TEXELS_PER_TILE, sprite.h / TEXELS_PER_TILE, 1)
      // 판때기가 카메라를 본다. 좌우로만 돈다 — 위아래로도 눕히면 발이 뜬다
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

  return <group ref={groupRef} />
}
