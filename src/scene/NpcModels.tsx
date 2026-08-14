// 오버월드 NPC를 입체로 세운다 (DATA.md §2.16)
//
// 원작 NPC는 판때기 그림이다(`NpcSprites`). 1인칭으로 옆에 서면 종잇장이 되고,
// 주인공만 등신 모델이라 같은 화면에서 사람 둘이 다른 세계에서 온 것으로 보인다.
//
// ⚠️ **모델을 새로 만들지 않는다.** BDSP는 같은 신오를 3D로 다시 만든 것이라
// 같은 사람들이 들어 있다. 그림 이름(`BUG_CATCHER`)과 번들 안 텍스처 이름
// (`tr1006_00_bugcatcher_body_col`)이 같은 낱말을 쓰는 것만 잇는다
// (`engine/actor/npcModels`). 그럴듯한 짝은 안 만든다 — 지금 붙는 것이 배치
// 3,555개 중 760개(21.4%)고, 나머지는 판때기로 남는다.
//
// ⚠️ **애니메이션 클립을 안 싣는다.** 걷기는 `actor/locomotion`이 뼈를 직접
// 돌려서 만든다(주인공도 그렇다). 클립을 빼면 한 명이 2.58MB에서 1.06MB가 된다.
// 대신 **서 있는 사람도 `updateLocomotion`을 돌려야 한다** — 안 돌리면 바인드
// 포즈, 즉 팔을 벌린 T 자세로 서 있는다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { MapGrid } from '../engine/map/grid'
import { npcActors, type NpcActor } from '../engine/actor/npcs'
import { disguiseOf } from '../engine/actor/ambient'
import { createRig, updateLocomotion, type Rig } from '../engine/actor/locomotion'
import { RUN_SPEED, WALK_SPEED } from '../engine/actor/player'
import { DIR_STEP } from '../engine/script/movement'
import { BDSP_TO_WORLD, normalizeModel } from '../engine/model/normalize'
import { worldState } from '../state/worldState'
import { world } from '../engine/map/world'
import { groundYAt } from './distortion'
import { assets, onProviderSwap } from '../data/providers/assetProvider'

/**
 * 동시에 세우는 모델 수의 상한.
 *
 * 판때기(64)보다 낮다 — 한 명이 정점 8천 개에 뼈 131개다. 넘치는 사람은
 * 판때기로 선다: `NpcSprites`가 **모델이 실제로 선 사람만** 건너뛴다
 */
const MAX = 24
/** 그리는 거리(타일). 판때기(48)보다 짧다 — 멀면 어차피 몇 픽셀이다 */
const RANGE = 24
/** 걷는 중인지 가르는 문턱(타일/초). 이 아래는 서 있는 것으로 친다 */
const MOVING = 0.05

/** 받아 둔 씬. 갈래마다 한 벌만 받고 사람마다 복제한다 */
const scenes = new Map<string, Object3D>()
const loading = new Set<string>()
const loader = new GLTFLoader()

// 갈아 끼우면 사람 모델은 옛 설치본 것이다
onProviderSwap(() => { scenes.clear(); loading.clear() })

/** 한 사람 몫. 모델·리그·래퍼를 함께 들고 있는다 */
interface Slot {
  /** 엔진이 자리와 방향을 쓰는 바깥 그룹 */
  outer: Group
  rig: Rig | null
  /** 지난 프레임 자리. 걷는 속도를 여기서 잰다 — 배우는 속도를 안 들고 있다 */
  lastX: number
  lastZ: number
  /** 실제로 선 키 (타일). 머리 위에 무엇을 얹는 쪽이 본다 */
  height: number
}

interface Props {
  grid: MapGrid
  layer: number
  /** 그림 번호 → 갈래. 추출기가 **구워 낸 것만** 담아 준다 */
  table: Readonly<Record<string, string>> | null
  /** 모델이 실제로 선 사람. `NpcSprites`가 이 사람들을 건너뛴다 */
  onStanding: (taken: ReadonlySet<NpcActor>) => void
}

