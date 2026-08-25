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
import { useFrame, useThree } from '@react-three/fiber'
import { Group, type Object3D } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { MapGrid } from '../engine/map/grid'
import { npcActors, type NpcActor } from '../engine/actor/npcs'
import { disguiseOf } from '../engine/actor/ambient'
import { createRig, updateLocomotion, type Rig } from '../engine/actor/locomotion'
import { RUN_SPEED, WALK_SPEED } from '../engine/actor/player'
import { DIR_STEP } from '../engine/script/movement'
import { BDSP_TO_WORLD, normalizeModel } from '../engine/model/normalize'
import { isChibi, shapeChibi } from '../engine/model/chibi'
import { worldState } from '../state/worldState'
import { world } from '../engine/map/world'
import { groundYAt } from './distortion'
import { addWhenWarm } from './warmPipelines'
import { unifySkeletons } from './unifySkeleton'
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

/**
 * **한 배치에 여럿이 그려진 판때기.** 그 수만큼 세운다.
 *
 * 갤럭시단 집회장(맵 522)에는 사람 하나가 아니라 **넷·셋이 한 장에 그려진**
 * 그림이 있다 — `GRUNTS_GROUP_OF_4`(그림 248, 128×32텍셀 = 8×2칸)와
 * `GRUNTS_GROUP_OF_3`(249, 64×32 = 4×2칸)이고, 그 방에 열 장과 여덟 장이
 * 서 있다. 판때기 한 장에 사람 넷이라 짝지을 모델이 없어서 이 둘만 종잇장으로
 * 남아 있었다.
 *
 * **자리는 그림에서 잰다.** 알파가 찬 세로줄을 세면 248은 0~15 · 16~32 ·
 * 47~62 · 63~79텍셀, 249는 0~15 · 16~32 · 47~63이다. 판이 배치 칸에 가운데로
 * 서므로(`NpcSprites`가 `w/16`칸으로 늘인다) 각 사람의 가운데를 칸으로 옮기면
 * 아래 값이다 — **그려진 사람이 선 그 자리에 그대로 선다.**
 *
 * 몸은 남자 조무래기(그림 124 → `tr1073_00`)다. 원작 그림도 같은 제복이다
 */
const GROUP_BODIES: Readonly<Record<number, { tag: string, offsets: readonly number[] }>> = {
  248: { tag: 'tr1073_00', offsets: [-3.531, -2.5, -0.594, 0.438] },
  249: { tag: 'tr1073_00', offsets: [-1.531, -0.5, 1.438] },
}

/** 사람 하나짜리 배치의 자리 — 칸 가운데 */
const ALONE: readonly number[] = [0]

/**
 * 여럿이 그려진 판때기가 쓸 수 있는 **따로 잡은 몫**.
 *
 * ⚠️ **사람 몫(`MAX`)에 같이 넣으면 안 된다.** 갤럭시단 집회장 하나 때문에
 * 상한을 80으로 올리면 사람 많은 거리도 전부 그만큼 세운다. 이 그림 둘은
 * **게임 전체에서 그 방 하나에만** 있으므로(맵 522 배치표) 값이 커져도
 * 무거워지는 것은 그 방뿐이다.
 *
 * ⚠️ **값이 싸지 않다.** 그 방을 다 세우면 삼각형이 **151.8k → 715.0k**로 늘고
 * 순회 하네스에서 **60fps → 36fps(최저 33)**다 (`FP_ONLY=galactic-hq node
 * .audit/fpTour.mjs`). 다만 그 하네스는 WebGL2 폴백이라(`backend xG`) 이
 * 수가 사용자가 받는 성능은 아니다 — 설치본은 WebGPU로 돈다
 */
