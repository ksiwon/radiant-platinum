// 폼 (PARITY §3.4)
//
// **재는 것 여섯:**
//
//   ① 폼 수와 접기가 `Pokemon_SanitizeFormId` 그대로다
//   ② 폼 → 종족 자료 번호가 실제 자료와 맞는다 (도롱마담 쓰레기의 방어가 95다)
//   ③ 아이콘 칸 번호가 `PokeIconSpriteIndex` 그대로다 — 아틀라스 540칸 안에
//   ④ 도롱마담 옷감이 원작 `switch`와 같다. **눈밭이 풀인 것**까지
//   ⑤ 폼마다 다른 타입이 종족 자료가 아니라 규칙에서 온다
//   ⑥ 갈아입힐 때 로토무 기술칸과 현재 HP가 원작처럼 움직인다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withData } from '../../data/romData.testkit'
import { Terrain } from '../battle/terrain'
import {
  arceusForm, BURMY_PLANT, BURMY_SAND, BURMY_TRASH, burmyCloak, canShayminSky, changeForm,
  CASTFORM_TYPE, formCount, formSpeciesId, formTypes, giratinaForm, GIRATINA_ORIGIN,
  ICON_MANAPHY_EGG, ICON_SLOTS, iconSlot, ITEM_GRISEOUS_ORB, MOVE_THUNDER_SHOCK,
  ROTOM_FORM_MOVES,
  sanitizeForm, shayminMustLand, SPECIES_ARCEUS, SPECIES_BURMY, SPECIES_CASTFORM,
  SPECIES_DEOXYS, SPECIES_EGG, SPECIES_GASTRODON, SPECIES_GIRATINA, SPECIES_MANAPHY,
  SPECIES_ROTOM, SPECIES_SHAYMIN, SPECIES_SHELLOS, SPECIES_UNOWN, SPECIES_WORMADAM,
} from './form'
import { noOrigin } from './origin'
import type { PokemonInstance } from './instance'

describe('폼 수와 접기', () => {
  it('열세 종만 폼이 있다', () => {
    expect(formCount(SPECIES_UNOWN)).toBe(28)
    expect(formCount(SPECIES_ARCEUS)).toBe(18)
    expect(formCount(SPECIES_ROTOM)).toBe(6)
    expect(formCount(SPECIES_EGG)).toBe(2)
    // 모부기는 폼이 없다
    expect(formCount(387)).toBe(1)
  })

  it('⚠️ 넘치면 자르는 게 아니라 0으로 돌아간다', () => {
    // 로토무 7을 5로 자르면 잔디깎이가 된다. 원작은 보통 모습으로 돌린다
    expect(sanitizeForm(SPECIES_ROTOM, 7)).toBe(0)
    expect(sanitizeForm(SPECIES_ROTOM, 5)).toBe(5)
    expect(sanitizeForm(387, 1)).toBe(0)
    expect(sanitizeForm(SPECIES_UNOWN, -1)).toBe(0)
  })
})

describe('폼 → 종족 자료 번호', () => {
  it('`Pokemon_GetFormNarcIndex` 그대로다', () => {
    expect(formSpeciesId(SPECIES_DEOXYS, 1)).toBe(496)
    expect(formSpeciesId(SPECIES_DEOXYS, 3)).toBe(498)
    expect(formSpeciesId(SPECIES_WORMADAM, 1)).toBe(499)
    expect(formSpeciesId(SPECIES_WORMADAM, 2)).toBe(500)
    expect(formSpeciesId(SPECIES_GIRATINA, 1)).toBe(501)
    expect(formSpeciesId(SPECIES_SHAYMIN, 1)).toBe(502)
    expect(formSpeciesId(SPECIES_ROTOM, 5)).toBe(507)
  })

  it('제 칸이 없는 폼은 기본형 칸을 쓴다', () => {
    // 안농 스물여덟 글자도, 캐스퐁 넷도 종족 자료가 하나다
    expect(formSpeciesId(SPECIES_UNOWN, 27)).toBe(SPECIES_UNOWN)
    expect(formSpeciesId(SPECIES_CASTFORM, 3)).toBe(SPECIES_CASTFORM)
    expect(formSpeciesId(SPECIES_SHELLOS, 1)).toBe(SPECIES_SHELLOS)
    expect(formSpeciesId(SPECIES_ARCEUS, 17)).toBe(SPECIES_ARCEUS)
  })
})

withData('species.json')('그 칸에 실제로 다른 수치가 있다', () => {
  const file = JSON.parse(
    readFileSync(resolve(__dirname, '../../../public/data/species.json'), 'utf8'),
  ) as { species: { id: number, stats: { def: number, spe: number }, types: number[] }[] }
  const byId = new Map(file.species.map((s) => [s.id, s]))
  const at = (species: number, form: number) => byId.get(formSpeciesId(species, form))

  it('도롱마담 쓰레기는 방어가 95다 (풀은 85)', () => {
    expect(at(SPECIES_WORMADAM, 0)?.stats.def).toBe(85)
    expect(at(SPECIES_WORMADAM, 2)?.stats.def).toBe(95)
    // 타입도 다르다 — 벌레/강철
    expect(at(SPECIES_WORMADAM, 2)?.types).toEqual([6, 8])
  })

  it('기라티나 오리진은 공격이 120이고 방어가 100이다', () => {
    expect(at(SPECIES_GIRATINA, 1)?.stats.def).toBe(100)
    expect(at(SPECIES_SHAYMIN, 1)?.stats.spe).toBe(127)
  })
})

