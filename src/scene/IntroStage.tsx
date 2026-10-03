import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, MeshStandardMaterial, type Material, type Object3D } from 'three'
import { introOutro, introReturn, outroLook, rowanReturnLook } from '../engine/intro/beats'
import { createRig, updateLocomotion, type Rig } from '../engine/actor/locomotion'
import { RUN_SPEED, WALK_SPEED } from '../engine/actor/player'
import { normalizeModel, PLAYER_HEIGHT } from '../engine/model/normalize'
import { isChibi, shapeChibi } from '../engine/model/chibi'
import { type AssetPath } from '../data/providers/assetProvider'
import { useIntroStageStore } from '../state/introStageStore'
import { useMonBody } from './monBody'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { cinematicScale } from './cinematicMotion'
import { playerModelPath } from './playerModelPath'
import { NPC_BUNDLE, NPC_MODEL_BUNDLE } from '../engine/actor/npcModels'
import { usePersonModel } from './personModel'
import { INTRO_BALL, INTRO_CAMERA } from './introPlace'

/**
 * 사람 하나를 `alpha`만큼 비친다 — 원작 BG1 알파 블렌드(`RowanIntro_FadeBgLayer`)의 자리.
 *
 * ⚠️ **재질을 이 사람 몫으로 복제한 뒤에 비친다.** 받은 모델의 재질은 복제본끼리
 * 참조로 나눠 갖고(`personModel`), 절차형 몸의 재질은 R3F가 쥐고 있다 — 그대로
 * 투명하게 만들면 다음에 서는 사람까지 비친다. 늦게 온 모델 조각도 다음 프레임에
 * 같은 길을 탄다
 */
function fadePerson(root: Object3D, alpha: number, owned: Map<Material, number>): void {
  root.visible = alpha > 0
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const list = (Array.isArray(object.material) ? object.material : [object.material]) as Material[]
    const mine = list.map((material) => {
      if (owned.has(material)) return material
      const copy = material.clone()
      copy.transparent = true
      owned.set(copy, material.opacity)
      return copy
    })
    object.material = Array.isArray(object.material) ? mine : mine[0]!
    for (const material of mine) material.opacity = (owned.get(material) ?? 1) * alpha
  })
}

/** 이 프레임에 그 사람이 얼마나 진하고 얼마나 큰가. 시계가 안 돌면 `null`이고 그때는 손대지 않는다 */
type PersonLook = (gender: 'boy' | 'girl') => { alpha: number; scale: number } | null

/**
 * 마박사 — 라이벌 이름 뒤에 다시 떠오르고(`rowanReturnLook`) 닫는 박자에 사라진다
 * (`outroLook`). 다시 서기 전 그림을 얹기 전에는 진하기 0으로 서 있다
 */
const rowanLook: PersonLook = (gender) => {
  if (introReturn.frame >= 0) {
    return { alpha: rowanReturnLook(introReturn.frame).rowan ?? 0, scale: 1 }
  }
  if (introOutro.frame >= 0) return { alpha: outroLook(introOutro.frame, gender).rowan, scale: 1 }
  return null
}

/** 라이벌 — 이름을 확인하면 사라진다 (`RI_STATE_FADE_OUT_RIVAL`) */
const rivalLook: PersonLook = () =>
  introReturn.frame >= 0 ? { alpha: rowanReturnLook(introReturn.frame).rival, scale: 1 } : null

/**
 * 닫는 박자의 주인공 — 떠올라 작아진다.
 *
 * ⚠️ **발을 붙인 채 줄인다** — 원작 그림은 줄면서 뜨지만 우리는 바닥 위에
 * 서 있다 (`SHRINK_HEIGHTS` 머리말)
 */
const avatarLook: PersonLook = (gender) => {
  if (introOutro.frame < 0) return null
  const look = outroLook(introOutro.frame, gender)
  return { alpha: look.avatar ?? 0, scale: look.scale }
}

