// 쓰는 탭 (`state/writerLock` · 같은 저장소를 탭 둘이 동시에 쓰는 일)
//
// 재는 것: (a) 락을 못 잡은 탭은 쓰기를 거절하고 이유를 낸다 · (b) 잡은 탭은 평소처럼 쓴다 · (c) 락이 없는 환경은 평소처럼 쓴다 ·
// (d) 쥔 탭이 닫히면 기다리던 탭이 이어받는다 · 락 요청이 실패해도 막히지 않는다 · 읽기는 안 막는다.
// 탭은 「모듈을 새로 평가하고 `navigator.locks`를 같은 락 표의 창구로 바꾼 것」으로 흉낸다.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clear, createStore, get } from 'idb-keyval'

const DB = createStore('radiant-platinum', 'save')
const STATE_KEY = Symbol.for('rp.writerLock')

/** 브라우저 한 곳의 락 표 — 탭마다 창구(`manager`)를 따로 받지만 같은 표를 다툰다 */
class LockTable {
  private held = false
  private waiters: Array<() => void> = []
  /** 쥔 탭이 닫혔다 — 브라우저가 락을 푼다 */
  release(): void {
    this.held = false
    this.waiters.shift()?.()
  }
  manager(): { request: (name: string, a: unknown, b?: unknown) => Promise<unknown> } {
    return {
      request: (_name, a, b) => {
        const opts = (typeof a === 'function' ? {} : a) as { ifAvailable?: boolean }
        const cb = (typeof a === 'function' ? a : b) as (lock: object | null) => unknown
        const run = (): Promise<unknown> => { this.held = true; return Promise.resolve(cb({})) }
        if (!this.held) return run()
        if (opts.ifAvailable === true) return Promise.resolve(cb(null))
        return new Promise((resolve) => { this.waiters.push(() => { resolve(run()) }) })
      },
    }
  }
}

