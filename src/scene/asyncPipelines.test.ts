import { describe, expect, it } from 'vitest'
import type { WebGPURenderer } from 'three/webgpu'
import { asyncPipelinesState, beginAsyncPipelines, installAsyncPipelines, settleAsyncPipelines } from './asyncPipelines'

/** three의 `Pipelines`가 받는 꼴만 흉내 낸다 — 배열을 받으면 비동기로 굽는다 */
function fakeRenderer() {
  const calls: (Promise<unknown>[] | null | undefined)[] = []
  const pipelines = {
    getForRender(_ro: unknown, promises?: Promise<unknown>[] | null) {
      calls.push(promises)
      if (promises) promises.push(Promise.resolve())
    },
    updateForRender(_ro: unknown) { throw new Error('감싸지 않았다') },
  }
  return { renderer: { _pipelines: pipelines } as unknown as WebGPURenderer, pipelines, calls }
}

describe('맵을 갈아 끼우는 동안만 파이프라인을 비동기로 굽는다 (REPAIR §8.3)', () => {
  it('덮개를 들기 전에는 동기로 · 든 동안은 비동기로 · 가라앉으면 다시 동기로', async () => {
    const { renderer, pipelines, calls } = fakeRenderer()
    installAsyncPipelines(renderer)
    pipelines.updateForRender({})
    expect(calls.at(-1)).toBeNull()

    beginAsyncPipelines()
    pipelines.updateForRender({})
    expect(Array.isArray(calls.at(-1))).toBe(true)
    expect(asyncPipelinesState()).toMatchObject({ on: true, pending: 1 })

    const done = await settleAsyncPipelines(() => true, 2_000)
    expect(done.compiled).toBe(1)
    expect(asyncPipelinesState()).toMatchObject({ on: false, pending: 0 })
    pipelines.updateForRender({})
    expect(calls.at(-1)).toBeNull()
  })

  it('지형이 안 서면 시한까지 쥐고 있다가 끈다 — 검은 화면에 갇히지 않는다', async () => {
    const { renderer } = fakeRenderer()
    installAsyncPipelines(renderer)
    beginAsyncPipelines()
    const done = await settleAsyncPipelines(() => false, 120)
    expect(done.waitedMs).toBeGreaterThanOrEqual(100)
    expect(asyncPipelinesState().on).toBe(false)
  })
})
