// 종마다 다른 타격 타이밍 (`BattleDataTable.MotionTimingData`)
//
// 여기서 보는 것이 둘이다:
//
//   ① **곡선의 정점이 표가 정한 자리에 오는가.** 이 값이 틀리면 포켓몬이 팔을
//      뻗기 전에 상대가 맞거나, 이미 돌아온 뒤에 맞는다. 눈으로는 "뭔가
//      어색하다"로만 보여서 숫자로 못 박는다.
//   ② **표가 실제로 갈리는가.** 493종이 다 같은 값이면 표를 실어 봐야 아무
//      차이가 없다 — 그러면 예전 상수 하나로 충분했다는 뜻이다.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { peakAt } from './BattleStage'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const FILE = resolve(DATA, 'motionTiming.json')
const maybe = withData('motionTiming.json')

describe('돌진 곡선', () => {
  it('정점이 정해 준 자리에 온다', () => {
    for (const p of [0.2, 0.35, 0.5, 0.7]) {
      expect(peakAt(p, p)).toBeCloseTo(0.5, 12)
      // `sin(위상 × π)`가 여기서 1이 된다
      expect(Math.sin(peakAt(p, p) * Math.PI)).toBeCloseTo(1, 12)
    }
  })

  it('양끝은 0이다 — 나가기 전과 돌아온 뒤에는 제자리다', () => {
    for (const p of [0.2, 0.5, 0.8]) {
      expect(peakAt(0, p)).toBe(0)
      expect(peakAt(1, p)).toBeCloseTo(1, 12)
    }
  })

  it('절반을 주면 예전 대칭 곡선 그대로다', () => {
    for (const k of [0, 0.25, 0.5, 0.75, 1]) expect(peakAt(k, 0.5)).toBeCloseTo(k, 12)
  })

  it('단조롭게 는다 — 어디서도 뒷걸음질하지 않는다', () => {
    for (const p of [0.05, 0.3, 0.6, 0.95]) {
      let last = -1
      for (let k = 0; k <= 1.0001; k += 0.01) {
        const v = peakAt(k, p)
        expect(v).toBeGreaterThanOrEqual(last)
        last = v
      }
    }
  })

  it('⚠️ 양끝을 막는다 — 표가 극단으로 가도 순간이동이 안 된다', () => {
    // 0.15~0.85로 접는다. 안 접으면 돌아오는 구간이 한 프레임이 된다
    expect(peakAt(0.15, 0)).toBeCloseTo(0.5, 12)
    expect(peakAt(0.85, 1)).toBeCloseTo(0.5, 12)
  })
})

maybe('BDSP 타이밍 표', () => {
  const file = JSON.parse(readFileSync(FILE, 'utf8')) as {
    fps: number
    order: string[]
    frames: Record<string, number[]>
  }

  it('30프레임/초다 — 돌진 정점으로 잰 값이다', () => {
    // `tools/extract/bdspMotionTiming.py` 머리말: `ba20` 클립에서 뿌리 뼈가
    // 제일 멀리 나간 시각과 견주면 454종 중 410종이 30fps 쪽에 더 가깝다
    expect(file.fps).toBe(30)
  })

  it('열쇠가 종×100 + 폼이고 493종이 다 있다', () => {
    const mons = new Set([...Object.keys(file.frames)].map((k) => Math.floor(Number(k) / 100)))
    expect(mons.size).toBe(493)
    expect(Math.min(...mons)).toBe(1)
    expect(Math.max(...mons)).toBe(493)
    // 폼이 따로 적힌 줄이 66개 있다 (로토무·아르세우스·데오키시스…)
    expect(Object.keys(file.frames).length).toBe(559)
  })

  it('물리 타격은 종마다 갈린다 — 한 값이면 표를 실을 이유가 없다', () => {
    const i = file.order.indexOf('physical')
    expect(i).toBeGreaterThanOrEqual(0)
    const frames = Object.values(file.frames).map((row) => row[i]!)
    const spread = new Set(frames)
    expect(spread.size).toBeGreaterThan(20)
    // 실측 범위. 0은 "그 동작이 없다"는 뜻이라 읽는 쪽이 기본값으로 떨어진다
    expect(Math.max(...frames)).toBe(52)
    // 모부기 25 · 리아코 14 · 블레이범 30 (`MonsNo` × 100)
    expect(file.frames['100']?.[i]).toBe(25)
    expect(file.frames['15800']?.[i]).toBe(14)
    expect(file.frames['15700']?.[i]).toBe(30)
  })

  it('특수는 거의 한 값이다 — 그래서 물리 쪽이 이 표의 값어치다', () => {
    const i = file.order.indexOf('special')
    const frames = Object.values(file.frames).map((row) => row[i]!)
    // 559개 종·폼 조합 중 열이다. 표 원본(1,008줄)에서는 성별 두 줄씩이라 열일곱이다
    expect(frames.filter((f) => f !== 19)).toHaveLength(10)
  })

  it('클립보다 뒤에서 때리는 종이 없다', () => {
    // 제일 늦은 것이 52프레임 = 1.73초다. 우리가 곡선을 0.85로 접으므로
    // 그보다 긴 돌진이어도 화면에서는 접힌 자리에서 꺾인다
    const i = file.order.indexOf('physical')
    for (const [key, row] of Object.entries(file.frames)) {
      expect(row[i]! / file.fps, key).toBeLessThan(2)
    }
  })
})
