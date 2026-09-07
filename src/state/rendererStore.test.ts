// 렌더러가 죽었을 때 (PLATINUM_3D_COMPLETION_PLAN §6.2 · PT-02)
//
// ⚠️ **재는 것은 「복구되는가」가 아니라 「죽었을 때 게임이 사람 손에 남는가」다.**
// 실제로 GPU 장치를 죽이는 것은 이 시험이 못 하고(그건 실기 장애 주입이라
// `tools/e2e/gpuLoss.mjs`가 한다), 신호를 받은 뒤에 무엇을 해야 하는지는
// 기계와 무관하다.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { gameLoop } from '../engine/loop/GameLoop'
import { clearLoopHolds, holdLoop, loopHolds, releaseLoop } from '../engine/loop/pause'
import { isGameActive, setGameActive } from '../engine/input/keys'
import { MAX_AUTO_RECOVERY, rendererUsable, useRendererStore } from './rendererStore'

const at = () => useRendererStore.getState()
const gen = () => at().generation

/** 한 판을 정상으로 세운다 — 렌더러가 서고 첫 프레임까지 나갔다 */
function goLive(backend = 'WebGPUBackend'): void {
  at().markReady(backend, gen())
  at().markPresented(gen())
}

beforeEach(() => {
  useRendererStore.setState({
    phase: 'initializing',
    backend: null,
    api: null,
    fault: null,
    reason: null,
    autoRetries: 0,
    generation: 0,
  })
  clearLoopHolds()
  setGameActive(true)
})

describe('렌더러가 선 것과 게임이 사람 손에 있는 것은 다르다', () => {
  it('init이 끝난 것만으로는 아직 play-ready가 아니다', () => {
    at().markReady('WebGPUBackend', gen())
    expect(at().phase).toBe('ready')
    // ⚠️ **여기서 조작을 돌려주면 아직 안 그려진 세계를 걷는다** (기획서 §6.2)
    expect(rendererUsable()).toBe(false)
    expect(gameLoop.paused).toBe(true)
  })

  it('한 프레임이 실제로 나가야 live다', () => {
    goLive()
    expect(at().phase).toBe('live')
    expect(at().backend).toBe('WebGPUBackend')
    expect(rendererUsable()).toBe(true)
    expect(gameLoop.paused).toBe(false)
  })

  it('프레임이 여러 번 와도 live에서 더 움직이지 않는다', () => {
    goLive()
    at().markPresented(gen())
    at().markPresented(gen())
    expect(at().phase).toBe('live')
  })

  it('init이 터지면 failed고 까닭이 남는다 — 흰 화면이 아니다', () => {
    at().markInitFailed('requestAdapter returned null', gen())
    expect(at().phase).toBe('failed')
    expect(at().fault).toBe('init')
    expect(at().reason).toContain('requestAdapter')
    expect(rendererUsable()).toBe(false)
  })
})

