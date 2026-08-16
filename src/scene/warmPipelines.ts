// 사람 모델은 **다 구워진 뒤에** 씬에 붙인다.
//
// ⚠️ **여기서 아끼는 것은 우리 코드가 아니다.** ANGLE은 `linkProgram`에서 아무
// 일도 안 하고(실측 45회 0.6ms) HLSL 번역을 `getProgramParameter(LINK_STATUS)`에서
// 한다 — 리그 로비에서 45회 3,518ms. 그동안 우리 `/src` 코드가 쓴 시간은 전부
// 합쳐 17ms(0.2%)다. 무엇을 최적화해도 안 줄어드는 시간이고, 줄이는 길은 그
// 물음을 **렌더 프레임 밖으로 빼는 것**뿐이다.
//
// three가 그 길을 갖고 있다. `Pipelines._getRenderPipeline`이
// `backend.createRenderPipeline(renderObject, promises)`를 부르는데,
//
//     if ( promises !== null && this.parallel ) {   // KHR_parallel_shader_compile
//       const checkStatus = () => {
//         if ( gl.getProgramParameter( programGPU, parallel.COMPLETION_STATUS_KHR ) ) {
//           this._completeCompile( renderObject, pipeline ); resolve()
//         } else requestAnimationFrame( checkStatus )
//
// 다 된 뒤에야 `LINK_STATUS`를 물으므로 **안 막힌다.** 그리고 `promises`가
// 배열이 되는 것은 `Renderer.compileAsync()`로 들어갈 때뿐이다.
//
// ⚠️ **프로그램이 왜 그렇게 많은가 — 재료가 아니라 뼈다.** 셰이더 원문을 떠
// 보니(`.audit/shaders.mjs`) 리그 로비 63개 중 29개가 스킨이고, 그 정점 셰이더는
// **한 줄만 빼고 똑같았다**:
//
//     uniform NodeBuffer_17872 { mat4 buffer17872[6]; }
//     uniform NodeBuffer_19634 { mat4 buffer19634[2]; }
//
// three의 `skinning()`이 `referenceBuffer('skeleton.boneMatrices', 'mat4',
// bones.length)`를 **SkinnedMesh마다 새로** 만들고 그 이름에 노드 id가 박힌다.
// 파이프라인 열쇠는 `stageVertex.id + ',' + stageFragment.id`이고 그 stage는
// **원문 문자열로** 캐시되므로(`programs.vertex.get(nodeBuilderState.vertexShader)`),
// **사람 하나에 정점 프로그램 하나**다. 조각 셰이더는 63개가 32가지로 겹치는데
// 정점은 44가지로 갈렸다. `SkeletonUtils.clone`이 사람마다 뼈를 새로 짓는 이상
// (그래야 각자 다른 자세로 선다) 우리가 못 줄인다 — 줄일 수 없으면 옮긴다.
//
// ⚠️ **씬을 훑어서 굽는 길로 먼저 갔다가 물렸다.** 이미 씬에 붙은 것을 31층으로
// 잠깐 숨겼다 굽는 방식인데, 실측으로 **붙기가 9.3초 → 14.7초**가 되고 제일 긴
// 프레임이 1,233ms → 1,533ms로 되레 나빠졌다. 한 번에 여섯씩 줄 세워 굽느라
// 세상이 늦게 떴다. 그때 잰 값이 길을 알려 줬다:
//
//     미리 구운 것 52개 · 0ms (안 막힘)
//     그리다 구운 것 53개 · 4,756ms  ← 이것이 막는 시간
//
// **미리 구운 것은 정말로 0ms다.** 갈래가 틀린 게 아니라 **너무 늦게** 굽고
// 있었다. 그래서 훑기를 버리고, 모델이 **씬에 붙기 전** — 아직 아무도 그릴 수
// 없는 그 순간 — 에 굽는다. 숨길 필요도, 시한을 걸 필요도 없다.
//
// ⚠️ **후처리를 켜 두는 한 미리 굽기가 진짜 렌더와 겹치지 못한다.** 세상은
// 화면에 바로 안 그려진다 — `pass(scene, camera)`가 만든 `PassNode`가 제 타깃에
// 그리고 윤곽·블룸이 그것을 받아 올린다 (`fx/post`). 그런데 렌더 컨텍스트 열쇠는
// `attachmentState-mrt-**callDepth**`이고 (`RenderContexts.get`), 그 `context.id`가
// 파이프라인 열쇠에 들어간다 (`RenderObject.getMaterialCacheKey`).
//
//     진짜 렌더: `RenderPipeline` → 쿼드 render(깊이 0) → PassNode → **세상 render(깊이 1)**
//     compileAsync: `_renderContexts.get(renderTarget, mrt)` — **깊이는 늘 0**
//
// 그래서 렌더 타깃을 억지로 맞춰도 안 겹친다. 실측 A/B(209번도로 포켓치):
// 타깃을 씌운 것 **48개 1,255ms**, 안 씌운 것 **51개 1,304ms** — 실행 편차 안이라
// **아무 값도 안 움직였다.** 밖에서 `callDepth`를 줄 길이 없으므로 여기서는
// 안 건드린다. 위의 「훑어서 굽기」가 되레 나빠졌던 것도 같은 자리다.
//
// 굽는 양 자체를 줄이는 쪽이 실제로 들었다 — 조각마다 갈리던 뼈 개수를 하나로
// 묶어서(`unifySkeleton`) 209번도로 링크가 **5,817ms → 1,255ms**가 됐다.
import type { Camera, Object3D, Scene } from 'three'
import type { WebGPURenderer } from 'three/webgpu'

