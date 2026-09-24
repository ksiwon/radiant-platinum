import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AnimationMixer, Group, LoopOnce, LoopRepeat, Mesh, type AnimationClip, type Object3D,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { WebGPURenderer } from 'three/webgpu'
import { warmBeforeShow } from '../warmPipelines'
import { assets, type AssetPath } from '../../data/providers/assetProvider'
import { normalizeModel, PLAYER_HEIGHT } from '../../engine/model/normalize'
import { ClockReader, battleClock } from '../../engine/battle/presentationClock'
import type { BattleView } from '../../engine/battle/view'
import { useBattleStore } from '../../state/battleStore'
import { useSaveStore } from '../../state/saveStore'
import { playerModelPath } from '../playerModelPath'
import { trainerStandAt } from './battleBallMotion'
import type { SlotId } from '../../engine/battle/events'
import { TRAINER_CLIP, trainerFallbackPalette, trainerLost } from './battleTrainerVisual'
import { trainerModelBundle } from '../../engine/actor/npcModels'
import { unifySkeletons } from '../unifySkeleton'

const loader = new GLTFLoader()
const SECONDARY_OUTFIT = ['hair2', 'shoes2']

function throwKey(view: BattleView | null, mine: boolean, only: SlotId | null = null): string {
  if (!view) return ''
  // 한 쪽에 트레이너가 둘이면 **제 자리**의 교체에만 던지는 몸짓을 한다
  if (only !== null) return view.active[only]?.key ?? ''
  const side = mine ? 'p1' : 'p2'
  return [view.active[`${side}a`]?.key ?? '', view.active[`${side}b`]?.key ?? ''].join('/')
}

function ProceduralTrainer({ trainerClass }: { trainerClass: number | null }) {
  const palette = trainerFallbackPalette(trainerClass)
  const arm = useRef<Group>(null)
  useFrame(() => {
    // 공통 연출 시계다 — 재생기가 서면 사람도 선다 (`presentationClock`)
    if (arm.current) arm.current.rotation.x = Math.sin(battleClock.now() * 1.4) * 0.035
  })
  return (
    <group>
      <mesh position={[0, 1.03, 0]} castShadow>
        <capsuleGeometry args={[0.21, 0.52, 6, 12]} />
        <meshStandardMaterial color={palette.cloth} roughness={0.82} />
      </mesh>
      <mesh position={[0, 1.63, 0]} castShadow>
        <sphereGeometry args={[0.24, 16, 12]} />
        <meshStandardMaterial color="#ddb99a" roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.73, -0.04]} scale={[1.04, 0.72, 1]} castShadow>
        <sphereGeometry args={[0.255, 16, 10]} />
        <meshStandardMaterial color={palette.hair} roughness={0.9} />
      </mesh>
      <group ref={arm} position={[0.28, 1.3, 0]} rotation={[0, 0, -0.18]}>
        <mesh position={[0, -0.23, 0]} castShadow>
          <capsuleGeometry args={[0.065, 0.36, 4, 8]} />
          <meshStandardMaterial color={palette.accent} roughness={0.82} />
        </mesh>
      </group>
      <group position={[-0.28, 1.3, 0]} rotation={[0, 0, 0.18]}>
        <mesh position={[0, -0.23, 0]} castShadow>
          <capsuleGeometry args={[0.065, 0.36, 4, 8]} />
          <meshStandardMaterial color={palette.accent} roughness={0.82} />
        </mesh>
      </group>
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} position={[x, 0.49, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.5, 4, 8]} />
          <meshStandardMaterial color="#293142" roughness={0.88} />
        </mesh>
      ))}
    </group>
  )
}

