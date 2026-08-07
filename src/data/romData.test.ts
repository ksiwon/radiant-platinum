// 자료 게이트가 실제로 서는가 (COPYRIGHT.md §5)
//
// ⚠️ **이 장치는 "안 도는 것을 도는 것처럼 안 보이게" 하려고 있다.** 그런데
// 장치 자체가 안 돌면 그것부터가 조용한 실패다 — 평소에는 자료가 다 있어서
// **세우는 쪽 길을 아무도 안 밟기 때문이다.**
//
// 그래서 여기서 그 길을 직접 밟는다: 없는 파일을 달아 보고, 깃발을 켠 채로
// 다시 달아 본다.
import { afterEach, describe, expect, it } from 'vitest'
import {
  DATA, requireData, skippedForMissingData, withData, withDecomp, withModels,
} from './romData.testkit'

/** 어느 나무에도 없을 이름. 있으면 이 시험이 공허해진다 */
const ABSENT = '__없는 파일__.json'

const flag = process.env.PT_REQUIRE_DATA
afterEach(() => {
  if (flag === undefined) delete process.env.PT_REQUIRE_DATA
  else process.env.PT_REQUIRE_DATA = flag
})

describe('자료 게이트', () => {
  it('깃발이 없으면 조용히 건너뛴다 — 자료가 gitignore라 기본은 이쪽이다', () => {
    delete process.env.PT_REQUIRE_DATA
    expect(requireData()).toBe(false)
    const before = skippedForMissingData().length
    // 도는 쪽이 아니어야 한다. `describe.skip`과 같은지로는 못 잰다 — 매번 새
    // 함수를 내주는 체인이라 늘 다르다. (그리고 그 이름은 lint가 막는다)
    expect(withData(ABSENT)).not.toBe(describe)
    // 무엇이 빠졌는지는 남긴다 — 안 남기면 나중에 셀 방법이 없다
    expect(skippedForMissingData().length).toBe(before + 1)
    expect(skippedForMissingData().at(-1)).toContain(ABSENT)
  })

  it('깃발을 켜면 그 자리에서 선다 — 나무 셋 다', () => {
    process.env.PT_REQUIRE_DATA = '1'
    expect(requireData()).toBe(true)
    // 어느 나무가 비었는지가 메시지에 나와야 한다. 셋의 사유가 서로 다르다
    expect(() => withData(ABSENT)).toThrow(/^data:/)
    expect(() => withModels(ABSENT)).toThrow(/^models:/)
    expect(() => withDecomp(ABSENT)).toThrow(/^decomp:/)
    // 없는 파일 이름과 찾은 자리가 같이 나온다 — 그게 없으면 고칠 수가 없다
    expect(() => withData(ABSENT)).toThrow(ABSENT)
    expect(() => withData(ABSENT)).toThrow('pnpm extract')
  })

  it('있는 것만 달면 깃발과 상관없이 그대로 돈다', () => {
    // 이 파일은 리포에 있다. 없으면 위 시험들이 "늘 던진다"가 되어 뜻이 없다
    process.env.PT_REQUIRE_DATA = '1'
    expect(withData('maps.json')).toBe(describe)
    delete process.env.PT_REQUIRE_DATA
    expect(withData('maps.json')).toBe(describe)
  })

  it('여러 개를 달면 없는 것만 짚어 준다', () => {
    process.env.PT_REQUIRE_DATA = '1'
    let message = ''
    try { withData('maps.json', ABSENT) } catch (e) { message = String(e) }
    expect(message).toContain(ABSENT)
    // 있는 것까지 같이 세면 어느 것을 만들어야 하는지 흐려진다
    expect(message).not.toContain('maps.json')
  })

  it('뿌리는 계층과 상관없이 한 군데다', () => {
    // 시험마다 `resolve(__dirname, '../../public/data')`를 다시 적던 자리다.
    // 계층이 깊어질 때마다 `../`가 하나씩 어긋난다
    expect(DATA.replace(/\\/g, '/')).toMatch(/\/public\/data$/)
  })
})
