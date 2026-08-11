// useFrame → 게임 루프 → 씬 동기화 → 렌더 (priority 1: 렌더를 우리가 소유)
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { gameLoop } from '../engine/loop/GameLoop'
import { inputSystem } from '../engine/input/keyboard'
import { playerSystem, RUN_SPEED, WALK_SPEED } from '../engine/actor/player'
import { npcSystem } from '../engine/actor/ambient'
import { updateLocomotion } from '../engine/actor/locomotion'
import { cameraSystem } from '../engine/actor/camera'
import { warpSystem } from '../engine/map/world'
import { scriptSystem } from '../engine/script/field'
import { encounterSystem } from '../engine/battle/encounterSystem'
import { stepSystem } from './stepSystem'
import { markTile } from '../app/sceneMark'
import { worldState } from '../state/worldState'
import { spinBike } from './BikeModel'
import { sceneRefs, perfSnapshot } from './sceneRefs'
import { battleStage, starterStage } from './battle/stageRefs'
import { createPostChain, type PostChain } from './fx/post'

let systemsRegistered = false
const interpolated = new Vector3()

export function EngineDriver({ bloom: useBloom = true }: { bloom?: boolean }) {
  const { gl, scene, camera } = useThree()
  const postRef = useRef<PostChain | null>(null)
  // 필드 화각. 다른 장면이 화각을 가져갔다가 돌려줄 때 여기로 돌아온다 —
  // 상수로 적어 두면 `Stage`의 값과 조용히 갈린다
  const fieldFov = useRef((camera as PerspectiveCamera).fov)

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
      gameLoop.register(npcSystem)
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

    // 서 있는 칸을 문서에 적어 둔다 — 읽기 전용이고 `data-boot`과 같은 자리다
    // (`sceneMark.ts`). 프레임마다 부르지만 **칸이 바뀔 때만** 쓴다
    markTile(worldState.player.position.x, worldState.player.position.z)

    // 씬 동기화 — 렌더 보간 (prev → current, alpha)
    const p = worldState.player
    if (sceneRefs.player) {
      // 플레이어 노드의 원점은 발밑(y=0) 기준이므로 보간값을 그대로 쓴다
      interpolated.copy(p.prevPosition).lerp(p.position, gameLoop.alpha)
      sceneRefs.player.position.copy(interpolated)
      sceneRefs.player.rotation.y = p.facing
      // 1인칭에서는 자기 몸이 화면을 가린다. 눈이 머리 안쪽에 있어서
      // 안 끄면 얼굴 텍스처가 통째로 보인다
      sceneRefs.player.visible = worldState.camera.mode !== 'first'
    }

    // 보행 포즈. 시뮬레이션이 아니라 표현이라 고정 스텝이 아닌 렌더 델타로 돈다 —
    // 60fps가 아니어도 위상 속도가 속도에 묶여 있어 발이 미끄러지지 않는다
    if (sceneRefs.playerRig) {
      const speed = Math.hypot(p.velocity.x, p.velocity.z)
      // 턱을 넘는 중이면 그 진행을 넘긴다 — 걷기 대신 도약 자세가 나간다
      const hop = worldState.player.hop
      updateLocomotion(
        sceneRefs.playerRig, delta, speed, WALK_SPEED, RUN_SPEED,
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
    const shot = starterStage.active ? starterStage
      : battleStage.active ? battleStage : worldState.camera
    state.camera.position.copy(shot.position)
    state.camera.lookAt(shot.target)
    const lens = state.camera as PerspectiveCamera
    const fov = starterStage.active ? starterStage.fov
      : battleStage.active ? battleStage.fov : fieldFov.current
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
