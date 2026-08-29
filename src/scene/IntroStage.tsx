import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, MeshStandardMaterial } from 'three'
import { createRig, updateLocomotion, type Rig } from '../engine/actor/locomotion'
import { RUN_SPEED, WALK_SPEED } from '../engine/actor/player'
import { normalizeModel, PLAYER_HEIGHT } from '../engine/model/normalize'
import { type AssetPath } from '../data/providers/assetProvider'
import { useIntroStageStore } from '../state/introStageStore'
import { useMonBody } from './monBody'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { cinematicScale } from './cinematicMotion'
import { playerModelPath } from './playerModelPath'
import { NPC_BUNDLE } from '../engine/actor/npcModels'
import { usePersonModel } from './personModel'
import { INTRO_BALL, INTRO_CAMERA } from './introPlace'

function Person({
  path,
  position,
  selected = true,
}: {
  path: AssetPath
  position: readonly [number, number, number]
  selected?: boolean
}) {
  const wrapper = useRef<Group>(null)
  const host = useRef<Group>(null)
  /**
   * 서 있는 자세.
   *
   * ⚠️ **안 돌리면 T 자로 선다.** 사람 모델에는 클립을 안 싣고(`NpcModels`
   * 머리말) 걷기도 서기도 뼈를 직접 돌려 만든다. 오프닝은 그것을 안 돌려서
   * 마박사가 팔을 벌린 채 서 있었다 — 필드 NPC와 같은 것을 돌린다
   */
  const rig = useRef<Rig | null>(null)

  // 받아 손질하는 것은 전당과 같다. 안 오면 아래 절차형 몸이 그대로 선다
  const model = usePersonModel(path)

  useLayoutEffect(() => {
    if (!wrapper.current || !model) return
    normalizeModel(wrapper.current, model, PLAYER_HEIGHT)
    // 리그는 정규화 **이후**에 만든다 — 본의 월드 회전에서 축을 뽑기 때문에
    // 래퍼 변환이 확정된 뒤라야 축이 맞는다 (`PlayerModel`과 같은 순서)
    rig.current = createRig(model, wrapper.current)
    return () => { rig.current = null }
  }, [model])

  useFrame(({ clock }, delta) => {
    if (rig.current) updateLocomotion(rig.current, delta, 0, WALK_SPEED, RUN_SPEED)
    if (!host.current) return
    host.current.position.y = Math.sin(clock.elapsedTime * 1.5 + position[0]) * 0.018
  })

  return (
    <group position={position} scale={selected ? 1 : 0.88}>
      <group ref={host}>
        <group ref={wrapper}>
          {model ? (
            <primitive object={model} />
          ) : (
            <group position={[0, 0.78, 0]}>
              <mesh castShadow>
                <capsuleGeometry args={[0.28, 0.82, 8, 18]} />
                <meshStandardMaterial color="#74849d" roughness={0.82} />
              </mesh>
              <mesh position={[0, 0.72, 0]} castShadow>
                <sphereGeometry args={[0.25, 16, 12]} />
                <meshStandardMaterial color="#e6c4a5" roughness={0.78} />
              </mesh>
            </group>
          )}
        </group>
      </group>
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.49, 42]} />
        <meshBasicMaterial
          color={selected ? '#ffe8a6' : '#6f819e'}
          transparent
          opacity={selected ? 0.72 : 0.25}
        />
      </mesh>
    </group>
  )
}

/** 오프닝에 서는 이어롤 (`SPECIES_BUNEARY`) */
const BUNEARY = 427

