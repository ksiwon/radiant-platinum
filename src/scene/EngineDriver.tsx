// useFrame → 게임 루프 → 씬 동기화 → 렌더 (priority 1: 렌더를 우리가 소유)
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Quaternion, Vector2, Vector3, type PerspectiveCamera } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { gameLoop } from '../engine/loop/GameLoop'
import { holdLoop, releaseLoop } from '../engine/loop/pause'
import { inputSystem } from '../engine/input/keyboard'
import { playerSystem, RUN_SPEED, WALK_SPEED } from '../engine/actor/player'
import { bikeGearSystem } from '../engine/actor/bikeGear'
import { isSliding } from '../engine/actor/ice'
import { npcSystem } from '../engine/actor/ambient'
import { hmCutInTick } from './hmCutInScene'
import { objectFxTick } from '../engine/actor/objectFx'
import { updateLocomotion } from '../engine/actor/locomotion'
import { cameraSystem } from '../engine/actor/camera'
import { warpSystem } from '../engine/map/world'
import { fieldScripts, scriptStepSystem, scriptSystem } from '../engine/script/field'
import { encounterSystem } from '../engine/battle/encounterSystem'
import { stepSystem } from './stepSystem'
import { walkSoundSystem } from './walkSound'
import { cutInSystem } from './encounterCutIn'
import { emoteFrame } from './emotes'
import { vsSeekerFrame } from './vsSeeker'
import { fishingSystem } from './fishingSystem'
import { berryWateringSystem } from './berryPatches'
import { stepTram } from './safari'
import { markBackend, markTile } from '../app/sceneMark'
import { worldState } from '../state/worldState'
import { useRendererStore } from '../state/rendererStore'
import { spinBike } from './BikeModel'
import { sceneRefs, perfSnapshot } from './sceneRefs'
import { battleStage, cinematicStage, starterStage } from './battle/stageRefs'
import { createPostChain, type PostChain } from './fx/post'
import { distortionBridge } from '../engine/world/distortion'
import { surfaceHeading, surfaceQuaternion } from '../engine/actor/distortionSurface'
import { distortionCascadePose } from './distortion'

let systemsRegistered = false
/** `getDrawingBufferSize`가 받아 적을 그릇. 프레임마다 새로 안 만든다 */
const drawnSize = new Vector2()
const interpolated = new Vector3()
const playerRotation = new Quaternion()
/** 폭포에서 몸이 눕는 회전. 앞뒤 축(로컬 +Z) 둘레로 돈다 */
const cascadeRoll = new Quaternion()
const FORWARD_AXIS = new Vector3(0, 0, 1)
const WORLD_UP = new Vector3(0, 1, 0)

