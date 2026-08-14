// 진화 큐 (PARITY §3.1)
//
// ⚠️ **여기서 재는 것은 「무엇이 걸었는가」가 살아남는지 하나다.** 자리 번호만
// 담던 시절에는 진화 화면이 늘 「레벨이 올랐다」로 다시 판단해서 **도구로 거는
// 진화가 통째로 죽어 있었다** — 돌은 가방에서 사라지는데 아무 일도 안 일어난다.
// 시험 하나로 못 박아 둔다.
import { beforeEach, expect, it } from 'vitest'
import { useEvolutionStore } from './evolutionStore'

beforeEach(() => { useEvolutionStore.getState().clear() })

it('레벨업으로 든 자리는 도구가 없다', () => {
  useEvolutionStore.getState().queue([0, 2])
  expect(useEvolutionStore.getState().take()).toEqual({ slot: 0 })
  expect(useEvolutionStore.getState().take()).toEqual({ slot: 2 })
  expect(useEvolutionStore.getState().take()).toBeNull()
})

it('⚠️ 도구로 든 자리는 그 번호를 들고 나온다', () => {
  useEvolutionStore.getState().queue([1], 233)
  expect(useEvolutionStore.getState().take()).toEqual({ slot: 1, item: 233 })
})

it('같은 자리는 한 번만 든다 — 배틀에서 여러 번 오를 수 있다', () => {
  useEvolutionStore.getState().queue([3])
  useEvolutionStore.getState().queue([3])
  expect(useEvolutionStore.getState().pending).toHaveLength(1)
})

it('먼저 든 것이 먼저 나온다', () => {
  useEvolutionStore.getState().queue([5])
  useEvolutionStore.getState().queue([4], 468)
  expect(useEvolutionStore.getState().take()?.slot).toBe(5)
  expect(useEvolutionStore.getState().take()).toEqual({ slot: 4, item: 468 })
})
