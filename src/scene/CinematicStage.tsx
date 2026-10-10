import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, PointLight } from 'three'
import {
  type CinematicScene, type EvolutionPhase, type HatchPhase, type TradePhase, useCinematicStore,
} from '../state/cinematicStore'
import { EVO_MEMBER, evolutionBeats } from '../engine/pokemon/evolutionBeat'
import { EGG_MEMBER, hatchBeats } from '../engine/pokemon/hatchBeat'
import type { SplFile } from '../engine/battle/spl/resource'
import { useMonBody } from './monBody'
import { whitenBody, type Whitener } from './monWhiten'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { SplParticles } from './battle/SplParticles'
import type { SplCue } from './battle/splDraw'
import type { SplBasis } from './battle/splPlace'
import { preloadSplPack, splFileFor, SPL_EGG, SPL_EVOLVE } from './battle/splPack'
import {
  BODY_SHIFT_TALL, cinematicScale, evolutionPose, hatchPose, shiftToward, tradePose,
} from './cinematicMotion'
import { EGG_SCALE, loadEggModel, type EggModel } from './cinematicEgg'

function Model({
  species,
  form,
  gender,
  shiny,
  white,
  opacity,
}: {
  species: number
  form: number
  gender?: 'male' | 'female' | 'genderless'
  shiny?: boolean
  /** 이 몸을 얼마나 하얗게 지울 것인가 (0~1). 프레임마다 바뀌므로 ref로 받는다 */
  white?: RefObject<number>
  /** 이 몸이 얼마나 보이나 (0~1) — 껍질몬이 0.4초에 선다. 프레임마다 바뀌므로 ref로 받는다 */
  opacity?: RefObject<number>
}) {
  const whitener = useRef<Whitener | null>(null)
  // 몸이 없으면 아래 절차형 몸으로 떨어진다
  const body = useMonBody(species, {
    form,
    gender,
    shiny,
    prepare: white || opacity
      ? (made) => {
          // ⚠️ **재질을 이 몸 몫으로 복제한다** — `SkeletonUtils.clone`이 재질을
          // 나눠 쓰므로 그대로 칠하면 다른 화면의 같은 종까지 하얘진다
          const own = whitenBody(made.root)
          whitener.current = own
          return () => {
            own.dispose()
            whitener.current = null
          }
        }
      : undefined,
  })

  useFrame(() => {
    if (white) whitener.current?.set(white.current)
    if (opacity) whitener.current?.fade(opacity.current)
  })

  if (!body) return <FallbackModel species={species} />
  return (
    <group scale={cinematicScale(body.tall)}>
      <primitive object={body.root} />
    </group>
  )
}

/** 설치본에 해당 종 GLB가 없을 때도 2D로 돌아가지 않는 입체 실루엣. */
function FallbackModel({ species }: { species: number }) {
  const hue = (species * 47) % 360
  const color = `hsl(${String(hue)} 48% 58%)`
  return (
    <group position={[0, 0.72, 0]}>
      <mesh castShadow position={[0, 0.35, 0]}>
        <capsuleGeometry args={[0.48, 0.72, 8, 18]} />
        <meshStandardMaterial color={color} roughness={0.78} />
      </mesh>
      <mesh castShadow position={[-0.28, 1.03, 0]} rotation={[0, 0, 0.42]}>
        <coneGeometry args={[0.2, 0.55, 8]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0.28, 1.03, 0]} rotation={[0, 0, -0.42]}>
        <coneGeometry args={[0.2, 0.55, 8]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  )
}

/**
 * 알. BDSP 알 모델(`cinematicEgg`)에 정점 얼룩을 칠해 세운다. 묶음에 모델이 없으면(옛 판 · 설치 전) 예전의 도형 알로 떨어진다
 * — 2D로 돌아가지 않는다(몸의 `FallbackModel`과 같은 규칙)
 */
function Egg({ shell }: { shell: boolean }) {
  const [model, setModel] = useState<EggModel | null>(null)
  useEffect(() => {
    let alive = true
    void loadEggModel().then((got) => { if (alive) setModel(got) })
    return () => {
      alive = false
    }
  }, [])
  if (model === null) return <ShapeEgg shell={shell} />
  return (
    <group visible={shell}>
      <mesh castShadow geometry={model.geometry} position={[0, model.lift * EGG_SCALE, 0]} scale={EGG_SCALE}>
        <meshStandardMaterial vertexColors roughness={0.62} />
      </mesh>
    </group>
  )
}

