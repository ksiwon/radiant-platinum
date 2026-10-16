// three가 **안 놓는 렌더러 자원**을 놓는다 (REPAIR §149)
//
// 맵을 옮길 때마다 GPU 메모리가 쌓였다. 실측(2026-10-14 mac 헤드리스 WebGL2 · 게이트 80 → 206번도로 → 영원시티 → 마트를 열 초씩
// 돌기): 한 바퀴마다 GL 프로그램 약 197 · VAO 약 206 · 버퍼 약 151이 살아 남고 GPU 프로세스가 60~100MB 늘었다. three의 `info.memory`는
// 내내 그대로라 그 계기판으로는 안 보였다. 구멍이 셋이다(three 0.185):
//
// 1. **렌더 물체가 재질이 살아 있는 한 산다.** `RenderObject`는 재질 · 지오메트리의 `dispose` 사건에 제 귀를 걸어 두므로, 재질 ·
//    지오메트리를 캐시해 나눠 쓰는 물체(맵 소품 · 지형 조각)는 장면에서 빠져도 렌더 물체가 남는다. 그것이 잡은 파이프라인 · 유니폼
//    버퍼 · 노드도 같이 남는다
// 2. **WebGL 백엔드가 프로그램 · 셰이더를 안 지운다.** 파이프라인을 놓을 때(`Pipelines._releasePipeline`)는 캐시 열쇠만, 셰이더 단계를
//    놓을 때(`_releaseProgram`)는 장부만 지운다 — `gl.deleteProgram` · `gl.deleteShader`가 백엔드 어디에도 없다
// 3. **VAO를 안 지운다.** 속성 id로 엮은 열쇠로 캐시하는데(`vaoCache`), 속성이 지워져도 그 VAO는 남는다
//
// ⚠️ **바로 지우면 안 된다 — 한 번 그렇게 넣었다가 journey 칸 1이 섰다**(2026-10-14 `dca8f361` → 되돌림 `81ad8968`). 201번도로 가방
// 장면이 안 열렸고, 렌더 물체를 「장면에서 떨어진 지 5초」로 치운 판은 FPS 4에 주인공이 안 그려졌다. 세 군데가 문다:
// · **비동기 굽기가 지운 프로그램을 계속 묻는다.** `createRenderPipeline`이 `COMPLETION_STATUS_KHR`를 rAF마다 묻는데, 다 굽기 전에
//   지우면 그 물음이 영영 참이 안 되어 약속이 안 풀리고 그 물체는 안 그려진다. → 굽기가 끝난(`pipeline`이 선) 것만 지운다
// · **VAO를 다른 렌더 물체가 아직 들고 있다.** 그리는 길은 열쇠가 아니라 렌더 물체 쪽 장부(`attributesData.vaoGPU`)에서 VAO를 꺼낸다.
//   나눠 쓰는 속성(복제한 모델이 지오메트리를 나눠 쓴다)이 한쪽에서 지워져도 다른 쪽은 그 VAO로 그린다 — 지운 VAO로 그리면 아무것도
//   안 나온다. → 살아 있는 렌더 물체 누구도 안 든 VAO만 지운다
// · **잠깐 떨어진 물체를 치우면 다시 붙을 때마다 동기로 굽는다.** 사람 LOD · 모델 갈아 끼우기가 물체를 떼었다 붙인다. → 「장면에 없음」이
//   아니라 **오래(`IDLE_MS`) 안 그려진** 렌더 물체만 치운다
//
// 지우기는 모두 **미뤄서**(`SWEEP_MS`마다) 한다. 파이프라인 · 단계가 그 사이에 다시 캐시에 오르면(같은 열쇠로 다시 지으면 새 객체라
// 오를 일은 없지만) 안 지운다.
//
// ⚠️ **GL 프로그램 · 셰이더 · VAO 지우기는 WebGL 백엔드에서만 건다.** WebGPU 쪽 객체는 참조가 끊기면 브라우저가 거둔다.
// 렌더 물체 치우기는 백엔드와 상관없이 건다 — 같은 파이프라인 · 버퍼 장부를 쓴다.
// ⚠️ **three의 속을 감싼다** (`asyncPipelines`와 같은 꼴). 자리가 달라졌으면(판이 바뀌면) 경고만 남기고 아무것도 안 한다
import type { WebGPURenderer } from 'three/webgpu'

/**
 * 이만큼 안 그려진 렌더 물체를 치운다 (ms) — 우리 값이다.
 *
 * 짧으면 미리 구워 둔 것(`FieldFade.warm` · 배틀 무대)이 쓰이기 전에 치워져 처음 쓸 때 동기로 굽는다(ANGLE에서 한 번에 100~350ms).
 * 길면 그만큼의 맵이 GPU에 남는다 — 맵 넷 한 바퀴가 40초쯤이라 두 분이면 여남은 맵이다
 */
const IDLE_MS = 120_000
/** 미룬 지우기를 이만큼마다 한다 (ms) */
const SWEEP_MS = 2_000
/** 비동기 굽기가 이만큼 지나도 안 끝난 프로그램은 버려진 것으로 보고 지운다 (ms) */
const COMPILE_GIVE_UP_MS = 60_000

