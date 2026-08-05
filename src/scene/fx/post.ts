// 포스트 체인 (PLAN §2.4) — TSL PostProcessing.
//
// 실패해도 게임은 돌아야 하므로 방어적으로 초기화한다. 노드 그래프 하나가
// 안 되면 화면이 통째로 검게 나가기 때문에, 윤곽이 실패하면 블룸만으로,
// 그것도 실패하면 기본 렌더로 두 단계 물러난다.
import { PerspectiveCamera, type Camera, type Scene } from 'three'
import { PostProcessing, type WebGPURenderer } from 'three/webgpu'
import { float, pass, perspectiveDepthToViewZ, uv, vec2 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'

export interface PostChain {
  render(): void
}

/**
 * 윤곽의 세기.
 *
 * **굵은 검은 선은 안 쓴다.** 본가 3D 포켓몬(BDSP·Legends 계열)이 셀 외곽선을
 * 쓰지 않고, 우리 지형이 상자라서 선을 두르면 상자스러움만 강조된다.
 * 여기서 하는 것은 깊이가 크게 끊기는 자리만 살짝 어둡게 하는 것 — 절벽 단차가
 * 어디서 떨어지는지 읽히게 하는 것이 목적이다.
 */
const EDGE_STRENGTH = 0.45
/** 이 값(시점 공간 거리)보다 크게 끊겨야 모서리로 본다. 경사면은 안 잡힌다 */
const EDGE_NEAR = 0.4
const EDGE_FAR = 1.6

export function createPostChain(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
): PostChain | null {
  return withOutline(renderer, scene, camera) ?? bloomOnly(renderer, scene, camera)
}

/**
 * 깊이 기반 윤곽 + 블룸.
 *
 * 이웃과의 **시점 공간 깊이 차**를 본다 — 화면 깊이(0~1)를 그냥 빼면 원근 때문에
 * 먼 곳에서 선이 사라진다. 시점 공간이라 단위가 타일에 비례해서 문턱값을
 * 거리와 무관하게 하나로 잡을 수 있다.
 */
function withOutline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
): PostChain | null {
  // 원근 카메라가 아니면 시점 공간 되돌리기가 성립하지 않는다
  if (!(camera instanceof PerspectiveCamera)) return null
  const cam = camera
  try {
    const post = new PostProcessing(renderer)
    const scenePass = pass(scene, camera)
    const color = scenePass.getTextureNode('output')
    const depthTex = scenePass.getTextureNode('depth')

    const w = 1.4 / Math.max(1, renderer.domElement.width)
    const h = 1.4 / Math.max(1, renderer.domElement.height)
    /**
     * 그 자리의 카메라까지 거리(타일).
     *
     * **깊이 버퍼 값을 그대로 빼면 안 된다** — 비선형이라 z=10과 z=11의 차가
     * 0.0004인데 z=40과 41은 0.00006이다. 거리마다 문턱값이 달라져야 해서
     * 하나로는 못 잡는다. 시점 공간으로 되돌리면 단위가 타일이 된다
     */
    const at = (dx: number, dy: number) =>
      perspectiveDepthToViewZ(depthTex.sample(uv().add(vec2(dx, dy))),
        float(cam.near), float(cam.far)).negate()

    const c = at(0, 0)
    const diff = at(-w, 0).sub(c).abs()
      .max(at(w, 0).sub(c).abs())
      .max(at(0, -h).sub(c).abs())
      .max(at(0, h).sub(c).abs())
    const edge = diff.smoothstep(EDGE_NEAR, EDGE_FAR).mul(float(EDGE_STRENGTH))

    const shaded = color.mul(float(1).sub(edge))
    post.outputNode = shaded.add(bloom(shaded, 0.28, 0.4, 0.92))
    return { render: () => post.render() }
  } catch (e) {
    console.warn('[post] 윤곽 체인 실패 — 블룸만으로 물러난다', e)
    return null
  }
}

function bloomOnly(renderer: WebGPURenderer, scene: Scene, camera: Camera): PostChain | null {
  try {
    const post = new PostProcessing(renderer)
    const color = pass(scene, camera).getTextureNode('output')
    post.outputNode = color.add(bloom(color, 0.3, 0.4, 0.9))
    return { render: () => post.render() }
  } catch (e) {
    console.warn('[post] TSL PostProcessing 초기화 실패 — 기본 렌더로 폴백', e)
    return null
  }
}