function Buneary({ visible }: { visible: boolean }) {
  const host = useRef<Group>(null)
  // 몸이 안 오면 아래 절차형 몸이 선다
  const body = useMonBody(BUNEARY)
  const shown = useRef(0)

  useFrame((_, delta) => {
    shown.current += ((visible ? 1 : 0) - shown.current) * Math.min(1, delta * 5.5)
    const node = host.current
    if (!node) return
    const t = shown.current
    node.visible = t > 0.01
    /*
      원작은 볼에서 **떴다가 내려와 통통 튄다**
      (`RI_STATE_PKBL_ANIM_MV_PKM_UP_AND_FLASH_END` →
      `..._MV_PKM_DOWN_AND_BOUNCE`). 볼이 있던 높이에서 시작해 바닥에 내려서고,
      가는 길에 한 번 솟는다 — 예전에는 0.8m 높이에 **떠 있은 채로** 멈췄다
    */
    node.position.y = INTRO_BALL.at[1] * (1 - t) + Math.sin(Math.min(1, t) * Math.PI) * 0.25
    node.scale.setScalar((body ? cinematicScale(body.tall) : 1) * t)
  })

  return (
    <group ref={host} visible={false}>
      {body ? (
        <primitive object={body.root} />
      ) : (
        <group position={[0, 0.62, 0]}>
          <mesh castShadow>
            <capsuleGeometry args={[0.32, 0.62, 8, 16]} />
            <meshStandardMaterial color="#b88b62" roughness={0.82} />
          </mesh>
          <mesh position={[-0.18, 0.68, 0]} rotation={[0, 0, 0.22]} castShadow>
            <capsuleGeometry args={[0.11, 0.58, 6, 12]} />
            <meshStandardMaterial color="#d9b58e" roughness={0.8} />
          </mesh>
          <mesh position={[0.18, 0.68, 0]} rotation={[0, 0, -0.22]} castShadow>
            <capsuleGeometry args={[0.11, 0.58, 6, 12]} />
            <meshStandardMaterial color="#d9b58e" roughness={0.8} />
          </mesh>
        </group>
      )}
    </group>
  )
}

/**
 * 마박사가 들고 있는 몬스터볼.
 *
 * ⚠️ **이어롤이 나오면 볼은 없어진다.** 원작이 볼을 누른 그 자리에서
 * `Bg_ClearTilemap(BG_LAYER_MAIN_0)`으로 **볼을 지우고**(RI_STATE_PKBL_WAIT_INPUT)
 * 섬광 넷을 친 뒤에야 이어롤 스프라이트를 얹는다 — 둘이 같이 있는 프레임이
 * 원작에는 없다. 우리는 한동안 볼을 그대로 두어서 이어롤과 겹쳐 있었다
 */
function IntroBall({ opened, gone }: { opened: boolean, gone: boolean }) {
  const host = useRef<Group>(null)
  const top = useRef<Group>(null)
  const bottom = useRef<Group>(null)
  const button = useRef<MeshStandardMaterial>(null)
  const left = useRef(1)
  useFrame(({ clock }, delta) => {
    // 사라지는 것이 뚜껑 열림보다 빨라야 한다 — 열리다 만 볼이 남으면 그것대로
    // 어정쩡하다. 원작은 아예 한 프레임에 지운다
    left.current += ((gone ? 0 : 1) - left.current) * Math.min(1, delta * 9)
    const node = host.current
    if (node) {
      node.visible = left.current > 0.02
      node.scale.setScalar(INTRO_BALL.scale * left.current)
    }
    const target = opened ? 1 : 0
    if (top.current)
      top.current.rotation.x += (target * -1.18 - top.current.rotation.x) * Math.min(1, delta * 7)
    if (bottom.current)
      bottom.current.rotation.x +=
        (target * 0.48 - bottom.current.rotation.x) * Math.min(1, delta * 7)
    // 누를 곳이라는 것이 보여야 한다 — 닫혀 있는 동안 버튼이 숨을 쉰다
    if (button.current)
      button.current.emissiveIntensity = opened
        ? 1.6
        : 0.35 + Math.sin(clock.elapsedTime * 3.4) * 0.25
  })
  return (
    <group ref={host} position={INTRO_BALL.at as unknown as [number, number, number]}>
      <group ref={top} position={[0, 0.02, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#e54b50" roughness={0.34} />
        </mesh>
      </group>
      <group ref={bottom}>
        <mesh castShadow>
          <sphereGeometry args={[1, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <meshStandardMaterial color="#f4f5f0" roughness={0.4} />
        </mesh>
      </group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.93, 0.1, 8, 28]} />
        <meshStandardMaterial color="#16191d" roughness={0.5} />
      </mesh>
      {/*
        ⚠️ **누를 것이 화면에 없었다.** 마박사는 「몬스터볼 가운데의 버튼을
        눌러보도록 하거라!」라고 하는데 볼에는 빨강·하양·띠뿐이라 어디를 누르라는
        말인지 알 수가 없었다. 띠에 붙여 두므로 뚜껑이 열려도 제자리에 남는다
      */}
      <group
        position={INTRO_BALL.button as unknown as [number, number, number]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[INTRO_BALL.buttonRadius, INTRO_BALL.buttonRadius, 0.16, 28]} />
          <meshStandardMaterial color="#16191d" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.06, 28]} />
          <meshStandardMaterial
            ref={button}
            color="#f4f5f0"
            emissive="#ffe9a8"
            emissiveIntensity={0.4}
            roughness={0.35}
          />
        </mesh>
      </group>
      <pointLight
        position={[0, 0.5, 1.2]}
        color="#fff2b2"
        intensity={opened ? 2.2 : 0.15}
        distance={5}
      />
    </group>
  )
}

