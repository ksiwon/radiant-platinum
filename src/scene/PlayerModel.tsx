// 플레이어 캐릭터 모델 (PLAN §4.3) — BDSP 풀비율 모델을 glb로 변환한 것
// 모델 전방은 +Z. playerSystem의 facing = atan2(vx, vz) 규약과 그대로 일치한다.
import { Suspense, useEffect, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  AnimationMixer, LoopOnce, LoopRepeat, Mesh, Quaternion,
  type AnimationClip, type MeshStandardMaterial, type Group, type Object3D,
} from 'three'
import { normalizeModel, PLAYER_HEIGHT } from '../engine/model/normalize'
import { createRig } from '../engine/actor/locomotion'
import { HERO_CLIP_NONE, tickHeroClip, type HeroClipState } from '../engine/actor/heroClips'
import { worldState } from '../state/worldState'
import { fishing } from './fishingSystem'
import { flyTransitionPhase } from './flyTransition'
import { wateringActive } from './berryPatches'
import { BikeModel } from './BikeModel'
import { FieldActionEffects } from './FieldActionEffects'
import { sceneRefs } from './sceneRefs'
import { useAssetUrl } from '../data/providers/useAssetUrl'

// 대체 복장용 메시 — 기본 복장과 겹쳐 z-fighting을 내므로 꺼둔다
import { useSaveStore } from '../state/saveStore'
import { playerModelPath } from './playerModelPath'
import { unifySkeletons } from './unifySkeleton'
const ALT_OUTFIT = ['hair2', 'shoes2']

/** 구운 클립을 도는 자. 클립이 없는 설치본에서는 `null`이고 절차형이 그대로 돈다 */
interface ClipSet {
  mixer: AnimationMixer
  by: Map<string, AnimationClip>
  /**
   * 클립을 걸기 전 뼈의 로컬 회전.
   *
   * ⚠️ **끝났다고 저절로 돌아오지 않는다.** `clampWhenFinished`가 마지막 자세를
   * 붙들고 있고, 절차형(`locomotion`)이 다시 쓰는 것은 제가 아는 관절 열둘뿐이라
   * 손가락·가방끈·목도리는 낚싯대를 던진 자세로 굳는다
   */
  rest: Map<Object3D, Quaternion>
}