export function EngineDriver({ bloom: useBloom = true }: { bloom?: boolean }) {
  const { gl, scene, camera } = useThree()
  // 후처리의 화소 간격이 매인 값 둘. R3F가 창과 DPR을 여기로 밀어 준다
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const postRef = useRef<PostChain | null>(null)
  /**
   * 이 Canvas가 몇 번째 세대인가.
   *
   * ⚠️ **마운트할 때 한 번만 읽는다.** `<Canvas key={generation}>`이라 세대가
   * 오르면 이 부품도 통째로 새로 만들어진다 — 구독하면 이미 죽은 나무가 새
   * 세대의 번호를 들고 「내가 그렸다」고 말하게 된다 (기획서 §3.5)
   */
  const generation = useRef(useRendererStore.getState().generation)
  /**
   * 이 세대에서 이미 그리다 터졌는가.
   *
   * ⚠️ **터진 뒤에도 프레임은 계속 온다.** 같은 자리에서 또 터지게 두면 초당
   * 예순 줄이 콘솔에 쌓여서 **처음 터진 까닭이 밀려 나간다** — 후처리 사다리가
   * 「칸이 바뀔 때만 한 줄」을 지키는 것과 같은 이유다. 다시 그리는 것은 세대를
   * 올리는 `retry()`뿐이고, 그때는 이 부품도 통째로 새로 만들어진다
   */
  const crashed = useRef(false)

  useEffect(() => {
    if (!systemsRegistered) {
      // 시스템 실행 순서 고정 (PLAN §3.4):
      // Input → Script → NPC → Movement → ScriptStep → Warp → Step →
      // Encounter → Camera
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
      // 비전기술 컷인 (`PlayHMCutIn`). 이쪽도 원작 프레임 수로 재는 연출이라
      // 고정 스텝이다 — 기계가 빠르다고 포켓몬이 빨리 지나가면 안 된다
      gameLoop.register({ fixedUpdate: hmCutInTick })
      // 자전거 단 바꾸기는 **걸음 앞**이다 — 원작도 `PlayerAvatar_Move`가
      // 그 프레임의 입력으로 단을 먼저 바꾸고 그 단으로 걸음을 정한다
      gameLoop.register(bikeGearSystem)
      gameLoop.register(playerSystem)
      // 밟은 자리를 보고 걸리는 스크립트는 **걸음 뒤 · 워프 앞**이다
      // (원작 `Field_ProcessStep` → `Field_CheckMapTransition` 차례).
      // 앞에 두면 워프가 좌표 트리거를 한 프레임 앞질러서, 딴 맵에서 장면이
      // 이어진다 — 그 실측이 `script/field`의 `scriptStepSystem`에 적혀 있다
      gameLoop.register(scriptStepSystem)
      gameLoop.register(warpSystem)
      // 한 칸을 밟은 뒤에 도는 것들 — 독·리펠·친밀도 (PARITY §1.1).
      // 조우보다 **먼저**다. 원작도 `Field_ProcessStep`이 이동이 끝난 자리에서
      // 먼저 돌고, 그 안에서 스크립트가 걸리면 그 프레임은 거기서 끝난다
      gameLoop.register(stepSystem)
      // 발밑이 내는 소리 (`player_move.c`의 `PlayWalkSE`). 이동 **뒤**여야 한다 —
      // 원작도 걸음이 정해진 뒤에 그 걸음의 칸을 보고 소리를 고른다
      gameLoop.register(walkSoundSystem)
      gameLoop.register(encounterSystem)
      // 조우 컷인은 **카메라 바로 앞**이다 — 그 프레임의 팔 배율을 카메라가
      // 곧바로 읽어야 한다 (`actor/camera`). 뒤에 두면 한 프레임 늦게 먹는다
      gameLoop.register(cutInSystem)
      gameLoop.register(cameraSystem)
      systemsRegistered = true
    }
  }, [])

  useEffect(() => {
    const renderer = gl as unknown as WebGPURenderer
    perfSnapshot.backend = renderer.backend?.constructor?.name ?? 'unknown'
    // 같은 값을 문서에도 적는다 — 개발 HUD는 배포 빌드에 없다 (`app/sceneMark`)
    markBackend(perfSnapshot.backend)
    const chain = useBloom ? createPostChain(renderer, scene, camera) : null
    postRef.current = chain
    return () => {
      // ⚠️ **놓는 것은 이 체인이 만든 것뿐이다** (기획서 RP-05). 오래 참조만
      // 끊었는데(`postRef.current = null`), 그러면 렌더 타깃과 블룸의 사다리
      // 버퍼가 GPU에 그대로 남는다 — 이 효과는 `gl`·씬·카메라가 바뀔 때마다,
      // 그러니까 렌더러를 다시 세우는 복구 길에서 **매번** 다시 돈다
      chain?.dispose()
      postRef.current = null
    }
  }, [gl, scene, camera, useBloom])

  // 창 크기나 DPR이 바뀌면 후처리의 화소 간격을 다시 낸다 (기획서 RP-06).
  //
  // ⚠️ **`render()`도 스스로 맞추지만 여기서 한 번 더 알린다.** 바뀐 바로 그
  // 프레임에 맞춰야 창을 끄는 동안 윤곽이 한 프레임 굵어지지 않는다
  useEffect(() => { postRef.current?.resize() }, [size.width, size.height, dpr])

  // ⚠️ **렌더러가 아는 크기가 R3F가 잰 크기와 갈리면 화면이 통째로 버려진다.**
  //
  // 실측(2026-09-07, 대표 구간 3판): 30분 동안 콘솔에 GPU 오류 **171,459줄**이
  // 쌓였고 3D가 검은 채로 남았다. 첫 줄이 원인이고 나머지 8만 5천은 그 뒤끝이다:
  //
  //     depthBuffer size (300, 150) does not match the other attachments (960, 640)
  //     resolve target (960, 640) does not match the other attachments (300, 150)
  //
  // 300×150은 **`<canvas>`의 기본 크기**다. 왜 거기 갇히는지까지 쟀다 —
  // R3F 9의 `<Canvas>`는 설정 이펙트에 **의존성 배열이 없어** 다시 그릴 때마다
  // `configure()`를 부르고, 그 안의 `if (!state.gl)`은 **비동기 팩토리**를
  // 기다리는 동안 두 번 통과한다. 그래서 `requestAdapter`가 둘이었다: R3F가
  // 크기를 알려 준 것은 첫 번째 렌더러고, 실제로 그리게 된 것은 두 번째다.
  // 두 번째는 캔버스 기본 크기 그대로였다.
  //
  // three 쪽은 스스로 못 고친다 — `Renderer._onCanvasTargetResize()`가
  // `if (this._initialized) this.backend.updateSize()`라, 초기화 전에 온 크기는
  // 백엔드의 캐시된 렌더 패스 서술자(`canvasData.descriptor`)를 안 버린다.
  // 그 서술자가 깊이·MSAA 첨부를 **영영** 쥐고 있다.
  //
  // 그래서 여기서 불변식으로 못 박는다 — **그리는 렌더러의 크기는 잰 크기와
  // 같다.** 같으면 아무것도 안 한다(`setSize`는 부를 때마다 resize를 쏘고,
  // 그때마다 백엔드가 첨부를 다시 만든다 — 프레임마다 부르면 그것이 새 결함이다)
  useEffect(() => {
    const renderer = gl as unknown as WebGPURenderer
    const now = renderer.getDrawingBufferSize(drawnSize)
    const want = { x: Math.floor(size.width * dpr), y: Math.floor(size.height * dpr) }
    const same = now.x === want.x && now.y === want.y
    // ⚠️ **크기가 같으면 아무것도 안 한다.** 한동안 여기에 「같아도 처음 한 번은
    // 맞춘다」가 있었다. 그것을 뺐다 — **효과가 없다는 것을 실측했다.**
    //
    //   · 옛 근거는 `toDataURL`이 색 1개를 냈다는 것이었다. 그 자는 이 프로젝트에서
    //     못 쓴다 (`preserveDrawingBuffer: false`라 눈에 세계가 보이는 판에서도
    //     색 1개가 나온다 — `tools/shot/png.mjs`가 같은 함정을 적는다).
    //   · 제대로 된 자로 다시 쟀다 (계기판을 숨기고 캔버스만 찍는다 —
    //     `tools/e2e/canvasShot.mjs`). 강제 호출이 **있을 때도 없을 때도** 첫
    //     화면은 똑같이 안 나왔다. 다른 것은 `context.configure()` 호출 수뿐이다:
    //     있으면 둘(45233ms·45256ms), 없으면 하나. 화면은 둘 다 그대로다.
    //
    // 그래서 부질없는 재설정 하나를 없앤 것이고, **§41의 첫 화면 결함은 아직
    // 안 고쳤다** — 그 절이 지금까지 지운 가설과 다음에 볼 자리를 적는다.
    //
    // 크기가 **갈릴 때** 맞추는 일은 그대로 남는다. 그것은 다른 결함을 막는다 —
    // 캔버스 기본 크기(300×150)에 갇힌 렌더러가 프레임을 통째로 버리던 자리다
    if (same) return
    console.warn('[renderer] 그리는 크기가 잰 크기와 다르다 — 맞춘다'
      + ` ${String(now.x)}x${String(now.y)} → ${String(want.x)}x${String(want.y)}`)
    renderer.setPixelRatio(dpr)
    renderer.setSize(size.width, size.height)
    postRef.current?.resize()
  }, [gl, size.width, size.height, dpr])

  // 탭 비활성 → 루프 정지 (PLAN §11.2)
  //
  // ⚠️ **`gameLoop.paused`에 직접 대입하면 안 된다** (기획서 §3.4). 그 칸에는
  // 장치 손실 쪽도 쓴다 — 그래서 **복구 중에 탭을 나갔다 돌아오기만 하면**
  // `document.hidden === false`가 그 정지를 덮어서 세계가 다시 돌기 시작했다.
  // 그 순간 눌려 있던 방향이 먹고, 사람은 아직 안 그려진 화면에서 걷는다.
  // 까닭을 걸고 푸는 것만 하고, 하나라도 걸려 있으면 멎어 있다
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) holdLoop('hidden')
      else releaseLoop('hidden')
    }
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

    // 렌더. **후처리가 손을 떼면 우리가 그린다** (RP-04) — 첫 프레임의 지연
    // 셰이더 컴파일이 터지는 자리가 여기고, `render()`는 그때 `false`를 낸다.
    //
    // ⚠️ **마지막 기본 렌더도 터질 수 있다** (기획서 §3.5). 그 예외는 **React
    // 오류 경계가 못 잡는다** — `useFrame`은 렌더 단계가 아니라 R3F의 루프에서
    // 불리기 때문이다. 안 잡으면 루프째 서서 화면이 멎고 입력만 산다
    if (crashed.current) return
    try {
      if (postRef.current?.render() !== true) state.gl.render(state.scene, state.camera)
    } catch (e) {
      crashed.current = true
      console.error('[scene] 프레임을 그리다 터졌다', e)
      useRendererStore.getState().markSceneCrashed(String((e as Error).message ?? e))
      return
    }
    // 한 프레임이 **실제로 나갔다.** 여기서부터가 `live`고, 조작은 그때 돌아온다 —
    // `renderer.init()`이 끝난 것만으로 조작을 돌려주면 아직 안 선 씬을 걷는다
    // (기획서 §6.2). 이미 `live`면 스토어가 곧바로 되돌아온다
    useRendererStore.getState().markPresented(generation.current)
    // 무엇으로 그렸는지를 남긴다 — 바뀔 때만 쓴다 (프레임마다 쓰면 값이 든다)
    if (sceneRefs.stage.camera !== state.camera) sceneRefs.stage.camera = state.camera
    if (sceneRefs.stage.scene !== state.scene) sceneRefs.stage.scene = state.scene
    if (sceneRefs.stage.gl !== state.gl) sceneRefs.stage.gl = state.gl
    // 한 장이 나갔다. 「씬에 붙인 것이 화면에 나갔는가」를 재는 유일한 수다
    perfSnapshot.frames += 1

    // 계측
    const info = (state.gl as unknown as WebGPURenderer).info
    perfSnapshot.fps = gameLoop.stats.fps
    perfSnapshot.frameMs = gameLoop.stats.frameMs
    perfSnapshot.drawCalls = info?.render?.drawCalls ?? 0
    perfSnapshot.triangles = info?.render?.triangles ?? 0
  }, 1)

  return null
}
