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
import { Fog, PerspectiveCamera, RedFormat, UnsignedByteType, type Camera, type Scene } from 'three'
// ⚠️ **`PostProcessing`이 아니라 `RenderPipeline`이다.** r183에서 이름이
// 바뀌었고 옛 이름은 남아 있지만 부를 때마다 콘솔에 경고를 찍는다 —
// 화면을 훑는 하네스(`pnpm story`)가 장면마다 그 경고를 주워 왔다
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu'
import { float, floor, mod, mrt, output, pass, perspectiveDepthToViewZ, uniform, vec2 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { COVER } from './seeThrough'
import { cutInWarp } from './cutInWarp'
import { trail } from './afterimage'
import { POISON_WOBBLE_BAND, poisonWobblePixels } from '../../engine/actor/steps'

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
/**
 * 모서리로 보는 **상대** 깊이 차 — 그 자리 깊이로 나눈 값이다 (`withOutline`의 `rel`).
 *
 * ⚠️ **고정 거리(타일)로 문턱을 두면 먼 땅이 선이 된다.** 한때 0.4~1.6칸이었다.
 * 평지를 비스듬히 보면 한 화소 사이 깊이 차가 거리의 제곱으로 자라서(z²/(f·h)),
 * 1인칭(눈 1.38)으로 수평을 보면 20칸부터 맨땅이 어두워지기 시작해 40칸에서
 * 밝기 55%가 됐다 — 지평선 앞에 회색 띠가 깔렸다. 상대값으로 나누면 평지는
 * 거리에 **비례**해서만 자라고, 내려가는 단차는 거리와 무관해진다.
 *
 * 잰 값 (`max(c, 1)`로 나눈 값 · 한 세로줄을 광선으로 그려 깊이를 낸 것 · 이웃은 ±1화소):
 *
 *     평지 1인칭 1080p   첫 차분  20칸 0.014 · 40칸 0.029 · 82칸 0.061 · 125칸 0.095
 *                        둘째 차분 40칸 0.0015 (평면이면 2 × 첫 차분²)
 *     평지 1인칭  720p   첫 차분  40칸 0.044 · 83칸 0.095
 *     내려가는 단차      3인칭(8·4) 한 칸 0.25 · 반 칸 0.126 — 주인공 앞 3칸이든 10칸이든 같다
 *                        방 렌즈(50°) 반 칸 0.10 · 1인칭 반 칸 0.36
 *
 * 그래서 0.05~0.15다: 3인칭 반 칸 단차가 0.85, 방의 반 칸이 0.54, 한 칸이면 다 1이다.
 * 평지는 아래 `EDGE_FLOOR`를 곱한 첫 차분이 문턱에 닿는 자리가 720p 85칸 · 1080p 130칸이고
 * 그보다 앞에서 안개가 윤곽을 걷는다 (`EDGE_FOG_FADE`)
 */
const REL_NEAR = 0.05
const REL_FAR = 0.15
/**
 * 첫 차분을 얼마나 섞는가.
 *
 * 판정은 **축별 둘째 차분** `|a + b − 2c|`가 맡는다 — 평면에서는 거의 0이고(위 표의 2 × 첫 차분²)
 * 단차에서는 끊긴 거리 그대로다. 다만 이웃 둘이 반대쪽으로 같은 만큼 끊기면(가운데 화소가
 * 한 화소짜리 턱 위에 선 계단) 둘째 차분이 0으로 지워진다. 그 자리를 첫 차분이 하한으로 받친다.
 * 절반만 섞는 것은 평지가 문턱에 닿는 거리를 두 배로 미루기 위해서다
 */
const EDGE_FLOOR = 0.5
/**
 * 윤곽이 안개 시작에서 빠지기 시작해 **안개 띠의 이 몫**에서 0이 된다.
 *
 * 안개에 묻히는 면 위에 선만 진하게 남으면 그것이 띠가 된다. 반에서 끝내면 낮 84칸 ·
 * 아침 77 · 해질녘 70 · 밤 63 · 심야 55 · 실내 44칸에서 다 빠진다 — 위의 평지가
 * 문턱에 닿는 85칸보다 앞이다(날씨는 안개를 당기기만 한다). 3인칭 단차(카메라에서
 * 12~18칸)는 맑은 날이면 어느 시각에도 안개 시작(22칸~)보다 앞이라 안 건드린다
 */
const EDGE_FOG_FADE = 0.5
/** 안개가 없을 때의 안개 시작 — 윤곽을 안 걷는다 */
const NO_FOG = 1e6
/**
 * 이웃을 몇 화소 옆에서 보는가.
 *
 * ⚠️ **화소 수지 비율이 아니다.** 그래서 화면 크기로 나눠 UV로 바꿔야 하고,
 * 그 나눗셈이 **창이 바뀔 때마다 다시** 되어야 한다 (`syncSize`)
 */
const EDGE_TEXELS = 1.4

/** 원작 화면 폭 (픽셀). 독 일렁임의 폭이 이 단위다 */
const DS_WIDTH = 256
/** 원작 화면 높이 (주사선). `uv().y × 192`가 곧 원작 주사선이다 (`fx/cutInWarp`) */
const DS_LINES = 192

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
 * 먼 곳에서 선이 사라진다. 그 차를 다시 그 자리 깊이로 나눠 **상대값**으로 잰다
 * (`REL_NEAR`의 표) — 타일 단위 그대로 두면 이번에는 먼 평지가 선이 된다.
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
    // 독 일렁임이 그 위에 한 번 더 민다. 3D 화면이 통째로 밀리므로 색·깊이·덮은 정도를 다 이 UV로 읽는다
    const wobble = poisonWobble(warp.uv)
    const uv = wobble.uv

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
      perspectiveDepthToViewZ(depthTex.sample(uv.add(vec2(dx, dy))),
        float(cam.near), float(cam.far)).negate()

    // ⚠️ **깊이 텍스처는 가까운 화소를 집는다**(`DepthTexture`의 기본 `NearestFilter`).
    // 1.4화소 옆을 물으면 화소 중심에서 −0.9 · +1.9가 되어 **바로 옆 화소**가 온다 —
    // 위 표가 ±1화소로 잰 까닭이다
    const zero = float(0)
    const c = at(zero, zero)
    const l = at(texelX.negate(), zero)
    const r = at(texelX, zero)
    const u = at(zero, texelY.negate())
    const d = at(zero, texelY)
    const first = l.sub(c).abs().max(r.sub(c).abs())
      .max(u.sub(c).abs()).max(d.sub(c).abs())
    const twice = c.mul(float(2))
    const second = l.add(r).sub(twice).abs().max(u.add(d).sub(twice).abs())
    const rel = second.max(first.mul(float(EDGE_FLOOR))).div(c.max(float(1)))

    // 안개 시작부터 걷는다 (`EDGE_FOG_FADE`). 안개가 시점 깊이의 smoothstep이라
    // (three `rangeFogFactor`) 같은 `c`로 재면 안개와 같은 자를 쓴다.
    // 안개 값은 시각·날씨·맵마다 움직이므로(`scene/MapStreamer`) 그릴 때마다 다시 읽는다
    const fogNear = uniform(NO_FOG)
    const fogGone = uniform(NO_FOG + 1)
    const syncFog = () => {
      const fog = scene.fog
      const near = fog instanceof Fog ? fog.near : NO_FOG
      // ⚠️ smoothstep은 두 끝이 같으면 값이 정해지지 않는다(WGSL) — 조금이라도 벌린다
      const gone = fog instanceof Fog
        ? Math.max(near + 1e-3, near + (fog.far - near) * EDGE_FOG_FADE) : NO_FOG + 1
      if (fogNear.value !== near) fogNear.value = near
      if (fogGone.value !== gone) fogGone.value = gone
    }
    syncFog()
    const fade = float(1).sub(c.smoothstep(fogNear, fogGone))

    // ⚠️ **덮은 정도를 곱하지 않으면 건물을 투과해 뒤의 선이 보인다.** 깊이
    // 텍스처에는 반투명 면 **뒤**의 깊이가 적혀 있어서, 그 자리의 윤곽은 뒤에
    // 있는 것의 실루엣이다. 흐려진 집 위에 마을이 선으로 그려졌다
    const edge = rel.smoothstep(float(REL_NEAR), float(REL_FAR)).mul(fade).mul(float(EDGE_STRENGTH))
      .mul(cover.sample(uv).r)

    // 밀려 나간 자리는 검다 — 원작이 창 밖을 그렇게 둔다
    // 창기둥 영상의 잔상(`fx/afterimage`)이 켜져 있으면 섞은 화면을 읽는다. 꺼져 있으면 그대로다
    const shaded = trail(color, uv as never).mul(float(1).sub(edge)).mul(warp.inside)
    const glow = bloom(shaded, 0.28, 0.4, 0.92)
    post.outputNode = shaded.add(glow)
    return {
      step: 'outline',
      render: () => { warp.sync(); wobble.sync(); syncFog(); post.render() },
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
    const wobble = poisonWobble(warp.uv)
    const scenePass = pass(scene, camera)
    const color = trail(scenePass.getTextureNode('output'), wobble.uv as never).mul(warp.inside)
    const glow = bloom(color, 0.3, 0.4, 0.9)
    post.outputNode = color.add(glow)
    return {
      step: 'bloom',
      render: () => { warp.sync(); wobble.sync(); post.render() },
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
 * 필드 독 일렁임 (`Field_DoPoisonEffect` · `overlay005/ov5_021EF4BC.c`).
 *
 * 원작은 H블랭크마다 3D 층의 가로 오프셋(`G3X_SetHOffset`)을 갈아 끼운다 — 열 줄씩
 * 번갈아 반대로, 폭은 틱마다 0·1·2·3·2·1·0픽셀이다(`engine/actor/steps`의
 * `POISON_WOBBLE_PIXELS` · `poisonWobbleSign`). 우리 화면은 3D 한 장이라 후처리에서
 * UV를 미는 것이 같은 일이다 — 조우 컷인의 조각 밀기(`fx/cutInWarp`)와 같은 자리다.
 * 오프셋이 양수면 그림이 왼쪽으로 가므로 UV에 그대로 더한다.
 *
 * ⚠️ **안 도는 동안에는 항등이다** — 폭이 0이면 0을 곱해 더한다. 이 노드는 모든
 * 프레임에 든다.
 *
 * 밀려 빈 화면 끝(최대 3픽셀 = 화면 폭의 1.2%)은 가장자리 화소가 늘어나 메운다
 * (렌더 타깃의 끝 붙잡기). 원작 화면에서 그 자리가 무엇으로 차는지는 아직 못 맞대 봤다
 */
function poisonWobble(base: ReturnType<typeof cutInWarp>['uv']) {
  const shift = uniform(0)
  const band = floor(base.y.mul(float(DS_LINES)).div(float(POISON_WOBBLE_BAND)))
  // 짝수 묶음이 −, 홀수 묶음이 + (`poisonWobbleSign`)
  const sign = mod(band, float(2)).mul(float(2)).sub(float(1))
  return {
    uv: vec2(base.x.add(shift.mul(sign)), base.y),
    sync() {
      const at = poisonWobblePixels(performance.now()) / DS_WIDTH
      if (shift.value !== at) shift.value = at
    },
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
