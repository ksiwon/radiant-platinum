import { describe, expect, it } from 'vitest'
import { trainerFallbackPalette } from './battleTrainerVisual'
import { trainerModelBundle } from '../../engine/actor/npcModels'
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
