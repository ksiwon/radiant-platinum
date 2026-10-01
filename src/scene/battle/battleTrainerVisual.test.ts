import { describe, expect, it } from 'vitest'
import { TRAINER_CLIP, trainerFallbackPalette, trainerLost } from './battleTrainerVisual'
import { applyEvents, emptyView } from '../../engine/battle/view'
import { buildBeats } from '../../engine/battle/playback'
import type { Actor, BattleEvent } from '../../engine/battle/events'
import { TRAINER_CLIPS, trainerModelBundle } from '../../engine/actor/npcModels'
import { TRAINER_CLASS_NAMES } from '../../import/platinum/trainerClasses'

const cls = (name: string): number => {
  const i = TRAINER_CLASS_NAMES.indexOf(name)
  if (i < 0) throw new Error(`모르는 갈래 ${name}`)
  return i
}

describe('배틀 트레이너의 몸', () => {
  // ⚠️ 여덟 관장은 배지 차례와 BDSP 번들 번호가 안 맞는다 (`LEADER7`이 무쇠고
  // `LEADER6`이 눈송이다). 손으로 적으면 여기서 서로 바뀌므로 사람 이름으로
  // 확인된 근거표만 본다
  it('이야기 트레이너가 제 몸으로 선다', () => {
    expect(trainerModelBundle(cls('RIVAL'))).toBe('tr0002_00')
    expect(trainerModelBundle(cls('CHAMPION_CYNTHIA'))).toBe('tr0001_00')
    expect([
      'LEADER_ROARK', 'LEADER_GARDENIA', 'LEADER_MAYLENE', 'LEADER_WAKE',
      'LEADER_FANTINA', 'LEADER_BYRON', 'LEADER_CANDICE', 'LEADER_VOLKNER',
    ].map((n) => trainerModelBundle(cls(n)))).toEqual([
      'tr1062_00', 'tr1074_00', 'tr1076_00', 'tr1075_00',
      'tr1077_00', 'tr1064_00', 'tr1078_00', 'tr1079_00',
    ])
  })

  // ⚠️ 둘 다 이름표가 `eliteM`이라, 이름표로 파일을 지으면 눈 지방 사람이
  // 평지 사람으로 선다. 번들이 갈라져 있어야 한다
  it('눈 지방 에이스 트레이너가 평지 사람과 다른 몸이다', () => {
    expect(trainerModelBundle(cls('ACE_TRAINER_MALE'))).toBe('tr1024_00')
    expect(trainerModelBundle(cls('ACE_TRAINER_SNOW_MALE'))).toBe('tr1053_00')
    expect(trainerModelBundle(cls('ACE_TRAINER_FEMALE'))).toBe('tr1025_00')
    expect(trainerModelBundle(cls('ACE_TRAINER_SNOW_FEMALE'))).toBe('tr1054_00')
  })

  it('몸이 없는 갈래는 절차형으로 대신한다', () => {
    expect(trainerModelBundle(null)).toBeNull()
    // 배틀 프론티어는 BDSP에 없다
    const frontier = cls('FACTORY_HEAD')
    expect(trainerModelBundle(frontier)).toBeNull()
    expect(trainerFallbackPalette(frontier)).toEqual(trainerFallbackPalette(frontier))
    expect(trainerFallbackPalette(frontier)).not.toEqual(trainerFallbackPalette(frontier + 1))
  })
})

describe('진 동작은 진 쪽만 한다', () => {
  // `outcome`은 **내 쪽에서 본 결말**이다. 여기를 뒤집으면 이긴 트레이너가
  // 주저앉는다 — 눈으로는 배틀이 끝난 뒤 한 번뿐이라 놓치기 쉽다
  it('내가 지면 내 트레이너가 진다', () => {
    expect(trainerLost('loss', true, true)).toBe(true)
    expect(trainerLost('loss', false, true)).toBe(false)
  })

  it('내가 이기면 상대가 진다', () => {
    expect(trainerLost('win', false, true)).toBe(true)
    expect(trainerLost('win', true, true)).toBe(false)
  })

  it('잡기·도망은 아무도 안 진다', () => {
    for (const outcome of ['caught', 'fled', 'foeFled', null] as const) {
      expect(trainerLost(outcome, true, true), `${outcome} 내 쪽`).toBe(false)
      expect(trainerLost(outcome, false, true), `${outcome} 상대 쪽`).toBe(false)
    }
  })

  // ⚠️ `outcome`은 sim이 마지막 턴을 계산한 순간 선다 — 재생기가 그 턴의 기술 글·게이지·쓰러짐을
  // 틀기 **전**이다. 그때 무너지면 상대 포켓몬이 아직 서 있는데 결과가 먼저 드러난다
  it('화면이 끝나기 전에는 이기든 지든 아무도 안 무너진다', () => {
    expect(trainerLost('win', false, false)).toBe(false)
    expect(trainerLost('loss', true, false)).toBe(false)
  })
})

