// 영속 Canvas (PLAN §3.3) — 라우트 트리 위에 있어 절대 언마운트되지 않는다
import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { NeutralToneMapping, PCFSoftShadowMap } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { EngineDriver } from './EngineDriver'
import { fieldCamera } from './fieldCamera'
import { SceneBoundary } from '../ui/screens/SceneBoundary'
import { PlayerCapsule } from './GreyBox'
import { PlayerModel } from './PlayerModel'
import { WorldLoader } from './WorldLoader'
import { BattleStage } from './battle/BattleStage'
import { StarterStage } from './field/StarterStage'
import { DAY } from './fx/sky'
import { CinematicStage } from './CinematicStage'
import { PokemonPreviewStage } from './PokemonPreviewStage'
import { HmCutInStage } from './HmCutInStage'
import { HallOfFameStage } from './HallOfFameStage'
import { attachKeyboard } from '../engine/input/keyboard'
import { IntroStage } from './IntroStage'
import { attachMouse } from '../engine/input/mouse'
import { useBattleStore } from '../state/battleStore'
import { useMenuStore } from '../state/menuStore'
import { useOptionsStore } from '../state/optionsStore'
import { useRendererStore } from '../state/rendererStore'
import { useCinematicStore } from '../state/cinematicStore'
import { useHallOfFameStageStore } from '../state/hallOfFameStageStore'
import { useIntroStageStore } from '../state/introStageStore'
import { MusicDirector } from './MusicDirector'

let keyboardAttached = false

