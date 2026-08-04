// AI가 참조하는 롬 상수 대조.
//
// 이 파일의 숫자는 전부 손으로 옮긴 것이라 오타가 조용히 숨는다 — 특성 번호가
// 하나 어긋나면 AI가 부유를 못 보고 땅 기술을 계속 쓰는데, 배틀은 멀쩡히 돌아가서
// 아무도 모른다. 그래서 **다른 출처**와 맞춰 본다: 특성·소리 기술은 @pkmn의 4세대
// 덱스, 효과 번호는 우리 기술 데이터.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { moveFileSchema, type Move } from '../../../data/schema'
import { romAbility } from '../sim/bridge'
import { gen4 } from '../sim/bridge'
import {
  ABILITY, ALT_POWER, EFFECT, NO_DAMAGE_CALC, RISKY_EFFECTS, SETUP_EFFECTS, SOUND_MOVES,
} from './rom'

const moves: Move[] = moveFileSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, '../../../../public/data/moves.json'), 'utf8')),
).moves
const byId = new Map(moves.map((m) => [m.id, m]))
const koNames: string[] = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../public/data/names/moves.ko.json'), 'utf8'),
) as string[]

/** 우리가 쓰는 번호 → sim이 부르는 이름. 대조의 기준이 되는 짝이다 */
const ABILITY_NAMES: Record<keyof typeof ABILITY, string | null> = {
  NONE: null,
  SPEED_BOOST: 'Speed Boost',
  STURDY: 'Sturdy',
  DAMP: 'Damp',
  LIMBER: 'Limber',
  VOLT_ABSORB: 'Volt Absorb',
  WATER_ABSORB: 'Water Absorb',
  OBLIVIOUS: 'Oblivious',
  INSOMNIA: 'Insomnia',
  IMMUNITY: 'Immunity',
  FLASH_FIRE: 'Flash Fire',
  OWN_TEMPO: 'Own Tempo',
  SUCTION_CUPS: 'Suction Cups',
  SHADOW_TAG: 'Shadow Tag',
  WONDER_GUARD: 'Wonder Guard',
  LEVITATE: 'Levitate',
  CLEAR_BODY: 'Clear Body',
  NATURAL_CURE: 'Natural Cure',
  WATER_VEIL: 'Water Veil',
  MAGNET_PULL: 'Magnet Pull',
  SOUNDPROOF: 'Soundproof',
  THICK_FAT: 'Thick Fat',
  KEEN_EYE: 'Keen Eye',
  HYPER_CUTTER: 'Hyper Cutter',
  GUTS: 'Guts',
  ARENA_TRAP: 'Arena Trap',
  VITAL_SPIRIT: 'Vital Spirit',
  WHITE_SMOKE: 'White Smoke',
  MOTOR_DRIVE: 'Motor Drive',
  SIMPLE: 'Simple',
  DRY_SKIN: 'Dry Skin',
  POISON_HEAL: 'Poison Heal',
  HYDRATION: 'Hydration',
  MAGIC_GUARD: 'Magic Guard',
  NO_GUARD: 'No Guard',
  LEAF_GUARD: 'Leaf Guard',
  MOLD_BREAKER: 'Mold Breaker',
}

describe('특성 번호', () => {
  it('서른여섯 개가 전부 @pkmn 4세대 덱스와 같은 번호다', () => {
    const bad: string[] = []
    for (const [key, name] of Object.entries(ABILITY_NAMES)) {
      if (name === null) continue
      const want = romAbility(name)
      const got = ABILITY[key as keyof typeof ABILITY]
      if (want !== got) bad.push(`${key}(${name}): 우리 ${got} ≠ sim ${want ?? '없음'}`)
    }
    expect(bad).toEqual([])
  })

  it('없음은 0이다', () => {
    // 0이 아니면 "특성 없음"이 실제 특성 하나를 가리키게 되어 판정이 뒤집힌다
    expect(ABILITY.NONE).toBe(0)
  })
})

describe('소리 기술', () => {
  const simSound = new Set<number>()
  for (const m of gen4.moves.all()) {
    if (m.num > 0 && m.num <= 467 && m.flags.sound) simSound.add(m.num)
  }

  it('열한 개가 전부 진짜 소리 기술이다', () => {
    // 하나라도 소리가 아닌 게 섞이면 AI가 안 막히는 기술을 막힌다고 착각한다
    const notSound = [...SOUND_MOVES].filter((id) => !simSound.has(id))
    expect(notSound).toEqual([])
  })

  it('원작 AI가 빠뜨린 세 개도 그대로 빠뜨린다', () => {
    // 4세대 방음은 열네 개를 막는데 **AI 스크립트는 열한 개만 확인한다.**
    // 고치면 원작보다 똑똑해진다 — 멸망의노래를 방음 상대에게 쓰는 것이 원작이다
    const missing = [...simSound].filter((id) => !SOUND_MOVES.has(id)).sort((a, b) => a - b)
    expect(missing).toEqual([195, 215, 304]) // 멸망의노래 · 치료방울 · 하이퍼보이스
    expect(SOUND_MOVES.size).toBe(11)
  })
})