describe('아이콘 칸', () => {
  it('`PokeIconSpriteIndex` 그대로다', () => {
    expect(iconSlot(SPECIES_UNOWN, 0, false)).toBe(SPECIES_UNOWN)
    expect(iconSlot(SPECIES_UNOWN, 1, false)).toBe(500)
    expect(iconSlot(SPECIES_UNOWN, 27, false)).toBe(526)
    expect(iconSlot(SPECIES_BURMY, 1, false)).toBe(527)
    expect(iconSlot(SPECIES_WORMADAM, 2, false)).toBe(530)
    expect(iconSlot(SPECIES_SHELLOS, 1, false)).toBe(531)
    expect(iconSlot(SPECIES_GASTRODON, 1, false)).toBe(532)
    expect(iconSlot(SPECIES_GIRATINA, 1, false)).toBe(533)
    expect(iconSlot(SPECIES_SHAYMIN, 1, false)).toBe(534)
    expect(iconSlot(SPECIES_ROTOM, 5, false)).toBe(539)
    expect(iconSlot(SPECIES_ROTOM, 5, false)).toBeLessThan(ICON_SLOTS)
  })

  it('⚠️ 폼 아이콘이 없는 종은 폼이 달라도 같은 칸이다', () => {
    // 캐스퐁·체리버·아르세우스가 그렇다 — 그림만 다르고 아이콘은 하나다
    expect(iconSlot(SPECIES_CASTFORM, 3, false)).toBe(SPECIES_CASTFORM)
    expect(iconSlot(SPECIES_ARCEUS, 10, false)).toBe(SPECIES_ARCEUS)
  })

  it('⚠️ 알이 먼저다 — 안에 든 것이 새면 안 된다', () => {
    expect(iconSlot(SPECIES_MANAPHY, 0, true)).toBe(ICON_MANAPHY_EGG)
    expect(iconSlot(SPECIES_ROTOM, 3, true)).toBe(SPECIES_EGG)
  })
})

describe('언제 바뀌는가', () => {
  it('도롱마담 옷감은 싸운 땅이 정한다', () => {
    expect(burmyCloak(Terrain.GRASS)).toBe(BURMY_PLANT)
    expect(burmyCloak(Terrain.CAVE)).toBe(BURMY_SAND)
    expect(burmyCloak(Terrain.DISTORTION_WORLD)).toBe(BURMY_SAND)
    expect(burmyCloak(Terrain.BUILDING)).toBe(BURMY_TRASH)
    expect(burmyCloak(Terrain.CYNTHIA)).toBe(BURMY_TRASH)
  })

  it('⚠️ 눈·물·얼음·웅덩이·대습원은 풀이다', () => {
    // 원작 `switch`가 그 다섯을 안 적어 두고 `default`(= 풀)로 흘린다
    for (const t of [
      Terrain.SNOW, Terrain.WATER, Terrain.ICE, Terrain.PUDDLE, Terrain.GREAT_MARSH,
    ]) {
      expect(burmyCloak(t), `땅 ${String(t)}`).toBe(BURMY_PLANT)
    }
  })

  it('기라티나는 백금옥을 들었을 때만 오리진이다', () => {
    expect(giratinaForm(ITEM_GRISEOUS_ORB)).toBe(GIRATINA_ORIGIN)
    expect(giratinaForm(0)).toBe(0)
  })

  it('로토무 폼마다 기술이 하나씩 딸려 온다', () => {
    expect(ROTOM_FORM_MOVES).toHaveLength(6)
    expect(ROTOM_FORM_MOVES[0]).toBe(0)
    expect(new Set(ROTOM_FORM_MOVES.slice(1)).size).toBe(5)
  })

  it('아르세우스는 플레이트의 타입이 곧 폼이다', () => {
    expect(arceusForm(126)).toBe(10) // 불꽃
    expect(arceusForm(141)).toBe(8) // 강철
    expect(arceusForm(0)).toBe(0) // 플레이트가 아니면 노말
  })
})