describe('세계를 멈춘다', () => {
  it('장치를 잃으면 루프도 조작도 멎는다', () => {
    goLive()
    expect(gameLoop.paused).toBe(false)
    at().markLost({ api: 'WebGPU', message: 'device destroyed' }, gen())
    expect(at().phase).toBe('lost')
    expect(gameLoop.paused).toBe(true)
    // ⚠️ **루프만 세우면 안 된다.** 눌린 키가 남으면 복구가 끝나는 순간
    // 그동안 누르고 있던 방향이 한꺼번에 먹는다
    expect(isGameActive()).toBe(false)
  })

  it('init 실패도 마찬가지다 — 조작만 살아 있으면 안 된다', () => {
    at().markInitFailed('no adapter', gen())
    expect(gameLoop.paused).toBe(true)
    expect(isGameActive()).toBe(false)
  })

  it('복구 중에도 멎어 있다', () => {
    goLive('WebGLBackend')
    at().markLost({ api: 'WebGL', message: 'context lost' }, gen())
    at().retry(true)
    expect(at().phase).toBe('recovering')
    expect(gameLoop.paused).toBe(true)
    expect(isGameActive()).toBe(false)
    expect(rendererUsable()).toBe(false)
  })

  it('멎은 동안에는 고정 스텝 시스템이 한 번도 안 돈다', () => {
    // ⚠️ **여기가 「복구 중에 배틀·스크립트·워프가 겹쳐 진행되는가」의 뿌리다**
    // (기획서 §6.2). 그 시스템들은 전부 이 루프의 `fixedUpdate`에 실려 있으므로,
    // 루프가 안 돌면 턴도 좌표 트리거도 워프도 한 칸을 못 나간다
    let ticks = 0
    gameLoop.register({ fixedUpdate: () => { ticks += 1 } })
    goLive()
    gameLoop.tick(1 / 60)
    expect(ticks).toBeGreaterThan(0)

    at().markLost({ message: 'x' }, gen())
    const frozenAt = ticks
    for (let i = 0; i < 60; i++) gameLoop.tick(1 / 60)
    at().retry(true)
    for (let i = 0; i < 60; i++) gameLoop.tick(1 / 60)
    // 새 렌더러가 섰지만 아직 첫 프레임 전이다 — 여기서도 안 돈다
    at().markReady('WebGPUBackend', gen())
    for (let i = 0; i < 60; i++) gameLoop.tick(1 / 60)
    expect(ticks).toBe(frozenAt)

    at().markPresented(gen())
    gameLoop.tick(1 / 60)
    expect(ticks).toBeGreaterThan(frozenAt)
  })
})

describe('정지 사유가 여러 개일 때', () => {
  it('탭에서 돌아와도 복구 정지가 안 풀린다', () => {
    // ⚠️ **이것이 기획서 §3.4가 짚은 자리다.** `EngineDriver`가
    // `gameLoop.paused = document.hidden`으로 **대입**하고 있어서, 복구 중에
    // 탭을 나갔다 돌아오기만 하면 그 `false`가 장치 손실의 정지를 덮었다
    goLive()
    at().markLost({ message: 'x' }, gen())
    at().retry(true)
    holdLoop('hidden')
    expect(gameLoop.paused).toBe(true)
    releaseLoop('hidden') // 탭으로 돌아왔다
    expect(gameLoop.paused).toBe(true)
    expect(loopHolds()).toContain('renderer')
  })

  it('탭이 묻힌 채로 복구가 끝나도 탭 정지는 남는다', () => {
    goLive()
    holdLoop('hidden')
    at().markLost({ message: 'x' }, gen())
    at().retry(true)
    at().markReady('WebGPUBackend', gen())
    at().markPresented(gen())
    expect(at().phase).toBe('live')
    // 렌더러 쪽은 풀렸지만 탭은 아직 묻혀 있다
    expect(loopHolds()).toEqual(['hidden'])
    expect(gameLoop.paused).toBe(true)
    releaseLoop('hidden')
    expect(gameLoop.paused).toBe(false)
  })
})

describe('지난 세대가 뒤늦게 말을 걸 때', () => {
  it('버린 렌더러의 init 완료가 새 세대를 ready로 못 만든다', () => {
    goLive()
    const old = gen()
    at().markLost({ message: 'x' }, old)
    at().retry(true)
    expect(at().phase).toBe('recovering')
    at().markReady('WebGLBackend', old) // 죽은 쪽이 뒤늦게 풀렸다
    expect(at().phase).toBe('recovering')
    expect(at().backend).toBeNull()
  })

  it('버린 렌더러의 손실 신호가 새 세대를 lost로 못 만든다', () => {
    goLive()
    const old = gen()
    at().markLost({ message: '첫 번째' }, old)
    at().retry(true)
    at().markReady('WebGPUBackend', gen())
    at().markPresented(gen())
    expect(at().phase).toBe('live')
    // 죽은 쪽의 `onDeviceLost`가 한 박자 늦게 울었다
    at().markLost({ message: '늦은 메아리' }, old)
    expect(at().phase).toBe('live')
    expect(at().reason).toBeNull()
  })

  it('버린 렌더러의 init 실패가 새 세대를 못 죽인다', () => {
    goLive()
    const old = gen()
    at().markLost({ message: 'x' }, old)
    at().retry(true)
    at().markInitFailed('버린 쪽이 뒤늦게 터졌다', old)
    expect(at().phase).toBe('recovering')
  })

  it('지금 세대의 프레임만 live로 친다', () => {
    at().markReady('WebGPUBackend', gen())
    at().markPresented(gen() + 1)
    expect(at().phase).toBe('ready')
  })
})

