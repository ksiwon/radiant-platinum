// WebGL2 백엔드가 **안 놓는 GL 자원**을 놓는다 (REPAIR §149)
//
// three 0.185의 `WebGLBackend`는 파이프라인마다 `gl.createProgram()`을 새로 짓는데(`createRenderPipeline`), 파이프라인을 놓을 때
// (`Pipelines._releasePipeline`)는 캐시 열쇠만 지우고 프로그램을 안 지운다. 셰이더 단계를 놓을 때도(`destroyProgram`) 장부만
// 지우고 `gl.deleteShader`를 안 부른다. VAO는 속성 id로 엮은 열쇠로 캐시하는데(`vaoCache`), 속성을 지워도 그 VAO는 남는다.
// 재질 · 지오메트리는 제대로 `dispose`된다(맵 넷 한 바퀴에 재질 약 930 · 지오메트리 약 410) — 그런데 GL 쪽은 안 줄었다.
//
// 실측(2026-10-14 mac 헤드리스 WebGL2 · 게이트 80 → 206번도로 → 영원시티 → 마트를 열 초씩 돌기): 한 바퀴마다 GL 프로그램이 약 197 ·
// VAO 약 206 · 버퍼 약 151 살아 남았고 GPU 프로세스가 바퀴마다 60~100MB 늘었다. three의 `info.memory`(텍스처 229 · 지오메트리
// 298)는 내내 그대로라 그 계기판으로는 안 보였다. 50분짜리 journey 칸이 18GB · 4fps까지 간 것이 이것이다.
//
// **둘째 구멍 — 장면을 떠난 물체의 렌더 물체.** three는 렌더 물체(`RenderObject`)를 재질 · 지오메트리의 `dispose`에서만 치운다.
// 재질 · 지오메트리를 캐시해 나눠 쓰는 물체(맵 소품 · 지형 조각)는 장면에서 빠져도 그 둘이 살아 있어 렌더 물체가 남고, 그것이 잡은
// 파이프라인(프로그램)과 바인딩(유니폼 버퍼)도 안 놓인다. 프로그램 · VAO만 놓았을 때 바퀴마다 프로그램 약 76 · 버퍼 약 151이 여전히
// 남았다(같은 실측). 그래서 렌더 물체를 장부에 들고 있다가, **그려진 장면에서 떨어져 나간 물체**의 것을 5초마다 three의
// `RenderObject.dispose()`로 치운다 — 파이프라인 · 바인딩 · 노드를 three가 제 길로 놓는다. 다시 붙으면 three가 새로 만든다.
// 이쪽은 백엔드와 상관없이 건다(WebGPU도 같은 파이프라인 · 버퍼 장부를 쓴다).
//
// ⚠️ **GL 프로그램 · 셰이더 · VAO 놓기는 WebGL 백엔드에서만 건다.** WebGPU 쪽 객체는 참조가 끊기면 브라우저가 거둔다.
// ⚠️ **three의 속을 감싼다** (`asyncPipelines`와 같은 꼴). 자리가 달라졌으면(판이 바뀌면) 경고만 남기고 아무것도 안 한다
import type { WebGPURenderer } from 'three/webgpu'

interface GlBackendLike {
  isWebGLBackend?: boolean
  gl: WebGL2RenderingContext
  vaoCache: Record<string, WebGLVertexArrayObject | undefined>
  get(object: object): Record<string, unknown>
  destroyAttribute(attribute: object): void
}

interface PipelinesLike {
  _releasePipeline(pipeline: object): void
  _releaseProgram(program: object): void
}

/** 지운 수 — 탐침 · 시험이 읽는다 */
const released = { programs: 0, shaders: 0, vaos: 0, renderObjects: 0 }

interface Object3DLike { parent: Object3DLike | null }
interface RenderObjectLike {
  object: Object3DLike
  scene: Object3DLike
  dispose(): void
  onDispose: (() => void) | null
}
interface RenderObjectsLike {
  createRenderObject(...args: unknown[]): RenderObjectLike
}

/** 렌더 물체가 그려진 장면에 그 물체가 아직 붙어 있는가 (장면 자신이면 참) */
export function stillInScene(object: Object3DLike, scene: Object3DLike): boolean {
  for (let o: Object3DLike | null = object; o !== null; o = o.parent) if (o === scene) return true
  return false
}

