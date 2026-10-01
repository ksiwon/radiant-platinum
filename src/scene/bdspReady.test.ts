// BDSP 층 준비 표 (`bdspReady`) — 워프 덮개가 BDSP glb까지 기다리게 하는 자리
//
// ⚠️ **여기서 지키는 것은 「덮개에 갇히지 않는다」이다.** 실패도 섰다로 세고, 뗀 것은 지운다 — 안 그러면 못 받은 glb 하나가
// 덮개를 영영 붙든다
import { afterEach, describe, expect, it } from 'vitest'
import {
  bdspReady, bdspSettled, bdspVersion, DRAWN_FRAMES, expectBdsp, forgetBdsp, markBdspFailed, markBdspReady,
  resetBdspReady, subscribeBdsp,
} from './bdspReady'

afterEach(() => { resetBdspReady() })

describe('BDSP 준비 표', () => {
  it('기다릴 것이 없으면 섰다', () => {
    expect(bdspSettled()).toBe(true)
    expectBdsp([])
    expect(bdspSettled()).toBe(true)
  })

  it('알린 열쇠가 다 서야 섰다 — 방 · 지역 둘을 기다리면 둘 다', () => {
    expectBdsp(['area001', 'area002'])
    expect(bdspSettled()).toBe(false)
    markBdspReady('area001')
    expect(bdspSettled()).toBe(false)
    markBdspReady('area002')
    expect(bdspSettled()).toBe(true)
    expect(bdspReady('area002')).toBe(true)
  })

  it('실패도 섰다로 센다 — 못 받은 glb가 덮개를 붙들지 않는다', () => {
    expectBdsp(['c01r0101'])
    markBdspFailed('c01r0101')
    expect(bdspSettled()).toBe(true)
    // 실패는 「그려지고 있다」가 아니다 — 원작 지형을 숨길 까닭이 없다
    expect(bdspReady('c01r0101')).toBe(false)
  })

  it('뗀 것은 지운다 — 다시 붙으면 다시 적어야 한다', () => {
    markBdspReady('d27r0101')
    forgetBdsp('d27r0101')
    expectBdsp(['d27r0101'])
    expect(bdspSettled()).toBe(false)
  })

  it('알린 목록 밖의 것은 기다리지 않는다', () => {
    expectBdsp(['area001'])
    markBdspReady('area001')
    markBdspReady('area009')
    forgetBdsp('area009')
    expect(bdspSettled()).toBe(true)
  })

  it('바뀔 때만 알린다 — 같은 목록 · 같은 표시는 조용하다', () => {
    let calls = 0
    const off = subscribeBdsp(() => { calls++ })
    const v0 = bdspVersion()
    expectBdsp(['area002', 'area001'])
    expectBdsp(['area001', 'area002', 'area001'])
    markBdspReady('area001')
    markBdspReady('area001')
    off()
    markBdspReady('area002')
    expect(calls).toBe(2)
    expect(bdspVersion() - v0).toBe(3)
  })

  it('붙은 프레임에는 안 적는다 — 한 번 그린 뒤다', () => {
    expect(DRAWN_FRAMES).toBe(2)
  })
})