function TrainerActor({
  path,
  trainerClass,
  mine,
  view,
  slot,
  paired = false,
}: {
  path: AssetPath | null
  trainerClass: number | null
  mine: boolean
  view: BattleView | null
  /** 이 사람의 자리. 한 쪽에 한 사람이면 `a`다 */
  slot: SlotId
  /** 이 쪽에 트레이너가 둘인가 (PARITY §2.2b). 둘이면 자리대로 옆으로 비켜 선다 */
  paired?: boolean
}) {
  const host = useRef<Group>(null)
  const wrapper = useRef<Group>(null)
  const [model, setModel] = useState<Group | null>(null)
  /**
   * 구운 클립을 도는 자. 클립이 없는 몸이면 null이고, 그때는 아래 절차형
   * 몸짓이 그대로 돈다 — **절차형을 지우지 않는다** (인물 106벌 중 치비로
   * 떨어지는 사람과, 몸을 아예 못 구운 사람이 계속 그것을 쓴다)
   */
  const clips = useRef<{ mixer: AnimationMixer, by: Map<string, AnimationClip> } | null>(null)
  const seen = useRef('')
  const gestureStarted = useRef(-100)
  /**
   * 인물의 몸이 쓰는 시간도 **공통 연출 시계**에서 뗀다.
   *
   * ⚠️ `useFrame`의 delta와 `performance.now()`는 벽시계라 탭 숨김도
   * `MAX_STEP_MS`도 모른다 — 긴 프레임 하나에 던지는 몸짓이 통째로 끝났다
   */
  const bodyTime = useRef(new ClockReader())
  /** 지금 걸린 「끝나면 쉬기」 손잡이. 클립을 갈아 끼울 때 뗀다 */
  const rest = useRef<(() => void) | null>(null)
  /** 내 쪽에서 본 결말. 누가 진 동작을 하는지는 `trainerLost`가 가른다 */
  const outcome = useBattleStore((state) => state.outcome)
  const origin = trainerStandAt(slot, paired)
  const facing = Math.atan2(-origin[0], -origin[2])
  const key = throwKey(view, mine, paired ? slot : null)

  /**
   * 클립 하나를 돌린다.
   *
   * 한 번만 돌고 마지막 자세에서 멈추는 것이 기본이고, **쉬는 동작만
   * 되풀이한다** — 명령을 기다리는 동안 계속 돌아야 하기 때문이다.
   * 클립이 없으면 false를 돌려주고, 부르는 쪽이 절차형으로 떨어진다
   */
  const playClip = useCallback((name: string): boolean => {
    const set = clips.current
    const clip = set?.by.get(name)
    if (!set || !clip) return false
    const loop = name === TRAINER_CLIP.wait
    // 앞 클립이 걸어 둔 「끝나면 쉬기」를 먼저 뗀다. `stopAllAction`은 `finished`를
    // 안 내므로 안 떼면 그 손잡이가 다음 클립의 끝에 얹혀 두 번 돈다
    dropRest()
    set.mixer.stopAllAction()
    const action = set.mixer.clipAction(clip)
    action.reset()
    action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1)
    action.clampWhenFinished = !loop
    action.play()
    /**
     * ⚠️ **한 번 돌 클립이 끝나면 쉬는 동작으로 되돌아간다.**
     *
     * 이게 없으면 트레이너가 그 자리에서 굳는다 — 등장 클립은 4.13초고
     * 배틀은 몇 분이라, 나머지 시간 내내 **마지막 자세 그대로** 서 있었다.
     * 움직이는 것이 아래 1.2cm짜리 사인파 하나뿐이었다.
     *
     * 진 동작만 안 되돌린다 — 배틀이 끝난 뒤라 다시 일어서면 안 된다
     */
    if (!loop && name !== TRAINER_CLIP.lose) {
      const back = (): void => { dropRest(); playClip(TRAINER_CLIP.wait) }
      rest.current = back
      set.mixer.addEventListener('finished', back as never)
    }
    return true
    // 참조하는 것이 전부 ref라 한 번 만들고 계속 쓴다 — 아래 효과들이 이것을
    // 의존으로 들 수 있어야 매 렌더마다 다시 도는 일이 안 생긴다
  }, [])

  /** 걸어 둔 「끝나면 쉬기」를 뗀다 */
  const dropRest = (): void => {
    const back = rest.current
    if (!back) return
    rest.current = null
    clips.current?.mixer.removeEventListener('finished', back as never)
  }

  useEffect(() => {
    if (!key || key === seen.current) return
    seen.current = key
    // 공을 던지며 지시한다. 클립이 없는 몸이면 절차형 팔이 그 자리를 맡는다
    if (!playClip(TRAINER_CLIP.order)) gestureStarted.current = battleClock.now()
  }, [key, playClip])

  // 졌으면 진 동작. 이겼거나 잡기·도망이면 아무것도 안 한다
  useEffect(() => {
    if (trainerLost(outcome, mine)) playClip(TRAINER_CLIP.lose)
  }, [outcome, mine, playClip])

  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer
  const r3fScene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    let alive = true
    setModel(null)
    if (!path)
      return () => {
        alive = false
      }
    const provider = assets()
    void provider
      .objectUrl(path)
      .then(async (url) => {
        try {
          const gltf = await loader.loadAsync(url)
          if (!alive) return
          // ⚠️ **복제하기 전에 뼈대를 합친다.** 조각마다 뼈 수가 다르면 그
          // 수만큼 셰이더가 갈리고, 그보다 나쁘게 **three가 재질 하나에 유니폼
          // 버퍼를 하나만 만든다** — 크기가 처음 그 재질을 세운 조각의 뼈 수로
          // 굳고 값은 그릴 때마다 그 물체의 것을 읽으므로, 같은 재질을 뼈 수가
          // 다른 조각 둘이 나눠 쓰면 큰 쪽 행렬이 작은 쪽 버퍼로 간다
          // (`skinning`의 `referenceBuffer`). 주인공이 정확히 그랬다 — `wear`를
          // **뼈 131벌짜리 몸통과 9벌짜리 신발**이 나눠 써서 WebGPU가 그 쓰기를
          // 버렸고, 그 조각들이 낡은 행렬로 그려졌다 (REPAIR §8.1).
          // ⚠️ **복제 전이어야 한다** — `unifySkeletons`가 `skinIndex`를 고쳐
          // 쓰는데 복제본은 지오메트리를 **참조로** 물려받는다
          unifySkeletons(gltf.scene)
          const root = cloneSkinned(gltf.scene) as Group
          // ⚠️ **클립은 복제본에 다시 걸어야 한다.** `cloneSkinned`가 뼈를 새로
          // 만들므로 원본 씬에 건 자는 아무 뼈도 못 찾는다. 이름은 그대로라
          // 복제본을 뿌리로 삼은 자가 같은 길을 찾는다
          clips.current = gltf.animations.length > 0
            ? {
                mixer: new AnimationMixer(root),
                by: new Map(gltf.animations.map((c) => [c.name, c])),
              }
            : null
          root.traverse((object: Object3D) => {
            if (SECONDARY_OUTFIT.some((part) => object.name.includes(part))) object.visible = false
            if (object instanceof Mesh) object.castShadow = true
          })
          // ⚠️ **굽고 나서 세운다.** 스킨 사람 하나에 정점 프로그램 하나고, 그
          // 링크 확인이 ANGLE에서 100ms 넘게 막는다 (`warmPipelines`). 트레이너전은
          // 둘이 한꺼번에 서므로 그대로 두면 두 배로 쌓인다
          await warmBeforeShow(gl, r3fScene, camera, root)
          if (!alive) return
          setModel(root)
        } finally {
          provider.releaseObjectUrl(path)
        }
      })
      .catch(() => {
        /* The procedural trainer remains visible when an optional class model is absent. */
      })
    return () => {
      alive = false
      clips.current?.mixer.stopAllAction()
      clips.current = null
    }
  }, [path, gl, r3fScene, camera])

  useLayoutEffect(() => {
    if (wrapper.current && model) normalizeModel(wrapper.current, model, PLAYER_HEIGHT)
  }, [model])

  // 몸이 서면 배틀에 들어서는 동작부터. 없으면 아무것도 안 한다 (선 자세 그대로)
  useEffect(() => {
    if (model) playClip(TRAINER_CLIP.advent)
  }, [model, playClip])

  useFrame(() => {
    const now = battleClock.now()
    clips.current?.mixer.update(bodyTime.current.read(now))
    const node = host.current
    if (!node) return
    // 숨쉬는 흔들림. 쉬는 동작(`wait_b`)을 실은 뒤로는 **몸을 못 구운 사람**을
    // 위한 것이다 — 인물 106벌 중 절차형으로 떨어지는 사람이 그대로 이걸 쓴다.
    // 클립이 도는 몸에서도 겹쳐 둔다: 1.2cm라 클립을 안 흔들고, 없으면 절차형
    // 몸이 통째로 굳는다
    node.position.y = Math.sin(now * 1.2 + (mine ? 0 : 2.1)) * 0.012
    // ⚠️ **던지는 몸짓은 둘 중 하나만.** 클립이 있으면 `order_b`가 팔을
    // 돌리므로 여기서 몸통까지 기울이면 두 번 움직인다
    if (clips.current) return
    const elapsed = now - gestureStarted.current
    const throwAmount = elapsed >= 0 && elapsed < 0.72 ? Math.sin((elapsed / 0.72) * Math.PI) : 0
    node.rotation.x = -throwAmount * 0.2
    node.rotation.z = (mine ? -1 : 1) * throwAmount * 0.14
  })

  return (
    <group position={[origin[0], 0, origin[2]]} rotation={[0, facing, 0]}>
      <group ref={host}>
        <group ref={wrapper}>
          {model ? <primitive object={model} /> : <ProceduralTrainer trainerClass={trainerClass} />}
        </group>
      </group>
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36, 0.43, 36]} />
        <meshBasicMaterial color={mine ? '#75bfff' : '#ff8a91'} transparent opacity={0.32} />
      </mesh>
    </group>
  )
}