/**
 * 이만큼 지나면 안 구워졌어도 세운다.
 *
 * ⚠️ **사람이 영영 안 서는 것이 제일 나쁘다.** 굽기가 실패하든 약속이 안 풀리든,
 * 한 프레임 막히는 편이 사람이 사라지는 것보다 낫다.
 *
 * ⚠️ **기다리는 동안 그 자리는 빈다.** 판때기로 물러서게 해 보려 했지만, 그러면
 * 「모델이 선 사람」 집합이 굽는 박자에 맞춰 흔들려서 부모 상태가 프레임마다
 * 밀린다 (`NpcModels`의 `onStanding` 자리에 실측을 적어 뒀다). 모델은 어차피
 * 받는 동안에도 안 서 있으므로, 그 빈 자리가 조금 길어지는 쪽을 골랐다.
 *
 * ⚠️ **그래도 짧게 잡으면 안 된다.** 4초로 뒀다가 209번도로에서 물렸다: 한 맵에
 * 구울 것이 250개고 드라이버가 밀리니 시한이 먼저 끝나 **안 구운 채로 붙었고**,
 * 그 컴파일이 다시 프레임을 막아 더 밀리는 눈덩이가 됐다
 */
const MAX_WAIT_MS = 20_000

/**
 * `child`를 미리 구운 **뒤에** `parent`에 붙인다.
 *
 * ⚠️ **아직 씬 밖이라는 것이 요점이다.** 씬에 없으면 `_projectObject`가 못 보고,
 * 못 보면 진짜 렌더가 이번 프레임에 굽지 않는다 — 숨기거나 층을 만질 이유가 없다.
 * 빛·환경은 `compileAsync`의 **셋째 인자**로 들어간 진짜 씬에서 걷어 온다:
 *
 *     if (targetScene !== scene) targetScene.traverseVisible((o) => {
 *       if (o.isLight && o.layers.test(camera.layers)) renderList.pushLight(o) })
 *
 * 그래서 원문이 진짜 렌더의 것과 같아지고, 렌더는 캐시를 맞고 안 막힌다.
 *
 * @param gl 렌더러
 * @param scene 진짜 씬 — 빛과 환경을 여기서 걷어 온다
 * @param camera 진짜 카메라
 * @param parent 다 구워지면 붙일 곳
 * @param child 구울 것
 * @param wanted 다 구워졌을 때도 여전히 세울 것인가 (맵을 뜨면 아니다)
 */
export function addWhenWarm(
  gl: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  parent: Object3D,
  child: Object3D,
  wanted: () => boolean = () => true,
): void {
  // ⚠️ **잘라내기를 끈다.** 아직 자리를 못 잡아 원점에 서 있는데, 카메라
  // 절두체가 원점을 안 담으면 `_projectObject`가 걸러서 **아무것도 안 구워진다**
  const was: { at: Object3D, culled: boolean }[] = []
  child.traverse((o) => { was.push({ at: o, culled: o.frustumCulled }); o.frustumCulled = false })

  let placed = false
  const put = (): void => {
    if (placed) return
    placed = true
    for (const w of was) w.at.frustumCulled = w.culled
    if (wanted()) parent.add(child)
  }

  const timer = setTimeout(put, MAX_WAIT_MS)
  void gl.compileAsync(child, camera, scene)
    // 못 구워도 세운다 — 안 세우는 것이 더 나쁘다
    .catch(() => { /* 그대로 붙인다 */ })
    .finally(() => { clearTimeout(timer); put() })
}