interface DataMapLike {
  get(object: object): Record<string, unknown>
}

interface GlBackendLike extends DataMapLike {
  isWebGLBackend?: boolean
  gl: WebGL2RenderingContext
  vaoCache: Record<string, WebGLVertexArrayObject | undefined>
  state: { currentVAO: WebGLVertexArrayObject | null, resetVertexState(): void }
  destroyAttribute(attribute: object): void
}

interface StageLike { usedTimes: number, code: string, stage: string }
interface PipelineLike { usedTimes: number, cacheKey: string }

interface PipelinesLike {
  caches: Map<string, unknown>
  programs: Record<string, Map<string, unknown>>
  _releasePipeline(pipeline: PipelineLike): void
  _releaseProgram(program: StageLike): void
}

interface RenderObjectLike {
  onDispose: (() => void) | null
  dispose(): void
  attributes: object[] | null
}

interface RenderObjectsLike {
  createRenderObject(...args: unknown[]): RenderObjectLike
  get(...args: unknown[]): RenderObjectLike
}

/** 놓은 수 — 탐침 · 시험이 읽는다 */
const released = { programs: 0, shaders: 0, vaos: 0, renderObjects: 0 }

export function glResourcesReleased(): Readonly<typeof released> {
  return released
}

/** 마지막으로 그린 시각(ms) — 렌더 물체마다 */
const LAST_DRAWN = Symbol('lastDrawn')
type Stamped = RenderObjectLike & { [LAST_DRAWN]?: number }

/**
 * 오래 안 그려진 렌더 물체를 고른다. 순수 함수 — 시험이 부른다
 *
 * @param now 지금 시각(ms)
 */
export function idleRenderObjects<T extends { [LAST_DRAWN]?: number }>(live: Iterable<T>, now: number, idleMs = IDLE_MS): T[] {
  const out: T[] = []
  for (const ro of live) if (now - (ro[LAST_DRAWN] ?? now) >= idleMs) out.push(ro)
  return out
}

/** 시험이 렌더 물체에 그린 시각을 찍는다 */
export function stampDrawn<T extends object>(ro: T, at: number): T & { [LAST_DRAWN]: number } {
  ;(ro as { [LAST_DRAWN]?: number })[LAST_DRAWN] = at
  return ro as T & { [LAST_DRAWN]: number }
}

/**
 * 렌더러가 선 뒤에 한 번 (`Stage`).
 *
 * @param alive 이 렌더러가 아직 쓰이는가 — 장치를 잃어 새 렌더러로 갈아 끼우면(`generation`) 거짓이 되고 타이머가 멎는다
 */
export function installGlResourceRelease(renderer: WebGPURenderer, alive: () => boolean): void {
  // 견줄 판 — 개발 서버에서 페이지가 `__noGlRelease`를 세웠으면 안 건다(탐침 `.audit/gpuleak-20261016`이 같은 돌기를 둘 다 잰다).
  // 주소 쿼리는 앱이 첫 화면에서 지워서 못 쓴다
  if (import.meta.env.DEV && (globalThis as { __noGlRelease?: boolean }).__noGlRelease === true) return
  const clock = { now: performance.now() }
  const live = installRenderObjectAging(renderer, clock)
  if (live === null) return
  const backend = (renderer as unknown as { backend?: GlBackendLike }).backend
  const gl = backend?.isWebGLBackend === true ? installGlRelease(renderer, backend, live) : null
  const timer = setInterval(() => {
    if (!alive()) { clearInterval(timer); live.clear(); return }
    const now = performance.now()
    clock.now = now
    // 렌더 물체를 먼저 — three가 제 길(`onDispose`)로 파이프라인 · 바인딩 · 노드를 놓고, 그 파이프라인이 아래 대기열에 든다
    for (const ro of idleRenderObjects(live, now)) {
      ro.dispose()
      released.renderObjects++
    }
    gl?.drain(now)
  }, SWEEP_MS)
}

/** 렌더 물체를 장부에 들고, 그릴 때마다 시각을 찍는다. 살아 있는 렌더 물체 모음을 돌려준다 */
function installRenderObjectAging(renderer: WebGPURenderer, clock: { now: number }): Set<Stamped> | null {
  const objects = (renderer as unknown as { _objects?: RenderObjectsLike })._objects
  if (!objects || typeof objects.createRenderObject !== 'function' || typeof objects.get !== 'function') {
    console.warn('[glResourceRelease] three의 렌더 물체 자리가 달라졌다 — 렌더러 자원을 안 놓는다')
    return null
  }
  const live = new Set<Stamped>()
  // 시각은 쓸기 때(`SWEEP_MS`)만 갱신한다 — `get`은 그리는 물체마다 프레임마다 불리므로 `performance.now()`를 거기서 안 부른다
  const create = objects.createRenderObject.bind(objects)
  objects.createRenderObject = (...args: unknown[]) => {
    const ro = create(...args) as Stamped
    const done = ro.onDispose
    ro.onDispose = () => { live.delete(ro); done?.() }
    ro[LAST_DRAWN] = clock.now
    live.add(ro)
    return ro
  }
  const get = objects.get.bind(objects)
  objects.get = (...args: unknown[]) => {
    const ro = get(...args) as Stamped
    ro[LAST_DRAWN] = clock.now
    return ro
  }
  return live
}

