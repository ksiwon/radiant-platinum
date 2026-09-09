// 진행 계수기와 분류의 계약 (`budget.mjs`) — 지시서 §1.1의 회귀 검사
//
// ⚠️ **여기서 재는 것은 「시간을 안 본다」와 「내용을 안 봐준다」다.** 두
// 실측이 이 파일의 까닭이다 — 붐비는 기계에서 멀쩡한 구간이 떨어졌고(시간),
// 542번 눌러 끝난 배틀이 「얼었다」로 적혔다(시간). 반대로 대사 0/12쪽은
// 기계가 아무리 붐벼도 결함이다(내용)
import { describe, expect, it } from 'vitest'
import { BUSY, classify, isBusy, makeStall, pct, SHAPE, summarizeLoad } from './budget.mjs'

describe('진행 계수기', () => {
  it('지문이 바뀌면 견딜 횟수가 처음으로 돌아간다', () => {
    const s = makeStall(3)
    expect(s.note('a')).toBe(false)
    expect(s.note('a')).toBe(false)
    expect(s.note('a')).toBe(false)
    // 세 번째 같은 지문에서 멈춘다
    expect(s.note('a')).toBe(true)
    expect(s.idle).toBe(3)
  })

  it('나아가는 동안은 몇 바퀴를 돌든 안 멈춘다', () => {
    const s = makeStall(2)
    for (let i = 0; i < 500; i++) expect(s.note(`t${String(i)}`)).toBe(false)
    expect(s.moves).toBe(499)
    expect(s.idle).toBe(0)
  })

  it('첫 관측은 진행이 아니다', () => {
    const s = makeStall(2)
    s.note('a')
    expect(s.moves).toBe(0)
    expect(s.moving).toBe(false)
  })

  it('나아가는 중인가를 총예산 상한이 읽는다', () => {
    const s = makeStall(4)
    s.note('a'); s.note('b')
    // 한 번 나아갔고 아직 견딜 횟수를 안 채웠다 — 실패가 아니라 「느림」이다
    expect(s.moving).toBe(true)
    s.note('b'); s.note('b'); s.note('b'); s.note('b')
    expect(s.moving).toBe(false)
  })

  it('시각을 안 본다 — 같은 지문 열이면 얼마가 걸렸든 같은 답이다', () => {
    const a = makeStall(3)
    const b = makeStall(3)
    const seq = ['x', 'x', 'y', 'y', 'y', 'y']
    expect(seq.map((f) => a.note(f))).toEqual(seq.map((f) => b.note(f)))
  })

  it('견딜 횟수가 잘못되면 거절한다', () => {
    expect(() => makeStall(0)).toThrow()
    expect(() => makeStall(1.5)).toThrow()
  })
})

describe('부하 요약', () => {
  it('표본이 비면 0이 아니라 null이다', () => {
    expect(pct([], 0.5)).toBe(null)
    const l = summarizeLoad([])
    expect(l.fps).toBe(null)
    expect(l.cpu).toBe(null)
    expect(l.n).toBe(0)
  })

  it('중앙값과 아래 꼬리를 따로 적는다', () => {
    const samples = [60, 60, 60, 60, 60, 60, 60, 60, 4, 4].map((fps) => ({ fps, cpu: 30 }))
    const l = summarizeLoad(samples)
    expect(l.fps.p50).toBe(60)
    // 평균이었으면 48.8로 봉우리가 가려진다
    expect(l.fps.p10).toBe(4)
    expect(l.fps.n).toBe(10)
  })

  it('한쪽만 재도 그쪽만 적는다', () => {
    const l = summarizeLoad([{ fps: 30 }, { fps: 31 }])
    expect(l.fps.p50).toBe(31)
    expect(l.cpu).toBe(null)
  })
})

describe('붐빔', () => {
  it('표본이 없으면 「안 붐볐다」가 아니라 「모른다」다', () => {
    expect(isBusy(null).known).toBe(false)
    expect(isBusy(summarizeLoad([])).known).toBe(false)
  })

  it('느린 프레임을 붐빔으로 읽는다', () => {
    const l = summarizeLoad(Array.from({ length: 10 }, () => ({ fps: BUSY.fps - 1, cpu: 10 })))
    expect(isBusy(l)).toMatchObject({ known: true, value: true })
  })

  it('CPU만 뜨거워도 붐빔이다', () => {
    const l = summarizeLoad(Array.from({ length: 10 }, () => ({ fps: 60, cpu: BUSY.cpu + 1 })))
    expect(isBusy(l)).toMatchObject({ known: true, value: true })
  })

  it('문턱 위는 붐빔이 아니다', () => {
    const l = summarizeLoad(Array.from({ length: 10 }, () => ({ fps: BUSY.fps, cpu: BUSY.cpu })))
    expect(isBusy(l)).toMatchObject({ known: true, value: false })
  })
})

describe('분류', () => {
  const busy = summarizeLoad(Array.from({ length: 10 }, () => ({ fps: 4, cpu: 95 })))
  const quiet = summarizeLoad(Array.from({ length: 10 }, () => ({ fps: 60, cpu: 20 })))

  it('내용 실패는 기계가 아무리 붐벼도 FAIL이다', () => {
    expect(classify(SHAPE.content, busy).verdict).toBe('FAIL')
  })

  it('시간 실패는 붐볐을 때만 BLOCKED다', () => {
    expect(classify(SHAPE.time, busy)).toMatchObject({ verdict: 'BLOCKED', kind: '경합' })
    expect(classify(SHAPE.time, quiet).verdict).toBe('FAIL')
  })

  it('붐빔을 못 쟀으면 의심을 유지한다 — FAIL이다', () => {
    expect(classify(SHAPE.time, null).verdict).toBe('FAIL')
  })

  it('게임을 못 연 것은 그 항목의 실패가 아니다', () => {
    expect(classify(SHAPE.infra, null)).toMatchObject({ verdict: 'BLOCKED', kind: '인프라' })
  })

  it('모르는 모양은 봐주지 않는다', () => {
    expect(classify('뭔가', busy).verdict).toBe('FAIL')
  })
})