describe('진 동작은 화면 뷰가 끝나는 박자에 걸린다', () => {
  const p1: Actor = { slot: 'p1a', side: 'p1', name: 'party-0' }
  const p2: Actor = { slot: 'p2a', side: 'p2', name: 'foe-0' }
  const enter = (actor: Actor): BattleEvent => ({
    kind: 'switch', actor, species: 387, speciesName: 'Turtwig', level: 5, gender: 'male', shiny: false,
    condition: { hp: 20, maxHp: 20, status: 'ok' }, forced: false,
  })
  const say = (e: BattleEvent): string | null => {
    if (e.kind === 'move') return `${e.actor.name}의 ${e.moveName}!`
    if (e.kind === 'faint') return `${e.actor.name}는 쓰러졌다!`
    if (e.kind === 'reward') return '경험치를 얻었다!'
    return null
  }

  // 마지막 턴을 재생기와 같은 박자로 접는다(`buildBeats` → `applyEvents`). 기술 글·게이지·쓰러짐·경험치
  // 줄까지는 아무도 안 무너지고, 결판 사건(`win`)을 접는 박자에서 처음 무너진다 — 이기든 지든 같은 자리다
  it.each([['win', p2, p1], ['loss', p1, p2]] as const)('%s — 마지막 쓰러짐까지는 안 무너진다', (outcome, loser, winner) => {
    const turn: BattleEvent[] = [
      enter(p1), enter(p2),
      { kind: 'move', actor: winner, move: 33, moveName: 'Tackle', target: null, miss: false, from: null },
      { kind: 'damage', actor: loser, condition: { hp: 0, maxHp: 20, status: 'ok' }, from: null },
      { kind: 'faint', actor: loser },
      ...(outcome === 'win'
        ? [{ kind: 'reward', key: 'party-0', exp: 10, levels: [], learned: [], pending: [] } as BattleEvent]
        : []),
      { kind: 'win', winner: winner.side },
    ]
    const beats = buildBeats(turn, say)
    let view = emptyView()
    const fell: boolean[] = []
    for (const beat of beats) {
      view = applyEvents(view, beat.events)
      fell.push(trainerLost(outcome, loser.side === 'p1', view.ended))
    }
    let lastFaint = -1
    beats.forEach((beat, i) => { if (beat.events.some((e) => e.kind === 'faint')) lastFaint = i })
    const winAt = beats.findIndex((b) => b.events.some((e) => e.kind === 'win'))
    expect(lastFaint).toBeGreaterThanOrEqual(0)
    expect(winAt).toBeGreaterThan(lastFaint)
    // 결판 박자 앞은 전부 거짓, 그 박자부터 참
    expect(fell.indexOf(true)).toBe(winAt)
    expect(fell.slice(0, winAt).every((x) => !x)).toBe(true)
  })
})

describe('굽는 쪽 둘이 같은 클립을 싣는다', () => {
  // ⚠️ **여기가 갈리면 개발 서버와 설치본이 다르다.** 화면이 부르는 이름이
  // 굽는 규칙에 안 맞으면 클립이 있어도 안 돈다 — 조용히 절차형으로 떨어진다
  it('화면이 부르는 이름 넷이 굽는 규칙에 맞는다', () => {
    for (const name of Object.values(TRAINER_CLIP)) {
      expect(TRAINER_CLIPS.test(name), name).toBe(true)
    }
  })

  // ⚠️ `wait_b`는 이 목록에서 빠졌다 — 돌아갈 자리가 생겨서 굽기로 했다
  // (`TRAINER_CLIPS`). 나머지 넷은 여전히 이어 붙일 자리가 없다
  it('안 굽기로 한 넷은 규칙에서 걸린다', () => {
    for (const name of ['wait02_b', 'speak01_b', 'eye01_b', 'advent02_b']) {
      expect(TRAINER_CLIPS.test(name), name).toBe(false)
    }
  })

  /**
   * ⚠️ **쉬는 동작이 없으면 트레이너가 굳는다.** 등장 클립이 4.13초인데 배틀은
   * 몇 분이라, 나머지 시간 내내 마지막 자세 그대로 서 있었다 — 움직이는 것이
   * 1.2cm짜리 사인파 하나였다
   */
  it('쉬는 동작이 굽는 규칙에 든다', () => {
    expect(TRAINER_CLIPS.test(TRAINER_CLIP.wait)).toBe(true)
  })
})
