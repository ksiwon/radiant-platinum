import { describe, expect, it } from 'vitest'
import { caughtUpNow } from './useBattlePlayback'

describe('박자를 다 소화했는가 — 명령 메뉴가 뜨는 문', () => {
  it('박자가 막 들어온 렌더에는 재생기가 아직 「다 했다」여도 아니다', () => {
    // 배틀이 열리는 그 틈: 박자 넷이 왔는데 재생기는 한 걸음도 안 밟았다
    expect(caughtUpNow(true, 0, 4)).toBe(false)
  })
  it('끝까지 밟았으면 소화했다', () => {
    expect(caughtUpNow(true, 4, 4)).toBe(true)
  })
  it('재생기가 「아직」이면 박자 수와 상관없이 아직이다', () => {
    expect(caughtUpNow(false, 4, 4)).toBe(false)
  })
})