export function NpcModels({ grid, layer, table, onStanding }: Props) {
  const groupRef = useRef<Group>(null)
  /** 배우마다 한 칸. 배치표 번호가 아니라 배우로 잡는다 — 맵을 옮기면 새 배우다 */
  const slots = useMemo(() => new Map<NpcActor, Slot>(), [])
  /** 모델이 도착하면 올린다. 값은 안 쓰고 다시 그리게 하는 데만 쓴다 */
  const [, bump] = useState(0)
  const standing = useRef<ReadonlySet<NpcActor>>(new Set())

  useEffect(() => () => {
    const group = groupRef.current
    for (const slot of slots.values()) group?.remove(slot.outer)
    slots.clear()
  }, [slots])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (group === null || table === null) return

    const p = worldState.player.position
    const seen = new Set<NpcActor>()
    let n = 0

    for (const actor of npcActors.list) {
      if (n >= MAX) break
      if (!actor.visible) continue
      // 변장 중이면 사람이 아니라 더미가 선다 (`DisguisePlates`)
      if (disguiseOf(actor) !== null) continue
      if (Math.abs(actor.x - p.x) > RANGE || Math.abs(actor.z - p.z) > RANGE) continue
      const tag = table[String(actor.gfx)]
      if (tag === undefined) continue

      let slot = slots.get(actor)
      if (!slot) {
        const scene = scenes.get(tag)
        if (!scene) { fetchModel(tag, () => { bump((v) => v + 1) }); continue }
        slot = build(scene)
        group.add(slot.outer)
        slots.set(actor, slot)
      }
      n++
      seen.add(actor)
      bodyHeights.set(actor, slot.height)

      const y = groundYAt(grid, world.mapId, actor.x + 0.5, actor.z + 0.5, layer, actor.y)
      slot.outer.position.set(actor.x + 0.5, y, actor.z + 0.5)
      // 모델 정면이 +Z다. `DIR_STEP`이 그 방향의 걸음이라 그대로 각이 된다
      const step = DIR_STEP[actor.dir & 3]!
      slot.outer.rotation.y = Math.atan2(step.x, step.z)
      slot.outer.visible = true

      // 배우는 속도를 안 들고 있다 — 지난 프레임과의 거리로 잰다
      const moved = Math.hypot(actor.x - slot.lastX, actor.z - slot.lastZ)
      slot.lastX = actor.x
      slot.lastZ = actor.z
      const speed = delta > 0 ? moved / delta : 0
      if (slot.rig) {
        // 서 있는 사람도 돌려야 한다 — 안 돌리면 바인드 포즈로 굳는다
        updateLocomotion(slot.rig, delta, speed < MOVING ? 0 : speed, WALK_SPEED, RUN_SPEED)
      }
    }

    for (const [actor, slot] of slots) {
      if (!seen.has(actor)) { slot.outer.visible = false; bodyHeights.delete(actor) }
    }
    // 판때기 쪽에 알린다. **집합이 바뀔 때만** — 매 프레임 부르면 R3F가 죽는다
    const before = standing.current
    if (before.size !== seen.size || [...seen].some((a) => !before.has(a))) {
      standing.current = seen
      onStanding(seen)
    }
  })

  return <group ref={groupRef} />
}

function fetchModel(tag: string, done: () => void): void {
  if (loading.has(tag)) return
  loading.add(tag)
  // ⚠️ **파싱이 끝나면 주소를 놓는다.** 장면은 `scenes`가 들고 있고 원본
  // 바이트는 더 안 쓴다 — 사람이 470종이라 붙들면 GLB 470벌이 남는다
  const path = `models/npc/${tag}.glb`
  const provider = assets()
  provider.objectUrl(path)
    .then((url) => loader.loadAsync(url).finally(() => { provider.releaseObjectUrl(path) }))
    .then((gltf) => { scenes.set(tag, gltf.scene); done() })
    .catch(() => { /* 못 받으면 그 사람은 판때기로 남는다 */ })
    .finally(() => { loading.delete(tag) })
}

/**
 * 실제로 선 사람의 **키** (타일).
 *
 * ⚠️ **판때기 그림의 높이와 다르다.** 판때기는 32텍셀 = 두 칸짜리 네모인데
 * 사람은 그 아래쪽만 차지하고, 모델은 아예 제 비율로 선다. 머리 위에 무엇을
 * 얹으려면(느낌표 — `EmoteMarks`) 그림이 아니라 **선 몸**을 봐야 한다
 */
const bodyHeights = new WeakMap<NpcActor, number>()

/** 그 사람이 모델로 서 있으면 그 키(타일), 판때기면 null */
export function npcBodyHeight(actor: NpcActor): number | null {
  return bodyHeights.get(actor) ?? null
}

/** 모델 하나를 복제해 한 칸으로 만든다 */
function build(scene: Object3D): Slot {
  const outer = new Group()
  const inner = new Group()
  outer.add(inner)
  // ⚠️ 스킨드 메시는 `Object3D.clone()`으로 복제하면 안 된다 — 뼈가 원본을
  // 가리켜서 여럿이 같은 자세로 함께 움직인다. `SkeletonUtils.clone`이 뼈까지
  // 새로 짓고 스킨을 다시 묶는다
  const body = cloneSkinned(scene)
  body.traverse((o) => { o.castShadow = true })
  inner.add(body)
  // 원본 키를 먼저 재고, 거기에 BDSP 단위 배수를 곱한 키로 다시 맞춘다.
  // 발밑도 이때 원점에 온다 — 그 자체가 정규화가 하는 일이다
  const { nativeHeight } = normalizeModel(inner, body, 1)
  const height = nativeHeight * BDSP_TO_WORLD
  normalizeModel(inner, body, height)
  // 리그는 정규화 **이후**에 만든다 — 본의 월드 회전에서 로컬 축을 뽑기 때문에
  // 래퍼 변환이 확정된 뒤라야 축이 맞는다 (`PlayerModel`과 같은 순서)
  const rig = createRig(body, inner)
  return { outer, rig, lastX: 0, lastZ: 0, height }
}
