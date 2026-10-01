// 리포트 화면의 키와 글 (`SaveScreen.tsx`의 `saveKeys` · `saveMenuKeys` · `SAVE_HINT` · `failedLine`)
//
// 다운로드가 막혔을 때 「백업 파일 받기」가 맨 단추뿐이라 키로는 못 눌렀다. 예/아니오는
// ←→만 받아서 필드의 ↑↓ 손버릇이 죽었고, 다 쓴 뒤에도 안내가 「X 그만둔다」를 띄웠다.
// 못 썼을 때는 롬 줄 대신 지은 문장 아래에 개발 말 원인을 붙였다.
import { describe, expect, it, vi } from 'vitest'
import { SAVE_TEXT } from '../../data/uiText'

const { failedLine, SAVE_HINT, saveKeys, saveMenuKeys } = await import('./SaveScreen')

const blocked = { started: false, fileName: 'r.sav' }
const got = { started: true, fileName: 'r.sav' }

function acts() {
  return { setYes: vi.fn(), write: vi.fn(), back: vi.fn(), retryBackup: vi.fn(), closeAll: vi.fn() }
}

describe('키가 하는 일', () => {
  it('단계마다 고른다', () => {
    expect(saveKeys('ask', null)).toBe('answer')
    expect(saveKeys('overwrite', null)).toBe('answer')
    expect(saveKeys('writing', null)).toBe('wait')
    expect(saveKeys('done', got)).toBe('close')
    expect(saveKeys('done', null)).toBe('close')
    expect(saveKeys('failed', blocked)).toBe('close')
  })

  it('다 썼는데 다운로드가 막혔으면 다시 받기와 닫기를 고른다', () => {
    expect(saveKeys('done', blocked)).toBe('retry')
  })
})

describe('예/아니오는 두 축을 다 받는다', () => {
  it('↑는 ←와, ↓는 →와 같다', () => {
    const a = acts()
    const k = saveMenuKeys('answer', true, a)
    expect(k.down?.()).toBe(true)
    expect(k.right?.()).toBe(true)
    expect(a.setYes.mock.calls).toEqual([[false], [false]])

    const b = acts()
    const n = saveMenuKeys('answer', false, b)
    expect(n.up?.()).toBe(true)
    expect(n.left?.()).toBe(true)
    expect(b.setYes.mock.calls).toEqual([[true], [true]])
  })

  it('이미 그 자리면 안 움직이고 안 운다', () => {
    const a = acts()
    const k = saveMenuKeys('answer', true, a)
    expect(k.up?.()).toBe(false)
    expect(k.left?.()).toBe(false)
    expect(a.setYes).not.toHaveBeenCalled()
  })

  it('고를 것이 없는 단계에서는 방향키가 아무것도 안 한다', () => {
    for (const keys of ['close', 'wait'] as const) {
      const a = acts()
      const k = saveMenuKeys(keys, true, a)
      expect(k.down?.()).toBe(false)
      expect(k.right?.()).toBe(false)
      expect(a.setYes).not.toHaveBeenCalled()
    }
  })

  it('X는 물을 때만 물러난다', () => {
    const a = acts()
    saveMenuKeys('answer', true, a).cancel?.()
    expect(a.back).toHaveBeenCalledOnce()
    for (const keys of ['retry', 'close', 'wait'] as const) {
      const b = acts()
      expect(saveMenuKeys(keys, true, b).cancel?.()).toBe(false)
      expect(b.back).not.toHaveBeenCalled()
    }
  })
})

describe('결정 키', () => {
  it('물을 때는 예가 쓰고 아니오가 물러난다', () => {
    const a = acts()
    saveMenuKeys('answer', true, a).confirm?.()
    expect(a.write).toHaveBeenCalledOnce()
    const b = acts()
    saveMenuKeys('answer', false, b).confirm?.()
    expect(b.back).toHaveBeenCalledOnce()
    expect(b.write).not.toHaveBeenCalled()
  })

  it('막혔을 때는 「백업 파일 받기」를 키로 누른다 — 창을 닫지 않는다', () => {
    const a = acts()
    saveMenuKeys('retry', true, a).confirm?.()
    expect(a.retryBackup).toHaveBeenCalledOnce()
    expect(a.closeAll).not.toHaveBeenCalled()
    const b = acts()
    saveMenuKeys('retry', false, b).confirm?.()
    expect(b.closeAll).toHaveBeenCalledOnce()
    expect(b.retryBackup).not.toHaveBeenCalled()
  })

  it('다 쓴 뒤에는 닫고, 쓰는 중에는 아무것도 안 한다', () => {
    const a = acts()
    saveMenuKeys('close', true, a).confirm?.()
    expect(a.closeAll).toHaveBeenCalledOnce()
    const b = acts()
    expect(saveMenuKeys('wait', true, b).confirm?.()).toBe(false)
    expect(Object.values(b).every((f) => f.mock.calls.length === 0)).toBe(true)
  })
})

describe('안내 줄', () => {
  it('그 자리에서 먹는 키만 적는다', () => {
    expect(SAVE_HINT.answer).toContain('X 그만둔다')
    for (const keys of ['retry', 'close', 'wait'] as const) expect(SAVE_HINT[keys]).not.toContain('X')
    expect(SAVE_HINT.retry).toContain('←→ 고르기')
    expect(SAVE_HINT.close).toBe('Z 닫기')
  })
})

describe('못 썼을 때의 대사', () => {
  it('롬의 실패 줄 하나다', () => {
    const common = Array.from({ length: 20 }, (_, i) => `줄${i}`)
    expect(failedLine(common)).toBe(common[SAVE_TEXT.failed])
  })

  it('글이 아직 안 왔으면 비워 둔다', () => {
    expect(failedLine([])).toBe('')
  })
})