export function Stage() {
  // 배틀 무대는 배틀이 열려 있는 동안만 씬에 있다. 오버월드를 언마운트하지는
  // 않는다 — 배틀이 끝나면 걷던 자리 그대로 돌아와야 한다
  const inBattle = useBattleStore((s) => s.phase !== 'off')
  // 파트너 고르는 무대도 같은 Canvas에 선다 (`field/StarterStage`) — 화면이
  // 열려 있는 동안만이다
  const choosing = useMenuStore((s) => s.top === 'chooseStarter')
  const cinematic = useCinematicStore((s) => s.scene !== 'off')
  const hallOfFame = useHallOfFameStageStore((s) => s.mode !== 'off')
  // 입력 리스너는 게임 청크에 속한다 — 초기 청크가 worldState(three 의존)를 끌어오지 않게 한다
  const intro = useIntroStageStore((s) => s.scene !== 'off')
  // 렌더러를 다시 세운 횟수. 정상 경로에서는 0 그대로다 (아래 `key`)
  const generation = useRendererStore((s) => s.generation)
  useEffect(() => {
    if (keyboardAttached) return
    keyboardAttached = true
    attachKeyboard()
  }, [])

  // 마우스는 이 요소에 포인터를 가둔다. 캔버스가 아니라 감싼 div인 이유:
  // 캔버스는 R3F가 다시 만들 수 있고, 가둔 요소가 사라지면 시선이 풀린다
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = wrapRef.current
    if (el === null) return
    return attachMouse(el, (mode) => {
      useOptionsStore.getState().set('view', mode)
    })
  }, [])

  /**
   * 이 세대의 렌더러를 만드는 약속. **세대마다 딱 하나다.**
   *
   * ⚠️ **R3F가 이 팩토리를 두 번 부른다.** `<Canvas>`의 설정 이펙트에는
   * 의존성 배열이 없어 다시 그릴 때마다 `configure()`가 돌고, 그 안의
   * `if (!state.gl)`은 **비동기 팩토리를 기다리는 동안** 두 번 통과한다.
   * `Stage`는 배틀·메뉴·연출 상태를 구독해서 무대가 서는 동안 몇 번 다시
   * 그려지므로 이 창이 실제로 열린다 — 실측(2026-09-07)으로 `requestAdapter`가
   * 둘이었고, **GPU 장치 하나가 아무도 안 쓴 채 남았다.**
   *
   * 더 나쁜 것은 그다음이다: R3F가 크기를 알려 준 것은 **첫 번째** 렌더러고,
   * 실제로 그리게 된 것은 두 번째였다. 두 번째는 캔버스 기본 크기(300×150)에
   * 갇혀 30분 동안 프레임을 통째로 버렸다 (`scene/EngineDriver`의 크기 불변식).
   *
   * 같은 약속을 돌려주면 두 번 불려도 렌더러는 하나다. 세대가 오르면
   * `<Canvas key={generation}>`이 이 부품째 다시 만들어지므로 여기도 비워진다
   */
  const madeRenderer = useRef<{ gen: number; made: Promise<WebGPURenderer> } | null>(null)

  return (
    <div
      ref={wrapRef}
      id="stage-wrap"
      style={{ position: 'fixed', inset: 0 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Canvas
        /*
          ⚠️ **정상 경로에서는 절대 안 바뀐다** — 영속 Canvas 불변식(PLAN §3.3).
          장치를 잃었을 때만 올라가고, 그때는 R3F가 이 나무를 통째로 다시
          세운다. 죽은 GPU 장치에 물린 렌더러는 되살릴 길이 없어서 새로
          만드는 수밖에 없다 (기획서 §5.2가 이것을 명시적 예외로 적는다)
        */
        key={generation}
        dpr={[1, 2]}
        frameloop="always"
        /* ⚠️ **카메라를 R3F에게 만들게 두지 않는다** — 그러면 첫 화면이
           통째로 안 나온다. 까닭은 `scene/fieldCamera`에 실측과 함께 있다 */
        camera={fieldCamera}
        gl={(props) => {
          const gen = generation
          if (madeRenderer.current?.gen !== gen) {
            madeRenderer.current = {
              gen,
              made: makeRenderer(props as ConstructorParameters<typeof WebGPURenderer>[0], gen),
            }
          }
          return madeRenderer.current.made
        }}
      >
        {/* 하늘색으로 지운다. 하늘 돔이 덮지만 로드 한 프레임 동안 검게 번쩍인다 */}
        <color attach="background" args={[DAY.stops[0]![1]]} />
        {/* 렌더 창은 5×5청크(160타일)까지다. 그 경계가 잘려 보이지 않도록
            지평선 색과 같은 안개로 녹인다 — 창을 넓히는 것보다 훨씬 싸다 */}
        {/*
          처음 한 벌은 낮이다. 시간대에 따라 색과 거리를 `MapStreamer`가
          밀어 준다 — 밤에 낮 안개가 남으면 먼 지형만 훤하다
        */}
        <fog attach="fog" args={[DAY.fog, DAY.fogNear, DAY.fogFar]} />
        {/* 신오 전체. 트윈리프에서 시작해 걸어서 이동하고, 문으로 실내에 들어간다 */}
        {/*
          ⚠️ **씬이 렌더 중에 터지면 경계가 없을 때 앱이 통째로 언마운트된다** —
          3D뿐 아니라 대사창·메뉴까지 사라지고 흰 화면이 남는다. 경계는 여기서
          아무것도 안 그리고, 사람에게 보이는 창은 DOM 쪽이다
          (`ui/screens/SceneBoundary`).
          ⚠️ `EngineDriver`는 **밖에** 둔다. 씬이 터져도 프레임 콜백은 계속
          돌아야 상태를 옮기고 화면을 지울 수 있다
        */}
        <SceneBoundary where="씬">
          <Suspense fallback={null}>
            <WorldLoader />
          </Suspense>
          <Suspense fallback={<PlayerCapsule />}>
            <PlayerModel />
          </Suspense>
          <PokemonPreviewStage />
          {/* 비전기술 컷인의 몸. 띠는 DOM 쪽이다 (`ui/field/HmCutInOverlay`) */}
          <HmCutInStage />
          {inBattle && <BattleStage />}
          {choosing && <StarterStage />}
          {cinematic && <CinematicStage />}
          {intro && <IntroStage />}
          {hallOfFame && <HallOfFameStage />}
        </SceneBoundary>
        <EngineDriver />
        <MusicDirector />
      </Canvas>
    </div>
  )
}

/**
 * 이 세대의 WebGPU 렌더러 하나를 만든다. **`Stage` 밖에 둔다** — 안에 두면
 * 다시 그릴 때마다 새 함수가 되어, 위의 `madeRenderer`가 막으려는 그
 * 두 번째 생성이 신원 비교로는 다시 새어 들어온다
 */
async function makeRenderer(
  props: ConstructorParameters<typeof WebGPURenderer>[0],
  generation: number,
): Promise<WebGPURenderer> {
  // R3F v9: WebGPURenderer 수동 초기화 (PLAN §2.4). WebGL2 자동 폴백 내장
  //
  // ⚠️ **`alpha`를 R3F 기본값(`true`)으로 두면 화면이 통째로 안 보인다.**
  // three는 그 값으로 캔버스의 합성 방식을 정한다 —
  // `alphaMode = parameters.alpha ? 'premultiplied' : 'opaque'`
  // (`WebGPUBackend`의 `get context`). 그런데 우리 마지막 패스는 RGB만 제대로
  // 쓰고 **알파를 0으로** 낸다. 브라우저는 그것을 「미리 곱해진 투명」으로 읽어
  // 아무것도 안 그리고, 사람은 캔버스 **뒤의 페이지 배경**을 본다.
  //
  // 실측(2026-09-07, `_probe41`): 같은 프레임에서 `configure`의 `alphaMode`만
  // 가로채 `opaque`로 바꿨더니 침실·라이벌·대사창이 그대로 나왔다. 그리는 것도
  // 크기도 다 맞고 있었다 — 갈린 것은 합성 한 줄이었다 (REPAIR §41).
  //
  // 알파를 안 쓰는 것이 이 게임에 맞기도 하다. 전면 캔버스라 뒤가 비칠 일이
  // 없고, 합성에서 픽셀마다 섞는 일이 통째로 빠진다
  const renderer = new WebGPURenderer({
    ...props,
    alpha: false,
    antialias: true,
  })
  // 톤매핑을 안 켜면 밝은 면이 그냥 잘려서 흰색이 된다 — 조명 합이 2를
  // 넘는 순간 바닥이 통째로 하얘진다(실제로 그렇게 만들었다).
  // Neutral은 ACES보다 색이 덜 빠져서 파스텔 팔레트에 맞는다
  renderer.toneMapping = NeutralToneMapping
  renderer.toneMappingExposure = 1.05
  // 그림자. 나무가 땅에 그림자를 안 떨어뜨리면 아무리 면을 나눠 칠해도
  // 서 있는 것으로 안 보인다 — 원작 나무는 법선이 전부 위를 봐서
  // 라이팅만으로는 입체가 안 난다 (`scene/chunkMesh.ts`)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  // ⚠️ **여기서 터지면 화면에 아무것도 안 뜬다.** R3F는 이 약속을
  // 제 비동기 설정 안에서 기다리므로(`await glConfig(defaultProps)` —
  // @react-three/fiber 9의 `configure`에서 확인), 거부는 **React 오류
  // 경계로 안 간다.** 처리 안 된 거부 하나가 되고 화면은 흰 채로 남는다 —
  // 사용자에게는 「게임이 안 켜진다」다. 그래서 무엇이 잘못됐는지를
  // 상태에 적고 다시 던진다. 화면을 세우는 것은 경계가 아니라
  // `ui/screens/RendererTrouble`이고, 그것은 이 상태를 구독한다
  try {
    await renderer.init()
} catch (e) {
    useRendererStore.getState().markInitFailed(String((e as Error).message ?? e), generation)
    throw e
}
  // 장치 손실은 백엔드가 둘이지만 신호는 하나로 온다 —
  // WebGPU는 `GPUDevice.lost`, WebGL2는 `webglcontextlost`이고
  // three가 둘 다 `onDeviceLost`로 모아 준다 (three 0.185에서 확인).
  //
  // ⚠️ **원래 것을 지우지 않는다.** three는 이 안에서 `_isDeviceLost`를
  // 세워 다음 프레임을 그리지 않게 하는데, 갈아 끼우면 그 멈춤이
  // 사라져 죽은 장치에 계속 명령을 보낸다
  const wasLost = renderer.onDeviceLost.bind(renderer)
  // 인자 타입은 three가 준다 (`DeviceLostInfo`) — 우리가 다시 적지 않는다
  renderer.onDeviceLost = (info) => {
    wasLost(info)
    useRendererStore.getState().markLost(info, generation)
}
  // ⚠️ **어느 세대의 렌더러인지 같이 말한다** (기획서 §3.5). 버린 쪽의
  // `init()`이 뒤늦게 풀리거나 그쪽 `onDeviceLost`가 한 박자 늦게 울면,
  // 그것이 **막 살아난 새 세대의 상태를 뒤집는다.** 세대가 지난 소식은
  // 스토어가 조용히 버린다
  useRendererStore.getState().markReady(
    (renderer.backend as { constructor?: { name?: string } } | undefined)
      ?.constructor?.name ?? null, generation)
  return renderer
}
