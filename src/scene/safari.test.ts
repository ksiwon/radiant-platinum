// 대습초원 열차 (`scene/safari.ts`) — 타고 가는 도중에 구역이 바뀌어도 이동이 끊기지 않는다
import { beforeEach, describe, expect, it } from 'vitest'
import { TRAM_STOP_Z } from '../engine/world/safari'
import { useSaveStore } from '../state/saveStore'
import { worldState } from '../state/worldState'
import { resetTram, safariServices, stepTram, tramSettled } from './safari'

describe('습초원 열차', () => {
  beforeEach(() => {
    resetTram()
    useSaveStore.setState({ safari: { ...useSaveStore.getState().safari, tram: 0 } })
  })

  it('⚠️ 타고 가는 중에 초기화 스크립트가 다시 돌아도 이동을 안 끊는다', () => {
    // 열차가 구역 경계를 넘으면 맵이 바뀌고 `SafariGame_InitTram`이 다시 돈다 — 그때 이동이 null이 되면
    // 열차가 도착 자리로 튀고 주인공이 경계에 멈춘다
    safariServices.moveTram(1, 4)
    expect(tramSettled()).toBe(false)
    stepTram(1)
    safariServices.initTram()
    expect(tramSettled()).toBe(false)
  })

  it('타고 가는 열차가 주인공을 같이 데려가 도착 정거장 앞에 세운다', () => {
    safariServices.moveTram(1, 4)
    const start = TRAM_STOP_Z[0]!
    worldState.player.position.z = start
    for (let i = 0; i < 400 && !tramSettled(); i++) {
      stepTram(0.1)
      if (i === 5) safariServices.initTram()
    }
    expect(tramSettled()).toBe(true)
    // 열차 z에서 반 칸 앞 — 정거장 이벤트(z 80) 바로 아래 칸(81)
    expect(worldState.player.position.z).toBeCloseTo(TRAM_STOP_Z[1]! - 0.5, 5)
  })
})
