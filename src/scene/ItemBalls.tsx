// 길에 떨어진 도구 — 몬스터볼을 입체로 세운다 (PARITY §1.27)
//
// 원작에서 길에 놓인 도구는 `OBJ_EVENT_GFX_POKEBALL`(그림 87) 판때기 한 장이다.
// 16×16텍셀 = 한 칸짜리 그림이라 옆에서 보면 종잇장이 되고, 3인칭으로 돌아
// 들어가면 볼이 사라진다.
//
// ⚠️ **볼 모양을 우리가 지어내지 않는다.** BDSP에 그 볼이 그대로 있다 —
// `Characters/objects/ob0201_00`이다(번들 안 이름이 `openball02`·
// `ob0201_00_ballupperSkin`). 삼각형 1,306개짜리 진짜 몬스터볼이다.
//
// ⚠️ **크기는 원작 그림에서 잰다.** 모델 자체는 높이 0.0765 BDSP단위, 곧 7.6cm
// 짜리 실물 크기라 한 칸(1m) 위에 놓으면 안 보인다. 원작 그림에서 볼이 차지한
// 상자가 **10×10텍셀**이고 아래로 **1텍셀** 떠 있으므로(16×16 중), 그 자리에
// 그대로 앉힌다 — 지름 0.625칸 · 바닥에서 0.0625칸.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Box3, Group, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { MapGrid } from '../engine/map/grid'
import { npcActors, type NpcActor } from '../engine/actor/npcs'
import { worldState } from '../state/worldState'
import { world } from '../engine/map/world'
import { groundYAt } from './distortion'
import { useAssetUrl } from '../data/providers/useAssetUrl'

/** 길에 놓인 도구의 그림 번호 (`spriteTable`의 `POKEBALL`) */
const POKEBALL_GFX = 87

/**
 * 원작 그림에서 잰 볼의 지름과 바닥 틈 (칸).
 *
 * `public/data/npc/87.png`의 알파 상자가 x 3~12 · y 5~14다 — 곧 10×10텍셀에
 * 아래 여백 1텍셀이고, 한 칸이 16텍셀이다
 */
const BALL_SIZE = 10 / 16
const BALL_LIFT = 1 / 16

/** 한 맵에 동시에 세우는 볼 수. 원작 배치는 한 맵에 몇 개뿐이다 */
const MAX = 8
/** 그리는 거리(칸). 판때기와 같다 */
const RANGE = 48

interface Props {
  grid: MapGrid
  layer: number
  /** 입체로 선 배치. `NpcSprites`가 이 사람들을 건너뛴다 */
  onStanding: (taken: ReadonlySet<NpcActor>) => void
}

export function ItemBalls({ grid, layer, onStanding }: Props) {
  const groupRef = useRef<Group>(null)
  const gltf = useLoader(GLTFLoader, useAssetUrl('models/pokeball.glb'))
  const standing = useRef<ReadonlySet<NpcActor>>(new Set())

  /**
   * 원작 그림 크기에 맞춘 한 벌. 복제는 이것을 베낀다 — 자를 매번 재면
   * 프레임마다 상자를 다시 잰다
   */
  const fitted = useMemo(() => {
    const outer = new Group()
    // ⚠️ **`clone`이 아니라 `cloneSkinned`다.** three의 `clone`은 스킨드 메시의
    // 뼈대를 **참조로** 베껴서 복제본의 뼈가 원본 트리를 가리킨다. 그 상태에서
    // 다시 `cloneSkinned`를 걸면 이름으로 뼈를 찾는데 복제본 트리에는 그 뼈가
    // 없어서 **뼈대가 통째로 `undefined` 셋**이 된다. 그리기는 뼈 텍스처를
    // 쓰므로 조용히 넘어가고, 광선을 쏘면 `applyBoneTransform`에서 터진다 —
    // `pnpm shot --hit`이 볼이 있는 맵에서 다 죽어 있었다 (`.audit/skinCheck.mjs`)
    const body = cloneSkinned(gltf.scene) as Group
    outer.add(body)
    const box = new Box3().setFromObject(body)
    const tall = Math.max(box.max.y - box.min.y, box.max.x - box.min.x, 1e-6)
    const s = BALL_SIZE / tall
    body.scale.setScalar(s)
    // 발밑이 원점에 오게 내린다 — 자리는 칸 바닥이다
    body.position.y = -box.min.y * s
    return outer
  }, [gltf])

  const slots = useMemo(() => Array.from({ length: MAX }, () => {
    const g = new Group()
    g.add(cloneSkinned(fitted))
    g.visible = false
    // 자리를 매 프레임 바꾸므로 경계구가 못 따라온다
    g.traverse((o: Object3D) => { o.frustumCulled = false })
    return g
  }), [fitted])

  useEffect(() => {
    const group = groupRef.current
    if (group === null) return
    for (const s of slots) group.add(s)
    return () => { for (const s of slots) group.remove(s) }
  }, [slots])

  useFrame(() => {
    if (groupRef.current === null) return
    const p = worldState.player.position
    const seen = new Set<NpcActor>()
    let n = 0
    for (const actor of npcActors.list) {
      if (n >= MAX) break
      if (!actor.visible) continue
      if (actor.gfx !== POKEBALL_GFX) continue
      if (Math.abs(actor.x - p.x) > RANGE || Math.abs(actor.z - p.z) > RANGE) continue
      const slot = slots[n]!
      const y = groundYAt(grid, world.mapId, actor.x + 0.5, actor.z + 0.5, layer, actor.y)
      slot.position.set(actor.x + 0.5, y + BALL_LIFT, actor.z + 0.5)
      slot.visible = true
      seen.add(actor)
      n++
    }
    for (let i = n; i < slots.length; i++) slots[i]!.visible = false

    const before = standing.current
    if (before.size !== seen.size || [...seen].some((a) => !before.has(a))) {
      standing.current = seen
      onStanding(seen)
    }
  })

  return <group ref={groupRef} />
}
