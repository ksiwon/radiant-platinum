import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, PointLight } from 'three'
import {
  type CinematicScene, type EvolutionPhase, type HatchPhase, type TradePhase, useCinematicStore,
} from '../state/cinematicStore'
import { EVO_MEMBER, evolutionBeats } from '../engine/pokemon/evolutionBeat'
import type { SplFile } from '../engine/battle/spl/resource'
import { useMonBody } from './monBody'
import { whitenBody, type Whitener } from './monWhiten'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { SplParticles } from './battle/SplParticles'
import type { SplCue } from './battle/splDraw'
import type { SplBasis } from './battle/splPlace'
import { preloadSplPack, splFileFor, SPL_EVOLVE } from './battle/splPack'
import { cinematicScale, evolutionPose, hatchPose, tradePose } from './cinematicMotion'

function Model({
  species,
  form,
  gender,
  shiny,
  white,
}: {
  species: number
  form: number
  gender?: 'male' | 'female' | 'genderless'
  shiny?: boolean
  /** 이 몸을 얼마나 하얗게 지울 것인가 (0~1). 프레임마다 바뀌므로 ref로 받는다 */
  white?: RefObject<number>
}) {
  const whitener = useRef<Whitener | null>(null)
  // 몸이 없으면 아래 절차형 몸으로 떨어진다
  const body = useMonBody(species, {
    form,
    gender,
    shiny,
    prepare: white
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

function Egg({ shell }: { shell: boolean }) {
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

interface Fragment {
  angle: number
  speed: number
  size: number
  lift: number
}

function HatchFragments({ active }: { active: boolean }) {
  const refs = useRef<Array<Mesh | null>>([])
  const started = useRef(performance.now() / 1000)
  const fragments = useMemo<Fragment[]>(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        angle: i * 2.399963,
        speed: 0.85 + (i % 5) * 0.13,
        size: 0.07 + (i % 3) * 0.025,
        lift: 1.1 + (i % 4) * 0.21,
      })),
    [],
  )

  useEffect(() => {
    started.current = performance.now() / 1000
  }, [active])

  useFrame(() => {
    const elapsed = performance.now() / 1000 - started.current
    const t = Math.min(1.4, elapsed)
    refs.current.forEach((mesh, i) => {
      if (!mesh) return
      const bit = fragments[i]!
      mesh.visible = active && elapsed < 1.45
      mesh.position.set(
        Math.cos(bit.angle) * bit.speed * t,
        0.9 + bit.lift * t - 1.5 * t * t,
        Math.sin(bit.angle) * bit.speed * t,
      )
      mesh.rotation.set(t * (i + 2), t * (i + 1.3), t * 2.1)
    })
  })

  return (
    <group>
      {fragments.map((bit, i) => (
        <mesh
          key={i}
          ref={(node) => {
            refs.current[i] = node
          }}
          visible={false}
          scale={bit.size}
        >
          <tetrahedronGeometry />
          <meshStandardMaterial color={i % 3 === 0 ? '#80b4d8' : '#fff8dc'} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

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
 * 원작 입자 카메라가 원점에서 보는 세로 폭 (DS 단위).
 *
 * `particle_system.c`의 기본 카메라가 (0,0,4)에서 원점을 보고 화각이 45도다
 */
const DS_VIEW_TALL = 2 * 4 * Math.tan((45 / 2) * (Math.PI / 180))

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
  const beforeRef = useRef<Group>(null)
  const afterRef = useRef<Group>(null)
  const eggRef = useRef<Group>(null)
  const lightRef = useRef<PointLight>(null)
  const started = useRef(performance.now() / 1000)
  const elapsed = useRef(0)
  // 몸 둘을 얼마나 하얗게 지웠나. 프레임마다 바뀌므로 상태가 아니라 ref다
  const white = useRef(0)

  // 진화 입자는 배틀과 **같은 묶음 읽개**로 온다 (`battle/splPack`)
  const [evoFile, setEvoFile] = useState<SplFile | null>(null)
  useEffect(() => {
    if (scene !== 'evolution') return undefined
    let alive = true
    void preloadSplPack(SPL_EVOLVE).then(() => {
      if (alive) setEvoFile(splFileFor(SPL_EVOLVE, EVO_MEMBER))
    })
    return () => {
      alive = false
    }
  }, [scene])
  const beats = useMemo(() => evolutionBeats(evoFile), [evoFile])

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

  useFrame(() => {
    elapsed.current = performance.now() / 1000 - started.current
    const oldBody = beforeRef.current
    const newBody = afterRef.current
    const egg = eggRef.current

    if (scene === 'evolution') {
      // ⚠️ **시작 시각을 가게에서 받는다** — DOM 쪽 가림 띠·흰 막이 같은 마디표를
      // 보고 그리므로, 각자 제 시계를 재면 프레임이 밀린다 (`cinematicStore`)
      const frame = Math.max(0, ((performance.now() - startedAt) * 60) / 1000)
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
      white.current = 0
      const pose = hatchPose(phase as HatchPhase, elapsed.current)
      if (egg) {
        egg.visible = pose.shellVisible
        egg.rotation.z = pose.rock
        egg.position.y = pose.lift
      }
      if (oldBody) oldBody.visible = false
      if (newBody) {
        newBody.visible = phase === 'born'
        newBody.position.y = 0
        newBody.scale.setScalar(phase === 'born' ? Math.min(1, 0.28 + elapsed.current * 1.8) : 0)
      }
      if (lightRef.current) lightRef.current.intensity = phase === 'born' ? 1.5 : 0.35
    }
  })

  const born = scene === 'hatch' && phase === 'born'
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
      {scene === 'evolution' && phase !== 'canceled' && evoFile && (
        <EvolutionParticles file={evoFile} seq={startedAt} />
      )}
      <group ref={eggRef} position={[0, 0, 0]}>
        <Egg shell={scene === 'hatch' && phase === 'shaking'} />
      </group>
      <HatchFragments active={born} />

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
