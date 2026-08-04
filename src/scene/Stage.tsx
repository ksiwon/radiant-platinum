// 영속 Canvas (PLAN §3.3) — 라우트 트리 위에 있어 절대 언마운트되지 않는다
import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { WebGPURenderer } from 'three/webgpu'
import { EngineDriver } from './EngineDriver'
import { PlayerCapsule } from './GreyBox'
import { PlayerModel } from './PlayerModel'
import { WorldLoader } from './WorldLoader'
import { attachKeyboard } from '../engine/input/keyboard'

let keyboardAttached = false

export function Stage() {
  // 입력 리스너는 게임 청크에 속한다 — 초기 청크가 worldState(three 의존)를 끌어오지 않게 한다
  useEffect(() => {
    if (keyboardAttached) return
    keyboardAttached = true
    attachKeyboard()
  }, [])

  return (
    <div
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
          await renderer.init()
          return renderer
        }}
      >
        <color attach="background" args={['#131722']} />
        {/* 신오 전체. 트윈리프에서 시작해 걸어서 이동하고, 문으로 실내에 들어간다 */}
        <Suspense fallback={null}>
          <WorldLoader />
        </Suspense>
        <Suspense fallback={<PlayerCapsule />}>
          <PlayerModel />
        </Suspense>
        <EngineDriver />
      </Canvas>
    </div>
  )
}
