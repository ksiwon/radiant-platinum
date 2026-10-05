// 맵을 갈아 끼우는 동안만 렌더 파이프라인을 **비동기로** 굽는다 (REPAIR §8)
//
// 맵을 나가는 한 프레임이 2.5~7.9초 멎던 임자가 여기다. 크로미움 트레이스(`.audit/probe/warpProfile.mjs` · `TRACE=1`)로 보니 그 프레임
// 안에서 GPU 프로세스 주 스레드가 `DeviceBase::APICreateRenderPipeline` → `ShaderModuleD3D12::Compile` → `CompileShaderFXC`를
// **서른세 번 연달아** 돌았다(합 7,792ms · 하나에 최장 632ms). 렌더러의 자바스크립트는 그동안 쉬고 있었다 — 그래서 CPU 표본에는
// `(idle)`만 찍혔다. 새 맵의 재질마다 파이프라인이 처음 서는 그 프레임에 three가 `device.createRenderPipeline`(동기)을 부르기 때문이다.
//
// three에는 이미 비동기 갈래가 있다 — `Pipelines.getForRender(renderObject, promises)`에 배열을 주면 `createRenderPipelineAsync`로
// 굽고(Dawn이 작업 스레드에서 굽는다), 다 될 때까지 그 물체는 **안 그린다**(`Renderer._renderObjectDirect`의 `isReady`). 배열을 주는
// 길이 `compileAsync()` 하나뿐이라 여기서 `updateForRender` 한 자리를 감싸, **켜 둔 동안만** 그 갈래로 보낸다.
//
// ⚠️ **늘 켜 두지 않는다.** 켜 두면 처음 나오는 것은 파이프라인이 설 때까지 안 그려진다 — 스무 프레임짜리 기술 입자는 처음 한 번을
// 통째로 잃는다. 그래서 워프가 **검은 덮개를 든 동안에만** 켜고, 다 구워지면 끈 뒤에 밝힌다 (`scene/MapStreamer`)
//
// ⚠️ **three의 속을 감싼다.** `_pipelines`와 두 메서드가 없으면(판이 바뀌면) 아무것도 안 하고 경고만 남긴다 — 그때는 예전처럼 동기로 굽는다
import type { WebGPURenderer } from 'three/webgpu'

interface PipelinesLike {
  getForRender(renderObject: unknown, promises?: Promise<unknown>[] | null): unknown
  updateForRender(renderObject: unknown): void
}

const state = {
  on: false,
  /**
   * 켜 둔 쪽의 수 — 워프 · 이어하기의 덮개와, 덮개가 걷힌 뒤에 서는 야외 지역(`BdspField`)이 겹쳐 켠다. 먼저 끝난 쪽이 끄면
   * 남은 쪽이 동기로 굽게 되어(213번도로 리포트 — 지역 넷째부터 동기로 서서 다시 멎었다) 수로 센다
   */
  holds: 0,
  /** 탐침이 전후를 잰다 — 끄면 워프도 예전처럼 동기로 굽는다 (`setAsyncPipelinesAllowed`) */
  allowed: true,
  /** 굽는 중인 것 — three가 `createRenderPipeline(…, promises)`에서 채운다 */
  pending: [] as Promise<unknown>[],
  /**
   * 어느 기다림이 꺼내 가서 **아직 굽는 중인** 것의 수. ⚠️ `pending`만 보면 안 된다 — 기다림이 여럿이면(워프 덮개 · 지역마다)
   * 한쪽이 꺼내 간 사이 다른 쪽은 빈 줄을 보고 「다 구웠다」로 끝냈다. 그 바람에 덮개가 걷히고 story가 땅 없는
   * 연고시티(삼각형 12.9k)를 쟀다 (2026-10-02)
   */
  inflight: 0,
  installed: false,
}