describe('기술 효과 번호', () => {
  it('이름이 붙은 상수가 실제 기술을 가리킨다', () => {
    // 대표 기술 하나씩 찍어 본다. 번호가 밀리면 여기서 다른 기술이 나온다
    const cases: [number, number, string][] = [
      [EFFECT.HALVE_DEFENSE, 153, '대폭발'],
      [EFFECT.ONE_HIT_KO, 90, '땅가르기'],
      [EFFECT.STATUS_LEECH_SEED, 73, '씨뿌리기'],
      [EFFECT.REST, 156, '잠자기'],
      [EFFECT.RESTORE_HALF_HP, 105, 'HP회복'],
      [EFFECT.SET_REFLECT, 115, '리플렉터'],
      [EFFECT.SET_LIGHT_SCREEN, 113, '빛의장막'],
      [EFFECT.STATUS_PARALYZE, 86, '전기자석파'],
      [EFFECT.MAX_ATK_LOSE_HALF_MAX_HP, 187, '배북'],
      [EFFECT.MAGNITUDE, 222, '매그니튜드'],
      [EFFECT.HIT_FIRST_IF_TARGET_ATTACKING, 389, '기습'],
      [EFFECT.LOWER_OWN_ATK_AND_DEF, 276, '엄청난힘'],
      [EFFECT.RECOIL_QUARTER, 36, '돌진'],
      [EFFECT.HIGH_CRITICAL, 238, '크로스촙'],
    ]
    const bad: string[] = []
    for (const [effect, moveId, label] of cases) {
      const move = byId.get(moveId)
      if (!move) {
        bad.push(`${label}(#${moveId})가 데이터에 없다`)
        continue
      }
      if (move.effect !== effect) {
        bad.push(`${label}: 효과 ${move.effect}(${koNames[moveId]}) ≠ 상수 ${effect}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('효과 표의 번호가 전부 열거형 범위 안이다', () => {
    // 열거형은 277개다. 범위를 넘으면 "아무 기술도 안 걸리는 표"가 되어 조용히 무시된다.
    //
    // "실제로 쓰는 기술이 있는가"까지는 안 본다 — 4세대에는 단독 SPEED_UP(12)이나
    // ACC_UP_2(55)를 가진 기술이 없는데도 원작 표에는 들어 있다. 후속작을 위한
    // 자리이거나 그냥 넉넉히 적어 둔 것이고, 어느 쪽이든 원본을 따르는 게 맞다
    const MAX_EFFECT = 276
    const tables: [string, ReadonlySet<number>][] = [
      ['NO_DAMAGE_CALC', NO_DAMAGE_CALC],
      ['ALT_POWER', ALT_POWER],
      ['SETUP_EFFECTS', SETUP_EFFECTS],
      ['RISKY_EFFECTS', RISKY_EFFECTS],
    ]
    const bad: string[] = []
    for (const [name, table] of tables) {
      for (const e of table) {
        if (e < 0 || e > MAX_EFFECT) bad.push(`${name}: ${e}는 효과 번호 범위 밖이다`)
      }
    }
    expect(bad).toEqual([])
    // 실재 확인은 데미지 계산에 직접 쓰이는 두 표에만 건다. 이 둘은 기술이
    // 반드시 있어야 의미가 있다
    const used = new Set(moves.map((m) => m.effect))
    for (const e of NO_DAMAGE_CALC) expect(used.has(e), `NO_DAMAGE_CALC ${e}`).toBe(true)
    for (const e of ALT_POWER) expect(used.has(e), `ALT_POWER ${e}`).toBe(true)
  })

  it('표의 크기가 원작과 같다', () => {
    // 옮기다 한 줄 빠뜨리는 것을 막는다. 값은 디컴프 원본을 센 것이다
    expect(NO_DAMAGE_CALC.size, 'sNoDamageCalcMoveEffects').toBe(13)
    expect(ALT_POWER.size, 'sAltPowerMoveEffects').toBe(11)
    expect(SETUP_EFFECTS.size, 'SetupFirstTurn_SetupEffects (중복 둘 제외)').toBe(59)
    expect(RISKY_EFFECTS.size, 'Risky_RiskyEffects').toBe(25)
  })

  it('두 표는 겹치지 않는다', () => {
    // 원작 판정이 "ALT_POWER면 무조건 계산, 아니면 NO_DAMAGE_CALC를 본다" 순서라
    // 겹치면 어느 쪽으로 읽히는지가 순서에 좌우된다
    const both = [...ALT_POWER].filter((e) => NO_DAMAGE_CALC.has(e))
    expect(both).toEqual([])
  })
})
