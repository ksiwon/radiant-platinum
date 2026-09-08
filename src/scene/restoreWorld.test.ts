// 복원 요청의 **소유권** (야간 실행서 N1의 필수 검증)
//
// ⚠️ **재는 것은 「복원이 맞는가」가 아니다.** 그건 저장 스키마와 `journey`의
// ⑭가 잰다. 여기서 재는 것은 **누가 세계를 건드릴 자격이 있는가**다 — 늦게 온
// 응답, 정리 뒤에 도착한 약속, 다시 마운트, 실패 뒤의 재시도.
//
// 실측이 이 시험을 부른 자리: 예전 코드는 `.catch(...).finally(reveal)`이라
// **격자를 못 받아도 기본 스폰을 공개**했고, 정리가 `worldState.restoring`을
// 전역으로 껐다 — 앞 요청의 늦은 응답이 뒤 요청의 잠금을 푸는 자리였다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapGrid } from '../engine/map/grid'
import { startRestore, type RestoreTarget } from './restoreWorld'
import { useRestoreStore } from '../state/restoreStore'
import { worldState } from '../state/worldState'

/** 격자는 이 시험에서 **표식**일 뿐이다 — 어느 것이 들어섰는지만 가른다 */
const GRID_A = { tag: 'A' } as unknown as MapGrid
const GRID_B = { tag: 'B' } as unknown as MapGrid
const OVERWORLD = { tag: 'overworld' } as unknown as MapGrid

const INDOORS: RestoreTarget = { map: 342, matrix: 128, x: 114.5, z: 852.5, y: 1 }
const OUTDOORS: RestoreTarget = { map: 411, matrix: 0, x: 112.5, z: 880.5, y: 0 }

/** 손으로 풀 수 있는 약속. 늦은 응답을 그대로 재현한다 */
function deferred<T>() {
  let ok!: (v: T) => void
  let no!: (e: unknown) => void
  const promise = new Promise<T>((a, b) => { ok = a; no = b })
  return { promise, ok, no }
}

