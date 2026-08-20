// useFrame → 게임 루프 → 씬 동기화 → 렌더 (priority 1: 렌더를 우리가 소유)
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Quaternion, Vector3, type PerspectiveCamera } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { gameLoop } from '../engine/loop/GameLoop'
import { inputSystem } from '../engine/input/keyboard'
import { playerSystem, RUN_SPEED, WALK_SPEED } from '../engine/actor/player'
import { isSliding } from '../engine/actor/ice'
import { npcSystem } from '../engine/actor/ambient'
import { objectFxTick } from '../engine/actor/objectFx'
import { updateLocomotion } from '../engine/actor/locomotion'
import { cameraSystem } from '../engine/actor/camera'
import { warpSystem } from '../engine/map/world'
import { fieldScripts, scriptSystem } from '../engine/script/field'
import { encounterSystem } from '../engine/battle/encounterSystem'
import { stepSystem } from './stepSystem'
import { emoteFrame } from './emotes'
import { vsSeekerFrame } from './vsSeeker'
import { fishingSystem } from './fishingSystem'
import { berryWateringSystem } from './berryPatches'
import { stepTram } from './safari'
import { markTile } from '../app/sceneMark'
import { worldState } from '../state/worldState'
import { spinBike } from './BikeModel'
import { sceneRefs, perfSnapshot } from './sceneRefs'
import { battleStage, cinematicStage, starterStage } from './battle/stageRefs'
import { createPostChain, type PostChain } from './fx/post'
import { distortionBridge } from '../engine/world/distortion'
import { surfaceHeading, surfaceQuaternion } from '../engine/actor/distortionSurface'
import { distortionCascadePose } from './distortion'

let systemsRegistered = false
const interpolated = new Vector3()
const playerRotation = new Quaternion()
/** 폭포에서 몸이 눕는 회전. 앞뒤 축(로컬 +Z) 둘레로 돈다 */
const cascadeRoll = new Quaternion()
const FORWARD_AXIS = new Vector3(0, 0, 1)
const WORLD_UP = new Vector3(0, 1, 0)