const GROUP_MAX = 64
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
  /** 이 칸에 선 몸들. 여럿이 그려진 판때기는 그 수만큼이다 (`GROUP_BODIES`) */
  rigs: (Rig | null)[]
  /** 지난 프레임 자리. 걷는 속도를 여기서 잰다 — 배우는 속도를 안 들고 있다 */
  lastX: number
  lastZ: number
  /** 실제로 선 키 (타일). 머리 위에 무엇을 얹는 쪽이 본다 */
  height: number
  /** 맵을 떠서 버린 칸. 굽기가 늦게 끝나도 이러면 안 세운다 */
  dropped: boolean
  /** 어느 갈래에서 나왔나. 자리를 뜨면 이 이름의 통으로 돌아간다 */
  tag: string
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
  // 미리 굽는 데 쓴다 — 빛과 환경은 진짜 씬에서, 절두체는 진짜 카메라에서 온다
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer
  const root = useThree((s) => s.scene)
  const cam = useThree((s) => s.camera)
  /** 배우마다 한 칸. 배치표 번호가 아니라 배우로 잡는다 — 맵을 옮기면 새 배우다 */
  const slots = useMemo(() => new Map<NpcActor, Slot>(), [])
  /**
   * 자리를 뜬 사람이 두고 간 칸. 같은 갈래의 다음 사람이 그대로 쓴다.
   *
   * ⚠️ **버리고 새로 복제하면 셰이더가 하나씩 쌓인다.** `SkeletonUtils.clone`이
   * 뼈를 새로 짓는데, three는 뼈 행렬 버퍼 이름에 노드 id를 박으므로
   * **복제 하나에 정점 프로그램 하나**다 (`warmPipelines`). 209번도로에서
   * 셰이더 원문을 떠 보니 프로그램 250개 중 133개가 스킨이었고, 그 링크 확인에
   * 22.4초가 들어갔다 — 한때 이 통이 없어서 길을 걷는 내내 쌓인 값이다
   */
  const spare = useMemo(() => new Map<string, Slot[]>(), [])
  /** 모델이 도착하면 올린다. 값은 안 쓰고 다시 그리게 하는 데만 쓴다 */
  const [, bump] = useState(0)
  const standing = useRef<ReadonlySet<NpcActor>>(new Set())

  useEffect(() => () => {
    const group = groupRef.current
    for (const slot of [...slots.values(), ...[...spare.values()].flat()]) {
      // 아직 굽는 중인 칸도 있다 — 다 구워졌을 때 세우지 말라고 표시해 둔다
      slot.dropped = true
      group?.remove(slot.outer)
    }
    slots.clear()
    spare.clear()
  }, [slots, spare])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (group === null || table === null) return

    const p = worldState.player.position
    const seen = new Set<NpcActor>()
    let n = 0
    /** 여럿짜리 판때기가 세운 몸 수 (`GROUP_MAX`) */
    let crowd = 0

    for (const actor of npcActors.list) {
      if (n >= MAX && crowd >= GROUP_MAX) break
      if (!actor.visible) continue
      // 변장 중이면 사람이 아니라 더미가 선다 (`DisguisePlates`)
      if (disguiseOf(actor) !== null) continue
      if (Math.abs(actor.x - p.x) > RANGE || Math.abs(actor.z - p.z) > RANGE) continue
      const many = GROUP_BODIES[actor.gfx]
      const bundle = many?.tag ?? table[String(actor.gfx)]
      if (bundle === undefined) continue
      const offsets = many?.offsets ?? ALONE
      // 통은 **선 몸 수까지 갈라** 잡는다 — 넷짜리 칸에 혼자를 앉히면 셋이 남는다
      const tag = offsets.length === 1 ? bundle : `${bundle}×${String(offsets.length)}`
      // 여럿짜리 판때기는 제 몫에서 센다 (`GROUP_MAX`)
      if (many) { if (crowd + offsets.length > GROUP_MAX) continue }
      else if (n + offsets.length > MAX) continue

      let slot = slots.get(actor)
      if (!slot) {
        // 두고 간 칸이 있으면 그것을 쓴다 — 이미 구워져 있어 공짜다
        slot = spare.get(tag)?.pop()
        if (!slot) {
          const source = scenes.get(bundle)
          if (!source) { fetchModel(bundle, () => { bump((v) => v + 1) }); continue }
          slot = build(source, bundle, tag, offsets)
          // ⚠️ **바로 안 붙인다.** 붙는 순간 그 프레임이 이 사람의 셰이더를 굽고,
          // 그 링크 확인이 ANGLE에서 한 명당 100ms 넘게 막는다 (`warmPipelines`).
          // 사람 하나에 프로그램 하나라 여럿이 같은 프레임에 붙으면 그대로 쌓인다 —
          // 실측으로 리그 로비의 제일 긴 프레임이 1,233ms였다.
          // 씬 밖에서 미리 구우면 병렬 갈래로 가서 **0ms**다
          const mine = slot
          addWhenWarm(gl, root, cam, group, slot.outer, () => !mine.dropped)
        }
        slots.set(actor, slot)
        // 새 주인 자리에서 시작한다 — 안 그러면 지난 주인과의 거리가 속도로
        // 읽혀서, 선 사람이 한 프레임 달리는 자세를 낸다
        slot.lastX = actor.x
        slot.lastZ = actor.z
      }
      if (many) crowd += offsets.length; else n += offsets.length
      seen.add(actor)
      bodyHeights.set(actor, slot.height)

      const y = groundYAt(grid, world.mapId, actor.x + 0.5, actor.z + 0.5, layer, actor.y)
      // 연출이 걸려 있으면 그림만 그만큼 어긋난다 (`MapObject_SetSpritePosOffset`)
      slot.outer.position.set(
        actor.x + 0.5 + (actor.offsetX ?? 0),
        y + (actor.offsetY ?? 0),
        actor.z + 0.5 + (actor.offsetZ ?? 0),
      )
      // 모델 정면이 +Z다. `DIR_STEP`이 그 방향의 걸음이라 그대로 각이 된다
      const step = DIR_STEP[actor.dir & 3]!
      slot.outer.rotation.y = Math.atan2(step.x, step.z)
      slot.outer.visible = true

      // 배우는 속도를 안 들고 있다 — 지난 프레임과의 거리로 잰다
      const moved = Math.hypot(actor.x - slot.lastX, actor.z - slot.lastZ)
      slot.lastX = actor.x
      slot.lastZ = actor.z
      const speed = delta > 0 ? moved / delta : 0
      for (const rig of slot.rigs) {
        // 서 있는 사람도 돌려야 한다 — 안 돌리면 바인드 포즈로 굳는다
        if (rig) updateLocomotion(rig, delta, speed < MOVING ? 0 : speed, WALK_SPEED, RUN_SPEED)
      }
    }

    for (const [actor, slot] of slots) {
      if (seen.has(actor)) continue
      slot.outer.visible = false
      bodyHeights.delete(actor)
      // 통에 넣어 둔다. 씬에는 그대로 두고 안 그리기만 한다 — 떼었다 붙이면
      // 그만큼 다시 굽는다
      slots.delete(actor)
      const pool = spare.get(slot.tag) ?? []
      pool.push(slot)
      spare.set(slot.tag, pool)
    }
    // 판때기 쪽에 알린다. **집합이 바뀔 때만** — 매 프레임 부르면 R3F가 죽는다.
    //
    // ⚠️ **칸이 생긴 그 프레임에 가져간다. 다 구워질 때까지 미루지 마라.**
    // 미리 굽기를 넣으면서 「아직 안 붙었으면 판때기가 그 자리를 지키게」
    // 해 봤는데, 그러면 이 집합이 **모델이 붙는 박자에 맞춰 흔들린다** —
    // `NpcMonModels`가 그 틈에 같은 배치를 가져갔다가 도로 내주고, 그 왕복이
    // 부모의 상태를 프레임마다 밀었다. 실측으로 68자리를 통째로 훑을 때
    // 배틀 여덟 자리가 **끝나고도 화면이 안 닫혔고**(`phase`는 `off`인데
    // `data-scene`이 `battle`), 하나씩 돌리면 다 통과했다 — React가 선 것이다
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
    .then((gltf) => {
      // ⚠️ **복제 전에, 갈래마다 한 번.** 조각마다 뼈 수가 다르면 그 수만큼
      // 셰이더가 갈린다 (`unifySkeleton`). 복제본에 걸면 지오메트리를 참조로
      // 물려받아 이미 고친 `skinIndex`를 또 고친다
      unifySkeletons(gltf.scene)
      scenes.set(tag, gltf.scene)
      done()
    })
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
function build(
  scene: Object3D, bundle: string, tag: string, offsets: readonly number[],
): Slot {
  const outer = new Group()
  const rigs: (Rig | null)[] = []
  let height = 0
  for (const dx of offsets) {
    const inner = new Group()
    inner.position.x = dx
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
    height = nativeHeight * BDSP_TO_WORLD
    // ⚠️ **키를 잰 다음에 치비를 고친다.** 순서를 바꾸면 줄어든 머리만큼 그 사람이
    // 통째로 작아진다 — 엄마가 1.47m에서 1.2m가 된다
    if (isChibi(bundle)) shapeChibi(inner, body, nativeHeight, height)
    else normalizeModel(inner, body, height)
    // 리그는 정규화 **이후**에 만든다 — 본의 월드 회전에서 로컬 축을 뽑기 때문에
    // 래퍼 변환이 확정된 뒤라야 축이 맞는다 (`PlayerModel`과 같은 순서)
    rigs.push(createRig(body, inner))
  }
  return { outer, rigs, lastX: 0, lastZ: 0, height, dropped: false, tag }
}