function Person({
  path,
  position,
  selected = true,
  look,
}: {
  path: AssetPath
  position: readonly [number, number, number]
  selected?: boolean
  /**
   * 박자가 이 사람을 비치고 줄이는 일 (`rowanLook` · `rivalLook` · `avatarLook`).
   * 시계(`introReturn` · `introOutro`)가 −1이면 아무 일도 안 한다
   */
  look?: PersonLook
}) {
  const wrapper = useRef<Group>(null)
  const host = useRef<Group>(null)
  /** 닫는 박자가 비치고 줄이는 몸 전체 (발밑 원까지) */
  const body = useRef<Group>(null)
  /** 비치려고 복제한 재질과 그 원래 진하기 */
  const owned = useRef(new Map<Material, number>())
  const gender = useIntroStageStore((state) => state.gender)
  useEffect(() => {
    const copies = owned.current
    return () => {
      for (const material of copies.keys()) material.dispose()
      copies.clear()
    }
  }, [])
  /**
   * 서 있는 자세.
   *
   * ⚠️ **안 돌리면 T 자로 선다.** 바인드 자세가 팔을 벌린 T라, 뼈를 아무도 안
   * 돌리면 마박사가 그대로 선다 — 실제로 그랬다. 필드에서는 원작 클립이 그 일을
   * 하는데(`actor/clipGait`) 그쪽은 **걷기가 있는 몸**에만 붙고 여기 사람들은
   * 제자리에 서 있기만 하므로, 오프닝은 절차형이 맡는다
   */
  const rig = useRef<Rig | null>(null)

  // 받아 손질하는 것은 전당과 같다. 안 오면 아래 절차형 몸이 그대로 선다
  const model = usePersonModel(path)

  useLayoutEffect(() => {
    if (!wrapper.current || !model) return
    // ⚠️ **필드 번들(`fc*`)은 치비라 그대로 세우면 머리 큰 아이가 된다.** 마박사가
    // 그렇다(`PROF_ROWAN` — 배틀 번들이 없다). 필드의 그 사람(`NpcModels`)과 같은
    // 손질을 거치고, 키도 치비 손질이 정한 그 키다 — 연구소에서 만나는 마박사와
    // 오프닝의 마박사가 같은 몸이어야 한다
    if (isChibi(path.slice(path.lastIndexOf('/') + 1))) {
      const { nativeHeight } = normalizeModel(wrapper.current, model, 1)
      shapeChibi(wrapper.current, model, nativeHeight)
    } else {
      normalizeModel(wrapper.current, model, PLAYER_HEIGHT)
    }
    // 리그는 정규화 **이후**에 만든다 — 본의 월드 회전에서 축을 뽑기 때문에
    // 래퍼 변환이 확정된 뒤라야 축이 맞는다 (`PlayerModel`과 같은 순서)
    rig.current = createRig(model, wrapper.current, path)
    return () => { rig.current = null }
  }, [model, path])

  useFrame(({ clock }, delta) => {
    if (rig.current) updateLocomotion(rig.current, delta, 0, WALK_SPEED, RUN_SPEED)
    const node = body.current
    const now = look?.(gender) ?? null
    if (node && now) {
      // 다 진한 채로 한 번도 안 비친 몸은 재질을 안 건드린다
      if (now.alpha < 1 || owned.current.size > 0) fadePerson(node, now.alpha, owned.current)
      node.scale.setScalar(now.scale)
    }
    if (!host.current) return
    host.current.position.y = Math.sin(clock.elapsedTime * 1.5 + position[0]) * 0.018
  })

  return (
    <group position={position} scale={selected ? 1 : 0.88}>
      <group ref={body}>
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

/** 마박사 모델 (`NPC_MODEL_BUNDLE.PROF_ROWAN`) — 필드에서 서는 그 번들이다 */
const ROWAN_MODEL: AssetPath = `models/npc/${NPC_MODEL_BUNDLE.PROF_ROWAN ?? 'fc2003_00'}.glb`

/** Rowan intro rendered on the persistent 3D canvas after New Game is selected. */
export function IntroStage() {
  const scene = useIntroStageStore((state) => state.scene)
  const gender = useIntroStageStore((state) => state.gender)

  /**
   * 닫는 박자가 돌고 있는가 (`introOutro` 시계가 0 이상).
   *
   * ⚠️ **주인공을 마박사가 사라지기 시작할 때 미리 세운다.** 원작은 그림을 얹는
   * 한 프레임(`RI_STATE_LOAD_MINI_AVATAR`) 뒤 바로 떠오르는데, 그때 모델을
   * 받기 시작하면 떠오르는 19프레임 동안 절차형 몸이 선다. 진하기 0으로 먼저
   * 세워 두면 마박사가 사라지고 기다리는 50프레임 사이에 다 온다
   */
  const [outro, setOutro] = useState(false)
  /**
   * 마박사가 다시 서는 박자가 돌고 있는가 (`introReturn` 시계가 0 이상).
   *
   * 같은 까닭으로 마박사를 라이벌이 사라지기 시작할 때 진하기 0으로 미리 세운다 —
   * 그림을 얹는 프레임에 받기 시작하면 떠오르는 동안 절차형 몸이 선다
   */
  const [returning, setReturning] = useState(false)
  useFrame(() => {
    const on = introOutro.frame >= 0
    if (on !== outro) setOutro(on)
    const back = introReturn.frame >= 0
    if (back !== returning) setReturning(back)
  })

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

      {/*
        ⚠️ **마박사는 제 몸이다** (`PROF_ROWAN`). 한동안 신사(`tr0046_00`)가 대역으로
        섰다 — 마박사가 `doctor00~02` 중 어느 것인지 못 짚던 때의 자리였는데, 짚은
        뒤에도 여기만 남아 챙 모자 신사가 마박사의 말을 하고 있었다
      */}
      {(scene === 'rowan' || returning) && (
        <Person path={ROWAN_MODEL} position={[0, 0, 0]} look={rowanLook} />
      )}
      {scene === 'rival' && (
        <Person path={`models/npc/${NPC_BUNDLE.rival}.glb`} position={[0, 0, 0]} look={rivalLook} />
      )}
      {(scene === 'player' || outro) && (
        <Person path={playerModelPath(gender)} position={[0, 0, 0]} look={avatarLook} />
      )}
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