/**
 * 재질의 `userData`에 이 깃발이 서 있으면 **언제나** 비동기로 굽는다.
 *
 * 배틀 연출(BDSP 이펙트 · 능력치 겹)이 쓴다. 그 재질들은 기술을 쓰는 순간 처음 그려지는데, 동기로 구우면 GPU 프로세스가
 * 파이프라인 수십 개를 짓는 동안 그 프레임이 0.5~0.8초 멎었다(배포판 번들 · 크로미움 트레이스 실측 2026-10-05). 판이 열릴 때
 * 미리 굽지만(`warmFxEffects`) 못 맞춘 하나가 남아도 멎지 않게 한다 — 그 하나는 구워질 때까지 몇 프레임 안 보일 뿐이다.
 * 머리말의 「늘 켜 두지 않는다」는 화면 전체 이야기다. 이 깃발은 미리 굽는 재질에만 건다
 */
export const ALWAYS_ASYNC = 'asyncPipeline'

function alwaysAsync(renderObject: unknown): boolean {
  const m = (renderObject as { material?: { userData?: Record<string, unknown> } }).material
  return m?.userData?.[ALWAYS_ASYNC] === true
}

/** 렌더러가 선 뒤에 한 번 (`Stage`) */
export function installAsyncPipelines(renderer: WebGPURenderer): void {
  const pipelines = (renderer as unknown as { _pipelines?: PipelinesLike })._pipelines
  if (!pipelines || typeof pipelines.getForRender !== 'function' || typeof pipelines.updateForRender !== 'function') {
    console.warn('[asyncPipelines] three의 파이프라인 자리가 달라졌다 — 동기로 굽는다')
    return
  }
  pipelines.updateForRender = function updateForRender(renderObject: unknown): void {
    if (state.on) { this.getForRender(renderObject, state.pending); return }
    // 늘 비동기로 굽는 재질 (`ALWAYS_ASYNC`) — 기다리는 이가 없으니 약속은 버린다. three가 다 될 때까지 그 물체만 안 그린다
    this.getForRender(renderObject, alwaysAsync(renderObject) ? [] : null)
  }
  state.installed = true
}

/** 덮개를 든 동안 켠다 */
export function beginAsyncPipelines(): void {
  if (!state.installed || !state.allowed) return
  state.holds++
  state.on = true
}

/** 전후를 재는 탐침만 쓴다 (`.audit/probe/warpStall.mjs`) */
export function setAsyncPipelinesAllowed(on: boolean): void {
  state.allowed = on
}

const nextFrame = (): Promise<void> => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'undefined') setTimeout(resolve, 16)
  else requestAnimationFrame(() => { resolve() })
})

/**
 * 새로 굽는 것도 **누가 굽고 있는 것도 이어서 두 프레임 없고** `landed()`가 참일 때까지 기다렸다가 끈다.
 *
 * ⚠️ **시한이 있다** (`capMs`). 굽기가 안 풀리면 검은 화면에 갇힌다 — 그보다 한 번 멎는 편이 낫다. 끄면 남은 것은 다음 프레임에
 * 동기로 굽는다
 */
export async function settleAsyncPipelines(landed: () => boolean, capMs = 12_000): Promise<{ waitedMs: number, compiled: number }> {
  const t0 = performance.now()
  let compiled = 0
  let quiet = 0
  while (performance.now() - t0 < capMs) {
    await nextFrame()
    if (state.pending.length > 0) {
      const batch = state.pending.splice(0)
      compiled += batch.length
      quiet = 0
      state.inflight += batch.length
      await Promise.allSettled(batch)
      state.inflight -= batch.length
      continue
    }
    if (state.inflight > 0) { quiet = 0; continue }
    if (landed()) quiet++
    if (quiet >= 2) break
  }
  if (state.holds > 0) state.holds--
  state.on = state.holds > 0
  if (!state.on) state.pending.length = 0
  return { waitedMs: Math.round(performance.now() - t0), compiled }
}

/** 밖에서 읽는다 — 켜져 있는가 · 굽는 중인 것 (탐침 · 시험) */
export function asyncPipelinesState(): { on: boolean, pending: number, inflight: number, installed: boolean } {
  return { on: state.on, pending: state.pending.length, inflight: state.inflight, installed: state.installed }
}
