// 그룹의 사람 이름 (`groupLabels.ts`)
//
// ⚠️ **표가 `groups.ts`와 따로 산다.** 첫 화면 청크 때문에 그렇게 뒀는데, 그러면
// 그룹이 하나 새로 생겨도 이 표는 모른다 — 그날 화면에 id가 그대로 샌다. 여기서
// 설치기가 도는 그룹 전부와 맞대어 그 틈을 막는다
import { describe, it, expect } from 'vitest'
import { groupLabel, groupLabels } from './groupLabels'
import { REQUIRED_GROUPS } from './required'
import { ALL_GROUPS } from '../groups'

const LANGS = ['ko', 'en', 'ja'] as const

describe('groupLabel', () => {
  it('필수 그룹 전부에 세 언어 이름이 있다', () => {
    for (const id of REQUIRED_GROUPS) {
      for (const lang of LANGS) expect(groupLabel(id, lang), `${id} ${lang}`).not.toBe(id)
    }
  })

  // `corruptGroups()`는 설치 기록에 적힌 그룹 이름을 그대로 돌려준다 — 기록에는
  // 설치기가 돈 그룹이 다 들어가므로, 화면이 받을 수 있는 이름은 `ALL_GROUPS` 전부다
  it('설치기가 도는 그룹 전부에 이름이 있다 — 무결성 경고가 받을 수 있는 이름 전부', () => {
    for (const { name } of ALL_GROUPS) {
      for (const lang of LANGS) expect(groupLabel(name, lang), `${name} ${lang}`).not.toBe(name)
    }
  })

  it('한국어 이름에 영문 id가 안 섞인다', () => {
    for (const { name } of ALL_GROUPS) expect(groupLabel(name)).not.toMatch(/[A-Za-z]{3,}/)
  })

  it('기본은 한국어다', () => {
    expect(groupLabel('npcModels')).toBe('사람 모델')
    expect(groupLabel('npcModels', 'en')).toBe('Character models')
  })

  it('모르는 id는 그대로 돌려준다 — 이름을 지어내지 않는다', () => {
    expect(groupLabel('somethingNew')).toBe('somethingNew')
    expect(groupLabels(['rooms', 'somethingNew'])).toBe('실내 · somethingNew')
  })
})
