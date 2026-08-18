// 배틀 빠르기가 무엇에 걸리고 무엇에 안 걸리는가.
//
// 설정의 빠르기는 **머무름·게이지·기절**에 거는 값이다 (`optionsStore`의
// `BATTLE_PACE` 머리말). 연출 길이는 그 목록에 없다 — 무대가 도는 시간이라
// 여기서 줄이면 화면과 어긋난다.
//
// ⚠️ 한동안 `beat.hold`를 가리지 않고 곱하고 있었다. 기술 박자의 쉼도 `hold`라서
// 기본값 0.5에서 **40프레임짜리 연출이 20프레임에 잘렸다** — 포켓몬이 아직 때리러
// 나가 있는데 게이지가 닳고 「효과가 굉장했다!」가 떴다. 그 자리를 못박는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Actor, BattleEvent } from '../../engine/battle/events'
import { buildBeats } from '../../engine/battle/playback'
import { MOVE_FRAMES } from '../../engine/battle/vfx'
import { beatFrames } from './useBattlePlayback'
import { BATTLE_PACE } from '../../state/optionsStore'

const p1: Actor = { slot: 'p1a', side: 'p1', name: '모부기' }
const p2: Actor = { slot: 'p2a', side: 'p2', name: '이상해씨' }

const move = (actor: Actor, name: string): BattleEvent => ({
  kind: 'move', actor, move: 33, moveName: name, target: null, miss: false, from: null,
})
const hit = (actor: Actor, hp: number, maxHp: number): BattleEvent => ({
  kind: 'damage', actor, condition: { hp, maxHp, status: 'ok' }, from: null,
})
const eff = (actor: Actor): BattleEvent => ({ kind: 'effectiveness', actor, level: 'super' })

const say = (e: BattleEvent): string | null => {
  if (e.kind === 'move') return `${e.actor.name}의 ${e.moveName}!`
  if (e.kind === 'effectiveness') return '효과가 굉장했다!'
  if (e.kind === 'faint') return `${e.actor.name}는 쓰러졌다!`
  return null
}

/** 빠른 쪽이 먼저 치고 느린 쪽이 받아치는 한 턴 */
const TURN: BattleEvent[] = [
  { kind: 'turn', turn: 1 },
  move(p1, '몸통박치기'), eff(p2), hit(p2, 12, 20),
  move(p2, '덩굴채찍'), eff(p1), hit(p1, 9, 20),
]

const beats = buildBeats(TURN, say)
const animAt = beats.findIndex((b) => b.events.some((e) => e.kind === 'move'))

describe('연출 박자는 빠르기를 안 탄다', () => {
  it('어느 설정에서도 `MOVE_FRAMES` 그대로다', () => {
    const beat = beats[animAt]
    expect(beat, '기술 박자가 없다').toBeDefined()
    for (const scale of BATTLE_PACE) {
      expect(beatFrames(beat!, scale).hold, `빠르기 ${String(scale)}에서 잘렸다`)
        .toBe(MOVE_FRAMES)
    }
  })

  it('⚠️ 무대가 도는 시간과 같은 상수를 본다', () => {
    // 이 둘이 어긋나면 연출이 잘리거나 다 끝나고도 화면이 멈춰 있다.
    // 상수가 파일 안에 갇혀 있어 값을 못 부르므로 **원문으로** 붙잡는다
    const root = resolve(__dirname, '../../scene/battle')
    for (const file of ['BattleStage.tsx', 'MoveVfx.tsx']) {
      const src = readFileSync(resolve(root, file), 'utf8')
      expect(src, `${file}이 연출 길이를 따로 잡고 있다`).toContain('MOVE_FRAMES / 60')
    }
  })

  it('그 박자는 글을 안 바꾼다 — 기술 이름이 뜬 채로 연출이 돈다', () => {
    expect(beats[animAt]?.text).toBeNull()
    expect(beats[animAt - 1]?.text).toBe('모부기의 몸통박치기!')
  })
})

describe('머무름·게이지·읽는 시간은 빠르기를 탄다', () => {
  const effBeat = beats.find((b) => b.text === '효과가 굉장했다!')

  it('글 박자가 설정대로 줄어든다', () => {
    expect(effBeat, '효과 줄이 없다').toBeDefined()
    const full = beatFrames(effBeat!, 1)
    const half = beatFrames(effBeat!, 0.5)
    expect(half.hold).toBeLessThan(full.hold)
    expect(half.wait).toBeLessThan(full.wait)
  })

  it('읽는 시간은 게이지 길이에 안 든다', () => {
    // `hold`는 게이지가 닳는 프레임 수라 원작 값 그대로여야 한다
    expect(effBeat, '효과 줄이 없다').toBeDefined()
    const { hold, wait } = beatFrames(effBeat!, 1)
    expect(wait).toBeGreaterThan(hold)
  })

  it('글이 없는 박자는 읽는 시간이 0이다', () => {
    const silent = beats.find((b) => b.text === null && b.hold > 0 && !b.events.some((e) => e.kind === 'move'))
    expect(silent, '글 없는 쉼 박자가 없다').toBeDefined()
    const { hold, wait } = beatFrames(silent!, 1)
    expect(wait).toBe(hold)
  })
})

describe('한 턴의 차례가 겹치지 않는다', () => {
  it('기술 → 연출 → 게이지 → 효과, 그것을 두 쪽이 차례로 한다', () => {
    // ⚠️ **효과 줄이 게이지 뒤다.** 원작 스크립트가 `UPDATE_HP` →
    // `CRITICAL_HIT` → `MOVE_FOLLOWUP_MESSAGE` 순이라 체력이 먼저 닳고
    // 「효과가 굉장했다!」가 그 뒤에 온다
    const shape = beats.map((b) =>
      b.events.some((e) => e.kind === 'move') ? '연출'
        : b.events.some((e) => e.kind === 'damage') ? '게이지'
          : b.text === '효과가 굉장했다!' ? '효과'
            : b.text !== null ? '기술' : '조용')
    // 조용한 박자(턴 표시 등)는 화면에 안 나타나므로 뺀다
    expect(shape.filter((s) => s !== '조용')).toEqual([
      '기술', '연출', '게이지', '효과',
      '기술', '연출', '게이지', '효과',
    ])
  })

  it('앞 박자가 끝나기 전에 다음 글이 안 뜬다', () => {
    // 재생기는 `wait`이 0이 돼야 다음 박자로 간다. 글을 새로 올리는 박자마다
    // 그 앞이 쓰는 프레임이 있어야 한다 — 0이면 두 글이 같은 프레임에 뜬다
    for (const scale of BATTLE_PACE) {
      const spans = beats.map((b) => beatFrames(b, scale).wait)
      for (const [at, b] of beats.entries()) {
        if (b.text === null || at === 0) continue
        const before = beats[at - 1]!
        if (before.text === null) continue
        expect(spans[at - 1], `${String(before.text)} 다음이 같은 프레임에 떴다 (빠르기 ${String(scale)})`)
          .toBeGreaterThan(0)
      }
    }
  })
})
