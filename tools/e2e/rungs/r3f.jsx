// §41 사다리의 **R3F 단** (`tools/e2e/_ladder41.mjs`가 개발 서버로 연다).
//
// ⚠️ **진단용이고 배포에 안 실린다.** `vite build`의 진입점은 `index.html`
// 하나뿐이라 `tools/` 아래 이 두 파일은 번들에 한 바이트도 안 들어간다.
// 게임 코드는 하나도 안 쓴다 — `scene/Stage`가 R3F에게
// 넘기는 **모양만** 그대로 옮긴다: 비동기 gl 팩토리, 세대별 약속 하나,
// `frameloop="always"`, 그리고 `useFrame(…, 1)`에서 우리가 직접 그리는 것.
import { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { NeutralToneMapping, PCFSoftShadowMap } from 'three'
import { WebGPURenderer } from 'three/webgpu'

const WITH_POST = new URL(location.href).searchParams.get('post') === '1'
const DRIVE = new URL(location.href).searchParams.get('drive') ?? 'useframe'

async function makeRenderer(props) {
  const renderer = new WebGPURenderer({ ...props, alpha: false, antialias: true })
  renderer.toneMapping = NeutralToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  await renderer.init()
  return renderer
}

/**
 * 도형을 옮기는 손잡이. **사다리가 이것으로 「화면이 살아 있는가」를 잰다** —
 * 프레임 수가 느는 것은 함수가 불린 것까지만 말한다
 */
function hold(scene) {
  window.__rung = {
    move: () => {
      const box = scene.children.find((o) => o.isMesh)
      if (box) box.position.x = 3
    },
  }
}

function Driver() {
  const { gl, scene, camera } = useThree()
  const n = useRef(0)
  const chain = useRef(undefined)
  if (chain.current === undefined) {
    chain.current = null
    if (WITH_POST) {
      void (async () => {
        const { RenderPipeline } = await import('three/webgpu')
        const { pass } = await import('three/tsl')
        const { bloom } = await import('three/addons/tsl/display/BloomNode.js')
        const p = new RenderPipeline(gl)
        const color = pass(scene, camera).getTextureNode('output')
        p.outputNode = color.add(bloom(color, 0.3, 0.4, 0.9))
        chain.current = p
      })()
    }
  }
  useFrame((state) => {
    n.current += 1
    if (n.current === 1) hold(state.scene)
    if (chain.current === null) state.gl.render(state.scene, state.camera)
    else chain.current.render()
    document.documentElement.dataset.frames = String(n.current)
  }, 1)
  return null
}

/** R3F가 스스로 그리게 두는 단. 우리는 세기만 한다 */
function Counter() {
  const n = useRef(0)
  useFrame((state) => {
    n.current += 1
    if (n.current === 1) hold(state.scene)
    document.documentElement.dataset.frames = String(n.current)
  })
  return null
}

function App() {
  const made = useRef(null)
  return (
    <div id="stage-wrap">
      <Canvas
        dpr={[1, 2]}
        frameloop="always"
        camera={{ fov: 55, near: 0.1, far: 200, position: [0, 0, 5] }}
        gl={(props) => {
          made.current ??= makeRenderer(props)
          return made.current
        }}
      >
        <color attach="background" args={['#7eb2d8']} />
        <mesh>
          <boxGeometry args={[2, 2, 2]} />
          <meshStandardMaterial color="#e06030" />
        </mesh>
        <directionalLight intensity={3} />
        <ambientLight intensity={1} />
        {DRIVE === 'useframe' ? <Driver /> : <Counter />}
      </Canvas>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