/** 떨어져 나간 물체의 렌더 물체를 치운다. 치운 수를 돌려준다 */
export function sweepDetached(live: Set<RenderObjectLike>): number {
  let n = 0
  for (const ro of [...live]) {
    if (stillInScene(ro.object, ro.scene)) continue
    ro.dispose()
    live.delete(ro)
    n++
  }
  released.renderObjects += n
  return n
}

/** 5초마다 — 맵을 옮기면 몇 프레임 안에 옛 맵이 빠지고, 그 사이에 다시 붙는 것을 치우지 않을 만큼 넉넉하다 */
const SWEEP_MS = 5000

function installRenderObjectSweep(renderer: WebGPURenderer): void {
  const objects = (renderer as unknown as { _objects?: RenderObjectsLike })._objects
  if (!objects || typeof objects.createRenderObject !== 'function') {
    console.warn('[glResourceRelease] three의 렌더 물체 자리가 달라졌다 — 떨어진 물체의 파이프라인을 안 놓는다')
    return
  }
  const live = new Set<RenderObjectLike>()
  const create = objects.createRenderObject.bind(objects)
  objects.createRenderObject = (...args: unknown[]) => {
    const ro = create(...args)
    const done = ro.onDispose
    ro.onDispose = () => { live.delete(ro); done?.() }
    live.add(ro)
    return ro
  }
  setInterval(() => { sweepDetached(live) }, SWEEP_MS)
}

export function glResourcesReleased(): Readonly<typeof released> {
  return released
}

/** 렌더러가 선 뒤에 한 번 (`Stage`) */
export function installGlResourceRelease(renderer: WebGPURenderer): void {
  installRenderObjectSweep(renderer)
  const backend = (renderer as unknown as { backend?: GlBackendLike }).backend
  if (backend?.isWebGLBackend !== true) return
  const pipelines = (renderer as unknown as { _pipelines?: PipelinesLike })._pipelines
  if (!pipelines || typeof pipelines._releasePipeline !== 'function' || typeof pipelines._releaseProgram !== 'function'
    || typeof backend.destroyAttribute !== 'function' || typeof backend.vaoCache !== 'object') {
    console.warn('[glResourceRelease] three의 자원 자리가 달라졌다 — GL 프로그램 · VAO를 안 놓는다')
    return
  }
  const gl = backend.gl

  // 파이프라인 = 링크한 프로그램 하나 (`createRenderPipeline`의 `programGPU`). 쓰는 렌더 물체가 0이 되어야 여기 온다
  const releasePipeline = pipelines._releasePipeline.bind(pipelines)
  pipelines._releasePipeline = (pipeline) => {
    const data = backend.get(pipeline)
    const program = data.programGPU as WebGLProgram | undefined
    if (program) { gl.deleteProgram(program); released.programs++ }
    releasePipeline(pipeline)
  }

  // 셰이더 단계 = 컴파일한 셰이더 하나 (`createProgram`의 `shaderGPU`). 그 단계를 쓰는 파이프라인이 다 놓인 뒤에 온다
  const releaseProgram = pipelines._releaseProgram.bind(pipelines)
  pipelines._releaseProgram = (program) => {
    const shader = backend.get(program).shaderGPU as WebGLShader | undefined
    if (shader) { gl.deleteShader(shader); released.shaders++ }
    releaseProgram(program)
  }

  // VAO 열쇠는 「:속성id:속성id…」다 (`_getVaoKey`). 속성 하나가 지워지면 그 id가 든 VAO는 다시 못 쓴다 — 버퍼가 이미 없다
  const destroyAttribute = backend.destroyAttribute.bind(backend)
  backend.destroyAttribute = (attribute) => {
    const id = backend.get(attribute).id
    if (id !== undefined) {
      const mark = String(id)
      for (const key of Object.keys(backend.vaoCache)) {
        if (!key.split(':').includes(mark)) continue
        const vao = backend.vaoCache[key]
        if (vao) { gl.deleteVertexArray(vao); released.vaos++ }
        delete backend.vaoCache[key]
      }
    }
    destroyAttribute(attribute)
  }
}
