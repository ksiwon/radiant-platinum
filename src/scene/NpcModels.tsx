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
        // 두고 간 칸이 있으면 그것을 쓴다 — 이미 구워져 있어 공짜다
        slot = spare.get(tag)?.pop()
        if (!slot) {
          const source = scenes.get(tag)
          if (!source) { fetchModel(tag, () => { bump((v) => v + 1) }); continue }
          slot = build(source, tag)
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

/**
 * 필드 번들(`fc####`)의 머리를 줄이는 배수.
 *
 * ⚠️ **엄마가 머리만 큰 사람으로 서 있었다.** BDSP는 필드에 세울 사람을 머리
 * 큰 치비로 따로 만들어 두었다. 우리는 주인공과 트레이너를 **배틀용 등신
 * 모델**로 세우므로 나란히 서면 계통이 어긋난다 — 실제로 「엄마 얼굴이
 * 이상하다」는 보고를 받았다. 배틀용이 아예 없는 사람이 열넷이라(이야기 인물)
 * 판때기로 되돌리면 오프닝 바로 다음 장면의 엄마가 종잇장이 된다.
 *
 * 그래서 **머리뼈만 줄이고 키는 그대로 둔다.** 머리는 목 관절을 원점으로
 * 줄어드니 이음매가 안 벌어지고, 줄어든 만큼 아래 정규화가 몸을 키운다.
 *
 * 값의 근거 — 뼈로 잰 목 높이가 기준이다. 엄마 `fc2005_00`은 목이 키의 44%라
 * **머리가 키의 56%**고, 주인공 `dawn`은 목이 75%라 머리가 25%다. 머리를 ×k로
 * 줄이고 키를 도로 맞추면 머리 비중은 `0.56k / (0.44 + 0.56k)`가 된다:
 *
 *   ×1    56%      ×0.4  27%      **×0.2  20%**   ← 여기 (주인공 25%)
 */
const CHIBI_HEAD = 0.2

/**
 * 머리를 줄인 만큼 늘어나는 배율을 **굵기에는 얼마나 줄까** (0~1).
 *
 * ⚠️ **몸이 굵어지는 자리다.** 머리를 줄이면 그만큼 키가 줄고, 정규화가 키를
 * 도로 맞추려고 몸 전체를 키운다 — ×0.2면 배율이 1.02에서 1.84로 뛴다. 균등
 * 배율이라 굵기도 같이 1.8배가 되어, 주인공 옆에 서면 「몸이 너무 굵다」.
 *
 * 그래서 **늘리는 것은 키 쪽에만 준다.** 굵기(가로·세로 두께)는 BDSP가 만든
 * 그대로 두면(`1`) 몸만 길어져 날렵해진다. `0`이면 예전처럼 균등이다.
 *
 * 실측 — 몸 길이(발~목) 대비 굵기, 주인공과의 배수:
 *
 *              엄마 치비   주인공   배수
 *   허벅지 폭    30.0%     14.6%   2.05
 *   종아리 폭    32.9%     14.8%   2.22
 *
 * 즉 치비는 다리가 두 배 굵다. `1`이면 최종 굵기가 원본 배율(1.02)로 돌아가
 * 주인공의 1.2배가 된다 — 어른이라 이 정도가 맞다.
 *
 * ⚠️ **길이가 아니라 축을 눌러서 얻은 날렵함이다.** 가로·세로를 누르므로
 * 가로로 뻗은 부위는 그만큼 짧아진다 — 걸을 때 앞뒤로 흔드는 보폭이 좁아 보인다.
 * 팔다리 뼈를 늘려 제대로 등신으로 만드는 것은 리타깃이라 여기서는 안 한다
 */
const CHIBI_SLIM = 1

/**
 * 손뼈를 줄이는 배수.
 *
 * ⚠️ **날렵하게 만들면 손이 커진다.** 위의 세로 늘림(×1.745)이 **아래로 뻗은
 * 것을 다 늘인다** — 팔을 내리고 선 자세에서 손은 길이축이 아래를 향하므로
 * 그대로 1.7배 길어진다. 게다가 치비 손은 원래 벙어리장갑이라 손목보다 넓다.
 * 둘이 겹쳐 「손이 진짜 크다」는 보고를 받았다.
 *
 * 값의 근거 — **스킨을 먹인 정점**(손뼈와 손가락뼈에 매달린 1,580개)을 훑어
 * 화면에 선 채로 왼손 상자를 재고, 같은 방법으로 잰 주인공(`pc0001_00`)의
 * 왼손 `0.116 × 0.144 × 0.113`과 견줬다. 팔을 내린 자세라 **세로가 손 길이**다.
 * 몸(발~목) 길이가 1.09와 1.13으로 거의 같아 그대로 견줄 수 있다:
 *
 *   손뼈    가로 × 세로 × 앞뒤        주인공 대비 (세로·가로·앞뒤)
 *   ×1      0.148 0.346 0.212        2.40  1.28  1.88
 *   ×0.6    0.089 0.207 0.129        1.44  0.77  1.14
 *   **×0.5**  0.074 0.173 0.109      1.20  0.64  0.96
 *   ×0.4    0.059 0.138 0.088        0.96  0.51  0.78
 *
 * 세 축을 곱해 세제곱근을 내면 ×0.557이 주인공 손과 같은 크기다. 어른이라
 * 그보다 조금 크게 잡을 수도 있는데(×0.6이면 1.08배), **눈에 걸리는 것은
 * 길이**라 ×0.5로 둔다 — 길이가 1.20배, 크기 전체로는 0.90배다.
 *
 * ⚠️ **한 손씩 재야 한다.** 두 손을 한 상자에 넣으면 가로가 손 폭이 아니라
 * 두 손 사이 거리가 되어 주인공 손이 2.76타일로 나온다.
 *
 * ⚠️ **균등 배율이라 자세가 바뀌어도 안 틀어진다.** 머리처럼 축을 갈라
 * 보정하면 팔을 든 자세에서 반대로 눌린다 — 손뼈의 로컬 축은 팔을 따라 돈다.
 *
 * ⚠️ **손목이 원뿔로 좁아진다.** 손은 제 원점(손목)을 중심으로 줄어드는데
 * 팔뚝은 그대로다. 다만 스킨 가중치가 넓게 번져 있어서(손뼈 가중치가 손목
 * 앞뒤 0.08 구간에 걸쳐 0→0.76으로 오른다, 몸 길이의 12%) 단차가 아니라
 * 완만한 테이퍼로 나온다
 */
const CHIBI_HAND = 0.5

/** 이 번들이 치비인가 — 필드용(`fc`)만 그렇다 */
const isChibi = (tag: string): boolean => /^fc\d/.test(tag)

/** 이 이름을 가진 뼈들. 같은 이름의 메시가 있을 수 있어 뼈만 고른다 */
function bonesNamed(body: Object3D, ...names: readonly string[]): Object3D[] {
  const out: Object3D[] = []
  body.traverse((o) => { if (o.type === 'Bone' && names.includes(o.name)) out.push(o) })
  return out
}

/** 모델 하나를 복제해 한 칸으로 만든다 */
function build(scene: Object3D, tag: string): Slot {
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
  if (!isChibi(tag)) {
    normalizeModel(inner, body, height)
  } else {
    // ⚠️ **키를 잰 다음에 머리를 줄인다.** 순서를 바꾸면 줄어든 머리만큼 그 사람이
    // 통째로 작아진다 — 엄마가 1.47m에서 1.2m가 된다. 키는 그대로 두고 아래 정규화가
    // 남은 몸을 그 키에 맞춰 키우게 한다
    const heads = bonesNamed(body, 'Head')
    for (const bone of heads) bone.scale.setScalar(CHIBI_HEAD)
    // 손은 균등하게 줄인다. 손가락은 자식이라 따라온다
    for (const bone of bonesNamed(body, 'LHand', 'RHand')) bone.scale.setScalar(CHIBI_HAND)
    const fit = normalizeModel(inner, body, height)
    // 머리를 줄인 만큼 몸이 짧아졌고, 정규화가 그만큼 통째로 키웠다. 그 늘림을
    // 굵기에서 도로 뺀다 (`CHIBI_SLIM`)
    const left = fit.nativeHeight / nativeHeight
    const girth = fit.scale * (1 - CHIBI_SLIM * (1 - left))
    inner.scale.x = girth
    inner.scale.z = girth
    // 눌린 만큼 머리는 도로 둥글게 편다.
    // ⚠️ **머리뼈의 로컬 축은 X가 위, Y가 좌우, Z가 앞이다** — 실측했다
    // (바인드에서 X축이 월드 +Y를 가리킨다). 그래서 가로 보정이 y·z로 간다
    const round = (CHIBI_HEAD * fit.scale) / girth
    for (const bone of heads) bone.scale.set(CHIBI_HEAD, round, round)
    // 리그가 뼈 자리를 월드에서 재므로 바뀐 배율을 먼저 반영한다
    inner.updateMatrixWorld(true)
  }
  // 리그는 정규화 **이후**에 만든다 — 본의 월드 회전에서 로컬 축을 뽑기 때문에
  // 래퍼 변환이 확정된 뒤라야 축이 맞는다 (`PlayerModel`과 같은 순서)
  const rig = createRig(body, inner)
  return { outer, rig, lastX: 0, lastZ: 0, height, dropped: false, tag }
}