export function EngineDriver({ bloom: useBloom = true }: { bloom?: boolean }) {
  const { gl, scene, camera } = useThree()
  const postRef = useRef<PostChain | null>(null)

  useEffect(() => {
    if (!systemsRegistered) {
      // 시스템 실행 순서 고정 (PLAN §3.4):
      // Input → Script → NPC → Movement → Warp → Step → Encounter → Camera
      //
      // Script가 Movement보다 **먼저**여야 한다. 스크립트가 도는 동안 입력을
      // 지워서 발을 묶는데, 뒤에 두면 이미 그 프레임만큼 걸어간 뒤가 된다.
      //
      // NPC도 Script 뒤다. `LockAll`이 이번 프레임에 세운 것이 이번 프레임부터
      // 먹어야 한다 — 앞에 두면 멈추라는 말을 듣기 전에 한 걸음 더 간다
      gameLoop.register(inputSystem)
      gameLoop.register(scriptSystem)
      // 낚시도 발을 묶는다. 스크립트와 같은 이유로 이동 시스템 **앞**이다 —
      // 뒤에 두면 낚는 동안 그 프레임만큼 걸어가 물에서 멀어진다 (PARITY §1.5)
      gameLoop.register(fishingSystem)
      // 물뿌리개도 발을 묶는다 (PARITY §4.6). 낚시와 같은 자리다 — 물을 주는
      // 동안 방향키는 걸음이 아니라 **옆 밭으로 옮겨 서기**다
      gameLoop.register(berryWateringSystem)
      // 습초원 열차가 정거장 사이를 간다 (PARITY §7.7)
      gameLoop.register({ fixedUpdate: stepTram })
      gameLoop.register(npcSystem)
      // 머리 위 느낌표와 VS시커 훑기 (PARITY §1.13 · §7.9). 둘 다 프레임 수로
      // 재는 연출이라 고정 스텝에서 밀어야 기계 속도와 무관하게 같은 길이가 된다
      gameLoop.register({ fixedUpdate: emoteFrame })
      gameLoop.register({ fixedUpdate: vsSeekerFrame })
      // 사람 하나가 깜빡이거나 흔들리는 연출 둘 (`actor/objectFx`) — 이쪽도
      // 프레임 수로 재므로 고정 스텝이다
      gameLoop.register({ fixedUpdate: objectFxTick })
      gameLoop.register(playerSystem)
      gameLoop.register(warpSystem)
      // 한 칸을 밟은 뒤에 도는 것들 — 독·리펠·친밀도 (PARITY §1.1).
      // 조우보다 **먼저**다. 원작도 `Field_ProcessStep`이 이동이 끝난 자리에서
      // 먼저 돌고, 그 안에서 스크립트가 걸리면 그 프레임은 거기서 끝난다
      gameLoop.register(stepSystem)
      gameLoop.register(encounterSystem)
      gameLoop.register(cameraSystem)
      systemsRegistered = true
    }
  }, [])

  useEffect(() => {
    const renderer = gl as unknown as WebGPURenderer
    perfSnapshot.backend = renderer.backend?.constructor?.name ?? 'unknown'
    postRef.current = useBloom ? createPostChain(renderer, scene, camera) : null
    return () => { postRef.current = null }
  }, [gl, scene, camera, useBloom])

  // 탭 비활성 → 루프 정지 (PLAN §11.2)
  useEffect(() => {
    const onVis = () => { gameLoop.paused = document.hidden }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useFrame((state, delta) => {
    gameLoop.tick(delta)

    // 스크립트가 터진 것을 개발 HUD로 올린다. 읽기 둘이라 프레임마다 해도 싸다 —
    // 안 올리면 대사창이 그냥 사라지는 것으로만 보인다 (`noteScriptError`)
    perfSnapshot.scriptErrors = fieldScripts.errors
    perfSnapshot.lastScriptError = fieldScripts.lastError

    // 서 있는 칸을 문서에 적어 둔다 — 읽기 전용이고 `data-boot`과 같은 자리다
    // (`sceneMark.ts`). 프레임마다 부르지만 **칸이 바뀔 때만** 쓴다
    markTile(worldState.player.position.x, worldState.player.position.z)

    // 씬 동기화 — 렌더 보간 (prev → current, alpha)
    const p = worldState.player
    if (sceneRefs.player) {
      // 플레이어 노드의 원점은 발밑(y=0) 기준이므로 보간값을 그대로 쓴다
      interpolated.copy(p.prevPosition).lerp(p.position, gameLoop.alpha)
      sceneRefs.player.position.copy(interpolated)
      const frame = distortionBridge.frame?.() ?? null
      const heading = surfaceHeading(frame, p.velocity.x, p.velocity.y, p.velocity.z, p.facing)
      surfaceQuaternion(frame, heading, playerRotation)
      // 폭포를 타는 동안은 **물살에 눕는다** (`RotateMapObject`) — 몸이 앞뒤 축
      // 둘레로 돌고, 다 눕고 나면 물살에 좌우로 흔들린다(`InitBobbing`).
      // 각은 원작이 준 도 그대로다 — 내려갈 때 90 → 58 → 90 → 180
      const pose = distortionCascadePose()
      if (pose !== null) {
        cascadeRoll.setFromAxisAngle(FORWARD_AXIS, pose.roll * Math.PI / 180)
        playerRotation.multiply(cascadeRoll)
        sceneRefs.player.position.x += pose.bob
      }
      sceneRefs.player.quaternion.slerp(playerRotation, Math.min(1, delta * 12))
      // 1인칭에서는 자기 몸이 화면을 가린다. 눈이 머리 안쪽에 있어서
      // 안 끄면 얼굴 텍스처가 통째로 보인다
      sceneRefs.player.visible = worldState.camera.mode !== 'first'
    }

    // 보행 포즈. 시뮬레이션이 아니라 표현이라 고정 스텝이 아닌 렌더 델타로 돈다 —
    // 60fps가 아니어도 위상 속도가 속도에 묶여 있어 발이 미끄러지지 않는다
    // ⚠️ **구운 클립이 돌면 절차형은 손을 뗀다.** 둘 다 같은 뼈에 쓰고 여기가
    // 나중이라, 안 비키면 낚싯대를 던지는 동안 팔이 걷는 자세로 덮인다
    // (`scene/PlayerModel`의 `playerClip`)
    if (sceneRefs.playerRig && !sceneRefs.playerClip) {
      const speed = Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z)
      // 턱을 넘는 중이면 그 진행을 넘긴다 — 걷기 대신 도약 자세가 나간다
      const hop = worldState.player.hop
      // ⚠️ **얼음 위에서는 발을 멈춘다.** 원작이 미끄러지는 동안 그림을 세운다
      // (`MAP_OBJ_STATUS_PAUSE_ANIMATION`). 안 세우면 달리기 자세로 미끄러져서
      // 발이 땅 위를 헛돈다 — `gait`가 보폭에서 위상을 유도하는 이유와 같다
      updateLocomotion(
        sceneRefs.playerRig, delta, isSliding() ? 0 : speed, WALK_SPEED, RUN_SPEED,
        hop.active ? hop.t : null, p.cycling,
      )
      // 자전거는 사람이 앉은 자세와 한 몸이라 같은 위상으로 돈다
      if (sceneRefs.bike) {
        sceneRefs.bike.visible = p.cycling
        if (p.cycling) spinBike(sceneRefs.bike, sceneRefs.playerRig.phase)
      }
    }
    // 배틀 중에는 무대가 카메라를 갖는다. 오버월드 카메라 시스템은 계속 돌지만
    // (돌아왔을 때 제자리여야 한다) 그 값을 화면에 쓰지 않는다.
    // ⚠️ **화각도 같이 가져간다.** 배틀은 BDSP의 30°, 파트너 고르는 장면은
    // 원작의 44°다 — 필드(55°)로 두면 실측 크기의 포켓몬이 점이 된다
    const shot = cinematicStage.active ? cinematicStage
      : starterStage.active ? starterStage
        : battleStage.active ? battleStage : worldState.camera
    state.camera.position.copy(shot.position)
    state.camera.up.copy(cinematicStage.active || starterStage.active || battleStage.active
      ? WORLD_UP : worldState.camera.up)
    state.camera.lookAt(shot.target)
    const lens = state.camera as PerspectiveCamera
    // 필드 화각은 **카메라 시스템**이 낸다 — 깨어진 세계는 8.09도로 갈아 낀다
    const fov = cinematicStage.active ? cinematicStage.fov
      : starterStage.active ? starterStage.fov
        : battleStage.active ? battleStage.fov : cameraSystem.fov
    if (lens.isPerspectiveCamera && lens.fov !== fov) {
      lens.fov = fov
      lens.updateProjectionMatrix()
    }

    // 렌더 (post 실패 시 기본 렌더 폴백)
    if (postRef.current) postRef.current.render()
    else state.gl.render(state.scene, state.camera)

    // 계측
    const info = (state.gl as unknown as WebGPURenderer).info
    perfSnapshot.fps = gameLoop.stats.fps
    perfSnapshot.frameMs = gameLoop.stats.frameMs
    perfSnapshot.drawCalls = info?.render?.drawCalls ?? 0
    perfSnapshot.triangles = info?.render?.triangles ?? 0
  }, 1)

  return null
}