describe('손실 신호', () => {
  it('두 백엔드를 한 자리에서 받는다', () => {
    goLive('WebGLBackend')
    at().markLost({ api: 'WebGL', message: 'ctx' }, gen())
    expect(at().api).toBe('WebGL')

    useRendererStore.setState({ phase: 'live', api: null })
    at().markLost({ api: 'WebGPU', message: 'dev' }, gen())
    expect(at().api).toBe('WebGPU')
  })

  it('겹쳐 와도 처음 것만 적는다', () => {
    goLive()
    at().markLost({ api: 'WebGPU', message: '첫 까닭' }, gen())
    at().markLost({ api: 'WebGL', message: '나중 까닭' }, gen())
    expect(at().reason).toBe('첫 까닭')
    expect(at().api).toBe('WebGPU')
  })

  it('복구 중에 다시 와도 복구를 안 뒤집는다', () => {
    goLive()
    at().markLost({ message: 'x' }, gen())
    at().retry(true)
    at().markLost({ message: 'y' }, gen())
    expect(at().phase).toBe('recovering')
  })

  it('이미 포기한 뒤에 와도 실패를 안 뒤집는다', () => {
    goLive()
    at().markLost({ message: 'x' }, gen())
    at().giveUp()
    at().markLost({ message: 'y' }, gen())
    expect(at().phase).toBe('failed')
  })
})

describe('씬이 터졌을 때', () => {
  it('장치가 멀쩡해도 세계를 멈추고 까닭을 남긴다', () => {
    goLive()
    at().markSceneCrashed('씬: chunk 87을 못 세웠다')
    expect(at().phase).toBe('failed')
    expect(at().fault).toBe('scene')
    expect(at().reason).toContain('chunk 87')
    expect(gameLoop.paused).toBe(true)
    expect(isGameActive()).toBe(false)
  })

  it('두 번 터져도 처음 까닭이 남는다 — 경계가 여럿이다', () => {
    goLive()
    at().markSceneCrashed('첫 까닭')
    at().markSceneCrashed('나중 까닭')
    expect(at().reason).toBe('첫 까닭')
  })

  it('다시 세우면 씬 오류도 걷힌다', () => {
    goLive()
    at().markSceneCrashed('터졌다')
    expect(at().retry()).toBe(true)
    expect(at().phase).toBe('recovering')
    at().markReady('WebGPUBackend', gen())
    at().markPresented(gen())
    expect(at().fault).toBeNull()
    expect(at().reason).toBeNull()
  })
})

describe('끝나지 않는 복구', () => {
  it('시간이 지나면 실패로 옮겨 고를 것을 준다', () => {
    goLive()
    at().markLost({ message: 'x' }, gen())
    at().retry(true)
    at().markRecoveryTimedOut()
    expect(at().phase).toBe('failed')
    expect(at().fault).toBe('timeout')
    expect(at().reason).toContain('초')
    expect(gameLoop.paused).toBe(true)
  })

  it('렌더러는 섰는데 첫 프레임이 안 나오는 판도 같은 길이다', () => {
    at().markReady('WebGPUBackend', gen())
    at().markRecoveryTimedOut()
    expect(at().phase).toBe('failed')
    expect(at().fault).toBe('timeout')
  })

  it('이미 live면 시간 초과가 아무 일도 안 한다', () => {
    goLive()
    at().markRecoveryTimedOut()
    expect(at().phase).toBe('live')
  })
})

