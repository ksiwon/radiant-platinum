// 머리 위 느낌표 (PARITY §1.13 · §7.9)
//
// 원작은 판때기 모델 둘을 `fldeff.narc`에서 꺼내 사람 위에 세운다
// (`ov5_021F5C18`). 그림은 우리도 그 파일에서 뽑아 쓰고(`data/npc/emote.png`),
// 튀어 오르는 곡선도 실측값이다 (`engine/actor/emote`).
//
// ⚠️ **밑자리만 우리 것이다.** 원작 모델은 제 높이를 들고 있어 사람 위치에
// 그대로 놓아도 머리 위에 뜨는데, 우리 사람 그림은 키가 제각각이라
// (`npcSprite(gfx).h`) 그 정수리를 밑자리로 잡는다 — 한 값으로 못 박으면
// 어린아이 위에서는 뜨고 어른 위에서는 겹친다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute, DoubleSide, Group, Mesh, MeshBasicMaterial, NearestFilter,
  PlaneGeometry, SRGBColorSpace, Texture, TextureLoader,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import { npcActors } from '../engine/actor/npcs'
import { emoteRise, EMOTE_CELL } from '../engine/actor/emote'
import { npcSprite, TEXELS_PER_TILE } from '../engine/actor/sprites'
import { assets, onProviderSwap } from '../data/providers/assetProvider'
import { worldState } from '../state/worldState'
import { world } from '../engine/map/world'
import { emotes } from './emotes'
import { npcBodyHeight } from './NpcModels'
import { groundYAt } from './distortion'

/** 한 번에 뜨는 표시. VS시커가 화면 안을 통째로 훑으므로 넉넉히 둔다 */
const MAX = 24
/** 그리는 거리(타일). 사람과 같다 */
const RANGE = 48
/** 한 줄에 이어 붙인 표시 수 — 시선 · 재전 */
const CELLS = 2
/** 롬 그림이 16×16이다. 한 칸(16텍셀)과 같은 크기로 선다 */
const SIZE = 16 / TEXELS_PER_TILE
/** 정수리에서 조금 띄운다. 딱 붙이면 머리카락을 문다 */
const GAP = 0.15

/**
 * 판때기로 선 사람의 **몸 높이** (타일).
 *
 * ⚠️ **그림 높이가 아니다.** 32텍셀짜리 그림은 두 칸짜리 네모인데 사람은 그
 * 아래쪽만 차지한다 — 원작 판때기 그림을 재면 위쪽 네 줄이 늘 비어 있어서,
 * 32짜리는 28텍셀이 몸이다
 */
function spriteHeight(gfx: number): number {
  return ((npcSprite(gfx)?.h ?? TEXELS_PER_TILE) - SPRITE_HEADROOM) / TEXELS_PER_TILE
}

/** 판때기 그림 위쪽의 빈 줄 (텍셀) */
const SPRITE_HEADROOM = 4

const loader = new TextureLoader()
let sheet: Texture | null = null

onProviderSwap(() => { sheet?.dispose(); sheet = null })

function markTexture(): Texture {
  if (sheet !== null) return sheet
  const tex = new Texture()
  const path = 'data/npc/emote.png'
  const provider = assets()
  void provider.objectUrl(path)
    .then((url) => loader.loadAsync(url).finally(() => { provider.releaseObjectUrl(path) }))
    .then((loaded) => {
      tex.image = loaded.image as TexImageSource
      tex.needsUpdate = true
    })
    .catch(() => { /* 그림이 없으면 아무것도 안 뜬다 */ })
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
  /** 지금 물려 있는 칸. 안 바뀌었으면 UV를 다시 안 쓴다 */
  cell: number
}

function makeSlot(material: MeshBasicMaterial): Slot {
  // 원점을 아래 모서리에 둔다 — 정수리를 밑자리로 잡으므로 거기서 위로 자란다
  const geometry = new PlaneGeometry(SIZE, SIZE)
  geometry.translate(0, SIZE / 2, 0)
  const mesh = new Mesh(geometry, material)
  mesh.visible = false
  mesh.frustumCulled = false
  return { mesh, uv: geometry.getAttribute('uv') as BufferAttribute, cell: -1 }
}

function setCell(slot: Slot, cell: number): void {
  const span = 1 / CELLS
  const x0 = cell * span
  const x1 = x0 + span
  const uv = slot.uv
  uv.setXY(0, x0, 1); uv.setXY(1, x1, 1)
  uv.setXY(2, x0, 0); uv.setXY(3, x1, 0)
  uv.needsUpdate = true
  slot.cell = cell
}

export function EmoteMarks({ grid, layer }: { grid: MapGrid; layer: number }) {
  const groupRef = useRef<Group>(null)
  const camera = useThree((s) => s.camera)
  const material = useMemo(() => new MeshBasicMaterial({
    map: markTexture(),
    transparent: true,
    alphaTest: 0.5,
    side: DoubleSide,
    // ⚠️ **깊이를 안 쓴다.** 사람 판때기와 같은 자리에 서므로 깊이를 쓰면
    // 보는 각도에 따라 머리에 잘린다 — 원작도 이 표시는 늘 앞에 온다
    depthWrite: false,
    depthTest: false,
  }), [])
  const slots = useMemo(() => Array.from({ length: MAX }, () => makeSlot(material)), [material])

  useEffect(() => {
    const group = groupRef.current
    if (group === null) return
    // 늘 맨 앞에 그린다. 깊이를 안 쓰므로 차례가 곧 앞뒤다
    group.renderOrder = 10
    for (const s of slots) { s.mesh.renderOrder = 10; group.add(s.mesh) }
    return () => {
      for (const s of slots) {
        group.remove(s.mesh)
        s.mesh.geometry.dispose()
      }
      material.dispose()
    }
  }, [slots, material])

  useFrame(() => {
    // ⚠️ **여기서 안 센다.** 표시 길이가 37프레임이라 렌더 델타로 세면 빠른
    // 기계에서 짧아진다 — 프레임을 미는 것은 고정 스텝 쪽이다 (`EngineDriver`)
    const p = worldState.player.position
    let n = 0
    for (const mark of emotes()) {
      if (n >= MAX) break
      const actor = npcActors.byLocalID.get(mark.localID)
      if (!actor || !actor.visible) continue
      if (Math.abs(actor.x - p.x) > RANGE) continue
      if (Math.abs(actor.z - p.z) > RANGE) continue

      const slot = slots[n]
      if (slot === undefined) break
      n++
      const cell = EMOTE_CELL[mark.kind]
      if (slot.cell !== cell) setCell(slot, cell)

      // ⚠️ **선 몸의 키를 본다 — 그림의 높이가 아니다.** 판때기는 32텍셀,
      // 즉 두 칸짜리 네모인데 사람은 그 아래쪽만 차지하고(머리 위가 비어 있다)
      // 모델은 아예 제 비율로 선다. 그림 높이로 얹으면 표시가 머리에서
      // **반 칸 넘게** 떠서, 가까이 선 사람일수록 화면에서 크게 벌어진다
      const head = npcBodyHeight(actor) ?? spriteHeight(actor.gfx)
      const y = groundYAt(grid, world.mapId, actor.x + 0.5, actor.z + 0.5, layer, actor.y)
      slot.mesh.position.set(
        actor.x + 0.5,
        y + head + GAP + emoteRise(mark.frame),
        actor.z + 0.5,
      )
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
