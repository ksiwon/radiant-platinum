// 화면 흔들림 (`ScrCmd_29F` · `fieldQuake.ts`) — 원작 상태기계(`ov6_0223FE9C`)의 차례와 길이
import { describe, expect, it } from 'vitest'
import { quakeDone, quakeFrames, quakeOffset, quakeTick, SE_QUAKE_RUMBLE, SE_QUAKE_START, startQuake } from './fieldQuake'

describe('화면 흔들림', () => {
  it('0번 — 진폭 2를 +·0·−·0으로 열여섯 번, 한 칸이 1/8타일', () => {
    const f = quakeFrames(0)
    expect(f).toHaveLength(1 + 16 * 4)
    expect(f.slice(1, 5).map((x) => x.x)).toEqual([2 / 16, 0, -2 / 16, 0])
    expect(Math.max(...f.map((x) => Math.abs(x.x)))).toBe(2 / 16)
  })

  it('1번 — 진폭 4에서 한 번마다 1/8씩 줄며 스물네 번', () => {
    const f = quakeFrames(1)
    const shake = f.filter((x) => x.x > 0).map((x) => x.x * 16)
    expect(shake).toHaveLength(24)
    expect(shake[0]).toBe(4)
    expect(shake[1]).toBeCloseTo(3.5, 10)
    expect(shake[23]).toBeCloseTo(4 * (7 / 8) ** 23, 10)
  })

  it('소리 — 시작 효과음, 1번은 배경음을 줄였다가 우르릉을 틀고 끊고 되올린다', () => {
    const log: string[] = []
    const sound = {
      playEffect: (s: number) => { log.push(`play ${String(s)}`) },
      stopEffect: (s: number) => { log.push(`stop ${String(s)}`) },
      fadeVolume: (v: number, n: number) => { log.push(`fade ${String(v)}/${String(n)}`) },
    }
    startQuake(1, sound)
    let frames = 0
    while (!quakeDone() && frames < 1000) { quakeTick(1 / 60); frames++ }
    expect(frames).toBe(quakeFrames(1).length)
    expect(log).toEqual([
      `play ${String(SE_QUAKE_START)}`, 'fade 0/1', `play ${String(SE_QUAKE_RUMBLE)}`, `stop ${String(SE_QUAKE_RUMBLE)}`, 'fade 127/16',
    ])
    expect(quakeOffset()).toBe(0)
  })
})
