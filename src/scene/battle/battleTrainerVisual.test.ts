import { describe, expect, it } from 'vitest'
import { TRAINER_CLIP, trainerFallbackPalette, trainerLost } from './battleTrainerVisual'
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
    expect(trainerLost('loss', true)).toBe(true)
    expect(trainerLost('loss', false)).toBe(false)
  })

  it('내가 이기면 상대가 진다', () => {
    expect(trainerLost('win', false)).toBe(true)
    expect(trainerLost('win', true)).toBe(false)
  })

  it('잡기·도망은 아무도 안 진다', () => {
    for (const outcome of ['caught', 'fled', 'foeFled', null] as const) {
      expect(trainerLost(outcome, true), `${outcome} 내 쪽`).toBe(false)
      expect(trainerLost(outcome, false), `${outcome} 상대 쪽`).toBe(false)
    }
  })
})

describe('굽는 쪽 둘이 같은 클립을 싣는다', () => {
  // ⚠️ **여기가 갈리면 개발 서버와 설치본이 다르다.** 화면이 부르는 이름이
  // 굽는 규칙에 안 맞으면 클립이 있어도 안 돈다 — 조용히 절차형으로 떨어진다
  it('화면이 부르는 이름 셋이 굽는 규칙에 맞는다', () => {
    for (const name of Object.values(TRAINER_CLIP)) {
      expect(TRAINER_CLIPS.test(name), name).toBe(true)
    }
  })

  it('안 굽기로 한 다섯은 규칙에서 걸린다', () => {
    for (const name of ['wait_b', 'wait02_b', 'speak01_b', 'eye01_b', 'advent02_b']) {
      expect(TRAINER_CLIPS.test(name), name).toBe(false)
    }
  })
})
