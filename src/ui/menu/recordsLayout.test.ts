import { describe, expect, it } from 'vitest'
import {
  creditsProgress, diplomaCell, diplomaScale, hofGroups, hofGroupShown, HOF_GROUP_STEP, pcMeterAt, pcMeterCount,
  PC_METER_MAX,
} from './recordsLayout'

const SEVEN = ['전당등록을', '축하합니다!', '꼬부기', '꼬부기 ♀ Lv.55', '어버이:플래티넘', '배틀프런티어', '에서 만났다']

describe('전당등록 글 묶음 — 일곱 줄이 세 묶음으로', () => {
  it('인사 둘 · 별명 · 종족 줄 · 출처 셋으로 빠짐없이 나뉜다', () => {
    const g = hofGroups(SEVEN)
    expect(g.greeting).toEqual(['전당등록을', '축하합니다!'])
    expect(g.name).toBe('꼬부기')
    expect(g.info).toBe('꼬부기 ♀ Lv.55')
    expect(g.source).toEqual(['어버이:플래티넘', '배틀프런티어', '에서 만났다'])
    // 어느 줄도 잃거나 늘지 않았다
    expect([...g.greeting, g.name, g.info, ...g.source]).toEqual(SEVEN)
  })

  it('빈 줄은 렌더하지 않는다 (한국판 인사 한 줄이 비어 있다)', () => {
    const g = hofGroups(['', '전당등록을 축하합니다!', '꼬부기', '꼬부기 Lv.5', '어버이:나', '', ''])
    expect(g.greeting).toEqual(['전당등록을 축하합니다!'])
    expect(g.source).toEqual(['어버이:나'])
  })

  it('줄이 아직 없으면 빈 묶음이다 (표가 안 왔다)', () => {
    expect(hofGroups([])).toEqual({ greeting: [], name: '', info: '', source: [] })
  })

  it('묶음은 원작의 세 걸음에 뜨고 한번 뜨면 그 마리가 나갈 때까지 남는다', () => {
    expect(HOF_GROUP_STEP).toEqual({ greeting: 1, hero: 2, source: 3 })
    expect([1, 2, 3].map((t) => hofGroupShown('hero', t))).toEqual([false, true, true])
    expect([0, 1, 2, 3].map((t) => hofGroupShown('greeting', t))).toEqual([false, true, true, true])
    expect(hofGroupShown('source', 2)).toBe(false)
  })
})

describe('PC 전당 기록 눈금', () => {
  it('제일 새 기록(entry 0)은 오른쪽 끝 막대다', () => {
    expect(pcMeterAt(3, 0)).toBe(2)
  })

  it('거슬러 올라갈수록 왼쪽이다 — 현재 막대 자리는 count - 1 - entry', () => {
    for (const count of [1, 2, 7, 30]) {
      for (let entry = 0; entry < count; entry++) expect(pcMeterAt(count, entry)).toBe(count - 1 - entry)
    }
  })

  it('막대는 서른을 넘기지 않는다', () => {
    expect(pcMeterCount(5)).toBe(5)
    expect(pcMeterCount(99)).toBe(PC_METER_MAX)
    expect(pcMeterCount(0)).toBe(0)
  })
})

describe('상장', () => {
  it('그림 칸이 신오 · 전국도감으로 갈린다', () => {
    expect(diplomaCell(false)).toBe(0)
    expect(diplomaCell(true)).toBe(1)
  })

  it('종이는 정수배다 — 960×640에서 2배', () => {
    expect(diplomaScale(960, 640)).toBe(2)
    expect(diplomaScale(1920, 1080)).toBe(4)
    for (const [w, h] of [[500, 400], [1280, 800], [1600, 900]] as const) {
      expect(Number.isInteger(diplomaScale(w, h))).toBe(true)
    }
  })
})

describe('크레딧 진행', () => {
  it('0에서 1까지 가고 넘치지 않는다', () => {
    expect(creditsProgress(0, 100)).toBe(0)
    expect(creditsProgress(50, 100)).toBe(0.5)
    expect(creditsProgress(999, 100)).toBe(1)
    expect(creditsProgress(-5, 100)).toBe(0)
  })

  it('전체 길이가 0이면 0이다', () => {
    expect(creditsProgress(10, 0)).toBe(0)
  })
})
