// 설정 화면의 글 (`OptionsScreen.tsx`의 `resetText` · `verifyNote`)
//
// 「처음부터」는 지우기 전에 세이브 파일을 받고 백업 슬롯에 한 벌을 남긴다
// (`saveStore`의 `resetSave` → `backupBeforeOverwrite`). 설명이 '되돌릴 수 없다'고
// 하면 타이틀의 「백업에서 되찾기」와 말이 엇갈린다. 「에셋 확인」은 내부 그룹 키를
// 그대로 보이고 할 일을 안 적었었다.
import { describe, expect, it, vi } from 'vitest'

// 표시 이름은 `groupLabels`가 정한다. 여기서는 그 표를 거쳤는지만 본다
vi.mock('../../import/install/groupLabels', () => ({
  groupLabel: (id: string, lang = 'ko') => `<${lang}:${id}>`,
}))

const { resetText, verifyNote } = await import('./OptionsScreen')

const LANGS = [0, 1, 2] as const

describe('「처음부터」의 설명', () => {
  it('세 언어 모두 타이틀 단추 이름을 글자 그대로 가리킨다', () => {
    for (const lang of LANGS) {
      const { help, prompt } = resetText(lang)
      // 타이틀 단추(`TitleScreen`의 label)는 한국어 한 벌이다
      expect(help).toContain('「백업에서 되찾기」')
      expect(prompt).toContain('「백업에서 되찾기」')
    }
  })

  it('되돌릴 수 없다고도, 늘 되돌린다고도 말하지 않는다', () => {
    for (const lang of LANGS) {
      const { help, prompt } = resetText(lang)
      for (const s of [help, prompt]) {
        expect(s).not.toMatch(/되돌릴 수 없|cannot be brought back|元に戻せません/)
        expect(s).not.toMatch(/언제든|any time|いつでも/)
      }
    }
  })

  it('지우기 전에 파일로 받는다는 것을 말한다', () => {
    expect(resetText(0).help).toContain('세이브 파일로 받고')
    expect(resetText(1).help).toContain('saved as a file')
    expect(resetText(2).help).toContain('セーブファイルとして保存')
  })
})

describe('「에셋 확인」의 결과', () => {
  const broken = (n: number, groups: string[]) => ({
    ok: 10, broken: Array.from({ length: n }, () => ({}) as never), groups,
  })

  it('내부 키를 표시 이름으로 그리고, 그 언어의 이름을 고른다', () => {
    expect(verifyNote(broken(2, ['rooms', 'fields']), 0).text).toContain('다시 만들 부분: <ko:rooms> · <ko:fields>')
    expect(verifyNote(broken(2, ['rooms']), 1).text).toContain('parts to rebuild: <en:rooms>')
    expect(verifyNote(broken(2, ['rooms']), 2).text).toContain('作り直す部分: <ja:rooms>')
  })

  it('그룹이 많으면 몇 곳인지만 말한다', () => {
    const many = broken(9, ['a', 'b', 'c', 'd'])
    expect(verifyNote(many, 0).text).toContain('다시 만들 부분 4곳')
    expect(verifyNote(many, 0).text).not.toContain('<ko:a>')
    expect(verifyNote(many, 1).text).toContain('4 parts to rebuild')
    expect(verifyNote(many, 2).text).toContain('作り直す部分 4か所')
  })

  it('그룹이 안 잡혔으면 \'0곳\'이라고 하지 않는다', () => {
    expect(verifyNote(broken(1, []), 0).text).not.toContain('0곳')
    expect(verifyNote(broken(1, []), 1).text).toMatch(/^1 file is wrong\n/)
  })

  it('깨진 것이 있으면 타이틀의 고칠 단추를 글자 그대로 가리킨다', () => {
    for (const lang of LANGS) {
      const got = verifyNote(broken(1, ['rooms']), lang)
      expect(got.warn).toBe(true)
      expect(got.text).toContain('「어긋난 에셋 다시 만들기」')
    }
  })

  it('경고는 이모지가 아니라 warn 표로 낸다 — 글에 ⚠️가 없다', () => {
    for (const lang of LANGS) {
      for (const got of [verifyNote(broken(1, ['rooms']), lang), verifyNote('failed', lang)]) {
        expect(got.warn).toBe(true)
        expect(got.text).not.toContain('⚠')
      }
    }
  })

  it('실패하면 원문 대신 다시 해 보라고만 한다', () => {
    expect(verifyNote('failed', 0).text).toBe('확인하지 못했습니다 — 다시 시도하세요')
    expect(verifyNote('failed', 1).text).not.toMatch(/Error|undefined/)
  })

  it('온전하거나 개발판이면 경고가 아니다', () => {
    expect(verifyNote({ ok: 5, broken: [], groups: [] }, 0)).toEqual({ text: '파일 5개가 전부 온전합니다', warn: false })
    expect(verifyNote(null, 0).warn).toBe(false)
  })
})