describe('쉐이미', () => {
  const shaymin = (over: Record<string, unknown> = {}) => ({
    species: SPECIES_SHAYMIN,
    form: 0,
    hp: 100,
    status: 'ok',
    origin: { ...noOrigin({ name: '나', gender: 'male' as const }), fateful: true },
    ...over,
  })

  it('낮이고 멀쩡하고 운명적인 만남이면 그라시데아가 걸린다', () => {
    expect(canShayminSky(shaymin(), 12)).toBe(true)
  })

  it('⚠️ 다섯 가운데 하나만 어긋나도 안 걸린다', () => {
    expect(canShayminSky(shaymin(), 21)).toBe(false) // 밤
    expect(canShayminSky(shaymin(), 3)).toBe(false) // 새벽 4시 전
    expect(canShayminSky(shaymin({ hp: 0 }), 12)).toBe(false)
    expect(canShayminSky(shaymin({ status: 'frz' }), 12)).toBe(false)
    expect(canShayminSky(shaymin({ form: 1 }), 12)).toBe(false)
    const wild = shaymin()
    wild.origin = { ...wild.origin, fateful: false }
    expect(canShayminSky(wild, 12)).toBe(false)
  })

  it('20시부터 4시까지는 랜드로 돌아간다', () => {
    expect(shayminMustLand(20)).toBe(true)
    expect(shayminMustLand(3)).toBe(true)
    expect(shayminMustLand(19)).toBe(false)
    expect(shayminMustLand(4)).toBe(false)
  })
})

describe('폼마다 다른 타입', () => {
  it('캐스퐁은 날씨 타입, 아르세우스는 폼 번호가 곧 타입이다', () => {
    expect(CASTFORM_TYPE).toEqual([0, 10, 11, 15])
    expect(formTypes(SPECIES_CASTFORM, 1)).toEqual([10, 10])
    expect(formTypes(SPECIES_ARCEUS, 16)).toEqual([16, 16])
  })

  it('종족 자료에서 오는 폼은 여기서 답하지 않는다', () => {
    expect(formTypes(SPECIES_WORMADAM, 2)).toBeNull()
    expect(formTypes(SPECIES_CASTFORM, 0)).toBeNull()
  })
})

describe('갈아입기', () => {
  const HP = 100
  const tables = { maxHp: () => HP, maxPp: (move: number) => (move === MOVE_THUNDER_SHOCK ? 30 : 5) }
  const rotom = (moves: number[]): PokemonInstance => ({
    species: SPECIES_ROTOM, pid: 0, nickname: null, exp: 0, level: 20,
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: moves.map((move) => ({ move, pp: 5, ppUps: 0 })),
    hp: HP, status: 'ok', statusTurns: 0, heldItem: 0, friendship: 70, isEgg: false,
    otId: 0, otSecretId: 0, ball: 4,
    origin: noOrigin({ name: '나', gender: 'male' }), form: 0,
  })
  const THUNDER_WAVE = 86

  it('가전에 들어가면 그 기술이 붙는다', () => {
    const got = changeForm(rotom([THUNDER_WAVE]), 1, tables)
    expect(got.form).toBe(1)
    expect(got.moves.map((s) => s.move)).toEqual([THUNDER_WAVE, ROTOM_FORM_MOVES[1]])
  })

  it('⚠️ 가전을 바꾸면 앞의 기술을 **덮어쓴다** — 둘을 같이 들지 않는다', () => {
    const heat = changeForm(rotom([THUNDER_WAVE]), 1, tables)
    const wash = changeForm(heat, 2, tables)
    expect(wash.moves.map((s) => s.move)).toEqual([THUNDER_WAVE, ROTOM_FORM_MOVES[2]])
  })

  it('⚠️ 보통 모습으로 돌아가면 그 칸이 **사라진다**', () => {
    const heat = changeForm(rotom([THUNDER_WAVE]), 1, tables)
    const back = changeForm(heat, 0, tables)
    expect(back.form).toBe(0)
    expect(back.moves.map((s) => s.move)).toEqual([THUNDER_WAVE])
  })

  it('⚠️ 기술이 하나도 안 남으면 전기쇼크가 들어온다', () => {
    const heat = changeForm(rotom([]), 1, tables)
    const back = changeForm(heat, 0, tables)
    expect(back.moves.map((s) => s.move)).toEqual([MOVE_THUNDER_SHOCK])
    expect(back.moves[0]?.pp).toBe(30)
  })

  it('네 칸이 다 차 있으면 스크립트가 고른 칸을 덮는다', () => {
    const full = rotom([33, 45, 55, THUNDER_WAVE])
    const got = changeForm(full, 3, tables, 2)
    expect(got.moves.map((s) => s.move)).toEqual([33, 45, ROTOM_FORM_MOVES[3], THUNDER_WAVE])
  })

  it('같은 폼으로 바꾸면 아무것도 안 바뀐다 — 개체가 그대로다', () => {
    const one = rotom([THUNDER_WAVE])
    expect(changeForm(one, 0, tables)).toBe(one)
  })

  it('⚠️ 최대 HP가 달라지면 현재 HP도 그만큼 옮긴다 (BUGS §2.15)', () => {
    // 4세대 폼은 어느 쪽도 HP 종족값이 같아서 실제로는 안 움직이지만,
    // 규칙이 다르면 나중에 그 하나가 어긋난다
    let call = 0
    const growing = { maxHp: () => (call++ === 0 ? 100 : 120) }
    const got = changeForm({ ...rotom([THUNDER_WAVE]), hp: 40 }, 1, growing)
    expect(got.hp).toBe(60)
  })
})
