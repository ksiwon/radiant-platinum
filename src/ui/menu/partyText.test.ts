// 파티 화면의 글 고르기 (`partyText.ts`) — 모드 → 뱅크 453 줄, 판 줄, 알 물음
//
// 줄 번호는 원작 `party_menu/main.c:305-327`과 `windows.c:819 · 1032-1075`에서 온 것이다. 표가 한 칸이라도 밀리면
// 아래 글 띠가 엉뚱한 안내문을 읽는다.
import { describe, expect, it } from 'vitest'
import { iconHopFrames } from '../common/iconHop'
import {
  askLine, modeLine, partyMode, stoneVerdict, teachVerdict, verdictIsGood, verdictLine, type PartyModeInput,
} from './partyText'

const base: PartyModeInput = { held: false, milkPick: false, giving: false, using: null }

describe('모드 → 안내문의 줄', () => {
  it('기본과 스크립트가 고르라고 연 화면은 29 「포켓몬을 선택해 주십시오」다', () => {
    expect(modeLine(partyMode(base))).toBe(29)
  })

  it('집었으면 30, 건네주기는 31, 도구는 32, 기술머신은 33, 우유마시기는 36이다', () => {
    expect(modeLine(partyMode({ ...base, held: true }))).toBe(30)
    expect(modeLine(partyMode({ ...base, giving: true }))).toBe(31)
    expect(modeLine(partyMode({ ...base, using: 'heal' }))).toBe(32)
    expect(modeLine(partyMode({ ...base, using: 'evoStone' }))).toBe(32)
    expect(modeLine(partyMode({ ...base, using: 'tmhm' }))).toBe(33)
    expect(modeLine(partyMode({ ...base, milkPick: true }))).toBe(36)
  })

  it('우유마시기가 집은 것보다 앞이고, 집은 것이 건네주기보다 앞이다', () => {
    expect(partyMode({ ...base, milkPick: true, held: true })).toBe('milk')
    expect(partyMode({ ...base, held: true, giving: true })).toBe('moveTo')
  })
})

describe('갈래 창을 연 마리에 대한 물음', () => {
  it('알이면 198, 아니면 37이다', () => {
    expect(askLine(true)).toBe(198)
    expect(askLine(false)).toBe(37)
  })
})

describe('판마다 붙는 한 줄 (175~179)', () => {
  it('줄 번호', () => {
    expect([verdictLine('canLearn'), verdictLine('cannotLearn'), verdictLine('alreadyKnows')]).toEqual([175, 176, 177])
    expect([verdictLine('canUse'), verdictLine('cannotUse')]).toEqual([178, 179])
  })

  it('기술머신: 칸이 차서 잊을 것을 묻는 쪽도 배울 수 있는 판이다', () => {
    expect(teachVerdict('learn')).toBe('canLearn')
    expect(teachVerdict('mustForget')).toBe('canLearn')
    expect(teachVerdict('cannot')).toBe('cannotLearn')
    expect(teachVerdict('already')).toBe('alreadyKnows')
  })

  it('진화의돌: 진화가 걸리면 쓸 수 있다', () => {
    expect(stoneVerdict(true)).toBe('canUse')
    expect(stoneVerdict(false)).toBe('cannotUse')
  })

  it('하는 쪽(175 · 178)만 강조한다 — 이미 아는 판은 하지 못하는 쪽이다', () => {
    expect(verdictIsGood('canLearn')).toBe(true)
    expect(verdictIsGood('canUse')).toBe(true)
    expect(verdictIsGood('alreadyKnows')).toBe(false)
    expect(verdictIsGood('cannotLearn')).toBe(false)
    expect(verdictIsGood('cannotUse')).toBe(false)
  })
})

describe('뛰는 박자 (`iconHopFrames`) — 명판 그림이 쓰는 표', () => {
  it('만피 8 · 초록 12 · 노랑 24 · 빨강 40 프레임, 상태 이상과 기절은 안 뛴다', () => {
    expect(iconHopFrames(100, 100)).toBe(8)
    expect(iconHopFrames(90, 100)).toBe(12)
    expect(iconHopFrames(40, 100)).toBe(24)
    expect(iconHopFrames(10, 100)).toBe(40)
    expect(iconHopFrames(100, 100, 'psn')).toBeNull()
    expect(iconHopFrames(0, 100)).toBeNull()
  })
})