/** 미룬 GL 지우기 */
interface GlRelease {
  drain(now: number): void
}

function installGlRelease(renderer: WebGPURenderer, backend: GlBackendLike, live: Set<Stamped>): GlRelease | null {
  const pipelines = (renderer as unknown as { _pipelines?: PipelinesLike })._pipelines
  if (!pipelines || typeof pipelines._releasePipeline !== 'function' || typeof pipelines._releaseProgram !== 'function'
    || !(pipelines.caches instanceof Map) || typeof backend.destroyAttribute !== 'function'
    || typeof backend.vaoCache !== 'object' || typeof backend.state?.resetVertexState !== 'function') {
    console.warn('[glResourceRelease] three의 GL 자원 자리가 달라졌다 — GL 프로그램 · VAO를 안 놓는다')
    return null
  }
  const gl = backend.gl
  const pendingPipelines: { pipeline: PipelineLike, at: number }[] = []
  const pendingStages: { stage: StageLike, at: number }[] = []
  const pendingVaos = new Set<WebGLVertexArrayObject>()

  const releasePipeline = pipelines._releasePipeline.bind(pipelines)
  pipelines._releasePipeline = (pipeline) => {
    releasePipeline(pipeline)
    pendingPipelines.push({ pipeline, at: performance.now() })
  }
  const releaseProgram = pipelines._releaseProgram.bind(pipelines)
  pipelines._releaseProgram = (stage) => {
    releaseProgram(stage)
    pendingStages.push({ stage, at: performance.now() })
  }
  // VAO 열쇠는 「:속성id:속성id…」다 (`_getVaoKey`). 속성 하나가 지워지면 그 id가 든 열쇠는 다시 안 맞는다 — 열쇠는 바로 빼고
  // (같은 id가 다시 나와도 새 VAO를 짓게) VAO 자체는 대기열에 넣는다
  const destroyAttribute = backend.destroyAttribute.bind(backend)
  backend.destroyAttribute = (attribute) => {
    const id = backend.get(attribute).id
    if (id !== undefined) {
      const mark = String(id)
      for (const key of Object.keys(backend.vaoCache)) {
        if (!key.split(':').includes(mark)) continue
        const vao = backend.vaoCache[key]
        if (vao) pendingVaos.add(vao)
        delete backend.vaoCache[key]
      }
    }
    destroyAttribute(attribute)
  }

  const inCache = (stage: StageLike): boolean => pipelines.programs[stage.stage]?.get(stage.code) === stage

  return {
    drain(now) {
      // 프로그램 — 아무도 안 쓰고(`usedTimes` 0), 캐시에 다시 안 올랐고, 굽기가 끝난 것만
      for (let i = pendingPipelines.length - 1; i >= 0; i--) {
        const { pipeline, at } = pendingPipelines[i]!
        if (pipeline.usedTimes > 0 || pipelines.caches.get(pipeline.cacheKey) === pipeline) {
          pendingPipelines.splice(i, 1)
          continue
        }
        const data = backend.get(pipeline)
        const program = data.programGPU as WebGLProgram | undefined
        if (!program) { pendingPipelines.splice(i, 1); continue }
        // 비동기 굽기가 아직 묻고 있다 — 끝나면 `_completeCompile`이 `pipeline`을 세운다
        if (data.pipeline == null && now - at < COMPILE_GIVE_UP_MS) continue
        gl.deleteProgram(program)
        data.programGPU = undefined
        data.pipeline = undefined
        released.programs++
        pendingPipelines.splice(i, 1)
      }
      // 셰이더 — 그 단계를 쓰는 파이프라인이 다 놓인 뒤에 온다. 붙은 프로그램이 아직 살아 있어도 GL이 그 프로그램과 같이 거둔다
      for (let i = pendingStages.length - 1; i >= 0; i--) {
        const { stage } = pendingStages[i]!
        pendingStages.splice(i, 1)
        if (stage.usedTimes > 0 || inCache(stage)) continue
        const data = backend.get(stage)
        const shader = data.shaderGPU as WebGLShader | undefined
        if (!shader) continue
        gl.deleteShader(shader)
        data.shaderGPU = undefined
        released.shaders++
      }
      // VAO — 살아 있는 렌더 물체 누구도 그 VAO를 들고 있지 않아야 한다
      if (pendingVaos.size > 0) {
        const held = new Set<unknown>()
        for (const ro of live) {
          if (ro.attributes === null) continue
          const vao = backend.get(ro.attributes).vaoGPU
          if (vao) held.add(vao)
        }
        for (const vao of [...pendingVaos]) {
          if (held.has(vao)) continue
          if (backend.state.currentVAO === vao) backend.state.resetVertexState()
          gl.deleteVertexArray(vao)
          pendingVaos.delete(vao)
          released.vaos++
        }
      }
    },
  }
}
