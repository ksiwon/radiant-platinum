// 가방·Y에서 도구를 밟는 자리 (`itemAction.ts`)
//
// 피리는 불어도 안 줄어든다 — 원작 `UseItemInBag`가 `selectedItemCount = 0`으로 두어
// 버리는 단계를 건너뛴다 (`applications/bag/main.c:2238-2245`).
import { describe, expect, it, vi } from 'vitest'
import { useSaveStore } from '../../state/saveStore'

const { performItemAction } = await import('./itemAction')

function deps() {
  return {
    item: 1, name: '검은비드로', pocket: 0,
    say: vi.fn(), consume: vi.fn(), back: vi.fn(), push: vi.fn(), closeAll: vi.fn(), openParty: vi.fn(),
  }
}

describe('피리', () => {
  it('검은피리·하얀피리는 불어도 개수가 안 줄고 출현률 값만 선다', () => {
    for (const factor of [1, 2]) {
      const d = deps()
      expect(performItemAction({ kind: 'flute', factor }, d)).toBe(true)
      expect(d.consume).not.toHaveBeenCalled()
      expect(d.say).toHaveBeenCalledTimes(1)
      expect(useSaveStore.getState().flute).toBe(factor)
    }
  })

  it('리펠은 그대로 하나 줄어든다 — 피리만 예외다', () => {
    const d = deps()
    performItemAction({ kind: 'repel', steps: 100, sound: 0 }, d)
    expect(d.consume).toHaveBeenCalledWith(0, 1, 1)
  })
})
