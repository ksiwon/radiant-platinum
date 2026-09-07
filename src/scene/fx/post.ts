// 포스트 체인 (PLAN §2.4) — TSL RenderPipeline.
//
// 실패해도 게임은 돌아야 하므로 방어적으로 초기화한다. 노드 그래프 하나가
// 안 되면 화면이 통째로 검게 나가기 때문에, 윤곽이 실패하면 블룸만으로,
// 그것도 실패하면 기본 렌더로 두 단계 물러난다.
//
// ⚠️ **물러남은 만들 때만이 아니라 그릴 때도 있어야 한다** (기획서 RP-04).
// 오래 `try/catch`가 **생성에만** 있었다. 그런데 셰이더는 게으르게 구워진다 —
// 노드 그래프를 세우는 데는 GPU가 필요 없고, 첫 `render()`에서야 파이프라인이
// 컴파일된다. 그래서 「만들 때는 멀쩡했는데 첫 프레임에서 터지는」 자리가
// 방어 밖에 있었고, 그 예외는 `useFrame` 밖으로 나가 **프레임 루프째** 세운다.
// 화면은 검은 채로 멎고 입력만 살아 있다.
//
// 그래서 여기서 내는 것은 「그렸는가」다. 못 그렸으면 한 단계 내려가고, 더
// 내려갈 곳이 없으면 `false`를 내서 부르는 쪽이 기본 렌더로 돌아가게 한다.
import { PerspectiveCamera, RedFormat, UnsignedByteType, type Camera, type Scene } from 'three'
// ⚠️ **`PostProcessing`이 아니라 `RenderPipeline`이다.** r183에서 이름이
// 바뀌었고 옛 이름은 남아 있지만 부를 때마다 콘솔에 경고를 찍는다 —
// 화면을 훑는 하네스(`pnpm story`)가 장면마다 그 경고를 주워 왔다
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu'
import { float, mrt, output, pass, perspectiveDepthToViewZ, uniform, vec2 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { COVER } from './seeThrough'
import { cutInWarp } from './cutInWarp'

export interface PostChain {
  /**
   * 이번 프레임을 후처리로 그렸는가.
   *
   * ⚠️ **`false`를 「아무 일도 없었다」로 읽으면 안 된다.** 후처리가 손을 뗀
   * 것이므로 **부르는 쪽이 기본 렌더를 해야 한다** — 안 하면 그 프레임은
   * 아무도 안 그려서 화면이 멎는다 (`scene/EngineDriver`)
   */
  render(): boolean
  /**
   * 화면 크기나 DPR이 바뀌었다.
   *
   * 안 불러도 `render()`가 스스로 맞추지만(아래 `syncSize`), 크기가 바뀐 바로
   * 그 프레임에 맞추려면 여기로 알린다
   */
  resize(): void
  /** 이 체인이 **직접 만든** GPU 자원을 놓는다. 씬·카메라·재질은 안 건드린다 */
  dispose(): void
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
/**
 * 이웃을 몇 화소 옆에서 보는가.
 *
 * ⚠️ **화소 수지 비율이 아니다.** 그래서 화면 크기로 나눠 UV로 바꿔야 하고,
 * 그 나눗셈이 **창이 바뀔 때마다 다시** 되어야 한다 (`syncSize`)
 */
const EDGE_TEXELS = 1.4

/** TSL 노드 하나. 연산마다 구체 타입이 달라 못 박지 않는다 (`fx/cutInWarp`의 같은 주의) */
type Tsl = Parameters<typeof vec2>[0]

/** 물러남 사다리의 한 칸. 이것을 만드는 데 실패하면 다음 칸으로 간다 */
type Step = 'outline' | 'bloom'
const LOWER: Record<Step, Step | null> = { outline: 'bloom', bloom: null }

/** 한 칸이 실제로 쥔 것 */
interface Built {
  step: Step
  render(): void
  syncSize(): void
  dispose(): void
}

export function createPostChain(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
): PostChain | null {
  return ladder((step) => (step === 'outline'
    ? withOutline(renderer, scene, camera)
    : bloomOnly(renderer, scene, camera)))
}

/**
 * 윤곽 → 블룸 → 기본 렌더로 내려가는 사다리.
 *
 * 만드는 법만 받는다 — 그래야 실패를 **GPU 없이** 시험할 수 있다
 * (`post.test.ts`). 실제 셰이더가 언제 터지는지는 기계마다 다르고, 터졌을 때
 * 무엇을 해야 하는지는 기계와 무관하다.
 *
 * ⚠️ **떨어진 칸을 다시 세우지 않는다.** 프레임마다 다시 만들면 같은 예외를
 * 초당 예순 번 내면서 매번 렌더 타깃을 새로 할당한다 — 느려지는 것이 아니라
 * **터지면서 느려진다.** 한 번 내려간 칸은 그 세션 동안 안 돌아온다
 */
export function ladder(build: (step: Step) => Built | null): PostChain | null {
  let at: Built | null = null
  for (let step: Step | null = 'outline'; step !== null; step = LOWER[step]) {
    at = build(step)
    if (at !== null) break
  }
  if (at === null) return null

  return {
    render() {
      while (at !== null) {
        try {
          at.syncSize()
          at.render()
          return true
        } catch (e) {
          // ⚠️ **프레임마다 안 찍는다.** 칸이 바뀔 때만 한 줄이다 — 초당 예순
          // 줄이 쌓이면 그 뒤에 오는 진짜 원인이 콘솔에서 밀려 나간다
          console.warn(`[post] ${at.step} 체인이 그리다 터졌다 — 한 단계 물러난다`, e)
          const next = LOWER[at.step]
          at.dispose()
          at = next === null ? null : build(next)
          if (at === null) console.warn('[post] 후처리를 껐다 — 기본 렌더로 그린다')
        }
      }
      return false
    },
    resize() { at?.syncSize() },
    dispose() {
      at?.dispose()
      at = null
    },
  }
}

/**
 * 깊이 기반 윤곽 + 블룸.
 *
 * 이웃과의 **시점 공간 깊이 차**를 본다 — 화면 깊이(0~1)를 그냥 빼면 원근 때문에
 * 먼 곳에서 선이 사라진다. 시점 공간이라 단위가 타일에 비례해서 문턱값을
 * 거리와 무관하게 하나로 잡을 수 있다.
 */
function withOutline(renderer: WebGPURenderer, scene: Scene, camera: Camera): Built | null {
  // 원근 카메라가 아니면 시점 공간 되돌리기가 성립하지 않는다
  if (!(camera instanceof PerspectiveCamera)) return null
  const cam = camera
  try {
    const post = new RenderPipeline(renderer)
    const scenePass = pass(scene, camera)
    // 색 말고 **덮은 정도**를 하나 더 받는다. 기본이 1이고, 깊이를 안 쓰는
    // 면만 0을 적는다 (`seeThrough`의 `markSeeThrough`)
    scenePass.setMRT(mrt({ output, [COVER]: float(1) }))
    const color = scenePass.getTextureNode('output')
    const depthTex = scenePass.getTextureNode('depth')
    const cover = scenePass.getTextureNode(COVER)
    // ⚠️ **첨부는 색 화면의 복제로 만들어진다** — RGBA 반정밀도에 MSAA 4배다
    // (`antialias: true`). 덮은 정도는 0~1 하나뿐이라 그 여덟 배를 쓸 이유가
    // 없다. R8로 내린다 — `r8unorm`은 섞기가 되므로 반투명 합성은 그대로다
    const coverTex = scenePass.getTexture(COVER)
    coverTex.format = RedFormat
    coverTex.type = UnsignedByteType

    // 조우 컷인이 화면을 미는 자리 (`fx/cutInWarp`). 안 돌 때는 항등이다
    const warp = cutInWarp()

    // ⚠️ **이 둘이 상수면 창을 키우는 순간 윤곽이 어긋난다** (기획서 RP-06).
    // 한때 만들 때의 `domElement.width`로 나눠 **숫자를 구워 넣었다.** UV 간격을
    // 굽는다는 것은 **화소 간격이 창 크기에 비례해 끌려간다**는 뜻이다:
    //
    //     실제 화소 간격 = EDGE_TEXELS x (지금 너비 / 구울 때 너비)
    //
    // 960에서 구운 그래프를 1920에서 쓰면 1.4화소를 재려던 것이 **2.8화소**가
    // 되어 선이 굵고 흐려지고, 480으로 줄이면 0.7화소가 되어 **끊긴다.**
    // 노트북을 외부 모니터에 꽂기만 해도 — 창 크기도 DPR도 그때 바뀐다 —
    // 그 자리에 닿는다. 유니폼으로 두고 지금 타깃 크기에서 매번 다시 낸다
    const texelX = uniform(0)
    const texelY = uniform(0)
    const syncSize = () => {
      const x = EDGE_TEXELS / Math.max(1, renderer.domElement.width)
      const y = EDGE_TEXELS / Math.max(1, renderer.domElement.height)
      if (texelX.value !== x) texelX.value = x
      if (texelY.value !== y) texelY.value = y
    }
    syncSize()

    /**
     * 그 자리의 카메라까지 거리(타일).
     *
     * **깊이 버퍼 값을 그대로 빼면 안 된다** — 비선형이라 z=10과 z=11의 차가
     * 0.0004인데 z=40과 41은 0.00006이다. 거리마다 문턱값이 달라져야 해서
     * 하나로는 못 잡는다. 시점 공간으로 되돌리면 단위가 타일이 된다
     */
    const at = (dx: Tsl, dy: Tsl) =>
      perspectiveDepthToViewZ(depthTex.sample(warp.uv.add(vec2(dx, dy))),
        float(cam.near), float(cam.far)).negate()

    const zero = float(0)
    const c = at(zero, zero)
    const diff = at(texelX.negate(), zero).sub(c).abs()
      .max(at(texelX, zero).sub(c).abs())
      .max(at(zero, texelY.negate()).sub(c).abs())
      .max(at(zero, texelY).sub(c).abs())
    // ⚠️ **덮은 정도를 곱하지 않으면 건물을 투과해 뒤의 선이 보인다.** 깊이
    // 텍스처에는 반투명 면 **뒤**의 깊이가 적혀 있어서, 그 자리의 윤곽은 뒤에
    // 있는 것의 실루엣이다. 흐려진 집 위에 마을이 선으로 그려졌다
    const edge = diff.smoothstep(EDGE_NEAR, EDGE_FAR).mul(float(EDGE_STRENGTH))
      .mul(cover.sample(warp.uv).r)

    // 밀려 나간 자리는 검다 — 원작이 창 밖을 그렇게 둔다
    const shaded = color.sample(warp.uv).mul(float(1).sub(edge)).mul(warp.inside)
    const glow = bloom(shaded, 0.28, 0.4, 0.92)
    post.outputNode = shaded.add(glow)
    return {
      step: 'outline',
      render: () => { warp.sync(); post.render() },
      syncSize,
      // ⚠️ **우리가 만든 셋만 놓는다.** 씬·카메라·거기 걸린 재질과 텍스처는
      // 월드가 쥔 것이고 다음 체인도 같은 것을 쓴다 — 여기서 놓으면 물러난
      // 뒤의 화면이 통째로 빈다 (기획서 RP-05의 "소유자를 정한 뒤 정리한다")
      dispose: () => { disposeAll(post, scenePass, glow) },
    }
  } catch (e) {
    console.warn('[post] 윤곽 체인 실패 — 블룸만으로 물러난다', e)
    return null
  }
}

function bloomOnly(renderer: WebGPURenderer, scene: Scene, camera: Camera): Built | null {
  try {
    const post = new RenderPipeline(renderer)
    const warp = cutInWarp()
    const scenePass = pass(scene, camera)
    const color = scenePass.getTextureNode('output').sample(warp.uv).mul(warp.inside)
    const glow = bloom(color, 0.3, 0.4, 0.9)
    post.outputNode = color.add(glow)
    return {
      step: 'bloom',
      render: () => { warp.sync(); post.render() },
      // 이 칸에는 화면 크기에 매인 상수가 없다 — 블룸은 제 타깃을 스스로 맞춘다
      syncSize: () => {},
      dispose: () => { disposeAll(post, scenePass, glow) },
    }
  } catch (e) {
    console.warn('[post] TSL RenderPipeline 초기화 실패 — 기본 렌더로 폴백', e)
    return null
  }
}

/**
 * 놓을 수 있는 것만 놓는다.
 *
 * ⚠️ **정리하다 터지는 것이 정리 안 하는 것보다 나쁘다.** `dispose()`는 물러나는
 * 길 한가운데서 불리므로, 여기서 예외가 나가면 다음 칸을 세우지도 못한 채
 * 사다리가 끊긴다 — 후처리가 아니라 게임이 멎는다
 */
function disposeAll(...owned: readonly unknown[]): void {
  for (const one of owned) {
    try {
      (one as { dispose?: () => void }).dispose?.()
    } catch (e) {
      console.warn('[post] 자원을 놓다 터졌다 — 넘어간다', e)
    }
  }
}
