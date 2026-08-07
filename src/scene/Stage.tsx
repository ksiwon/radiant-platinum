// 영속 Canvas (PLAN §3.3) — 라우트 트리 위에 있어 절대 언마운트되지 않는다
import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { NeutralToneMapping, PCFSoftShadowMap } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { EngineDriver } from './EngineDriver'
import { PlayerCapsule } from './GreyBox'
import { PlayerModel } from './PlayerModel'
import { WorldLoader } from './WorldLoader'
import { BattleStage } from './battle/BattleStage'
import { StarterStage } from './field/StarterStage'
import { DAY } from './fx/sky'
import { attachKeyboard } from '../engine/input/keyboard'
import { attachMouse } from '../engine/input/mouse'
import { useBattleStore } from '../state/battleStore'
import { useMenuStore } from '../state/menuStore'
import { useOptionsStore } from '../state/optionsStore'
import { MusicDirector } from './MusicDirector'

let keyboardAttached = false

export function Stage() {
  // 배틀 무대는 배틀이 열려 있는 동안만 씬에 있다. 오버월드를 언마운트하지는
  // 않는다 — 배틀이 끝나면 걷던 자리 그대로 돌아와야 한다
  const inBattle = useBattleStore((s) => s.phase !== 'off')
  // 파트너 고르는 무대도 같은 Canvas에 선다 (`field/StarterStage`) — 화면이
  // 열려 있는 동안만이다
  const choosing = useMenuStore((s) => s.top === 'chooseStarter')
  // 입력 리스너는 게임 청크에 속한다 — 초기 청크가 worldState(three 의존)를 끌어오지 않게 한다
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
    return attachMouse(el, (mode) => { useOptionsStore.getState().set('view', mode) })
  }, [])

  return (
    <div
      ref={wrapRef}
      id="stage-wrap"
      style={{ position: 'fixed', inset: 0 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Canvas
        dpr={[1, 2]}
        frameloop="always"
        camera={{ fov: 55, near: 0.1, far: 200, position: [0, 6, 9] }}
        gl={async (props) => {
          // R3F v9: WebGPURenderer 수동 초기화 (PLAN §2.4). WebGL2 자동 폴백 내장
          const renderer = new WebGPURenderer({
            ...(props as ConstructorParameters<typeof WebGPURenderer>[0]),
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
          await renderer.init()
          return renderer
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
        <Suspense fallback={null}>
          <WorldLoader />
        </Suspense>
        <Suspense fallback={<PlayerCapsule />}>
          <PlayerModel />
        </Suspense>
        {inBattle && <BattleStage />}
        {choosing && <StarterStage />}
        <EngineDriver />
        <MusicDirector />
      </Canvas>
    </div>
  )
}
