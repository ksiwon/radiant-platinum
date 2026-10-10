// 메인 프레임 **뒤에** 시저 패스 하나를 더 그린다 (SYSTEM §2.4).
//
// 메뉴 창 안의 3D 포켓몬은 두 번째 캔버스도, 월드 씬 안의 얹은 몸도 아니다. 같은 렌더러로 메인 프레임이 끝난 뒤
// 구멍 사각형에만 자기 `Scene`과 카메라를 한 번 더 그린다 — 장치가 하나이고, 월드의 시간대 · 안개 · 화각이 몸에
// 안 묻는다.
//
//   EngineDriver:  post.render() / gl.render(world)   ← 그대로
//                  renderMonViewport(gl)              ← 이 파일의 한 줄 (같은 try 밖 · 자기 try)
//
// ⚠️ **등록된 구멍이 없으면 즉시 돌아온다** — 메뉴가 안 열린 프레임의 비용은 0이다. 구멍이 있어도 몸이 아직 안
// 왔으면 그리지 않는다(DOM 쪽이 그동안 2D를 그리고, 구멍도 안 낸다 — `viewportMode`).
//
// ⚠️ **여기서 던져도 게임이 안 선다.** 월드 프레임은 이미 나갔다. 이 패스가 터지면(셰이더 컴파일 · 장치 상태)
// 스토어의 `broken`을 세워 DOM이 2D로 떨어지게 하고 한 줄만 남긴다. `EngineDriver`의 `try`에 얹었다면
// `markSceneCrashed`가 게임 전체를 멈췄을 것이다.
//
// 렌더러 상태를 바꾸는 것은 전부 되돌린다: autoClear 넷 · 시저 시험 · 뷰포트 · 시저. three 0.185의
// `WebGPURenderer`는 뷰포트와 시저의 y를 **왼쪽 위 원점**(CSS와 같은)으로 받는다 — WebGL2 폴백 백엔드가 알아서
// 뒤집는다(`WebGLBackend.updateViewport`).
import { Vector2, Vector4, type PerspectiveCamera, type Scene } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { useMonViewportStore } from '../state/monViewportStore'
import { canvasRect, type Rect } from './monViewportMath'

/** 구멍 하나를 그리는 데 필요한 것. `MonViewportStage`가 몸이 설 때 올린다 */
export interface ViewportFrame {
  scene: Scene
  camera: PerspectiveCamera
  /** 이 열쇠의 몸이 서 있다 (`specKey`). 아니면 그리지 않는다 */
  key: string
  /** 그리기 직전 — 구멍 크기가 바뀌었으면 카메라 · 뒷배경을 다시 맞춘다. 시저 사각형(CSS px)을 받는다 */
  prepare: (view: Rect, hole: HTMLElement) => void
}

let frame: ViewportFrame | null = null

export function setViewportFrame(next: ViewportFrame | null): void {
  frame = next
}

const size = new Vector2()
const savedViewport = new Vector4()
const savedScissor = new Vector4()
let warned = false

/** 메인 프레임이 나간 뒤 부른다. 그릴 것이 없으면 값이 안 든다 */
export function renderMonViewport(gl: WebGPURenderer): void {
  if (frame === null) return
  const state = useMonViewportStore.getState()
  const hole = state.hole
  if (hole === null || state.broken || !hole.el.isConnected) return
  const shown = state.shown
  if (shown === null || shown.state !== 'ready' || shown.key !== frame.key) return

  gl.getSize(size)
  const view = canvasRect(hole.el.getBoundingClientRect(), { w: size.x, h: size.y }, gl.getPixelRatio())
  if (view === null) return

  const autoClear = gl.autoClear
  const autoClearColor = gl.autoClearColor
  const autoClearDepth = gl.autoClearDepth
  const autoClearStencil = gl.autoClearStencil
  const scissorTest = gl.getScissorTest()
  gl.getViewport(savedViewport)
  gl.getScissor(savedScissor)
  try {
    frame.prepare(view, hole.el)
    // 색은 뒷배경 판이 구멍을 다 덮으므로 안 지운다. 깊이만 지운다 (렌더 타깃이 월드 프레임과 같은 깊이를 쓴다)
    gl.autoClear = true
    gl.autoClearColor = false
    gl.autoClearDepth = true
    gl.autoClearStencil = false
    gl.setViewport(view.x, view.y, view.w, view.h)
    gl.setScissor(view.x, view.y, view.w, view.h)
    gl.setScissorTest(true)
    gl.render(frame.scene, frame.camera)
  } catch (e) {
    state.markBroken()
    if (!warned) {
      warned = true
      console.error('[monViewport] 구멍 패스가 터졌다 — 2D 앞모습으로 떨어진다', e)
    }
  } finally {
    gl.setScissorTest(scissorTest)
    gl.setViewport(savedViewport)
    gl.setScissor(savedScissor)
    gl.autoClear = autoClear
    gl.autoClearColor = autoClearColor
    gl.autoClearDepth = autoClearDepth
    gl.autoClearStencil = autoClearStencil
  }
}
