// 무결성 결과를 한 자리에 싣는가 (`integrityFinding`)
//
// 재는 것 넷:
//
//   ① 아직 안 쟀으면 `null`이다 — 「깨끗하다」와 다르다
//   ② 설정의 「에셋 확인」(`verifyEverything`)이 찾은 손상도 타이틀이 보는 자리에 선다
//   ③ 다시 재서 깨끗하면 그 자리가 비고, 듣는 쪽이 그 소식을 받는다
//   ④ 먼저 시작한 검사가 늦게 끝나도 **나중에 시작한 결과를 안 덮는다**
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Broken } from '../import/install/integrity'

interface Result { ok: number, broken: Broken[] }

/** 한 번 부를 때마다 손으로 끝내는 가짜 검사 저장소 */
const fake = {
  calls: [] as ((got: Result) => void)[],
  groups: [] as string[],
  verifyAll(): Promise<Result> {
    return new Promise((resolve) => { fake.calls.push(resolve) })
  },
  corruptGroups(): string[] { return [...fake.groups] },
}

let live: typeof fake | null = fake
vi.mock('./boot', () => ({ installedStore: () => live }))

const broken = (path: string): Broken => ({ path, why: 'hash', detail: '해시가 다르다' })

/** 매번 새 모듈 — 결과 자리가 모듈 안에 산다 */
async function fresh() {
  vi.resetModules()
  return import('./integrityWatch')
}

beforeEach(() => {
  fake.calls = []
  fake.groups = []
  live = fake
})

describe('integrityFinding', () => {
  it('① 아직 안 쟀으면 null이다', async () => {
    const m = await fresh()
    expect(m.integrityFinding()).toBeNull()
  })

  it('② 설정에서 찾은 손상이 같은 자리에 선다', async () => {
    const m = await fresh()
    const heard = vi.fn()
    m.subscribeIntegrity(heard)

    fake.groups = ['rooms']
    const got = m.verifyEverything()
    fake.calls[0]!({ ok: 9, broken: [broken('a.bin')] })
    await got

    expect(heard).toHaveBeenCalledTimes(1)
    expect(m.integrityFinding()?.broken).toHaveLength(1)
    expect(m.integrityFinding()?.groups).toEqual(['rooms'])
  })

  it('③ 다시 재서 깨끗하면 비고, 끊은 뒤에는 소식이 안 온다', async () => {
    const m = await fresh()
    const heard = vi.fn()
    const stop = m.subscribeIntegrity(heard)

    fake.groups = ['rooms']
    const first = m.verifyEverything()
    fake.calls[0]!({ ok: 9, broken: [broken('a.bin')] })
    await first
    const before = m.integrityFinding()

    fake.groups = []
    const second = m.verifyEverything()
    fake.calls[1]!({ ok: 10, broken: [] })
    await second

    expect(heard).toHaveBeenCalledTimes(2)
    expect(m.integrityFinding()).not.toBe(before)
    expect(m.integrityFinding()?.broken).toEqual([])

    stop()
    const third = m.verifyEverything()
    fake.calls[2]!({ ok: 10, broken: [] })
    await third
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it('④ 먼저 시작한 검사가 늦게 끝나도 나중 결과를 안 덮는다', async () => {
    const m = await fresh()
    fake.groups = ['rooms']
    const older = m.verifyEverything()
    const newer = m.verifyEverything()

    // 고친 뒤에 시작한 쪽이 먼저 끝난다 — 깨끗하다
    fake.calls[1]!({ ok: 10, broken: [] })
    await newer
    // 고치기 전에 시작한 쪽이 늦게 끝난다 — 깨진 것을 들고 온다
    fake.calls[0]!({ ok: 9, broken: [broken('a.bin')] })
    await older

    expect(m.integrityFinding()?.broken).toEqual([])
  })

  it('개발판(설치 기록 없음)은 아무것도 안 싣는다', async () => {
    live = null
    const m = await fresh()
    expect(await m.verifyEverything()).toBeNull()
    expect(m.integrityFinding()).toBeNull()
  })
})