/** 모델이 없을 때의 도형 알 — 구 하나와 얼룩 다섯 */
function ShapeEgg({ shell }: { shell: boolean }) {
  const spots = useMemo(
    () =>
      [
        [-0.38, 0.18, 0.68],
        [0.41, 0.32, 0.63],
        [-0.22, 0.72, 0.58],
        [0.32, 0.86, 0.5],
        [0.02, -0.12, 0.75],
      ] as const,
    [],
  )
  return (
    <group visible={shell}>
      <mesh castShadow position={[0, 0.88, 0]} scale={[0.82, 1.08, 0.82]}>
        <sphereGeometry args={[0.82, 36, 28]} />
        <meshStandardMaterial color="#fff8dc" roughness={0.62} />
      </mesh>
      {spots.map((spot, i) => (
        <mesh key={i} position={spot} scale={[0.22, 0.16, 0.06]}>
          <sphereGeometry args={[1, 18, 12]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#80b4d8' : '#e7a6b7'} roughness={0.72} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * ⚠️ **알 조각을 도형으로 안 뿌린다.** 사면체 열여덟을 우리가 날리고 있었는데,
 * 원작은 `egg_demo_particle`의 이미터 넷을 세운다 — 첫 조각 · 더 깨진 조각 ·
 * 터짐 · 반짝임이고 마디도 자료가 정한다 (`engine/pokemon/hatchBeat`).
 * 그래서 그 도형들을 걷어 내고 `HatchParticles`가 그 자리를 맡는다.
 */

/**
 * 원작이 진화 이미터를 세우는 자리 — `SPLEmitter_SetPos(e, (0, 8*172, 0))`.
 * fx32라 `1376 / 4096` DS 단위다
 */
const EVO_EMITTER_Y = (8 * 172) / 4096

/**
 * 카메라가 무대를 보는 자리. 눈과 겨눔점 (`CINEMATIC_ORIGIN` 기준).
 *
 * ⚠️ **입자 배율이 이 값에서 나온다.** 아래 `EVO_METRE`가 「원작 화면이 담던
 * 만큼을 우리 화면도 담는다」로 배율을 내므로, 카메라를 옮기면 배율이 같이
 * 따라간다 — 두 자리에 따로 적으면 조용히 어긋난다
 */
const EVO_EYE = [0, 2.5, 7] as const
const EVO_AIM = [0, 1.25, 0] as const

/**
 * 몸이 서 있는 거리에서 화면 세로가 담는 폭(월드 단위). 기술 창이 열릴 때 몸이 비켜서는 폭을 화면 높이의 몫으로
 * 주려고 잰다 (`BODY_SHIFT_TALL`)
 */
const VIEW_TALL = (() => {
  const far = Math.hypot(EVO_EYE[1] - EVO_AIM[1], EVO_EYE[2] - EVO_AIM[2])
  return 2 * far * Math.tan((cinematicStage.fov / 2) * (Math.PI / 180))
})()

/** 껍질몬이 새 몸 옆에 설 때 둘이 갈라 서는 폭 — 새 몸은 왼쪽으로, 껍질몬은 오른쪽으로 */
const COMPANION_X = 1.15
/** 껍질몬이 서는 데 걸리는 시간 (진화 설계 §4.5의 0.4초) */
const COMPANION_FADE_S = 0.4

/** 움직임을 줄이는 설정인가 — 몸이 비켜서는 것을 곧장 한다 */
function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 원작 입자 카메라가 원점에서 보는 세로 폭 (DS 단위) — **여덟이다.**
 *
 * `particle_system.c`의 기본 카메라가 (0,0,4)에서 원점을 보고 화각이 45도인데,
 * 그 45도가 **반각**이다. 연출들이 이 카메라를 **정사영**으로 쓰고
 * (`ParticleSystem_SetCameraProjection(…, 1)`) 정사영 쪽 셈이 그것을 못 박는다:
 *
 *     top = (sinFovY / cosFovY) × distance = tan(45°) × 4 = 4
 *
 * (`camera.c`의 `Camera_ComputeProjectionMatrix`. `Camera_Init`이 `fovY`를
 * **반으로 안 나누고** 그대로 사인·코사인을 뜬다.) 위아래로 4씩이니 세로가 8이다
 */
export const DS_VIEW_TALL = 8

/**
 * DS 한 단위가 우리 무대의 몇 미터인가.
 *
 * ⚠️ **몸 키로 재지 않는다.** 배틀 입자는 `splMetre`로 몸에 맞추는데(연출이
 * 포켓몬에 걸리므로), 진화 연출은 **화면 전체를 덮는 빛**이라 그렇게 재면 큰
 * 판때기의 네 변이 화면 안에 들어와 **네모난 자국**으로 보인다 — 실제로 처음
 * 그렇게 나왔다. 원작이 화면의 몇 할을 덮었는지를 그대로 옮긴다: 원작 화면의
 * 세로 폭과 우리 화면의 세로 폭을 맞추면 된다
 */
const EVO_METRE = (() => {
  const far = Math.hypot(EVO_EYE[1] - EVO_AIM[1], EVO_EYE[2] - EVO_AIM[2])
  const tall = 2 * far * Math.tan((cinematicStage.fov / 2) * (Math.PI / 180))
  return tall / DS_VIEW_TALL
})()

/**
 * 연출 무대의 축.
 *
 * 원작 입자 공간이 「카메라가 +Z에서 원점을 본다 · 위가 +Y」이고
 * (`particle_system.c`) 우리 연출 카메라도 그러므로 **항등**이다. 배틀처럼
 * `splBasis(by, foe)`를 쓰면 두 자리가 같아서 +X가 −Z로 눕는다
 */
const EVO_BASIS: SplBasis = { ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] }

/**
 * 진화 무대의 원작 입자 (PARITY §3.1).
 *
 * ⚠️ **몸 크기는 원작을 안 따라간다.** 원작은 두 모습을 **같은 스프라이트
 * 칸**(96px)에 그려서 찌르꼬든 찌르버드든 화면에서 같은 크기인데, 우리는
 * 실측 키로 세운다(`cinematicScale`) — 그래서 진화하며 몸이 실제로 커진다.
 * 3D 무대의 다른 연출(부화·교환·명예의 전당)이 다 실측 키를 쓰므로 여기만
 * 칸에 맞추면 그쪽과 어긋난다. **입자와 카메라는 원작 그대로**다
 */
function EvolutionParticles({ file, seq }: { file: SplFile, seq: number }) {
  const beats = useMemo(() => evolutionBeats(file), [file])
  const cues = useMemo<readonly SplCue[]>(
    () => beats.cues.map((cue) => ({ file, res: cue.res, at: 'center' as const, frame: cue.frame })),
    [beats, file],
  )
  // ⚠️ **원작 입자 공간의 원점은 화면 한가운데다** — 카메라가 원점을 보므로.
  // 우리 카메라가 겨누는 자리가 그 자리고, 이미터는 거기서 조금 위다
  const at = useMemo(
    () => [EVO_AIM[0], EVO_AIM[1] + EVO_EMITTER_Y * EVO_METRE, EVO_AIM[2]] as const,
    [],
  )
  return (
    <SplParticles
      key={seq}
      cues={cues}
      by={at}
      foe={at}
      metre={EVO_METRE}
      basis={EVO_BASIS}
      from={((performance.now() - seq) * 60) / 1000}
      seed={seq}
    />
  )
}

/** 알 부화의 원작 입자 (PARITY §3.2). 이미터를 원점에 세운다 */
function HatchParticles({ file, seq }: { file: SplFile, seq: number }) {
  const beats = useMemo(() => hatchBeats(file), [file])
  const cues = useMemo<readonly SplCue[]>(
    () => beats.cues.map((cue) => ({ file, res: cue.res, at: 'center' as const, frame: cue.frame })),
    [beats, file],
  )
  // `SetSPLEmitterPos`가 (0,0,0)이다 — 화면 한가운데, 곧 카메라가 겨누는 자리
  const at = useMemo(() => [EVO_AIM[0], EVO_AIM[1], EVO_AIM[2]] as const, [])
  return (
    <SplParticles
      key={seq}
      cues={cues}
      by={at}
      foe={at}
      metre={EVO_METRE}
      basis={EVO_BASIS}
      from={((performance.now() - seq) * 60) / 1000}
      seed={seq}
    />
  )
}

/** 무대 바닥의 고리 색. 장면마다 다르다 */
const RING_COLOR: Partial<Record<CinematicScene, string>> = {
  evolution: '#9ec6ff',
  hatch: '#fff0a8',
  trade: '#a8ffd4',
}

/** 진화·부화·교환을 별도 Canvas 없이 보여 주는 공용 3D 무대. */
export function CinematicStage() {
  const scene = useCinematicStore((s) => s.scene)
  const phase = useCinematicStore((s) => s.phase)
  const before = useCinematicStore((s) => s.before)
  const after = useCinematicStore((s) => s.after)
  const startedAt = useCinematicStore((s) => s.startedAt)
  const companion = useCinematicStore((s) => s.companion)
  const beforeRef = useRef<Group>(null)
  const afterRef = useRef<Group>(null)
  /** 두 몸을 한꺼번에 옮기는 짐 — 기술 창이 열리면 왼쪽으로 · 껍질몬이 서면 둘이 갈라 선다 */
  const shiftRef = useRef<Group>(null)
  const companionRef = useRef<Group>(null)
  const shiftX = useRef(0)
  /** 껍질몬이 얼마나 보이나. 프레임마다 바뀌므로 상태가 아니라 ref다 */
  const companionAlpha = useRef(0)
  const eggRef = useRef<Group>(null)
  const lightRef = useRef<PointLight>(null)
  const started = useRef(performance.now() / 1000)
  const elapsed = useRef(0)
  // 몸 둘을 얼마나 하얗게 지웠나. 프레임마다 바뀌므로 상태가 아니라 ref다
  const white = useRef(0)

  // 진화 입자는 배틀과 **같은 묶음 읽개**로 온다 (`battle/splPack`)
  const [evoFile, setEvoFile] = useState<SplFile | null>(null)
  const [eggFile, setEggFile] = useState<SplFile | null>(null)
  useEffect(() => {
    const want = scene === 'evolution'
      ? { group: SPL_EVOLVE, member: EVO_MEMBER, put: setEvoFile }
      : scene === 'hatch' ? { group: SPL_EGG, member: EGG_MEMBER, put: setEggFile } : null
    if (want === null) return undefined
    let alive = true
    void preloadSplPack(want.group).then(() => {
      if (alive) want.put(splFileFor(want.group, want.member))
    })
    return () => {
      alive = false
    }
  }, [scene])
  const beats = useMemo(() => evolutionBeats(evoFile), [evoFile])
  const eggBeats = useMemo(() => hatchBeats(eggFile), [eggFile])

  useEffect(() => {
    cinematicStage.active = true
    cinematicStage.position.set(
      CINEMATIC_ORIGIN.x + EVO_EYE[0],
      CINEMATIC_ORIGIN.y + EVO_EYE[1],
      CINEMATIC_ORIGIN.z + EVO_EYE[2],
    )
    cinematicStage.target.set(
      CINEMATIC_ORIGIN.x + EVO_AIM[0],
      CINEMATIC_ORIGIN.y + EVO_AIM[1],
      CINEMATIC_ORIGIN.z + EVO_AIM[2],
    )
    return () => {
      cinematicStage.active = false
    }
  }, [])

  useEffect(() => {
    started.current = performance.now() / 1000
  }, [scene, phase])

  useFrame((_, delta) => {
    elapsed.current = performance.now() / 1000 - started.current
    // 몸 옮김과 껍질몬 — 진화 장면에서만 쓴다
    {
      const now = useCinematicStore.getState()
      const aside = scene === 'evolution' && now.bodyShift
      const pair = scene === 'evolution' && now.companion !== null && !aside
      const target = aside ? -BODY_SHIFT_TALL * VIEW_TALL : pair ? -COMPANION_X : 0
      shiftX.current = shiftToward(shiftX.current, target, Math.min(delta, 0.1), reducedMotion())
      if (shiftRef.current) shiftRef.current.position.x = shiftX.current
      // 껍질몬은 몸을 비켜 세운 뒤에 선다 — 기술 창이 열려 있는 동안은 안 보인다
      const since = (performance.now() - now.companionAt) / 1000
      companionAlpha.current = pair ? Math.min(1, Math.max(0, since / COMPANION_FADE_S)) : 0
      if (companionRef.current) companionRef.current.visible = companionAlpha.current > 0
    }
    const oldBody = beforeRef.current
    const newBody = afterRef.current
    const egg = eggRef.current

    if (scene === 'evolution') {
      // ⚠️ **시작 시각을 가게에서 받는다** — DOM 쪽 가림 띠·흰 막이 같은 마디표를
      // 보고 그리므로, 각자 제 시계를 재면 프레임이 밀린다 (`cinematicStore`)
      //
      // `announce`는 연출이 아직 안 열린 때다 — 옛 몸이 온전히 서서 운다. 0프레임의
      // 자세(크기 1·0, 흰색 0)를 그대로 든다
      const frame = phase === 'announce' ? 0 : Math.max(0, ((performance.now() - startedAt) * 60) / 1000)
      const pose = evolutionPose(phase as EvolutionPhase, frame, beats)
      white.current = pose.white
      // ⚠️ **높이를 되돌린다.** 교환 장면이 몸을 띄워 놓고 끝나므로, 안 되돌리면
      // 다음 진화가 공중에서 일어난다 — 무대가 한 벌뿐이라 상태가 남는다
      if (oldBody) {
        oldBody.visible = pose.beforeVisible
        oldBody.position.y = 0
        oldBody.scale.setScalar(pose.beforeScale)
      }
      if (newBody) {
        newBody.visible = pose.afterVisible
        newBody.position.y = 0
        newBody.scale.setScalar(pose.afterScale)
      }
      if (egg) egg.visible = false
      if (lightRef.current) lightRef.current.intensity = pose.light
    } else if (scene === 'trade') {
      white.current = 0
      const pose = tradePose(phase as TradePhase, elapsed.current)
      if (oldBody) {
        oldBody.visible = pose.sendingVisible
        oldBody.position.y = pose.lift
        oldBody.scale.setScalar(pose.scale)
      }
      if (newBody) {
        newBody.visible = pose.receivingVisible
        newBody.position.y = pose.lift
        newBody.scale.setScalar(pose.scale)
      }
      if (egg) egg.visible = false
      if (lightRef.current) lightRef.current.intensity = pose.light
    } else {
      // 진화와 같은 시계를 본다 — 마디가 프레임 단위다 (`cinematicStore`)
      const frame = Math.max(0, ((performance.now() - startedAt) * 60) / 1000)
      const pose = hatchPose(phase as HatchPhase, frame, eggBeats)
      // 새 몸은 흰 막 속에서 나타나 새하얀 실루엣으로 머물다 막과 같이 풀린다
      white.current = pose.bornWhite
      if (egg) {
        egg.visible = pose.shellVisible
        egg.rotation.z = pose.rock
        egg.position.y = pose.lift
      }
      if (oldBody) oldBody.visible = false
      if (newBody) {
        newBody.visible = pose.bornVisible
        newBody.position.y = 0
        newBody.scale.setScalar(pose.bornScale)
      }
      if (lightRef.current) lightRef.current.intensity = pose.bornVisible ? 1.5 : 0.35
    }
  })

  return (
    <group position={CINEMATIC_ORIGIN}>
      <mesh position={[0, 3.1, -2.4]} scale={[18, 10, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#060914" fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6.5, 64]} />
        <meshStandardMaterial color="#121a31" roughness={0.92} fog={false} />
      </mesh>
      <hemisphereLight args={['#a9c9ff', '#241b38', 1.35]} />
      <directionalLight position={[-4, 7, 5]} intensity={2.1} color="#e6efff" castShadow />
      <pointLight ref={lightRef} position={[0, 2, 2.2]} color="#fff4bd" distance={8} />

      <group ref={shiftRef}>
        <group ref={beforeRef} position={[0, 0, 0]}>
          {before && (
            <Model
              species={before.species}
              form={before.form}
              gender={before.gender}
              shiny={before.shiny}
              white={white}
            />
          )}
        </group>
        <group ref={afterRef} position={[0, 0, 0]} visible={false}>
          {after && (
            <Model
              species={after.species}
              form={after.form}
              gender={after.gender}
              shiny={after.shiny}
              white={white}
            />
          )}
        </group>
      </group>
      {/* 껍질몬 — 글 없이 새 몸 옆에 0.4초에 선다 (원작도 말없이 파티에 넣는다) */}
      <group ref={companionRef} position={[COMPANION_X, 0, 0]} visible={false}>
        {companion && (
          <Model
            species={companion.species}
            form={companion.form}
            gender={companion.gender}
            shiny={companion.shiny}
            opacity={companionAlpha}
          />
        )}
      </group>
      {/* 입자는 연출의 0프레임(`START_FADE`)에 처음 선다 — 옛 종이 우는 동안은 없다 */}
      {scene === 'evolution' && phase !== 'canceled' && phase !== 'announce' && evoFile && (
        <EvolutionParticles file={evoFile} seq={startedAt} />
      )}
      {scene === 'hatch' && eggFile && <HatchParticles file={eggFile} seq={startedAt} />}
      <group ref={eggRef} position={[0, 0, 0]}>
        <Egg shell={scene === 'hatch' && phase === 'shaking'} />
      </group>

      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.05, 1.12, 64]} />
        <meshBasicMaterial
          color={RING_COLOR[scene] ?? '#fff0a8'}
          transparent
          opacity={0.5}
        />
      </mesh>
    </group>
  )
}
