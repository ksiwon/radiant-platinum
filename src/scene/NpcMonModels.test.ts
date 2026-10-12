// 오버월드 포켓몬 표가 **실제 배치표의 이름**을 가리키는지 되짚는다.
//
// 이름을 하나 잘못 적으면 그 포켓몬은 조용히 판때기로 남는다 — 화면은 멀쩡해
// 보이고 시험도 안 걸린다. 그래서 지어낸 목록끼리 맞추지 않고 `npcSprites.json`
// 을 직접 읽는다
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { OVERWORLD_MON_NAMES, overworldMon } from '../engine/actor/overworldMon'

const FILE = 'public/data/npcSprites.json'
const real = existsSync(FILE)
const names: ReadonlySet<string> = real
  ? new Set(
    Object.values(JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, { name: string }>)
      .map((s) => s.name),
  )
  : new Set()

describe('오버월드 포켓몬 모델', () => {
  it.runIf(real)('표의 이름이 전부 실제 graphicsID 이름이다', () => {
    const missing = OVERWORLD_MON_NAMES.filter((n) => !names.has(n))
    expect(missing).toEqual([])
  })

  it('종족 번호가 4세대 범위 안이고 폼이 0이 아닌 것은 둘뿐이다', () => {
    // 로토무 다섯(479)과 기라티나 오리진(487)이다. 그림 이름이 폼까지
    // 말해 주는 종족이 이 둘뿐이라, 굽는 모델도 `479-1`·`487-1`처럼 갈린다
    const FORMED = new Set([479, 487])
    for (const name of OVERWORLD_MON_NAMES) {
      const ref = overworldMon(name)!
      expect(ref[0]).toBeGreaterThanOrEqual(1)
      expect(ref[0]).toBeLessThanOrEqual(493)
      if (ref[1] !== 0) expect(FORMED.has(ref[0])).toBe(true)
    }
  })

  it('기라티나는 오리진과 어나더가 그림부터 갈린다', () => {
    // 깨어진 세계에서 마주치는 그것이 오리진이다 (`graphicsID 230`). 어나더는
    // 귀혼동굴 쪽(`graphicsID 160`)이라 같은 표에서 폼 번호로만 갈린다
    expect(overworldMon('GIRATINA_ORIGIN')).toEqual([487, 1])
    expect(overworldMon('GIRATINA_ALTERED')).toEqual([487, 0])
  })

  it('모르는 그림은 모델을 안 만든다 — 판때기로 남는다', () => {
    // ⚠️ 여기서 사람형 3D를 지어내던 것이 얼굴 없는 마네킹의 원인이었다
    expect(overworldMon('YOUNGSTER')).toBeNull()
    expect(overworldMon('PROF_ROWAN')).toBeNull()
    expect(overworldMon('STRENGTH_BOULDER')).toBeNull()
    expect(overworldMon('CUT_TREE')).toBeNull()
    expect(overworldMon('UNKNOWN_EVENT_ACTOR')).toBeNull()
  })
})

describe('따라다니는 마리 (상호교류광장)', () => {
  it('그림 표에 없는 열 번호가 번호로 포켓몬에 닿는다', async () => {
    const { overworldMonOfGfx } = await import('../engine/actor/overworldMon')
    // 모부기 계통 · 불꽃숭이 계통 · 팽도리 계통 · 푸린
    expect(overworldMonOfGfx(220, null)).toEqual([387, 0])
    expect(overworldMonOfGfx(225, null)).toEqual([392, 0])
    expect(overworldMonOfGfx(228, null)).toEqual([395, 0])
    expect(overworldMonOfGfx(73, null)).toEqual([39, 0])
    // 표에 있는 것은 이름이 이긴다
    expect(overworldMonOfGfx(71, 'PIKACHU')).toEqual([25, 0])
    // 그림이 있는 사람은 포켓몬이 아니다
    expect(overworldMonOfGfx(1, 'SAILOR')).toBeNull()
    expect(overworldMonOfGfx(999, null)).toBeNull()
  })
})