/** Rowan intro rendered on the persistent 3D canvas after New Game is selected. */
export function IntroStage() {
  const scene = useIntroStageStore((state) => state.scene)
  const gender = useIntroStageStore((state) => state.gender)

  /**
   * ⚠️ **발이 대사창에 가려 있었다.** 화면 한가운데를 사람의 가슴(1.05m)에
   * 두었더니 발밑이 창 뒤로 들어갔다 — 원작은 사람을 **위 화면**에 통째로
   * 놓으므로 가리는 것이 없다. 우리는 한 화면이니 겨눔과 눈높이를 같이 0.5m
   * 내려서 사람을 창 위로 올린다(기울기는 그대로다).
   *
   * 실측: 거리 7.4 · 화각 38°면 화면 반높이가 2.55m다. 0.5m를 내리면 사람이
   * 61px 올라가고, 발밑(창 위 378px)이 창에 안 닿는다
   */
  useEffect(() => {
    // ⚠️ **숫자는 `introPlace`에 있다.** 누르는 자리(DOM)가 같은 값으로 버튼을
    // 찾아야 해서 한 곳에 둔다 — 여기서 따로 적으면 그 둘이 어긋난다
    const [ex, ey, ez] = INTRO_CAMERA.eye
    const [tx, ty, tz] = INTRO_CAMERA.target
    cinematicStage.active = true
    cinematicStage.position.set(
      CINEMATIC_ORIGIN.x + ex, CINEMATIC_ORIGIN.y + ey, CINEMATIC_ORIGIN.z + ez,
    )
    cinematicStage.target.set(
      CINEMATIC_ORIGIN.x + tx, CINEMATIC_ORIGIN.y + ty, CINEMATIC_ORIGIN.z + tz,
    )
    cinematicStage.fov = INTRO_CAMERA.fov
    return () => {
      cinematicStage.active = false
    }
  }, [])

  // 이어롤이 나오는 동안에도 잠깐 그린다 — 사라지는 것을 보여 주려면 남아야
  // 한다. `gone`이 켜지면 곧 스스로 안 보이게 된다
  const ball = scene === 'ball' || scene === 'buneary'
  return (
    <group position={CINEMATIC_ORIGIN}>
      <mesh position={[0, 3, -3.5]} scale={[17, 10, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#050914" fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6.8, 64]} />
        <meshStandardMaterial color="#101a31" roughness={0.9} fog={false} />
      </mesh>
      <hemisphereLight args={['#b8d4ff', '#21182e', 1.3]} />
      <directionalLight position={[-4, 7, 5]} intensity={1.85} color="#eaf2ff" castShadow />
      <pointLight position={[0, 2.4, 2.5]} intensity={0.65} color="#8cbcff" distance={8} />

      {scene === 'rowan' && <Person path={`models/npc/${NPC_BUNDLE.gentleman}.glb`} position={[0, 0, 0]} />}
      {scene === 'rival' && <Person path={`models/npc/${NPC_BUNDLE.rival}.glb`} position={[0, 0, 0]} />}
      {scene === 'player' && <Person path={playerModelPath(gender)} position={[0, 0, 0]} />}
      {scene === 'gender' && (
        <>
          <Person
            path={playerModelPath('boy')}
            position={[-1.15, 0, 0]}
            selected={gender === 'boy'}
          />
          <Person
            path={playerModelPath('girl')}
            position={[1.15, 0, 0]}
            selected={gender === 'girl'}
          />
        </>
      )}
      {ball && <IntroBall opened={scene === 'buneary'} gone={scene === 'buneary'} />}
      <Buneary visible={scene === 'buneary'} />
    </group>
  )
}
