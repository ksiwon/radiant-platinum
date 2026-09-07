// 정지 사유를 한곳에서 합친다 (PLATINUM_3D_COMPLETION_PLAN §3.4 · PT-02)
//
// ⚠️ **재는 것은 「멎는가」가 아니라 「남의 까닭을 지우지 않는가」다.** 옛
// 코드에서는 탭 감시가 `gameLoop.paused = document.hidden`으로 **대입**했다 —
// 그래서 장치를 잃어 멎어 둔 세계에서 탭을 나갔다 돌아오기만 하면 그 정지가
// 덮였고, 사람은 아직 안 그려진 화면에서 걷게 됐다.
import { beforeEach, describe, expect, it } from 'vitest'
import { gameLoop } from './GameLoop'
import { clearLoopHolds, holdLoop, loopHolds, releaseLoop } from './pause'

beforeEach(() => { clearLoopHolds() })

describe('까닭을 걸고 푼다', () => {
  it('아무것도 안 걸리면 돈다', () => {
    expect(gameLoop.paused).toBe(false)
    expect(loopHolds()).toEqual([])
  })

  it('하나만 걸려도 멎는다', () => {
    holdLoop('hidden')
    expect(gameLoop.paused).toBe(true)
  })

  it('같은 까닭을 두 번 걸어도 한 번 풀면 된다', () => {
    holdLoop('renderer')
    holdLoop('renderer')
    releaseLoop('renderer')
    expect(gameLoop.paused).toBe(false)
  })

  it('안 건 까닭을 풀어도 남의 것이 안 풀린다', () => {
    holdLoop('renderer')
    releaseLoop('hidden')
    expect(gameLoop.paused).toBe(true)
    expect(loopHolds()).toEqual(['renderer'])
  })
})

describe('까닭이 겹칠 때', () => {
  it('둘 중 하나만 풀면 아직 멎어 있다', () => {
    holdLoop('renderer')
    holdLoop('hidden')
    releaseLoop('hidden')
    expect(gameLoop.paused).toBe(true)
    releaseLoop('renderer')
    expect(gameLoop.paused).toBe(false)
  })

  it('푸는 순서가 결과를 안 바꾼다', () => {
    holdLoop('scene')
    holdLoop('hidden')
    releaseLoop('scene')
    expect(gameLoop.paused).toBe(true)
    releaseLoop('hidden')
    expect(gameLoop.paused).toBe(false)
  })

  it('무엇 때문에 멎었는지 밖에서 읽을 수 있다', () => {
    holdLoop('scene')
    holdLoop('renderer')
    expect([...loopHolds()].sort()).toEqual(['renderer', 'scene'])
  })
})

describe('고정 스텝이 실제로 안 돈다', () => {
  it('걸려 있는 동안 시스템이 한 번도 안 불린다', () => {
    let ticks = 0
    gameLoop.register({ fixedUpdate: () => { ticks += 1 } })
    holdLoop('renderer')
    for (let i = 0; i < 60; i++) gameLoop.tick(1 / 60)
    expect(ticks).toBe(0)
    releaseLoop('renderer')
    gameLoop.tick(1 / 60)
    expect(ticks).toBeGreaterThan(0)
  })
})