beforeEach(() => {
  useRestoreStore.setState({ phase: 'idle', generation: 0, reason: null })
  worldState.restoring = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('한 복원은 목적지에 한 번만 들어선다', () => {
  it('오버월드는 기다리지 않고 그 자리에서 끝난다', () => {
    const settle = vi.fn()
    const load = vi.fn()
    startRestore(OUTDOORS, { overworld: OVERWORLD, load, settle })
    expect(settle).toHaveBeenCalledExactlyOnceWith(OVERWORLD)
    // 손에 있는 것으로 끝났으므로 아무것도 안 받는다
    expect(load).not.toHaveBeenCalled()
    expect(useRestoreStore.getState().phase).toBe('ready')
    expect(worldState.restoring).toBe(false)
  })

  it('실내는 격자가 올 때까지 발이 묶이고, 온 뒤에 한 번만 들어선다', async () => {
    const settle = vi.fn()
    const grid = deferred<MapGrid>()
    startRestore(INDOORS, { overworld: OVERWORLD, load: () => grid.promise, settle })

    // 기다리는 동안 **기본 스폰에도 안 들어선다** — 그것이 옛 결함이었다
    expect(settle).not.toHaveBeenCalled()
    expect(useRestoreStore.getState().phase).toBe('loading')
    expect(worldState.restoring).toBe(true)

    grid.ok(GRID_A)
    await grid.promise
    expect(settle).toHaveBeenCalledExactlyOnceWith(GRID_A)
    expect(useRestoreStore.getState().phase).toBe('ready')
    expect(worldState.restoring).toBe(false)
  })
})

describe('격자를 못 받으면 실패로 선다', () => {
  it('기본 스폰을 공개하지 않고 잠금을 유지한다', async () => {
    const settle = vi.fn()
    const grid = deferred<MapGrid>()
    startRestore(INDOORS, { overworld: OVERWORLD, load: () => grid.promise, settle })
    grid.no(new Error('행렬 128이 실내 색인에 없다'))
    await grid.promise.catch(() => {})
    await Promise.resolve()

    expect(settle).not.toHaveBeenCalled()
    const at = useRestoreStore.getState()
    expect(at.phase).toBe('failed')
    expect(at.reason).toBe('행렬 128이 실내 색인에 없다')
    // ⚠️ **여기서 발이 풀리면 안 된다.** 풀리면 사람이 「저장한 곳이 아닌
    // 자리」에서 걷고, 거기서 저장하면 리포트가 덮인다
    expect(worldState.restoring).toBe(true)
  })

  it('다시 해 보면 새 요청이 열리고 성공하면 그때 풀린다', async () => {
    const settle = vi.fn()
    const first = deferred<MapGrid>()
    const cancel = startRestore(INDOORS, {
      overworld: OVERWORLD, load: () => first.promise, settle,
    })
    first.no(new Error('한 번 실패'))
    await first.promise.catch(() => {})
    await Promise.resolve()
    expect(useRestoreStore.getState().phase).toBe('failed')

    // 「다시 해 보기」는 effect를 다시 돌린다 — 정리가 먼저다
    cancel()
    const second = deferred<MapGrid>()
    startRestore(INDOORS, { overworld: OVERWORLD, load: () => second.promise, settle })
    expect(useRestoreStore.getState().phase).toBe('loading')
    second.ok(GRID_B)
    await second.promise
    expect(settle).toHaveBeenCalledExactlyOnceWith(GRID_B)
    expect(useRestoreStore.getState().phase).toBe('ready')
    expect(worldState.restoring).toBe(false)
  })
})

describe('성공 말고 다른 길로 끝나도 실패로 선다', () => {
  // ⚠️ **한 갈래만 막으면 나머지가 조용히 샌다.** 예전 코드가 실패로 받는 것은
  // `load`가 **거절한** 경우 하나뿐이었다 — 동기로 던진 것, 들어서다 터진 것은
  // 아무도 안 받아서 화면이 「세우는 중」에 영영 머물렀다 (후속 지시 §4)

  it('`load`가 동기로 던지면 밖으로 새지 않고 실패로 선다', () => {
    const settle = vi.fn()
    const load = vi.fn(() => { throw new Error('행렬 색인을 못 읽었다') })
    // ⚠️ **던지는지부터 본다** — 새어 나가면 부르는 effect가 통째로 죽는다
    expect(() => {
      startRestore(INDOORS, { overworld: OVERWORLD, load, settle })
    }).not.toThrow()

    expect(settle).not.toHaveBeenCalled()
    const at = useRestoreStore.getState()
    expect(at.phase).toBe('failed')
    expect(at.reason).toBe('행렬 색인을 못 읽었다')
    expect(worldState.restoring).toBe(true)
  })

  it('오버월드에서 들어서다 터지면 `ready`를 안 쓰고 실패로 선다', () => {
    const settle = vi.fn(() => { throw new Error('격자에 그 칸이 없다') })
    expect(() => {
      startRestore(OUTDOORS, { overworld: OVERWORLD, load: vi.fn(), settle })
    }).not.toThrow()

    expect(settle).toHaveBeenCalledOnce()
    const at = useRestoreStore.getState()
    expect(at.phase).toBe('failed')
    expect(at.reason).toBe('격자에 그 칸이 없다')
    // 절반쯤 들어선 세계다 — 발을 풀면 사람이 그 위를 걷는다
    expect(worldState.restoring).toBe(true)
  })

  it('격자를 받은 뒤 들어서다 터져도 실패로 선다 (아무도 안 받는 거절이 없다)', async () => {
    const settle = vi.fn(() => { throw new Error('사람을 세우다 터졌다') })
    const grid = deferred<MapGrid>()
    startRestore(INDOORS, { overworld: OVERWORLD, load: () => grid.promise, settle })
    grid.ok(GRID_A)
    // ⚠️ **`then`의 성공 갈래에서 던지면 그 약속이 거절로 바뀐다.** 받는 데가
    // 없으면 unhandled rejection이다 — 여기서 그 약속을 그대로 기다려 확인한다
    await expect(grid.promise).resolves.toBe(GRID_A)
    await Promise.resolve()

    expect(settle).toHaveBeenCalledExactlyOnceWith(GRID_A)
    const at = useRestoreStore.getState()
    expect(at.phase).toBe('failed')
    expect(at.reason).toBe('사람을 세우다 터졌다')
    expect(worldState.restoring).toBe(true)
  })

  it('실패한 뒤 다시 해 보면 같은 자리로 한 번 더 들어선다', async () => {
    // 절반쯤 들어선 위에서 다시 들어서는 자리. `enter`가 맵 세우기 전체를
    // 다시 하므로 덮어쓰기가 되고, 세대는 새것이라 앞의 실패가 안 남는다
    let blow = true
    const settle = vi.fn(() => { if (blow) throw new Error('첫 판에 터졌다') })
    const first = deferred<MapGrid>()
    const cancel = startRestore(INDOORS, {
      overworld: OVERWORLD, load: () => first.promise, settle,
    })
    first.ok(GRID_A)
    await first.promise
    await Promise.resolve()
    expect(useRestoreStore.getState().phase).toBe('failed')

    cancel()
    blow = false
    const second = deferred<MapGrid>()
    startRestore(INDOORS, { overworld: OVERWORLD, load: () => second.promise, settle })
    second.ok(GRID_B)
    await second.promise
    await Promise.resolve()

    expect(settle).toHaveBeenCalledTimes(2)
    expect(settle).toHaveBeenLastCalledWith(GRID_B)
    const at = useRestoreStore.getState()
    expect(at.phase).toBe('ready')
    expect(at.reason).toBeNull()
    expect(worldState.restoring).toBe(false)
  })

  it('버린 세대에서 들어서다 터져도 지금 요청을 실패로 만들지 않는다', async () => {
    const settle = vi.fn(() => { throw new Error('버린 세대가 터졌다') })
    const good = vi.fn()
    const a = deferred<MapGrid>()
    const cancelA = startRestore(INDOORS, { overworld: OVERWORLD, load: () => a.promise, settle })
    cancelA()
    const b = deferred<MapGrid>()
    startRestore(INDOORS, { overworld: OVERWORLD, load: () => b.promise, settle: good })

    a.ok(GRID_A)
    await a.promise
    await Promise.resolve()
    // 남의 차례라 들어서지도 않았으니 터질 일도 없다
    expect(settle).not.toHaveBeenCalled()
    expect(useRestoreStore.getState().phase).toBe('loading')
    expect(useRestoreStore.getState().reason).toBeNull()

    b.ok(GRID_B)
    await b.promise
    expect(good).toHaveBeenCalledExactlyOnceWith(GRID_B)
    expect(useRestoreStore.getState().phase).toBe('ready')
  })
})

describe('앞 요청이 뒤 요청을 건드리지 못한다', () => {
  it('정리 → 새 요청 → 앞의 늦은 성공: 들어서지도 풀리지도 않는다', async () => {
    const settle = vi.fn()
    const a = deferred<MapGrid>()
    const cancelA = startRestore(INDOORS, { overworld: OVERWORLD, load: () => a.promise, settle })
    cancelA()

    const b = deferred<MapGrid>()
    startRestore(INDOORS, { overworld: OVERWORLD, load: () => b.promise, settle })
    const genB = useRestoreStore.getState().generation

    a.ok(GRID_A)
    await a.promise
    // A는 이미 남의 차례다 — 세계도 안 건드리고 잠금도 안 푼다
    expect(settle).not.toHaveBeenCalled()
    expect(useRestoreStore.getState().phase).toBe('loading')
    expect(useRestoreStore.getState().generation).toBe(genB)
    expect(worldState.restoring).toBe(true)

    b.ok(GRID_B)
    await b.promise
    expect(settle).toHaveBeenCalledExactlyOnceWith(GRID_B)
  })

  it('앞의 늦은 실패가 뒤 요청을 실패로 만들지 않는다', async () => {
    const settle = vi.fn()
    const a = deferred<MapGrid>()
    const cancelA = startRestore(INDOORS, { overworld: OVERWORLD, load: () => a.promise, settle })
    cancelA()
    const b = deferred<MapGrid>()
    startRestore(INDOORS, { overworld: OVERWORLD, load: () => b.promise, settle })

    a.no(new Error('버린 세대의 실패'))
    await a.promise.catch(() => {})
    await Promise.resolve()
    expect(useRestoreStore.getState().phase).toBe('loading')
    expect(useRestoreStore.getState().reason).toBeNull()
  })

  it('앞 요청의 정리를 **뒤 요청이 열린 뒤에** 불러도 뒤가 안 풀린다', async () => {
    // StrictMode가 이 순서를 만든다 — setup·cleanup·setup이 잇달아 돈다
    const settle = vi.fn()
    const a = deferred<MapGrid>()
    const cancelA = startRestore(INDOORS, { overworld: OVERWORLD, load: () => a.promise, settle })
    const b = deferred<MapGrid>()
    startRestore(INDOORS, { overworld: OVERWORLD, load: () => b.promise, settle })
    const genB = useRestoreStore.getState().generation

    cancelA() // 늦게 도착한 앞 세대의 정리
    expect(useRestoreStore.getState().generation).toBe(genB)
    expect(useRestoreStore.getState().phase).toBe('loading')
    expect(worldState.restoring).toBe(true)

    b.ok(GRID_B)
    await b.promise
    expect(settle).toHaveBeenCalledExactlyOnceWith(GRID_B)
  })

  it('마운트를 떠난 뒤 도착한 응답은 아무 데도 안 쓴다', async () => {
    const settle = vi.fn()
    const a = deferred<MapGrid>()
    const cancel = startRestore(INDOORS, { overworld: OVERWORLD, load: () => a.promise, settle })
    cancel()
    expect(useRestoreStore.getState().phase).toBe('idle')
    expect(worldState.restoring).toBe(false)

    a.ok(GRID_A)
    await a.promise
    expect(settle).not.toHaveBeenCalled()
    expect(useRestoreStore.getState().phase).toBe('idle')
  })
})