describe('무한 재시도를 안 한다', () => {
  it('자동은 한 판에 한 번뿐이고, 넘으면 failed다', () => {
    goLive()
    at().markLost({ message: '한 번' }, gen())
    expect(at().retry(true)).toBe(true)
    expect(at().autoRetries).toBe(MAX_AUTO_RECOVERY)

    // 다시 서고 다시 죽었다
    at().markReady('WebGPUBackend', gen())
    at().markPresented(gen())
    at().markLost({ message: '두 번' }, gen())
    // ⚠️ **여기서 `true`가 나오면 「죽음 → 자동 복구 → 죽음」이 끝없이 돈다**
    expect(at().retry(true)).toBe(false)
    expect(at().phase).toBe('failed')
    expect(gameLoop.paused).toBe(true)
  })

  it('사람이 누르는 것은 상한에 안 걸린다 — 그때는 무엇이 벌어지는지 본다', () => {
    goLive()
    at().markLost({ message: 'x' }, gen())
    at().retry(true)
    goLive()
    at().markLost({ message: 'y' }, gen())
    at().retry(true)
    expect(at().phase).toBe('failed')
    // 손으로 누르면 선다
    expect(at().retry()).toBe(true)
    expect(at().phase).toBe('recovering')
    expect(at().autoRetries).toBe(MAX_AUTO_RECOVERY)
  })

  it('다시 서도 자동 횟수를 안 비운다', () => {
    goLive()
    at().markLost({ message: 'x' }, gen())
    at().retry(true)
    goLive()
    expect(at().autoRetries).toBe(MAX_AUTO_RECOVERY)
  })
})

describe('영속 Canvas의 예외', () => {
  it('정상 경로에서는 generation이 안 움직인다', () => {
    goLive()
    expect(at().generation).toBe(0)
    goLive()
    expect(at().generation).toBe(0)
  })

  it('다시 세울 때만 올라간다 — 그 값이 곧 `<Canvas key>`다', () => {
    goLive()
    at().markLost({ message: 'x' }, gen())
    at().retry(true)
    expect(at().generation).toBe(1)
    at().retry()
    expect(at().generation).toBe(2)
  })

  it('다시 서면 지난 실패 이유가 화면에 안 남는다', () => {
    goLive()
    at().markLost({ api: 'WebGPU', message: '까닭' }, gen())
    at().retry(true)
    goLive()
    expect(at().reason).toBeNull()
    expect(at().fault).toBeNull()
    expect(at().api).toBeNull()
    expect(gameLoop.paused).toBe(false)
  })
})

describe('사람이 그만둘 때', () => {
  it('giveUp은 failed로 두고 세계를 멎은 채 둔다', () => {
    goLive()
    at().markLost({ message: 'x' }, gen())
    at().giveUp()
    expect(at().phase).toBe('failed')
    expect(gameLoop.paused).toBe(true)
    expect(isGameActive()).toBe(false)
  })
})

describe('비정상 순간을 저장하지 않는다', () => {
  it('복구 경로가 리포트를 건드리지 않는다', () => {
    // ⚠️ **자동 저장으로 해결하지 않는다** (기획서 §6.2). 장치를 잃은 순간은
    // 배틀 중간일 수도 스크립트 한가운데일 수도 있고, 그것을 리포트로 굽는 것은
    // **원작에 없는 저장 시점**을 만드는 일이다 — 수동 저장의 뜻이 달라진다.
    // 상태가 아니라 **의존 관계**로 못 박는다: 이 모듈은 저장을 아예 모른다
    const src = readFileSync(new URL('./rendererStore.ts', import.meta.url), 'utf8')
    const imports = [...src.matchAll(/^import .* from '([^']+)'$/gm)].map((m) => m[1])
    expect(imports).not.toContain('./saveStore')
    expect(imports.some((one) => one.toLowerCase().includes('save'))).toBe(false)
  })
})
