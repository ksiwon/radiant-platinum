// 리포트 화면의 키와 글 (`SaveScreen.tsx`의 `saveKeys` · `saveMenuKeys` · `SAVE_HINT` · `failedLine` · `backupLine`)
//
// 다운로드가 막혔을 때 「백업 파일 받기」가 맨 단추뿐이라 키로는 못 눌렀다. 예/아니오는
// ←→만 받아서 필드의 ↑↓ 손버릇이 죽었고, 다 쓴 뒤에도 안내가 「X 그만둔다」를 띄웠다.
// 못 썼을 때는 롬 줄 대신 지은 문장 아래에 개발 말 원인을 붙였다. 백업 줄에는
// 저장소 이름·확장자가 붙은 파일 이름이 그대로 찍혔다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SAVE_TEXT } from '../../data/uiText'
import { fieldScripts } from '../../engine/script/field'
import { FLAG_HAS_POKEDEX } from '../../engine/script/vars'
import { dexSet } from '../../engine/pokemon/dex'
import { useSaveStore } from '../../state/saveStore'

const {
  backupLine, failedLine, saveHint, saveKeys, saveMenuKeys, savedChime, writingLine,
} = await import('./SaveScreen')
const { SaveInfo } = await import('./SaveInfo')

const blocked = { started: false }
const got = { started: true }

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
    expect(saveHint('answer', 'ko')).toContain('X 그만둔다')
    for (const locale of ['ko', 'en', 'ja'] as const) {
      for (const keys of ['retry', 'close', 'wait'] as const) expect(saveHint(keys, locale)).not.toContain('X')
      expect(saveHint('answer', locale)).toContain('X')
    }
    expect(saveHint('retry', 'ko')).toContain('←→ 고르기')
    expect(saveHint('close', 'ko')).toBe('Z 닫기')
    expect(saveHint('close', 'en')).toBe('Z Close')
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

describe('백업 줄', () => {
  it('받았는지 막혔는지만 적는다 — 파일 이름·확장자를 안 찍는다', () => {
    expect(backupLine(got, 'ko')).toBe('백업 파일도 받았다')
    for (const b of [got, blocked]) {
      expect(backupLine(b, 'ko')).not.toMatch(/rpsave|radiant|_/)
    }
  })

  it('막혔으면 리포트는 남았다고 따로 알린다', () => {
    expect(backupLine(blocked, 'ko')).toContain('막았다')
    expect(backupLine(blocked, 'ko')).toContain('리포트는 남아 있다')
  })
})

describe('쓰는 중 글', () => {
  const common: string[] = []
  common[SAVE_TEXT.writing] = '작성하고 있습니다'
  common[SAVE_TEXT.writingFull] = '리포트에 많은 내용을 기록 중입니다'

  it('이미 리포트가 있는 판은 15번, 처음 쓰는 판은 21번이다', () => {
    expect(SAVE_TEXT.writing).toBe(15)
    expect(SAVE_TEXT.writingFull).toBe(21)
    expect(writingLine(common, true)).toBe('작성하고 있습니다')
    expect(writingLine(common, false)).toBe('리포트에 많은 내용을 기록 중입니다')
  })

  it('글이 아직 안 왔으면 비워 둔다', () => {
    expect(writingLine([], true)).toBe('')
  })
})

describe('다 쓴 소리', () => {
  it('쓰기가 끝나 done으로 들어서는 한 번뿐이다', () => {
    expect(savedChime('writing', 'done')).toBe(true)
    expect(savedChime(null, 'done')).toBe(true)
    expect(savedChime('done', 'done')).toBe(false)
    expect(savedChime('writing', 'failed')).toBe(false)
    expect(savedChime('ask', 'writing')).toBe(false)
  })
})

describe('요약 장의 dd 수 (하네스가 마지막 dl의 dd를 센다)', () => {
  // ⚠️ 서버 렌더는 zustand의 **처음 상태**를 읽는다(`getInitialState`) — `setState`가 안 먹어서 그 객체를 직접 건드린다
  const initial = useSaveStore.getInitialState()
  /** 마지막 `dl`의 `dd` 수. 이 화면 안에 `dl`이 하나뿐이라는 것도 같이 본다 */
  function render(): { html: string; dd: number } {
    const html = renderToStaticMarkup(createElement(SaveInfo))
    expect(html.match(/<dl[\s>]/g)).toHaveLength(1)
    return { html, dd: (html.match(/<dd[\s>]/g) ?? []).length }
  }

  it('도감 전에는 셋이다', () => {
    fieldScripts.vars.clearFlag(FLAG_HAS_POKEDEX)
    expect(render().dd).toBe(3)
  })

  it('도감을 받고 본 것이 있으면 넷이다', () => {
    fieldScripts.vars.setFlag(FLAG_HAS_POKEDEX)
    initial.pokedex.seen.set(dexSet(initial.pokedex.seen, 387))
    try {
      expect(render().dd).toBe(4)
    } finally {
      fieldScripts.vars.clearFlag(FLAG_HAS_POKEDEX)
      initial.pokedex.seen.fill(0)
    }
  })

  it('이름이 장에 뜨고, 배지 · 파티 · 주인공 그림은 dl 밖이다', () => {
    const was = initial.trainer.name
    initial.trainer.name = 'TESTER'
    try {
      const { html } = render()
      const dl = /<dl[\s\S]*?<\/dl>/.exec(html)?.[0] ?? ''
      expect(dl).toContain('TESTER')
      expect(html.replace(dl, '')).not.toMatch(/<d[dt][\s>]/)
    } finally {
      initial.trainer.name = was
    }
  })
})