export function PlayerModel() {
  const groupRef = useRef<Group>(null)
  const normRef = useRef<Group>(null)
  const clips = useRef<ClipSet | null>(null)
  const playing = useRef<HeroClipState>(HERO_CLIP_NONE)
  // 주소를 Provider에서 받는다 — 공개판에서는 OPFS Blob URL이다 (IMPORT.md §7).
  const gender = useSaveStore((state) => state.trainer.gender)
  const modelPath = playerModelPath(gender)
  // 세션 내내 사는 모델이라 참조를 안 놓는다 (`useAssetUrl` 머리말)
  const gltf = useLoader(GLTFLoader, useAssetUrl(modelPath))

  useEffect(() => {
    // ⚠️ **조각마다 뼈 수가 다르면 그 수만큼 셰이더가 갈린다** (`unifySkeleton`).
    // 주인공은 조각 열하나에 스킨 여섯이라 혼자서 프로그램을 여섯 개 쓴다.
    // 여기 씬은 `useLoader`가 캐시해 세션 내내 하나뿐이라 두 번 걸릴 일이 없다
    unifySkeletons(gltf.scene)
    gltf.scene.traverse((o) => {
      if (ALT_OUTFIT.some((n) => o.name.includes(n))) o.visible = false
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      // 알베도는 tools/extract/bdsp_bake_albedo.py가 이미 구워 넣었다 (BDSP 레이어 색상 →
      // 평범한 albedo 텍스처). 여기서는 원작 툰 룩에 맞게 반사만 눌러둔다.
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        const std = m as MeshStandardMaterial
        std.roughness = 0.85
        std.metalness = 0.0
      }
    })
  }, [gltf])

  // 정규화는 머티리얼 처리 이후, 그리고 씬 등록 이전에 한 번
  useEffect(() => {
    if (!normRef.current) return
    const r = normalizeModel(normRef.current, gltf.scene, PLAYER_HEIGHT)
    if (import.meta.env.DEV) {
      console.info(
        `[model] ${modelPath} 원본 ${r.nativeHeight.toFixed(3)} → ${PLAYER_HEIGHT}m (×${r.scale.toFixed(4)})`,
      )
    }

    // 리그는 정규화 **이후**에 만든다. 본의 월드 회전에서 로컬 축을 뽑기 때문에
    // 래퍼 변환이 확정된 뒤라야 축이 맞는다.
    // bob은 본이 아니라 래퍼에 건다 — 스킨 바인드를 건드리지 않는다
    const rig = createRig(gltf.scene, normRef.current)
    sceneRefs.playerRig = rig
    if (import.meta.env.DEV && !rig) {
      console.warn('[model] 보행 리그를 만들지 못했다 — 필요한 본이 없다. 바인드 포즈로 둔다')
    }

    // ⚠️ **여기서 뜬다.** 절차형이 뼈에 쓰기 전에 바인드 자세를 떠 놓아야
    // 클립이 끝났을 때 돌아갈 자리가 남는다
    if (gltf.animations.length > 0) {
      const rest = new Map<Object3D, Quaternion>()
      gltf.scene.traverse((o) => rest.set(o, o.quaternion.clone()))
      clips.current = {
        mixer: new AnimationMixer(gltf.scene),
        by: new Map(gltf.animations.map((c) => [c.name, c])),
        rest,
      }
    } else if (import.meta.env.DEV) {
      // 설치본의 `npcModels` 판이 낡으면 여기로 온다 (`assetFormat`의 `GROUP_FORMAT`)
      console.info('[model] 주인공 몸에 클립이 없다 — 필드 동작은 절차형으로 돈다')
    }
    playing.current = HERO_CLIP_NONE
    return () => {
      sceneRefs.playerRig = null
      clips.current?.mixer.stopAllAction()
      clips.current = null
      sceneRefs.playerClip = false
    }
  }, [gltf, modelPath])

  /**
   * 구운 필드 동작을 돌린다 (`engine/actor/heroClips`).
   *
   * ⚠️ **우선순위를 안 준다.** 기본값 0이라 `EngineDriver`(1)보다 먼저 돌고,
   * 그쪽이 `sceneRefs.playerClip`을 보고 절차형을 건너뛴다 — 순서가 뒤집히면
   * 클립이 매 프레임 걷는 자세로 덮인다
   */
  useFrame((_, delta) => {
    const set = clips.current
    if (!set) return
    const want = tickHeroClip(playing.current, {
      fishing: fishing.state,
      fly: flyTransitionPhase(),
      action: worldState.player.fieldAction,
      watering: wateringActive(),
    }, delta)
    const clip = want.name !== null ? set.by.get(want.name) : undefined
    if (want.name !== playing.current.name) {
      set.mixer.stopAllAction()
      if (clip) {
        const action = set.mixer.clipAction(clip)
        action.reset()
        action.setLoop(want.loop ? LoopRepeat : LoopOnce, want.loop ? Infinity : 1)
        action.clampWhenFinished = !want.loop
        action.play()
      } else {
        // 돌 것이 없다 — 뼈를 바인드로 되돌려 절차형에 넘긴다
        for (const [node, q] of set.rest) node.quaternion.copy(q)
      }
    }
    playing.current = want
    set.mixer.update(delta)
    // 클립을 못 찾았으면(낡은 설치본) 켜지 않는다. 그때는 절차형이 그 자리다
    sceneRefs.playerClip = clip !== undefined
  })

  // ⚠️ **모델이 바뀔 때마다 다시 등록한다.** `useAssetUrl`은 `use(promise)`라
  // 서스펜드하는데, 오프닝에서 성별을 고르면 `modelPath`가 바뀌어 경계가 **한 번
  // 더** 서스펜드한다. 그 사이 폴백(`PlayerCapsule`)이 다시 붙었다 떨어지면서
  // 자리를 비우므로, 한 번만(`[]`) 거는 등록은 영영 안 돌아온다 — 엔진이 위치를
  // 쓸 곳이 없어져 **몸은 제자리에 선 채 팔다리만 움직인다**. 실측한 순서는
  // 캡슐 등록 38.0초 → 캡슐 해제(null) 38.6초 → 리그만 다시 섬 38.6초였다.
  useEffect(() => {
    const node = groupRef.current
    sceneRefs.player = node
    // 내가 넣은 것일 때만 뺀다 — 나보다 늦게 온 쪽의 등록을 지우지 않는다
    return () => { if (sceneRefs.player === node) sceneRefs.player = null }
  }, [gltf, modelPath])

  return (
    // 바깥 그룹은 엔진이 매 프레임 위치·방향을 쓴다. 안쪽 그룹은 정규화 전용이라 서로 간섭하지 않는다.
    <group ref={groupRef}>
      <group ref={normRef}>
        <primitive object={gltf.scene} />
      </group>
      {/* 자전거는 정규화 밖이다 — 번들 단위 그대로고 발밑이 원점이다 */}
      <Suspense fallback={null}><BikeModel /></Suspense>
      <FieldActionEffects bodyRef={normRef} />
    </group>
  )
}