async function openTab(locks: unknown) {
  // 탭 하나 = 새 문서. 새 문서에는 이전 문서의 모듈 상태가 없다
  delete (globalThis as Record<symbol, unknown>)[STATE_KEY]
  vi.stubGlobal('navigator', locks === undefined ? {} : { locks })
  vi.resetModules()
  const lock = await import('./writerLock')
  const report = await import('./report')
  const store = await import('./saveStore')
  return { lock, report, store }
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

beforeEach(async () => { await clear(DB) })
afterEach(() => { vi.unstubAllGlobals() })

function saveOf(tab: Awaited<ReturnType<typeof openTab>>, name: string) {
  const save = tab.store.createNewSave()
  save.trainer.name = name
  return save
}

describe('쓰는 탭', () => {
  it('(c) 락이 없는 환경은 막지 않고 평소처럼 쓴다', async () => {
    const tab = await openTab(undefined)
    tab.lock.startWriterLock()
    await settle()
    expect(tab.lock.canWrite()).toBe(true)
    expect((await tab.report.writeReportVerified(saveOf(tab, '혼자'))).ok).toBe(true)
  })

  it('시작 전·판정 전에는 쓴다 (기본값은 「락 없음」)', async () => {
    const tab = await openTab(new LockTable().manager())
    expect(tab.lock.canWrite()).toBe(true)
  })

  it('(b) 락을 잡은 탭은 평소처럼 쓴다', async () => {
    const tab = await openTab(new LockTable().manager())
    tab.lock.startWriterLock()
    await settle()
    expect(tab.lock.isReadOnlyTab()).toBe(false)
    expect((await tab.report.writeReportVerified(saveOf(tab, '먼저'))).ok).toBe(true)
    expect((await tab.report.writeAutosaveVerified(saveOf(tab, '먼저자동'))).ok).toBe(true)
    expect((await tab.store.useSaveStore.getState().resetSave({ backup: false }))).toBe(true)
  })

  it('(a) 락을 못 잡은 탭은 쓰기를 거절하고 이유를 낸다 — 저장소는 한 바이트도 안 바뀐다', async () => {
    const table = new LockTable()
    const first = await openTab(table.manager())
    first.lock.startWriterLock()
    await settle()
    await first.report.writeReportVerified(saveOf(first, '먼저'))

    const second = await openTab(table.manager())
    second.lock.startWriterLock()
    await settle()
    expect(second.lock.isReadOnlyTab()).toBe(true)

    const why = second.lock.NOT_WRITER_WHY
    expect(await second.report.writeReportVerified(saveOf(second, '나중'))).toEqual({ ok: false, why })
    expect(await second.report.writeAutosaveVerified(saveOf(second, '나중자동'))).toEqual({ ok: false, why })
    const st = second.store.useSaveStore.getState()
    expect(await st.report({ map: 415, matrix: 129, x: 1, z: 1, facing: 0, y: null, avatar: 0 }))
      .toMatchObject({ saved: false, why })
    expect(await st.autosave({ map: 415, matrix: 129, x: 1, z: 1, facing: 0, y: null, avatar: 0 }))
      .toEqual({ saved: false, why })
    // 쓰기 계열: 지우기·가져오기 덮기·되찾기도 막는다
    expect(await st.resetSave()).toBe(false)
    expect(await st.restoreBackup(saveOf(second, '되찾기'))).toEqual({ ok: false, why })
    await expect(second.report.clearReport()).rejects.toThrow(why)
    await expect(second.report.backupReport()).rejects.toThrow(why)

    const kept = await get<{ trainer: { name: string } }>('report', DB)
    expect(kept?.trainer.name).toBe('먼저')
    expect(await get('report.auto', DB)).toBeUndefined()
    expect(await get('report.tmp', DB)).toBeUndefined()
  })

  it('읽기는 막지 않는다 — 읽기 전용 탭도 이어하기·시각 읽기가 된다', async () => {
    const table = new LockTable()
    const first = await openTab(table.manager())
    first.lock.startWriterLock()
    await settle()
    await first.report.writeReportVerified(saveOf(first, '먼저'))

    const second = await openTab(table.manager())
    second.lock.startWriterLock()
    await settle()
    expect(second.lock.isReadOnlyTab()).toBe(true)
    expect(await second.store.useSaveStore.getState().loadReport()).toBe(true)
    expect(second.store.useSaveStore.getState().trainer.name).toBe('먼저')
    expect((await second.report.readSaveTimes()).report).not.toBeNull()
  })

  it('(d) 쥔 탭이 닫히면 기다리던 탭이 이어받아 쓴다', async () => {
    const table = new LockTable()
    const first = await openTab(table.manager())
    first.lock.startWriterLock()
    await settle()

    const second = await openTab(table.manager())
    second.lock.startWriterLock()
    await settle()
    const seen: boolean[] = []
    second.lock.subscribeWriter(() => { seen.push(second.lock.isReadOnlyTab()) })
    expect((await second.report.writeReportVerified(saveOf(second, '나중'))).ok).toBe(false)

    table.release() // 첫 탭이 닫혔다
    await settle()
    expect(second.lock.isReadOnlyTab()).toBe(false)
    expect(seen).toEqual([false])
    expect((await second.report.writeReportVerified(saveOf(second, '나중'))).ok).toBe(true)
    expect((await get<{ trainer: { name: string } }>('report', DB))?.trainer.name).toBe('나중')
  })

  it('락 요청이 예외를 던져도 막지 않는다 — 쓰는 탭으로 본다', async () => {
    const tab = await openTab({ request: () => { throw new Error('SecurityError') } })
    tab.lock.startWriterLock()
    await settle()
    expect(tab.lock.canWrite()).toBe(true)
    expect((await tab.report.writeReportVerified(saveOf(tab, '혼자'))).ok).toBe(true)
  })

  it('락 요청이 거절돼도 막지 않는다', async () => {
    const tab = await openTab({ request: () => Promise.reject(new Error('NotAllowed')) })
    tab.lock.startWriterLock()
    await settle()
    expect(tab.lock.canWrite()).toBe(true)
    expect((await tab.report.writeReportVerified(saveOf(tab, '혼자'))).ok).toBe(true)
  })

  it('같은 문서에서 모듈이 다시 평가돼도 락을 또 잡으려 하지 않는다 (HMR)', async () => {
    const table = new LockTable()
    const tab = await openTab(table.manager())
    tab.lock.startWriterLock()
    await settle()
    expect(tab.lock.canWrite()).toBe(true)
    // 문서는 그대로(전역 상태를 안 지운다) 모듈만 다시 평가
    vi.resetModules()
    const again = await import('./writerLock')
    again.startWriterLock()
    await settle()
    expect(again.isReadOnlyTab()).toBe(false)
  })
})