/** Player and opponent bodies placed behind their Pokémon on the 3D battle arena. */
/** 그 분류의 몸 파일. 못 구운 분류면 null — 절차형 몸으로 선다 */
function bodyOf(trainerClass: number | null): AssetPath | null {
  const bundle = trainerModelBundle(trainerClass)
  return bundle ? `models/npc/${bundle}.glb` : null
}

export function BattleTrainers() {
  const kind = useBattleStore((state) => state.kind)
  const trainerClass = useBattleStore((state) => state.trainerClass)
  // 트레이너가 넷인 판 (PARITY §2.2b) — 상대 둘은 자리 a·b에, 편은 내 옆에 선다
  const foes = useBattleStore((state) => state.foes)
  const partner = useBattleStore((state) => state.partner)
  const view = useBattleStore((state) => state.view)
  const gender = useSaveStore((state) => state.trainer.gender)
  const opponentPath = useMemo(() => bodyOf(trainerClass), [trainerClass])
  const second = foes[1] ?? null
  const secondPath = useMemo(() => bodyOf(second?.classId ?? null), [second])
  const partnerPath = useMemo(() => bodyOf(partner?.classId ?? null), [partner])

  return (
    <>
      <TrainerActor
        path={playerModelPath(gender)} trainerClass={null} mine view={view}
        slot="p1a" paired={partner !== null}
      />
      {partner !== null && (
        <TrainerActor
          path={partnerPath} trainerClass={partner.classId} mine view={view} slot="p1b" paired
        />
      )}
      {kind === 'trainer' && (
        <TrainerActor
          path={opponentPath} trainerClass={trainerClass} mine={false} view={view}
          slot="p2a" paired={second !== null}
        />
      )}
      {kind === 'trainer' && second !== null && (
        <TrainerActor
          path={secondPath} trainerClass={second.classId} mine={false} view={view} slot="p2b" paired
        />
      )}
    </>
  )
}
