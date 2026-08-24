// `?dev=1` 손잡이 (`app/devTools`)
//
// ⚠️ **`devToolsOn()`은 한 번 읽고 굳힌다.** 그래서 시험마다 모듈을 새로
// 받아야 한다 — 안 그러면 첫 시험이 정한 값을 나머지가 그대로 본다.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const KEY = 'rp.devTools'

/**
 * 이 시험은 노드에서 돈다 — 브라우저 저장소가 없다. 손으로 하나 놓는다.
 *
 * ⚠️ **없는 채로 두면 안 된다.** `devTools`는 저장소가 막힌 브라우저를 위해
 * `catch`에서 「그 판만 켠다」로 물러나는데, 저장소를 안 놓으면 **늘 그 갈래로만**
 * 도는 시험이 된다 — 기억하는 쪽은 한 번도 안 재게 된다
 */
const box = new Map<string, string>()
const storage = {
  getItem: (k: string) => box.get(k) ?? null,
  setItem: (k: string, v: string) => { box.set(k, v) },
  removeItem: (k: string) => { box.delete(k) },
  clear: () => { box.clear() },
  key: (i: number) => [...box.keys()][i] ?? null,
  get length() { return box.size },
} as Storage

/** 주소를 갈아 끼우고 모듈을 새로 받는다 */
async function load(search: string): Promise<() => boolean> {
  vi.resetModules()
  vi.stubGlobal('location', { search } as Location)
  vi.stubGlobal('localStorage', storage)
  const m = await import('./devTools')
  // ⚠️ vitest 안에서는 `import.meta.env.DEV`가 참이다. 배포본 쪽을 재려면
  // 거짓을 넣어야 한다 — 안 넣으면 여섯 시험이 전부 「개발 서버」만 잰다
  return () => m.devToolsOn(false)
}

describe('devTools', () => {
  beforeEach(() => {
    box.clear()
    vi.unstubAllGlobals()
  })

  it('그냥 열면 꺼져 있다', async () => {
    expect((await load(''))()).toBe(false)
  })

  it('`?dev=1`이면 켜진다', async () => {
    expect((await load('?dev=1'))()).toBe(true)
  })

  it('한 번 켜면 주소에서 빼도 켜져 있다', async () => {
    ;(await load('?dev=1'))()
    expect(storage.getItem(KEY)).toBe('1')
    expect((await load(''))()).toBe(true)
  })

  it('`?dev=0`이면 꺼지고 기억도 지운다', async () => {
    ;(await load('?dev=1'))()
    expect((await load('?dev=0'))()).toBe(false)
    expect(storage.getItem(KEY)).toBe(null)
    expect((await load(''))()).toBe(false)
  })

  it('다른 값은 손잡이가 아니다', async () => {
    expect((await load('?dev=yes'))()).toBe(false)
    expect((await load('?dev'))()).toBe(false)
    expect((await load('?assets=opfs'))()).toBe(false)
  })

  it('개발 서버에서는 주소와 상관없이 켜져 있다', async () => {
    vi.resetModules()
    vi.stubGlobal('location', { search: '' } as Location)
    vi.stubGlobal('localStorage', storage)
    const m = await import('./devTools')
    expect(m.devToolsOn(true)).toBe(true)
  })

  it('한 판 안에서는 값이 안 흔들린다 — 저장소를 지워도 그대로다', async () => {
    const on = await load('?dev=1')
    expect(on()).toBe(true)
    box.clear()
    expect(on()).toBe(true)
  })
})
