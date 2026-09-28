import { describe, expect, it } from 'vitest'
import type { Beat } from '../../engine/battle/playback'
import type { Actor } from '../../engine/battle/events'
import { SFX } from '../../engine/audio/sfx'
import { TRAINER_CLASS, VICTORY } from '../../engine/audio/battleSongs'
import { markVictory } from './victoryCue'

const foe = { side: 'p2', slot: 'p2a' } as unknown as Actor
const say = (text: string): Beat => ({ text, events: [], hold: 30 })
const faint: Beat = { text: null, events: [{ kind: 'faint', actor: foe }], hold: 20, presentation: true }

describe('이긴 곡의 자리', () => {
  it('야생 — 「쓰러졌다!」 다음 줄(첫 경험치)에서 튼다', () => {
    const beats = [say('몸통박치기!'), faint, say('쓰러졌다!'), say('경험치를 얻었다!'), say('배틀에서 이겼다!')]
    markVictory(beats, { kind: 'wild', outcome: 'win', trainerClass: null, closing: 1 })
    expect(beats.map((b) => b.music ?? null)).toEqual([null, null, null, VICTORY.wild, null])
  })

  it('트레이너 — 결판 줄에서 분류의 곡', () => {
    const beats = [faint, say('쓰러졌다!'), say('경험치를 얻었다!'), say('이겼다!'), say('상금')]
    markVictory(beats, { kind: 'trainer', outcome: 'win', trainerClass: TRAINER_CLASS.leaderRoark, closing: 2 })
    expect(beats[3]!.music).toBe(VICTORY.gymLeader)
    expect(beats.filter((b) => b.music !== undefined)).toHaveLength(1)
  })

  it('포획 — 흔들림 다음 「잡았다!」에서 곡과 수납 소리', () => {
    const ball: Beat = {
      text: null, hold: 90, presentation: true,
      events: [{ kind: 'ball', actor: foe, ball: 4, shakes: 4, caught: true } as never],
    }
    const beats = [ball, say('잡았다!'), { text: null, events: [], hold: 20 }]
    markVictory(beats, { kind: 'wild', outcome: 'caught', trainerClass: null, closing: 0 })
    expect(beats[1]).toMatchObject({ music: VICTORY.wild, sound: SFX.CAUGHT })
  })

  it('지면 안 튼다', () => {
    const beats = [faint, say('쓰러졌다!')]
    markVictory(beats, { kind: 'trainer', outcome: 'loss', trainerClass: 1, closing: 0 })
    expect(beats.some((b) => b.music !== undefined)).toBe(false)
  })
})
